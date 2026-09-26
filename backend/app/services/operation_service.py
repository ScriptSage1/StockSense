"""Operations: draft lifecycle, reference numbers, and the atomic validate/cancel logic.

Validation contract (backend.md §11–12):
  * everything happens in ONE database transaction (UnitOfWork.transaction)
  * the operation row is locked (SELECT ... FOR UPDATE) and its status is checked AFTER the lock
  * every stock row touched is locked (SELECT ... FOR UPDATE) in a deterministic order
  * availability is checked inside the locked transaction
  * ledger rows are written in the same transaction as the stock mutation
  * any failure rolls back everything — no partial line commits
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Awaitable, Callable, Sequence

from app.core import cache as cache_keys
from app.core.cache import Cache, cache as default_cache
from app.core.exceptions import (
    AlreadyValidatedError,
    BusinessRuleError,
    ConflictError,
    InputValidationError,
    InsufficientStockError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.logging import get_logger
from app.core.security import utcnow
from app.db.models import (
    OPEN_STATUSES,
    LedgerEntry,
    Location,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
    User,
    UserRole,
)
from app.repositories.operation_repo import OperationFilters
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.common import Page
from app.schemas.operation import (
    OperationCreate,
    OperationLineIn,
    OperationOut,
    OperationSummary,
    OperationUpdate,
    ValidateResponse,
)
from app.services.mappers import ledger_brief, operation_out, operation_summary
from app.services.reference import next_reference

log = get_logger(__name__)

MOVE_TYPES = (OperationType.delivery, OperationType.transfer)


@dataclass(slots=True)
class ValidationResult:
    response: ValidateResponse
    product_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass(slots=True)
class LowStockAlert:
    product_name: str
    sku: str
    unit: str
    on_hand: float
    reorder_point: float
    location: str | None


def _today() -> date:
    return utcnow().date()


def _stock_location(op: Operation) -> uuid.UUID | None:
    """The location whose on-hand matters for availability display."""
    if op.type in MOVE_TYPES:
        return op.source_location_id
    return op.destination_location_id


class OperationService:
    def __init__(self, uow: UnitOfWork, cache: Cache = default_cache) -> None:
        self.uow = uow
        self.cache = cache

    # ================================================================== reads
    async def list(self, f: OperationFilters, *, page: int, page_size: int, sort: str) -> Page[OperationSummary]:
        rows, total = await self.uow.operations.search(f, page=page, page_size=page_size, sort=sort)
        stats = await self.uow.operations.line_stats([r.id for r in rows])
        today = _today()
        items = [operation_summary(r, stats.get(r.id, (0, 0.0)), today) for r in rows]
        return Page[OperationSummary].build(items, total, page, page_size)

    async def _render(self, op: Operation) -> OperationOut:
        if op.status in OPEN_STATUSES:
            loc = _stock_location(op)
            availability = (
                await self.uow.stock.quantities(loc, [line.product_id for line in op.lines]) if loc else {}
            )
            return operation_out(op, _today(), availability=availability)
        ledger = await self.uow.ledger.for_operation(op.id) if op.status == OperationStatus.done else []
        return operation_out(op, _today(), ledger=ledger)

    async def get(self, op_id: uuid.UUID) -> OperationOut:
        op = await self.uow.operations.get_detail(op_id)
        if op is None:
            raise NotFoundError("Operation not found")
        return await self._render(op)

    # ================================================================== helpers
    async def _resolve_locations(
        self, op_type: OperationType, source_id: uuid.UUID | None, dest_id: uuid.UUID | None
    ) -> tuple[Location | None, Location | None]:
        if op_type == OperationType.receipt:
            if dest_id is None:
                raise InputValidationError("Choose a destination location", field="destination_location_id")
            source_id = None
        elif op_type == OperationType.delivery:
            if source_id is None:
                raise InputValidationError("Choose a source location", field="source_location_id")
            dest_id = None
        elif op_type == OperationType.transfer:
            if source_id is None:
                raise InputValidationError("Choose a source location", field="source_location_id")
            if dest_id is None:
                raise InputValidationError("Choose a destination location", field="destination_location_id")
            if source_id == dest_id:
                raise InputValidationError("Source and destination must differ", field="destination_location_id",
                                           code="SAME_LOCATION")
        else:  # adjustment: the counted location travels as destination_location_id
            dest_id = dest_id or source_id
            source_id = None
            if dest_id is None:
                raise InputValidationError("Choose a location", field="destination_location_id")

        found = await self.uow.locations.get_many([i for i in (source_id, dest_id) if i])
        src = found.get(source_id) if source_id else None
        dst = found.get(dest_id) if dest_id else None
        for loc_id, loc, fname in ((source_id, src, "source_location_id"), (dest_id, dst, "destination_location_id")):
            if loc_id and (loc is None or not loc.is_active or not loc.warehouse.is_active):
                raise InputValidationError("Location is not available", field=fname, code="INVALID_LOCATION")
        return src, dst

    async def _build_lines(self, op_type: OperationType, lines: Sequence[OperationLineIn]) -> list[OperationLine]:
        seen: set[uuid.UUID] = set()
        products = await self.uow.products.get_many([ln.product_id for ln in lines])
        out: list[OperationLine] = []
        for i, ln in enumerate(lines):
            if ln.product_id in seen:
                raise InputValidationError("Product appears more than once", field=f"lines[{i}].product_id",
                                           code="DUPLICATE_LINE")
            seen.add(ln.product_id)
            product = products.get(ln.product_id)
            if product is None or not product.is_active:
                raise InputValidationError("Product not found", field=f"lines[{i}].product_id",
                                           code="INVALID_PRODUCT")
            if op_type != OperationType.adjustment and ln.quantity <= 0:
                raise InputValidationError("Quantity must be greater than 0", field=f"lines[{i}].quantity")
            out.append(OperationLine(product_id=ln.product_id, quantity=ln.quantity, position=i))
        return out

    async def _derive_status(self, op: Operation) -> OperationStatus:
        """Draft → no lines yet. Receipts/adjustments with lines are Ready. Deliveries/transfers are
        Ready when the source currently covers every line, otherwise Waiting."""
        if not op.lines:
            return OperationStatus.draft
        if op.type not in MOVE_TYPES or op.source_location_id is None:
            return OperationStatus.ready
        available = await self.uow.stock.quantities(op.source_location_id, [ln.product_id for ln in op.lines])
        ok = all(available.get(ln.product_id, Decimal(0)) >= Decimal(ln.quantity) for ln in op.lines)
        return OperationStatus.ready if ok else OperationStatus.waiting

    async def _after_change(self) -> None:
        await self.cache.delete_prefix(cache_keys.DASHBOARD_PREFIX)

    # ================================================================== create / update
    async def create(self, data: OperationCreate, actor: User) -> OperationOut:
        op_type = OperationType(data.type)
        async with self.uow.transaction():
            src, dst = await self._resolve_locations(op_type, data.source_location_id, data.destination_location_id)
            lines = await self._build_lines(op_type, data.lines)
            anchor = src if op_type in MOVE_TYPES else dst
            assert anchor is not None  # guaranteed by _resolve_locations
            now = utcnow()
            reference = await next_reference(self.uow, op_type, anchor.warehouse.short_code, now.year)
            op = Operation(
                reference=reference, type=op_type, status=OperationStatus.draft,
                supplier_or_customer=data.supplier_or_customer if op_type in (
                    OperationType.receipt, OperationType.delivery) else None,
                source_location_id=src.id if src else None,
                destination_location_id=dst.id if dst else None,
                scheduled_date=data.scheduled_date, notes=data.notes, created_by_id=actor.id,
            )
            op.lines = lines
            await self.uow.operations.create(op)
            op.status = await self._derive_status(op)
            await self.uow.operations.flush()
            op_id = op.id
        await self._after_change()
        log.info("operation.created", reference=reference, type=op_type.value)
        return await self.get(op_id)

    async def update(self, op_id: uuid.UUID, data: OperationUpdate) -> OperationOut:
        async with self.uow.transaction():
            op = await self.uow.operations.get_with_lines_locked(op_id)
            if op is None:
                raise NotFoundError("Operation not found")
            if op.status not in OPEN_STATUSES:
                raise ConflictError("Only draft operations can be edited", code="OPERATION_LOCKED")
            fields = data.model_fields_set
            src_id = data.source_location_id if "source_location_id" in fields else op.source_location_id
            dst_id = data.destination_location_id if "destination_location_id" in fields else op.destination_location_id
            src, dst = await self._resolve_locations(op.type, src_id, dst_id)
            op.source_location_id = src.id if src else None
            op.destination_location_id = dst.id if dst else None
            if "supplier_or_customer" in fields and op.type in (OperationType.receipt, OperationType.delivery):
                op.supplier_or_customer = data.supplier_or_customer
            if "scheduled_date" in fields:
                op.scheduled_date = data.scheduled_date
            if "notes" in fields:
                op.notes = data.notes
            if data.lines is not None:
                await self.uow.operations.replace_lines(op, await self._build_lines(op.type, data.lines))
            op.updated_at = utcnow()  # line-only edits still bump the document version
            await self.uow.operations.flush()
            op.status = await self._derive_status(op)
            await self.uow.operations.flush()
            await self.uow.operations.reload(op, "source_location", "destination_location")
        await self._after_change()
        return await self.get(op_id)

    # ================================================================== validate
    async def validate(self, op_id: uuid.UUID, actor: User) -> ValidationResult:
        async with self.uow.transaction():
            op = await self.uow.operations.get_with_lines_locked(op_id)
            if op is None:
                raise NotFoundError("Operation not found")
            if op.type == OperationType.adjustment and actor.role != UserRole.manager:
                raise PermissionDeniedError("Only managers can validate adjustments", code="MANAGER_REQUIRED")
            # Status is checked only after the row lock is held → double validation is impossible.
            if op.status == OperationStatus.done:
                raise AlreadyValidatedError()
            if op.status == OperationStatus.canceled:
                raise ConflictError("Canceled operations cannot be validated", code="OPERATION_CANCELED")
            if not op.lines:
                raise BusinessRuleError("Add at least one product line before validating", code="NO_LINES",
                                        field="lines")

            entries = await self._apply_stock(op, actor)

            op.status = OperationStatus.done
            op.validated_at = utcnow()
            op.validated_by_id = actor.id
            await self.uow.operations.flush()
            if entries:
                await self.uow.ledger.append(entries)
            product_ids = [line.product_id for line in op.lines]
            reference = op.reference

        log.info("operation.validated", reference=reference, lines=len(product_ids), entries=len(entries))
        await self._after_change()
        await self.refresh_open_statuses(product_ids)
        out = await self.get(op_id)
        return ValidationResult(
            response=ValidateResponse(operation=out, ledger_entries=out.ledger_entries or
                                      [ledger_brief(e) for e in entries]),
            product_ids=product_ids,
        )

    async def _apply_stock(self, op: Operation, actor: User) -> list[LedgerEntry]:
        lines = list(op.lines)
        src, dst = op.source_location_id, op.destination_location_id
        t = op.type

        if t == OperationType.receipt:
            if dst is None:
                raise BusinessRuleError("Destination location is required", field="destination_location_id")
            keys = [(ln.product_id, dst) for ln in lines]
        elif t == OperationType.delivery:
            if src is None:
                raise BusinessRuleError("Source location is required", field="source_location_id")
            keys = [(ln.product_id, src) for ln in lines]
        elif t == OperationType.transfer:
            if src is None or dst is None or src == dst:
                raise BusinessRuleError("Transfers need distinct source and destination", field="destination_location_id")
            keys = [(ln.product_id, src) for ln in lines] + [(ln.product_id, dst) for ln in lines]
        else:
            if dst is None:
                raise BusinessRuleError("Location is required", field="destination_location_id")
            keys = [(ln.product_id, dst) for ln in lines]

        rows = await self.uow.stock.lock_rows(keys)

        # Availability check happens here, inside the transaction, with the rows locked.
        if t in MOVE_TYPES:
            shortages = []
            for i, ln in enumerate(lines):
                on_hand = Decimal(rows[(ln.product_id, src)].quantity)
                if on_hand < Decimal(ln.quantity):
                    shortages.append({
                        "line_index": i, "product_id": str(ln.product_id), "sku": ln.product.sku,
                        "name": ln.product.name, "requested": float(ln.quantity), "available": float(on_hand),
                    })
            if shortages:
                first = shortages[0]
                detail = (
                    f"Insufficient stock for {first['sku']}: {first['available']:g} available, "
                    f"{first['requested']:g} requested"
                )
                if len(shortages) > 1:
                    detail += f" (+{len(shortages) - 1} more line{'s' if len(shortages) > 2 else ''})"
                raise InsufficientStockError(detail, field=f"lines[{first['line_index']}].quantity",
                                             extra={"shortages": shortages})

        entries: list[LedgerEntry] = []

        def entry(product_id: uuid.UUID, qty: Decimal, *, from_: uuid.UUID | None, to: uuid.UUID | None) -> None:
            entries.append(LedgerEntry(operation_id=op.id, product_id=product_id, from_location_id=from_,
                                       to_location_id=to, quantity=qty, type=t, performed_by_id=actor.id))

        for ln in lines:
            qty = Decimal(ln.quantity)
            if t == OperationType.receipt:
                await self.uow.stock.increment(rows[(ln.product_id, dst)], qty)
                entry(ln.product_id, qty, from_=None, to=dst)
            elif t == OperationType.delivery:
                await self.uow.stock.decrement(rows[(ln.product_id, src)], qty)
                entry(ln.product_id, -qty, from_=src, to=None)
            elif t == OperationType.transfer:
                await self.uow.stock.decrement(rows[(ln.product_id, src)], qty)
                await self.uow.stock.increment(rows[(ln.product_id, dst)], qty)
                entry(ln.product_id, -qty, from_=src, to=dst)
                entry(ln.product_id, qty, from_=src, to=dst)
            else:
                row = rows[(ln.product_id, dst)]
                delta = qty - Decimal(row.quantity)  # counted − current on hand
                await self.uow.stock.set_quantity(row, qty)
                if delta != 0:
                    entry(ln.product_id, delta, from_=dst if delta < 0 else None, to=dst if delta > 0 else None)
        return entries

    # ================================================================== cancel
    async def cancel(self, op_id: uuid.UUID, actor: User) -> OperationOut:
        if actor.role != UserRole.manager:
            raise PermissionDeniedError("Only managers can cancel operations", code="MANAGER_REQUIRED")
        async with self.uow.transaction():
            op = await self.uow.operations.get_with_lines_locked(op_id)
            if op is None:
                raise NotFoundError("Operation not found")
            if op.status == OperationStatus.done:
                raise AlreadyValidatedError("Validated operations cannot be canceled")
            if op.status == OperationStatus.canceled:
                raise ConflictError("Operation is already canceled", code="ALREADY_CANCELED")
            op.status = OperationStatus.canceled
            op.canceled_at = utcnow()
            op.canceled_by_id = actor.id
            await self.uow.operations.flush()
            await self.uow.operations.reload(op, "canceled_by")
        await self._after_change()
        return await self.get(op_id)

    # ================================================================== post-commit upkeep
    async def refresh_open_statuses(self, product_ids: Sequence[uuid.UUID]) -> None:
        """Re-derive Waiting/Ready for open deliveries/transfers affected by a stock change.
        Runs in its own short transaction after the validation commit; locked rows are skipped."""
        if not product_ids:
            return
        try:
            async with self.uow.transaction():
                for op in await self.uow.operations.open_moves_touching(product_ids):
                    new_status = await self._derive_status(op)
                    if new_status != op.status:
                        op.status = new_status
                await self.uow.operations.flush()
        except Exception as exc:  # upkeep must never fail the request that triggered it
            log.warning("operation.status_refresh_failed", error=str(exc))

    async def low_stock_alerts(self, product_ids: Sequence[uuid.UUID]) -> list[LowStockAlert]:
        rules = await self.uow.products.rules_for_products(list(set(product_ids)))
        if not rules:
            return []
        products = await self.uow.products.get_many([r.product_id for r in rules])
        totals = await self.uow.stock.totals_for_products([r.product_id for r in rules])
        alerts: list[LowStockAlert] = []
        for rule in rules:
            product = products.get(rule.product_id)
            if product is None or not product.is_active:
                continue
            where = None
            if rule.location_id is None:
                on_hand = totals.get(rule.product_id, Decimal(0))
            else:
                on_hand = (await self.uow.stock.quantities(rule.location_id, [rule.product_id])).get(
                    rule.product_id, Decimal(0))
                located = await self.uow.stock.location_with_warehouse(rule.location_id)
                where = f"{located[1].short_code}/{located[0].short_code}" if located else None
            if on_hand <= Decimal(rule.reorder_point):
                alerts.append(LowStockAlert(product.name, product.sku, product.unit_of_measure, float(on_hand),
                                            float(rule.reorder_point), where))
        return alerts


async def check_reorder_alerts(
    uow_factory: Callable[[], Awaitable[tuple[UnitOfWork, Callable[[], Awaitable[None]]]]],
    send: Callable[..., Awaitable[None]],
    product_ids: Sequence[uuid.UUID],
) -> None:
    """Background task: after a validation, email managers about products at/below reorder point."""
    uow, close = await uow_factory()
    try:
        alerts = await OperationService(uow).low_stock_alerts(product_ids)
        if not alerts:
            return
        managers = await uow.users.list_active_managers()
        for alert in alerts:
            for manager in managers:
                await send(manager.email, product_name=alert.product_name, sku=alert.sku,
                           on_hand=alert.on_hand, reorder_point=alert.reorder_point, unit=alert.unit,
                           location=alert.location)
        log.info("alerts.low_stock", alerts=len(alerts), recipients=len(managers))
    except Exception as exc:
        log.error("alerts.low_stock_failed", error=str(exc))
    finally:
        await close()

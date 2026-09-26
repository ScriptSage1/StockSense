"""ORM → schema mapping helpers (attribute access only; no persistence)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Iterable

from app.db.models import OPEN_STATUSES, LedgerEntry, Location, Operation, User
from app.schemas.auth import UserOut
from app.schemas.ledger import LedgerEntryOut, OperationRef
from app.schemas.operation import (
    LedgerEntryBrief,
    OperationLineOut,
    OperationOut,
    OperationSummary,
    ProductRef,
    UserRef,
)
from app.schemas.warehouse import LocationOut, LocationRef, WarehouseRef


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id, full_name=user.full_name, email=user.email, role=user.role.value,
        is_active=user.is_active, created_at=user.created_at,
    )


def user_ref(user: User | None) -> UserRef | None:
    return UserRef(id=user.id, full_name=user.full_name) if user else None


def loc_ref(loc: Location) -> LocationRef:
    return LocationRef(id=loc.id, name=loc.name, short_code=loc.short_code, full_code=loc.full_code,
                       warehouse_id=loc.warehouse_id)


def location_ref(loc: Location | None) -> LocationRef | None:
    return loc_ref(loc) if loc is not None else None


def required_user_ref(user: User) -> UserRef:
    return UserRef(id=user.id, full_name=user.full_name)


def location_out(loc: Location, product_count: int = 0, total_units: float = 0) -> LocationOut:
    wh = loc.warehouse
    return LocationOut(
        id=loc.id, name=loc.name, short_code=loc.short_code, full_code=loc.full_code,
        warehouse_id=loc.warehouse_id,
        warehouse=WarehouseRef(id=wh.id, name=wh.name, short_code=wh.short_code),
        is_active=loc.is_active, product_count=product_count, total_units=total_units,
        created_at=loc.created_at,
    )


def product_ref(p: Any) -> ProductRef:
    return ProductRef(id=p.id, name=p.name, sku=p.sku, unit_of_measure=p.unit_of_measure)


def is_late(op: Operation, today: date) -> bool:
    return op.status in OPEN_STATUSES and op.scheduled_date is not None and op.scheduled_date < today


def operation_summary(op: Operation, stats: tuple[int, float], today: date) -> OperationSummary:
    return OperationSummary(
        id=op.id, reference=op.reference, type=op.type.value, status=op.status.value,
        supplier_or_customer=op.supplier_or_customer,
        source_location=location_ref(op.source_location),
        destination_location=location_ref(op.destination_location),
        scheduled_date=op.scheduled_date, is_late=is_late(op, today),
        line_count=stats[0], total_quantity=stats[1],
        created_by=required_user_ref(op.created_by), created_at=op.created_at, validated_at=op.validated_at,
    )


def ledger_brief(e: LedgerEntry) -> LedgerEntryBrief:
    return LedgerEntryBrief(
        id=e.id, product_id=e.product_id, quantity=float(e.quantity), from_location_id=e.from_location_id,
        to_location_id=e.to_location_id, performed_at=e.performed_at,
    )


def operation_out(
    op: Operation,
    today: date,
    *,
    availability: dict | None = None,
    ledger: Iterable[LedgerEntry] = (),
) -> OperationOut:
    """`availability` maps product_id → live on-hand at the relevant location (open ops only)."""
    ledger = list(ledger)
    delta_by_product: dict[Any, Decimal] = {}
    for e in ledger:
        delta_by_product[e.product_id] = delta_by_product.get(e.product_id, Decimal(0)) + Decimal(e.quantity)

    lines: list[OperationLineOut] = []
    total = 0.0
    for line in op.lines:
        qty = Decimal(line.quantity)
        total += float(qty)
        available = None
        delta = None
        short = False
        if availability is not None and op.status in OPEN_STATUSES:
            on_hand = availability.get(line.product_id, Decimal(0))
            available = float(on_hand)
            if op.type.value == "adjustment":
                delta = float(qty - on_hand)
            elif op.type.value in ("delivery", "transfer"):
                short = on_hand < qty
        elif op.type.value == "adjustment" and op.status.value == "done":
            delta = float(delta_by_product.get(line.product_id, Decimal(0)))
        lines.append(OperationLineOut(id=line.id, product=product_ref(line.product), quantity=float(qty),
                                      available=available, delta=delta, is_short=short))
    summary = operation_summary(op, (len(op.lines), total), today)
    return OperationOut(
        **summary.model_dump(),
        notes=op.notes, lines=lines,
        validated_by=user_ref(op.validated_by), canceled_by=user_ref(op.canceled_by),
        canceled_at=op.canceled_at, updated_at=op.updated_at,
        ledger_entries=[ledger_brief(e) for e in ledger],
    )


def ledger_out(e: LedgerEntry) -> LedgerEntryOut:
    op = e.operation
    return LedgerEntryOut(
        id=e.id,
        operation=OperationRef(id=op.id, reference=op.reference, type=op.type.value,
                               supplier_or_customer=op.supplier_or_customer),
        product=product_ref(e.product),
        from_location=location_ref(e.from_location),
        to_location=location_ref(e.to_location),
        quantity=float(e.quantity),
        direction="in" if Decimal(e.quantity) > 0 else "out",
        type=e.type.value,
        performed_by=required_user_ref(e.performed_by),
        performed_at=e.performed_at,
    )

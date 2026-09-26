from __future__ import annotations

import uuid
import zlib
from dataclasses import dataclass, replace
from datetime import date
from typing import Sequence

from sqlalchemy import Select, and_, exists, extract, func, or_, select
from sqlalchemy.orm import aliased, selectinload

from app.db.models import (
    OPEN_STATUSES,
    Location,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
    Product,
)
from app.repositories.base import BaseRepository


@dataclass(slots=True)
class OperationFilters:
    type: OperationType | None = None
    statuses: Sequence[OperationStatus] | None = None
    warehouse_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    q: str | None = None
    date_from: date | None = None
    date_to: date | None = None


class OperationRepository(BaseRepository[Operation]):
    model = Operation

    async def get_detail(self, op_id: uuid.UUID) -> Operation | None:
        stmt = (
            select(Operation)
            .where(Operation.id == op_id)
            .options(selectinload(Operation.lines))
            .execution_options(populate_existing=True)
        )
        return (await self.session.scalars(stmt)).unique().one_or_none()

    async def get_with_lines_locked(self, op_id: uuid.UUID) -> Operation | None:
        """Row-lock the operation (FOR UPDATE OF operations) and load its lines fresh."""
        stmt = (
            select(Operation)
            .where(Operation.id == op_id)
            .with_for_update(of=Operation)
            .options(selectinload(Operation.lines))
            .execution_options(populate_existing=True)
        )
        return (await self.session.scalars(stmt)).unique().one_or_none()

    async def reserve_reference_sequence(self, op_type: OperationType, year: int) -> None:
        """Transaction-scoped advisory lock so two concurrent creates never compute the same number."""
        key = zlib.crc32(f"{op_type.value}:{year}".encode()) & 0x7FFFFFFF
        await self.session.execute(select(func.pg_advisory_xact_lock(7_002_000, key)))

    async def count_by_type_and_year(self, op_type: OperationType, year: int) -> int:
        stmt = select(func.count(Operation.id)).where(
            Operation.type == op_type, extract("year", Operation.created_at) == year
        )
        return int(await self.session.scalar(stmt) or 0)

    async def reference_exists(self, reference: str) -> bool:
        return bool(await self.session.scalar(select(exists().where(Operation.reference == reference))))

    async def replace_lines(self, op: Operation, lines: list[OperationLine]) -> None:
        op.lines.clear()
        await self.flush()
        for line in lines:
            op.lines.append(line)
        await self.flush()

    # ------------------------------------------------------------------ queries
    def _filtered(self, f: OperationFilters) -> Select:
        stmt = select(Operation)
        if f.type is not None:
            stmt = stmt.where(Operation.type == f.type)
        if f.statuses:
            stmt = stmt.where(Operation.status.in_(list(f.statuses)))
        if f.location_id is not None:
            stmt = stmt.where(
                or_(Operation.source_location_id == f.location_id, Operation.destination_location_id == f.location_id)
            )
        if f.warehouse_id is not None:
            src = aliased(Location)
            dst = aliased(Location)
            stmt = stmt.where(
                or_(
                    exists().where(and_(src.id == Operation.source_location_id, src.warehouse_id == f.warehouse_id)),
                    exists().where(and_(dst.id == Operation.destination_location_id, dst.warehouse_id == f.warehouse_id)),
                )
            )
        if f.category_id is not None:
            stmt = stmt.where(
                exists()
                .where(OperationLine.operation_id == Operation.id)
                .where(OperationLine.product_id == Product.id)
                .where(Product.category_id == f.category_id)
            )
        if f.q:
            pattern = f"%{f.q.strip()}%"
            stmt = stmt.where(
                or_(
                    Operation.reference.ilike(pattern),
                    Operation.supplier_or_customer.ilike(pattern),
                    exists()
                    .where(OperationLine.operation_id == Operation.id)
                    .where(OperationLine.product_id == Product.id)
                    .where(or_(Product.sku.ilike(pattern), Product.name.ilike(pattern))),
                )
            )
        if f.date_from is not None:
            stmt = stmt.where(Operation.scheduled_date >= f.date_from)
        if f.date_to is not None:
            stmt = stmt.where(Operation.scheduled_date <= f.date_to)
        return stmt

    async def search(self, f: OperationFilters, *, page: int, page_size: int, sort: str = "-created_at"
                     ) -> tuple[Sequence[Operation], int]:
        order = {
            "-created_at": Operation.created_at.desc(),
            "created_at": Operation.created_at.asc(),
            "scheduled_date": Operation.scheduled_date.asc().nulls_last(),
            "-scheduled_date": Operation.scheduled_date.desc().nulls_last(),
            "reference": Operation.reference.asc(),
        }.get(sort, Operation.created_at.desc())
        stmt = self._filtered(f).order_by(order, Operation.id)
        return await self.paginate(stmt, page=page, page_size=page_size)

    async def line_stats(self, op_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, tuple[int, float]]:
        if not op_ids:
            return {}
        stmt = (
            select(OperationLine.operation_id, func.count(OperationLine.id), func.coalesce(func.sum(OperationLine.quantity), 0))
            .where(OperationLine.operation_id.in_(op_ids))
            .group_by(OperationLine.operation_id)
        )
        return {oid: (int(n), float(q)) for oid, n, q in (await self.session.execute(stmt)).all()}

    async def status_counts(self, f: OperationFilters) -> dict[str, int]:
        sub = self._filtered(replace(f, statuses=None)).subquery()
        stmt = select(sub.c.status, func.count()).group_by(sub.c.status)
        rows = (await self.session.execute(stmt)).all()
        return {(s.value if hasattr(s, "value") else str(s)): int(n) for s, n in rows}

    async def open_breakdown(self, f: OperationFilters, today: date) -> dict[str, dict[str, int]]:
        """Per type: open / ready / waiting / late (scheduled before today) / upcoming."""
        base = self._filtered(replace(f, type=None, statuses=list(OPEN_STATUSES)))
        sub = base.subquery()
        stmt = select(
            sub.c.type,
            func.count().label("open"),
            func.count().filter(sub.c.status == OperationStatus.ready.value).label("ready"),
            func.count().filter(sub.c.status == OperationStatus.waiting.value).label("waiting"),
            func.count().filter(sub.c.status == OperationStatus.draft.value).label("draft"),
            func.count().filter(sub.c.scheduled_date < today).label("late"),
            func.count().filter(sub.c.scheduled_date > today).label("upcoming"),
            func.count().filter(sub.c.scheduled_date == today).label("today"),
        ).group_by(sub.c.type)
        out: dict[str, dict[str, int]] = {}
        for row in (await self.session.execute(stmt)).all():
            key = row.type.value if hasattr(row.type, "value") else str(row.type)
            out[key] = {
                "open": row.open, "ready": row.ready, "waiting": row.waiting, "draft": row.draft,
                "late": row.late, "upcoming": row.upcoming, "today": row.today,
            }
        return out

    async def list_open(self, f: OperationFilters, *, limit: int) -> Sequence[Operation]:
        stmt = (
            self._filtered(replace(f, statuses=list(f.statuses or OPEN_STATUSES)))
            .order_by(Operation.scheduled_date.asc().nulls_last(), Operation.created_at.asc())
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def open_moves_touching(self, product_ids: Sequence[uuid.UUID]) -> Sequence[Operation]:
        """Open deliveries/transfers containing any of the products. Rows locked by an in-flight
        validation are skipped (they will be re-evaluated on their own validation)."""
        if not product_ids:
            return []
        stmt = (
            select(Operation)
            .where(
                Operation.status.in_(OPEN_STATUSES),
                Operation.type.in_([OperationType.delivery, OperationType.transfer]),
                exists().where(
                    OperationLine.operation_id == Operation.id, OperationLine.product_id.in_(product_ids)
                ),
            )
            .with_for_update(of=Operation, skip_locked=True)
            .options(selectinload(Operation.lines))
            .execution_options(populate_existing=True)
        )
        return (await self.session.scalars(stmt)).unique().all()

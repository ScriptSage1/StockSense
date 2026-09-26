from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Sequence

from sqlalchemy import or_, select

from app.db.models import LedgerEntry, Operation, OperationType, Product
from app.repositories.base import BaseRepository


@dataclass(slots=True)
class LedgerFilters:
    product_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    operation_id: uuid.UUID | None = None
    type: OperationType | None = None
    direction: str | None = None  # "in" | "out"
    q: str | None = None
    from_date: date | None = None
    to_date: date | None = None


class LedgerRepository(BaseRepository[LedgerEntry]):
    """Append-only. Exposes inserts and reads only — there is deliberately no update/delete."""

    model = LedgerEntry

    async def append(self, entries: Sequence[LedgerEntry]) -> list[LedgerEntry]:
        self.session.add_all(list(entries))
        await self.flush()
        return list(entries)

    async def update(self, obj, values):  # type: ignore[override]
        raise NotImplementedError("Ledger entries are immutable")

    async def search(self, f: LedgerFilters, *, page: int, page_size: int) -> tuple[Sequence[LedgerEntry], int]:
        stmt = select(LedgerEntry)
        if f.product_id is not None:
            stmt = stmt.where(LedgerEntry.product_id == f.product_id)
        if f.operation_id is not None:
            stmt = stmt.where(LedgerEntry.operation_id == f.operation_id)
        if f.location_id is not None:
            stmt = stmt.where(
                or_(LedgerEntry.from_location_id == f.location_id, LedgerEntry.to_location_id == f.location_id)
            )
        if f.type is not None:
            stmt = stmt.where(LedgerEntry.type == f.type)
        if f.direction == "in":
            stmt = stmt.where(LedgerEntry.quantity > 0)
        elif f.direction == "out":
            stmt = stmt.where(LedgerEntry.quantity < 0)
        if f.q:
            pattern = f"%{f.q.strip()}%"
            stmt = stmt.where(
                or_(
                    LedgerEntry.operation.has(Operation.reference.ilike(pattern)),
                    LedgerEntry.operation.has(Operation.supplier_or_customer.ilike(pattern)),
                    LedgerEntry.product.has(or_(Product.sku.ilike(pattern), Product.name.ilike(pattern))),
                )
            )
        if f.from_date is not None:
            stmt = stmt.where(LedgerEntry.performed_at >= datetime.combine(f.from_date, time.min, tzinfo=timezone.utc))
        if f.to_date is not None:
            end = datetime.combine(f.to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
            stmt = stmt.where(LedgerEntry.performed_at < end)
        stmt = stmt.order_by(LedgerEntry.performed_at.desc(), LedgerEntry.id)
        return await self.paginate(stmt, page=page, page_size=page_size)

    async def for_operation(self, op_id: uuid.UUID) -> Sequence[LedgerEntry]:
        stmt = select(LedgerEntry).where(LedgerEntry.operation_id == op_id).order_by(LedgerEntry.performed_at)
        return (await self.session.scalars(stmt)).unique().all()

    async def recent(self, *, limit: int, location_ids: Sequence[uuid.UUID] | None = None) -> Sequence[LedgerEntry]:
        stmt = select(LedgerEntry).order_by(LedgerEntry.performed_at.desc()).limit(limit)
        if location_ids is not None:
            stmt = stmt.where(
                or_(LedgerEntry.from_location_id.in_(location_ids), LedgerEntry.to_location_id.in_(location_ids))
            )
        return (await self.session.scalars(stmt)).unique().all()

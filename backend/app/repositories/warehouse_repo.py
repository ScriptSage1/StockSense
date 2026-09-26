from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import func, select

from app.db.models import Location, Stock, Warehouse
from app.repositories.base import BaseRepository


class WarehouseRepository(BaseRepository[Warehouse]):
    model = Warehouse

    async def list_all(self, *, include_inactive: bool = True) -> Sequence[Warehouse]:
        stmt = select(Warehouse).order_by(Warehouse.name)
        if not include_inactive:
            stmt = stmt.where(Warehouse.is_active.is_(True))
        return (await self.session.scalars(stmt)).all()

    async def location_counts(self) -> dict[uuid.UUID, int]:
        stmt = select(Location.warehouse_id, func.count(Location.id)).group_by(Location.warehouse_id)
        return {wid: int(n) for wid, n in (await self.session.execute(stmt)).all()}

    async def get_by_code(self, short_code: str) -> Warehouse | None:
        return await self.session.scalar(
            select(Warehouse).where(func.upper(Warehouse.short_code) == short_code.upper())
        )


class LocationRepository(BaseRepository[Location]):
    model = Location

    async def list_filtered(self, warehouse_id: uuid.UUID | None = None) -> Sequence[Location]:
        stmt = select(Location).join(Location.warehouse).order_by(Warehouse.name, Location.name)
        if warehouse_id is not None:
            stmt = stmt.where(Location.warehouse_id == warehouse_id)
        return (await self.session.scalars(stmt)).unique().all()

    async def get_many(self, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Location]:
        if not ids:
            return {}
        rows = (await self.session.scalars(select(Location).where(Location.id.in_(ids)))).unique().all()
        return {row.id: row for row in rows}

    async def first_for_warehouse(self, warehouse_id: uuid.UUID) -> Location | None:
        stmt = (
            select(Location)
            .where(Location.warehouse_id == warehouse_id, Location.is_active.is_(True))
            .order_by(Location.created_at)
            .limit(1)
        )
        return await self.session.scalar(stmt)

    async def stock_totals(self, location_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, tuple[int, float]]:
        """(distinct products with qty > 0, total units) per location."""
        if not location_ids:
            return {}
        stmt = (
            select(Stock.location_id, func.count(Stock.id), func.coalesce(func.sum(Stock.quantity), 0))
            .where(Stock.location_id.in_(location_ids), Stock.quantity > 0)
            .group_by(Stock.location_id)
        )
        return {lid: (int(n), float(q)) for lid, n, q in (await self.session.execute(stmt)).all()}

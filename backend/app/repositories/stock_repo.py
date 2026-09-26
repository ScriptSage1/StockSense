from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import Location, Product, Stock, Warehouse
from app.repositories.base import BaseRepository

Key = tuple[uuid.UUID, uuid.UUID]  # (product_id, location_id)


class StockRepository(BaseRepository[Stock]):
    model = Stock

    async def lock_rows(self, keys: Iterable[Key]) -> dict[Key, Stock]:
        """Ensure a stock row exists for every (product, location) and lock them all with
        SELECT ... FOR UPDATE. Rows are locked in a deterministic order to avoid deadlocks
        between concurrent validations."""
        ordered = sorted(set(keys), key=lambda k: (str(k[0]), str(k[1])))
        if not ordered:
            return {}
        await self.session.execute(
            pg_insert(Stock)
            .values([
                {"id": uuid.uuid4(), "product_id": p, "location_id": loc, "quantity": Decimal("0")}
                for p, loc in ordered
            ])
            .on_conflict_do_nothing(constraint="uq_stock_product_id_location_id")
        )
        locked: dict[Key, Stock] = {}
        for product_id, location_id in ordered:
            stmt = (
                select(Stock)
                .where(Stock.product_id == product_id, Stock.location_id == location_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            row = (await self.session.scalars(stmt)).one()
            locked[(product_id, location_id)] = row
        return locked

    async def increment(self, row: Stock, qty: Decimal) -> Stock:
        row.quantity = Decimal(row.quantity) + qty
        await self.flush()
        return row

    async def decrement(self, row: Stock, qty: Decimal) -> Stock:
        row.quantity = Decimal(row.quantity) - qty
        await self.flush()
        return row

    async def set_quantity(self, row: Stock, qty: Decimal) -> Stock:
        row.quantity = qty
        await self.flush()
        return row

    async def quantities(self, location_id: uuid.UUID, product_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
        if not product_ids:
            return {}
        stmt = select(Stock.product_id, Stock.quantity).where(
            Stock.location_id == location_id, Stock.product_id.in_(product_ids)
        )
        return {pid: Decimal(q) for pid, q in (await self.session.execute(stmt)).all()}

    async def totals_for_products(self, product_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
        if not product_ids:
            return {}
        stmt = (
            select(Stock.product_id, func.coalesce(func.sum(Stock.quantity), 0))
            .where(Stock.product_id.in_(product_ids))
            .group_by(Stock.product_id)
        )
        return {pid: Decimal(q) for pid, q in (await self.session.execute(stmt)).all()}

    async def list_for_location(self, location_id: uuid.UUID, *, include_zero: bool = False) -> list[tuple[Stock, Product]]:
        stmt = (
            select(Stock, Product)
            .join(Product, Product.id == Stock.product_id)
            .where(Stock.location_id == location_id)
            .order_by(Product.name)
        )
        if not include_zero:
            stmt = stmt.where(Stock.quantity > 0)
        return [(s, p) for s, p in (await self.session.execute(stmt)).unique().all()]

    async def location_with_warehouse(self, location_id: uuid.UUID) -> tuple[Location, Warehouse] | None:
        stmt = (
            select(Location, Warehouse)
            .join(Warehouse, Warehouse.id == Location.warehouse_id)
            .where(Location.id == location_id)
        )
        row = (await self.session.execute(stmt)).unique().first()
        return (row[0], row[1]) if row else None

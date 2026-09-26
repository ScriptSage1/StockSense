from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import Select, and_, func, or_, select

from app.db.models import Category, Location, Product, ReorderRule, Stock, Warehouse
from app.repositories.base import BaseRepository


@dataclass(slots=True)
class ProductRow:
    product: Product
    on_hand: Decimal
    reorder_point: Decimal | None


def _on_hand_subquery(location_ids: Sequence[uuid.UUID] | None = None):
    stmt = select(Stock.product_id.label("product_id"), func.sum(Stock.quantity).label("on_hand"))
    if location_ids is not None:
        stmt = stmt.where(Stock.location_id.in_(list(location_ids)))
    return stmt.group_by(Stock.product_id).subquery("on_hand")


def _rule_subquery():
    return (
        select(ReorderRule.product_id.label("product_id"), ReorderRule.reorder_point.label("reorder_point"))
        .where(ReorderRule.location_id.is_(None))
        .subquery("rule")
    )


class CategoryRepository(BaseRepository[Category]):
    model = Category

    async def list_all(self) -> Sequence[Category]:
        return (await self.session.scalars(select(Category).order_by(Category.name))).all()

    async def get_by_name(self, name: str) -> Category | None:
        return await self.session.scalar(select(Category).where(func.lower(Category.name) == name.lower()))

    async def product_counts(self) -> dict[uuid.UUID, int]:
        stmt = (
            select(Product.category_id, func.count(Product.id))
            .where(Product.is_active.is_(True), Product.category_id.is_not(None))
            .group_by(Product.category_id)
        )
        return {cid: int(n) for cid, n in (await self.session.execute(stmt)).all()}


class ProductRepository(BaseRepository[Product]):
    model = Product

    async def get_by_sku(self, sku: str) -> Product | None:
        return await self.session.scalar(select(Product).where(func.upper(Product.sku) == sku.upper()))

    async def get_many(self, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Product]:
        if not ids:
            return {}
        rows = (await self.session.scalars(select(Product).where(Product.id.in_(ids)))).unique().all()
        return {row.id: row for row in rows}

    def _search_stmt(
        self,
        *,
        q: str | None,
        category_id: uuid.UUID | None,
        stock_status: str | None,
        include_inactive: bool,
        location_ids: Sequence[uuid.UUID] | None = None,
    ) -> Select:
        oh = _on_hand_subquery(location_ids)
        rule = _rule_subquery()
        on_hand = func.coalesce(oh.c.on_hand, 0)
        stmt = (
            select(Product, on_hand.label("on_hand"), rule.c.reorder_point)
            .outerjoin(oh, oh.c.product_id == Product.id)
            .outerjoin(rule, rule.c.product_id == Product.id)
        )
        if not include_inactive:
            stmt = stmt.where(Product.is_active.is_(True))
        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Product.sku.ilike(pattern), Product.name.ilike(pattern)))
        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)
        if stock_status == "out":
            stmt = stmt.where(on_hand <= 0)
        elif stock_status == "low":
            stmt = stmt.where(and_(on_hand > 0, rule.c.reorder_point.is_not(None), on_hand <= rule.c.reorder_point))
        elif stock_status == "attention":
            stmt = stmt.where(
                or_(on_hand <= 0, and_(rule.c.reorder_point.is_not(None), on_hand <= rule.c.reorder_point))
            )
        elif stock_status == "in_stock":
            stmt = stmt.where(on_hand > 0)
        return stmt

    async def search(
        self,
        *,
        q: str | None,
        category_id: uuid.UUID | None,
        stock_status: str | None,
        page: int,
        page_size: int,
        include_inactive: bool = False,
        sort: str = "name",
    ) -> tuple[list[ProductRow], int]:
        stmt = self._search_stmt(
            q=q, category_id=category_id, stock_status=stock_status, include_inactive=include_inactive
        )
        total = int(
            (await self.session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar_one()
        )
        order = {
            "name": Product.name.asc(),
            "sku": Product.sku.asc(),
            "-created_at": Product.created_at.desc(),
            "on_hand": stmt.selected_columns.on_hand.asc(),
        }.get(sort, Product.name.asc())
        rows = (
            await self.session.execute(stmt.order_by(order, Product.id).offset((page - 1) * page_size).limit(page_size))
        ).unique().all()
        return [ProductRow(p, Decimal(oh), rp) for p, oh, rp in rows], total

    async def get_row(self, product_id: uuid.UUID) -> ProductRow | None:
        stmt = self._search_stmt(q=None, category_id=None, stock_status=None, include_inactive=True).where(
            Product.id == product_id
        ).execution_options(populate_existing=True)
        row = (await self.session.execute(stmt)).unique().first()
        if row is None:
            return None
        return ProductRow(row[0], Decimal(row[1]), row[2])

    async def stock_by_location(self, product_id: uuid.UUID) -> list[tuple[Stock, Location, Warehouse]]:
        stmt = (
            select(Stock, Location, Warehouse)
            .join(Location, Location.id == Stock.location_id)
            .join(Warehouse, Warehouse.id == Location.warehouse_id)
            .where(Stock.product_id == product_id)
            .order_by(Warehouse.name, Location.name)
        )
        return [(s, loc, wh) for s, loc, wh in (await self.session.execute(stmt)).unique().all()]

    async def stock_health_counts(self, category_id: uuid.UUID | None = None,
                                  location_ids: Sequence[uuid.UUID] | None = None) -> dict[str, float]:
        """Counts of active products that are in stock / low / out (product-level reorder rules)."""
        oh = _on_hand_subquery(location_ids)
        rule = _rule_subquery()
        on_hand = func.coalesce(oh.c.on_hand, 0)
        base = (
            select(
                func.count(Product.id).label("total"),
                func.count(Product.id).filter(on_hand > 0).label("in_stock"),
                func.count(Product.id).filter(on_hand <= 0).label("out"),
                func.count(Product.id)
                .filter(and_(on_hand > 0, rule.c.reorder_point.is_not(None), on_hand <= rule.c.reorder_point))
                .label("low"),
                func.coalesce(func.sum(on_hand), 0).label("units"),
            )
            .select_from(Product)
            .outerjoin(oh, oh.c.product_id == Product.id)
            .outerjoin(rule, rule.c.product_id == Product.id)
            .where(Product.is_active.is_(True))
        )
        if category_id is not None:
            base = base.where(Product.category_id == category_id)
        row = (await self.session.execute(base)).one()
        return {
            "total": int(row.total),
            "in_stock": int(row.in_stock),
            "out": int(row.out),
            "low": int(row.low),
            "units": float(row.units),
        }

    async def attention_items(self, *, category_id: uuid.UUID | None, limit: int,
                              location_ids: Sequence[uuid.UUID] | None = None) -> list[ProductRow]:
        stmt = self._search_stmt(q=None, category_id=category_id, stock_status="attention", include_inactive=False,
                                 location_ids=location_ids)
        rows = (
            await self.session.execute(stmt.order_by(stmt.selected_columns.on_hand.asc(), Product.name).limit(limit))
        ).unique().all()
        return [ProductRow(p, Decimal(oh), rp) for p, oh, rp in rows]

    # ---- reorder rules
    async def get_rule(self, product_id: uuid.UUID, location_id: uuid.UUID | None) -> ReorderRule | None:
        cond = ReorderRule.location_id.is_(None) if location_id is None else ReorderRule.location_id == location_id
        return await self.session.scalar(select(ReorderRule).where(ReorderRule.product_id == product_id, cond))

    async def add_rule(self, rule: ReorderRule) -> ReorderRule:
        self.session.add(rule)
        await self.flush()
        return rule

    async def delete_rule(self, rule: ReorderRule) -> None:
        await self.session.delete(rule)
        await self.flush()

    async def rules_for_products(self, product_ids: Sequence[uuid.UUID]) -> Sequence[ReorderRule]:
        if not product_ids:
            return []
        return (
            await self.session.scalars(select(ReorderRule).where(ReorderRule.product_id.in_(product_ids)))
        ).all()

    async def open_line_count(self, product_id: uuid.UUID) -> int:
        from app.db.models import OPEN_STATUSES, Operation, OperationLine

        stmt = (
            select(func.count(OperationLine.id))
            .join(Operation, Operation.id == OperationLine.operation_id)
            .where(OperationLine.product_id == product_id, Operation.status.in_(OPEN_STATUSES))
        )
        return int(await self.session.scalar(stmt) or 0)

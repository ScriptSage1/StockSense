"""Product catalogue: create/update (SKU uniqueness), initial stock + ledger seed, search, detail."""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.core import cache as cache_keys
from app.core.cache import Cache, cache as default_cache
from app.core.exceptions import BusinessRuleError, DuplicateSKUError, NotFoundError, UniqueViolation
from app.core.security import utcnow
from app.db.models import (
    LedgerEntry,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
    Product,
    ReorderRule,
    User,
)
from app.repositories.product_repo import ProductRow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.common import Page
from app.schemas.product import (
    CategoryRef,
    ProductCreate,
    ProductOut,
    ProductSummary,
    ProductUpdate,
    StockByLocation,
)
from app.services.mappers import loc_ref
from app.services.reference import next_reference

STOCK_FILTERS = {"in_stock", "low", "out", "attention"}


def _summary(row: ProductRow) -> ProductSummary:
    p = row.product
    on_hand = Decimal(row.on_hand)
    rp = row.reorder_point
    return ProductSummary(
        id=p.id, name=p.name, sku=p.sku,
        category=CategoryRef(id=p.category.id, name=p.category.name) if p.category else None,
        unit_of_measure=p.unit_of_measure, is_active=p.is_active,
        total_on_hand=float(on_hand),
        reorder_point=float(rp) if rp is not None else None,
        is_low_stock=bool(rp is not None and on_hand <= Decimal(rp)),
        is_out_of_stock=on_hand <= 0,
        updated_at=p.updated_at,
    )


class ProductService:
    def __init__(self, uow: UnitOfWork, cache: Cache = default_cache) -> None:
        self.uow = uow
        self.cache = cache

    async def _invalidate(self) -> None:
        await self.cache.delete(cache_keys.CATEGORIES_KEY)
        await self.cache.delete_prefix(cache_keys.DASHBOARD_PREFIX)

    async def search(self, *, q: str | None, category_id: uuid.UUID | None, stock_status: str | None,
                     page: int, page_size: int, sort: str = "name") -> Page[ProductSummary]:
        if stock_status and stock_status not in STOCK_FILTERS:
            stock_status = None
        rows, total = await self.uow.products.search(
            q=q, category_id=category_id, stock_status=stock_status, page=page, page_size=page_size, sort=sort,
        )
        return Page[ProductSummary].build([_summary(r) for r in rows], total, page, page_size)

    async def get(self, product_id: uuid.UUID) -> ProductOut:
        row = await self.uow.products.get_row(product_id)
        if row is None:
            raise NotFoundError("Product not found")
        stock = await self.uow.products.stock_by_location(product_id)
        return ProductOut(
            **_summary(row).model_dump(),
            created_at=row.product.created_at,
            stock_by_location=[
                StockByLocation(location=loc_ref(loc), warehouse_name=wh.name, quantity=float(s.quantity))
                for s, loc, wh in stock
            ],
        )

    async def _check_category(self, category_id: uuid.UUID | None) -> None:
        if category_id is not None and await self.uow.categories.get(category_id) is None:
            raise BusinessRuleError("Category does not exist", code="INVALID_CATEGORY", field="category_id")

    async def _set_rule(self, product_id: uuid.UUID, point: Decimal | None) -> None:
        rule = await self.uow.products.get_rule(product_id, None)
        if point is None:
            if rule is not None:
                await self.uow.products.delete_rule(rule)
            return
        if rule is None:
            await self.uow.products.add_rule(ReorderRule(product_id=product_id, location_id=None, reorder_point=point))
        else:
            rule.reorder_point = point
            await self.uow.products.flush()

    async def create(self, data: ProductCreate, actor: User) -> ProductOut:
        async with self.uow.transaction():
            if await self.uow.products.get_by_sku(data.sku):
                raise DuplicateSKUError(field="sku")
            await self._check_category(data.category_id)
            product = Product(name=data.name, sku=data.sku, category_id=data.category_id,
                              unit_of_measure=data.unit_of_measure, is_active=True)
            try:
                await self.uow.products.create(product)
            except UniqueViolation as exc:
                raise DuplicateSKUError(field="sku") from exc
            if data.reorder_point is not None:
                await self._set_rule(product.id, data.reorder_point)
            if data.initial_stock is not None:
                await self._seed_initial_stock(product, data.initial_stock.location_id,
                                               data.initial_stock.quantity, actor)
        await self._invalidate()
        return await self.get(product.id)

    async def _seed_initial_stock(self, product: Product, location_id: uuid.UUID, qty: Decimal, actor: User) -> None:
        """Initial stock is recorded as a completed adjustment so every unit is traceable in the ledger."""
        located = await self.uow.stock.location_with_warehouse(location_id)
        if located is None:
            raise BusinessRuleError("Location does not exist", code="INVALID_LOCATION",
                                    field="initial_stock.location_id")
        location, warehouse = located
        now = utcnow()
        reference = await next_reference(self.uow, OperationType.adjustment, warehouse.short_code, now.year)
        op = Operation(
            reference=reference, type=OperationType.adjustment, status=OperationStatus.done,
            destination_location_id=location.id, created_by_id=actor.id,
            validated_at=now, validated_by_id=actor.id, notes="Initial stock",
            scheduled_date=now.date(),
        )
        op.lines = [OperationLine(product_id=product.id, quantity=qty, position=0)]
        await self.uow.operations.create(op)
        rows = await self.uow.stock.lock_rows([(product.id, location.id)])
        row = rows[(product.id, location.id)]
        await self.uow.stock.increment(row, qty)
        await self.uow.ledger.append([
            LedgerEntry(operation_id=op.id, product_id=product.id, to_location_id=location.id,
                        quantity=qty, type=OperationType.adjustment, performed_by_id=actor.id)
        ])

    async def update(self, product_id: uuid.UUID, data: ProductUpdate) -> ProductOut:
        async with self.uow.transaction():
            product = await self.uow.products.get(product_id)
            if product is None:
                raise NotFoundError("Product not found")
            fields = data.model_fields_set
            values: dict = {}
            if "name" in fields and data.name:
                values["name"] = " ".join(data.name.split())
            if "sku" in fields and data.sku and data.sku != product.sku:
                existing = await self.uow.products.get_by_sku(data.sku)
                if existing and existing.id != product.id:
                    raise DuplicateSKUError(field="sku")
                values["sku"] = data.sku
            if "category_id" in fields:
                await self._check_category(data.category_id)
                values["category_id"] = data.category_id
            if "unit_of_measure" in fields and data.unit_of_measure:
                values["unit_of_measure"] = data.unit_of_measure.strip()
            try:
                await self.uow.products.update(product, values)
            except UniqueViolation as exc:
                raise DuplicateSKUError(field="sku") from exc
            if data.clear_reorder_point:
                await self._set_rule(product.id, None)
            elif "reorder_point" in fields and data.reorder_point is not None:
                await self._set_rule(product.id, data.reorder_point)
        await self._invalidate()
        return await self.get(product_id)

    async def delete(self, product_id: uuid.UUID) -> None:
        """Archive a product. History is preserved (ledger references it), so this is a soft delete,
        allowed only when nothing is on hand and no open operation uses it."""
        async with self.uow.transaction():
            product = await self.uow.products.get(product_id)
            if product is None or not product.is_active:
                raise NotFoundError("Product not found")
            totals = await self.uow.stock.totals_for_products([product.id])
            if totals.get(product.id, Decimal(0)) > 0:
                raise BusinessRuleError("Product still has stock on hand. Adjust it to zero first.",
                                        code="PRODUCT_HAS_STOCK")
            if await self.uow.products.open_line_count(product.id) > 0:
                raise BusinessRuleError("Product is used by open operations", code="PRODUCT_IN_USE")
            product.is_active = False
            # Free the SKU for reuse while keeping the archived record distinguishable.
            product.sku = f"{product.sku}~{uuid.uuid4().hex[:6]}"[:64]
            await self.uow.products.flush()
        await self._invalidate()

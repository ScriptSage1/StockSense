"""Warehouse / location / category management with Redis read-through caching."""

from __future__ import annotations

import uuid

from app.core import cache as cache_keys
from app.core.cache import Cache, cache as default_cache
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError, UniqueViolation
from app.db.models import Category, Location, Warehouse
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.product import CategoryCreate, CategoryOut
from app.schemas.warehouse import (
    LocationCreate,
    LocationOut,
    LocationStockItem,
    LocationStockOut,
    LocationUpdate,
    WarehouseCreate,
    WarehouseDetail,
    WarehouseOut,
    WarehouseUpdate,
)
from app.services.mappers import location_out


def _warehouse_out(wh: Warehouse, location_count: int) -> WarehouseOut:
    return WarehouseOut(id=wh.id, name=wh.name, short_code=wh.short_code, address=wh.address,
                        is_active=wh.is_active, location_count=location_count, created_at=wh.created_at)


class WarehouseService:
    def __init__(self, uow: UnitOfWork, cache: Cache = default_cache) -> None:
        self.uow = uow
        self.cache = cache

    async def _invalidate(self) -> None:
        await self.cache.delete(cache_keys.WAREHOUSES_KEY)
        await self.cache.delete_prefix("locations:warehouse:")
        await self.cache.delete_prefix(cache_keys.DASHBOARD_PREFIX)

    # ------------------------------------------------------------------ warehouses
    async def list_warehouses(self) -> list[WarehouseOut]:
        cached = await self.cache.get_json(cache_keys.WAREHOUSES_KEY)
        if cached is not None:
            return [WarehouseOut.model_validate(item) for item in cached]
        rows = await self.uow.warehouses.list_all()
        counts = await self.uow.warehouses.location_counts()
        out = [_warehouse_out(w, counts.get(w.id, 0)) for w in rows]
        await self.cache.set_json(cache_keys.WAREHOUSES_KEY, [o.model_dump(mode="json") for o in out],
                                  cache_keys.TTL_WAREHOUSES)
        return out

    async def get_warehouse(self, warehouse_id: uuid.UUID) -> WarehouseDetail:
        wh = await self.uow.warehouses.get(warehouse_id)
        if wh is None:
            raise NotFoundError("Warehouse not found")
        locations = await self.list_locations(warehouse_id)
        return WarehouseDetail(**_warehouse_out(wh, len(locations)).model_dump(), locations=locations)

    async def create_warehouse(self, data: WarehouseCreate) -> WarehouseOut:
        async with self.uow.transaction():
            if await self.uow.warehouses.get_by_code(data.short_code):
                raise ConflictError("Short code already in use", code="DUPLICATE_CODE", field="short_code")
            wh = Warehouse(**data.model_dump())
            try:
                await self.uow.warehouses.create(wh)
            except UniqueViolation as exc:
                raise ConflictError("Short code already in use", code="DUPLICATE_CODE", field="short_code") from exc
        await self._invalidate()
        return _warehouse_out(wh, 0)

    async def update_warehouse(self, warehouse_id: uuid.UUID, data: WarehouseUpdate) -> WarehouseOut:
        async with self.uow.transaction():
            wh = await self.uow.warehouses.get(warehouse_id)
            if wh is None:
                raise NotFoundError("Warehouse not found")
            values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k == "address"}
            if values.get("short_code") and values["short_code"] != wh.short_code:
                existing = await self.uow.warehouses.get_by_code(str(values["short_code"]))
                if existing and existing.id != wh.id:
                    raise ConflictError("Short code already in use", code="DUPLICATE_CODE", field="short_code")
            try:
                await self.uow.warehouses.update(wh, values)
            except UniqueViolation as exc:
                raise ConflictError("Short code already in use", code="DUPLICATE_CODE", field="short_code") from exc
            count = (await self.uow.warehouses.location_counts()).get(wh.id, 0)
        await self._invalidate()
        return _warehouse_out(wh, count)

    # ------------------------------------------------------------------ locations
    async def list_locations(self, warehouse_id: uuid.UUID | None = None) -> list[LocationOut]:
        key = cache_keys.locations_key(warehouse_id)
        cached = await self.cache.get_json(key)
        if cached is not None:
            return [LocationOut.model_validate(item) for item in cached]
        rows = await self.uow.locations.list_filtered(warehouse_id)
        out = [location_out(loc) for loc in rows]
        await self.cache.set_json(key, [o.model_dump(mode="json") for o in out], cache_keys.TTL_LOCATIONS)
        return out

    async def location_stock(self, location_id: uuid.UUID, include_zero: bool = False) -> LocationStockOut:
        """Live stock at a location — never cached (stock is always read from PostgreSQL)."""
        loc = await self.uow.locations.get(location_id)
        if loc is None:
            raise NotFoundError("Location not found")
        rows = await self.uow.stock.list_for_location(location_id, include_zero=include_zero)
        items = [
            LocationStockItem(product_id=p.id, sku=p.sku, name=p.name, unit_of_measure=p.unit_of_measure,
                              quantity=float(s.quantity))
            for s, p in rows
        ]
        total = sum(i.quantity for i in items)
        return LocationStockOut(
            location=location_out(loc, product_count=sum(1 for i in items if i.quantity > 0), total_units=total),
            items=items, total_units=total,
        )

    async def _ensure_warehouse(self, warehouse_id: uuid.UUID) -> Warehouse:
        wh = await self.uow.warehouses.get(warehouse_id)
        if wh is None:
            raise BusinessRuleError("Warehouse does not exist", code="INVALID_WAREHOUSE", field="warehouse_id")
        return wh

    async def create_location(self, data: LocationCreate) -> LocationOut:
        async with self.uow.transaction():
            await self._ensure_warehouse(data.warehouse_id)
            loc = Location(**data.model_dump())
            try:
                await self.uow.locations.create(loc)
            except UniqueViolation as exc:
                raise ConflictError("Short code already used in this warehouse", code="DUPLICATE_CODE",
                                    field="short_code") from exc
            await self.uow.locations.reload(loc, "warehouse")
        await self._invalidate()
        return location_out(loc)

    async def update_location(self, location_id: uuid.UUID, data: LocationUpdate) -> LocationOut:
        async with self.uow.transaction():
            loc = await self.uow.locations.get(location_id)
            if loc is None:
                raise NotFoundError("Location not found")
            values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
            if "warehouse_id" in values and values["warehouse_id"] != loc.warehouse_id:
                await self._ensure_warehouse(values["warehouse_id"])
                totals = await self.uow.locations.stock_totals([loc.id])
                if totals.get(loc.id, (0, 0))[0] > 0:
                    raise BusinessRuleError("Move stock out of this location before changing its warehouse",
                                            code="LOCATION_HAS_STOCK", field="warehouse_id")
            try:
                await self.uow.locations.update(loc, values)
            except UniqueViolation as exc:
                raise ConflictError("Short code already used in this warehouse", code="DUPLICATE_CODE",
                                    field="short_code") from exc
            await self.uow.locations.reload(loc, "warehouse")
        await self._invalidate()
        return location_out(loc)

    # ------------------------------------------------------------------ categories
    async def list_categories(self) -> list[CategoryOut]:
        cached = await self.cache.get_json(cache_keys.CATEGORIES_KEY)
        if cached is not None:
            return [CategoryOut.model_validate(item) for item in cached]
        rows = await self.uow.categories.list_all()
        counts = await self.uow.categories.product_counts()
        out = [CategoryOut(id=c.id, name=c.name, product_count=counts.get(c.id, 0)) for c in rows]
        await self.cache.set_json(cache_keys.CATEGORIES_KEY, [o.model_dump(mode="json") for o in out],
                                  cache_keys.TTL_CATEGORIES)
        return out

    async def create_category(self, data: CategoryCreate) -> CategoryOut:
        async with self.uow.transaction():
            if await self.uow.categories.get_by_name(data.name):
                raise ConflictError("Category already exists", code="DUPLICATE_CATEGORY", field="name")
            cat = Category(name=data.name)
            try:
                await self.uow.categories.create(cat)
            except UniqueViolation as exc:
                raise ConflictError("Category already exists", code="DUPLICATE_CATEGORY", field="name") from exc
        await self.cache.delete(cache_keys.CATEGORIES_KEY)
        return CategoryOut(id=cat.id, name=cat.name, product_count=0)

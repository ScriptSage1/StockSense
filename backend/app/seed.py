"""Development data seeder.

    python -m app.seed            # users + sample warehouse data + a few operations
    python -m app.seed --users    # only the two development users

Refuses to run when APP_ENV=production. Idempotent: existing rows (by email / SKU / code) are kept.

Development accounts (documented in README):
    manager@stocksense.dev / Manager123   (role: manager)
    staff@stocksense.dev   / Staff12345   (role: staff)
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import timedelta
from decimal import Decimal

from app.core.config import settings
from app.core.security import hash_password, utcnow
from app.db.base import SessionFactory, engine
from app.db.models import Category, Location, OperationType, User, UserRole, Warehouse
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.operation import OperationCreate
from app.schemas.product import InitialStock, ProductCreate
from app.services.operation_service import OperationService
from app.services.product_service import ProductService

DEV_USERS = [
    ("Maya Patel", "manager@stocksense.dev", "Manager123", UserRole.manager),
    ("Sam Okafor", "staff@stocksense.dev", "Staff12345", UserRole.staff),
]


async def _ensure_users(uow: UnitOfWork) -> dict[str, User]:
    users: dict[str, User] = {}
    for name, email, password, role in DEV_USERS:
        user = await uow.users.get_by_email(email)
        if user is None:
            user = User(full_name=name, email=email, password_hash=hash_password(password), role=role,
                        email_verified_at=utcnow())
            await uow.users.create(user)
            print(f"  + user {email} ({role.value})")
        users[email] = user
    await uow.commit()
    return users


async def _ensure_warehouse(uow: UnitOfWork, name: str, code: str, address: str,
                            locations: list[tuple[str, str]]) -> dict[str, Location]:
    wh = await uow.warehouses.get_by_code(code)
    if wh is None:
        wh = Warehouse(name=name, short_code=code, address=address)
        await uow.warehouses.create(wh)
        print(f"  + warehouse {code}")
    existing = {loc.short_code: loc for loc in await uow.locations.list_filtered(wh.id)}
    for loc_name, loc_code in locations:
        if loc_code not in existing:
            loc = Location(name=loc_name, short_code=loc_code, warehouse_id=wh.id)
            await uow.locations.create(loc)
            await uow.locations.reload(loc, "warehouse")
            existing[loc_code] = loc
            print(f"  + location {code}/{loc_code}")
    await uow.commit()
    return existing


async def _category(uow: UnitOfWork, name: str) -> Category:
    cat = await uow.categories.get_by_name(name)
    if cat is None:
        cat = Category(name=name)
        await uow.categories.create(cat)
        await uow.commit()
    return cat


async def seed(users_only: bool) -> None:
    if settings.is_production:
        raise SystemExit("Refusing to seed development data with APP_ENV=production")
    async with SessionFactory() as session:
        uow = UnitOfWork(session)
        print("Seeding development users")
        users = await _ensure_users(uow)
        if users_only:
            return
        manager = users["manager@stocksense.dev"]
        staff = users["staff@stocksense.dev"]

        print("Seeding warehouses")
        main = await _ensure_warehouse(uow, "Main Warehouse", "WH", "12 Harbour Road, Chennai",
                                       [("Stock", "STOCK"), ("Receiving Dock", "DOCK"), ("Production Rack", "PROD")])
        east = await _ensure_warehouse(uow, "East Distribution", "EDC", "44 Ring Road, Pune",
                                       [("Stock", "STOCK"), ("Dispatch", "DISP")])

        print("Seeding products")
        raw = await _category(uow, "Raw Materials")
        finished = await _category(uow, "Finished Goods")
        comps = await _category(uow, "Components")
        catalog = [
            ("Steel Rod 12mm", "STL-ROD-12", raw, "kg", Decimal("120"), main["STOCK"], Decimal("40")),
            ("Aluminium Sheet", "ALU-SHT-2", raw, "sheet", Decimal("35"), main["STOCK"], Decimal("20")),
            ("Office Desk", "DESK001", finished, "unit", Decimal("18"), main["STOCK"], Decimal("10")),
            ("Office Chair", "CHAIR001", finished, "unit", Decimal("6"), main["STOCK"], Decimal("8")),
            ("Hex Bolt M8", "BLT-M8", comps, "box", Decimal("64"), east["STOCK"], Decimal("25")),
            ("Caster Wheel", "CST-50", comps, "unit", None, None, Decimal("12")),
        ]
        products = {}
        product_service = ProductService(uow)
        for name, sku, cat, uom, qty, loc, rp in catalog:
            existing = await uow.products.get_by_sku(sku)
            if existing is not None:
                products[sku] = existing
                continue
            out = await product_service.create(
                ProductCreate(name=name, sku=sku, category_id=cat.id, unit_of_measure=uom, reorder_point=rp,
                              initial_stock=InitialStock(location_id=loc.id, quantity=qty) if qty else None),
                manager,
            )
            products[sku] = await uow.products.get(out.id)
            print(f"  + product {sku}")

        if await uow.operations.count_by_type_and_year(OperationType.receipt, utcnow().year) > 0:
            print("Operations already present; skipping")
            return

        print("Seeding operations")
        ops = OperationService(uow)
        today = utcnow().date()
        receipt = await ops.create(OperationCreate(
            type="receipt", supplier_or_customer="Tata Steel", destination_location_id=main["DOCK"].id,
            scheduled_date=today + timedelta(days=2),
            lines=[{"product_id": products["STL-ROD-12"].id, "quantity": 100},
                   {"product_id": products["ALU-SHT-2"].id, "quantity": 20}]), staff)
        await ops.create(OperationCreate(
            type="receipt", supplier_or_customer="Kiran Components", destination_location_id=east["STOCK"].id,
            scheduled_date=today - timedelta(days=1),
            lines=[{"product_id": products["CST-50"].id, "quantity": 40}]), staff)
        done = await ops.create(OperationCreate(
            type="receipt", supplier_or_customer="Kiran Components", destination_location_id=main["STOCK"].id,
            scheduled_date=today, lines=[{"product_id": products["CHAIR001"].id, "quantity": 4}]), staff)
        await ops.validate(done.id, staff)
        await ops.create(OperationCreate(
            type="delivery", supplier_or_customer="Azure Interior", source_location_id=main["STOCK"].id,
            scheduled_date=today, lines=[{"product_id": products["DESK001"].id, "quantity": 6}]), staff)
        await ops.create(OperationCreate(
            type="delivery", supplier_or_customer="Brightline Offices", source_location_id=main["STOCK"].id,
            scheduled_date=today + timedelta(days=1),
            lines=[{"product_id": products["CHAIR001"].id, "quantity": 14}]), staff)
        await ops.create(OperationCreate(
            type="transfer", source_location_id=main["STOCK"].id, destination_location_id=main["PROD"].id,
            scheduled_date=today, lines=[{"product_id": products["STL-ROD-12"].id, "quantity": 30}]), staff)
        await ops.create(OperationCreate(
            type="adjustment", destination_location_id=main["STOCK"].id, notes="Cycle count, aisle 3",
            lines=[{"product_id": products["STL-ROD-12"].id, "quantity": 117}]), manager)
        print(f"  + {receipt.reference} and 6 more")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed StockSense development data")
    parser.add_argument("--users", action="store_true", help="only create development users")
    args = parser.parse_args()

    async def run() -> None:
        try:
            await seed(args.users)
        finally:
            await engine.dispose()

    asyncio.run(run())
    print("Done.")


if __name__ == "__main__":
    main()

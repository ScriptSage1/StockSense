"""Real concurrency checks against PostgreSQL row locks (no shared test transaction here:
each coroutine gets its own connection, and the tables are truncated afterwards)."""

from __future__ import annotations

import asyncio
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core import cache as cache_module
from app.core.exceptions import AlreadyValidatedError, InsufficientStockError
from app.db.models import Location, Product, User, UserRole, Warehouse
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.operation import OperationCreate
from app.services.operation_service import OperationService
from tests.conftest import TEST_DATABASE_URL

pytestmark = pytest.mark.asyncio

TABLES = ("ledger_entries, operation_lines, operations, stock, reorder_rules, products, categories, "
          "locations, warehouses, otp_records, refresh_tokens, users")


@pytest_asyncio.fixture
async def env():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with factory() as s:
        user = User(full_name="Concurrent", email="c@stocksense.dev", password_hash="x", role=UserRole.manager)
        wh = Warehouse(name="Main", short_code="WH")
        s.add_all([user, wh])
        await s.flush()
        loc = Location(name="Stock", short_code="STOCK", warehouse_id=wh.id)
        product = Product(name="Desk", sku="DESK", unit_of_measure="unit")
        s.add_all([loc, product])
        await s.commit()
    try:
        yield factory, user, loc, product
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {TABLES} CASCADE"))
        await engine.dispose()
        await cache_module.close_redis()


async def _create(factory, user, **kw):
    async with factory() as s:
        out = await OperationService(UnitOfWork(s)).create(OperationCreate(**kw), user)
        return out.id


async def _validate(factory, user, op_id):
    async with factory() as s:
        try:
            return await OperationService(UnitOfWork(s)).validate(op_id, user)
        except Exception as exc:  # returned for inspection
            return exc


async def _on_hand(factory, product_id, location_id) -> Decimal:
    async with factory() as s:
        return (await UnitOfWork(s).stock.quantities(location_id, [product_id])).get(product_id, Decimal(0))


async def test_concurrent_double_validation_applies_once(env) -> None:
    factory, user, loc, product = env
    op_id = await _create(factory, user, type="receipt", destination_location_id=loc.id,
                          lines=[{"product_id": product.id, "quantity": 5}])
    results = await asyncio.gather(*[_validate(factory, user, op_id) for _ in range(4)])
    errors = [r for r in results if isinstance(r, Exception)]
    assert len(errors) == 3 and all(isinstance(e, AlreadyValidatedError) for e in errors)
    assert await _on_hand(factory, product.id, loc.id) == 5


async def test_concurrent_deliveries_never_oversell(env) -> None:
    factory, user, loc, product = env
    receipt = await _create(factory, user, type="receipt", destination_location_id=loc.id,
                            lines=[{"product_id": product.id, "quantity": 10}])
    assert not isinstance(await _validate(factory, user, receipt), Exception)
    ids = [await _create(factory, user, type="delivery", source_location_id=loc.id,
                         lines=[{"product_id": product.id, "quantity": 6}]) for _ in range(3)]
    results = await asyncio.gather(*[_validate(factory, user, i) for i in ids])
    ok = [r for r in results if not isinstance(r, Exception)]
    short = [r for r in results if isinstance(r, InsufficientStockError)]
    assert len(ok) == 1 and len(short) == 2
    assert await _on_hand(factory, product.id, loc.id) == 4

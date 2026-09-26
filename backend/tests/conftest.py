"""Test fixtures.

* A separate PostgreSQL test database (TEST_DATABASE_URL) — schema created once per session.
* Each test runs inside an outer transaction that is rolled back afterwards; the app's own
  commits become SAVEPOINT releases (join_transaction_mode="create_savepoint"), so tests are isolated.
* Redis uses a dedicated logical DB (15) that is flushed before each test.
* Email is captured by a fake provider so OTP flows can be asserted.
"""

from __future__ import annotations

import asyncio
import os
import re
from typing import AsyncIterator

# Must be configured before the app is imported.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://stocksense:stocksense@localhost:5432/stocksense_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-123")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:5173")
os.environ.setdefault("BCRYPT_ROUNDS", "4")  # tests hash constantly; production keeps the default cost

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import redis as sync_redis  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core import cache as cache_module  # noqa: E402
from app.db.base import Base  # noqa: E402
import app.db.models  # noqa: E402,F401
from app.dependencies import get_email_service, get_session_factory  # noqa: E402
from app.main import app  # noqa: E402
from app.services.email_service import EmailService, OutgoingEmail  # noqa: E402

ORIGIN = "http://localhost:5173"


class CapturingProvider:
    def __init__(self) -> None:
        self.sent: list[OutgoingEmail] = []

    async def send(self, message: OutgoingEmail) -> None:
        self.sent.append(message)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    async def build() -> None:
        engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.exec_driver_sql("DROP FUNCTION IF EXISTS ledger_entries_immutable() CASCADE")
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(build())


@pytest.fixture(autouse=True)
def _flush_redis() -> None:
    client = sync_redis.Redis.from_url(os.environ["REDIS_URL"])
    client.flushdb()
    client.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    conn = await engine.connect()
    trans = await conn.begin()
    factory = async_sessionmaker(bind=conn, expire_on_commit=False, autoflush=False,
                                 join_transaction_mode="create_savepoint")
    session = factory()
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()
        await engine.dispose()
        await cache_module.close_redis()


@pytest.fixture
def mailbox() -> CapturingProvider:
    return CapturingProvider()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, mailbox: CapturingProvider) -> AsyncIterator[httpx.AsyncClient]:
    class _SharedSessionFactory:
        """Hands the single test session to every dependency (including background tasks)."""

        def __call__(self) -> "_Ctx":
            return _Ctx()

    class _Ctx:
        async def __aenter__(self) -> AsyncSession:
            return db_session

        async def __aexit__(self, *exc: object) -> None:
            return None

        async def close(self) -> None:
            return None

    shared = _SharedSessionFactory()

    def _factory_override():  # type: ignore[no-untyped-def]
        return shared

    # Background UoW factory calls factory() and uses the result as a session directly.
    from app import dependencies

    async def _bg_factory():  # type: ignore[no-untyped-def]
        from app.repositories.unit_of_work import UnitOfWork

        async def _noop() -> None:
            return None

        async def make():  # type: ignore[no-untyped-def]
            return UnitOfWork(db_session), _noop

        return make

    app.dependency_overrides[get_session_factory] = _factory_override
    app.dependency_overrides[dependencies.get_background_uow_factory] = _bg_factory
    app.dependency_overrides[get_email_service] = lambda: EmailService(mailbox)

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="https://testserver",
                                 headers={"Origin": ORIGIN}) as ac:
        ac.mailbox = mailbox  # type: ignore[attr-defined]  # lets helpers read emailed codes
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------- helpers
PASSWORD = "Passw0rd!"


def last_code(client: httpx.AsyncClient) -> str:
    """The 6-digit code from the most recent captured email."""
    return re.search(r"\b(\d{6})\b", client.mailbox.sent[-1].text).group(1)  # type: ignore[attr-defined]


async def verify(client: httpx.AsyncClient, challenge: dict, code: str | None = None) -> httpx.Response:
    """Step 2 of sign-in / sign-up. Without `code`, uses the most recently emailed one."""
    return await client.post("/api/v1/auth/otp/verify",
                             json={"challenge_token": challenge["challenge_token"], "otp": code or last_code(client)})


async def register(client: httpx.AsyncClient, email: str, name: str = "Test User") -> dict:
    """Sign-up including the emailed-code step; returns the token response."""
    r = await client.post("/api/v1/auth/register", json={"full_name": name, "email": email, "password": PASSWORD})
    assert r.status_code == 202, r.text
    v = await verify(client, r.json())
    assert v.status_code == 200, v.text
    return v.json()


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> dict:
    """Sign-in including the emailed-code step; returns the token response."""
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    v = await verify(client, r.json())
    assert v.status_code == 200, v.text
    return v.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def manager(client: httpx.AsyncClient) -> dict:
    """First registered user → manager."""
    data = await register(client, "manager@stocksense.dev", "Maya Manager")
    assert data["user"]["role"] == "manager"
    return {"token": data["access_token"], "headers": auth(data["access_token"]), "user": data["user"]}


@pytest_asyncio.fixture
async def staff(client: httpx.AsyncClient, manager: dict) -> dict:
    client.cookies.clear()
    data = await register(client, "staff@stocksense.dev", "Sam Staff")
    assert data["user"]["role"] == "staff"
    client.cookies.clear()
    return {"token": data["access_token"], "headers": auth(data["access_token"]), "user": data["user"]}


@pytest_asyncio.fixture
async def world(client: httpx.AsyncClient, manager: dict) -> dict:
    """A warehouse with two locations, a category and two products (no stock)."""
    h = manager["headers"]
    wh = (await client.post("/api/v1/warehouses", headers=h,
                            json={"name": "Main Warehouse", "short_code": "WH", "address": "1 Dock Rd"})).json()
    a = (await client.post("/api/v1/locations", headers=h,
                           json={"name": "Stock", "short_code": "STOCK", "warehouse_id": wh["id"]})).json()
    b = (await client.post("/api/v1/locations", headers=h,
                           json={"name": "Production Rack", "short_code": "PROD", "warehouse_id": wh["id"]})).json()
    cat = (await client.post("/api/v1/categories", headers=h, json={"name": "Furniture"})).json()
    desk = (await client.post("/api/v1/products", headers=h,
                              json={"name": "Desk", "sku": "DESK001", "category_id": cat["id"],
                                    "unit_of_measure": "unit", "reorder_point": 5})).json()
    chair = (await client.post("/api/v1/products", headers=h,
                               json={"name": "Chair", "sku": "CHAIR001", "category_id": cat["id"],
                                     "unit_of_measure": "unit"})).json()
    return {"warehouse": wh, "loc_a": a, "loc_b": b, "category": cat, "desk": desk, "chair": chair}

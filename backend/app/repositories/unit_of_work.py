"""Unit of Work: bundles repositories around one AsyncSession and owns the transaction boundary.
Services depend on this object (not on SQLAlchemy) so they stay framework-agnostic."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError
from app.repositories.ledger_repo import LedgerRepository
from app.repositories.operation_repo import OperationRepository
from app.repositories.otp_repo import OTPRepository
from app.repositories.product_repo import CategoryRepository, ProductRepository
from app.repositories.stock_repo import StockRepository
from app.repositories.user_repo import UserRepository
from app.repositories.warehouse_repo import LocationRepository, WarehouseRepository


class UnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.otps = OTPRepository(session)
        self.warehouses = WarehouseRepository(session)
        self.locations = LocationRepository(session)
        self.categories = CategoryRepository(session)
        self.products = ProductRepository(session)
        self.stock = StockRepository(session)
        self.operations = OperationRepository(session)
        self.ledger = LedgerRepository(session)

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator["UnitOfWork"]:
        """One atomic unit: commit on success, full rollback on *any* exception.
        (The session autobegins on first use, so everything executed inside is one DB transaction.)"""
        try:
            yield self
            await self.session.commit()
        except DBAPIError as exc:
            await self.session.rollback()
            sqlstate = getattr(getattr(exc.orig, "__cause__", None), "sqlstate", None)
            if sqlstate == "23514":  # check_violation (e.g. stock would go negative)
                raise BusinessRuleError("Change violates a stock constraint", code="CONSTRAINT_VIOLATION") from exc
            raise
        except BaseException:
            await self.session.rollback()
            raise

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

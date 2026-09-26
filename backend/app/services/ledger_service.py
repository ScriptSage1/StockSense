"""Read-only access to the append-only stock ledger (move history)."""

from __future__ import annotations

from app.repositories.ledger_repo import LedgerFilters
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.common import Page
from app.schemas.ledger import LedgerEntryOut
from app.services.mappers import ledger_out


class LedgerService:
    def __init__(self, uow: UnitOfWork) -> None:
        self.uow = uow

    async def history(self, f: LedgerFilters, *, page: int, page_size: int) -> Page[LedgerEntryOut]:
        rows, total = await self.uow.ledger.search(f, page=page, page_size=page_size)
        return Page[LedgerEntryOut].build([ledger_out(e) for e in rows], total, page, page_size)

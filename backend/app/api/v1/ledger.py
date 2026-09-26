from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.exceptions import InputValidationError
from app.db.models import OperationType, User
from app.dependencies import get_current_user, get_uow
from app.repositories.ledger_repo import LedgerFilters
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.ledger import LedgerListResponse
from app.schemas.operation import OperationTypeLit
from app.services.ledger_service import LedgerService

router = APIRouter(prefix="/ledger", tags=["ledger"])


@router.get("", response_model=LedgerListResponse)
async def move_history(
    product_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    operation_id: uuid.UUID | None = None,
    type: OperationTypeLit | None = None,
    direction: Literal["in", "out"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    _: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_uow),
) -> LedgerListResponse:
    if from_date and to_date and from_date > to_date:
        raise InputValidationError("Start date must be before end date", field="from_date")
    f = LedgerFilters(product_id=product_id, location_id=location_id, operation_id=operation_id,
                      type=OperationType(type) if type else None, direction=direction, q=q,
                      from_date=from_date, to_date=to_date)
    return await LedgerService(uow).history(f, page=page, page_size=page_size)

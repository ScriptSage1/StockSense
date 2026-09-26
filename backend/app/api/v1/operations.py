from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.core.exceptions import InputValidationError
from app.db.models import OperationStatus, OperationType, User
from app.dependencies import UowFactory, get_background_uow_factory, get_current_user, get_email_service, get_uow, require_role
from app.repositories.operation_repo import OperationFilters
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.operation import (
    OperationCreate,
    OperationListResponse,
    OperationOut,
    OperationTypeLit,
    OperationUpdate,
    ValidateResponse,
)
from app.services.email_service import EmailService
from app.services.operation_service import OperationService, check_reorder_alerts

router = APIRouter(prefix="/operations", tags=["operations"])


def parse_statuses(raw: str | None) -> list[OperationStatus] | None:
    if not raw:
        return None
    out: list[OperationStatus] = []
    for part in raw.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if part == "open":
            out.extend([OperationStatus.draft, OperationStatus.waiting, OperationStatus.ready])
            continue
        try:
            out.append(OperationStatus(part))
        except ValueError as exc:
            raise InputValidationError(f"Unknown status '{part}'", field="status") from exc
    return out or None


@router.get("", response_model=OperationListResponse)
async def list_operations(
    type: OperationTypeLit | None = None,
    status_: str | None = Query(default=None, alias="status", description="Comma-separated; 'open' = draft,waiting,ready"),
    warehouse_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["-created_at", "created_at", "scheduled_date", "-scheduled_date", "reference"] = "-created_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_uow),
) -> OperationListResponse:
    f = OperationFilters(
        type=OperationType(type) if type else None, statuses=parse_statuses(status_),
        warehouse_id=warehouse_id, location_id=location_id, category_id=category_id, q=q,
        date_from=date_from, date_to=date_to,
    )
    return await OperationService(uow).list(f, page=page, page_size=page_size, sort=sort)


@router.post("", response_model=OperationOut, status_code=status.HTTP_201_CREATED)
async def create_operation(data: OperationCreate, user: User = Depends(get_current_user),
                           uow: UnitOfWork = Depends(get_uow)) -> OperationOut:
    return await OperationService(uow).create(data, user)


@router.get("/{op_id}", response_model=OperationOut)
async def get_operation(op_id: uuid.UUID, _: User = Depends(get_current_user),
                        uow: UnitOfWork = Depends(get_uow)) -> OperationOut:
    return await OperationService(uow).get(op_id)


@router.put("/{op_id}", response_model=OperationOut)
async def update_operation(op_id: uuid.UUID, data: OperationUpdate, _: User = Depends(get_current_user),
                           uow: UnitOfWork = Depends(get_uow)) -> OperationOut:
    return await OperationService(uow).update(op_id, data)


@router.post("/{op_id}/validate", response_model=ValidateResponse)
async def validate_operation(
    op_id: uuid.UUID,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_uow),
    uow_factory: UowFactory = Depends(get_background_uow_factory),
    email: EmailService = Depends(get_email_service),
) -> ValidateResponse:
    result = await OperationService(uow).validate(op_id, user)
    background.add_task(check_reorder_alerts, uow_factory, email.send_low_stock_alert, result.product_ids)
    return result.response


@router.post("/{op_id}/cancel", response_model=OperationOut)
async def cancel_operation(op_id: uuid.UUID, user: User = Depends(require_role("manager")),
                           uow: UnitOfWork = Depends(get_uow)) -> OperationOut:
    return await OperationService(uow).cancel(op_id, user)

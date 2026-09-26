from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.db.models import OperationStatus, OperationType, User
from app.dependencies import get_current_user, get_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.dashboard import DashboardSummary
from app.schemas.operation import OperationStatusLit, OperationTypeLit
from app.services.dashboard_service import DashboardFilters, DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    type: OperationTypeLit | None = None,
    status: OperationStatusLit | None = None,
    warehouse_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    _: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_uow),
) -> DashboardSummary:
    f = DashboardFilters(
        type=OperationType(type) if type else None,
        status=OperationStatus(status) if status else None,
        warehouse_id=warehouse_id, location_id=location_id, category_id=category_id,
    )
    return await DashboardService(uow).summary(f)

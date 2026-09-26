from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.db.models import User
from app.dependencies import get_current_user, get_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.product import CategoryCreate, CategoryOut
from app.services.warehouse_service import WarehouseService

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(_: User = Depends(get_current_user), uow: UnitOfWork = Depends(get_uow)) -> list[CategoryOut]:
    return await WarehouseService(uow).list_categories()


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryCreate, _: User = Depends(get_current_user),
                          uow: UnitOfWork = Depends(get_uow)) -> CategoryOut:
    return await WarehouseService(uow).create_category(data)

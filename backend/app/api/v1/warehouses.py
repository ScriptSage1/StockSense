from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status

from app.db.models import User
from app.dependencies import get_current_user, get_uow, require_role
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.warehouse import WarehouseCreate, WarehouseDetail, WarehouseOut, WarehouseUpdate
from app.services.warehouse_service import WarehouseService

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get("", response_model=list[WarehouseOut])
async def list_warehouses(_: User = Depends(get_current_user), uow: UnitOfWork = Depends(get_uow)) -> list[WarehouseOut]:
    return await WarehouseService(uow).list_warehouses()


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
async def create_warehouse(data: WarehouseCreate, _: User = Depends(require_role("manager")),
                           uow: UnitOfWork = Depends(get_uow)) -> WarehouseOut:
    return await WarehouseService(uow).create_warehouse(data)


@router.get("/{warehouse_id}", response_model=WarehouseDetail)
async def get_warehouse(warehouse_id: uuid.UUID, _: User = Depends(get_current_user),
                        uow: UnitOfWork = Depends(get_uow)) -> WarehouseDetail:
    return await WarehouseService(uow).get_warehouse(warehouse_id)


@router.put("/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(warehouse_id: uuid.UUID, data: WarehouseUpdate, _: User = Depends(require_role("manager")),
                           uow: UnitOfWork = Depends(get_uow)) -> WarehouseOut:
    return await WarehouseService(uow).update_warehouse(warehouse_id, data)

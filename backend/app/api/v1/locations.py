from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status

from app.db.models import User
from app.dependencies import get_current_user, get_uow, require_role
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.warehouse import LocationCreate, LocationOut, LocationStockOut, LocationUpdate
from app.services.warehouse_service import WarehouseService

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[LocationOut])
async def list_locations(warehouse_id: uuid.UUID | None = None, _: User = Depends(get_current_user),
                         uow: UnitOfWork = Depends(get_uow)) -> list[LocationOut]:
    return await WarehouseService(uow).list_locations(warehouse_id)


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(data: LocationCreate, _: User = Depends(require_role("manager")),
                          uow: UnitOfWork = Depends(get_uow)) -> LocationOut:
    return await WarehouseService(uow).create_location(data)


@router.get("/{location_id}/stock", response_model=LocationStockOut)
async def location_stock(location_id: uuid.UUID, include_zero: bool = False, _: User = Depends(get_current_user),
                         uow: UnitOfWork = Depends(get_uow)) -> LocationStockOut:
    return await WarehouseService(uow).location_stock(location_id, include_zero)


@router.put("/{location_id}", response_model=LocationOut)
async def update_location(location_id: uuid.UUID, data: LocationUpdate, _: User = Depends(require_role("manager")),
                          uow: UnitOfWork = Depends(get_uow)) -> LocationOut:
    return await WarehouseService(uow).update_location(location_id, data)

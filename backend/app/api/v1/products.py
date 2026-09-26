from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status

from app.db.models import User
from app.dependencies import get_current_user, get_uow, require_role
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.product import ProductCreate, ProductListResponse, ProductOut, ProductUpdate
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductListResponse)
async def list_products(
    q: str | None = Query(default=None, max_length=100),
    category_id: uuid.UUID | None = None,
    stock_status: Literal["in_stock", "low", "out", "attention"] | None = None,
    sort: Literal["name", "sku", "-created_at", "on_hand"] = "name",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_uow),
) -> ProductListResponse:
    return await ProductService(uow).search(q=q, category_id=category_id, stock_status=stock_status,
                                            page=page, page_size=page_size, sort=sort)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductCreate, user: User = Depends(get_current_user),
                         uow: UnitOfWork = Depends(get_uow)) -> ProductOut:
    return await ProductService(uow).create(data, user)


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: uuid.UUID, _: User = Depends(get_current_user),
                      uow: UnitOfWork = Depends(get_uow)) -> ProductOut:
    return await ProductService(uow).get(product_id)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(product_id: uuid.UUID, data: ProductUpdate, _: User = Depends(get_current_user),
                         uow: UnitOfWork = Depends(get_uow)) -> ProductOut:
    return await ProductService(uow).update(product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, _: User = Depends(require_role("manager")),
                         uow: UnitOfWork = Depends(get_uow)) -> Response:
    await ProductService(uow).delete(product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

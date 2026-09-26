from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Page, PositiveQtyIn, QtyIn, Schema
from app.schemas.warehouse import LocationRef

_SKU = r"^[A-Za-z0-9][A-Za-z0-9._/-]*$"


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name is required")
        return v


class CategoryOut(Schema):
    id: uuid.UUID
    name: str
    product_count: int = 0


class InitialStock(BaseModel):
    location_id: uuid.UUID
    quantity: PositiveQtyIn


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sku: str = Field(min_length=1, max_length=64, pattern=_SKU)
    category_id: uuid.UUID | None = None
    unit_of_measure: str = Field(default="unit", min_length=1, max_length=20)
    reorder_point: QtyIn | None = None
    initial_stock: InitialStock | None = None

    @field_validator("sku")
    @classmethod
    def _sku(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("name", "unit_of_measure")
    @classmethod
    def _strip(cls, v: str) -> str:
        return " ".join(v.split())


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    sku: str | None = Field(default=None, min_length=1, max_length=64, pattern=_SKU)
    category_id: uuid.UUID | None = None
    unit_of_measure: str | None = Field(default=None, min_length=1, max_length=20)
    reorder_point: QtyIn | None = None
    clear_reorder_point: bool = False

    @field_validator("sku")
    @classmethod
    def _sku(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v

    @model_validator(mode="after")
    def _consistent(self) -> "ProductUpdate":
        if self.clear_reorder_point and self.reorder_point is not None:
            raise ValueError("Provide reorder_point or clear_reorder_point, not both")
        return self


class CategoryRef(Schema):
    id: uuid.UUID
    name: str


class StockByLocation(Schema):
    location: LocationRef
    warehouse_name: str
    quantity: float


class ProductSummary(Schema):
    id: uuid.UUID
    name: str
    sku: str
    category: CategoryRef | None
    unit_of_measure: str
    is_active: bool
    total_on_hand: float
    reorder_point: float | None
    is_low_stock: bool
    is_out_of_stock: bool
    updated_at: datetime


class ProductOut(ProductSummary):
    created_at: datetime
    stock_by_location: list[StockByLocation]


ProductListResponse = Page[ProductSummary]

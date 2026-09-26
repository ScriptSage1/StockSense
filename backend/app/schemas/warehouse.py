from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Schema

_CODE = r"^[A-Za-z0-9][A-Za-z0-9_-]*$"


def _code(v: str) -> str:
    return v.strip().upper()


class WarehouseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    short_code: str = Field(min_length=1, max_length=10, pattern=_CODE)
    address: str | None = Field(default=None, max_length=500)
    is_active: bool = True

    @field_validator("short_code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return _code(v)


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    short_code: str | None = Field(default=None, min_length=1, max_length=10, pattern=_CODE)
    address: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    @field_validator("short_code")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return _code(v) if v else v


class WarehouseOut(Schema):
    id: uuid.UUID
    name: str
    short_code: str
    address: str | None
    is_active: bool
    location_count: int = 0
    created_at: datetime


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    short_code: str = Field(min_length=1, max_length=20, pattern=_CODE)
    warehouse_id: uuid.UUID
    is_active: bool = True

    @field_validator("short_code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return _code(v)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    short_code: str | None = Field(default=None, min_length=1, max_length=20, pattern=_CODE)
    warehouse_id: uuid.UUID | None = None
    is_active: bool | None = None

    @field_validator("short_code")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return _code(v) if v else v


class WarehouseRef(Schema):
    id: uuid.UUID
    name: str
    short_code: str


class LocationOut(Schema):
    id: uuid.UUID
    name: str
    short_code: str
    full_code: str
    warehouse_id: uuid.UUID
    warehouse: WarehouseRef
    is_active: bool
    product_count: int = 0
    total_units: float = 0
    created_at: datetime


class LocationRef(Schema):
    id: uuid.UUID
    name: str
    short_code: str
    full_code: str
    warehouse_id: uuid.UUID


class WarehouseDetail(WarehouseOut):
    locations: list[LocationOut]


class LocationStockItem(Schema):
    product_id: uuid.UUID
    sku: str
    name: str
    unit_of_measure: str
    quantity: float


class LocationStockOut(Schema):
    location: LocationOut
    items: list[LocationStockItem]
    total_units: float

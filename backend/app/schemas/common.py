from __future__ import annotations

import math
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

# Input quantities: exact decimals, up to 3 places.
QtyIn = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=3)]
PositiveQtyIn = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=3)]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ErrorOut(BaseModel):
    detail: str
    code: str
    field: str | None = None


class Page(Schema, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        return cls(items=items, total=total, page=page, page_size=page_size,
                   pages=max(1, math.ceil(total / page_size)) if page_size else 1)


class IdName(Schema):
    id: str
    name: str


class MessageOut(BaseModel):
    detail: str

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Page, QtyIn, Schema
from app.schemas.warehouse import LocationRef

OperationTypeLit = Literal["receipt", "delivery", "transfer", "adjustment"]
OperationStatusLit = Literal["draft", "waiting", "ready", "done", "canceled"]


class OperationLineIn(BaseModel):
    product_id: uuid.UUID
    # For adjustments this is the counted quantity (may be 0); for moves it must be > 0
    # (enforced by the service so the error can point at the exact line).
    quantity: QtyIn


class OperationCreate(BaseModel):
    type: OperationTypeLit
    supplier_or_customer: str | None = Field(default=None, max_length=200)
    source_location_id: uuid.UUID | None = None
    destination_location_id: uuid.UUID | None = None
    scheduled_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    lines: list[OperationLineIn] = Field(default_factory=list, max_length=200)

    @field_validator("supplier_or_customer", "notes")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class OperationUpdate(BaseModel):
    supplier_or_customer: str | None = Field(default=None, max_length=200)
    source_location_id: uuid.UUID | None = None
    destination_location_id: uuid.UUID | None = None
    scheduled_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    lines: list[OperationLineIn] | None = Field(default=None, max_length=200)

    @field_validator("supplier_or_customer", "notes")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class UserRef(Schema):
    id: uuid.UUID
    full_name: str


class ProductRef(Schema):
    id: uuid.UUID
    name: str
    sku: str
    unit_of_measure: str


class OperationLineOut(Schema):
    id: uuid.UUID
    product: ProductRef
    quantity: float
    # Live on-hand at the relevant location (source for moves, the counted location for
    # adjustments). Only populated while the operation is open.
    available: float | None = None
    # Adjustments: counted - current (open) or the recorded delta (done).
    delta: float | None = None
    is_short: bool = False


class LedgerEntryBrief(Schema):
    id: uuid.UUID
    product_id: uuid.UUID
    quantity: float
    from_location_id: uuid.UUID | None
    to_location_id: uuid.UUID | None
    performed_at: datetime


class OperationSummary(Schema):
    id: uuid.UUID
    reference: str
    type: OperationTypeLit
    status: OperationStatusLit
    supplier_or_customer: str | None
    source_location: LocationRef | None
    destination_location: LocationRef | None
    scheduled_date: date | None
    is_late: bool
    line_count: int
    total_quantity: float
    created_by: UserRef
    created_at: datetime
    validated_at: datetime | None


class OperationOut(OperationSummary):
    notes: str | None
    lines: list[OperationLineOut]
    validated_by: UserRef | None
    canceled_by: UserRef | None
    canceled_at: datetime | None
    updated_at: datetime
    ledger_entries: list[LedgerEntryBrief] = []


class ValidateResponse(BaseModel):
    operation: OperationOut
    ledger_entries: list[LedgerEntryBrief]


OperationListResponse = Page[OperationSummary]

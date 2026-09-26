from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.common import Page, Schema
from app.schemas.operation import OperationTypeLit, ProductRef, UserRef
from app.schemas.warehouse import LocationRef


class OperationRef(Schema):
    id: uuid.UUID
    reference: str
    type: OperationTypeLit
    supplier_or_customer: str | None


class LedgerEntryOut(Schema):
    id: uuid.UUID
    operation: OperationRef
    product: ProductRef
    from_location: LocationRef | None
    to_location: LocationRef | None
    quantity: float
    direction: str  # "in" | "out"
    type: OperationTypeLit
    performed_by: UserRef
    performed_at: datetime


LedgerListResponse = Page[LedgerEntryOut]

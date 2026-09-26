from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.ledger import LedgerEntryOut
from app.schemas.operation import OperationSummary


class TypeBreakdown(BaseModel):
    open: int = 0
    ready: int = 0
    waiting: int = 0
    draft: int = 0
    late: int = 0
    upcoming: int = 0
    today: int = 0


class LowStockItem(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    unit_of_measure: str
    total_on_hand: float
    reorder_point: float | None
    is_out_of_stock: bool


class StatusCounts(BaseModel):
    draft: int = 0
    waiting: int = 0
    ready: int = 0
    done: int = 0
    canceled: int = 0


class DashboardSummary(BaseModel):
    # KPI tiles
    total_products: int
    products_in_stock: int
    total_units: float
    low_stock_count: int
    out_of_stock_count: int
    pending_receipts: int
    pending_deliveries: int
    scheduled_transfers: int
    pending_adjustments: int
    # Detail
    receipts: TypeBreakdown
    deliveries: TypeBreakdown
    transfers: TypeBreakdown
    adjustments: TypeBreakdown
    status_counts: StatusCounts
    low_stock_items: list[LowStockItem]
    pending_operations: list[OperationSummary]
    recent_moves: list[LedgerEntryOut]
    generated_at: datetime

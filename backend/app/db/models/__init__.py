"""Import every model so Base.metadata is complete (used by Alembic and tests)."""

from app.db.models.user import RefreshToken, User, UserRole
from app.db.models.warehouse import Warehouse
from app.db.models.location import Location
from app.db.models.product import Category, Product, ReorderRule
from app.db.models.stock import Stock
from app.db.models.operation import (
    OPEN_STATUSES,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
)
from app.db.models.ledger import LedgerEntry
from app.db.models.otp import OTPRecord

__all__ = [
    "Category",
    "LedgerEntry",
    "Location",
    "OPEN_STATUSES",
    "OTPRecord",
    "Operation",
    "OperationLine",
    "OperationStatus",
    "OperationType",
    "Product",
    "RefreshToken",
    "ReorderRule",
    "Stock",
    "User",
    "UserRole",
    "Warehouse",
]

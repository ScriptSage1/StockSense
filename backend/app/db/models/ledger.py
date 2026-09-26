from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPk
from app.db.models.location import Location
from app.db.models.operation import Operation, OperationType
from app.db.models.product import Product
from app.db.models.user import User


class LedgerEntry(UUIDPk, Base):
    """Immutable audit record of a stock change. Append-only: never updated or deleted.
    A database trigger (see migration 0001) rejects UPDATE and DELETE."""

    __tablename__ = "ledger_entries"

    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operations.id", ondelete="RESTRICT"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True
    )
    to_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)  # signed
    type: Mapped[OperationType] = mapped_column(
        Enum(OperationType, name="ledger_type", native_enum=False, create_constraint=True, length=16),
        nullable=False,
    )
    performed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    operation: Mapped[Operation] = relationship(lazy="joined")
    product: Mapped[Product] = relationship(lazy="joined")
    from_location: Mapped[Location | None] = relationship(foreign_keys=[from_location_id], lazy="joined")
    to_location: Mapped[Location | None] = relationship(foreign_keys=[to_location_id], lazy="joined")
    performed_by: Mapped[User] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("quantity <> 0", name="quantity_non_zero"),
        CheckConstraint(
            "from_location_id IS NOT NULL OR to_location_id IS NOT NULL", name="has_location"
        ),
        Index("ix_ledger_entries_product_id", "product_id"),
        Index("ix_ledger_entries_performed_at", text("performed_at DESC")),
        Index("ix_ledger_entries_operation_id", "operation_id"),
    )


# Append-only enforcement at the database level. Shared with the Alembic migration.
LEDGER_IMMUTABLE_FUNCTION = """
CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
"""
LEDGER_IMMUTABLE_TRIGGER = """
CREATE TRIGGER trg_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();
"""

from sqlalchemy import DDL, event  # noqa: E402

event.listen(LedgerEntry.__table__, "after_create", DDL(LEDGER_IMMUTABLE_FUNCTION))
event.listen(LedgerEntry.__table__, "after_create", DDL(LEDGER_IMMUTABLE_TRIGGER))

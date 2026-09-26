from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk
from app.db.models.location import Location
from app.db.models.product import Product
from app.db.models.user import User


class OperationType(str, enum.Enum):
    receipt = "receipt"
    delivery = "delivery"
    transfer = "transfer"
    adjustment = "adjustment"


class OperationStatus(str, enum.Enum):
    draft = "draft"
    waiting = "waiting"
    ready = "ready"
    done = "done"
    canceled = "canceled"


OPEN_STATUSES = (OperationStatus.draft, OperationStatus.waiting, OperationStatus.ready)


class Operation(UUIDPk, Timestamped, Base):
    __tablename__ = "operations"

    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    type: Mapped[OperationType] = mapped_column(
        Enum(OperationType, name="operation_type", native_enum=False, create_constraint=True, length=16),
        nullable=False,
    )
    status: Mapped[OperationStatus] = mapped_column(
        Enum(OperationStatus, name="operation_status", native_enum=False, create_constraint=True, length=16),
        nullable=False,
        default=OperationStatus.draft,
    )
    supplier_or_customer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True
    )
    destination_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True
    )
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )

    source_location: Mapped[Location | None] = relationship(foreign_keys=[source_location_id], lazy="joined")
    destination_location: Mapped[Location | None] = relationship(
        foreign_keys=[destination_location_id], lazy="joined"
    )
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="joined")
    validated_by: Mapped[User | None] = relationship(foreign_keys=[validated_by_id], lazy="joined")
    canceled_by: Mapped[User | None] = relationship(foreign_keys=[canceled_by_id], lazy="joined")
    lines: Mapped[list["OperationLine"]] = relationship(
        back_populates="operation",
        cascade="all, delete-orphan",
        order_by="OperationLine.position",
        lazy="raise",
    )

    __table_args__ = (
        Index("ix_operations_type_status", "type", "status"),
        Index("ix_operations_created_by_id", "created_by_id"),
        Index("ix_operations_scheduled_date", "scheduled_date"),
        CheckConstraint(
            "(type <> 'transfer') OR (source_location_id IS NULL) OR (destination_location_id IS NULL) "
            "OR (source_location_id <> destination_location_id)",
            name="transfer_distinct_locations",
        ),
    )


class OperationLine(UUIDPk, Base):
    __tablename__ = "operation_lines"

    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operations.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    # Moves (receipt/delivery/transfer) require quantity > 0 (enforced in the service layer);
    # adjustment lines carry the *counted* quantity, which may legitimately be 0.
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    position: Mapped[int] = mapped_column(nullable=False, default=0)

    operation: Mapped[Operation] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("operation_id", "product_id", name="uq_operation_lines_operation_id_product_id"),
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        Index("ix_operation_lines_operation_id", "operation_id"),
    )

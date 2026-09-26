from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk
from app.db.models.location import Location
from app.db.models.product import Product


class Stock(UUIDPk, Timestamped, Base):
    """Quantity of a product at a location. The single source of truth for on-hand stock."""

    __tablename__ = "stock"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=Decimal("0"))

    product: Mapped[Product] = relationship(lazy="raise")
    location: Mapped[Location] = relationship(lazy="raise")

    __table_args__ = (
        UniqueConstraint("product_id", "location_id", name="uq_stock_product_id_location_id"),
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        Index("ix_stock_product_id", "product_id"),
        Index("ix_stock_location_id", "location_id"),
    )

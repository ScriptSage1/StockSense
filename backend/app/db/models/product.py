from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk


class Category(UUIDPk, Timestamped, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)


class Product(UUIDPk, Timestamped, Base):
    """Item definition. Quantity is never stored here — `stock` is the source of truth."""

    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False, default="unit")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    category: Mapped[Category | None] = relationship(lazy="joined")
    reorder_rules: Mapped[list["ReorderRule"]] = relationship(back_populates="product", lazy="raise")

    __table_args__ = (
        Index("ix_products_sku", "sku"),
        Index("ix_products_category_id", "category_id"),
    )


class ReorderRule(UUIDPk, Timestamped, Base):
    __tablename__ = "reorder_rules"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=True
    )
    reorder_point: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)

    product: Mapped[Product] = relationship(back_populates="reorder_rules")

    __table_args__ = (
        UniqueConstraint("product_id", "location_id", name="uq_reorder_rules_product_id_location_id",
                         postgresql_nulls_not_distinct=True),
        CheckConstraint("reorder_point >= 0", name="reorder_point_non_negative"),
    )

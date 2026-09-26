from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk
from app.db.models.warehouse import Warehouse


class Location(UUIDPk, Timestamped, Base):
    __tablename__ = "locations"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_code: Mapped[str] = mapped_column(String(20), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    warehouse: Mapped[Warehouse] = relationship(back_populates="locations", lazy="joined")

    __table_args__ = (
        UniqueConstraint("warehouse_id", "short_code", name="uq_locations_warehouse_id_short_code"),
        Index("ix_locations_warehouse_id", "warehouse_id"),
    )

    @property
    def full_code(self) -> str:
        return f"{self.warehouse.short_code}/{self.short_code}" if self.warehouse else self.short_code

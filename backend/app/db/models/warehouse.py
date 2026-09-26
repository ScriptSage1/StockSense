from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk

if TYPE_CHECKING:
    from app.db.models.location import Location


class Warehouse(UUIDPk, Timestamped, Base):
    __tablename__ = "warehouses"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    locations: Mapped[list["Location"]] = relationship(
        back_populates="warehouse", order_by="Location.name"
    )

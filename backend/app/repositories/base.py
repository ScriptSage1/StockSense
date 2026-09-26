"""Generic async CRUD base. Repositories contain SQLAlchemy queries only — no business rules,
no cache awareness."""

from __future__ import annotations

import uuid
from typing import Any, Generic, Sequence, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UniqueViolation
from app.db.base import Base

M = TypeVar("M", bound=Base)


def _unique_constraint_name(exc: IntegrityError) -> str | None:
    cause = getattr(exc.orig, "__cause__", None) or exc.orig
    sqlstate = getattr(cause, "sqlstate", None) or getattr(exc.orig, "sqlstate", None)
    if sqlstate != "23505":
        return None
    return getattr(cause, "constraint_name", None) or "unique"


class BaseRepository(Generic[M]):
    model: type[M]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, id_: uuid.UUID) -> M | None:
        return await self.session.get(self.model, id_)

    async def list(self, *, offset: int = 0, limit: int | None = None, order_by: Any = None) -> Sequence[M]:
        stmt = select(self.model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        if offset:
            stmt = stmt.offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        return (await self.session.scalars(stmt)).unique().all()

    async def create(self, obj: M) -> M:
        self.session.add(obj)
        await self.flush()
        return obj

    async def update(self, obj: M, values: dict[str, Any]) -> M:
        for key, value in values.items():
            setattr(obj, key, value)
        await self.flush()
        return obj

    async def reload(self, obj: M, *attrs: str) -> M:
        await self.session.refresh(obj, attribute_names=list(attrs) or None)
        return obj

    async def flush(self) -> None:
        try:
            await self.session.flush()
        except IntegrityError as exc:
            name = _unique_constraint_name(exc)
            if name is not None:
                raise UniqueViolation(name) from exc
            raise

    async def paginate(self, stmt: Select, *, page: int, page_size: int) -> tuple[Sequence[Any], int]:
        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        total = int((await self.session.execute(count_stmt)).scalar_one())
        rows = (
            await self.session.scalars(stmt.offset((page - 1) * page_size).limit(page_size))
        ).unique().all()
        return rows, total

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update

from app.db.models import OTPRecord
from app.repositories.base import BaseRepository


class OTPRepository(BaseRepository[OTPRecord]):
    model = OTPRecord

    async def invalidate_previous(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(OTPRecord)
            .where(OTPRecord.user_id == user_id, OTPRecord.is_used.is_(False))
            .values(is_used=True)
        )

    async def latest_active_for_update(self, user_id: uuid.UUID) -> OTPRecord | None:
        stmt = (
            select(OTPRecord)
            .where(OTPRecord.user_id == user_id, OTPRecord.is_used.is_(False))
            .order_by(OTPRecord.created_at.desc())
            .limit(1)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def count_created_since(self, user_id: uuid.UUID, since: datetime) -> int:
        stmt = select(func.count(OTPRecord.id)).where(
            OTPRecord.user_id == user_id, OTPRecord.created_at >= since
        )
        return int(await self.session.scalar(stmt) or 0)

    async def increment_attempts(self, record: OTPRecord) -> int:
        record.attempt_count = record.attempt_count + 1
        await self.flush()
        return record.attempt_count

    async def mark_used(self, record: OTPRecord) -> None:
        record.is_used = True
        await self.flush()

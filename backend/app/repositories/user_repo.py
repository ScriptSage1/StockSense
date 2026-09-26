from __future__ import annotations

import uuid
from datetime import datetime
from typing import Sequence

from sqlalchemy import func, select, update

from app.db.models import RefreshToken, User, UserRole
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(func.lower(User.email) == email.lower()))

    async def get_for_update(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(stmt)

    async def count(self) -> int:
        return int(await self.session.scalar(select(func.count(User.id))) or 0)

    async def list_all(self) -> Sequence[User]:
        return (await self.session.scalars(select(User).order_by(User.full_name))).all()

    async def list_active_managers(self) -> Sequence[User]:
        stmt = select(User).where(User.role == UserRole.manager, User.is_active.is_(True))
        return (await self.session.scalars(stmt)).all()

    async def lock_table_for_first_user(self) -> None:
        """Serialise concurrent registrations so exactly one 'first user' becomes manager."""
        await self.session.execute(select(func.pg_advisory_xact_lock(7_001_001)))

    # ---- refresh tokens
    async def add_refresh_token(self, token: RefreshToken) -> RefreshToken:
        self.session.add(token)
        await self.flush()
        return token

    async def get_refresh_token_for_update(self, token_hash: str) -> RefreshToken | None:
        stmt = (
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def revoke_refresh_token(self, token_hash: str, when: datetime) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=when)
        )

    async def revoke_all_refresh_tokens(self, user_id: uuid.UUID, when: datetime,
                                        except_hash: str | None = None) -> None:
        stmt = update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        if except_hash:
            stmt = stmt.where(RefreshToken.token_hash != except_hash)
        await self.session.execute(stmt.values(revoked_at=when))

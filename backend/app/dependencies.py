"""FastAPI dependencies: DB session, unit of work, current user, role guards, email service."""

from __future__ import annotations

import uuid
from typing import AsyncIterator, Awaitable, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_token
from app.db.base import SessionFactory
from app.db.models import User, UserRole
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_service import AuthService
from app.services.email_service import EmailService, build_email_service

_bearer = HTTPBearer(auto_error=False)
_email_service = build_email_service()


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return SessionFactory


async def get_db(factory: async_sessionmaker[AsyncSession] = Depends(get_session_factory)) -> AsyncIterator[AsyncSession]:
    async with factory() as session:
        try:
            yield session
        finally:
            if session.in_transaction():
                await session.rollback()


async def get_uow(session: AsyncSession = Depends(get_db)) -> UnitOfWork:
    return UnitOfWork(session)


def get_email_service() -> EmailService:
    return _email_service


UowFactory = Callable[[], Awaitable[tuple[UnitOfWork, Callable[[], Awaitable[None]]]]]


def get_background_uow_factory(
    factory: async_sessionmaker[AsyncSession] = Depends(get_session_factory),
) -> UowFactory:
    """Background tasks run after the response, so they get their own session."""

    async def make() -> tuple[UnitOfWork, Callable[[], Awaitable[None]]]:
        session = factory()
        return UnitOfWork(session), session.close

    return make


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    uow: UnitOfWork = Depends(get_uow),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise AuthenticationError()
    payload = decode_token(creds.credentials, "access")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError) as exc:
        raise AuthenticationError("Token is invalid", code="INVALID_TOKEN") from exc
    return await AuthService(uow).get_active_user(user_id)


def require_role(*roles: str) -> Callable[..., Awaitable[User]]:
    allowed = {UserRole(r) for r in roles}

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise PermissionDeniedError("Manager access required" if allowed == {UserRole.manager}
                                        else "You do not have permission to perform this action",
                                        code="MANAGER_REQUIRED" if allowed == {UserRole.manager} else "FORBIDDEN")
        return user

    return checker


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"

"""Authentication business logic: register, login, refresh, logout, OTP reset, profile."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta

from app.core import security
from app.core.cache import Cache, cache as default_cache
from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    OTPExpiredError,
    OTPMaxAttemptsError,
    PermissionDeniedError,
    RateLimitedError,
    UniqueViolation,
)
from app.core.logging import get_logger
from app.db.models import OTPRecord, RefreshToken, User, UserRole
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import RegisterRequest, RoleUpdate, UserUpdate

log = get_logger(__name__)


@dataclass(slots=True)
class Session:
    user: User
    access_token: str
    refresh_token: str | None  # raw value for the cookie; never persisted


@dataclass(slots=True)
class OTPDispatch:
    email: str
    otp: str


def _blacklist_key(jti: str) -> str:
    return f"bl:reset:{jti}"


class AuthService:
    def __init__(self, uow: UnitOfWork, cache: Cache = default_cache) -> None:
        self.uow = uow
        self.cache = cache

    # ------------------------------------------------------------------ helpers
    async def _issue_refresh(self, user: User, user_agent: str | None) -> str:
        raw = security.new_refresh_token()
        now = security.utcnow()
        await self.uow.users.add_refresh_token(
            RefreshToken(
                user_id=user.id,
                token_hash=security.hash_refresh_token(raw),
                created_at=now,
                expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        return raw

    # ------------------------------------------------------------------ register / login
    async def register(self, data: RegisterRequest, user_agent: str | None = None) -> Session:
        email = data.email.lower()
        async with self.uow.transaction():
            await self.uow.users.lock_table_for_first_user()
            if await self.uow.users.get_by_email(email):
                raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN", field="email")
            # The first account bootstraps the workspace as a manager; everyone else joins as staff
            # and can be promoted by a manager.
            role = UserRole.manager if await self.uow.users.count() == 0 else UserRole.staff
            user = User(full_name=data.full_name, email=email, password_hash=security.hash_password(data.password),
                        role=role, is_active=True)
            try:
                await self.uow.users.create(user)
            except UniqueViolation as exc:
                raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN",
                                    field="email") from exc
            raw = await self._issue_refresh(user, user_agent)
        log.info("auth.registered", user_id=str(user.id), role=role.value)
        return Session(user, security.create_access_token(user.id, user.role.value), raw)

    async def login(self, email: str, password: str, user_agent: str | None = None) -> Session:
        user = await self.uow.users.get_by_email(email.lower())
        if user is None:
            security.burn_hash_time()
            raise AuthenticationError("Invalid email or password", code="INVALID_CREDENTIALS")
        if not security.verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password", code="INVALID_CREDENTIALS")
        if not user.is_active:
            raise PermissionDeniedError("This account is disabled", code="ACCOUNT_DISABLED")
        async with self.uow.transaction():
            raw = await self._issue_refresh(user, user_agent)
        log.info("auth.login", user_id=str(user.id))
        return Session(user, security.create_access_token(user.id, user.role.value), raw)

    async def refresh(self, raw_token: str | None) -> Session:
        if not raw_token:
            raise AuthenticationError("Session expired. Sign in again.", code="REFRESH_INVALID")
        async with self.uow.transaction():
            record = await self.uow.users.get_refresh_token_for_update(security.hash_refresh_token(raw_token))
            now = security.utcnow()
            if record is None or record.revoked_at is not None or record.expires_at <= now:
                raise AuthenticationError("Session expired. Sign in again.", code="REFRESH_INVALID")
            user = await self.uow.users.get(record.user_id)
            if user is None or not user.is_active:
                raise AuthenticationError("Session expired. Sign in again.", code="REFRESH_INVALID")
        return Session(user, security.create_access_token(user.id, user.role.value), None)

    async def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        async with self.uow.transaction():
            await self.uow.users.revoke_refresh_token(security.hash_refresh_token(raw_token), security.utcnow())

    async def get_active_user(self, user_id: uuid.UUID) -> User:
        user = await self.uow.users.get(user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account not available", code="INVALID_TOKEN")
        return user

    # ------------------------------------------------------------------ OTP password reset
    async def _otp_requests_in_window(self, email: str, user: User | None) -> int:
        count = await self.cache.incr_window(f"rl:otp:{email}", 3600)
        if count is not None:
            return count
        # Redis unavailable: fall back to PostgreSQL (OTP records created in the last hour).
        if user is None:
            return 0
        since = security.utcnow() - timedelta(hours=1)
        return await self.uow.otps.count_created_since(user.id, since) + 1

    async def request_password_reset(self, email: str) -> OTPDispatch | None:
        """Always succeeds from the caller's perspective (no account enumeration).
        Returns the OTP to email, or None when there is nothing to send."""
        email = email.lower()
        user = await self.uow.users.get_by_email(email)
        if await self._otp_requests_in_window(email, user) > settings.OTP_REQUEST_RATE_PER_HOUR:
            raise RateLimitedError("Too many reset requests. Try again later.")
        if user is None or not user.is_active:
            security.burn_hash_time()
            return None
        otp = security.generate_otp()
        async with self.uow.transaction():
            await self.uow.otps.invalidate_previous(user.id)
            await self.uow.otps.create(
                OTPRecord(
                    user_id=user.id,
                    otp_hash=security.hash_password(otp),
                    expires_at=security.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
                )
            )
        log.info("auth.otp_issued", user_id=str(user.id))
        return OTPDispatch(user.email, otp)

    async def verify_otp(self, email: str, otp: str) -> str:
        invalid = BusinessRuleError("Invalid or expired code", code="OTP_INVALID", field="otp")
        user = await self.uow.users.get_by_email(email.lower())
        if user is None or not user.is_active:
            security.burn_hash_time()
            raise invalid

        outcome: str
        remaining = 0
        async with self.uow.transaction():
            record = await self.uow.otps.latest_active_for_update(user.id)
            if record is None:
                outcome = "invalid"
            elif record.expires_at <= security.utcnow():
                await self.uow.otps.mark_used(record)
                outcome = "expired"
            elif record.attempt_count >= settings.OTP_MAX_ATTEMPTS:
                await self.uow.otps.mark_used(record)
                outcome = "max"
            elif not security.verify_password(otp, record.otp_hash):
                attempts = await self.uow.otps.increment_attempts(record)
                remaining = settings.OTP_MAX_ATTEMPTS - attempts
                if remaining <= 0:
                    await self.uow.otps.mark_used(record)
                    outcome = "max"
                else:
                    outcome = "wrong"
            else:
                await self.uow.otps.mark_used(record)
                outcome = "ok"
        # Raise only after the transaction commits so attempt counts persist.
        if outcome == "expired":
            raise OTPExpiredError(field="otp")
        if outcome == "max":
            raise OTPMaxAttemptsError(field="otp")
        if outcome == "wrong":
            raise BusinessRuleError(
                f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
                code="OTP_INVALID", field="otp", extra={"remaining_attempts": remaining},
            )
        if outcome == "invalid":
            raise invalid
        token, _ = security.create_reset_token(user.id, security.password_fingerprint(user.password_hash))
        return token

    async def reset_password(self, reset_token: str, new_password: str) -> None:
        invalid = BusinessRuleError("Reset link is invalid or has already been used. Start again.",
                                    code="RESET_TOKEN_INVALID")
        try:
            payload = security.decode_token(reset_token, "reset")
        except AuthenticationError as exc:
            raise invalid from exc
        jti = str(payload.get("jti", ""))
        if not jti or await self.cache.exists(_blacklist_key(jti)):
            raise invalid
        async with self.uow.transaction():
            user = await self.uow.users.get_for_update(uuid.UUID(payload["sub"]))
            if user is None:
                raise invalid
            # Single use even if Redis is down: the token is bound to the password it replaces.
            if payload.get("pwf") != security.password_fingerprint(user.password_hash):
                raise invalid
            user.password_hash = security.hash_password(new_password)
            await self.uow.users.flush()
            await self.uow.users.revoke_all_refresh_tokens(user.id, security.utcnow())
            await self.uow.otps.invalidate_previous(user.id)
        await self.cache.mark(_blacklist_key(jti), settings.RESET_TOKEN_EXPIRE_MINUTES * 60 + 60)
        log.info("auth.password_reset", user_id=str(user.id))

    # ------------------------------------------------------------------ profile / users
    async def update_profile(self, user: User, data: UserUpdate, user_agent: str | None = None
                             ) -> tuple[User, str | None]:
        """Returns the updated user and, after a password change, a fresh refresh token for the
        current session (every other session is revoked)."""
        new_refresh: str | None = None
        async with self.uow.transaction():
            fresh = await self.uow.users.get(user.id)
            if fresh is None:
                raise NotFoundError("User not found")
            if data.full_name is not None:
                fresh.full_name = " ".join(data.full_name.split())
            if data.new_password:
                if not data.current_password or not security.verify_password(data.current_password, fresh.password_hash):
                    raise BusinessRuleError("Current password is incorrect", code="INVALID_PASSWORD",
                                            field="current_password")
                fresh.password_hash = security.hash_password(data.new_password)
                # Sign out every session, then re-issue one for the caller so they stay signed in.
                await self.uow.users.revoke_all_refresh_tokens(fresh.id, security.utcnow())
                new_refresh = await self._issue_refresh(fresh, user_agent)
            await self.uow.users.flush()
        return fresh, new_refresh

    async def list_users(self) -> list[User]:
        return list(await self.uow.users.list_all())

    async def update_user(self, actor: User, user_id: uuid.UUID, data: RoleUpdate) -> User:
        async with self.uow.transaction():
            target = await self.uow.users.get(user_id)
            if target is None:
                raise NotFoundError("User not found")
            if target.id == actor.id and (
                (data.role is not None and data.role != target.role.value) or data.is_active is False
            ):
                raise BusinessRuleError("You cannot change your own role or disable yourself", code="SELF_CHANGE")
            if data.role is not None:
                target.role = UserRole(data.role)
            if data.is_active is not None:
                target.is_active = data.is_active
                if not data.is_active:
                    await self.uow.users.revoke_all_refresh_tokens(target.id, security.utcnow())
            await self.uow.users.flush()
        return target

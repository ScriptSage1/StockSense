"""Authentication business logic: register and login (both finished with an emailed code),
refresh, logout, OTP password reset, OTP-confirmed password change, profile."""

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

PURPOSE_RESET = "password_reset"
PURPOSE_LOGIN = "login"
PURPOSE_REGISTER = "register"
PURPOSE_PASSWORD_CHANGE = "password_change"


@dataclass(slots=True)
class Session:
    user: User
    access_token: str
    refresh_token: str | None  # raw value for the cookie; never persisted


@dataclass(slots=True)
class Challenge:
    """A pending one-time-code step. `otp` is the raw code to email; it is never sent to clients."""

    user: User
    purpose: str
    token: str
    otp: str


@dataclass(slots=True)
class OTPDispatch:
    email: str
    otp: str


def _blacklist_key(jti: str) -> str:
    return f"bl:reset:{jti}"


def _challenge_invalid() -> BusinessRuleError:
    return BusinessRuleError("This verification step has expired. Start again.", code="CHALLENGE_INVALID")


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

    # ------------------------------------------------------------------ register / login (step 1)
    async def register(self, data: RegisterRequest) -> Challenge:
        """Creates the account unverified and emails a code. Nothing can be done with the account
        until the code is confirmed through verify_challenge()."""
        email = data.email.lower()
        await self._enforce_otp_rate(email, None, PURPOSE_REGISTER)
        async with self.uow.transaction():
            existing = await self.uow.users.get_by_email(email)
            if existing is not None and existing.email_verified_at is not None:
                raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN", field="email")
            if existing is not None:
                # An earlier sign-up never confirmed the address; whoever proves ownership now takes it.
                existing.full_name = data.full_name
                existing.password_hash = security.hash_password(data.password)
                await self.uow.users.flush()
                user = existing
            else:
                # Everyone joins as staff; the first account to *verify* is promoted to manager.
                user = User(full_name=data.full_name, email=email, password_hash=security.hash_password(data.password),
                            role=UserRole.staff, is_active=True)
                try:
                    await self.uow.users.create(user)
                except UniqueViolation as exc:
                    raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN",
                                        field="email") from exc
            otp = await self._issue_otp(user, PURPOSE_REGISTER)
        log.info("auth.registration_started", user_id=str(user.id))
        return self._challenge(user, PURPOSE_REGISTER, otp)

    async def login(self, email: str, password: str) -> Challenge:
        """Checks the password, then emails a sign-in code. No session exists until it is verified."""
        user = await self.uow.users.get_by_email(email.lower())
        if user is None:
            security.burn_hash_time()
            raise AuthenticationError("Invalid email or password", code="INVALID_CREDENTIALS")
        if not security.verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password", code="INVALID_CREDENTIALS")
        if not user.is_active:
            raise PermissionDeniedError("This account is disabled", code="ACCOUNT_DISABLED")
        # An account that never confirmed its email finishes sign-up instead.
        purpose = PURPOSE_LOGIN if user.email_verified_at is not None else PURPOSE_REGISTER
        await self._enforce_otp_rate(user.email, user, purpose)
        async with self.uow.transaction():
            otp = await self._issue_otp(user, purpose)
        log.info("auth.login_challenge", user_id=str(user.id), purpose=purpose)
        return self._challenge(user, purpose, otp)

    # ------------------------------------------------------------------ OTP challenge (step 2)
    async def verify_challenge(self, token: str, otp: str, user_agent: str | None = None) -> Session:
        user, purpose = await self._decode_challenge(token, {PURPOSE_LOGIN, PURPOSE_REGISTER})
        await self._consume_otp(user, purpose, otp)
        async with self.uow.transaction():
            fresh = await self.uow.users.get_for_update(user.id)
            if fresh is None or not fresh.is_active:
                raise _challenge_invalid()
            if fresh.email_verified_at is None:
                # Serialise so exactly one "first verified user" becomes the workspace manager.
                await self.uow.users.lock_table_for_first_user()
                fresh.email_verified_at = security.utcnow()
                if await self.uow.users.count_verified(exclude_id=fresh.id) == 0:
                    fresh.role = UserRole.manager
                await self.uow.users.flush()
                log.info("auth.registered", user_id=str(fresh.id), role=fresh.role.value)
            raw = await self._issue_refresh(fresh, user_agent)
        log.info("auth.login", user_id=str(fresh.id))
        return Session(fresh, security.create_access_token(fresh.id, fresh.role.value), raw)

    async def resend_challenge(self, token: str) -> Challenge:
        user, purpose = await self._decode_challenge(
            token, {PURPOSE_LOGIN, PURPOSE_REGISTER, PURPOSE_PASSWORD_CHANGE}
        )
        last = await self.uow.otps.latest_created_at(user.id, purpose)
        if last is not None:
            wait = settings.OTP_RESEND_COOLDOWN_SECONDS - int((security.utcnow() - last).total_seconds())
            if wait > 0:
                raise RateLimitedError(f"Wait {wait}s before asking for another code.",
                                       code="OTP_COOLDOWN", extra={"retry_after": wait})
        await self._enforce_otp_rate(user.email, user, purpose)
        async with self.uow.transaction():
            otp = await self._issue_otp(user, purpose)
        return self._challenge(user, purpose, otp)

    # ------------------------------------------------------------------ sessions
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

    # ------------------------------------------------------------------ OTP primitives
    def _challenge(self, user: User, purpose: str, otp: str) -> Challenge:
        token = security.create_challenge_token(user.id, purpose, security.password_fingerprint(user.password_hash))
        return Challenge(user, purpose, token, otp)

    async def _decode_challenge(self, token: str, allowed: set[str]) -> tuple[User, str]:
        try:
            payload = security.decode_token(token, "otp_challenge")
            user_id = uuid.UUID(str(payload["sub"]))
        except (AuthenticationError, ValueError) as exc:
            raise _challenge_invalid() from exc
        purpose = str(payload.get("purpose", ""))
        if purpose not in allowed:
            raise _challenge_invalid()
        user = await self.uow.users.get(user_id)
        if user is None or not user.is_active:
            raise _challenge_invalid()
        # Changing the password (or re-registering) retires every pending challenge.
        if payload.get("pwf") != security.password_fingerprint(user.password_hash):
            raise _challenge_invalid()
        return user, purpose

    async def _otp_requests_in_window(self, email: str, user: User | None, purpose: str) -> int:
        key = f"rl:otp:{email}" if purpose == PURPOSE_RESET else f"rl:otp:{purpose}:{email}"
        count = await self.cache.incr_window(key, 3600)
        if count is not None:
            return count
        # Redis unavailable: fall back to PostgreSQL (OTP records created in the last hour).
        if user is None:
            return 0
        since = security.utcnow() - timedelta(hours=1)
        return await self.uow.otps.count_created_since(user.id, since, purpose) + 1

    async def _enforce_otp_rate(self, email: str, user: User | None, purpose: str) -> None:
        limit = settings.OTP_REQUEST_RATE_PER_HOUR if purpose == PURPOSE_RESET else settings.OTP_AUTH_RATE_PER_HOUR
        if await self._otp_requests_in_window(email.lower(), user, purpose) > limit:
            raise RateLimitedError("Too many codes requested. Try again later.")

    async def _issue_otp(self, user: User, purpose: str) -> str:
        """Replaces any unused code for this purpose. Call inside a transaction."""
        otp = security.generate_otp()
        await self.uow.otps.invalidate_previous(user.id, purpose)
        await self.uow.otps.create(
            OTPRecord(
                user_id=user.id,
                purpose=purpose,
                otp_hash=security.hash_password(otp),
                expires_at=security.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
            )
        )
        log.info("auth.otp_issued", user_id=str(user.id), purpose=purpose)
        return otp

    async def _consume_otp(self, user: User, purpose: str, otp: str) -> None:
        """Checks a code: counts wrong attempts, burns it on success, expiry or lockout."""
        outcome: str
        remaining = 0
        async with self.uow.transaction():
            record = await self.uow.otps.latest_active_for_update(user.id, purpose)
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
            raise BusinessRuleError("Invalid or expired code", code="OTP_INVALID", field="otp")

    # ------------------------------------------------------------------ OTP password reset
    async def request_password_reset(self, email: str) -> OTPDispatch | None:
        """Always succeeds from the caller's perspective (no account enumeration).
        Returns the OTP to email, or None when there is nothing to send."""
        email = email.lower()
        user = await self.uow.users.get_by_email(email)
        await self._enforce_otp_rate(email, user, PURPOSE_RESET)
        if user is None or not user.is_active:
            security.burn_hash_time()
            return None
        async with self.uow.transaction():
            otp = await self._issue_otp(user, PURPOSE_RESET)
        return OTPDispatch(user.email, otp)

    async def verify_otp(self, email: str, otp: str) -> str:
        user = await self.uow.users.get_by_email(email.lower())
        if user is None or not user.is_active:
            security.burn_hash_time()
            raise BusinessRuleError("Invalid or expired code", code="OTP_INVALID", field="otp")
        await self._consume_otp(user, PURPOSE_RESET, otp)
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
            # Resetting via an emailed code also proves the address.
            if user.email_verified_at is None:
                user.email_verified_at = security.utcnow()
            await self.uow.users.flush()
            await self.uow.users.revoke_all_refresh_tokens(user.id, security.utcnow())
            await self.uow.otps.invalidate_previous(user.id)
        await self.cache.mark(_blacklist_key(jti), settings.RESET_TOKEN_EXPIRE_MINUTES * 60 + 60)
        log.info("auth.password_reset", user_id=str(user.id))

    # ------------------------------------------------------------------ profile / password change
    async def update_profile(self, user: User, data: UserUpdate) -> User:
        async with self.uow.transaction():
            fresh = await self.uow.users.get(user.id)
            if fresh is None:
                raise NotFoundError("User not found")
            if data.full_name is not None:
                fresh.full_name = " ".join(data.full_name.split())
            await self.uow.users.flush()
        return fresh

    async def start_password_change(self, user: User, current_password: str) -> Challenge:
        fresh = await self.uow.users.get(user.id)
        if fresh is None:
            raise NotFoundError("User not found")
        if not security.verify_password(current_password, fresh.password_hash):
            raise BusinessRuleError("Current password is incorrect", code="INVALID_PASSWORD", field="current_password")
        await self._enforce_otp_rate(fresh.email, fresh, PURPOSE_PASSWORD_CHANGE)
        async with self.uow.transaction():
            otp = await self._issue_otp(fresh, PURPOSE_PASSWORD_CHANGE)
        return self._challenge(fresh, PURPOSE_PASSWORD_CHANGE, otp)

    async def confirm_password_change(self, user: User, token: str, otp: str, new_password: str,
                                      user_agent: str | None = None) -> tuple[User, str]:
        """Returns the user and a fresh refresh token for the current session (every other
        session is revoked)."""
        target, _ = await self._decode_challenge(token, {PURPOSE_PASSWORD_CHANGE})
        if target.id != user.id:
            raise _challenge_invalid()
        await self._consume_otp(target, PURPOSE_PASSWORD_CHANGE, otp)
        async with self.uow.transaction():
            fresh = await self.uow.users.get_for_update(target.id)
            if fresh is None:
                raise NotFoundError("User not found")
            fresh.password_hash = security.hash_password(new_password)
            await self.uow.users.flush()
            # Sign out every session, then re-issue one for the caller so they stay signed in.
            await self.uow.users.revoke_all_refresh_tokens(fresh.id, security.utcnow())
            await self.uow.otps.invalidate_previous(fresh.id)
            new_refresh = await self._issue_refresh(fresh, user_agent)
        log.info("auth.password_changed", user_id=str(fresh.id))
        return fresh, new_refresh

    # ------------------------------------------------------------------ users
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

"""Password hashing, JWT encode/decode, refresh-token and OTP primitives."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import AuthenticationError

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=settings.BCRYPT_ROUNDS)

# A precomputed hash used to equalise timing when a user does not exist.
_DUMMY_HASH = _pwd.hash("stocksense-timing-equaliser")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- passwords / OTP
def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _pwd.verify(raw, hashed)
    except (ValueError, TypeError):
        return False


def burn_hash_time() -> None:
    """Spend the same CPU as a real verify so response timing does not leak account existence."""
    _pwd.verify("not-the-password", _DUMMY_HASH)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def password_fingerprint(password_hash: str) -> str:
    """Short keyed digest of the current password hash; changes whenever the password changes."""
    return hmac.new(settings.SECRET_KEY.encode(), password_hash.encode(), hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------- refresh tokens
def new_refresh_token() -> str:
    return str(uuid.uuid4())


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- JWT
def _encode(claims: dict[str, Any], expires: timedelta) -> str:
    now = utcnow()
    payload = {**claims, "iat": int(now.timestamp()), "exp": int((now + expires).timestamp())}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    return _encode(
        {"sub": str(user_id), "role": role, "type": "access", "jti": uuid.uuid4().hex},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_reset_token(user_id: uuid.UUID, pwd_fingerprint: str) -> tuple[str, str]:
    jti = uuid.uuid4().hex
    token = _encode(
        {"sub": str(user_id), "type": "reset", "jti": jti, "pwf": pwd_fingerprint},
        timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
    )
    return token, jti


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        code = "TOKEN_EXPIRED" if "expired" in str(exc).lower() else "INVALID_TOKEN"
        raise AuthenticationError("Token is invalid or expired", code=code) from exc
    if payload.get("type") != expected_type or "sub" not in payload:
        raise AuthenticationError("Token is invalid", code="INVALID_TOKEN")
    return payload

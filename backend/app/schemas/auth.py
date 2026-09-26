from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import Schema

_PASSWORD_RULE = "Password must be at least 8 characters and include a letter and a number"


def _check_password(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError(_PASSWORD_RULE)
    return v


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(max_length=128)

    @field_validator("full_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Enter your full name")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(Schema):
    id: uuid.UUID
    full_name: str
    email: str
    role: Literal["manager", "staff"]
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


class VerifyOTPResponse(BaseModel):
    reset_token: str
    expires_in: int


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(min_length=10)
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    current_password: str | None = Field(default=None, max_length=128)
    new_password: str | None = Field(default=None, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str | None) -> str | None:
        return None if v is None else _check_password(v)


class RoleUpdate(BaseModel):
    role: Literal["manager", "staff"] | None = None
    is_active: bool | None = None

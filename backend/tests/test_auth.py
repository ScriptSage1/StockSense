from __future__ import annotations

import re
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.db.models import OTPRecord
from tests.conftest import PASSWORD, auth, register

pytestmark = pytest.mark.asyncio

COOKIE = settings.REFRESH_COOKIE_NAME


async def test_register_first_user_is_manager_and_sets_cookie(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register",
                          json={"full_name": "First Person", "email": "First@StockSense.dev", "password": PASSWORD})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["role"] == "manager"
    assert body["user"]["email"] == "first@stocksense.dev"
    assert body["token_type"] == "bearer" and body["expires_in"] == 30 * 60
    cookie = r.headers["set-cookie"]
    assert f"{COOKIE}=" in cookie
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie.replace("Strict", "strict")
    assert "Path=/api/v1/auth" in cookie


async def test_second_user_is_staff_and_duplicate_email_conflicts(client: httpx.AsyncClient, manager: dict) -> None:
    client.cookies.clear()
    staff = await register(client, "someone@stocksense.dev")
    assert staff["user"]["role"] == "staff"
    r = await client.post("/api/v1/auth/register",
                          json={"full_name": "Dup", "email": "someone@stocksense.dev", "password": PASSWORD})
    assert r.status_code == 409
    assert r.json()["code"] == "EMAIL_TAKEN"


async def test_register_validation_is_normalised(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={"full_name": "X Y", "email": "bad", "password": "short"})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["field"] in {"email", "password"}
    assert {e["field"] for e in body["errors"]} == {"email", "password"}


async def test_login_success_and_failure(client: httpx.AsyncClient, manager: dict) -> None:
    ok = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["user"]["role"] == "manager"
    bad = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": "nope-123"})
    assert bad.status_code == 401 and bad.json()["code"] == "INVALID_CREDENTIALS"
    unknown = await client.post("/api/v1/auth/login", json={"email": "ghost@stocksense.dev", "password": "nope-123"})
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]


async def test_login_rate_limited(client: httpx.AsyncClient, manager: dict) -> None:
    codes = []
    for _ in range(settings.LOGIN_RATE_PER_15_MIN + 1):
        r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": "wrong-123"})
        codes.append(r.status_code)
    assert codes[-1] == 429


async def test_protected_route_requires_token(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401 and r.json()["code"] == "NOT_AUTHENTICATED"
    r = await client.get("/api/v1/users/me", headers=auth("garbage"))
    assert r.status_code == 401


async def test_refresh_uses_cookie_and_checks_origin(client: httpx.AsyncClient, manager: dict) -> None:
    await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    r = await client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    new_token = r.json()["access_token"]
    me = await client.get("/api/v1/users/me", headers=auth(new_token))
    assert me.status_code == 200 and me.json()["email"] == "manager@stocksense.dev"

    evil = await client.post("/api/v1/auth/refresh", headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403 and evil.json()["code"] == "ORIGIN_NOT_ALLOWED"

    client.cookies.clear()
    missing = await client.post("/api/v1/auth/refresh")
    assert missing.status_code == 401 and missing.json()["code"] == "REFRESH_INVALID"


async def test_logout_revokes_refresh_token(client: httpx.AsyncClient, manager: dict) -> None:
    login = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    raw = client.cookies.get(COOKIE)
    token = login.json()["access_token"]
    out = await client.post("/api/v1/auth/logout", headers=auth(token))
    assert out.status_code == 200
    client.cookies.set(COOKIE, raw)  # replay the old cookie
    again = await client.post("/api/v1/auth/refresh")
    assert again.status_code == 401


async def _request_otp(client: httpx.AsyncClient, mailbox, email: str) -> str:
    r = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    return re.search(r"\b(\d{6})\b", mailbox.sent[-1].text).group(1)


async def test_forgot_password_never_enumerates(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    known = await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@stocksense.dev"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(mailbox.sent) == 1 and mailbox.sent[0].to == "manager@stocksense.dev"


async def test_otp_flow_success_resets_password_and_revokes_sessions(client: httpx.AsyncClient, manager: dict,
                                                                     mailbox) -> None:
    await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    old_cookie = client.cookies.get(COOKIE)

    otp = await _request_otp(client, mailbox, "manager@stocksense.dev")
    v = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": otp})
    assert v.status_code == 200
    reset_token = v.json()["reset_token"]

    r = await client.post("/api/v1/auth/reset-password", json={"reset_token": reset_token, "new_password": "N3wPassword"})
    assert r.status_code == 200
    # single use
    again = await client.post("/api/v1/auth/reset-password", json={"reset_token": reset_token, "new_password": "An0therOne"})
    assert again.status_code == 400 and again.json()["code"] == "RESET_TOKEN_INVALID"
    # old sessions revoked
    client.cookies.set(COOKIE, old_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    # new password works
    ok = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": "N3wPassword"})
    assert ok.status_code == 200


async def test_otp_expired_returns_400(client: httpx.AsyncClient, manager: dict, mailbox, db_session) -> None:
    otp = await _request_otp(client, mailbox, "manager@stocksense.dev")
    await db_session.execute(update(OTPRecord).values(expires_at=OTPRecord.expires_at - timedelta(minutes=30)))
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": otp})
    assert r.status_code == 400 and r.json()["code"] == "OTP_EXPIRED"


async def test_otp_max_attempts_returns_429(client: httpx.AsyncClient, manager: dict, mailbox, db_session) -> None:
    otp = await _request_otp(client, mailbox, "manager@stocksense.dev")
    wrong = "000000" if otp != "000000" else "111111"
    for _ in range(settings.OTP_MAX_ATTEMPTS - 1):
        r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": wrong})
        assert r.status_code == 400 and r.json()["code"] == "OTP_INVALID"
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": wrong})
    assert r.status_code == 429 and r.json()["code"] == "OTP_MAX_ATTEMPTS"
    # even the right code is now refused
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": otp})
    assert r.status_code in (400, 429)
    record = (await db_session.scalars(select(OTPRecord))).first()
    assert record.otp_hash != otp  # stored hashed


async def test_otp_request_rate_limit(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    for _ in range(settings.OTP_REQUEST_RATE_PER_HOUR):
        assert (await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})).status_code == 200
    r = await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})
    assert r.status_code == 429


async def test_profile_update_and_password_change(client: httpx.AsyncClient, manager: dict) -> None:
    h = manager["headers"]
    r = await client.put("/api/v1/users/me", headers=h, json={"full_name": "Maya  Lead"})
    assert r.status_code == 200 and r.json()["full_name"] == "Maya Lead"
    bad = await client.put("/api/v1/users/me", headers=h,
                           json={"current_password": "wrong-pass1", "new_password": "Brand1New"})
    assert bad.status_code == 400 and bad.json()["code"] == "INVALID_PASSWORD"
    ok = await client.put("/api/v1/users/me", headers=h, json={"current_password": PASSWORD, "new_password": "Brand1New"})
    assert ok.status_code == 200


async def test_manager_can_promote_staff(client: httpx.AsyncClient, manager: dict, staff: dict) -> None:
    denied = await client.get("/api/v1/users", headers=staff["headers"])
    assert denied.status_code == 403
    r = await client.put(f"/api/v1/users/{staff['user']['id']}", headers=manager["headers"], json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    self_change = await client.put(f"/api/v1/users/{manager['user']['id']}", headers=manager["headers"],
                                   json={"role": "staff"})
    assert self_change.status_code == 400

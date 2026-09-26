from __future__ import annotations

import re
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.db.models import OTPRecord, User
from tests.conftest import PASSWORD, auth, last_code, login, register, verify

pytestmark = pytest.mark.asyncio

COOKIE = settings.REFRESH_COOKIE_NAME


def code_in(mail) -> str:
    return re.search(r"\b(\d{6})\b", mail.text).group(1)


def wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


# ---------------------------------------------------------------------------- registration
async def test_register_needs_the_emailed_code_and_first_user_becomes_manager(client: httpx.AsyncClient,
                                                                             mailbox) -> None:
    r = await client.post("/api/v1/auth/register",
                          json={"full_name": "First Person", "email": "First@StockSense.dev", "password": PASSWORD})
    assert r.status_code == 202
    challenge = r.json()
    assert challenge["purpose"] == "register" and challenge["email"] == "first@stocksense.dev"
    assert "access_token" not in challenge and COOKIE not in r.headers.get("set-cookie", "")
    # The code only goes out by email; it is never part of the response.
    assert mailbox.sent[-1].to == "first@stocksense.dev" and "Confirm" in mailbox.sent[-1].subject
    assert "dev_code" not in challenge and code_in(mailbox.sent[-1]) not in r.text

    v = await verify(client, challenge)
    assert v.status_code == 200
    body = v.json()
    assert body["user"]["role"] == "manager"
    assert body["user"]["email"] == "first@stocksense.dev"
    assert body["token_type"] == "bearer" and body["expires_in"] == 30 * 60
    cookie = v.headers["set-cookie"]
    assert f"{COOKIE}=" in cookie
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie.replace("Strict", "strict")
    assert "Path=/api/v1/auth" in cookie


async def test_unverified_signup_does_not_claim_manager_or_the_email(client: httpx.AsyncClient,
                                                                    db_session) -> None:
    # Someone starts a sign-up and never confirms it…
    first = await client.post("/api/v1/auth/register",
                              json={"full_name": "Squatter", "email": "boss@stocksense.dev", "password": PASSWORD})
    assert first.status_code == 202
    # …so the first *verified* account becomes the manager.
    other = await register(client, "real@stocksense.dev", "Real Owner")
    assert other["user"]["role"] == "manager"
    # The real owner of the unconfirmed address can still sign up (and it is not listed as a member).
    client.cookies.clear()
    retry = await client.post("/api/v1/auth/register",
                              json={"full_name": "Boss", "email": "boss@stocksense.dev", "password": "Differ3nt"})
    assert retry.status_code == 202
    # The squatter's challenge died with the password it was bound to.
    stale = await verify(client, first.json())
    assert stale.status_code == 400 and stale.json()["code"] == "CHALLENGE_INVALID"
    ok = await verify(client, retry.json())
    assert ok.status_code == 200 and ok.json()["user"]["full_name"] == "Boss"
    assert ok.json()["user"]["role"] == "staff"
    users = (await db_session.scalars(select(User))).all()
    assert all(u.email_verified_at is not None for u in users)


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


# ---------------------------------------------------------------------------- login
async def test_login_needs_password_then_code(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    client.cookies.clear()
    r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    assert r.status_code == 200
    challenge = r.json()
    assert challenge["purpose"] == "login" and "access_token" not in challenge
    assert COOKIE not in r.headers.get("set-cookie", "")
    assert "sign-in" in mailbox.sent[-1].subject

    code = code_in(mailbox.sent[-1])
    bad = await verify(client, challenge, wrong(code))
    assert bad.status_code == 400 and bad.json()["code"] == "OTP_INVALID"
    assert bad.json()["remaining_attempts"] == settings.OTP_MAX_ATTEMPTS - 1

    ok = await verify(client, challenge, code)
    assert ok.status_code == 200 and ok.json()["user"]["role"] == "manager"
    assert f"{COOKIE}=" in ok.headers["set-cookie"]
    # Codes are single use.
    replay = await verify(client, challenge, code)
    assert replay.status_code == 400 and replay.json()["code"] == "OTP_INVALID"


async def test_login_rejects_bad_credentials_without_sending_a_code(client: httpx.AsyncClient, manager: dict,
                                                                  mailbox) -> None:
    sent = len(mailbox.sent)
    bad = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": "nope-123"})
    assert bad.status_code == 401 and bad.json()["code"] == "INVALID_CREDENTIALS"
    unknown = await client.post("/api/v1/auth/login", json={"email": "ghost@stocksense.dev", "password": "nope-123"})
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]
    assert len(mailbox.sent) == sent


async def test_login_rate_limited(client: httpx.AsyncClient, manager: dict) -> None:
    codes = []
    for _ in range(settings.LOGIN_RATE_PER_15_MIN + 1):
        r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": "wrong-123"})
        codes.append(r.status_code)
    assert codes[-1] == 429


async def test_challenge_token_is_tamper_proof_and_purpose_bound(client: httpx.AsyncClient, manager: dict) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    challenge = r.json()
    forged = await client.post("/api/v1/auth/otp/verify",
                               json={"challenge_token": challenge["challenge_token"] + "x", "otp": last_code(client)})
    assert forged.status_code == 400 and forged.json()["code"] == "CHALLENGE_INVALID"
    # A password-change challenge can't be spent as a sign-in.
    pw = await client.post("/api/v1/users/me/password/otp", headers=manager["headers"],
                           json={"current_password": PASSWORD})
    cross = await verify(client, pw.json())
    assert cross.status_code == 400 and cross.json()["code"] == "CHALLENGE_INVALID"


async def test_resend_has_a_cooldown_and_replaces_the_code(client: httpx.AsyncClient, manager: dict,
                                                          db_session) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    first = r.json()
    first_code = last_code(client)
    too_soon = await client.post("/api/v1/auth/otp/resend", json={"challenge_token": first["challenge_token"]})
    assert too_soon.status_code == 429 and too_soon.json()["code"] == "OTP_COOLDOWN"
    # Pretend the cooldown passed.
    await db_session.execute(update(OTPRecord).values(created_at=OTPRecord.created_at - timedelta(minutes=1)))
    again = await client.post("/api/v1/auth/otp/resend", json={"challenge_token": first["challenge_token"]})
    assert again.status_code == 200
    second = again.json()
    second_code = last_code(client)
    if second_code != first_code:
        old = await verify(client, second, first_code)
        assert old.status_code == 400
    assert (await verify(client, second, second_code)).status_code == 200


async def test_codes_are_never_returned_by_the_api(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    assert r.status_code == 200 and code_in(mailbox.sent[-1]) not in r.text
    resend_wait = await client.post("/api/v1/auth/otp/resend", json={"challenge_token": r.json()["challenge_token"]})
    assert "dev_code" not in resend_wait.text
    forgot = await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})
    assert set(forgot.json()) == {"detail"} and code_in(mailbox.sent[-1]) not in forgot.text


# ---------------------------------------------------------------------------- sessions
async def test_protected_route_requires_token(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401 and r.json()["code"] == "NOT_AUTHENTICATED"
    r = await client.get("/api/v1/users/me", headers=auth("garbage"))
    assert r.status_code == 401


async def test_refresh_uses_cookie_and_checks_origin(client: httpx.AsyncClient, manager: dict) -> None:
    await login(client, "manager@stocksense.dev")
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
    session = await login(client, "manager@stocksense.dev")
    raw = client.cookies.get(COOKIE)
    out = await client.post("/api/v1/auth/logout", headers=auth(session["access_token"]))
    assert out.status_code == 200
    client.cookies.set(COOKIE, raw)  # replay the old cookie
    again = await client.post("/api/v1/auth/refresh")
    assert again.status_code == 401


# ---------------------------------------------------------------------------- password reset
async def _request_otp(client: httpx.AsyncClient, mailbox, email: str) -> str:
    r = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    return code_in(mailbox.sent[-1])


async def test_forgot_password_never_enumerates(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    sent = len(mailbox.sent)
    known = await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@stocksense.dev"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(mailbox.sent) == sent + 1 and mailbox.sent[-1].to == "manager@stocksense.dev"


async def test_otp_flow_success_resets_password_and_revokes_sessions(client: httpx.AsyncClient, manager: dict,
                                                                     mailbox) -> None:
    await login(client, "manager@stocksense.dev")
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
    await login(client, "manager@stocksense.dev", "N3wPassword")


async def test_reset_code_cannot_be_used_to_sign_in(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    reset_code = await _request_otp(client, mailbox, "manager@stocksense.dev")
    r = await client.post("/api/v1/auth/login", json={"email": "manager@stocksense.dev", "password": PASSWORD})
    challenge = r.json()
    if reset_code != last_code(client):
        cross = await verify(client, challenge, reset_code)
        assert cross.status_code == 400 and cross.json()["code"] == "OTP_INVALID"


async def test_otp_expired_returns_400(client: httpx.AsyncClient, manager: dict, mailbox, db_session) -> None:
    otp = await _request_otp(client, mailbox, "manager@stocksense.dev")
    await db_session.execute(update(OTPRecord).values(expires_at=OTPRecord.expires_at - timedelta(minutes=30)))
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": otp})
    assert r.status_code == 400 and r.json()["code"] == "OTP_EXPIRED"


async def test_otp_max_attempts_returns_429(client: httpx.AsyncClient, manager: dict, mailbox, db_session) -> None:
    otp = await _request_otp(client, mailbox, "manager@stocksense.dev")
    for _ in range(settings.OTP_MAX_ATTEMPTS - 1):
        r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": wrong(otp)})
        assert r.status_code == 400 and r.json()["code"] == "OTP_INVALID"
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": wrong(otp)})
    assert r.status_code == 429 and r.json()["code"] == "OTP_MAX_ATTEMPTS"
    # even the right code is now refused
    r = await client.post("/api/v1/auth/verify-otp", json={"email": "manager@stocksense.dev", "otp": otp})
    assert r.status_code in (400, 429)
    record = (await db_session.scalars(select(OTPRecord).where(OTPRecord.purpose == "password_reset"))).first()
    assert record.otp_hash != otp  # stored hashed


async def test_otp_request_rate_limit(client: httpx.AsyncClient, manager: dict, mailbox) -> None:
    for _ in range(settings.OTP_REQUEST_RATE_PER_HOUR):
        assert (await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})).status_code == 200
    r = await client.post("/api/v1/auth/forgot-password", json={"email": "manager@stocksense.dev"})
    assert r.status_code == 429


# ---------------------------------------------------------------------------- profile & password change
async def test_profile_update_changes_name_only(client: httpx.AsyncClient, manager: dict) -> None:
    h = manager["headers"]
    r = await client.put("/api/v1/users/me", headers=h,
                         json={"full_name": "Maya  Lead", "current_password": PASSWORD, "new_password": "Brand1New"})
    assert r.status_code == 200 and r.json()["full_name"] == "Maya Lead"
    # The password is untouched: changing it needs the emailed code.
    client.cookies.clear()
    await login(client, "manager@stocksense.dev", PASSWORD)


async def test_password_change_requires_current_password_and_code(client: httpx.AsyncClient, manager: dict,
                                                                  mailbox) -> None:
    h = manager["headers"]
    old_cookie = client.cookies.get(COOKIE)
    bad = await client.post("/api/v1/users/me/password/otp", headers=h, json={"current_password": "wrong-pass1"})
    assert bad.status_code == 400 and bad.json()["code"] == "INVALID_PASSWORD"

    start = await client.post("/api/v1/users/me/password/otp", headers=h, json={"current_password": PASSWORD})
    assert start.status_code == 200
    challenge = start.json()
    assert challenge["purpose"] == "password_change" and "password change" in mailbox.sent[-1].subject

    code = code_in(mailbox.sent[-1])
    body = {"challenge_token": challenge["challenge_token"], "new_password": "Brand1New"}
    miss = await client.post("/api/v1/users/me/password", headers=h, json={**body, "otp": wrong(code)})
    assert miss.status_code == 400 and miss.json()["code"] == "OTP_INVALID"

    ok = await client.post("/api/v1/users/me/password", headers=h, json={**body, "otp": code})
    assert ok.status_code == 200
    new_cookie = ok.headers["set-cookie"]
    assert f"{COOKIE}=" in new_cookie
    # The old session is gone; the new password signs in.
    client.cookies.clear()
    client.cookies.set(COOKIE, old_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.clear()
    await login(client, "manager@stocksense.dev", "Brand1New")


async def test_password_change_challenge_belongs_to_its_user(client: httpx.AsyncClient, manager: dict,
                                                            staff: dict) -> None:
    start = await client.post("/api/v1/users/me/password/otp", headers=manager["headers"],
                              json={"current_password": PASSWORD})
    challenge = start.json()
    hijack = await client.post("/api/v1/users/me/password", headers=staff["headers"],
                               json={"challenge_token": challenge["challenge_token"], "otp": last_code(client),
                                     "new_password": "Hijack3d1"})
    assert hijack.status_code == 400 and hijack.json()["code"] == "CHALLENGE_INVALID"


async def test_manager_can_promote_staff(client: httpx.AsyncClient, manager: dict, staff: dict) -> None:
    denied = await client.get("/api/v1/users", headers=staff["headers"])
    assert denied.status_code == 403
    r = await client.put(f"/api/v1/users/{staff['user']['id']}", headers=manager["headers"], json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    self_change = await client.put(f"/api/v1/users/{manager['user']['id']}", headers=manager["headers"],
                                   json={"role": "staff"})
    assert self_change.status_code == 400

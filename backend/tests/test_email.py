from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.email_service import OutgoingEmail, SMTPProvider

MESSAGE = OutgoingEmail(to="a@example.com", subject="Code", text="123456", html="<p>123456</p>")


@pytest.fixture
def sent(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    async def fake_send(msg, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(kwargs)

    import aiosmtplib

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    return calls


async def test_gmail_settings_sign_in_over_starttls(sent) -> None:
    cfg = Settings(SMTP_HOST="smtp.gmail.com", SMTP_PORT=587, SMTP_SECURITY="starttls",
                   SMTP_USERNAME="me@gmail.com", SMTP_PASSWORD="abcd efgh ijkl mnop")
    await SMTPProvider(cfg).send(MESSAGE)
    assert sent == [{"hostname": "smtp.gmail.com", "port": 587, "username": "me@gmail.com",
                     "password": "abcdefghijklmnop", "use_tls": False, "start_tls": True, "timeout": 15}]


async def test_local_catcher_needs_no_credentials(sent) -> None:
    await SMTPProvider(Settings(SMTP_HOST="127.0.0.1", SMTP_PORT=1025)).send(MESSAGE)
    assert sent[0]["username"] is None and sent[0]["password"] is None
    assert sent[0]["use_tls"] is False and sent[0]["start_tls"] is False


def test_credentials_are_never_sent_unencrypted() -> None:
    with pytest.raises(ValueError, match="SMTP_SECURITY"):
        Settings(SMTP_USERNAME="me@gmail.com", SMTP_PASSWORD="x" * 16, SMTP_SECURITY="none")
    with pytest.raises(ValueError, match="SMTP_PASSWORD"):
        Settings(SMTP_USERNAME="me@gmail.com", SMTP_SECURITY="starttls")

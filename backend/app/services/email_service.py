"""Provider-agnostic email. SMTP (Mailhog) in development, SendGrid in production.
Business logic depends only on EmailService; providers are swappable."""

from __future__ import annotations

import asyncio
import html
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Protocol

from app.core.config import Settings, settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(slots=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str


class EmailProvider(Protocol):
    async def send(self, message: OutgoingEmail) -> None: ...


class SMTPProvider:
    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg

    async def send(self, message: OutgoingEmail) -> None:
        import aiosmtplib

        msg = EmailMessage()
        msg["From"] = self.cfg.EMAIL_FROM
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg.set_content(message.text)
        msg.add_alternative(message.html, subtype="html")
        cfg = self.cfg
        await aiosmtplib.send(
            msg,
            hostname=cfg.SMTP_HOST,
            port=cfg.SMTP_PORT,
            username=cfg.SMTP_USERNAME or None,
            password=cfg.SMTP_PASSWORD or None,
            use_tls=cfg.SMTP_SECURITY == "ssl",
            start_tls=True if cfg.SMTP_SECURITY == "starttls" else False,
            timeout=15,
        )


class SendGridProvider:
    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg

    async def send(self, message: OutgoingEmail) -> None:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        name, addr = parseaddr(self.cfg.EMAIL_FROM)
        mail = Mail(
            from_email=(addr, name) if name else addr,
            to_emails=message.to,
            subject=message.subject,
            plain_text_content=message.text,
            html_content=message.html,
        )
        client = SendGridAPIClient(self.cfg.SENDGRID_API_KEY)
        response = await asyncio.to_thread(client.send, mail)
        if response.status_code >= 300:
            raise RuntimeError(f"SendGrid responded {response.status_code}")


def _layout(title: str, body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#F3F4F4;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:600;color:#612D53">StockSense</td></tr>
<tr><td style="padding:0 32px 8px;font-size:20px;font-weight:600">{title}</td></tr>
<tr><td style="padding:0 32px 28px;font-size:14px;line-height:1.6">{body_html}</td></tr>
</table></td></tr></table></body></html>"""


# purpose -> (subject, heading, "Use this code to ...")
_OTP_COPY = {
    "password_reset": ("Your StockSense reset code", "Reset your password", "reset your password"),
    "login": ("Your StockSense sign-in code", "Sign in to StockSense", "sign in"),
    "register": ("Confirm your StockSense account", "Confirm your email", "finish creating your account"),
    "password_change": ("Confirm your password change", "Change your password", "confirm your new password"),
}


class EmailService:
    def __init__(self, provider: EmailProvider) -> None:
        self.provider = provider

    async def _deliver(self, message: OutgoingEmail) -> None:
        try:
            await self.provider.send(message)
            log.info("email.sent", to=message.to, subject=message.subject)
        except Exception as exc:  # background task: never crash the worker
            log.error("email.failed", to=message.to, subject=message.subject, error=str(exc))

    async def send_otp(self, to: str, otp: str, purpose: str = "password_reset") -> None:
        minutes = settings.OTP_EXPIRE_MINUTES
        subject, title, action = _OTP_COPY.get(purpose, _OTP_COPY["password_reset"])
        await self._deliver(
            OutgoingEmail(
                to=to,
                subject=subject,
                text=f"Your code to {action} is {otp}. It expires in {minutes} minutes.\n"
                "If you did not request this, you can ignore this email.",
                html=_layout(
                    title,
                    f"<p>Use this code to {action}:</p>"
                    f"<p style=\"font-size:28px;letter-spacing:6px;font-weight:600;color:#2C2C2C\">{otp}</p>"
                    f"<p style=\"color:#71717a\">Expires in {minutes} minutes. If you did not request this, ignore this email.</p>",
                ),
            )
        )

    async def send_low_stock_alert(self, to: str, *, product_name: str, sku: str, on_hand: float,
                                   reorder_point: float, unit: str, location: str | None) -> None:
        where = f" at {location}" if location else ""
        safe_name, safe_sku, safe_where = html.escape(product_name), html.escape(sku), html.escape(where)
        await self._deliver(
            OutgoingEmail(
                to=to,
                subject=f"Low stock: {sku} {product_name}",
                text=f"{product_name} ({sku}) is at {on_hand:g} {unit}{where}, "
                f"at or below its reorder point of {reorder_point:g}.",
                html=_layout(
                    "Low stock alert",
                    f"<p><strong>{safe_name}</strong> <span style=\"color:#71717a\">{safe_sku}</span></p>"
                    f"<p>On hand{safe_where}: <strong style=\"color:#853953\">{on_hand:g} {unit}</strong><br>"
                    f"Reorder point: {reorder_point:g} {unit}</p>",
                ),
            )
        )


def build_email_service(cfg: Settings = settings) -> EmailService:
    provider: EmailProvider = SendGridProvider(cfg) if cfg.EMAIL_PROVIDER == "sendgrid" else SMTPProvider(cfg)
    return EmailService(provider)

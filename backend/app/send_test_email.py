"""Check the email settings by sending one message: python -m app.send_test_email you@example.com

Unlike the app's background sends (which only log failures), this prints the real error, e.g. a
rejected Gmail app password or a blocked port.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.core.config import settings
from app.services.email_service import OutgoingEmail, build_email_service


async def main(to: str) -> int:
    where = ("SendGrid" if settings.EMAIL_PROVIDER == "sendgrid"
             else f"{settings.SMTP_HOST}:{settings.SMTP_PORT} ({settings.SMTP_SECURITY}"
                  f"{', as ' + settings.SMTP_USERNAME if settings.SMTP_USERNAME else ''})")
    print(f"Sending a test email to {to} via {where} ...")
    service = build_email_service()
    try:
        await service.provider.send(OutgoingEmail(
            to=to,
            subject="StockSense test email",
            text="Email is set up. Sign-in codes will arrive like this.",
            html="<p>Email is set up. Sign-in codes will arrive like this.</p>",
        ))
    except Exception as exc:  # show whatever the mail server said
        print(f"Failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print("Sent. Check the inbox (and the spam folder the first time).")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("to", help="recipient address")
    sys.exit(asyncio.run(main(parser.parse_args().to)))

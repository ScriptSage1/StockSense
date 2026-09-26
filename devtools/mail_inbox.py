"""Local stand-in for Mailhog: catches the app's emails and shows them in a browser.

    SMTP  127.0.0.1:1025   (point the backend at it: SMTP_HOST=127.0.0.1, SMTP_PORT=1025)
    Inbox http://localhost:8025

Nothing leaves this machine. Messages live in memory (latest 50) and vanish on restart.
Needs `pip install aiosmtpd` in the backend venv.
"""

from __future__ import annotations

import html
import re
import threading
from datetime import datetime
from email import message_from_bytes, policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from aiosmtpd.controller import Controller

MAX_MESSAGES = 50
_messages: list[dict[str, str]] = []
_lock = threading.Lock()


class _Catcher:
    async def handle_DATA(self, server, session, envelope):  # noqa: N802 (aiosmtpd hook name)
        msg = message_from_bytes(envelope.content, policy=policy.default)
        part = msg.get_body(preferencelist=("plain", "html"))
        body = part.get_content() if part is not None else ""
        with _lock:
            _messages.insert(0, {
                "to": ", ".join(envelope.rcpt_tos),
                "subject": str(msg.get("Subject", "(no subject)")),
                "time": datetime.now().strftime("%H:%M:%S"),
                "body": body,
            })
            del _messages[MAX_MESSAGES:]
        print(f"[mail] {msg.get('Subject')} -> {', '.join(envelope.rcpt_tos)}", flush=True)
        return "250 Message accepted"


_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="4">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Local inbox</title>
<style>
body{{margin:0;background:#F3EDE2;font:14px/1.5 system-ui,Segoe UI,sans-serif;color:#2C2C2C}}
main{{max-width:720px;margin:0 auto;padding:32px 16px}}
h1{{font-size:18px;margin:0 0 4px}} .sub{{color:#6a6359;margin:0 0 24px;font-size:13px}}
.mail{{background:#FCFAF5;border:1px solid #E2D9C9;border-radius:12px;padding:16px 20px;margin-bottom:12px}}
.meta{{display:flex;justify-content:space-between;gap:12px;color:#6a6359;font-size:12.5px}}
.subject{{font-weight:600;margin:4px 0 8px}} .code{{font-size:28px;letter-spacing:6px;font-weight:700;color:#612D53}}
pre{{white-space:pre-wrap;margin:8px 0 0;font:13px/1.5 system-ui,sans-serif;color:#444}}
.empty{{color:#6a6359;text-align:center;padding:48px 0}}
</style></head><body><main><h1>Local inbox</h1>
<p class="sub">Emails StockSense sends on this machine. Refreshes every few seconds.</p>{items}</main></body></html>"""


class _Inbox(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        with _lock:
            items = list(_messages)
        blocks = []
        for m in items:
            code = re.search(r"\b(\d{6})\b", m["body"])
            blocks.append(
                f'<div class="mail"><div class="meta"><span>To {html.escape(m["to"])}</span>'
                f'<span>{m["time"]}</span></div><div class="subject">{html.escape(m["subject"])}</div>'
                + (f'<div class="code">{code.group(1)}</div>' if code else "")
                + f'<pre>{html.escape(m["body"])}</pre></div>'
            )
        body = _PAGE.format(items="".join(blocks) or '<p class="empty">No emails yet.</p>').encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep the console for mail events only
        pass


if __name__ == "__main__":
    smtp = Controller(_Catcher(), hostname="127.0.0.1", port=1025)
    smtp.start()
    print("SMTP on 127.0.0.1:1025, inbox at http://localhost:8025", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", 8025), _Inbox).serve_forever()
    finally:
        smtp.stop()

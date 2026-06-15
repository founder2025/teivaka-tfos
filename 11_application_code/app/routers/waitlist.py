"""waitlist.py — public launch-waitlist capture + QR.

Storage: shared.attribution_events with event_type='waitlist_signup' — runtime-
writable per Inviolable #7, so NO migration is needed (the Alembic chain is mid-
repair). Each signup is one append-only row; retrievable by querying that
event_type. Idempotent on email, rate-limited, and emails the team on each join.
"""
from __future__ import annotations

import io
import json
import logging
import time

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.config import settings
from app.db.session import get_db
from app.utils.email import send_waitlist_notification

router = APIRouter()
logger = logging.getLogger("teivaka.waitlist")

# Lightweight in-memory IP throttle (good enough for a public marketing form;
# the DB idempotency check is the real dedupe).
_last_by_ip: dict[str, float] = {}
_MIN_INTERVAL = 5  # seconds between submissions per IP


class WaitlistJoinRequest(BaseModel):
    name: str
    email: EmailStr
    country: str | None = "FJ"
    role: str | None = None
    anonymous_id: str | None = None

    @field_validator("name")
    @classmethod
    def name_ok(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Please enter your name.")
        return v[:120]


@router.post("/join", status_code=status.HTTP_201_CREATED)
async def join(req: WaitlistJoinRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Add a visitor to the launch waitlist. Public, idempotent on email."""
    ip = (request.client.host if request.client else "") or "?"
    now = time.time()
    last = _last_by_ip.get(ip)
    if last and (now - last) < _MIN_INTERVAL:
        # Soft-accept to avoid leaking timing; do nothing further.
        return {"ok": True, "already": False, "message": "You're on the list! We'll be in touch."}
    _last_by_ip[ip] = now

    email = req.email.lower().strip()
    existing = (
        await db.execute(
            text(
                "SELECT 1 FROM shared.attribution_events "
                "WHERE event_type = 'waitlist_signup' "
                "AND lower(properties->>'email') = :e LIMIT 1"
            ),
            {"e": email},
        )
    ).first()
    if existing:
        return {"ok": True, "already": True,
                "message": "You're already on the list — we'll let you know the moment we launch."}

    props = {
        "name": req.name.strip(),
        "email": email,
        "country": (req.country or "").upper()[:2] or None,
        "role": (req.role or "").strip()[:60] or None,
    }
    await db.execute(
        text(
            """
            INSERT INTO shared.attribution_events
                (event_type, anonymous_id, source, landing_path, user_agent, properties)
            VALUES
                ('waitlist_signup', :anon, 'WAITLIST', '/waitlist', :ua, CAST(:props AS jsonb))
            """
        ),
        {
            "anon": req.anonymous_id,
            "ua": (request.headers.get("user-agent") or "")[:300],
            "props": json.dumps(props),
        },
    )
    await db.commit()

    # Best-effort team notification — never fail the signup on a notify error.
    try:
        total = (
            await db.execute(
                text("SELECT count(*) FROM shared.attribution_events WHERE event_type = 'waitlist_signup'")
            )
        ).scalar() or 0
        send_waitlist_notification(props["name"], email, props["country"], props["role"], int(total))
    except Exception as e:  # noqa: BLE001
        logger.warning("waitlist notify failed (ignored): %s", e)

    return {"ok": True, "already": False,
            "message": "You're on the list! We'll let you know the moment we launch."}


@router.get("/qr.png")
async def qr_png():
    """PNG QR encoding the public waitlist URL — print/share at events."""
    import qrcode
    import qrcode.constants

    url = f"{settings.frontend_url.rstrip('/')}/waitlist"
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#2C1A0E", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": 'inline; filename="teivaka-waitlist-qr.png"',
        },
    )

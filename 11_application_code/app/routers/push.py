"""push.py — native push-notification device registration.

Device side only (storage + registration). The SEND side (APNs/FCM dispatch) is
credential-gated and lives elsewhere when keys are provisioned.

  POST   /api/v1/push/devices        register/refresh this device's token (idempotent)
  DELETE /api/v1/push/devices/{token} unregister (logout / token rotation)

RLS-scoped to the authenticated tenant via get_rls_db.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import uuid

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

_ALLOWED_PLATFORMS = {"ios", "android", "web", "unknown"}


class DeviceRegister(BaseModel):
    token: str
    platform: Optional[str] = "unknown"


@router.post("/devices")
async def register_device(body: DeviceRegister, user: dict = Depends(get_current_user)):
    platform = (body.platform or "unknown").lower()
    if platform not in _ALLOWED_PLATFORMS:
        platform = "unknown"
    token = (body.token or "").strip()
    if not token:
        return {"data": {"registered": False, "reason": "empty token"}}

    device_id = f"PD-{uuid.uuid4().hex[:12].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        # Idempotent: one row per (tenant, token). A token that moves to a new user
        # (shared device) re-points to the current user.
        await db.execute(text("""
            INSERT INTO tenant.push_devices
                (device_id, tenant_id, user_id, token, platform, created_at, last_seen_at)
            VALUES
                (:device_id, :tenant_id, :user_id, :token, :platform, now(), now())
            ON CONFLICT (tenant_id, token) DO UPDATE SET
                user_id      = EXCLUDED.user_id,
                platform     = EXCLUDED.platform,
                last_seen_at = now()
        """), {
            "device_id": device_id,
            "tenant_id": str(user["tenant_id"]),
            "user_id": str(user["user_id"]),
            "token": token,
            "platform": platform,
        })
    return {"data": {"registered": True}}


@router.delete("/devices/{token}")
async def unregister_device(token: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(
            text("DELETE FROM tenant.push_devices WHERE token = :token"),
            {"token": token},
        )
    return {"data": {"unregistered": True}}

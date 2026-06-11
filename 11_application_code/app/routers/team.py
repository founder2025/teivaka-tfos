"""Team management — the prototype's invite flow, honestly wired.

Invites: the INVITER sends the WhatsApp message from their own phone (the
API returns a prefilled wa.me link). No platform-sent alert path means PR.2
receipt verification is not triggered; automated sending arrives later with
a receipt-verified channel.

Accept: token-based and public. The invitee creates their account INSIDE the
inviter's tenant with the assigned role + farm scope (auth role maps
ACCOUNTANT→VIEWER to satisfy the role CHECK; team_role keeps the display
role). Expiry 7 days; resend regenerates nothing — the same link is re-shared.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TEAM_ROLES = {
    "WORKER":     {"label": "Worker",     "desc": "Logs day-to-day farm events and sees their tasks.",
                   "caps": ["Log events on scoped farms", "See and complete tasks", "No financials, no team control"]},
    "MANAGER":    {"label": "Manager",    "desc": "Runs farms day-to-day — events, tasks, harvests, workers.",
                   "caps": ["Everything a worker can", "Manage cycles and harvests", "Assign tasks"]},
    "ACCOUNTANT": {"label": "Accountant", "desc": "Sees money and reports; doesn't change farm operations.",
                   "caps": ["View financials and reports", "Export Bank Evidence inputs", "Read-only on operations"]},
    "VIEWER":     {"label": "Viewer",     "desc": "Read-only across the scoped farms.",
                   "caps": ["View records and reports", "No edits anywhere"]},
}
# auth role CHECK allows FOUNDER/MANAGER/WORKER/VIEWER/FARMER/ADMIN — no ACCOUNTANT
_AUTH_ROLE = {"WORKER": "WORKER", "MANAGER": "MANAGER", "ACCOUNTANT": "VIEWER", "VIEWER": "VIEWER"}


def _wa_link(phone: str, invitee_first: str, inviter: str, role_label: str, scope_label: str, token: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    msg = (f"Hi {invitee_first}, {inviter} added you as {role_label} at {scope_label} on Teivaka. "
           f"Tap to confirm and set up your account: https://teivaka.com/accept/{token}")
    base = f"https://wa.me/{digits}" if digits else "https://wa.me/"
    return f"{base}?text={quote(msg)}"


class InviteCreate(BaseModel):
    invitee_name: str
    invitee_phone: str
    team_role: str = "WORKER"
    farm_scope: str = "ALL"      # 'ALL' or a farm_id
    scope_label: Optional[str] = None


@router.get("/roles")
async def team_roles(user: dict = Depends(get_current_user)):
    """Role catalog for the invite flow's role step."""
    return {"data": [{"id": k, **v} for k, v in TEAM_ROLES.items()]}


@router.get("/invites")
async def list_invites(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await db.execute(text(
            "UPDATE community.team_invites SET status = 'EXPIRED' "
            "WHERE tenant_id = cast(:tid AS uuid) AND status = 'PENDING' AND expires_at < now()"),
            {"tid": str(user["tenant_id"])})
        rows = (await db.execute(text(
            "SELECT i.*, u.full_name AS sent_by FROM community.team_invites i "
            "LEFT JOIN tenant.users u ON u.user_id = i.invited_by "
            "WHERE i.tenant_id = cast(:tid AS uuid) ORDER BY i.created_at DESC"),
            {"tid": str(user["tenant_id"])})).mappings().all()
        await db.commit()
        out = []
        for r in rows:
            d = dict(r)
            if d["status"] == "PENDING":
                d["whatsapp_link"] = _wa_link(d["invitee_phone"], d["invitee_name"].split(" ")[0],
                                              d["sent_by"] or "Your team", TEAM_ROLES.get(d["team_role"], {}).get("label", d["team_role"]),
                                              d["scope_label"], d["token"])
            return_token_safe = d.pop("token", None)
            d["accept_url"] = f"https://teivaka.com/accept/{return_token_safe}" if d["status"] == "PENDING" else None
            out.append(d)
        return {"data": out}


@router.post("/invites")
async def create_invite(body: InviteCreate, user: dict = Depends(get_current_user)):
    name = (body.invitee_name or "").strip()
    phone = (body.invitee_phone or "").strip()
    if len(name) < 2 or len("".join(c for c in phone if c.isdigit())) < 6:
        raise HTTPException(status_code=422, detail="A real name and a reachable WhatsApp number are both required")
    role = (body.team_role or "WORKER").upper()
    if role not in TEAM_ROLES:
        raise HTTPException(status_code=422, detail="Unknown role")
    scope = (body.farm_scope or "ALL").strip() or "ALL"
    async with get_db_ctx() as db:
        scope_label = body.scope_label
        if scope != "ALL" and not scope_label:
            scope_label = (await db.execute(text(
                "SELECT farm_name FROM tenant.farms WHERE farm_id = :fid"), {"fid": scope})).scalar() or scope
        if scope == "ALL":
            scope_label = "All farms"
        invite_id = f"INV-{uuid.uuid4().hex[:8].upper()}"
        token = secrets.token_urlsafe(18)
        inviter = (await db.execute(text(
            "SELECT full_name FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
            {"uid": str(user["user_id"])})).scalar() or "Your team"
        await db.execute(text(
            "INSERT INTO community.team_invites (invite_id, tenant_id, invited_by, invitee_name, invitee_phone, team_role, farm_scope, scope_label, token) "
            "VALUES (:iid, cast(:tid AS uuid), cast(:by AS uuid), :name, :phone, :role, :scope, :slabel, :token)"),
            {"iid": invite_id, "tid": str(user["tenant_id"]), "by": str(user["user_id"]),
             "name": name, "phone": phone, "role": role, "scope": scope, "slabel": scope_label, "token": token})
        await db.commit()
    return {"data": {
        "invite_id": invite_id,
        "token": token,
        "accept_url": f"https://teivaka.com/accept/{token}",
        "whatsapp_link": _wa_link(phone, name.split(" ")[0], inviter, TEAM_ROLES[role]["label"], scope_label, token),
        "expires_days": 7,
    }}


@router.post("/invites/{invite_id}/cancel")
async def cancel_invite(invite_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.team_invites SET status = 'CANCELLED' "
            "WHERE invite_id = :iid AND tenant_id = cast(:tid AS uuid) AND status = 'PENDING'"),
            {"iid": invite_id, "tid": str(user["tenant_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Invite not found or already decided")
        await db.commit()
    return {"data": {"invite_id": invite_id, "status": "CANCELLED"}}


# ------------------------------------------------- public accept flow --

@router.get("/invites/{token}/public")
async def invite_public(token: str):
    """Public, token-gated invite preview for the /accept/{token} page."""
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "SELECT i.invitee_name, i.team_role, i.scope_label, i.status, i.expires_at, u.full_name AS inviter "
            "FROM community.team_invites i LEFT JOIN tenant.users u ON u.user_id = i.invited_by "
            "WHERE i.token = :t"), {"t": token})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Invitation not found")
        d = dict(row)
        if d["status"] == "PENDING" and d["expires_at"] and d["expires_at"] < datetime.now(timezone.utc):
            d["status"] = "EXPIRED"
        d["role_label"] = TEAM_ROLES.get(d["team_role"], {}).get("label", d["team_role"])
        d.pop("expires_at", None)
        return {"data": d}


class AcceptBody(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


@router.post("/invites/{token}/accept")
async def accept_invite(token: str, body: AcceptBody):
    """Create the invitee's account inside the inviter's tenant. Public,
    token-gated, single-use. New accounts only — existing accounts belong to
    their own tenant and cannot be re-homed here (data-ownership boundary)."""
    email = (body.email or "").strip().lower()
    if "@" not in email or len(body.password or "") < 8:
        raise HTTPException(status_code=422, detail="A valid email and a password of 8+ characters are required")
    async with get_db_ctx() as db:
        inv = (await db.execute(text(
            "SELECT * FROM community.team_invites WHERE token = :t AND status = 'PENDING' AND expires_at > now() FOR UPDATE"),
            {"t": token})).mappings().first()
        if not inv:
            raise HTTPException(status_code=404, detail="Invitation not found, expired, or already used")
        exists = (await db.execute(text(
            "SELECT 1 FROM tenant.users WHERE lower(email) = :em"), {"em": email})).scalar()
        if exists:
            raise HTTPException(status_code=409, detail="That email already has a Teivaka account — team invites are for new accounts")
        uid = str(uuid.uuid4())
        full_name = (body.full_name or inv["invitee_name"]).strip()
        from app.utils.referral import generate_referral_code
        ref_code = await generate_referral_code(db)
        await db.execute(text("""
            INSERT INTO tenant.users
                (user_id, tenant_id, email, full_name, password_hash, role,
                 account_type, whatsapp_number, email_verified, is_active,
                 referral_code, team_role, farm_scope)
            VALUES
                (cast(:uid AS uuid), cast(:tid AS uuid), :email, :name, :pw, :role,
                 'FARMER', :phone, true, true,
                 :ref, :team_role, :scope)
        """), {
            "uid": uid, "tid": str(inv["tenant_id"]), "email": email, "name": full_name,
            "pw": pwd_context.hash(body.password), "role": _AUTH_ROLE[inv["team_role"]],
            "phone": inv["invitee_phone"], "ref": ref_code,
            "team_role": inv["team_role"], "scope": inv["farm_scope"],
        })
        await db.execute(text(
            "UPDATE community.team_invites SET status = 'ACCEPTED', accepted_at = now(), accepted_user_id = cast(:uid AS uuid) "
            "WHERE invite_id = :iid"), {"uid": uid, "iid": inv["invite_id"]})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:owner AS uuid), cast(:uid AS uuid), 'TEAM_JOINED', :msg)"),
                {"owner": str(inv["invited_by"]), "uid": uid,
                 "msg": f"{full_name} accepted your invitation and joined as {TEAM_ROLES[inv['team_role']]['label']}."})
        except Exception:  # noqa: BLE001 — best-effort notification
            pass
        await db.commit()
    return {"data": {"joined": True, "message": "Account created — sign in with your email and password."}}

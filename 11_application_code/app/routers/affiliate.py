"""Affiliate program — prototype openAffiliateDashboard/Console, honestly wired.

An affiliate is an enrolled user whose EXISTING referral code becomes
commission-bearing: when an admin approves a referred user's paid tier
change, a commission ACCRUES (pct × tier monthly price) into a real ledger.
Payouts stay gated on the payment rail — tracked, never paid in-app, and the
dashboard says so. Link taps aren't tracked yet and display honestly as such.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}
_DEFAULTS = {"enabled": True, "global_pct": 10.0, "referred_discount_pct": 10.0,
             "basis": "ONE_OFF", "payout_mode": "CREDIT"}


def _is_admin(user: dict) -> bool:
    return user.get("role") in _ADMIN_ROLES


async def _has(db, name: str) -> bool:
    return bool((await db.execute(text(
        f"SELECT CASE WHEN to_regclass('community.{name}') IS NULL THEN false "
        f"ELSE has_table_privilege(current_user, 'community.{name}', 'SELECT') END"))).scalar())


async def _settings(db) -> dict:
    if not await _has(db, "affiliate_settings"):
        return dict(_DEFAULTS)
    row = (await db.execute(text(
        "SELECT enabled, global_pct, referred_discount_pct, basis, payout_mode "
        "FROM community.affiliate_settings WHERE id = 1"))).mappings().first()
    return {k: (float(v) if k.endswith("pct") else v) for k, v in dict(row).items()} if row else dict(_DEFAULTS)


async def accrue_commission_for_tier_change(db, referee_user_id: str, tier: str, revenue_fjd: float):
    """Called by the tier-approval flow: if the upgrading user was referred by
    an ACTIVE affiliate, accrue their commission. Best-effort by contract —
    a commission failure must never block a tier change."""
    if not await _has(db, "affiliates") or revenue_fjd <= 0:
        return None
    row = (await db.execute(text(
        "SELECT a.user_id, a.override_pct, u2.full_name AS referee_name "
        "FROM tenant.users u2 "
        "JOIN community.affiliates a ON a.user_id = u2.referred_by_user_id AND a.status = 'ACTIVE' "
        "WHERE u2.user_id = cast(:ref AS uuid)"), {"ref": str(referee_user_id)})).mappings().first()
    if not row:
        return None
    s = await _settings(db)
    if not s["enabled"]:
        return None
    pct = float(row["override_pct"]) if row["override_pct"] is not None else float(s["global_pct"])
    amount = round(revenue_fjd * pct / 100.0, 2)
    cid = f"COM-{uuid.uuid4().hex[:8].upper()}"
    await db.execute(text(
        "INSERT INTO community.affiliate_commissions "
        "(commission_id, affiliate_user_id, referee_user_id, referee_name, tier, pct, revenue_fjd, amount_fjd) "
        "VALUES (:cid, cast(:aff AS uuid), cast(:ref AS uuid), :rname, :tier, :pct, :rev, :amt)"),
        {"cid": cid, "aff": str(row["user_id"]), "ref": str(referee_user_id),
         "rname": row["referee_name"] or "", "tier": tier, "pct": pct, "rev": revenue_fjd, "amt": amount})
    return {"commission_id": cid, "affiliate_user_id": str(row["user_id"]), "amount_fjd": amount}


async def _stats_for(db, user_id: str) -> dict:
    signups = (await db.execute(text(
        "SELECT count(*) FROM tenant.users WHERE referred_by_user_id = cast(:uid AS uuid)"),
        {"uid": user_id})).scalar() or 0
    agg = (await db.execute(text(
        "SELECT count(*), COALESCE(sum(amount_fjd), 0), COALESCE(sum(CASE WHEN status='PAID' THEN amount_fjd ELSE 0 END), 0), COALESCE(sum(revenue_fjd), 0) "
        "FROM community.affiliate_commissions WHERE affiliate_user_id = cast(:uid AS uuid)"),
        {"uid": user_id})).first()
    return {"clicks": None,  # honest: link taps aren't tracked yet
            "signups": int(signups), "conversions": int(agg[0]),
            "earned_fjd": float(agg[1]), "paid_fjd": float(agg[2]),
            "outstanding_fjd": float(agg[1]) - float(agg[2]),
            "revenue_fjd": float(agg[3])}


@router.get("/me")
async def my_affiliate(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        s = await _settings(db)
        if not await _has(db, "affiliates"):
            return {"data": {"enrolled": False, "settings": s, "degraded": True}}
        row = (await db.execute(text(
            "SELECT a.status, a.override_pct, a.enrolled_at, u.referral_code AS code "
            "FROM community.affiliates a JOIN tenant.users u ON u.user_id = a.user_id "
            "WHERE a.user_id = cast(:uid AS uuid)"), {"uid": uid})).mappings().first()
        if not row:
            return {"data": {"enrolled": False, "settings": s}}
        ledger = (await db.execute(text(
            "SELECT referee_name, tier, pct, amount_fjd, status, created_at "
            "FROM community.affiliate_commissions WHERE affiliate_user_id = cast(:uid AS uuid) "
            "ORDER BY created_at DESC LIMIT 100"), {"uid": uid})).mappings().all()
        pct = float(row["override_pct"]) if row["override_pct"] is not None else float(s["global_pct"])
        return {"data": {
            "enrolled": True, "status": row["status"], "code": row["code"],
            "link": f"https://teivaka.com/?ref={row['code']}",
            "effective_pct": pct, "settings": s,
            "stats": await _stats_for(db, uid),
            "ledger": [dict(r) for r in ledger],
        }}


@router.post("/enroll")
async def enroll(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        s = await _settings(db)
        if not s["enabled"]:
            raise HTTPException(status_code=409, detail="The affiliate program is paused right now")
        verified = (await db.execute(text(
            "SELECT email_verified FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
            {"uid": str(user["user_id"])})).scalar()
        if not verified:
            raise HTTPException(status_code=403, detail="Verify your email first")
        await db.execute(text(
            "INSERT INTO community.affiliates (user_id) VALUES (cast(:uid AS uuid)) ON CONFLICT (user_id) DO NOTHING"),
            {"uid": str(user["user_id"])})
        await db.commit()
    return {"data": {"enrolled": True}}


class CodeBody(BaseModel):
    code: str


@router.patch("/code")
async def set_code(body: CodeBody, user: dict = Depends(get_current_user)):
    code = (body.code or "").strip().upper()
    if not (4 <= len(code) <= 16 and code.isalnum()):
        raise HTTPException(status_code=422, detail="Code must be 4–16 letters/numbers")
    async with get_db_ctx() as db:
        enrolled = (await db.execute(text(
            "SELECT 1 FROM community.affiliates WHERE user_id = cast(:uid AS uuid)"),
            {"uid": str(user["user_id"])})).scalar()
        if not enrolled:
            raise HTTPException(status_code=403, detail="Enroll as an affiliate first")
        taken = (await db.execute(text(
            "SELECT 1 FROM tenant.users WHERE upper(referral_code) = :c AND user_id != cast(:uid AS uuid)"),
            {"c": code, "uid": str(user["user_id"])})).scalar()
        if taken:
            raise HTTPException(status_code=409, detail="That code is taken — try another")
        await db.execute(text(
            "UPDATE tenant.users SET referral_code = :c WHERE user_id = cast(:uid AS uuid)"),
            {"c": code, "uid": str(user["user_id"])})
        await db.commit()
    return {"data": {"code": code}}


# ----------------------------------------------------------- founder console --

@router.get("/admin/overview")
async def admin_overview(user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        roster = (await db.execute(text(
            "SELECT a.user_id, a.status, a.override_pct, a.enrolled_at, u.full_name, u.referral_code AS code "
            "FROM community.affiliates a JOIN tenant.users u ON u.user_id = a.user_id ORDER BY a.enrolled_at"))).mappings().all()
        out, totals = [], {"affiliates": 0, "active": 0, "signups": 0, "conversions": 0,
                           "accrued_fjd": 0.0, "paid_fjd": 0.0, "outstanding_fjd": 0.0, "revenue_fjd": 0.0}
        s = await _settings(db)
        for r in roster:
            st = await _stats_for(db, str(r["user_id"]))
            pct = float(r["override_pct"]) if r["override_pct"] is not None else float(s["global_pct"])
            out.append({**dict(r), "user_id": str(r["user_id"]), "effective_pct": pct, **st})
            totals["affiliates"] += 1
            totals["active"] += 1 if r["status"] == "ACTIVE" else 0
            totals["signups"] += st["signups"]
            totals["conversions"] += st["conversions"]
            totals["accrued_fjd"] += st["earned_fjd"]
            totals["paid_fjd"] += st["paid_fjd"]
            totals["outstanding_fjd"] += st["outstanding_fjd"]
            totals["revenue_fjd"] += st["revenue_fjd"]
        out.sort(key=lambda a: -a["revenue_fjd"])
        return {"data": {"totals": totals, "roster": out, "settings": s}}


class RateBody(BaseModel):
    override_pct: Optional[float] = None  # null clears the override


@router.patch("/admin/{affiliate_user_id}/rate")
async def set_rate(affiliate_user_id: str, body: RateBody, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    if body.override_pct is not None and not (0 <= body.override_pct <= 100):
        raise HTTPException(status_code=422, detail="Rate must be 0–100")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.affiliates SET override_pct = :p WHERE user_id = cast(:uid AS uuid)"),
            {"p": body.override_pct, "uid": affiliate_user_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        await db.commit()
    return {"data": {"user_id": affiliate_user_id, "override_pct": body.override_pct}}


class StatusBody(BaseModel):
    status: str


@router.patch("/admin/{affiliate_user_id}/status")
async def set_status(affiliate_user_id: str, body: StatusBody, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    st = (body.status or "").upper()
    if st not in ("ACTIVE", "PAUSED", "REJECTED"):
        raise HTTPException(status_code=422, detail="status must be ACTIVE, PAUSED or REJECTED")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.affiliates SET status = :s WHERE user_id = cast(:uid AS uuid)"),
            {"s": st, "uid": affiliate_user_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        await db.commit()
    return {"data": {"user_id": affiliate_user_id, "status": st}}


class SettingsBody(BaseModel):
    enabled: Optional[bool] = None
    global_pct: Optional[float] = None
    referred_discount_pct: Optional[float] = None
    basis: Optional[str] = None
    payout_mode: Optional[str] = None


@router.patch("/admin/settings")
async def patch_settings(body: SettingsBody, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "basis" in fields and fields["basis"] not in ("ONE_OFF", "RECURRING"):
        raise HTTPException(status_code=422, detail="basis must be ONE_OFF or RECURRING")
    if "payout_mode" in fields and fields["payout_mode"] not in ("CREDIT", "CASH"):
        raise HTTPException(status_code=422, detail="payout_mode must be CREDIT or CASH")
    async with get_db_ctx() as db:
        if fields:
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(text(f"UPDATE community.affiliate_settings SET {sets} WHERE id = 1"), fields)
            await db.commit()
        return {"data": await _settings(db)}

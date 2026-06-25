"""Service-job engine (ecosystem connector) — mounted at /api/v1.

A confirmed sale that the farmer can't deliver/store becomes a JOB nearby
providers (LOGISTICS_OPERATOR) claim. On completion it's a 5% Services fee.

Farmer / requester:
  POST  /service-jobs                 post a gap (transport / cold storage / ...)
  GET   /service-jobs/mine            jobs I requested
  POST  /service-jobs/{id}/complete   confirm done + agreed price (accrues 5% fee)
  POST  /service-jobs/{id}/cancel     cancel an open/claimed job

Provider:
  GET   /service-provider/profile     my provider profile
  PUT   /service-provider/profile     create/update it (service types, base, radius)
  GET   /service-jobs/available       OPEN jobs near me matching my service types
  GET   /service-jobs/claimed         jobs I've claimed
  POST  /service-jobs/{id}/claim      claim an open job

community.* is cross-tenant (no RLS) — a farmer's job must be visible to provider
tenants. In-app notifications via community.feed_notifications (WhatsApp next).
"""
import asyncio
import logging
import math
import uuid
from decimal import Decimal
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

_SERVICE_TYPES = {"TRANSPORT", "COLD_STORAGE", "INPUT_DELIVERY", "MACHINERY", "TOOLS", "OTHER"}


def _haversine_km(lat1, lng1, lat2, lng2) -> Optional[float]:
    try:
        if None in (lat1, lng1, lat2, lng2):
            return None
        r = 6371.0
        p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
        dp = math.radians(float(lat2) - float(lat1))
        dl = math.radians(float(lng2) - float(lng1))
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except Exception:  # noqa: BLE001
        return None


async def _notify(db, user_id, actor_user_id, ntype: str, body: str):
    try:
        await db.execute(text(
            "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
            "VALUES (cast(:u AS uuid), cast(:a AS uuid), :t, :b)"),
            {"u": str(user_id), "a": str(actor_user_id), "t": ntype, "b": body})
    except Exception as e:  # noqa: BLE001
        logger.warning("service-job notify failed: %s", e)


async def _whatsapp_blast(phones: list, message: str, template_params: Optional[list] = None):
    """Best-effort WhatsApp fan-out (mock-logs when Meta isn't configured).

    Uses the approved template (settings.whatsapp_job_alert_template) when set —
    required for business-initiated alerts outside a 24h window — passing
    template_params as the body {{1}},{{2}}... values. Falls back to a plain-text
    message otherwise (delivers only inside an open 24h session / mock-logs).
    Live delivery still requires creds + an approved template + receipt-verify (PR.2)."""
    phones = [p for p in {(p or "").strip() for p in phones} if p]
    if not phones:
        return
    try:
        from app.config import settings
        from app.services.notification_service import whatsapp_service
        tmpl = (getattr(settings, "whatsapp_job_alert_template", "") or "").strip()
        lang = getattr(settings, "whatsapp_template_lang", "en") or "en"
        components = None
        if tmpl and template_params:
            components = [{"type": "body", "parameters": [
                {"type": "text", "text": str(x)} for x in template_params]}]

        async def _send(p):
            if tmpl:
                return await whatsapp_service.send_template(
                    p, tmpl, language_code=lang, components=components)
            return await whatsapp_service.send_alert(p, message, severity="INFO")

        await asyncio.gather(*[_send(p) for p in phones], return_exceptions=True)
    except Exception as e:  # noqa: BLE001
        logger.warning("service-job whatsapp blast failed: %s", e)


async def _notify_matching_providers(db, job: dict, actor_user_id) -> list:
    """In-app notify active providers whose service types include this job and who
    are within radius of the pickup (or have no coords). Returns phones to WhatsApp."""
    rows = (await db.execute(text(
        "SELECT user_id, phone, base_lat, base_lng, service_radius_km "
        "FROM community.service_provider_profiles "
        "WHERE is_active = true AND :st = ANY(service_types) LIMIT 200"),
        {"st": job["service_type"]})).mappings().all()
    body = f"New {job['service_type'].replace('_', ' ').lower()} job near you: {job['title']}. Open Teivaka → Service hub to claim."
    phones, sent = [], 0
    for r in rows:
        d = _haversine_km(r["base_lat"], r["base_lng"], job.get("pickup_lat"), job.get("pickup_lng"))
        if d is not None and d > (r["service_radius_km"] or 25):
            continue
        await _notify(db, r["user_id"], actor_user_id, "SERVICE_JOB_POSTED", body)
        if r["phone"]:
            phones.append(r["phone"])
        sent += 1
        if sent >= 50:  # cap fan-out per job (note: move to a worker at scale)
            break
    return phones


# ── Provider profile ─────────────────────────────────────────────────────────
class ProviderProfile(BaseModel):
    display_name: Optional[str] = None
    service_types: List[str] = []
    base_location: Optional[str] = None
    base_lat: Optional[float] = None
    base_lng: Optional[float] = None
    service_radius_km: int = 25
    capacity_note: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


@router.get("/service-provider/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.service_provider_profiles') IS NOT NULL"))).scalar():
            return {"data": None}
        row = (await db.execute(text(
            "SELECT * FROM community.service_provider_profiles WHERE user_id = cast(:u AS uuid)"),
            {"u": str(user["user_id"])})).mappings().first()
    return {"data": dict(row) if row else None}


@router.put("/service-provider/profile")
async def upsert_profile(body: ProviderProfile, user: dict = Depends(get_current_user)):
    types = [t.strip().upper() for t in (body.service_types or []) if t.strip()]
    bad = [t for t in types if t not in _SERVICE_TYPES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown service types: {bad}")
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.service_provider_profiles
                (user_id, tenant_id, display_name, service_types, base_location, base_lat,
                 base_lng, service_radius_km, capacity_note, phone, is_active, updated_at)
            VALUES
                (cast(:u AS uuid), cast(:tid AS uuid), :name, :types, :loc, :lat, :lng,
                 :radius, :cap, :phone, :active, now())
            ON CONFLICT (user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name, service_types = EXCLUDED.service_types,
                base_location = EXCLUDED.base_location, base_lat = EXCLUDED.base_lat,
                base_lng = EXCLUDED.base_lng, service_radius_km = EXCLUDED.service_radius_km,
                capacity_note = EXCLUDED.capacity_note, phone = EXCLUDED.phone,
                is_active = EXCLUDED.is_active, updated_at = now()
        """), {
            "u": str(user["user_id"]), "tid": str(user["tenant_id"]),
            "name": body.display_name, "types": types, "loc": body.base_location,
            "lat": body.base_lat, "lng": body.base_lng, "radius": max(1, int(body.service_radius_km or 25)),
            "cap": body.capacity_note, "phone": body.phone, "active": body.is_active,
        })
        await db.commit()
    return {"data": {"saved": True}}


# ── Jobs ─────────────────────────────────────────────────────────────────────
class JobCreate(BaseModel):
    service_type: str
    title: str
    farm_id: Optional[str] = None
    order_id: Optional[str] = None
    produce_desc: Optional[str] = None
    quantity_kg: Optional[Decimal] = None
    pickup_location: Optional[str] = None
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_location: Optional[str] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    needed_by: Optional[datetime] = None
    budget_fjd: Optional[Decimal] = None
    notes: Optional[str] = None


@router.post("/service-jobs")
async def create_job(body: JobCreate, user: dict = Depends(get_current_user)):
    st = (body.service_type or "").upper()
    if st not in _SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"service_type must be one of {sorted(_SERVICE_TYPES)}")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="A short title is required")
    job_id = f"JOB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:5].upper()}"
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.service_jobs
                (job_id, service_type, requester_tenant_id, requester_user_id, farm_id, order_id,
                 title, produce_desc, quantity_kg, pickup_location, pickup_lat, pickup_lng,
                 dropoff_location, dropoff_lat, dropoff_lng, needed_by, budget_fjd, notes)
            VALUES
                (:jid, :st, cast(:tid AS uuid), cast(:uid AS uuid), :farm, :oid,
                 :title, :pd, :qty, :ploc, :plat, :plng, :dloc, :dlat, :dlng, :needed, :budget, :notes)
        """), {
            "jid": job_id, "st": st, "tid": str(user["tenant_id"]), "uid": str(user["user_id"]),
            "farm": body.farm_id, "oid": body.order_id, "title": body.title.strip(),
            "pd": body.produce_desc, "qty": body.quantity_kg,
            "ploc": body.pickup_location, "plat": body.pickup_lat, "plng": body.pickup_lng,
            "dloc": body.dropoff_location, "dlat": body.dropoff_lat, "dlng": body.dropoff_lng,
            "needed": body.needed_by, "budget": body.budget_fjd, "notes": body.notes,
        })
        # Push to matching nearby providers: in-app now (same txn) + WhatsApp after.
        phones = []
        try:
            phones = await _notify_matching_providers(
                db,
                {"service_type": st, "title": body.title.strip(),
                 "pickup_lat": body.pickup_lat, "pickup_lng": body.pickup_lng},
                user["user_id"])
        except Exception as e:  # noqa: BLE001
            logger.warning("provider notify failed for %s: %s", job_id, e)
        await db.commit()
    svc_label = st.replace("_", " ").lower()
    await _whatsapp_blast(
        phones,
        f"New {svc_label} job on Teivaka: {body.title.strip()}. Open the app → Service hub to view and claim it.",
        template_params=[svc_label, body.title.strip()])
    return {"data": {"job_id": job_id, "status": "OPEN", "providers_notified": len(phones)}}


@router.get("/service-jobs/mine")
async def my_jobs(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.service_jobs') IS NOT NULL"))).scalar():
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT * FROM community.service_jobs WHERE requester_user_id = cast(:u AS uuid) "
            "ORDER BY created_at DESC LIMIT 100"), {"u": str(user["user_id"])})).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/service-jobs/claimed")
async def claimed_jobs(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.service_jobs') IS NOT NULL"))).scalar():
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT * FROM community.service_jobs WHERE claimed_by_user_id = cast(:u AS uuid) "
            "ORDER BY claimed_at DESC LIMIT 100"), {"u": str(user["user_id"])})).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/service-jobs/available")
async def available_jobs(user: dict = Depends(get_current_user)):
    """OPEN jobs matching my provider service types, sorted nearest-first. If I
    have no coords, all matching OPEN jobs are returned (distance unknown)."""
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.service_provider_profiles') IS NOT NULL"))).scalar():
            return {"data": []}
        prof = (await db.execute(text(
            "SELECT service_types, base_lat, base_lng, service_radius_km, is_active "
            "FROM community.service_provider_profiles WHERE user_id = cast(:u AS uuid)"),
            {"u": str(user["user_id"])})).mappings().first()
        if not prof or not prof["is_active"] or not prof["service_types"]:
            return {"data": [], "needs_profile": not prof}
        rows = (await db.execute(text(
            "SELECT * FROM community.service_jobs WHERE status = 'OPEN' "
            "AND service_type = ANY(:types) ORDER BY created_at DESC LIMIT 200"),
            {"types": list(prof["service_types"])})).mappings().all()

    radius = prof["service_radius_km"] or 25
    out = []
    for r in rows:
        d = _haversine_km(prof["base_lat"], prof["base_lng"], r["pickup_lat"], r["pickup_lng"])
        if d is not None and d > radius:
            continue
        item = dict(r)
        item["distance_km"] = (round(d, 1) if d is not None else None)
        out.append(item)
    out.sort(key=lambda x: (x["distance_km"] is None, x["distance_km"] or 0))
    return {"data": out}


@router.post("/service-jobs/{job_id}/claim")
async def claim_job(job_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        job = (await db.execute(text(
            "SELECT requester_user_id, status, title FROM community.service_jobs WHERE job_id = :j"),
            {"j": job_id})).mappings().first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        claimed = (await db.execute(text("""
            UPDATE community.service_jobs SET status='CLAIMED',
                claimed_by_user_id = cast(:u AS uuid), claimed_by_tenant_id = cast(:tid AS uuid),
                claimed_at = now()
            WHERE job_id = :j AND status = 'OPEN' RETURNING job_id
        """), {"u": str(user["user_id"]), "tid": str(user["tenant_id"]), "j": job_id})).scalar()
        if not claimed:
            raise HTTPException(status_code=409, detail="This job has already been claimed")
        await _notify(db, job["requester_user_id"], user["user_id"], "SERVICE_JOB_CLAIMED",
                      f"A provider claimed your job: {job['title']}")
        await db.commit()
    return {"data": {"job_id": job_id, "status": "CLAIMED"}}


class JobComplete(BaseModel):
    agreed_price_fjd: Decimal


@router.post("/service-jobs/{job_id}/complete")
async def complete_job(job_id: str, body: JobComplete, user: dict = Depends(get_current_user)):
    """Requester confirms the job is done + the price paid → marks COMPLETED and
    accrues the 5% Services fee against the PROVIDER (their marketplace fee)."""
    async with get_db_ctx() as db:
        job = (await db.execute(text(
            "SELECT requester_user_id, claimed_by_user_id, claimed_by_tenant_id, status, title "
            "FROM community.service_jobs WHERE job_id = :j"), {"j": job_id})).mappings().first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if str(job["requester_user_id"]) != str(user["user_id"]):
            raise HTTPException(status_code=403, detail="Only the requester can confirm completion")
        if job["status"] != "CLAIMED":
            raise HTTPException(status_code=409, detail="Job must be claimed before it can be completed")
        await db.execute(text(
            "UPDATE community.service_jobs SET status='COMPLETED', agreed_price_fjd=:p, completed_at=now() "
            "WHERE job_id = :j"), {"p": body.agreed_price_fjd, "j": job_id})
        fee = None
        if job["claimed_by_tenant_id"]:
            try:
                from app.routers.marketplace_fees import accrue_marketplace_fee
                fee = await accrue_marketplace_fee(
                    db, tenant_id=job["claimed_by_tenant_id"], order_id=job_id,
                    category="SERVICES", gross_amount_fjd=body.agreed_price_fjd)
            except Exception as e:  # noqa: BLE001
                logger.warning("service fee accrual failed for %s: %s", job_id, e)
        if job["claimed_by_user_id"]:
            await _notify(db, job["claimed_by_user_id"], user["user_id"], "SERVICE_JOB_COMPLETED",
                          f"Job marked complete: {job['title']}")
        await db.commit()
    return {"data": {"job_id": job_id, "status": "COMPLETED",
                     "service_fee_fjd": (str(fee["fee_amount_fjd"]) if fee else None)}}


@router.post("/service-jobs/{job_id}/cancel")
async def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.service_jobs SET status='CANCELLED' "
            "WHERE job_id = :j AND requester_user_id = cast(:u AS uuid) "
            "AND status IN ('OPEN','CLAIMED') RETURNING job_id"),
            {"j": job_id, "u": str(user["user_id"])})
        if not res.scalar():
            raise HTTPException(status_code=404, detail="Job not found or cannot be cancelled")
        await db.commit()
    return {"data": {"job_id": job_id, "status": "CANCELLED"}}

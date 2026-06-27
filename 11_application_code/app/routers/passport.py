"""Agricultural Passport — TATI Phase 1 (read-model).

The Passport is a living professional portfolio that auto-grows from TFOS activity.
GOVERNING PRINCIPLE: the farmer manages their farm once; Teivaka builds the passport
without duplicate entry. So this endpoint is almost entirely a PROJECTION of existing
tables — identity, farm, production, sales, reputation — plus the few manual fields in
tenant.passport_profile (photo / bio / languages).

Phase 1 deliberately does NOT compute trust scores (Phase 2) or expose sharing
(Phase 3). Trust shows an honest "Building" with the real evidence counts behind it.

Routes (mounted at /api/v1):
  GET /passport/me
  GET /passport/me/profile        PUT /passport/me/profile   (the only manual fields)
"""
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope
from app.services.passport_summary import deterministic_summary, build_prompt, is_grounded
from app.services.farm_profile import gather_farm_profile

router = APIRouter()

_ACTIVE = ("PLANNED", "ACTIVE", "HARVESTING", "CLOSING")


async def _assemble_passport(db: AsyncSession, user: dict) -> dict:
    """Assemble the Agricultural Passport read-model from existing data (no duplicate
    entry). Honest-empty where a real source doesn't exist yet. Reused by the summary."""
    uid = str(user["user_id"])

    u = (await db.execute(text(
        "SELECT full_name, email, whatsapp_number, avatar_url, created_at FROM tenant.users WHERE user_id = cast(:u AS uuid)"
    ), {"u": uid})).mappings().first() or {}

    prof = (await db.execute(text(
        "SELECT preferred_name, bio, languages, professional_photo_url FROM tenant.passport_profile WHERE user_id = cast(:u AS uuid)"
    ), {"u": uid})).mappings().first() or {}

    farms = (await db.execute(text("""
        SELECT f.farm_id, f.farm_name, f.location_island, f.created_at, f.land_tenure,
               COALESCE((SELECT SUM(area_sqm) FROM tenant.production_units pu
                          WHERE pu.farm_id = f.farm_id AND pu.is_active = TRUE), 0) AS area_sqm,
               (SELECT COUNT(*) FROM tenant.production_units pu
                  WHERE pu.farm_id = f.farm_id AND pu.is_active = TRUE) AS block_count
        FROM tenant.farms f
        WHERE f.is_active = TRUE
        ORDER BY f.created_at, f.farm_id
    """))).mappings().all()

    # Reputation — projected counts (the evidence behind "Building").
    seasons = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.production_cycles WHERE cycle_status = 'CLOSED'"
    ))).scalar() or 0
    active_cycles = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.production_cycles WHERE cycle_status IN ('ACTIVE','HARVESTING','CLOSING')"
    ))).scalar() or 0
    harvest = (await db.execute(text(
        "SELECT COALESCE(SUM(gross_yield_kg),0) AS kg, COUNT(*) AS n FROM tenant.harvest_log"
    ))).mappings().first() or {}
    sales = (await db.execute(text(
        "SELECT COALESCE(SUM(amount_fjd),0) AS fjd, COUNT(*) AS n FROM tenant.cash_ledger WHERE transaction_type='INCOME'"
    ))).mappings().first() or {}
    photos = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.field_events WHERE photo_url IS NOT NULL AND deleted_at IS NULL"
    ))).scalar() or 0

    created = u.get("created_at")
    member_since = created.date().isoformat() if created else None

    # Trust — read precomputed snapshots (Inviolable #3). Honest "Building" if none yet.
    snaps = (await db.execute(text(
        "SELECT dimension, score, band, why, how_to_improve, computed_at FROM tenant.trust_snapshots "
        "WHERE subject_id = cast(:t AS text)"
    ), {"t": str(user["tenant_id"])})).mappings().all()
    if snaps:
        overall = next((s for s in snaps if s["dimension"] == "__overall__"), None)
        dims = [{"key": s["dimension"], "score": s["score"], "band": s["band"],
                 "why": s["why"], "how_to_improve": s["how_to_improve"]}
                for s in snaps if s["dimension"] != "__overall__"]
        trust = {
            "status": "scored",
            "overall_score": overall["score"] if overall else None,
            "overall_band": overall["band"] if overall else None,
            "label": "Evidence & Reliability Confidence",
            "disclaimer": (overall["how_to_improve"] if overall else
                           "Reflects the completeness and consistency of verified records — not a credit decision."),
            "dimensions": dims,
            "computed_at": (snaps[0]["computed_at"].isoformat() if snaps[0]["computed_at"] else None),
        }
    else:
        trust = {
            "status": "building",
            "headline": "Your reputation is building from your records",
            "note": "Every season, harvest, sale and photo strengthens your verified reputation. "
                    "Tap refresh or check back — scored trust appears as your evidence accumulates.",
            "dimensions": [],
        }

    # Honest verification chips (Phase 1 — real signals only; full claim model is Phase 2/3).
    verifications = {
        "email": bool(u.get("email")),          # email captured at signup
        "phone": bool(u.get("whatsapp_number")),
        "farm": len(farms) > 0,                  # a farm exists
        "identity": False,                       # no third-party KYC yet (Phase 5) — honest false
    }

    return {
        "identity": {
            "preferred_name": prof.get("preferred_name") or u.get("full_name"),
            "legal_name": u.get("full_name"),
            "farmer_id": (farms[0]["farm_id"] if farms else uid[:8].upper()),
            # Reuse the farmer's existing profile picture (Golden Rule — never re-ask);
            # a dedicated passport photo, if set, takes precedence.
            "photo_url": prof.get("professional_photo_url") or u.get("avatar_url"),
            "bio": prof.get("bio"),
            "languages": prof.get("languages") or [],
            "email": u.get("email"),
            "phone": u.get("whatsapp_number"),
            "member_since": member_since,
            "verifications": verifications,
        },
        "farms": [{
            "farm_id": f["farm_id"], "farm_name": f["farm_name"],
            "location": f["location_island"], "area_ha": round(float(f["area_sqm"] or 0) / 10000.0, 2),
            "blocks": int(f["block_count"] or 0), "land_tenure": f["land_tenure"],
        } for f in farms],
        "profile": await gather_farm_profile(db),
        "reputation": {
            "seasons_completed": int(seasons),
            "active_cycles": int(active_cycles),
            "verified_production_kg": round(float(harvest.get("kg") or 0), 1),
            "harvest_records": int(harvest.get("n") or 0),
            "total_sales_fjd": round(float(sales.get("fjd") or 0), 2),
            "sales_records": int(sales.get("n") or 0),
            "photo_evidence": int(photos),
        },
        "trust": trust,
    }


@router.get("/passport/me")
async def get_my_passport(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    p = await _assemble_passport(db, user)
    # First load with no snapshot → enqueue a background recompute (non-blocking, PR-2) so trust
    # builds without slowing the request. The farmer sees honest "Building" now, scores next load
    # (or instantly via the explicit Refresh button).
    if (p.get("trust") or {}).get("status") == "building":
        try:
            from app.workers.trust_worker import compute_trust_one
            compute_trust_one.delay(str(user["tenant_id"]))
        except Exception:  # noqa: BLE001 — enqueue is best-effort; nightly job + manual refresh cover it
            pass
    row = (await db.execute(text(
        "SELECT summary, source, generated_at FROM tenant.passport_ai_summary LIMIT 1"))).mappings().first()
    if row and row["summary"]:
        p["summary"] = {"text": row["summary"], "source": row["source"],
                        "generated_at": row["generated_at"].isoformat() if row["generated_at"] else None}
    return success_envelope(p)


async def _store_summary(db, user, summary_text, source, based_on):
    await db.execute(text("""
        INSERT INTO tenant.passport_ai_summary (tenant_id, summary, source, based_on, generated_at)
        VALUES (cast(:t AS uuid), :s, :src, :b, now())
        ON CONFLICT (tenant_id) DO UPDATE SET summary=EXCLUDED.summary, source=EXCLUDED.source,
            based_on=EXCLUDED.based_on, generated_at=now()
    """), {"t": str(user["tenant_id"]), "s": summary_text, "src": source, "b": based_on})


@router.get("/passport/me/summary")
async def get_my_summary(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Cached if it matches the current trust snapshot; else compute the grounded
    deterministic summary + cache (DD-4 cache-per-snapshot). Never fabricated."""
    p = await _assemble_passport(db, user)
    based = (p.get("trust") or {}).get("computed_at")
    cache = (await db.execute(text(
        "SELECT summary, source, based_on FROM tenant.passport_ai_summary LIMIT 1"))).mappings().first()
    fresh = cache and cache["summary"] and (
        (based is None) or (cache["based_on"] and cache["based_on"].isoformat() == based))
    if fresh:
        return success_envelope({"summary": cache["summary"], "source": cache["source"]})
    txt = deterministic_summary(p)
    await _store_summary(db, user, txt, "deterministic", None)
    return success_envelope({"summary": txt, "source": "deterministic"})


@router.post("/passport/me/summary/refresh")
async def refresh_my_summary(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Regenerate with LLM phrasing via the OpenClaw bridge — STRICTLY grounded
    (Inviolable #1). Falls back to the deterministic summary if the bridge is unavailable."""
    p = await _assemble_passport(db, user)
    based = (p.get("trust") or {}).get("computed_at")
    try:
        from app.services.tis_service import bridge_chat
        farm_id = (p.get("farms") or [{}])[0].get("farm_id")
        out = await bridge_chat(build_prompt(p), str(user["user_id"]), farm_id)
        if not out or len(out.strip()) < 40:
            raise ValueError("empty")
        if not is_grounded(out, p):   # Inviolable #1 — reject any invented figure (P-6)
            raise ValueError("ungrounded")
        txt = out.strip()
        await _store_summary(db, user, txt, "ai", based)
        return success_envelope({"summary": txt, "source": "ai"})
    except Exception:  # noqa: BLE001 — never block on the LLM; ground deterministically
        txt = deterministic_summary(p)
        await _store_summary(db, user, txt, "deterministic", based)
        return success_envelope({"summary": txt, "source": "deterministic",
                                 "note": "AI phrasing unavailable right now — showing the grounded summary."})


class ProfileUpdate(BaseModel):
    preferred_name: Optional[str] = Field(None, max_length=120)
    bio: Optional[str] = Field(None, max_length=1000)
    languages: Optional[list[str]] = None
    professional_photo_url: Optional[str] = Field(None, max_length=500)
    photo_sha256: Optional[str] = Field(None, max_length=64)


@router.get("/passport/me/profile")
async def get_my_profile(
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    row = (await db.execute(text(
        "SELECT preferred_name, bio, languages, professional_photo_url FROM tenant.passport_profile "
        "WHERE user_id = cast(:u AS uuid)"
    ), {"u": str(user["user_id"])})).mappings().first()
    return success_envelope(dict(row) if row else {})


@router.put("/passport/me/profile")
async def update_my_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    """Upsert the few manual passport fields — the ONLY thing the farmer edits here."""
    await db.execute(text("""
        INSERT INTO tenant.passport_profile
            (user_id, tenant_id, preferred_name, bio, languages, professional_photo_url, photo_sha256, updated_at)
        VALUES (cast(:u AS uuid), cast(:t AS uuid), :pn, :bio, :langs, :photo, :sha, now())
        ON CONFLICT (user_id) DO UPDATE SET
            preferred_name = EXCLUDED.preferred_name,
            bio = EXCLUDED.bio,
            languages = EXCLUDED.languages,
            professional_photo_url = COALESCE(EXCLUDED.professional_photo_url, tenant.passport_profile.professional_photo_url),
            photo_sha256 = COALESCE(EXCLUDED.photo_sha256, tenant.passport_profile.photo_sha256),
            updated_at = now()
    """), {"u": str(user["user_id"]), "t": str(user["tenant_id"]),
           "pn": body.preferred_name, "bio": body.bio, "langs": body.languages,
           "photo": body.professional_photo_url, "sha": body.photo_sha256})
    return success_envelope({"updated": True})


class TenureUpdate(BaseModel):
    land_tenure: Optional[str] = Field(None, max_length=60)


@router.put("/passport/me/farm/{farm_id}/tenure")
async def set_farm_tenure(farm_id: str, body: TenureUpdate,
                          db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Set land tenure for one of the farmer's farms (e.g. iTaukei lease / Freehold /
    Crown lease) — a high-value signal for lenders. RLS scopes the UPDATE to the tenant."""
    res = await db.execute(text(
        "UPDATE tenant.farms SET land_tenure = :t WHERE farm_id = :f AND is_active = TRUE"),
        {"t": (body.land_tenure or None), "f": farm_id})
    if res.rowcount == 0:
        from fastapi import HTTPException
        raise HTTPException(404, detail="Farm not found")
    return success_envelope({"farm_id": farm_id, "land_tenure": body.land_tenure})


@router.post("/passport/me/trust/refresh")
async def refresh_my_trust(user: dict = Depends(get_current_user)):
    """On-demand Trust Engine recompute for this tenant. Runs the SAME sync compute path
    as the nightly worker, off the event loop (run_in_threadpool). Snapshots are then
    read by GET /passport/me (Inviolable #3 — the page never computes inline)."""
    from app.workers.trust_worker import refresh_tenant
    try:
        written = await run_in_threadpool(refresh_tenant, str(user["tenant_id"]))
        return success_envelope({"refreshed": True, "dimensions": written})
    except Exception:  # noqa: BLE001 — never leak internals (Inviolable #6)
        return success_envelope({"refreshed": False, "error": "Couldn't refresh trust right now"})

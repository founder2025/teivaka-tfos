"""Teivaka Jobs board — agri-sector employment marketplace (mounted at /api/v1).

Any member posts JOB LISTINGS; any member sets a worker profile + applies. On HIRE the
accepted applicant can be added to the employer's Labour page (tenant.workers) — the
jobs → hire → attendance → wages → Bank Evidence loop. Mirrors service_jobs: global
community.* tables (cross-tenant), ownership-guarded mutations, no self-apply.

Seeker:
  GET/PUT /worker-profile
  GET  /job-listings/available        OPEN listings (filter + distance if profile coords)
  POST /job-listings/{id}/apply       apply (once; not your own listing)
  GET  /my-applications               my applications
  PATCH /job-applications/{id}/withdraw

Employer (poster):
  POST  /job-listings                 post a role
  GET   /job-listings/mine            listings I posted
  GET   /job-listings/{id}/applications  applicants (poster-gated; contact revealed)
  PATCH /job-applications/{id}/decide ?status=SHORTLISTED|DECLINED
  POST  /job-listings/{id}/hire       accept an applicant (+ optional Labour worker create)
  PATCH /job-listings/{id}/status     ?status=OPEN|CLOSED|FILLED

FILED (fast-follow, not faked): notify matching seekers on post (in-app + WhatsApp — reuse
service_jobs._whatsapp_blast); server-side min-wage hard validation; worker/employer
reliability; map view. Phase 1 ships the marketplace + the Labour hire bridge for real.
"""
import logging
import math
import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

_EMPLOYMENT = ("CASUAL", "PERMANENT", "CONTRACT", "SEASONAL", "APPRENTICE")
_PERIOD = ("HOUR", "DAY", "WEEK", "MONTH", "PIECE", "NEGOTIABLE")
_SECTORS = ("FARM_LABOUR", "AGRIBUSINESS", "SUPPLIER", "PROCESSING", "TRANSPORT", "EXTENSION", "OTHER")


def _rows(res):
    return [dict(r) for r in res.mappings().all()]


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    try:
        r = 6371.0
        p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
        dp = math.radians(float(lat2) - float(lat1))
        dl = math.radians(float(lng2) - float(lng1))
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return round(r * 2 * math.asin(math.sqrt(a)), 1)
    except Exception:  # noqa: BLE001
        return None


# ───────────────────────── worker (seeker) profile ─────────────────────────
class WorkerProfile(BaseModel):
    display_name: Optional[str] = None
    skills: List[str] = []
    experience_note: Optional[str] = None
    location: Optional[str] = None
    base_lat: Optional[float] = None
    base_lng: Optional[float] = None
    available_from: Optional[date] = None
    desired_types: List[str] = []
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    is_active: bool = True


@router.get("/worker-profile")
async def get_worker_profile(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "SELECT * FROM community.worker_profiles WHERE user_id = :u"),
            {"u": str(user["user_id"])})).mappings().first()
        return {"data": dict(row) if row else None}


@router.put("/worker-profile")
async def upsert_worker_profile(body: WorkerProfile, user: dict = Depends(get_current_user)):
    bad = [t for t in body.desired_types if t not in _EMPLOYMENT]
    if bad:
        raise HTTPException(400, detail=f"desired_types must be from {_EMPLOYMENT}")
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.worker_profiles
                (user_id, tenant_id, display_name, skills, experience_note, location,
                 base_lat, base_lng, available_from, desired_types, phone, whatsapp, is_active, updated_at)
            VALUES (:u, :t, :dn, :sk, :ex, :loc, :lat, :lng, :af, :dt, :ph, :wa, :ia, now())
            ON CONFLICT (user_id) DO UPDATE SET
                display_name=:dn, skills=:sk, experience_note=:ex, location=:loc,
                base_lat=:lat, base_lng=:lng, available_from=:af, desired_types=:dt,
                phone=:ph, whatsapp=:wa, is_active=:ia, updated_at=now()
        """), {"u": str(user["user_id"]), "t": str(user["tenant_id"]), "dn": body.display_name,
               "sk": body.skills, "ex": body.experience_note, "loc": body.location,
               "lat": body.base_lat, "lng": body.base_lng, "af": body.available_from,
               "dt": body.desired_types, "ph": body.phone, "wa": body.whatsapp, "ia": body.is_active})
        await db.commit()
    return {"data": {"ok": True}}


# ───────────────────────── listings ─────────────────────────
class ListingCreate(BaseModel):
    role_title: str
    sector: Optional[str] = "FARM_LABOUR"
    employment_type: str = "CASUAL"
    positions: int = 1
    location: Optional[str] = None
    region: Optional[str] = None
    base_lat: Optional[float] = None
    base_lng: Optional[float] = None
    pay_rate_fjd: Optional[Decimal] = None
    pay_period: Optional[str] = "DAY"
    pay_negotiable: bool = False
    skills_required: List[str] = []
    experience_required: Optional[str] = None
    start_date: Optional[date] = None
    duration_note: Optional[str] = None
    description: Optional[str] = None
    apply_deadline: Optional[date] = None
    poster_org_name: Optional[str] = None


@router.post("/job-listings", status_code=201)
async def create_listing(body: ListingCreate, user: dict = Depends(get_current_user)):
    if not body.role_title.strip():
        raise HTTPException(422, detail="A role title is required")
    if body.employment_type not in _EMPLOYMENT:
        raise HTTPException(400, detail=f"employment_type must be from {_EMPLOYMENT}")
    if body.pay_period and body.pay_period not in _PERIOD:
        raise HTTPException(400, detail=f"pay_period must be from {_PERIOD}")
    if body.sector and body.sector not in _SECTORS:
        raise HTTPException(400, detail=f"sector must be from {_SECTORS}")
    lid = f"JOB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:5].upper()}"
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.job_listings
                (listing_id, poster_tenant_id, poster_user_id, poster_org_name, sector, role_title,
                 employment_type, positions, location, region, base_lat, base_lng, pay_rate_fjd,
                 pay_period, pay_negotiable, skills_required, experience_required, start_date,
                 duration_note, description, apply_deadline, status)
            VALUES (:id,:tid,:uid,:org,:sec,:role,:et,:pos,:loc,:reg,:lat,:lng,:rate,:per,:neg,:sk,:exp,:sd,:dur,:desc,:dl,'OPEN')
        """), {"id": lid, "tid": str(user["tenant_id"]), "uid": str(user["user_id"]), "org": body.poster_org_name,
               "sec": body.sector, "role": body.role_title.strip(), "et": body.employment_type, "pos": max(1, body.positions),
               "loc": body.location, "reg": body.region, "lat": body.base_lat, "lng": body.base_lng,
               "rate": body.pay_rate_fjd, "per": (None if body.pay_negotiable else body.pay_period), "neg": body.pay_negotiable,
               "sk": body.skills_required, "exp": body.experience_required, "sd": body.start_date,
               "dur": body.duration_note, "desc": body.description, "dl": body.apply_deadline})
        await db.commit()
    return {"data": {"listing_id": lid, "status": "OPEN"}}


@router.get("/job-listings/available")
async def available_listings(employment_type: str = Query(None), sector: str = Query(None),
                             region: str = Query(None), user: dict = Depends(get_current_user)):
    """OPEN, not-expired listings, newest first; distance-annotated when the seeker has coords."""
    async with get_db_ctx() as db:
        prof = (await db.execute(text(
            "SELECT base_lat, base_lng FROM community.worker_profiles WHERE user_id = :u"),
            {"u": str(user["user_id"])})).mappings().first()
        # JB2: hide listings whose apply-by date has passed.
        cl, p = ["status = 'OPEN'", "(apply_deadline IS NULL OR apply_deadline >= CURRENT_DATE)"], {}
        if employment_type:
            cl.append("employment_type = :et"); p["et"] = employment_type
        if sector:
            cl.append("sector = :sec"); p["sec"] = sector
        if region:
            cl.append("(region ILIKE :reg OR location ILIKE :reg)"); p["reg"] = f"%{region}%"
        # JA10: explicit columns (no SELECT * — don't leak poster_tenant_id etc. network-wide).
        rows = _rows(await db.execute(text(
            f"""SELECT listing_id, poster_user_id, poster_org_name, sector, role_title, employment_type,
                       positions, location, region, base_lat, base_lng, pay_rate_fjd, pay_period,
                       pay_negotiable, skills_required, experience_required, start_date, duration_note,
                       description, apply_deadline, status, created_at,
                       ut.level AS poster_trust_level, ut.avg_rating AS poster_avg_rating,
                       ut.review_count AS poster_review_count,
                       (fp.placement_id IS NOT NULL) AS is_featured
                FROM community.job_listings
                LEFT JOIN community.user_trust ut ON ut.user_id = poster_user_id
                LEFT JOIN community.featured_placements fp
                       ON fp.target_type = 'JOB_LISTING' AND fp.target_id = listing_id AND fp.featured_until > now()
                WHERE {' AND '.join(cl)} ORDER BY created_at DESC LIMIT 200"""), p))
        my_apps = {r["listing_id"] for r in _rows(await db.execute(text(
            "SELECT listing_id FROM community.job_applications WHERE applicant_user_id = :u"),
            {"u": str(user["user_id"])}))}
        for r in rows:
            r["distance_km"] = _haversine_km(prof["base_lat"], prof["base_lng"], r["base_lat"], r["base_lng"]) if prof else None
            r["already_applied"] = r["listing_id"] in my_apps
            r.pop("base_lat", None); r.pop("base_lng", None)  # coords used for distance only, not exposed
        rows.sort(key=lambda x: (not x.get("is_featured"), x["distance_km"] is None, x["distance_km"] or 0))
        return {"data": rows, "has_profile": bool(prof)}


@router.get("/job-listings/mine")
async def my_listings(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = _rows(await db.execute(text("""
            SELECT l.*, (SELECT count(*) FROM community.job_applications a
                         WHERE a.listing_id = l.listing_id AND a.status <> 'WITHDRAWN') AS applicant_count
            FROM community.job_listings l WHERE l.poster_user_id = :u ORDER BY l.created_at DESC"""),
            {"u": str(user["user_id"])}))
        return {"data": rows}


@router.patch("/job-listings/{listing_id}/status")
async def set_listing_status(listing_id: str, status: str = Query(...), user: dict = Depends(get_current_user)):
    if status not in ("OPEN", "CLOSED", "FILLED"):
        raise HTTPException(400, detail="status must be OPEN|CLOSED|FILLED")
    async with get_db_ctx() as db:
        ok = (await db.execute(text(
            "UPDATE community.job_listings SET status=:s, updated_at=now() "
            "WHERE listing_id=:l AND poster_user_id=:u RETURNING listing_id"),
            {"s": status, "l": listing_id, "u": str(user["user_id"])})).scalar()
        if not ok:
            raise HTTPException(404, detail="Listing not found")
        await db.commit()
    return {"data": {"listing_id": listing_id, "status": status}}


@router.patch("/job-listings/{listing_id}")
async def edit_listing(listing_id: str, body: ListingCreate, user: dict = Depends(get_current_user)):
    """Poster-gated full edit of a listing's fields (JA8 — fix a typo without close+repost)."""
    if not body.role_title.strip():
        raise HTTPException(422, detail="A role title is required")
    if body.employment_type not in _EMPLOYMENT:
        raise HTTPException(400, detail=f"employment_type must be from {_EMPLOYMENT}")
    if body.pay_period and body.pay_period not in _PERIOD:
        raise HTTPException(400, detail=f"pay_period must be from {_PERIOD}")
    if body.sector and body.sector not in _SECTORS:
        raise HTTPException(400, detail=f"sector must be from {_SECTORS}")
    async with get_db_ctx() as db:
        await _assert_owns_listing(db, listing_id, user)
        await db.execute(text("""
            UPDATE community.job_listings SET
                role_title=:role, sector=:sec, employment_type=:et, positions=:pos, location=:loc,
                region=:reg, base_lat=:lat, base_lng=:lng, pay_rate_fjd=:rate,
                pay_period=:per, pay_negotiable=:neg, skills_required=:sk, experience_required=:exp,
                start_date=:sd, duration_note=:dur, description=:desc, apply_deadline=:dl,
                poster_org_name=:org, updated_at=now()
            WHERE listing_id=:id AND poster_user_id=:u
        """), {"id": listing_id, "u": str(user["user_id"]), "role": body.role_title.strip(), "sec": body.sector,
               "et": body.employment_type, "pos": max(1, body.positions), "loc": body.location, "reg": body.region,
               "lat": body.base_lat, "lng": body.base_lng, "rate": body.pay_rate_fjd,
               "per": (None if body.pay_negotiable else body.pay_period), "neg": body.pay_negotiable,
               "sk": body.skills_required, "exp": body.experience_required, "sd": body.start_date,
               "dur": body.duration_note, "desc": body.description, "dl": body.apply_deadline, "org": body.poster_org_name})
        await db.commit()
    return {"data": {"listing_id": listing_id, "ok": True}}


# ───────────────────────── applications ─────────────────────────
class ApplyBody(BaseModel):
    cover_note: Optional[str] = None


@router.post("/job-listings/{listing_id}/apply", status_code=201)
async def apply_to_listing(listing_id: str, body: ApplyBody, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        listing = (await db.execute(text(
            "SELECT poster_user_id, role_title, status, apply_deadline FROM community.job_listings WHERE listing_id = :l"),
            {"l": listing_id})).mappings().first()
        if not listing:
            raise HTTPException(404, detail="Listing not found")
        if listing["status"] != "OPEN":
            raise HTTPException(409, detail="This listing is no longer open")
        if listing["apply_deadline"] is not None and listing["apply_deadline"] < date.today():
            raise HTTPException(409, detail="The application deadline for this listing has passed")
        if str(listing["poster_user_id"]) == str(user["user_id"]):
            raise HTTPException(400, detail="You can't apply to your own listing")
        dup = (await db.execute(text(
            "SELECT 1 FROM community.job_applications WHERE listing_id=:l AND applicant_user_id=:u"),
            {"l": listing_id, "u": str(user["user_id"])})).first()
        if dup:
            raise HTTPException(409, detail="You've already applied to this listing")
        aid = f"APP-{uuid.uuid4().hex[:8].upper()}"
        try:
            await db.execute(text("""
                INSERT INTO community.job_applications
                    (application_id, listing_id, applicant_tenant_id, applicant_user_id, cover_note)
                VALUES (:a, :l, :t, :u, :cn)
            """), {"a": aid, "l": listing_id, "t": str(user["tenant_id"]), "u": str(user["user_id"]),
                   "cn": (body.cover_note or None)})
            from app.routers.feed import _notify  # lazy import avoids load-time cycle
            await _notify(db, listing["poster_user_id"], user["user_id"], "JOB_APPLIED",
                          body=f"New applicant for your job: {listing['role_title']}")
            await db.commit()
        except IntegrityError:  # unique(listing_id, applicant) race
            raise HTTPException(409, detail="You've already applied to this listing")
    return {"data": {"application_id": aid, "status": "APPLIED"}}


@router.get("/my-applications")
async def my_applications(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = _rows(await db.execute(text("""
            SELECT a.application_id, a.status, a.applied_at, a.cover_note,
                   l.listing_id, l.role_title, l.employment_type, l.location, l.pay_rate_fjd,
                   l.pay_period, l.pay_negotiable, l.poster_org_name,
                   CASE WHEN a.status = 'ACCEPTED' THEN l.poster_org_name ELSE NULL END AS contact_org,
                   CASE WHEN a.status = 'ACCEPTED' THEN l.poster_user_id::text ELSE NULL END AS poster_user_id,
                   EXISTS (SELECT 1 FROM community.marketplace_reviews r
                           WHERE r.order_id = :rk_pfx || a.application_id || :rk_sfx) AS worker_reviewed
            FROM community.job_applications a JOIN community.job_listings l ON l.listing_id = a.listing_id
            WHERE a.applicant_user_id = :u ORDER BY a.applied_at DESC"""),
            {"u": str(user["user_id"]), "rk_pfx": "JOB:", "rk_sfx": ":by-worker"}))
        return {"data": rows}


# ───────────────────────── reviews (WH3, two-sided) ─────────────────────────
# Employer↔worker reviews ride the SHARED reputation table (community.marketplace_reviews)
# via a synthetic order_id key, so they feed the SAME trust ladder + ★ badge as sales
# (compute_trust + the beat both count marketplace_reviews.seller_user_id). No new table.
class ReviewBody(BaseModel):
    rating: int
    comment: Optional[str] = None


async def _recount_reviews(db, subject_user_id):
    """Recount ALL reviews about a user (sales + work share one table) into the user_trust
    cache so the ★ updates immediately (the beat also maintains it)."""
    agg = (await db.execute(text(
        "SELECT count(*) AS n, avg(rating) AS a FROM community.marketplace_reviews "
        "WHERE seller_user_id = cast(:s AS uuid)"), {"s": str(subject_user_id)})).mappings().first()
    await db.execute(text("""
        INSERT INTO community.user_trust (user_id, review_count, avg_rating)
        VALUES (cast(:s AS uuid), :n, :a)
        ON CONFLICT (user_id) DO UPDATE SET review_count = EXCLUDED.review_count, avg_rating = EXCLUDED.avg_rating
    """), {"s": str(subject_user_id), "n": int(agg["n"]), "a": agg["a"]})


@router.post("/job-applications/{application_id}/review")
async def review_application(application_id: str, body: ReviewBody, user: dict = Depends(get_current_user)):
    """Two-sided: the employer (poster) or the hired worker (accepted applicant) reviews the
    other, once the application is ACCEPTED. One review per direction (synthetic-key UNIQUE)."""
    if not (1 <= int(body.rating) <= 5):
        raise HTTPException(422, detail="Rating must be 1–5")
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        row = (await db.execute(text("""
            SELECT a.applicant_user_id, a.status, l.poster_user_id, l.listing_id, l.role_title
            FROM community.job_applications a JOIN community.job_listings l ON l.listing_id = a.listing_id
            WHERE a.application_id = :a"""), {"a": application_id})).mappings().first()
        if not row:
            raise HTTPException(404, detail="Application not found")
        if row["status"] != "ACCEPTED":
            raise HTTPException(400, detail="You can review once the hire is confirmed")
        if uid == str(row["poster_user_id"]):
            subject, key = str(row["applicant_user_id"]), f"JOB:{application_id}:by-employer"
        elif uid == str(row["applicant_user_id"]):
            subject, key = str(row["poster_user_id"]), f"JOB:{application_id}:by-worker"
        else:
            raise HTTPException(403, detail="Only the employer or the hired worker can review")
        if (await db.execute(text("SELECT 1 FROM community.marketplace_reviews WHERE order_id = :k"), {"k": key})).first():
            raise HTTPException(409, detail="You've already reviewed this")
        await db.execute(text("""
            INSERT INTO community.marketplace_reviews (order_id, listing_id, seller_user_id, reviewer_user_id, rating, comment)
            VALUES (:k, :lid, cast(:s AS uuid), cast(:r AS uuid), :rat, :c)
        """), {"k": key, "lid": row["listing_id"], "s": subject, "r": uid, "rat": int(body.rating), "c": (body.comment or None)})
        await _recount_reviews(db, subject)
        try:
            from app.routers.feed import _notify
            await _notify(db, subject, uid, "JOB_REVIEW", f"You received a {int(body.rating)}★ review on {row['role_title']}.")
        except Exception as e:  # noqa: BLE001
            logger.warning("job review notify failed: %s", e)
        await db.commit()
    return {"data": {"application_id": application_id, "rating": int(body.rating)}}


@router.patch("/job-applications/{application_id}/withdraw")
async def withdraw_application(application_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        ok = (await db.execute(text(
            "UPDATE community.job_applications SET status='WITHDRAWN', decided_at=now() "
            "WHERE application_id=:a AND applicant_user_id=:u AND status IN ('APPLIED','SHORTLISTED') RETURNING application_id"),
            {"a": application_id, "u": str(user["user_id"])})).scalar()
        if not ok:
            raise HTTPException(404, detail="Application not found or can't be withdrawn")
        await db.commit()
    return {"data": {"application_id": application_id, "status": "WITHDRAWN"}}


async def _assert_owns_listing(db, listing_id, user):
    row = (await db.execute(text(
        "SELECT poster_user_id FROM community.job_listings WHERE listing_id = :l"),
        {"l": listing_id})).mappings().first()
    if not row:
        raise HTTPException(404, detail="Listing not found")
    if str(row["poster_user_id"]) != str(user["user_id"]):
        raise HTTPException(403, detail="Only the poster can manage this listing")


@router.get("/job-listings/{listing_id}/applications")
async def listing_applications(listing_id: str, user: dict = Depends(get_current_user)):
    """Poster-gated. Reveals applicant contact only on ACCEPTED (no off-platform leak pre-hire)."""
    async with get_db_ctx() as db:
        await _assert_owns_listing(db, listing_id, user)
        rows = _rows(await db.execute(text("""
            SELECT a.application_id, a.status, a.applied_at, a.cover_note, a.applicant_user_id,
                   w.display_name, w.skills, w.experience_note, w.location, w.available_from,
                   CASE WHEN a.status = 'ACCEPTED' THEN w.phone ELSE NULL END AS phone,
                   CASE WHEN a.status = 'ACCEPTED' THEN w.whatsapp ELSE NULL END AS whatsapp,
                   ut.level AS applicant_trust_level, ut.avg_rating AS applicant_avg_rating,
                   ut.review_count AS applicant_review_count,
                   EXISTS (SELECT 1 FROM community.marketplace_reviews r
                           WHERE r.order_id = :rk_pfx || a.application_id || :rk_sfx) AS employer_reviewed
            FROM community.job_applications a
            LEFT JOIN community.worker_profiles w ON w.user_id = a.applicant_user_id
            LEFT JOIN community.user_trust ut ON ut.user_id = a.applicant_user_id
            WHERE a.listing_id = :l AND a.status <> 'WITHDRAWN' ORDER BY a.applied_at ASC"""),
            {"l": listing_id, "rk_pfx": "JOB:", "rk_sfx": ":by-employer"}))
        return {"data": rows}


@router.patch("/job-applications/{application_id}/decide")
async def decide_application(application_id: str, status: str = Query(...), user: dict = Depends(get_current_user)):
    if status not in ("SHORTLISTED", "DECLINED"):
        raise HTTPException(400, detail="status must be SHORTLISTED|DECLINED")
    async with get_db_ctx() as db:
        app = (await db.execute(text("""
            SELECT a.application_id, a.applicant_user_id, l.poster_user_id, l.role_title
            FROM community.job_applications a
            JOIN community.job_listings l ON l.listing_id = a.listing_id WHERE a.application_id = :a"""),
            {"a": application_id})).mappings().first()
        if not app:
            raise HTTPException(404, detail="Application not found")
        if str(app["poster_user_id"]) != str(user["user_id"]):
            raise HTTPException(403, detail="Only the poster can decide on applicants")
        await db.execute(text(
            "UPDATE community.job_applications SET status=:s, decided_at=now() WHERE application_id=:a"),
            {"s": status, "a": application_id})
        from app.routers.feed import _notify  # lazy import avoids load-time cycle
        ntype = "JOB_SHORTLISTED" if status == "SHORTLISTED" else "JOB_DECLINED"
        msg = (f"You were shortlisted for {app['role_title']}" if status == "SHORTLISTED"
               else f"Your application for {app['role_title']} wasn't successful this time")
        await _notify(db, app["applicant_user_id"], user["user_id"], ntype, body=msg)
        await db.commit()
    return {"data": {"application_id": application_id, "status": status}}


# ───────────────────────── hire (→ Labour bridge) ─────────────────────────
class HireBody(BaseModel):
    application_id: str
    add_to_labour: bool = True          # create a tenant.workers row for the employer
    farm_id: Optional[str] = None
    daily_rate_fjd: Optional[Decimal] = None
    worker_type: Optional[str] = None   # PERMANENT|CASUAL|CONTRACT (Labour vocab)


@router.post("/job-listings/{listing_id}/hire")
async def hire_applicant(listing_id: str, body: HireBody, user: dict = Depends(get_current_user)):
    """Accept an applicant. Optionally drop them into the employer's Labour page as a worker
    (the jobs→attendance→wages loop) via the real, audited worker-create path."""
    async with get_db_ctx() as db:
        await _assert_owns_listing(db, listing_id, user)
        app = (await db.execute(text(
            "SELECT a.application_id, a.applicant_user_id, a.status, l.role_title "
            "FROM community.job_applications a JOIN community.job_listings l ON l.listing_id = a.listing_id "
            "WHERE a.application_id=:a AND a.listing_id=:l"), {"a": body.application_id, "l": listing_id})).mappings().first()
        if not app:
            raise HTTPException(404, detail="Application not found for this listing")
        if app["status"] == "ACCEPTED":  # JA17: idempotent — never re-hire (would duplicate the worker)
            raise HTTPException(409, detail="This applicant is already hired")
        if app["status"] in ("DECLINED", "WITHDRAWN"):
            raise HTTPException(409, detail="That applicant is no longer available")
        prof = (await db.execute(text(
            "SELECT display_name, phone, whatsapp FROM community.worker_profiles WHERE user_id=:u"),
            {"u": str(app["applicant_user_id"])})).mappings().first()
        await db.execute(text(
            "UPDATE community.job_applications SET status='ACCEPTED', decided_at=now() WHERE application_id=:a"),
            {"a": body.application_id})
        # JB1: once accepted hires reach the advertised positions, mark the listing FILLED.
        await db.execute(text("""
            UPDATE community.job_listings SET status='FILLED', updated_at=now()
            WHERE listing_id=:l AND status='OPEN'
              AND (SELECT count(*) FROM community.job_applications
                   WHERE listing_id=:l AND status='ACCEPTED') >= positions
        """), {"l": listing_id})
        from app.routers.feed import _notify  # lazy import avoids load-time cycle
        await _notify(db, app["applicant_user_id"], user["user_id"], "JOB_HIRED",
                      body=f"🎉 You're hired for {app['role_title']}! Open it to view the employer and message them.")
        await db.commit()

    # Bank-verifiable record of the hire (Match/Notify Slice 3) — emitted on the
    # employer's hash-chained audit in its own RLS-scoped block, AFTER the hire is
    # committed, and best-effort so an audit hiccup can never break a completed hire.
    try:
        from uuid import UUID
        from app.db.session import get_rls_db
        from app.core.audit_chain import emit_audit_event
        async with get_rls_db(str(user["tenant_id"])) as adb:
            await emit_audit_event(
                db=adb, tenant_id=UUID(str(user["tenant_id"])), event_type="JOB_HIRED",
                payload={"listing_id": listing_id, "application_id": body.application_id,
                         "applicant_user_id": str(app["applicant_user_id"]), "role_title": app["role_title"]},
                actor_user_id=UUID(str(user["user_id"])),
                entity_type="job_application", entity_id=body.application_id)
    except Exception:  # noqa: BLE001 — hire already committed; audit is best-effort
        pass

    worker_result = None
    worker_error = None
    if body.add_to_labour and body.farm_id and body.daily_rate_fjd is not None:
        # Reuse the real, audited Labour worker-create path (its own role gate + audit emit).
        try:
            from app.routers.workers import create_worker, WorkerCreate
            wc = WorkerCreate(
                farm_id=body.farm_id,
                full_name=(prof["display_name"] if prof and prof.get("display_name") else "New hire"),
                contact_number=(prof.get("phone") if prof else None),
                whatsapp_number=(prof.get("whatsapp") if prof else None),
                daily_rate_fjd=body.daily_rate_fjd,
                worker_type=(body.worker_type or "CASUAL"),
                notes=f"Hired via Jobs · {listing_id}",  # JA25 provenance
            )
            worker_result = await create_worker(wc, user)
        except HTTPException as e:
            worker_error = e.detail if isinstance(e.detail, str) else "Could not add to Labour"
        except Exception:  # noqa: BLE001
            worker_error = "Could not add to Labour"

    return {"data": {"application_id": body.application_id, "status": "ACCEPTED",
                     "worker": (worker_result.get("data") if isinstance(worker_result, dict) else None),
                     "worker_error": worker_error}}

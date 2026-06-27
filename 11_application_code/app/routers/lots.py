"""Consignment / Lot traceability — trace a shipment block→inputs→harvest→buyer (TATI).

Answers the exporter's bar: "what went in, where, how grown, traced and proven." A lot
bundles per-harvest allocations (many-to-many, double-count-proof) into a consignment for
a named buyer, with a public token-gated trace page (QR on the delivery docket).

Owner side (authed, RLS via get_tenant_db):
  GET  /lots/available-harvests   POST /lots   GET /lots   GET /lots/{id}   POST /lots/{id}/deliver
Public trace (unauth, token-gated):
  GET /verify/lot/{token}   (HTML — reuses the public /verify/ prefix, no new infra)

PROOF model (v1): the lot's proof is its constituent harvests' existing hash-chained rows +
their WHD compliance flag. The lot composition itself is RLS-protected and freezes on deliver;
hash-chaining LOT_DELIVERED into audit.events is a later phase.
"""
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope

router = APIRouter()       # /lots (authed)
html_router = APIRouter()  # /verify/lot/{token} (public)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

_TOL = 0.05  # kg tolerance — wet harvest vs graded delivery shouldn't false-flag


def _now():
    return datetime.now(timezone.utc)


# ───────────────────────── schemas ─────────────────────────
class LotItemIn(BaseModel):
    harvest_id: str
    harvest_date: str            # YYYY-MM-DD (hypertable PK component)
    kg: float = Field(..., gt=0)


class LotCreate(BaseModel):
    crop_name: Optional[str] = Field(None, max_length=120)   # auto-derived from harvests if omitted
    buyer_id: Optional[str] = None
    buyer_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)
    items: list[LotItemIn]
    deliver_now: bool = False   # one-step create + deliver (handing goods over right now)
    force: bool = False         # ship uncleared harvests on a deliver_now (documented decision)


class LotDeliver(BaseModel):
    buyer_id: Optional[str] = None
    buyer_name: Optional[str] = Field(None, max_length=200)
    force: bool = False   # override an uncleared-harvest warning (documented decision)


# ───────────────────────── owner side ─────────────────────────
@router.get("/lots/available-harvests")
async def available_harvests(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Harvests with un-allocated kg remaining — the pool a farmer builds a lot from."""
    # Speed: single GROUP BY pass (was a correlated subquery per row).
    rows = (await db.execute(text("""
        SELECT h.harvest_id, h.harvest_date, h.gross_yield_kg, h.pu_id, h.production_id,
               h.chemical_compliance_cleared, p.production_name, pu.pu_name,
               COALESCE(SUM(li.kg), 0) AS allocated
        FROM tenant.harvest_log h
        LEFT JOIN shared.productions p ON p.production_id = h.production_id
        LEFT JOIN tenant.production_units pu ON pu.pu_id = h.pu_id
        LEFT JOIN tenant.lot_items li ON li.harvest_id = h.harvest_id
        GROUP BY h.harvest_id, h.harvest_date, h.gross_yield_kg, h.pu_id, h.production_id,
                 h.chemical_compliance_cleared, p.production_name, pu.pu_name
        ORDER BY h.harvest_date DESC
        LIMIT 300
    """))).mappings().all()
    out = []
    for r in rows:
        remaining = float(r["gross_yield_kg"] or 0) - float(r["allocated"] or 0)
        if remaining <= _TOL:
            continue
        out.append({
            "harvest_id": str(r["harvest_id"]), "harvest_date": r["harvest_date"].isoformat() if r["harvest_date"] else None,
            "production_name": r["production_name"], "pu_name": r["pu_name"],
            "gross_yield_kg": round(float(r["gross_yield_kg"] or 0), 2),
            "remaining_kg": round(remaining, 2),
            "compliance_cleared": bool(r["chemical_compliance_cleared"]),
        })
    return success_envelope({"harvests": out})


@router.post("/lots")
async def create_lot(body: LotCreate, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(400, detail="A consignment needs at least one harvest allocation.")
    crop_name = body.crop_name
    total = 0.0
    crops_seen: set[str] = set()
    req_by_harvest: dict[str, float] = {}   # within-request allocation, so duplicates don't double-spend
    # Validate each allocation against the harvest's remaining (un-allocated) quantity.
    # P0-1: lock the harvest row FOR UPDATE so two concurrent consignments can't both
    # pass the remaining-check and double-sell the same kg (serialize on the harvest row).
    uncleared = False
    for it in body.items:
        # P0-1: serialize per-harvest with a txn-scoped advisory lock (robust on the
        # harvest_log hypertable, where row FOR UPDATE is unreliable). Released on commit.
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:hid))"), {"hid": it.harvest_id})
        h = (await db.execute(text("""
            SELECT gross_yield_kg, chemical_compliance_cleared, production_id
            FROM tenant.harvest_log
            WHERE harvest_id = :hid AND harvest_date = cast(:hd AS date)
        """), {"hid": it.harvest_id, "hd": it.harvest_date})).mappings().first()
        if not h:
            raise HTTPException(404, detail=f"Harvest {it.harvest_id} not found.")
        if h["chemical_compliance_cleared"] is False:
            uncleared = True
        pname = (await db.execute(text(
            "SELECT production_name FROM shared.productions WHERE production_id = :pid"),
            {"pid": h["production_id"]})).scalar()
        allocated = (await db.execute(text(
            "SELECT COALESCE(SUM(kg),0) FROM tenant.lot_items WHERE harvest_id = :hid"),
            {"hid": it.harvest_id})).scalar() or 0
        remaining = float(h["gross_yield_kg"] or 0) - float(allocated) - req_by_harvest.get(it.harvest_id, 0.0)
        if it.kg > remaining + _TOL:
            raise HTTPException(400, detail=f"Over-allocation: {it.kg} kg requested but only {round(remaining,2)} kg remains on that harvest.")
        req_by_harvest[it.harvest_id] = req_by_harvest.get(it.harvest_id, 0.0) + it.kg
        total += it.kg
        if pname:
            crops_seen.add(pname)
        if not crop_name and pname:
            crop_name = pname
    # P1-6 (label integrity): a consignment must be a single commodity.
    if len(crops_seen) > 1:
        raise HTTPException(400, detail=f"A consignment must be one crop — these harvests span {', '.join(sorted(crops_seen))}. Create one lot per crop.")
    # One-step deliver re-validates like /deliver (mass balance is guaranteed by the per-item checks).
    if body.deliver_now and uncleared and not body.force:
        raise HTTPException(409, detail=(
            "One or more source harvests are not chemical-withholding cleared. "
            "Set force=true to deliver anyway (recorded as your decision)."))

    status = "DELIVERED" if body.deliver_now else "DRAFT"
    token = secrets.token_urlsafe(18)
    lot_code = "LOT-" + secrets.token_hex(4).upper()
    lot_id = (await db.execute(text("""
        INSERT INTO tenant.lots (tenant_id, owner_user_id, lot_code, crop_name, buyer_id, buyer_name,
                                 status, total_kg, delivered_at, trace_token, notes)
        VALUES (cast(:t AS uuid), cast(:u AS uuid), :code, :crop,
                CASE WHEN :bid = '' THEN NULL ELSE cast(:bid AS uuid) END, :bname,
                :status, :tot, CASE WHEN :deliv THEN now() ELSE NULL END, :tok, :notes)
        RETURNING lot_id
    """), {"t": str(user["tenant_id"]), "u": str(user["user_id"]), "code": lot_code, "crop": crop_name,
           "bid": (body.buyer_id or ""), "bname": body.buyer_name, "tot": round(total, 2),
           "status": status, "deliv": body.deliver_now, "tok": token, "notes": body.notes})).scalar()
    for it in body.items:
        await db.execute(text("""
            INSERT INTO tenant.lot_items (lot_id, tenant_id, harvest_id, harvest_date, kg)
            VALUES (cast(:l AS uuid), cast(:t AS uuid), :hid, cast(:hd AS date), :kg)
        """), {"l": str(lot_id), "t": str(user["tenant_id"]), "hid": it.harvest_id, "hd": it.harvest_date, "kg": it.kg})

    return success_envelope({
        "lot_id": str(lot_id), "lot_code": lot_code, "total_kg": round(total, 2), "status": status,
        "token": token, "trace_url": f"https://teivaka.com/verify/lot/{token}",
    })


@router.get("/lots")
async def list_lots(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT lot_id, lot_code, crop_name, buyer_name, status, total_kg, delivered_at, created_at,
               trace_token, trace_revoked_at
        FROM tenant.lots ORDER BY created_at DESC LIMIT 100
    """))).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        d["lot_id"] = str(d["lot_id"]); d["total_kg"] = float(d["total_kg"] or 0)
        for k in ("delivered_at", "created_at"):
            d[k] = d[k].isoformat() if d[k] else None
        tok = d.pop("trace_token")
        d["trace_revoked"] = d.pop("trace_revoked_at") is not None
        d["trace_url"] = f"https://teivaka.com/verify/lot/{tok}"
        out.append(d)
    return success_envelope({"lots": out})


@router.post("/lots/{lot_id}/revoke-trace")
async def revoke_trace(lot_id: str, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """P0-3 kill switch — revoke a leaked/printed consignment trace link."""
    res = await db.execute(text(
        "UPDATE tenant.lots SET trace_revoked_at = now() WHERE lot_id = cast(:l AS uuid) AND trace_revoked_at IS NULL"),
        {"l": lot_id})
    if res.rowcount == 0:
        raise HTTPException(404, detail="Lot not found or already revoked")
    return success_envelope({"lot_id": lot_id, "trace_revoked": True})


async def _assemble_lot(db: AsyncSession, lot_id: str) -> Optional[dict]:
    """Assemble the full trace bundle under the active RLS context. Reused by owner + public."""
    lot = (await db.execute(text("""
        SELECT lot_id, lot_code, crop_name, buyer_name, status, total_kg, delivered_at, created_at, notes
        FROM tenant.lots WHERE lot_id = cast(:l AS uuid)
    """), {"l": lot_id})).mappings().first()
    if not lot:
        return None
    items = (await db.execute(text("""
        SELECT li.harvest_id, li.harvest_date, li.kg,
               h.gross_yield_kg, h.pu_id, h.production_id, h.chemical_compliance_cleared,
               pu.pu_name, pu.latitude, pu.longitude
        FROM tenant.lot_items li
        LEFT JOIN tenant.harvest_log h ON h.harvest_id = li.harvest_id AND h.harvest_date = li.harvest_date
        LEFT JOIN tenant.production_units pu ON pu.pu_id = h.pu_id
        ORDER BY li.harvest_date
    """)) ).mappings().all()

    pu_ids = sorted({str(i["pu_id"]) for i in items if i["pu_id"]})
    hids = sorted({str(i["harvest_id"]) for i in items if i["harvest_id"]})
    delivered_kg = sum(float(i["kg"] or 0) for i in items)
    # P0-4: the integrity check is TOTAL allocated across ALL lots ≤ what was harvested
    # from these source harvests — not just this lot's slice (which is trivially ≤ gross).
    harvested_kg = 0.0
    allocated_all = 0.0
    if hids:
        harvested_kg = float((await db.execute(text(
            "SELECT COALESCE(SUM(gross_yield_kg),0) FROM tenant.harvest_log WHERE harvest_id = ANY(:h)"),
            {"h": hids})).scalar() or 0)
        allocated_all = float((await db.execute(text(
            "SELECT COALESCE(SUM(kg),0) FROM tenant.lot_items WHERE harvest_id = ANY(:h)"),
            {"h": hids})).scalar() or 0)
    # Legacy rows can carry NULL compliance (pre-015a trigger) — treat NULL as n/a, not a fail.
    all_cleared = all(i["chemical_compliance_cleared"] is not False for i in items) if items else False

    inputs, photos, blocks = [], [], []
    if pu_ids:
        inputs = [dict(r) for r in (await db.execute(text("""
            SELECT fe.event_date::date AS date, fe.application_rate,
                   cl.chem_name, cl.withholding_period_days
            FROM tenant.field_events fe
            JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
            WHERE fe.pu_id = ANY(:pus) AND fe.chemical_id IS NOT NULL AND fe.deleted_at IS NULL
            ORDER BY fe.event_date DESC LIMIT 60
        """), {"pus": pu_ids})).mappings().all()]
        photos = [dict(r) for r in (await db.execute(text("""
            SELECT fe.event_type, fe.event_date::date AS date, fe.photo_url, fe.photo_sha256
            FROM tenant.field_events fe
            WHERE fe.pu_id = ANY(:pus) AND fe.photo_url IS NOT NULL AND fe.deleted_at IS NULL
            ORDER BY fe.event_date DESC LIMIT 40
        """), {"pus": pu_ids})).mappings().all()]
        blocks = [dict(r) for r in (await db.execute(text("""
            SELECT pu_name, latitude, longitude, COALESCE(area_sqm,0) AS area_sqm
            FROM tenant.production_units WHERE pu_id = ANY(:pus) ORDER BY pu_name
        """), {"pus": pu_ids})).mappings().all()]

    def _iso(x):
        return x.isoformat() if x else None

    # Grounded one-line summary (NOT LLM — a verification artifact must never carry
    # hallucinated phrasing; every token here is computed from the records above).
    _dts = sorted([i["harvest_date"] for i in items if i["harvest_date"]])
    _when = ""
    if _dts:
        _when = f" · harvested {_dts[0].isoformat()}" + (f"–{_dts[-1].isoformat()}" if _dts[-1] != _dts[0] else "")
    _nb = len(blocks)
    _wh = "withholding observed" if all_cleared else "withholding NOT cleared on some harvests"
    summary = (f"{round(delivered_kg)} kg of {lot['crop_name'] or 'produce'} from "
               f"{_nb} block{'' if _nb == 1 else 's'} · {_wh}{_when}.")

    return {
        "summary": summary,
        "lot": {"lot_code": lot["lot_code"], "crop_name": lot["crop_name"], "buyer_name": lot["buyer_name"],
                "status": lot["status"], "total_kg": float(lot["total_kg"] or 0),
                "delivered_at": _iso(lot["delivered_at"]), "created_at": _iso(lot["created_at"])},
        "harvests": [{"harvest_date": _iso(i["harvest_date"]), "kg": float(i["kg"] or 0),
                      "pu_name": i["pu_name"], "compliance_cleared": bool(i["chemical_compliance_cleared"])} for i in items],
        "blocks": [{"pu_name": b["pu_name"], "area_ha": round(float(b["area_sqm"] or 0) / 10000.0, 2),
                    "latitude": b["latitude"], "longitude": b["longitude"]} for b in blocks],
        "inputs": [{"chem_name": x["chem_name"], "date": _iso(x["date"]),
                    "application_rate": (float(x["application_rate"]) if x["application_rate"] is not None else None),
                    "withholding_days": x["withholding_period_days"]} for x in inputs],
        "photos": [{"event": str(p["event_type"]).replace("_", " ").title(), "date": _iso(p["date"]),
                    "photo_url": p["photo_url"], "sha256": p["photo_sha256"]} for p in photos],
        "mass_balance": {"harvested_kg": round(harvested_kg, 2), "delivered_kg": round(delivered_kg, 2),
                         "allocated_total_kg": round(allocated_all, 2),
                         "elsewhere_kg": round(max(0.0, allocated_all - delivered_kg), 2),
                         "ok": allocated_all <= harvested_kg + _TOL},
        "compliance": {"withholding_observed": all_cleared},
    }


@router.get("/lots/{lot_id}")
async def get_lot(lot_id: str, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    bundle = await _assemble_lot(db, lot_id)
    if not bundle:
        raise HTTPException(404, detail="Lot not found")
    return success_envelope(bundle)


@router.post("/lots/{lot_id}/deliver")
async def deliver_lot(lot_id: str, body: LotDeliver, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Freeze the consignment and mark it delivered to a buyer. Re-validates integrity (P1-6):
    blocks on a failing mass balance; requires force=true to ship uncleared harvests."""
    bundle = await _assemble_lot(db, lot_id)
    if not bundle:
        raise HTTPException(404, detail="Lot not found")
    mb = bundle["mass_balance"]
    if not mb["ok"]:
        raise HTTPException(409, detail=(
            f"Mass balance fails — {mb['allocated_total_kg']} kg allocated exceeds "
            f"{mb['harvested_kg']} kg harvested across these source harvests. Fix allocations first."))
    if not bundle["compliance"]["withholding_observed"] and not body.force:
        raise HTTPException(409, detail=(
            "One or more source harvests are not chemical-withholding cleared. "
            "Set force=true to deliver anyway (recorded as your decision)."))
    res = await db.execute(text("""
        UPDATE tenant.lots
        SET status = 'DELIVERED', delivered_at = now(),
            buyer_id = CASE WHEN :bid = '' THEN buyer_id ELSE cast(:bid AS uuid) END,
            buyer_name = COALESCE(:bname, buyer_name)
        WHERE lot_id = cast(:l AS uuid) AND status = 'DRAFT'
    """), {"l": lot_id, "bid": (body.buyer_id or ""), "bname": body.buyer_name})
    if res.rowcount == 0:
        raise HTTPException(404, detail="Lot not found or already delivered")
    return success_envelope({"lot_id": lot_id, "status": "DELIVERED"})


# ───────────────────────── public trace ─────────────────────────
@html_router.get("/verify/lot/{token}", response_class=HTMLResponse)
async def trace_lot(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Public consignment trace — the QR on a delivery docket lands here. Token-gated; the
    token is the capability (only someone the farmer handed the consignment to has it)."""
    def page(**ctx):
        ctx.setdefault("request", request)
        return templates.TemplateResponse("verify_lot.html", ctx)

    from app.routers.verify import _rate_limit_check  # P0-2: shared Redis limiter
    await _rate_limit_check(request)

    row = (await db.execute(text("SELECT * FROM audit.resolve_lot_trace(:tok)"),
                            {"tok": token.strip()})).mappings().first()
    if not row:
        return page(state="invalid")
    await db.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(row["tenant_id"])})
    # P0-3: honour the kill switch + expiry on the (plaintext, printed) trace token.
    st = (await db.execute(text(
        "SELECT trace_revoked_at, trace_expires_at FROM tenant.lots WHERE lot_id = cast(:l AS uuid)"),
        {"l": str(row["lot_id"])})).mappings().first() or {}
    if st.get("trace_revoked_at"):
        return page(state="invalid", msg="The farmer has revoked this consignment link.")
    if st.get("trace_expires_at") and st["trace_expires_at"] < _now():
        return page(state="invalid", msg="This consignment link has expired.")
    bundle = await _assemble_lot(db, str(row["lot_id"]))
    if not bundle:
        return page(state="invalid")
    return page(state="ok", b=bundle)


@html_router.get("/verify/lot/{token}/qr.png")
async def lot_qr(token: str, request: Request):
    """Public QR PNG of the consignment trace link — for the delivery docket / carton label."""
    from fastapi.responses import Response
    from app.routers.verify import _rate_limit_check
    from app.routers.poultry_bank_evidence import generate_qr_image
    await _rate_limit_check(request)
    buf = generate_qr_image(f"https://teivaka.com/verify/lot/{token}")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})

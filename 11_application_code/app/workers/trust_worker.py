"""Trust Engine precompute worker (TATI Phase 2).

Inviolable #3: trust is precomputed into tenant.trust_snapshots; pages read snapshots,
never compute on load. Cross-tenant work is STRUCTURAL (Strike #95): iterate
tenant.tenants, then per-tenant with_rls() for tenant.* queries.

The math lives in app.services.trust_engine (pure). This module only gathers evidence
(SQL) and upserts snapshots. `refresh_tenant()` is reused by the on-demand refresh
endpoint (via run_in_threadpool) so there is ONE compute path.
"""
import logging
import statistics

import psycopg2
import psycopg2.extras

from app.config import settings
from app.workers.celery_app import app
from app.workers.rls_helpers import with_rls
from app.services import trust_engine

logger = logging.getLogger(__name__)
SUBJECT_TYPE = "FARMER"  # DC-4: per-farmer passport; subject_id = tenant_id for the alpha


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def _seed_self_claims(cur, tenant_id: str) -> None:
    """Auto-seed the cheap, inferable claims (D4) — never asks the farmer. Idempotent."""
    cur.execute("""
        INSERT INTO tenant.claim_verifications (tenant_id, claim_type, claim_ref, source, status, confidence_weight)
        SELECT cast(%s AS uuid), 'IDENTITY', u.user_id::text, 'SELF', 'VERIFIED', 5 FROM tenant.users u
        ON CONFLICT (tenant_id, claim_type, claim_ref, source) DO NOTHING
    """, (tenant_id,))
    cur.execute("""
        INSERT INTO tenant.claim_verifications (tenant_id, claim_type, claim_ref, source, status, confidence_weight)
        SELECT cast(%s AS uuid), 'IDENTITY', u.user_id::text, 'EMAIL', 'VERIFIED', 10 FROM tenant.users u
        WHERE u.email IS NOT NULL AND u.email <> ''
        ON CONFLICT (tenant_id, claim_type, claim_ref, source) DO NOTHING
    """, (tenant_id,))
    cur.execute("""
        INSERT INTO tenant.claim_verifications (tenant_id, claim_type, claim_ref, source, status, confidence_weight)
        SELECT cast(%s AS uuid), 'IDENTITY', u.user_id::text, 'PHONE', 'VERIFIED', 10 FROM tenant.users u
        WHERE u.whatsapp_number IS NOT NULL AND u.whatsapp_number <> ''
        ON CONFLICT (tenant_id, claim_type, claim_ref, source) DO NOTHING
    """, (tenant_id,))
    cur.execute("""
        INSERT INTO tenant.claim_verifications (tenant_id, claim_type, claim_ref, source, status, confidence_weight)
        SELECT cast(%s AS uuid), 'FARM_OWNERSHIP', f.farm_id, 'SELF', 'VERIFIED', 5 FROM tenant.farms f
        ON CONFLICT (tenant_id, claim_type, claim_ref, source) DO NOTHING
    """, (tenant_id,))


def _gather(cur, tenant_id: str) -> dict:
    ev: dict = {}
    cur.execute("SELECT COUNT(*) AS n FROM tenant.production_cycles WHERE cycle_status='CLOSED'")
    ev["closed_seasons"] = cur.fetchone()["n"]

    cur.execute("SELECT gross_yield_kg FROM tenant.harvest_log WHERE gross_yield_kg IS NOT NULL")
    weights = [float(r["gross_yield_kg"]) for r in cur.fetchall()]
    ev["harvest_records"] = len(weights)
    ev["total_kg"] = sum(weights)
    if len(weights) >= 2 and statistics.mean(weights) > 0:
        ev["yield_cv"] = statistics.pstdev(weights) / statistics.mean(weights)
    else:
        ev["yield_cv"] = None

    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE photo_url IS NOT NULL OR gps_lat IS NOT NULL) AS media,
               COUNT(DISTINCT date_trunc('month', event_date)) AS months
        FROM tenant.field_events WHERE deleted_at IS NULL
    """)
    fe = cur.fetchone()
    ev["field_events"] = fe["total"]; ev["events_with_media"] = fe["media"]
    ev["active_months"] = fe["months"]; ev["evidenceable_events"] = fe["total"]

    cur.execute("""
        SELECT COUNT(*) AS n, COALESCE(SUM(amount_fjd),0) AS tot,
               COUNT(DISTINCT date_trunc('month', transaction_date)) AS months
        FROM tenant.cash_ledger WHERE transaction_type='INCOME'
    """)
    s = cur.fetchone()
    ev["sales_count"] = s["n"]; ev["distinct_buyers"] = 0; ev["repeat_buyers"] = 0  # buyer links: Phase 2b
    cur.execute("SELECT COUNT(*) AS n, COUNT(DISTINCT date_trunc('month', transaction_date)) AS months FROM tenant.cash_ledger")
    c = cur.fetchone()
    ev["cash_records"] = c["n"]; ev["cash_months"] = c["months"]

    cur.execute("SELECT COUNT(*) AS n FROM tenant.harvest_compliance_overrides")
    ev["overrides"] = cur.fetchone()["n"]
    cur.execute("""
        SELECT COUNT(*) FILTER (WHERE chemical_application) AS chem,
               COUNT(*) FILTER (WHERE chemical_application AND whd_clearance_date > CURRENT_DATE) AS holds,
               COUNT(*) FILTER (WHERE chemical_application AND chemical_id IS NULL) AS unident
        FROM tenant.field_events WHERE deleted_at IS NULL
    """)
    cc = cur.fetchone()
    ev["chemical_records"] = cc["chem"]; ev["active_holds"] = cc["holds"]; ev["flagged"] = cc["unident"]

    cur.execute("SELECT EXISTS(SELECT 1 FROM tenant.field_events WHERE gps_lat IS NOT NULL AND deleted_at IS NULL) AS m")
    ev["gps_mapped"] = bool(cur.fetchone()["m"])

    try:
        cur.execute("SELECT total_events, break_count FROM audit.verify_chain_for_tenant(cast(%s AS uuid))", (tenant_id,))
        ch = cur.fetchone()
        ev["chain_events"] = int(ch["total_events"] or 0); ev["chain_breaks"] = int(ch["break_count"] or 0)
    except Exception:  # noqa: BLE001 — chain check is best-effort; don't fail the whole run
        ev["chain_events"] = 0; ev["chain_breaks"] = 0

    cur.execute("SELECT claim_type, source, status, independent, verified_at, expires_at FROM tenant.claim_verifications")
    ev["claims"] = [dict(r) for r in cur.fetchall()]
    return ev


def _upsert(cur, tenant_id: str, dimension: str, score: int, band: str, why: str, how: str, ev_count: int, inputs) -> None:
    import json
    cur.execute("""
        INSERT INTO tenant.trust_snapshots
            (tenant_id, subject_type, subject_id, dimension, score, band, evidence_count, inputs, why, how_to_improve, formula_version, computed_at)
        VALUES (cast(%s AS uuid), %s, %s, %s, %s, %s, %s, cast(%s AS jsonb), %s, %s, %s, now())
        ON CONFLICT (tenant_id, subject_id, dimension) DO UPDATE SET
            score=EXCLUDED.score, band=EXCLUDED.band, evidence_count=EXCLUDED.evidence_count,
            inputs=EXCLUDED.inputs, why=EXCLUDED.why, how_to_improve=EXCLUDED.how_to_improve,
            formula_version=EXCLUDED.formula_version, computed_at=now()
    """, (tenant_id, SUBJECT_TYPE, tenant_id, dimension, score, band, ev_count,
          json.dumps(inputs or {}), why, how, trust_engine.FORMULA_VERSION))


def compute_trust_for_tenant(conn, tenant_id: str) -> int:
    """Gather → compute → upsert snapshots for one tenant. Returns dimensions written."""
    with conn:  # transaction
        with with_rls(conn, tenant_id) as cur:
            _seed_self_claims(cur, tenant_id)
            ev = _gather(cur, tenant_id)
            result = trust_engine.compute_all(ev)
            for d in result["dimensions"]:
                _upsert(cur, tenant_id, d["key"], d["score"], d["band"], d["why"], d["how_to_improve"],
                        len(d.get("evidence") or []), {"evidence": d.get("evidence")})
            ov = result["overall"]
            _upsert(cur, tenant_id, "__overall__", ov["score"], ov["band"], ov["label"], ov["disclaimer"],
                    len(result["dimensions"]), {"formula_version": result["formula_version"]})
    return len(result["dimensions"]) + 1


def refresh_tenant(tenant_id: str) -> int:
    """On-demand single-tenant refresh (reused by the API via run_in_threadpool)."""
    conn = get_sync_db()
    try:
        return compute_trust_for_tenant(conn, tenant_id)
    finally:
        conn.close()


@app.task(name="app.workers.trust_worker.compute_trust_one")
def compute_trust_one(tenant_id: str):
    """Single-tenant recompute — enqueued (non-blocking) by the passport on first load so trust
    is built in the background instead of blocking the request (PR-2)."""
    return refresh_tenant(tenant_id)


@app.task(bind=True, name="app.workers.trust_worker.compute_all_trust_snapshots")
def compute_all_trust_snapshots(self):
    """Nightly: recompute trust for every tenant (two-stage scan, Strike #95)."""
    conn = get_sync_db()
    done = 0
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT tenant_id::TEXT AS tenant_id FROM tenant.tenants")
            tenants = [r["tenant_id"] for r in cur.fetchall()]
        for tid in tenants:
            try:
                compute_trust_for_tenant(conn, tid)
                done += 1
            except Exception:  # noqa: BLE001 — one tenant must not abort the sweep
                logger.exception("trust compute failed for tenant %s", tid)
                conn.rollback()
        logger.info("trust snapshots computed for %d/%d tenants", done, len(tenants))
        return {"tenants": len(tenants), "computed": done}
    finally:
        conn.close()

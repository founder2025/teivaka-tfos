"""Phase 4.2 farm-ops Step 1 — integration tests for production_cycles API.

Real Postgres. No DB mocking. Per-test isolation via a fresh tenant per test.

Run (inside teivaka_api container):
  pytest tests/test_cycles_api.py -v

Contract covered:
  - POST /cycles (rotation N/A path → 201, status ACTIVE)
  - POST /cycles (rotation BLOCK → 409 with alternatives)
  - POST /cycles (rotation AVOID requires override_reason — 409 then 201)
  - GET  /cycles (farm + status filters)
  - GET  /cycles/{id} (404 on unknown id)
  - PATCH /cycles/{id} ACTIVE→HARVESTING (sets actual_harvest_start)
  - PATCH /cycles/{id} CLOSING→CLOSED (cycle_financials UPSERT +
    PU.current_cycle_id cleared + CYCLE_TRANSITION audit)
  - PATCH /cycles/{id} invalid transition returns 409
  - PATCH /cycles/{id} → FAILED (skips cogk, still emits audit,
    still clears PU)
  - Cross-tenant fetch returns 404 (tenant isolation)
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.main import app


pytestmark = pytest.mark.asyncio


# --- Fixtures ------------------------------------------------------

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def tenant_and_pu():
    """Fresh tenant + farm + zone + PU + user for one test, plus cleanup.

    Schema reality (verified against live DB 2026-04-21):
      - tenant.zones requires zone_id, tenant_id, farm_id, zone_name, zone_type
        (zone_type CHECK: CROP|LIVESTOCK|APICULTURE|NURSERY|STORAGE|MIXED).
      - tenant.production_units requires pu_id, tenant_id, zone_id, farm_id,
        pu_name, pu_type (CHECK: BED|PLOT|GREENHOUSE|POND|PADDOCK|HIVE_STAND).
      - RLS on these tables uses app.tenant_id. The `teivaka` DB role has
        SUPERUSER+BYPASSRLS so raw INSERTs from this fixture bypass policy;
        service calls set `app.tenant_id` explicitly.
      - audit.events rows are immutable (migration 023). Leak accepted — the
        per-test tenant_id prevents cross-test interference.
    """
    async with AsyncSessionLocal() as db:
        tid = uuid4()
        uid = uuid4()
        fid = f"TEST{str(uuid4())[:8].upper()}"
        zid = f"{fid}-Z01"
        puid = f"{fid}-Z01-PU01"

        await db.execute(
            text(
                "INSERT INTO tenant.tenants (tenant_id, company_name) "
                "VALUES (:tid, 'Test Tenant')"
            ),
            {"tid": str(tid)},
        )
        await db.execute(
            text(
                "INSERT INTO tenant.farms (farm_id, tenant_id, farm_name, location_name) "
                "VALUES (:fid, :tid, 'Test Farm', 'Test Location')"
            ),
            {"fid": fid, "tid": str(tid)},
        )
        await db.execute(
            text(
                "INSERT INTO tenant.zones (zone_id, tenant_id, farm_id, zone_name, zone_type) "
                "VALUES (:zid, :tid, :fid, 'Test Zone', 'CROP')"
            ),
            {"zid": zid, "tid": str(tid), "fid": fid},
        )
        await db.execute(
            text(
                "INSERT INTO tenant.production_units "
                "(pu_id, tenant_id, zone_id, farm_id, pu_name, pu_type) "
                "VALUES (:puid, :tid, :zid, :fid, 'Test PU', 'BED')"
            ),
            {"puid": puid, "tid": str(tid), "zid": zid, "fid": fid},
        )
        await db.execute(
            text(
                """
                INSERT INTO tenant.users (
                    user_id, tenant_id, email, full_name, role
                )
                VALUES (:uid, :tid, 'test@test.com', 'Test User', 'FOUNDER')
                """
            ),
            {"uid": str(uid), "tid": str(tid)},
        )
        await db.commit()

    yield {
        "tenant_id": tid,
        "user_id": uid,
        "farm_id": fid,
        "zone_id": zid,
        "pu_id": puid,
    }

    async with AsyncSessionLocal() as db:
        # Order matters — FK fan-out from production_cycles is wide.
        # audit.events intentionally NOT deleted (immutable by migration 023).
        await db.execute(text("DELETE FROM tenant.cycle_financials WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.rotation_override_log WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.task_queue WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.production_cycles WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.production_units WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.zones WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.farms WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.users WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.execute(text("DELETE FROM tenant.tenants WHERE tenant_id = :tid"),
                         {"tid": str(tid)})
        await db.commit()


async def _mint_token(user_id: UUID, tenant_id: UUID) -> str:
    from app.routers.auth import _make_access_token
    return _make_access_token(
        user_id=str(user_id),
        tenant_id=str(tenant_id),
        role="FOUNDER",
        tier="FREE",
    )


async def _seed_prior_closed_cycle(
    tenant_id: UUID,
    farm_id: str,
    zone_id: str,
    pu_id: str,
    production_id: str,
    harvest_end_days_ago: int = 0,
) -> str:
    """Insert a prior CLOSED cycle on the PU so tenant.validate_rotation()
    has something to compare against. BLOCK/AVOID require a last_production_id.
    """
    cid = f"CYC-PRIOR-{uuid4().hex[:8].upper()}"
    today = date.today()
    harvest_end = today - timedelta(days=harvest_end_days_ago)
    planted = today - timedelta(days=harvest_end_days_ago + 120)
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                """
                INSERT INTO tenant.production_cycles (
                    cycle_id, tenant_id, pu_id, zone_id, farm_id, production_id,
                    cycle_status, planting_date, actual_harvest_end
                )
                VALUES (
                    :cid, :tid, :puid, :zid, :fid, :prod,
                    'CLOSED', :planted, :harvest_end
                )
                """
            ),
            {
                "cid": cid,
                "tid": str(tenant_id),
                "puid": pu_id,
                "zid": zone_id,
                "fid": farm_id,
                "prod": production_id,
                "planted": planted,
                "harvest_end": harvest_end,
            },
        )
        await db.commit()
    return cid


async def _create_cycle_via_api(
    client: AsyncClient,
    token: str,
    pu_id: str,
    production_id: str,
    override_reason: str | None = None,
) -> dict:
    body: dict = {
        "pu_id": pu_id,
        "production_id": production_id,
        "planting_date": "2026-04-21",
    }
    if override_reason:
        body["override_reason"] = override_reason
    resp = await client.post(
        "/api/v1/cycles",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )
    return resp


# --- POST /cycles -------------------------------------------------

async def test_create_cycle_ok(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    resp = await _create_cycle_via_api(
        client, token, ctx["pu_id"], "CRP-CAB"
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["cycle_status"] == "ACTIVE"
    assert data["rotation_status"] == "N/A"
    assert data["override_applied"] is False


async def test_create_cycle_emits_audit_event(client, tenant_and_pu):
    """Phase 4 Part 2 regression: create_cycle must hash-chain into
    audit.events (v4.1 Bank Evidence spine). Before the fix, zero rows
    were written for the genesis transition on successful create."""
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    resp = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert resp.status_code == 201, resp.text
    cycle_id = resp.json()["data"]["cycle_id"]

    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            text(
                """
                SELECT event_type, payload_jsonb
                FROM audit.events
                WHERE tenant_id = :tid AND entity_id = :cid
                """
            ),
            {"tid": str(ctx["tenant_id"]), "cid": cycle_id},
        )).mappings().all()
        assert len(row) == 1, f"expected exactly 1 audit row, got {len(row)}"
        assert row[0]["event_type"] == "CYCLE_TRANSITION"
        payload = row[0]["payload_jsonb"]
        assert payload["from_status"] is None
        assert payload["to_status"] == "ACTIVE"
        assert payload["pu_id"] == ctx["pu_id"]


async def test_create_cycle_blocks_duplicate_active(client, tenant_and_pu):
    """Partial unique index ix_cycles_one_active_per_pu (migration 026)
    prevents a second non-terminal cycle on the same PU."""
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r1 = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r1.status_code == 201, r1.text

    r2 = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-DAL")
    assert r2.status_code == 400, r2.text
    err = r2.json()["detail"]["error"]
    assert err["code"] == "CYCLE_CREATE_FAILED"
    assert "PU_ALREADY_HAS_ACTIVE_CYCLE" in err["message"]


async def test_create_cycle_allowed_after_predecessor_failed(client, tenant_and_pu):
    """Once a cycle transitions to a terminal status (FAILED here), the
    partial unique index no longer covers it and a new cycle on the same
    PU is allowed."""
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r1 = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r1.status_code == 201, r1.text
    first_cycle_id = r1.json()["data"]["cycle_id"]

    # Mark FAILED directly — keeps the test tight to the index behaviour
    # rather than exercising the PATCH state machine end-to-end.
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE tenant.production_cycles "
                "SET cycle_status = 'FAILED' WHERE cycle_id = :cid"
            ),
            {"cid": first_cycle_id},
        )
        await db.execute(
            text(
                "UPDATE tenant.production_units "
                "SET current_cycle_id = NULL WHERE pu_id = :puid"
            ),
            {"puid": ctx["pu_id"]},
        )
        await db.commit()

    r2 = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r2.status_code == 201, r2.text
    assert r2.json()["data"]["cycle_id"] != first_cycle_id


async def test_create_cycle_rotation_block_returns_409(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    # Prior EGG cycle closed 5 days ago; EGG→EGG is BLOCK, min_rest_days=60.
    await _seed_prior_closed_cycle(
        ctx["tenant_id"], ctx["farm_id"], ctx["zone_id"], ctx["pu_id"],
        production_id="CRP-EGG",
        harvest_end_days_ago=5,
    )

    resp = await _create_cycle_via_api(
        client, token, ctx["pu_id"], "CRP-EGG"
    )
    assert resp.status_code == 409, resp.text
    err = resp.json()["detail"]["error"]
    assert err["code"] == "ROTATION_VIOLATION"
    assert "data" in err
    assert err["data"]["rule_status"] == "BLOCK"


async def test_create_cycle_rotation_avoid_requires_override(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    # Prior GIN cycle closed 10 days ago; GIN→GIN is AVOID.
    await _seed_prior_closed_cycle(
        ctx["tenant_id"], ctx["farm_id"], ctx["zone_id"], ctx["pu_id"],
        production_id="CRP-GIN",
        harvest_end_days_ago=10,
    )

    # No override_reason → 409
    r1 = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-GIN")
    assert r1.status_code == 409, r1.text
    assert r1.json()["detail"]["error"]["code"] == "ROTATION_VIOLATION"

    # With override_reason → 201 and audit row in rotation_override_log
    r2 = await _create_cycle_via_api(
        client, token, ctx["pu_id"], "CRP-GIN",
        override_reason="Test override — replanting ginger for continuity",
    )
    assert r2.status_code == 201, r2.text
    data = r2.json()["data"]
    assert data["override_applied"] is True

    async with AsyncSessionLocal() as db:
        override_count = (await db.execute(
            text(
                """
                SELECT COUNT(*) FROM tenant.rotation_override_log
                WHERE tenant_id = :tid AND pu_id = :puid
                """
            ),
            {"tid": str(ctx["tenant_id"]), "puid": ctx["pu_id"]},
        )).scalar_one()
        assert override_count == 1


# --- GET /cycles (list) -------------------------------------------

async def test_list_filters_by_farm_and_status(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    # Create one ACTIVE via API
    r = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r.status_code == 201

    # Seed one CLOSED directly
    await _seed_prior_closed_cycle(
        ctx["tenant_id"], ctx["farm_id"], ctx["zone_id"], ctx["pu_id"],
        production_id="CRP-DAL",
        harvest_end_days_ago=1,
    )

    # Filter by farm_id — both visible
    r_all = await client.get(
        f"/api/v1/cycles?farm_id={ctx['farm_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_all.status_code == 200
    assert len(r_all.json()["data"]["cycles"]) == 2

    # Filter by status=ACTIVE — only one
    r_active = await client.get(
        f"/api/v1/cycles?farm_id={ctx['farm_id']}&cycle_status=ACTIVE",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_active.status_code == 200
    cycles = r_active.json()["data"]["cycles"]
    assert len(cycles) == 1
    assert cycles[0]["cycle_status"] == "ACTIVE"


# --- GET /cycles/{id} ---------------------------------------------

async def test_get_cycle_not_found_returns_404(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    resp = await client.get(
        "/api/v1/cycles/CYC-DOES-NOT-EXIST",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"]["code"] == "CYCLE_NOT_FOUND"


# --- PATCH /cycles/{id} -------------------------------------------

async def test_patch_active_to_harvesting_sets_harvest_start(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r_create = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r_create.status_code == 201
    cycle_id = r_create.json()["data"]["cycle_id"]

    resp = await client.patch(
        f"/api/v1/cycles/{cycle_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"cycle_status": "HARVESTING", "notes": "first harvest run"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["from_status"] == "ACTIVE"
    assert data["to_status"] == "HARVESTING"
    assert len(data["audit_this_hash"]) == 64

    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            text(
                """
                SELECT cycle_status, actual_harvest_start, cycle_notes
                FROM tenant.production_cycles
                WHERE cycle_id = :cid
                """
            ),
            {"cid": cycle_id},
        )).first()
        assert row.cycle_status == "HARVESTING"
        assert row.actual_harvest_start is not None
        # notes MUST NOT be merged into cycle_notes — they live in audit.events
        assert row.cycle_notes is None


async def test_patch_closing_to_closed_runs_close_path(client, tenant_and_pu):
    """→ CLOSED must: upsert cycle_financials, clear PU.current_cycle_id,
    emit CYCLE_TRANSITION audit."""
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r_create = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r_create.status_code == 201
    cycle_id = r_create.json()["data"]["cycle_id"]

    # Advance ACTIVE → CLOSING
    r1 = await client.patch(
        f"/api/v1/cycles/{cycle_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"cycle_status": "CLOSING"},
    )
    assert r1.status_code == 200, r1.text

    # CLOSING → CLOSED
    r2 = await client.patch(
        f"/api/v1/cycles/{cycle_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"cycle_status": "CLOSED", "notes": "season over"},
    )
    assert r2.status_code == 200, r2.text
    hash_close = r2.json()["data"]["audit_this_hash"]

    async with AsyncSessionLocal() as db:
        # cycle_financials row must exist with this cycle_id
        cf = (await db.execute(
            text(
                """
                SELECT cycle_id, financial_id, last_computed_at
                FROM tenant.cycle_financials
                WHERE tenant_id = :tid AND cycle_id = :cid
                """
            ),
            {"tid": str(ctx["tenant_id"]), "cid": cycle_id},
        )).first()
        assert cf is not None, "cycle_financials row missing after CLOSED"
        assert cf.financial_id == f"CFN-{cycle_id}"

        # PU.current_cycle_id must be cleared
        pu = (await db.execute(
            text("SELECT current_cycle_id FROM tenant.production_units WHERE pu_id = :puid"),
            {"puid": ctx["pu_id"]},
        )).first()
        assert pu.current_cycle_id is None

        # CYCLE_TRANSITION audit row written for this close
        audit = (await db.execute(
            text(
                """
                SELECT COUNT(*) FROM audit.events
                WHERE tenant_id = :tid
                  AND event_type = 'CYCLE_TRANSITION'
                  AND this_hash = :h
                """
            ),
            {"tid": str(ctx["tenant_id"]), "h": hash_close},
        )).scalar_one()
        assert audit == 1


async def test_patch_invalid_transition_returns_409(client, tenant_and_pu):
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r_create = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r_create.status_code == 201
    cycle_id = r_create.json()["data"]["cycle_id"]

    # Close via the chain
    for target in ("CLOSING", "CLOSED"):
        r = await client.patch(
            f"/api/v1/cycles/{cycle_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"cycle_status": target},
        )
        assert r.status_code == 200

    # CLOSED is terminal — any onward move must 409
    r_bad = await client.patch(
        f"/api/v1/cycles/{cycle_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"cycle_status": "ACTIVE"},
    )
    assert r_bad.status_code == 409
    assert r_bad.json()["detail"]["error"]["code"] == "CYCLE_TRANSITION_INVALID"


async def test_patch_any_to_failed_skips_cogk(client, tenant_and_pu):
    """ACTIVE → FAILED: no cycle_financials row, PU cleared, audit emitted."""
    ctx = tenant_and_pu
    token = await _mint_token(ctx["user_id"], ctx["tenant_id"])

    r_create = await _create_cycle_via_api(client, token, ctx["pu_id"], "CRP-CAB")
    assert r_create.status_code == 201
    cycle_id = r_create.json()["data"]["cycle_id"]

    r = await client.patch(
        f"/api/v1/cycles/{cycle_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"cycle_status": "FAILED", "notes": "pest blight total loss"},
    )
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as db:
        cf_count = (await db.execute(
            text(
                "SELECT COUNT(*) FROM tenant.cycle_financials "
                "WHERE tenant_id = :tid AND cycle_id = :cid"
            ),
            {"tid": str(ctx["tenant_id"]), "cid": cycle_id},
        )).scalar_one()
        assert cf_count == 0, "FAILED cycles must NOT upsert cycle_financials"

        pu = (await db.execute(
            text("SELECT current_cycle_id FROM tenant.production_units WHERE pu_id = :puid"),
            {"puid": ctx["pu_id"]},
        )).first()
        assert pu.current_cycle_id is None

        # Phase 4 Part 2: create_cycle now also emits a CYCLE_TRANSITION
        # (from_status=None → to_status=ACTIVE). Filter to the FAILED
        # transition specifically to keep this test focused on the
        # PATCH→FAILED side effect, not the genesis write.
        audit = (await db.execute(
            text(
                """
                SELECT COUNT(*) FROM audit.events
                WHERE tenant_id = :tid AND event_type = 'CYCLE_TRANSITION'
                  AND entity_id = :cid
                  AND payload_jsonb->>'to_status' = 'FAILED'
                """
            ),
            {"tid": str(ctx["tenant_id"]), "cid": cycle_id},
        )).scalar_one()
        assert audit == 1


# --- Cross-tenant isolation --------------------------------------

async def test_cross_tenant_fetch_returns_404(client, tenant_and_pu):
    """Tenant A's token must not see Tenant B's cycles."""
    ctx_a = tenant_and_pu
    token_a = await _mint_token(ctx_a["user_id"], ctx_a["tenant_id"])

    # Seed tenant B with its own cycle.
    b_tid = uuid4()
    b_uid = uuid4()
    b_fid = f"TEST{str(uuid4())[:8].upper()}"
    b_zid = f"{b_fid}-Z01"
    b_puid = f"{b_fid}-Z01-PU01"
    async with AsyncSessionLocal() as db:
        await db.execute(text("INSERT INTO tenant.tenants (tenant_id, company_name) VALUES (:t, 'B')"),
                         {"t": str(b_tid)})
        await db.execute(
            text("INSERT INTO tenant.farms (farm_id, tenant_id, farm_name, location_name) VALUES (:f, :t, 'B Farm', 'B Loc')"),
            {"f": b_fid, "t": str(b_tid)},
        )
        await db.execute(
            text("INSERT INTO tenant.zones (zone_id, tenant_id, farm_id, zone_name, zone_type) VALUES (:z, :t, :f, 'B Zone', 'CROP')"),
            {"z": b_zid, "t": str(b_tid), "f": b_fid},
        )
        await db.execute(
            text("INSERT INTO tenant.production_units (pu_id, tenant_id, zone_id, farm_id, pu_name, pu_type) VALUES (:p, :t, :z, :f, 'B PU', 'BED')"),
            {"p": b_puid, "t": str(b_tid), "z": b_zid, "f": b_fid},
        )
        await db.execute(
            text("INSERT INTO tenant.users (user_id, tenant_id, email, full_name, role) VALUES (:u, :t, 'b@b.com', 'B User', 'FOUNDER')"),
            {"u": str(b_uid), "t": str(b_tid)},
        )
        await db.commit()

    # Create cycle as tenant B (directly — bypass API, we don't need B's token).
    b_cycle_id = await _seed_prior_closed_cycle(
        b_tid, b_fid, b_zid, b_puid,
        production_id="CRP-CAB",
        harvest_end_days_ago=0,
    )
    # Force it to ACTIVE so it's not a CLOSED/terminal row — shape doesn't matter
    # for the isolation assertion, but keeps the test intent honest.
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE tenant.production_cycles SET cycle_status = 'ACTIVE' WHERE cycle_id = :cid"),
            {"cid": b_cycle_id},
        )
        await db.commit()

    try:
        # Tenant A must NOT see tenant B's cycle.
        resp = await client.get(
            f"/api/v1/cycles/{b_cycle_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 404
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(text("DELETE FROM tenant.production_cycles WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.execute(text("DELETE FROM tenant.production_units WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.execute(text("DELETE FROM tenant.zones WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.execute(text("DELETE FROM tenant.farms WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.execute(text("DELETE FROM tenant.users WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.execute(text("DELETE FROM tenant.tenants WHERE tenant_id = :t"), {"t": str(b_tid)})
            await db.commit()

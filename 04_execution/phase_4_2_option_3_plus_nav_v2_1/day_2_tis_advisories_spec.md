# Day 2 Execution Spec — TIS Advisories + Onboarding Router + SSE Stream

**Drafted:** 2026-04-25
**Authority:** Boss (Cody), supersedes Day 2 section of `CLAUDE_CODE_EXECUTION_PASTE.md` where they disagree.
**Prerequisites:**
- Day 1 complete (alembic head = `028_farmer_label_columns`, confirmed 2026-04-25)
- Branch: `feature/option-3-plus-nav-v2-1` checked out
- `TFOS_DECISION_TREE_v1.md` loaded — consult for all drift scenarios

---

## Pre-flight findings (folded into this spec — do not re-run)

Done 2026-04-25:
- Alembic head: `028_farmer_label_columns` ✅
- `tenant.task_queue` is fully v4-compliant: task_rank, expires_at, default_outcome, icon_key, source_module, input_hint, voice_playback_url, imperative, body_md, entity_type, entity_id — all present with check constraints. RLS wired. **No task_queue migration needed in Day 2.**
- `tenant.livestock_register` and `tenant.hive_register` both exist (the split is real — onboarding must route by production_id prefix).
- `audit.events` exists with immutability triggers. Event_type check constraint allowlist is known — see §3 below for required additions.
- `audit.report_exports` does NOT exist — deferred to Phase 6 (bank evidence dispatcher).

---

## 1. Migration 029 — tis_advisories + audit.events event_type extension

**Slot:** 029 (NOT 028 — slot 028 is farmer_label from Day 1 drift recovery per Decision Tree S-01).

**File:** `/opt/teivaka/11_application_code/alembic/versions/029_tis_advisories.py`

**revision:** `'029_tis_advisories'`
**down_revision:** `'028_farmer_label_columns'`

### Schema

```sql
CREATE TABLE tenant.tis_advisories (
    advisory_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES tenant.users(user_id),
    priority          VARCHAR(16) NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    preview           TEXT NOT NULL,
    full_message      TEXT NOT NULL,
    source_task_id    TEXT REFERENCES tenant.task_queue(task_id),
    source_audit_id   UUID REFERENCES audit.events(event_id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at           TIMESTAMPTZ,
    dismissed_at      TIMESTAMPTZ
);

CREATE INDEX idx_tis_advisories_user_unread
  ON tenant.tis_advisories (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE tenant.tis_advisories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tis_advisories_tenant_isolation ON tenant.tis_advisories
  USING (tenant_id = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.tenant_id'))::uuid);
```

**Note on source_task_id type:** `tenant.task_queue.task_id` is `TEXT` (confirmed in pre-flight), not UUID. FK column must match.

### Audit event_type extension

The current check constraint on `audit.events.event_type` does NOT include `ADVISORY_READ`, `ONBOARDING_STARTED`, or `ONBOARDING_COMPLETED`. Extend in same migration:

```sql
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid;

ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid
  CHECK (event_type IN (
    'TASK_COMPLETED','TASK_SKIPPED','TASK_CANCELLED','TASK_EXPIRED',
    'HARVEST_LOGGED','CHEMICAL_APPLIED',
    'CYCLE_CREATED','CYCLE_CLOSED','CYCLE_TRANSITION',
    'ROTATION_OVERRIDE','COMPLIANCE_OVERRIDE',
    'PAYMENT_RECEIVED','PAYMENT_SENT','LABOR_LOGGED',
    'INVENTORY_ADJUSTED','ALERT_RESOLVED',
    'USER_INVITED','FARM_CREATED','FARM_CLOSED',
    'SUBSCRIPTION_CHANGED','REFERRAL_ACTIVATED',
    'BANK_PDF_GENERATED','CREDIT_SCORE_UPDATED',
    -- NEW in 029:
    'ADVISORY_READ','ONBOARDING_STARTED','ONBOARDING_COMPLETED'
  ));
```

### Downgrade (symmetric, reverse order)

```sql
-- Revert event_type check to pre-029 set
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid;
ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid
  CHECK (event_type IN (
    'TASK_COMPLETED','TASK_SKIPPED','TASK_CANCELLED','TASK_EXPIRED',
    'HARVEST_LOGGED','CHEMICAL_APPLIED',
    'CYCLE_CREATED','CYCLE_CLOSED','CYCLE_TRANSITION',
    'ROTATION_OVERRIDE','COMPLIANCE_OVERRIDE',
    'PAYMENT_RECEIVED','PAYMENT_SENT','LABOR_LOGGED',
    'INVENTORY_ADJUSTED','ALERT_RESOLVED',
    'USER_INVITED','FARM_CREATED','FARM_CLOSED',
    'SUBSCRIPTION_CHANGED','REFERRAL_ACTIVATED',
    'BANK_PDF_GENERATED','CREDIT_SCORE_UPDATED'
  ));

DROP POLICY IF EXISTS tis_advisories_tenant_isolation ON tenant.tis_advisories;
DROP INDEX IF EXISTS idx_tis_advisories_user_unread;
DROP TABLE IF EXISTS tenant.tis_advisories;
```

**asyncpg rule:** Each DDL statement in its own `op.execute()` call. Do NOT bundle multiple statements in one string.

### Verify migration applied

```bash
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "\d tenant.tis_advisories" -c "SELECT conname FROM pg_constraint WHERE conrelid = 'audit.events'::regclass;"
```

Expected: table with 10 columns + 1 partial index + 1 RLS policy. `audit_events_event_type_valid` constraint re-created.

---

## 2. Onboarding router + service

### Path correction

The paste references `/opt/teivaka/04_execution/phase_4_2_option_3/onboarding_wizard_spec.md`. That path does NOT exist on server. Use:

**Correct path:** `/opt/teivaka/04_execution/phase_4_2_option_3_plus_nav_v2_1/onboarding_wizard_spec.md`

If the file isn't on server yet, scp it from Windows PowerShell (see Step 3 handoff).

### Files to create

- `/opt/teivaka/11_application_code/app/routers/onboarding.py`
- `/opt/teivaka/11_application_code/app/services/onboarding_service.py`
- Wire into `/opt/teivaka/11_application_code/app/main.py` with prefix `/api/v1/onboarding`

### Endpoints

```
GET  /api/v1/onboarding/status
POST /api/v1/onboarding/farm-basics
POST /api/v1/onboarding/production-units      # farmer UI copy: "blocks"
POST /api/v1/onboarding/livestock             # farmer UI copy: "animals"
POST /api/v1/onboarding/complete
```

All endpoints:
- Bearer auth required
- Response envelope: `{"status":"success","data":{...},"meta":{"timestamp":"..."}}` (per Part 13, not bare shapes)
- RLS enforced: set `app.tenant_id` at session open
- `@requires_mode` NOT applied — onboarding runs for all modes

### Mode derivation (Python, in onboarding_service.py)

```python
def derive_initial_mode(area_acres: float | None, crop_count: int, animal_count: int) -> str:
    """
    Returns 'SOLO' or 'GROWTH'. Commercial is admin-assigned only.
    Thresholds per TFOS_Navigation_Architecture_v2_1_Addendum.md §8.
    """
    if area_acres is not None and area_acres >= 1.0:
        return "GROWTH"
    if crop_count > 2:
        return "GROWTH"
    if animal_count > 10:
        return "GROWTH"
    return "SOLO"
```

### livestock_register vs hive_register routing

**CRITICAL — Schema Reality Drift (added to Part 4 next commit):**

`tenant.livestock` does NOT exist. The schema is split:
- `tenant.livestock_register` for animals (goats, chickens, pigs, cattle)
- `tenant.hive_register` for bees (apiculture)

The onboarding `POST /production-units` and `POST /livestock` endpoints receive rows with `production_id`. Route INSERT based on prefix:

```python
def route_livestock_row(production_id: str) -> str:
    """Returns target table name."""
    if production_id.startswith("HIV-") or production_id.startswith("API-"):
        return "tenant.hive_register"
    if production_id.startswith("LIV-") or production_id.startswith("FRT-") or production_id.startswith("CRP-"):
        # LIV-* → livestock_register
        # Others should not arrive via /livestock endpoint; reject
        if production_id.startswith("LIV-"):
            return "tenant.livestock_register"
        raise ValueError(f"Invalid production_id prefix for /livestock: {production_id}")
    raise ValueError(f"Unknown production_id prefix: {production_id}")
```

If production_id is missing from payload, look up by `production_name` against `shared.productions` → route by `category` (Apiculture → hive_register, Livestock → livestock_register).

### Audit events emitted

Every onboarding write emits exactly one `audit.events` row via existing `emit_audit_event()` helper:

| Endpoint | event_type | entity_type | entity_id |
|---|---|---|---|
| POST /farm-basics | `FARM_CREATED` | `farm` | new `farm_id` |
| POST /production-units | (per row) `ONBOARDING_STARTED` one time + record creation via existing `production_units` insert path (already emits audit) | `production_unit` | `pu_id` |
| POST /livestock | (per row) routed insert into livestock_register OR hive_register + one `ONBOARDING_STARTED` event per row | `livestock` or `hive` | `animal_id` or `hive_id` |
| POST /complete | `ONBOARDING_COMPLETED` | `tenant` | `tenant_id` |

### Onboarding spec drift flag

The file `onboarding_wizard_spec.md` (v1.1) still references "tenant.livestock rows" in 1-2 places. The spec is the contract for UI copy + endpoint shapes — the `livestock_register`/`hive_register` routing decision is engine-side only. Do NOT rewrite the spec to match engine reality; farmer UI just says "animals" per Universal Naming v2.

---

## 3. SSE TIS Advisory Stream

### Library choice

**Use `sse-starlette` (already compatible with FastAPI; no custom streaming boilerplate needed).**

If not installed:
```bash
docker exec -t teivaka_api pip install sse-starlette==2.1.3
```

Add to `requirements.txt` in same commit.

### File: `/opt/teivaka/11_application_code/app/routers/tis_stream.py`

### Endpoints

```
GET  /api/v1/tis/stream                 # SSE, Bearer auth, 25s keep-alive
POST /api/v1/tis/advisories/:id/read    # mark read, emit ADVISORY_READ audit event
```

### SSE event shape (per v2.1 §11.8)

```json
{
  "type": "TIS_ADVISORY",
  "advisory_id": "<uuid>",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL",
  "preview": "...",
  "source_task_id": "<text?>",
  "source_audit_event_id": "<uuid?>"
}
```

### Behavior

- One stream per authenticated session.
- Bearer auth header validated at connection open. Reject 401 if expired.
- On connect, flush any unread advisories (`read_at IS NULL`) for the user, ordered `created_at ASC`.
- Keep-alive ping every 25s: `event: ping\ndata: {}\n\n`.
- Close on auth expiry (re-validate token every 5 min).
- Connection tracking in-memory per worker (Redis pub/sub fan-out deferred to Phase 5 multi-worker).

### POST read handler

- Validate advisory belongs to user (`user_id = auth user`, tenant_id enforced by RLS).
- `UPDATE tenant.tis_advisories SET read_at = NOW() WHERE advisory_id = :id AND read_at IS NULL` (idempotent).
- Emit audit event: `event_type='ADVISORY_READ'`, `entity_type='advisory'`, `entity_id=advisory_id`, `payload={advisory_id, read_at}`.
- Response: `{"status":"success","data":{"advisory_id":"...", "read_at":"..."}}`.

---

## 4. Verify Day 2

```bash
# A. Alembic head
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "SELECT version_num FROM tenant.alembic_version;"
# Expected: 029_tis_advisories

# B. tis_advisories table exists + RLS on
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "\d tenant.tis_advisories"
# Expected: 10 cols, partial index idx_tis_advisories_user_unread, RLS enabled, 1 policy

# C. audit.events check constraint updated
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='audit_events_event_type_valid';"
# Expected: list includes ADVISORY_READ, ONBOARDING_STARTED, ONBOARDING_COMPLETED

# D. Onboarding status endpoint
TOKEN=$(curl -s -X POST https://teivaka.com/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"founder@teivaka.com","password":"<pw>"}' | jq -r '.data.access_token')
curl -s https://teivaka.com/api/v1/onboarding/status -H "Authorization: Bearer $TOKEN"
# Expected: {"status":"success","data":{"step":"..","...":".."},"meta":{...}}

# E. SSE stream connects + keeps alive
curl -N -H "Authorization: Bearer $TOKEN" https://teivaka.com/api/v1/tis/stream
# Expected: ": keep-alive" comment lines every 25s. Ctrl+C to close.

# F. Insert a test advisory, confirm POST read works
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "
  INSERT INTO tenant.tis_advisories (tenant_id, user_id, priority, preview, full_message)
  VALUES ('<tenant>', '<user>', 'MEDIUM', 'Test preview', 'Test full message') RETURNING advisory_id;"
# Take the returned UUID
curl -s -X POST https://teivaka.com/api/v1/tis/advisories/<UUID>/read -H "Authorization: Bearer $TOKEN"
# Expected: {"status":"success","data":{"advisory_id":"...","read_at":"..."}}

# G. Audit chain row emitted for ADVISORY_READ
docker exec -t teivaka_db psql -U teivaka -d teivaka_db -P pager=off -c "
  SELECT event_type, entity_id, occurred_at FROM audit.events
  WHERE event_type='ADVISORY_READ' ORDER BY occurred_at DESC LIMIT 1;"
# Expected: one row matching the advisory UUID
```

---

## 5. Commit

```
git add -A
git commit -m "option-3+nav-v2-1 day 2: migration 029 tis_advisories + onboarding router + SSE TIS stream"
```

---

## 6. Decision Tree bindings (Day 2 specific)

If Claude Code hits any of these, apply default from `TFOS_DECISION_TREE_v1.md`:

- S-01 (slot collision) → already applied: 029 not 028.
- S-02 (split table drift) → already applied: livestock_register/hive_register routing baked in.
- S-13 (drift list entry) → at end of Day 2, append `tenant.livestock` → `tenant.livestock_register`/`tenant.hive_register` to Master Build Instruction v4 Part 4 drift table.
- S-20 (migration without rebuild) → after migration applies, `cd /opt/teivaka/04_environment && docker compose up -d --build api worker-ai`.

---

## 7. Known follow-ups (do NOT fix in Day 2 — file for later)

- Drift: `audit.events.payload_jsonb` vs spec `payload`, `payload_sha256` vs spec `payload_hash`, `created_at` vs spec `received_at`. Add to Part 4 drift list, do not rename.
- Missing `audit.report_exports` — build in Phase 6 financial work, not now.
- Category taxonomy drift in `shared.productions` (13 longform labels vs 6 canonical codes — CRP/FRT/LIV/FOR/AQU/SUP). Deferred decision A/B/C from Boss pending. Does NOT block Day 2.
- Onboarding wizard spec references `tenant.livestock` — farmer-facing copy is fine ("animals"), engine routes correctly.

---

## END DAY 2 SPEC

On completion, Day 2 report should include:
- alembic head = 029_tis_advisories
- 5 onboarding endpoints live + auth-protected
- SSE stream responds with keep-alives
- 1 test advisory successfully read + audit row emitted
- Commit hash
- Any scenario from Decision Tree applied (list by S-NN)

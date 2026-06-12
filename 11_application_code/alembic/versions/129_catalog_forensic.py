"""129 — (+) Catalog forensic: kills, merges, vocab, livestock pack (Operator-ratified)

Executes the Operator-ratified (+) catalog register (2026-06-12, "approve all"):

KILL (deactivate, never delete — historical audit rows stay valid):
  FEED_GIVEN (dup of FEED_USED, B60) · BEDDING_CHANGED (dup LITTER_CHANGED) ·
  SICK_BIRD_NOTED (dup HEALTH_OBSERVATION) · FLOCK_CULLED (dup CULL_LOGGED) ·
  EGGS_DISCARDED (covered by EGGS_GRADED) · WAGE_PAID + WAGES_PAID (dup of
  WORKER_PAID, Strike #93) · SELL_CROPS (dup CROP_SOLD) · INCIDENT_NOTED
  (dup INCIDENT_REPORTED) · FEED_INVENTORY_CHECK (double-books Inventory)

MERGE (deactivate losers; survivor relabeled / re-grouped universal):
  BUY_SUPPLIES + INPUT_RECEIVED + INPUT_PURCHASED → SUPPLIES_RECEIVED (→ MONEY)
  FEED_PURCHASED → FEED_RECEIVED ("Feed arrived"; payload already carries cost_fjd)
  EGGS_GIVEN → EGGS_SOLD ("Eggs out" w/ sold/given picker)
  WATER_REFILLED → WATER_CONSUMED ("Water")
  INCIDENT_REPORT + PREDATOR_INCIDENT + FIELD_INCIDENT + WORKER_INCIDENT
    → INCIDENT_REPORTED (→ NOTES; payload incident_type already covers kinds)
  COOP_REPAIR → EQUIPMENT_MAINTAINED

FIX:
  MORTALITY_INVESTIGATED off the (+) grid (is_user_facing=false) — reached from
  the mortality record's follow-up flow instead.
  Plain-farmer labels via naming_dictionary (Pruning, Weeding, Transplanting…).

ADD (Operator-ratified Option A — minimal livestock pack):
  MILK_COLLECTED, ANIMAL_MOVED, BREEDING_LOGGED catalog rows (LIVESTOCK group)
  + tenant.livestock_events backing table (FORCE RLS, mirrors poultry_event_log)
  so LIVESTOCK_BIRTH/MORTALITY/ACQUIRED/SALE/VACCINATION + the three new types
  have a real polymorphic /events destination. MEDICATION_GIVEN stays in catalog
  (form ships this slice).

Revision ID: 129_catalog_forensic
Revises: 128_control_room_events
"""
from alembic import op
import sqlalchemy as sa

revision = "129_catalog_forensic"
down_revision = "128_control_room_events"
branch_labels = None
depends_on = None

_DEACTIVATE = [
    # kills
    "FEED_GIVEN", "BEDDING_CHANGED", "SICK_BIRD_NOTED", "FLOCK_CULLED",
    "EGGS_DISCARDED", "WAGE_PAID", "WAGES_PAID", "SELL_CROPS",
    "INCIDENT_NOTED", "FEED_INVENTORY_CHECK",
    # merge losers
    "BUY_SUPPLIES", "INPUT_RECEIVED", "INPUT_PURCHASED",
    "FEED_PURCHASED", "EGGS_GIVEN", "WATER_REFILLED",
    "INCIDENT_REPORT", "PREDATOR_INCIDENT", "FIELD_INCIDENT", "WORKER_INCIDENT",
    "COOP_REPAIR",
]

_RELABEL = {
    "PRUNING_TRAINING":     "Pruning",
    "WEED_MANAGEMENT":      "Weeding",
    "TRANSPLANT_LOGGED":    "Transplanting",
    "INPUT_USED_ADJUSTMENT": "Fix a stock count",
    "SUPPLIES_RECEIVED":    "Supplies bought / received",
    "FEED_RECEIVED":        "Feed arrived",
    "EGGS_SOLD":            "Eggs out (sold / given)",
    "WATER_CONSUMED":       "Water",
    "INCIDENT_REPORTED":    "Incident",
    "MEDICATION_GIVEN":     "Medication given",
    "MILK_COLLECTED":       "Milk collected",
    "ANIMAL_MOVED":         "Animals moved (paddock)",
    "BREEDING_LOGGED":      "Breeding / mating",
}

# (event_type, catalog_group, sort_order, livestock_only, notes)
_NEW_EVENTS = [
    ("MILK_COLLECTED", "LIVESTOCK", 80, True, "Daily milk collection (dairy cattle/goats)"),
    ("ANIMAL_MOVED",   "LIVESTOCK", 90, True, "Paddock / grazing rotation move"),
    ("BREEDING_LOGGED", "LIVESTOCK", 100, True, "Mating / AI / pregnancy check record"),
]


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def _rls(conn, table, grants="SELECT, INSERT, UPDATE"):
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"""
        CREATE POLICY {table}_tenant_isolation ON tenant.{table}
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text(f"""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT {grants} ON tenant.{table} TO teivaka_app;
            END IF;
        END $$
    """))


def upgrade():
    conn = op.get_bind()

    # 1. KILL + MERGE losers: deactivate (reversible; audit history untouched).
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET is_active = false WHERE event_type = ANY(:ets)"),
        {"ets": _DEACTIVATE})

    # 2. Survivors go universal: visible to every farm via default-active groups.
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET catalog_group = 'MONEY' WHERE event_type = 'SUPPLIES_RECEIVED'"))
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET catalog_group = 'NOTES' WHERE event_type = 'INCIDENT_REPORTED'"))

    # 3. MORTALITY_INVESTIGATED leaves the (+) grid (reached from the mortality record).
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET is_user_facing = false WHERE event_type = 'MORTALITY_INVESTIGATED'"))

    # 4. New livestock catalog rows (Operator-ratified Option A).
    for et, grp, so, lo, notes in _NEW_EVENTS:
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, is_user_facing, is_compound,
                 livestock_only, min_role, min_mode, backdating_window_days,
                 requires_reason_after_days, is_active, notes)
            VALUES (:et, :grp, :so, true, false, :lo, 'WORKER', 'SOLO', 14, NULL, true, :notes)
            ON CONFLICT (event_type) DO NOTHING
        """), {"et": et, "grp": grp, "so": so, "lo": lo, "notes": notes})

    # 5. Plain-farmer labels (upsert — overwrite stale labels).
    for ck, lbl in _RELABEL.items():
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE)
            ON CONFLICT (concept_key, locale, form) DO UPDATE SET value = EXCLUDED.value, is_active = TRUE
        """), {"ck": f"event.{ck}.label", "lbl": lbl})

    # 6. Livestock events backing table (mirrors poultry_event_log; animal_ref is a
    #    free-text tag/name — no animal register FK yet, named honestly).
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.livestock_events (
            event_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            farm_id                 TEXT NOT NULL REFERENCES tenant.farms(farm_id),
            pu_id                   TEXT REFERENCES tenant.production_units(pu_id),
            animal_ref              TEXT,
            species                 TEXT,
            created_by              UUID NOT NULL,
            event_type              TEXT NOT NULL,
            occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            payload_jsonb           JSONB NOT NULL DEFAULT '{}'::jsonb,
            payload_schema_version  INTEGER NOT NULL DEFAULT 1,
            audit_event_id          UUID NOT NULL REFERENCES audit.events(event_id)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_livestock_events_farm ON tenant.livestock_events (tenant_id, farm_id, occurred_at DESC)"))
    _rls(conn, "livestock_events")

    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET is_active = true WHERE event_type = ANY(:ets)"),
        {"ets": _DEACTIVATE})
    conn.execute(sa.text(
        "UPDATE shared.event_type_catalog SET is_user_facing = true WHERE event_type = 'MORTALITY_INVESTIGATED'"))
    for et, _, _, _, _ in _NEW_EVENTS:
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.livestock_events"))
    _rebuild_audit_check(conn)

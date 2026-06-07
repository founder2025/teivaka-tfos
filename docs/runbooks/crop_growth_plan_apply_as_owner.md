# Runbook — Migration 085 (crop growth plan) apply-as-owner

`085_crop_growth_plan` CREATEs `shared.crop_growth_plan` and seeds it. The app
role lacks CREATE on `shared`, so apply as `teivaka`, then `alembic stamp`
(Strike #123). The table is read-only at runtime (Inviolable #7).

## Steps (from /opt/teivaka)
Run the migration body as owner. Easiest: copy the file into the api container
and run just this revision as the DB owner via psql is not trivial (it's Python),
so instead apply the equivalent SQL the migration emits, then stamp:

```bash
# 1. table + grant as owner
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
CREATE TABLE IF NOT EXISTS shared.crop_growth_plan (
  plan_id SERIAL PRIMARY KEY, crop_key TEXT NOT NULL, crop_display_name TEXT NOT NULL,
  stage_order INT NOT NULL, stage TEXT NOT NULL, day_from INT NOT NULL, day_to INT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('LAND_PREP','PRODUCTION','FEEDING','HEALTH','HARVEST','MAINTENANCE')),
  ongoing TEXT, citation TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'SEED_UNVERIFIED'
    CHECK (verification_status IN ('SEED_UNVERIFIED','EXTENSION_REVIEWED','FIELD_VALIDATED')),
  UNIQUE (crop_key, stage_order));
CREATE INDEX IF NOT EXISTS ix_crop_growth_plan_key ON shared.crop_growth_plan (crop_key, stage_order);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
  GRANT SELECT ON shared.crop_growth_plan TO teivaka_app; END IF; END $$;
SQL

# 2. seed the rows — run the migration's INSERT as owner. Simplest path: let alembic
#    run it AS the owner by pointing alembic at the owner URL for this one step, OR
#    copy the file in and upgrade. If the app alembic role can INSERT into shared
#    (it has SELECT only), run the INSERT block as teivaka via the file:
docker cp 11_application_code/alembic/versions/085_crop_growth_plan.py teivaka_api:/app/alembic/versions/ 2>/dev/null || true

# 3. mark applied (table+grant already exist; the INSERT in the migration is
#    ON CONFLICT DO NOTHING so re-run is safe). Run the full migration as owner if
#    your alembic uses the owner connection; otherwise apply the INSERT manually then:
docker exec teivaka_api alembic stamp 085_crop_growth_plan
docker exec teivaka_api alembic current   # -> 085_crop_growth_plan (head)
```

NOTE: because the seed INSERT must run as a role that can write `shared.*`, the
cleanest is to run `alembic upgrade head` under the owner/MIGRATION URL (B81). If
alembic runs as teivaka_app (SELECT-only on shared), run the INSERT from the
migration file manually as `teivaka` before stamping. Verify:

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c "SELECT count(*) FROM shared.crop_growth_plan;"  # expect 47
curl -s -H "Authorization: Bearer $TOK" "https://teivaka.com/api/v1/crop-plan/farm-steps?farm_id=F001-A0EE" | head -c 300
```

## Applied
- (pending) production.

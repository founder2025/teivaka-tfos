# Runbook — Migration 164 (user location-sharing consent) apply-as-owner

**Why this exists:** `164_user_location_sharing` runs `ALTER TABLE tenant.users
ADD COLUMN share_location / location_share_ack_at`, but alembic authenticates as
`teivaka_app`, which is not the owner of `tenant.users`. `alembic upgrade head`
fails with `must be owner of table users` (Strike #123). Apply the DDL as the
`teivaka` owner, then `alembic stamp`. New columns inherit the table's existing
grants to `teivaka_app`, so no extra GRANT is needed.

## Steps (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS share_location BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS location_share_ack_at TIMESTAMPTZ;
SQL

docker exec teivaka_api alembic stamp 164_user_location_sharing
docker exec teivaka_api alembic current        # -> 164_user_location_sharing (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT column_name, data_type, column_default FROM information_schema.columns \
   WHERE table_schema='tenant' AND table_name='users' \
   AND column_name IN ('share_location','location_share_ack_at');"
# In the browser: Farm Settings -> Preferences -> 'Show my location to verified
# members' toggle reflects + saves; GET /api/v1/me/prefs returns share_location +
# location_share_ack.
```

## Note on semantics

`share_location` defaults true (opt-out posture), but Slice 3 map visibility
requires BOTH `share_location = true` AND `location_share_ack_at IS NOT NULL`
(AND the viewer is a verified member). So default-true alone never exposes a
pre-existing member — they only appear once they have made an explicit choice
(the toggle stamps `location_share_ack_at`).

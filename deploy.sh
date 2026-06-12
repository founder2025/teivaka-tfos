#!/usr/bin/env bash
# deploy.sh — ONE command to put the branch live on the prod server.
#
# Run on the prod server (168.144.36.120, /opt/teivaka). Order matters:
#   1. fetch + hard-reset to the branch (snapshots any dirty tree first)
#   2. clean --no-cache API rebuild  (bakes the FRESHLY-PULLED migration files into the
#      image — the Dockerfile COPYs alembic/, so migrations must be built BEFORE they run;
#      running them against the already-running container uses STALE baked migrations)
#   3. alembic upgrade head on the fresh image, as the table OWNER (Strike #123), via a
#      one-off `compose run` — schema is current before the new app serves traffic
#   4. assert the migration OBJECTS actually landed (rows/constraints, not just "head=X")
#   5. up -d api + wait-for-healthy + verify-deploy.sh (B78 cached-COPY parity guard)
#   6. frontend npm run build (Caddy serves dist/ — stale dist = "nothing changed")
#   7. HTTP smoke of the new endpoints through teivaka.com (retries while api warms up)
#
# Idempotent — safe to re-run. Exit 0 only if every step passes.
#
#   cd /opt/teivaka && bash deploy.sh
#   cd /opt/teivaka && bash deploy.sh <branch> <expected_head>
set -uo pipefail

BRANCH="${1:-claude/beautiful-fermi-F0dLX}"
EXPECTED_HEAD="${2:-129_catalog_forensic}"
ROOT="/opt/teivaka"
COMPOSE="docker compose -f ${ROOT}/04_environment/docker-compose.yml"
PSQL="docker exec -i teivaka_db psql -v ON_ERROR_STOP=1 -tA -U teivaka -d teivaka_db"
SITE="${SITE:-https://teivaka.com}"

cd "$ROOT" || { echo "❌ cannot cd to $ROOT (run this on the prod server)"; exit 2; }

fail=0
say() { echo -e "\n=== $1 ==="; }
ok()  { echo "   ✅ $1"; }
bad() { echo "   ❌ $1"; fail=1; }

# ---------------------------------------------------------------------------
say "1/7  Sync repo → ${BRANCH}"
SELF_SHA_BEFORE="$(sha256sum "${ROOT}/deploy.sh" 2>/dev/null | cut -d' ' -f1)"
if ! git diff --quiet || ! git diff --cached --quiet; then
  snap="server-snapshot-$(date +%Y%m%d-%H%M%S)"
  git branch "$snap" >/dev/null 2>&1 && echo "   ↳ dirty tree preserved on local branch ${snap}"
fi
if git fetch origin "$BRANCH" 2>/tmp/dep_fetch.out; then ok "fetched origin/${BRANCH}"; else bad "git fetch failed (see /tmp/dep_fetch.out)"; cat /tmp/dep_fetch.out; fi
if git reset --hard "origin/${BRANCH}" >/tmp/dep_reset.out 2>&1; then ok "reset to $(git rev-parse --short HEAD)"; else bad "git reset failed"; cat /tmp/dep_reset.out; fi

# Self-update guard: if the pull changed THIS script, the copy bash already
# loaded (and its baked-in defaults like EXPECTED_HEAD) is stale — re-exec the
# fresh script once with the caller's original args. Surfaced 2026-06-12 when
# the old default head (126) judged a correctly-applied 127 as a failure.
SELF_SHA_AFTER="$(sha256sum "${ROOT}/deploy.sh" 2>/dev/null | cut -d' ' -f1)"
if [ "$SELF_SHA_BEFORE" != "$SELF_SHA_AFTER" ] && [ "${TFOS_DEPLOY_REEXEC:-0}" != "1" ]; then
  echo "   ↳ deploy.sh itself changed in this pull — re-running the fresh script"
  TFOS_DEPLOY_REEXEC=1 exec bash "${ROOT}/deploy.sh" "$@"
fi

# ---------------------------------------------------------------------------
say "2/7  Clean API rebuild (--no-cache, B78) — bakes fresh migration files"
$COMPOSE build --no-cache api > /tmp/dep_build.out 2>&1 && ok "api image rebuilt clean" || { bad "api build FAILED"; tail -n 25 /tmp/dep_build.out; }

# ---------------------------------------------------------------------------
say "3/7  Alembic migrations → head on the fresh image (as table OWNER — Strike #123)"
# env.py connects alembic with the runtime DATABASE_URL (the non-owner app role), so
# owner-level DDL (ALTER TABLE tenant.users ...) fails InsufficientPrivilege. Override
# DATABASE_URL to the owner (POSTGRES_USER, pulled from the db container, password URL-
# encoded). Use `compose run --rm` so it runs the JUST-BUILT image, not the running one.
PGUSER="$(docker exec teivaka_db printenv POSTGRES_USER 2>/dev/null || echo teivaka)"
PGPASS="$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)"
PGDB="$(docker exec teivaka_db printenv POSTGRES_DB 2>/dev/null || echo teivaka_db)"
ENCPASS="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$PGPASS" 2>/dev/null || echo "$PGPASS")"
OWNER_URL="postgresql+asyncpg://${PGUSER}:${ENCPASS}@db:5432/${PGDB}"
$COMPOSE run --rm -T -e DATABASE_URL="$OWNER_URL" api alembic upgrade head > /tmp/dep_alembic.out 2>&1 \
  && ok "alembic upgrade ran (as ${PGUSER})" || { bad "alembic upgrade FAILED"; tail -n 30 /tmp/dep_alembic.out; }
HEAD="$($PSQL -c "SELECT version_num FROM tenant.alembic_version;" 2>/dev/null | tr -d '[:space:]')"
if [ "$HEAD" = "$EXPECTED_HEAD" ]; then ok "alembic head = ${HEAD}"; else bad "alembic head is '${HEAD}', expected '${EXPECTED_HEAD}'"; fi

# ---------------------------------------------------------------------------
say "4/7  Assert migration objects landed"
CROPS="$($PSQL -c "SELECT count(*) FROM shared.reference_library WHERE category='CROP';" 2>/dev/null | tr -d '[:space:]')"
[ "${CROPS:-0}" -ge 90 ] 2>/dev/null && ok "reference_library CROP rows = ${CROPS}" || bad "reference_library CROP rows = '${CROPS}' (expected ~94 — migration 120 did not seed)"
REFTOT="$($PSQL -c "SELECT count(*) FROM shared.reference_library;" 2>/dev/null | tr -d '[:space:]')"
[ "${REFTOT:-0}" -ge 300 ] 2>/dev/null && ok "reference_library total rows = ${REFTOT}" || bad "reference_library total = '${REFTOT}' (expected ~312)"
CAT="$($PSQL -c "SELECT count(*) FROM shared.library_type_catalog;" 2>/dev/null | tr -d '[:space:]')"
[ "${CAT:-0}" -ge 5 ] 2>/dev/null && ok "library_type_catalog rows = ${CAT}" || bad "library_type_catalog rows = '${CAT}' (migration 121 catalog missing)"
FK="$($PSQL -c "SELECT count(*) FROM pg_constraint WHERE conname='farm_libraries_library_type_fkey';" 2>/dev/null | tr -d '[:space:]')"
[ "${FK:-0}" = "1" ] && ok "farm_libraries → catalog FK present" || bad "farm_libraries_library_type_fkey missing (Strike #80 FK did not apply)"
AUDIT="$($PSQL -c "SELECT pg_get_constraintdef(oid) LIKE '%LIBRARY_ROW_UPDATED%' FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$AUDIT" = "t" ] && ok "audit.events CHECK includes LIBRARY_ROW_UPDATED" || bad "LIBRARY_ROW_UPDATED not in audit CHECK (rename edits would 500)"
PHOTOHASH="$($PSQL -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='field_events' AND column_name IN ('photo_sha256','audit_hash');" 2>/dev/null | tr -d '[:space:]')"
[ "${PHOTOHASH:-0}" = "2" ] && ok "field_events photo-hash columns present" || bad "field_events photo_sha256/audit_hash missing (migration 122)"
BUYERCOMM="$($PSQL -c "SELECT to_regclass('tenant.buyer_communications') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')"
[ "$BUYERCOMM" = "t" ] && ok "buyer_communications table present" || bad "buyer_communications missing (migration 123)"
COMMEVT="$($PSQL -c "SELECT pg_get_constraintdef(oid) LIKE '%COMMUNICATION_LOGGED%' FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$COMMEVT" = "t" ] && ok "audit.events CHECK includes COMMUNICATION_LOGGED" || bad "COMMUNICATION_LOGGED not in audit CHECK"
CUSTFIELDS="$($PSQL -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='customers' AND column_name IN ('ferry_dependent','distance_km','contact_role','preferred_channel');" 2>/dev/null | tr -d '[:space:]')"
[ "${CUSTFIELDS:-0}" = "4" ] && ok "customers buyer-fields present (124)" || bad "customers buyer-fields missing (migration 124 — add-buyer would fail)"
CRM="$($PSQL -c "SELECT (to_regclass('tenant.buyer_demand_signals') IS NOT NULL)::int + (to_regclass('tenant.buyer_leads') IS NOT NULL)::int + (to_regclass('tenant.buyer_disputes') IS NOT NULL)::int;" 2>/dev/null | tr -d '[:space:]')"
[ "${CRM:-0}" = "3" ] && ok "Buyers CRM tables present (125)" || bad "Buyers CRM tables missing (${CRM}/3 — migration 125)"
DISPEVT="$($PSQL -c "SELECT pg_get_constraintdef(oid) LIKE '%DISPUTE_LOGGED%' FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$DISPEVT" = "t" ] && ok "audit.events CHECK includes DISPUTE_LOGGED" || bad "DISPUTE_LOGGED not in audit CHECK"
FPART="$($PSQL -c "SELECT to_regclass('tenant.farm_partners') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')"
[ "$FPART" = "t" ] && ok "farm_partners table present (127)" || bad "farm_partners missing (migration 127 — Partnerships adds would fail)"
PARTEVT="$($PSQL -c "SELECT pg_get_constraintdef(oid) LIKE '%PARTNER_ADDED%' FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$PARTEVT" = "t" ] && ok "audit.events CHECK includes PARTNER_ADDED" || bad "PARTNER_ADDED not in audit CHECK"
CRROOM="$($PSQL -c "SELECT (pg_get_constraintdef(oid) LIKE '%FARM_PROFILE_UPDATED%' AND pg_get_constraintdef(oid) LIKE '%CYCLE_RELABELED%') FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$CRROOM" = "t" ] && ok "audit.events CHECK includes control-room events (128)" || bad "control-room events (FARM_PROFILE_UPDATED/CYCLE_RELABELED) not in audit CHECK"
LVEVT="$($PSQL -c "SELECT to_regclass('tenant.livestock_events') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')"
[ "$LVEVT" = "t" ] && ok "livestock_events table present (129)" || bad "livestock_events missing (migration 129 — livestock forms would 500)"
KILLED="$($PSQL -c "SELECT count(*) FROM shared.event_type_catalog WHERE event_type IN ('FEED_GIVEN','BEDDING_CHANGED','WAGES_PAID','SELL_CROPS') AND is_active = false;" 2>/dev/null | tr -d '[:space:]')"
[ "${KILLED:-0}" = "4" ] && ok "catalog kills applied (129 — duplicate tiles deactivated)" || bad "catalog kills not applied (${KILLED}/4 — migration 129)"
MILK="$($PSQL -c "SELECT pg_get_constraintdef(oid) LIKE '%MILK_COLLECTED%' FROM pg_constraint WHERE conname='events_event_type_check';" 2>/dev/null | tr -d '[:space:]')"
[ "$MILK" = "t" ] && ok "audit.events CHECK includes MILK_COLLECTED (livestock pack)" || bad "MILK_COLLECTED not in audit CHECK"

# ---------------------------------------------------------------------------
say "5/7  Bring API up + wait healthy + parity check"
$COMPOSE up -d api > /tmp/dep_up.out 2>&1 && ok "api container started" || { bad "api up FAILED"; tail -n 15 /tmp/dep_up.out; }
healthy=0
for i in $(seq 1 30); do
  s="$(docker inspect -f '{{.State.Health.Status}}' teivaka_api 2>/dev/null || echo unknown)"
  if [ "$s" = "healthy" ]; then healthy=1; break; fi
  sleep 2
done
[ "$healthy" = "1" ] && ok "api healthy" || bad "api NOT healthy after 60s — docker logs teivaka_api"
if bash "${ROOT}/04_environment/verify-deploy.sh" > /tmp/dep_verify.out 2>&1; then ok "container code == host (no B78 drift)"; else bad "DEPLOY DRIFT — container serving stale code"; tail -n 8 /tmp/dep_verify.out; fi

# ---------------------------------------------------------------------------
say "6/7  Frontend build (Caddy serves dist/)"
( cd "${ROOT}/frontend" && npm run build ) > /tmp/dep_fe.out 2>&1 && ok "frontend built → dist/" || { bad "frontend build FAILED"; tail -n 25 /tmp/dep_fe.out; }

# ---------------------------------------------------------------------------
say "7/7  HTTP smoke (endpoint mounted = 401 auth-required, NOT 404/5xx)"
smoke() { # $1=path — pass if 200/401/403 (wired); retry through 000/5xx while api warms
  local code=""
  for i in $(seq 1 10); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${SITE}$1" 2>/dev/null)"
    case "$code" in 200|401|403) ok "$1 → ${code}"; return;; esac
    sleep 3
  done
  bad "$1 → ${code} (expected wired endpoint, got dead/error)"
}
smoke "/api/v1/reference-library?category=CROP"
smoke "/api/v1/farm-library-types"
smoke "/api/v1/chemicals"

# ---------------------------------------------------------------------------
echo
if [ "$fail" = "0" ]; then
  echo "🟢 DEPLOY OK — $(git rev-parse --short HEAD) live. Hard-refresh the browser (Ctrl/Cmd-Shift-R)."
  echo "   Verify: /farm/library (knowledge ref) + /me/library (management, now with Edit + Note)."
else
  echo "🔴 DEPLOY INCOMPLETE — fix the ❌ above and re-run (the script is idempotent)."
  echo "   alembic log: /tmp/dep_alembic.out   api build: /tmp/dep_build.out   frontend: /tmp/dep_fe.out"
fi
exit "$fail"

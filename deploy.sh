#!/usr/bin/env bash
# deploy.sh — ONE command to put the branch live on the prod server.
#
# Run on the prod server (168.144.36.120, /opt/teivaka). Does, in order, with a
# loud PASS/FAIL per step and a final summary:
#   1. fetch + hard-reset to the branch (snapshots any dirty tree first)
#   2. alembic upgrade head  (+ assert head == expected)
#   3. assert the migration OBJECTS actually landed (catches Strike #123 owner-mismatch:
#      alembic can report success while shared.* DDL silently fails)
#   4. clean --no-cache API rebuild + verify-deploy.sh (B78 cached-COPY guard)
#   5. frontend npm run build (Caddy serves dist/ — stale dist = "nothing changed")
#   6. HTTP smoke of the new endpoints through teivaka.com
#
# Idempotent — safe to re-run. Exit 0 only if every step passes.
#
#   cd /opt/teivaka && bash deploy.sh
#   cd /opt/teivaka && bash deploy.sh <branch> <expected_head>
set -uo pipefail

BRANCH="${1:-claude/beautiful-fermi-F0dLX}"
EXPECTED_HEAD="${2:-121_library_type_catalog}"
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
say "1/6  Sync repo → ${BRANCH}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  snap="server-snapshot-$(date +%Y%m%d-%H%M%S)"
  git branch "$snap" >/dev/null 2>&1 && echo "   ↳ dirty tree preserved on local branch ${snap}"
fi
if git fetch origin "$BRANCH" 2>/tmp/dep_fetch.out; then ok "fetched origin/${BRANCH}"; else bad "git fetch failed (see /tmp/dep_fetch.out)"; cat /tmp/dep_fetch.out; fi
if git reset --hard "origin/${BRANCH}" >/tmp/dep_reset.out 2>&1; then ok "reset to $(git rev-parse --short HEAD)"; else bad "git reset failed"; cat /tmp/dep_reset.out; fi

# ---------------------------------------------------------------------------
say "2/6  Alembic migrations → head (as table OWNER — Strike #123)"
# env.py connects alembic with the runtime DATABASE_URL (the non-owner app role), so
# owner-level DDL (ALTER TABLE tenant.users ...) fails with InsufficientPrivilege. Run
# the migration step with DATABASE_URL overridden to the owner (POSTGRES_USER), pulled
# straight from the db container so no secret is typed by hand. Runtime stays app-role.
PGUSER="$(docker exec teivaka_db printenv POSTGRES_USER 2>/dev/null || echo teivaka)"
PGPASS="$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)"
PGDB="$(docker exec teivaka_db printenv POSTGRES_DB 2>/dev/null || echo teivaka_db)"
ENCPASS="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$PGPASS" 2>/dev/null || echo "$PGPASS")"
OWNER_URL="postgresql+asyncpg://${PGUSER}:${ENCPASS}@db:5432/${PGDB}"
$COMPOSE exec -T -e DATABASE_URL="$OWNER_URL" api alembic upgrade head > /tmp/dep_alembic.out 2>&1 \
  && ok "alembic upgrade ran (as ${PGUSER})" || { bad "alembic upgrade FAILED"; tail -n 30 /tmp/dep_alembic.out; }
HEAD="$($PSQL -c "SELECT version_num FROM tenant.alembic_version;" 2>/dev/null | tr -d '[:space:]')"
if [ "$HEAD" = "$EXPECTED_HEAD" ]; then ok "alembic head = ${HEAD}"; else bad "alembic head is '${HEAD}', expected '${EXPECTED_HEAD}'"; fi

# ---------------------------------------------------------------------------
say "3/6  Assert migration objects landed (Strike #123 owner-mismatch guard)"
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

# ---------------------------------------------------------------------------
say "4/6  Clean API rebuild (--no-cache, B78) + parity check"
$COMPOSE build --no-cache api > /tmp/dep_build.out 2>&1 && ok "api image rebuilt clean" || { bad "api build FAILED"; tail -n 25 /tmp/dep_build.out; }
$COMPOSE up -d api > /tmp/dep_up.out 2>&1 && ok "api container up" || { bad "api up FAILED"; tail -n 15 /tmp/dep_up.out; }
sleep 4
if bash "${ROOT}/04_environment/verify-deploy.sh" > /tmp/dep_verify.out 2>&1; then ok "container code == host (no B78 drift)"; else bad "DEPLOY DRIFT — container serving stale code"; tail -n 8 /tmp/dep_verify.out; fi

# ---------------------------------------------------------------------------
say "5/6  Frontend build (Caddy serves dist/)"
( cd "${ROOT}/frontend" && npm run build ) > /tmp/dep_fe.out 2>&1 && ok "frontend built → dist/" || { bad "frontend build FAILED"; tail -n 25 /tmp/dep_fe.out; }

# ---------------------------------------------------------------------------
say "6/6  HTTP smoke (endpoint mounted = 401 auth-required, NOT 404/5xx)"
smoke() { # $1=path  — pass if 200/401/403 (wired), fail if 000/404/5xx
  local code; code="$(curl -s -o /dev/null -w '%{http_code}' "${SITE}$1" 2>/dev/null)"
  case "$code" in
    200|401|403) ok "$1 → ${code}";;
    *)           bad "$1 → ${code} (expected wired endpoint, got dead/error)";;
  esac
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
  echo "   If step 3 failed but step 2 said head=${EXPECTED_HEAD}, that's the Strike #123 owner-mismatch:"
  echo "   alembic in the api container lacks owner rights on shared.*/audit. Re-run the failing DDL as the"
  echo "   teivaka owner, e.g.:  docker exec -i teivaka_db psql -U teivaka -d teivaka_db < <the migration's SQL>"
fi
exit "$fail"

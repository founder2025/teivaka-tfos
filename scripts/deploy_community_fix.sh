#!/usr/bin/env bash
# deploy_community_fix.sh — ONE command to fix the feed and deploy everything.
# Runs every runbook (all idempotent), rebuilds frontend + API, and verifies
# each step with loud PASS/FAIL. Safe to re-run any time.
#
#   cd /opt/teivaka && git pull origin claude/parity-farm-surfaces && bash scripts/deploy_community_fix.sh
set -uo pipefail
cd /opt/teivaka
COMPOSE="docker compose -f /opt/teivaka/04_environment/docker-compose.yml"
PSQL="docker exec -i teivaka_db psql -U teivaka -d teivaka_db"
fail=0
say()  { echo -e "\n=== $1 ==="; }
ok()   { echo "   ✅ $1"; }
bad()  { echo "   ❌ $1"; fail=1; }

say "1/7 DB runbooks (idempotent)"
$PSQL < docs/runbooks/fix_community_grants_sweep.sql        > /tmp/rb_sweep.out 2>&1 && ok "grant sweep" || bad "grant sweep (see /tmp/rb_sweep.out)"
$PSQL < docs/runbooks/094_reconcile_stray_tables.sql        > /tmp/rb_094.out  2>&1 && ok "094 reconcile" || bad "094 reconcile (see /tmp/rb_094.out)"
$PSQL < docs/runbooks/096_stories_apply_as_owner.sql        > /tmp/rb_096.out  2>&1 && ok "096 stories"   || bad "096 stories (see /tmp/rb_096.out)"
$PSQL < docs/runbooks/097_kyc_verification_apply_as_owner.sql > /tmp/rb_097.out 2>&1 && ok "097 kyc"      || bad "097 kyc (see /tmp/rb_097.out)"
$PSQL < docs/runbooks/098_marketplace_v2_apply_as_owner.sql   > /tmp/rb_098.out 2>&1 && ok "098 marketplace" || bad "098 marketplace (see /tmp/rb_098.out)"

say "2/7 Verify table shapes (the AmbiguousColumn culprit)"
SHAPES=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_hidden'  AND column_name IN ('user_id','post_id'))
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='user_mutes'  AND column_name IN ('user_id','muted_user_id'))
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='user_blocks' AND column_name IN ('user_id','blocked_user_id'));")
[ "$SHAPES" = "6" ] && ok "all 3 tables have correct columns (6/6)" || bad "table shapes wrong ($SHAPES/6) — paste /tmp/rb_094.out"

say "3/7 Verify stories + kyc objects"
OBJS=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.stories') IS NOT NULL)::int
       + (to_regclass('community.verification_requests') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='kyc_verified');")
[ "$OBJS" = "3" ] && ok "stories + verification_requests + kyc_verified all present" || bad "missing objects ($OBJS/3)"
MKT=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.listing_saves') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('category','sold_at','link_audit_hash'));")
[ "$MKT" = "4" ] && ok "marketplace v2 objects present (4/4)" || bad "marketplace objects missing ($MKT/4) — paste /tmp/rb_098.out"

say "4/7 Run migrations AS OWNER (alembic upgrade head — the permanent fix)"
PW=$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)
APIURL=$(docker exec teivaka_api printenv DATABASE_URL 2>/dev/null)
HOSTPART=${APIURL#*@}
if [ -n "$PW" ] && [ -n "$HOSTPART" ]; then
  OWNER_URL="postgresql+asyncpg://teivaka:${PW}@${HOSTPART}"
  docker exec -e DATABASE_URL="$OWNER_URL" teivaka_api alembic upgrade head > /tmp/alembic.out 2>&1 \
    && ok "alembic upgrade head as owner" || bad "alembic upgrade failed (see /tmp/alembic.out)"
else
  bad "could not resolve owner DB credentials — migrations not auto-applied"
fi

say "5/7 Frontend build"
(cd frontend && npm run build > /tmp/fe_build.out 2>&1) && ok "frontend built" || bad "frontend build failed (see /tmp/fe_build.out)"

say "6/7 API rebuild (no cache — takes ~3 min)"
$COMPOSE build --no-cache api > /tmp/api_build.out 2>&1 && ok "API image built" || bad "API build failed (see /tmp/api_build.out)"
$COMPOSE up -d api > /tmp/api_up.out 2>&1 && ok "API container up" || bad "API up failed (see /tmp/api_up.out)"
PW2=$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)
APIURL2=$(docker exec teivaka_api printenv DATABASE_URL 2>/dev/null)
docker exec -e DATABASE_URL="postgresql+asyncpg://teivaka:${PW2}@${APIURL2#*@}" teivaka_api alembic upgrade head >/dev/null 2>&1 \
  && ok "migrations at head (owner)" || bad "post-rebuild alembic upgrade failed (see: docker exec teivaka_api alembic current)"
bash 04_environment/verify-deploy.sh && ok "running code matches host" || bad "verify-deploy failed — container/code drift"

say "7/7 Smoke: API answers + no startup errors"
sleep 4
CODE=$(curl -s -o /dev/null -w "%{http_code}" https://teivaka.com/api/v1/community/feed)
[ "$CODE" = "401" ] && ok "feed route alive (401 unauthenticated = healthy)" || bad "feed route returned $CODE (expected 401)"
ERRS=$(docker logs teivaka_api --since 2m 2>&1 | grep -c "Unhandled exception" || true)
[ "$ERRS" = "0" ] && ok "no unhandled exceptions since restart" || bad "$ERRS unhandled exception(s) — run: docker logs teivaka_api --since 3m | grep -A15 'Unhandled exception'"

echo
if [ "$fail" = "0" ]; then
  echo "🎉 ALL CHECKS PASSED — hard-reload the browser (Ctrl+Shift+R) and open Home → Feed."
else
  echo "⚠️  SOME CHECKS FAILED — paste the ❌ lines (and the named /tmp/*.out file) back to Claude."
fi

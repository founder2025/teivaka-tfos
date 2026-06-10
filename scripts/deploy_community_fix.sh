#!/usr/bin/env bash
# deploy_community_fix.sh — ONE command to fix the feed and deploy everything.
# Runs every runbook (all idempotent), rebuilds frontend + API, and verifies
# each step with loud PASS/FAIL. Safe to re-run any time.
#
#   cd /opt/teivaka && git pull origin claude/parity-farm-surfaces && bash scripts/deploy_community_fix.sh
set -uo pipefail
cd /opt/teivaka
COMPOSE="docker compose -f /opt/teivaka/04_environment/docker-compose.yml"
PSQL="docker exec -i teivaka_db psql -v ON_ERROR_STOP=1 -U teivaka -d teivaka_db"
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
$PSQL < docs/runbooks/099_listing_details_apply_as_owner.sql  > /tmp/rb_099.out 2>&1 && ok "099 listing details" || bad "099 listing details (see /tmp/rb_099.out)"

say "2/7 Verify table shapes (the AmbiguousColumn culprit)"
SHAPES=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_hidden'  AND column_name IN ('user_id','post_id'))
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='user_mutes'  AND column_name IN ('user_id','muted_user_id'))
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='user_blocks' AND column_name IN ('user_id','blocked_user_id'));")
if [ "$SHAPES" = "6" ]; then ok "all 3 tables have correct columns (6/6)"; else
  bad "table shapes wrong ($SHAPES/6) — actual shapes:"
  docker exec teivaka_db psql -U teivaka -d teivaka_db -c "
    SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns,
           (SELECT n_live_tup FROM pg_stat_user_tables t WHERE t.schemaname='community' AND t.relname=c.table_name) AS approx_rows
    FROM information_schema.columns c
    WHERE table_schema='community' AND table_name IN ('feed_hidden','user_mutes','user_blocks')
    GROUP BY table_name ORDER BY table_name;"
fi

say "3/7 Verify stories + kyc objects"
OBJS=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.stories') IS NOT NULL)::int
       + (to_regclass('community.verification_requests') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='kyc_verified');")
[ "$OBJS" = "3" ] && ok "stories + verification_requests + kyc_verified all present" || bad "missing objects ($OBJS/3)"
MKT=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.listing_saves') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('category','sold_at','link_audit_hash','price_basis','details'));")
if [ "$MKT" = "6" ]; then ok "marketplace objects present (6/6)"; else
  bad "marketplace objects missing ($MKT/6) — runbook output + table owners:"
  tail -5 /tmp/rb_098.out /tmp/rb_099.out
  docker exec teivaka_db psql -U teivaka -d teivaka_db -c "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='community' AND c.relname IN ('listings','listing_saves') AND c.relkind='r';"
fi

say "4/7 Run migrations (two-pass: app role + owner — covers both table ownerships)"
# Pass 1: as the app role (its own DATABASE_URL) — handles tables it owns (e.g. listings)
docker exec teivaka_api alembic upgrade head > /tmp/alembic_app.out 2>&1 \
  && ok "alembic pass 1 (app role)" || echo "   (pass 1 partial — pass 2 follows)"
# Pass 2: as teivaka (owner of base-schema tables)
PW=$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)
APIURL=$(docker exec teivaka_api printenv DATABASE_URL 2>/dev/null)
HOSTPART=${APIURL#*@}
if [ -n "$PW" ] && [ -n "$HOSTPART" ]; then
  docker exec -e DATABASE_URL="postgresql+asyncpg://teivaka:${PW}@${HOSTPART}" teivaka_api alembic upgrade head > /tmp/alembic.out 2>&1 \
    && ok "alembic pass 2 (owner) — at head" || bad "alembic still failing — tail of /tmp/alembic.out:" && tail -8 /tmp/alembic.out
else
  bad "could not resolve owner DB credentials"
fi

say "5/7 Frontend build"
(cd frontend && npm run build > /tmp/fe_build.out 2>&1) && ok "frontend built" || bad "frontend build failed (see /tmp/fe_build.out)"

say "6/7 API rebuild (no cache — takes ~3 min)"
$COMPOSE build --no-cache api > /tmp/api_build.out 2>&1 && ok "API image built" || bad "API build failed (see /tmp/api_build.out)"
$COMPOSE up -d api > /tmp/api_up.out 2>&1 && ok "API container up" || bad "API up failed (see /tmp/api_up.out)"
docker exec teivaka_api alembic upgrade head >/dev/null 2>&1 || true
PW2=$(docker exec teivaka_db printenv POSTGRES_PASSWORD 2>/dev/null)
APIURL2=$(docker exec teivaka_api printenv DATABASE_URL 2>/dev/null)
docker exec -e DATABASE_URL="postgresql+asyncpg://teivaka:${PW2}@${APIURL2#*@}" teivaka_api alembic upgrade head >/dev/null 2>&1 \
  && ok "migrations at head (two-pass)" || bad "post-rebuild alembic upgrade failed (run: docker exec teivaka_api alembic current)"
bash 04_environment/verify-deploy.sh && ok "running code matches host" || bad "verify-deploy failed — container/code drift"

say "7/7 Smoke: API answers + no startup errors"
CODE=000
for i in $(seq 1 12); do
  sleep 5
  CODE=$(curl -s -o /dev/null -w "%{http_code}" https://teivaka.com/api/v1/community/feed)
  [ "$CODE" = "401" ] && break
done
[ "$CODE" = "401" ] && ok "feed route alive (401 unauthenticated = healthy)" || bad "feed route returned $CODE after 60s (expected 401)"
ERRS=$(docker logs teivaka_api --since 2m 2>&1 | grep -c "Unhandled exception" || true)
[ "$ERRS" = "0" ] && ok "no unhandled exceptions since restart" || bad "$ERRS unhandled exception(s) — run: docker logs teivaka_api --since 3m | grep -A15 'Unhandled exception'"

echo
if [ "$fail" = "0" ]; then
  echo "🎉 ALL CHECKS PASSED — hard-reload the browser (Ctrl+Shift+R) and open Home → Feed."
else
  echo "⚠️  SOME CHECKS FAILED — paste the ❌ lines (and the named /tmp/*.out file) back to Claude."
fi

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
$PSQL < docs/runbooks/100_classroom_apply_as_owner.sql        > /tmp/rb_100.out 2>&1 && ok "100 classroom" || bad "100 classroom (see /tmp/rb_100.out)"
$PSQL < docs/runbooks/101_classroom_v2_apply_as_owner.sql     > /tmp/rb_101.out 2>&1 && ok "101 classroom v2" || bad "101 classroom v2 (see /tmp/rb_101.out)"
$PSQL < docs/runbooks/102_lesson_saves_apply_as_owner.sql     > /tmp/rb_102.out 2>&1 && ok "102 lesson saves" || bad "102 lesson saves (see /tmp/rb_102.out)"
$PSQL < docs/runbooks/103_library_submissions_apply_as_owner.sql > /tmp/rb_103.out 2>&1 && ok "103 library + featured" || bad "103 library + featured (see /tmp/rb_103.out)"
$PSQL < docs/runbooks/104_groups_apply_as_owner.sql           > /tmp/rb_104.out 2>&1 && ok "104 groups" || bad "104 groups (see /tmp/rb_104.out)"
$PSQL < docs/runbooks/105_tier_requests_prefs_apply_as_owner.sql > /tmp/rb_105.out 2>&1 && ok "105 tier requests + prefs" || bad "105 tier requests + prefs (see /tmp/rb_105.out)"
$PSQL < docs/runbooks/106_team_affiliate_apply_as_owner.sql   > /tmp/rb_106.out 2>&1 && ok "106 team + affiliate" || bad "106 team + affiliate (see /tmp/rb_106.out)"
$PSQL < docs/runbooks/107_admin_command_apply_as_owner.sql    > /tmp/rb_107.out 2>&1 && ok "107 admin command" || bad "107 admin command (see /tmp/rb_107.out)"
$PSQL < docs/runbooks/108_growth_metrics_apply_as_owner.sql   > /tmp/rb_108.out 2>&1 && ok "108 growth metrics" || bad "108 growth metrics (see /tmp/rb_108.out)"
$PSQL < docs/runbooks/109_platform_settings_apply_as_owner.sql > /tmp/rb_109.out 2>&1 && ok "109 platform settings" || bad "109 platform settings (see /tmp/rb_109.out)"
$PSQL < docs/runbooks/110_analytics_events_apply_as_owner.sql  > /tmp/rb_110.out 2>&1 && ok "110 analytics spine" || bad "110 analytics spine (see /tmp/rb_110.out)"
$PSQL < docs/runbooks/111_consent_ledger_apply_as_owner.sql   > /tmp/rb_111.out 2>&1 && ok "111 consent ledger" || bad "111 consent ledger (see /tmp/rb_111.out)"

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
  SELECT (to_regclass('community.listings') IS NOT NULL)::int
       + (to_regclass('community.listing_saves') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('category','sold_at','link_audit_hash','price_basis','details'));")
if [ "$MKT" = "7" ]; then ok "marketplace objects present (7/7)"; else
  bad "marketplace objects missing ($MKT/7) — runbook output + table presence/owners:"
  tail -n 5 /tmp/rb_098.out; tail -n 5 /tmp/rb_099.out
  docker exec teivaka_db psql -U teivaka -d teivaka_db -c "SELECT t.tbl, to_regclass('community.'||t.tbl) IS NOT NULL AS table_exists, (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='community' AND c.relname=t.tbl AND c.relkind='r') AS owner FROM (VALUES ('listings'),('listing_saves')) AS t(tbl);"
fi

CLS=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.courses') IS NOT NULL)::int + (to_regclass('community.course_modules') IS NOT NULL)::int
       + (to_regclass('community.course_lessons') IS NOT NULL)::int + (to_regclass('community.quiz_questions') IS NOT NULL)::int
       + (to_regclass('community.lesson_progress') IS NOT NULL)::int + (to_regclass('community.quiz_attempts') IS NOT NULL)::int
       + (to_regclass('community.course_certificates') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='course_author');")
if [ "$CLS" = "8" ]; then ok "classroom objects present (8/8)"; else
  bad "classroom objects missing ($CLS/8) — runbook tail:"; tail -n 6 /tmp/rb_100.out
fi
CLS2=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "
  SELECT (to_regclass('community.author_requests') IS NOT NULL)::int + (to_regclass('community.course_entitlements') IS NOT NULL)::int
       + (to_regclass('community.course_ratings') IS NOT NULL)::int + (to_regclass('community.classroom_settings') IS NOT NULL)::int
       + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='courses' AND column_name IN ('pricing','price_fjd','required_tier'));")
if [ "$CLS2" = "7" ]; then ok "classroom v2 objects present (7/7)"; else
  bad "classroom v2 objects missing ($CLS2/7) — runbook tail:"; tail -n 6 /tmp/rb_101.out
fi
LSV=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.lesson_saves') IS NOT NULL)::int;")
[ "$LSV" = "1" ] && ok "lesson_saves present" || { bad "lesson_saves missing — runbook tail:"; tail -n 4 /tmp/rb_102.out; }
LIB=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.library_submissions') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='courses' AND column_name='featured');")
[ "$LIB" = "2" ] && ok "library submissions + featured present (2/2)" || { bad "library/featured missing ($LIB/2) — runbook tail:"; tail -n 4 /tmp/rb_103.out; }
GRP=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.groups') IS NOT NULL)::int + (to_regclass('community.group_members') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_posts' AND column_name='group_id');")
[ "$GRP" = "3" ] && ok "groups objects present (3/3)" || { bad "groups objects missing ($GRP/3) — runbook tail:"; tail -n 4 /tmp/rb_104.out; }
TRQ=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.tier_change_requests') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name IN ('notify_whatsapp','notify_tasks','notify_weather'));")
[ "$TRQ" = "4" ] && ok "tier requests + prefs present (4/4)" || { bad "tier requests/prefs missing ($TRQ/4) — runbook tail:"; tail -n 4 /tmp/rb_105.out; }
TAF=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.team_invites') IS NOT NULL)::int + (to_regclass('community.affiliates') IS NOT NULL)::int + (to_regclass('community.affiliate_commissions') IS NOT NULL)::int + (to_regclass('community.affiliate_settings') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name IN ('team_role','farm_scope'));")
[ "$TAF" = "6" ] && ok "team + affiliate present (6/6)" || { bad "team/affiliate missing ($TAF/6) — runbook tail:"; tail -n 4 /tmp/rb_106.out; }
ACC=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.intel_snapshots') IS NOT NULL)::int + (to_regclass('community.feature_flags') IS NOT NULL)::int;")
[ "$ACC" = "2" ] && ok "admin command objects present (2/2)" || { bad "admin command missing ($ACC/2) — runbook tail:"; tail -n 4 /tmp/rb_107.out; }
GRW=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.activity_days') IS NOT NULL)::int + (to_regclass('community.metric_events') IS NOT NULL)::int;")
[ "$GRW" = "2" ] && ok "growth metrics present (2/2)" || { bad "growth metrics missing ($GRW/2) — runbook tail:"; tail -n 4 /tmp/rb_108.out; }
PLS=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.platform_settings') IS NOT NULL)::int;")
[ "$PLS" = "1" ] && ok "platform settings present" || { bad "platform settings missing — runbook tail:"; tail -n 4 /tmp/rb_109.out; }
ANA=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('analytics.events') IS NOT NULL)::int;")
[ "$ANA" = "1" ] && ok "analytics event spine present" || { bad "analytics spine missing — runbook tail:"; tail -n 4 /tmp/rb_110.out; }
CON=$(docker exec teivaka_db psql -U teivaka -d teivaka_db -tA -c "SELECT (to_regclass('community.consent_events') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='aggregate_consent');")
[ "$CON" = "2" ] && ok "consent ledger present (2/2)" || { bad "consent ledger missing ($CON/2) — runbook tail:"; tail -n 4 /tmp/rb_111.out; }

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

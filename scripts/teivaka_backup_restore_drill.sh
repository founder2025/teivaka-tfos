#!/usr/bin/env bash
#
# teivaka_backup_restore_drill.sh — Strike #122 verify gate
#
# Strike #92 doctrine: a backup that has never been restored from is not
# verified. This script restores the latest dump into a fresh test
# container and diffs row counts against production for critical tables.
#
# Tolerance:
#   audit.events: 0 rows (hash chain — even one missing row = broken chain)
#   live tables:  ±5 rows (backup-window race)
#   shared.kb_articles: 0 rows (read-only at runtime per Inviolable #7)
#
# Tears down the test container after verify regardless of pass/fail.
# Reports OK or FAIL with row count delta on each table.

set -euo pipefail

TEIVAKA_ROOT="/opt/teivaka"
LOG_FILE="$TEIVAKA_ROOT/logs/backup.log"
DAILY_DIR="$TEIVAKA_ROOT/backups/daily"

PROD_CONTAINER="teivaka_db"
TEST_CONTAINER="teivaka_db_restore_test"
TEST_NETWORK="teivaka-network"
TEST_PASSWORD="restore_drill_$(date +%s)"
TEST_DB="teivaka_db"
TEST_USER="teivaka"
DB_IMAGE="timescale/timescaledb:2.15.3-pg16"

# Tables to verify (from Strike #122 spec)
TABLES_ZERO_TOLERANCE=(
  "audit.events"
  "shared.kb_articles"
)
TABLES_LIVE_TOLERANCE=(
  "tenant.farms"
  "tenant.harvest_log"
  "tenant.production_cycles"
  "tenant.users"
)
LIVE_TOLERANCE=5
# High-churn append-only tables (telemetry / TimescaleDB hypertables): their
# absolute counts grow continuously, so a stale-but-valid backup drifts vs live
# and false-fails the ±5 check (e.g. the decision engine appends snapshots all
# day). Use a PERCENTAGE tolerance — absorbs time-drift, still catches a real
# loss (e.g. a half-empty restore). audit.events stays zero-tolerance.
TABLES_PCT_TOLERANCE=(
  "tenant.decision_signal_snapshots"
)
PCT_TOLERANCE=15

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" \
    | tee -a "$LOG_FILE"
}

log_err() {
  printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" \
    | tee -a "$LOG_FILE" >&2
}

cleanup() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$TEST_CONTAINER"; then
    # Capture container logs tail for forensics before teardown
    log "─── Test container logs (last 20 lines) ───"
    docker logs --tail 20 "$TEST_CONTAINER" 2>&1 | sed 's/^/    /' \
      | tee -a "$LOG_FILE" >/dev/null
    log "─── (end test container logs) ───"
    log "Tearing down test container: $TEST_CONTAINER"
    docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "═══════════════════════════════════════════════════════════════"
log "Strike #122 restore drill starting"

# ----------------------------------------------------------------------
# 1. Find latest dump
# ----------------------------------------------------------------------
LATEST="$(ls -1t "$DAILY_DIR"/teivaka_db_*.dump.gz 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  log_err "No backups found in $DAILY_DIR — run teivaka_backup.sh first"
  exit 1
fi
log "Latest dump: $LATEST"
log "  size: $(du -h "$LATEST" | cut -f1)"

# ----------------------------------------------------------------------
# 2. Tear down any prior test container, spin fresh
# ----------------------------------------------------------------------
cleanup

log "Spinning fresh test container: $TEST_CONTAINER"
# Note: no --tmpfs — uses ephemeral docker volume (auto-cleaned on rm).
# tmpfs is RAM-backed and was crashing under WAL pressure during restore.
docker run -d \
  --name "$TEST_CONTAINER" \
  --network "$TEST_NETWORK" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASSWORD" \
  -e TIMESCALEDB_TELEMETRY=off \
  "$DB_IMAGE" \
  postgres -c shared_preload_libraries=timescaledb,pg_stat_statements \
  >/dev/null

# Wait for ready — must wait for POST-TUNE boot.
# The timescale image runs timescaledb-tune during init, which (a) shuts the
# DB down with "received fast shutdown request" and (b) restarts it with
# tuned config. The "TimescaleDB background worker launcher connected to
# shared catalogs" log line fires TWICE — once on the pre-tune boot and
# again on the post-tune boot — so we wait for the second occurrence
# (count >= 2). A naive grep -q matches the first and hands us a server
# that's seconds away from shutdown, causing pg_restore mid-restore failure.
log "Waiting for test container ready (post-timescaledb-tune restart)..."
READY_MARKER="TimescaleDB background worker launcher connected to shared catalogs"
for i in $(seq 1 90); do
  count="$(docker logs "$TEST_CONTAINER" 2>&1 | grep -cF "$READY_MARKER" || true)"
  if [ "$count" -ge 2 ]; then
    log "  post-tune ready after ${i}s (marker count=$count)"
    break
  fi
  if [ "$i" = "90" ]; then
    log_err "Test container did not reach post-tune ready within 90s (marker count=$count)"
    docker logs --tail 30 "$TEST_CONTAINER" 2>&1 | sed 's/^/    /' | tee -a "$LOG_FILE" >/dev/null
    exit 1
  fi
  sleep 1
done

# ----------------------------------------------------------------------
# 3. pg_restore (with TimescaleDB pre/post wrappers per upstream docs)
# ----------------------------------------------------------------------
# TimescaleDB docs require timescaledb_pre_restore() and
# timescaledb_post_restore() to be called around pg_restore on a DB
# where the extension is already loaded. Without this, pg_restore
# crashes the connection mid-restore because it tries to manipulate
# extension/hypertable internal state.
# Ref: https://docs.timescale.com/self-hosted/latest/backup-and-restore/
# Note: timescaledb extension is auto-created by the image's init step.
# pgvector is not auto-created; load it now if available (kb_embeddings restore).
docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || \
  log "  (note: pgvector extension not loaded — kb_embeddings restore may degrade)"

log "Running timescaledb_pre_restore() on test container"
docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" \
  -c "SELECT timescaledb_pre_restore();" >/dev/null

log "Running pg_restore (this may take a moment)..."
RESTORE_LOG="$(mktemp)"
RESTORE_EXIT=0
gunzip -c "$LATEST" \
  | docker exec -i "$TEST_CONTAINER" pg_restore \
      -U "$TEST_USER" \
      -d "$TEST_DB" \
      --no-owner \
      --no-acl \
      --verbose \
    2> "$RESTORE_LOG" \
  || RESTORE_EXIT=$?

if [ "$RESTORE_EXIT" -eq 0 ]; then
  log "pg_restore completed (zero exit)"
else
  log "pg_restore returned exit=$RESTORE_EXIT (non-zero is normal for TimescaleDB; verify via row counts)"
fi

# Restore log tail for forensics
log "Restore log tail (last 10 lines):"
tail -10 "$RESTORE_LOG" | sed 's/^/    /' | tee -a "$LOG_FILE"
rm -f "$RESTORE_LOG"

log "Running timescaledb_post_restore() on test container"
docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" \
  -c "SELECT timescaledb_post_restore();" >/dev/null

# ----------------------------------------------------------------------
# 4. Row count diff
# ----------------------------------------------------------------------
count_table() {
  local container="$1" table="$2"
  # No SET row_security needed: teivaka is a superuser and bypasses RLS by
  # default. (Setting RLS off in the same psql -tAc returns the literal
  # "SET\nNNN" string after tr collapses whitespace, which then fails to
  # parse as an integer — bug fixed by dropping the SET.)
  docker exec "$container" psql -U "$TEST_USER" -d "$TEST_DB" -tAc \
    "SELECT COUNT(*) FROM $table" 2>/dev/null \
    | tr -d '[:space:]' \
    || echo "ERR"
}

declare -A PROD_COUNT TEST_COUNT
ALL_TABLES=("${TABLES_ZERO_TOLERANCE[@]}" "${TABLES_LIVE_TOLERANCE[@]}" "${TABLES_PCT_TOLERANCE[@]}")

log "Capturing row counts on production + test..."
for t in "${ALL_TABLES[@]}"; do
  PROD_COUNT[$t]="$(count_table "$PROD_CONTAINER" "$t")"
  TEST_COUNT[$t]="$(count_table "$TEST_CONTAINER" "$t")"
done

# ----------------------------------------------------------------------
# 5. Verify gate
# ----------------------------------------------------------------------
PASS=true
log "─────────────────────────────────────────────────"
log "Row count diff — restore drill verify"
log "─────────────────────────────────────────────────"
printf '  %-40s %10s %10s %10s %s\n' "TABLE" "PROD" "TEST" "DELTA" "RESULT" \
  | tee -a "$LOG_FILE"

verify_table() {
  local table="$1" tolerance="$2"
  local prod="${PROD_COUNT[$table]}" test="${TEST_COUNT[$table]}"
  if [ "$prod" = "ERR" ] || [ "$test" = "ERR" ]; then
    printf '  %-40s %10s %10s %10s %s\n' \
      "$table" "$prod" "$test" "?" "FAIL (query error)" \
      | tee -a "$LOG_FILE"
    PASS=false
    return
  fi
  local delta=$((prod - test))
  local abs_delta=${delta#-}
  local result
  if [ "$abs_delta" -le "$tolerance" ]; then
    result="OK (≤${tolerance})"
  else
    result="FAIL (>${tolerance})"
    PASS=false
  fi
  printf '  %-40s %10d %10d %10d %s\n' \
    "$table" "$prod" "$test" "$delta" "$result" \
    | tee -a "$LOG_FILE"
}

verify_table_pct() {
  local table="$1" pct="$2"
  local prod="${PROD_COUNT[$table]}" test="${TEST_COUNT[$table]}"
  if [ "$prod" = "ERR" ] || [ "$test" = "ERR" ]; then
    printf '  %-40s %10s %10s %10s %s\n' "$table" "$prod" "$test" "?" "FAIL (query error)" | tee -a "$LOG_FILE"
    PASS=false
    return
  fi
  local delta=$((prod - test))
  local abs_delta=${delta#-}
  local result
  if [ "$prod" -eq 0 ] && [ "$test" -eq 0 ]; then
    result="OK (both empty)"
  elif [ "$prod" -gt 0 ] && [ "$test" -gt 0 ] && [ $(( abs_delta * 100 / prod )) -le "$pct" ]; then
    result="OK (≤${pct}% drift)"
  else
    result="FAIL (>${pct}% drift)"
    PASS=false
  fi
  printf '  %-40s %10d %10d %10d %s\n' "$table" "$prod" "$test" "$delta" "$result" | tee -a "$LOG_FILE"
}

for t in "${TABLES_ZERO_TOLERANCE[@]}"; do verify_table "$t" 0; done
for t in "${TABLES_LIVE_TOLERANCE[@]}"; do verify_table "$t" "$LIVE_TOLERANCE"; done
for t in "${TABLES_PCT_TOLERANCE[@]}"; do verify_table_pct "$t" "$PCT_TOLERANCE"; done

log "─────────────────────────────────────────────────"
if [ "$PASS" = "true" ]; then
  log "RESTORE DRILL: PASS"
  log "═══════════════════════════════════════════════════════════════"
  exit 0
else
  log_err "RESTORE DRILL: FAIL"
  log "═══════════════════════════════════════════════════════════════"
  exit 1
fi

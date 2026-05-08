#!/usr/bin/env bash
#
# teivaka_backup.sh — Strike #122 production backup pipeline
#
# Six-Step Cadence shape:
#   1. pg_dump teivaka_db via docker exec (custom format) → gzip → timestamped
#   2. Hot copy: /opt/teivaka/backups/daily/<filename>
#   3. Off-host: invokes upload_offhost() function (stubbed for #122; #122b
#      bolt-on swaps the body with real upload code; signature must remain
#      stable — call site does not change)
#   4. Retention rotation: 7 daily, 4 weekly (Sunday), 6 monthly (day=01)
#      via hardlinks. No double disk usage.
#   5. Failure path: bash trap on ERR → fail() helper → tail 50 lines of
#      log, send via Resend HTTPS API to ALERT_RECIPIENT (sourced from .env,
#      fallback founder@teivaka.com). DO blocks outbound SMTP — see B95.
#   6. Logs: /opt/teivaka/logs/backup.log (tfos-writable; /var/log requires sudo)
#
# Strike #122 — On-host complete; off-host bolt-on is Strike #122b (B93).
# DO NOT rewrite this script when off-host destination is decided. Implement
# the upload_offhost() body only — call site, retention, failure path, and
# logging are stable architecture.

set -euo pipefail

# ======================================================================
# CONFIG
# ======================================================================
TEIVAKA_ROOT="/opt/teivaka"
ENV_FILE="$TEIVAKA_ROOT/04_environment/.env"
LOG_FILE="$TEIVAKA_ROOT/logs/backup.log"
BACKUP_ROOT="$TEIVAKA_ROOT/backups"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"

DB_CONTAINER="teivaka_db"
DB_USER="teivaka"
DB_NAME="teivaka_db"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="teivaka_db_${TIMESTAMP}.dump.gz"

# ALERT_RECIPIENT is sourced from .env inside send_alert() (after `source
# "$ENV_FILE"` so the env value wins over the fallback). Fallback default
# founder@teivaka.com applies if the key is unset in .env. See B96
# phantom-recipient audit + Strike #122 V7-redux.

RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=6

MIN_BACKUP_SIZE_BYTES=102400   # 100 KiB sanity floor (custom-format + gzip is dense)

# ======================================================================
# LOGGING HELPERS
# ======================================================================
mkdir -p "$(dirname "$LOG_FILE")" "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" \
    | tee -a "$LOG_FILE"
}

log_err() {
  printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" \
    | tee -a "$LOG_FILE" >&2
}

# ======================================================================
# RESEND HTTPS API ALERT
# ======================================================================
# DigitalOcean blocks all outbound SMTP ports (25/465/587/2525) by policy.
# We post to the Resend HTTPS REST API instead — same vendor, same API
# key, port 443. The .env key is named SMTP_PASSWORD for backward compat
# with existing scaffolding (it's actually a Resend API key, prefix `re_`).
# See backlog B94 for env rename. Mirrors the production app/utils/email.py
# pattern, which has been operational on this code path since auth/cash
# flows shipped.
send_alert() {
  local subject="$1" body="$2"

  set +u
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set -u

  # Resend API key. Variable named SMTP_PASSWORD for backward compat with
  # .env scaffolding. See backlog B94 for env rename.
  local resend_api_key="${SMTP_PASSWORD:-}"
  local sender="${SMTP_FROM:-}"

  # Resolve recipient AFTER source: .env value wins, fallback to founder@.
  # Hardcoded recipient was the V7-original false-pass root cause (B96).
  local recipient="${ALERT_RECIPIENT:-founder@teivaka.com}"

  if [ -z "$resend_api_key" ] || [ -z "$sender" ]; then
    log_err "Resend credentials missing (SMTP_PASSWORD or SMTP_FROM empty) — cannot send alert"
    return 1
  fi

  # Build JSON payload via jq for safe escaping of newlines/quotes/control chars.
  local payload
  payload="$(jq -n \
    --arg from "$sender" \
    --arg to "$recipient" \
    --arg subject "$subject" \
    --arg body "$body" \
    '{from: $from, to: [$to], subject: $subject, text: $body}')"

  local response_file http_code
  response_file="$(mktemp)"
  http_code="$(curl --silent --show-error \
    --request POST \
    --url 'https://api.resend.com/emails' \
    --header "Authorization: Bearer ${resend_api_key}" \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    --connect-timeout 30 \
    --max-time 60 \
    --output "$response_file" \
    --write-out '%{http_code}' \
    2>>"$LOG_FILE" || echo '000')"

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ] || [ "$http_code" = "202" ]; then
    local email_id
    email_id="$(jq -r '.id // "(no id in response)"' "$response_file" 2>/dev/null || echo "(parse failed)")"
    log "Alert email sent via Resend API to $recipient (id=$email_id, http=$http_code)"
  else
    local err_body
    err_body="$(head -c 500 "$response_file" 2>/dev/null || true)"
    log_err "Alert email FAILED via Resend API (http=$http_code) — body: $err_body"
  fi

  rm -f "$response_file"
}

# ======================================================================
# FAILURE PATH (Strike #91 fail-loud)
# ======================================================================
# Unified `fail` helper: cleanup partial work, send SMTP alert, exit non-zero.
# Called explicitly from internal sanity checks AND from the ERR trap for
# uncaught command failures. Single failure path, single alert path.
PARTIAL_DUMP=""
fail() {
  local reason="$1"
  local line_no="${2:-?}"

  log_err "BACKUP FAILED (line=$line_no): $reason"

  # Clean up any partial dump file
  if [ -n "${PARTIAL_DUMP:-}" ] && [ -f "$PARTIAL_DUMP" ]; then
    log_err "Removing partial dump: $PARTIAL_DUMP"
    rm -f "$PARTIAL_DUMP"
  fi

  local tail_log
  tail_log="$(tail -n 50 "$LOG_FILE" 2>/dev/null || echo "(log read failed)")"

  send_alert \
    "TFOS BACKUP FAILED — $(hostname) $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "Strike #122 production backup script aborted.

Host: $(hostname)
Script: $0
Line: $line_no
Reason: $reason
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Last 50 log lines:
${tail_log}
" || log_err "send_alert returned non-zero — alert may not have been delivered"

  exit 1
}
trap 'fail "Uncaught command failure" $LINENO' ERR

# ======================================================================
# OFF-HOST UPLOAD STUB (Strike #122b will populate)
# ======================================================================
# Architectural commitment: this function's signature is stable.
# Strike #122b will replace ONLY the function body with the actual upload
# logic (Supabase REST POST, DO Spaces s3cmd, or whichever vendor
# Operator chooses once credentials are wired). The call site below
# does not change.
upload_offhost() {
  local local_filepath="$1"
  local remote_filename="$2"

  log "OFF-HOST DESTINATION NOT YET CONFIGURED — see backlog B93/Strike #122b"
  log "  would have uploaded: $local_filepath → <remote>/$remote_filename"
  log "  on-host backup is intact; off-host bolt-on pending vendor credential decision"
  return 0
}

# ======================================================================
# MAIN
# ======================================================================
log "═══════════════════════════════════════════════════════════════"
log "Strike #122 backup run starting"
log "  timestamp: $TIMESTAMP"
log "  daily dir: $DAILY_DIR"

DAILY_PATH="$DAILY_DIR/$BACKUP_FILE"
DAILY_TMP="$DAILY_PATH.tmp"
PARTIAL_DUMP="$DAILY_TMP"

# pg_dump custom format (compressed inside) | gzip again for transport efficiency
# --no-owner --no-acl: portable across roles
log "Running pg_dump → gzip → $DAILY_TMP"
docker exec "$DB_CONTAINER" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --no-owner \
  --no-acl \
  | gzip -9 > "$DAILY_TMP"

# Sanity floor
backup_size="$(stat -c%s "$DAILY_TMP")"
if [ "$backup_size" -lt "$MIN_BACKUP_SIZE_BYTES" ]; then
  fail "Backup file below sanity floor: $backup_size bytes (floor $MIN_BACKUP_SIZE_BYTES)" "$LINENO"
fi

# Atomic rename
mv "$DAILY_TMP" "$DAILY_PATH"
PARTIAL_DUMP=""
log "Backup written: $DAILY_PATH ($(numfmt --to=iec-i --suffix=B "$backup_size"))"

# ----------------------------------------------------------------------
# Hardlink to weekly (Sunday) and monthly (day-of-month=01)
# ----------------------------------------------------------------------
DOW="$(date -u +%u)"   # 1=Mon..7=Sun
DOM="$(date -u +%d)"

if [ "$DOW" = "7" ]; then
  WEEKLY_PATH="$WEEKLY_DIR/$BACKUP_FILE"
  ln "$DAILY_PATH" "$WEEKLY_PATH"
  log "Weekly hardlink created: $WEEKLY_PATH"
fi

if [ "$DOM" = "01" ]; then
  MONTHLY_PATH="$MONTHLY_DIR/$BACKUP_FILE"
  ln "$DAILY_PATH" "$MONTHLY_PATH"
  log "Monthly hardlink created: $MONTHLY_PATH"
fi

# ----------------------------------------------------------------------
# Off-host upload (stub for Strike #122; #122b populates body)
# ----------------------------------------------------------------------
upload_offhost "$DAILY_PATH" "$BACKUP_FILE"

# ----------------------------------------------------------------------
# Retention rotation per tier
# ----------------------------------------------------------------------
rotate_tier() {
  local dir="$1" keep="$2" label="$3"
  local count
  count="$(ls -1 "$dir"/teivaka_db_*.dump.gz 2>/dev/null | wc -l)"
  log "Retention rotation [$label]: $count files in $dir, keeping last $keep"
  ls -1t "$dir"/teivaka_db_*.dump.gz 2>/dev/null \
    | tail -n +"$((keep + 1))" \
    | while read -r old_file; do
        log "  pruning: $old_file"
        rm -f "$old_file"
      done
}

rotate_tier "$DAILY_DIR"   "$RETENTION_DAILY"   "daily"
rotate_tier "$WEEKLY_DIR"  "$RETENTION_WEEKLY"  "weekly"
rotate_tier "$MONTHLY_DIR" "$RETENTION_MONTHLY" "monthly"

log "Strike #122 backup run complete."
log "═══════════════════════════════════════════════════════════════"
exit 0

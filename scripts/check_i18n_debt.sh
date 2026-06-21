#!/usr/bin/env bash
# check_i18n_debt.sh — ratchet guard for the currency-localization seam.
#
# Foundation Audit (2026-06-20): money formatting now flows through
# frontend/src/utils/money.js (formatMoney). To stop the hardcoded-"FJD ${…}"
# debt from silently regrowing, this guard FAILS THE BUILD only when the number
# of hardcoded currency literals INCREASES above the recorded baseline. It
# tolerates the existing backlog (so it can ship today) and nudges it downward:
# convert a file, then lower scripts/i18n_debt_baseline.
#
# Wired into the frontend build via the package.json "prebuild" script, so every
# `npm run build` (including the production deploy build) enforces it.
#
# SAFETY: fails OPEN on any internal error (missing baseline, bad path, grep
# quirk) — it returns exit 0 in every case except a clear regression, so a guard
# bug can never block a production deploy.

ROOT="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)" || exit 0
SRC="$ROOT/frontend/src"
BASELINE_FILE="$ROOT/scripts/i18n_debt_baseline"
[ -d "$SRC" ] || exit 0

# Count hardcoded 'FJD ${' currency literals, excluding the seam utils whose doc
# comments reference the banned pattern by design.
current="$(grep -rn 'FJD \${' "$SRC" --include=*.jsx --include=*.js 2>/dev/null \
  | grep -vE '/utils/(money|i18n)\.js' | wc -l | tr -d ' ')"
[ -n "$current" ] || exit 0

baseline="$(tr -dc '0-9' < "$BASELINE_FILE" 2>/dev/null)"
[ -n "$baseline" ] || { echo "[i18n-guard] no baseline file; skipping"; exit 0; }

echo "[i18n-guard] hardcoded 'FJD \${' literals: ${current} (baseline ${baseline})"

if [ "$current" -gt "$baseline" ]; then
  echo "[i18n-guard] ❌ REGRESSION — $((current - baseline)) new hardcoded currency literal(s)."
  echo "[i18n-guard]    Use formatMoney() from src/utils/money.js instead of \"FJD \${n}\". Offenders:"
  grep -rn 'FJD \${' "$SRC" --include=*.jsx --include=*.js 2>/dev/null | grep -vE '/utils/(money|i18n)\.js'
  exit 1
fi

if [ "$current" -lt "$baseline" ]; then
  echo "[i18n-guard] ✅ debt reduced (${baseline} → ${current}). Lower the baseline:"
  echo "[i18n-guard]    echo ${current} > scripts/i18n_debt_baseline"
fi

exit 0

#!/usr/bin/env bash
# farm_smoke.sh — P7 endpoint smoke for the FARM pillar. Logs in, then GETs
# every endpoint the 20 FARM surfaces depend on and reports the HTTP status,
# flagging any 4xx/5xx. Run on the prod host (or anywhere that can reach the API).
#
#   EMAIL=founder@teivaka.com PASSWORD='…' FARM_ID=F001-A0EE \
#     BASE_URL=https://teivaka.com bash scripts/farm_smoke.sh
#
# Exit 0 if all green; exit 1 if any endpoint returned >= 400.
set -uo pipefail

BASE_URL="${BASE_URL:-https://teivaka.com}"; BASE_URL="${BASE_URL%/}"
EMAIL="${EMAIL:?set EMAIL}"; PASSWORD="${PASSWORD:?set PASSWORD}"
FARM="${FARM_ID:-}"
PERIOD="$(date -u +%Y-%m)"

tok() {
  curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "username=$EMAIL" --data-urlencode "password=$PASSWORD" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
TOKEN="$(tok)"
[ -n "$TOKEN" ] || { echo "✗ login failed"; exit 1; }
echo "✓ logged in @ $BASE_URL"

# resolve a farm id if not given (first farm)
if [ -z "$FARM" ]; then
  FARM="$(curl -s "$BASE_URL/api/v1/farms" -H "Authorization: Bearer $TOKEN" \
    | sed -n 's/.*"farm_id":"\([^"]*\)".*/\1/p' | head -1)"
fi
echo "→ farm: ${FARM:-<none>}  ·  period: $PERIOD"
echo

FAIL=0
check() {  # check "<label>" "<path>"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$2" -H "Authorization: Bearer $TOKEN")"
  if [ "$code" -ge 400 ] 2>/dev/null; then printf "  ✗ %-26s %s  [%s]\n" "$1" "$2" "$code"; FAIL=$((FAIL+1));
  else printf "  ✓ %-26s [%s]\n" "$1" "$code"; fi
}

echo "FARM endpoint smoke:"
check "farms"               "/api/v1/farms"
check "farm detail"         "/api/v1/farms/$FARM"
check "financials/farm"     "/api/v1/financials/farm/$FARM"
check "financials/crops"    "/api/v1/financials/crops/$FARM"
check "cycles"              "/api/v1/cycles?farm_id=$FARM&limit=50"
check "production-units"    "/api/v1/production-units?farm_id=$FARM"
check "field-events"        "/api/v1/field-events?farm_id=$FARM&limit=20"
check "harvests"            "/api/v1/harvests?farm_id=$FARM"
check "crops/compliance"    "/api/v1/crops/compliance/$FARM"
check "tasks"               "/api/v1/tasks?status=OPEN&limit=20"
check "cash-ledger"         "/api/v1/cash-ledger?farm_id=$FARM&limit=20"
check "labor"               "/api/v1/labor?farm_id=$FARM"
check "workers"             "/api/v1/workers?farm_id=$FARM"
check "inputs"              "/api/v1/inputs?farm_id=$FARM"
check "input-transactions"  "/api/v1/input-transactions"
check "suppliers"           "/api/v1/suppliers"
check "customers"           "/api/v1/customers"
check "orders"              "/api/v1/orders?farm_id=$FARM"
check "equipment"           "/api/v1/equipment?farm_id=$FARM"
check "decision-engine"     "/api/v1/decision-engine/$FARM"
check "decision summary"    "/api/v1/decision-engine/$FARM/summary"
check "weather current"     "/api/v1/weather/current/$FARM"
check "weather forecast"    "/api/v1/weather/forecast/$FARM?range=daily"
check "chemicals"           "/api/v1/chemicals"
check "productions"         "/api/v1/productions?crop_only=true&is_active=true"
check "kb"                  "/api/v1/kb"
check "profit-share"        "/api/v1/profit-share?farm_id=$FARM"
check "me/chain-status"     "/api/v1/me/chain-status"
check "reports/cogk"        "/api/v1/reports/cogk/$FARM"
check "reports/harvest"     "/api/v1/reports/harvest/$FARM"
check "exports/cycles.csv"  "/api/v1/exports/cycles/$FARM.csv"
check "crop bank-evidence"  "/api/v1/crops/bank-evidence?period=$PERIOD&farm_id=$FARM"

echo
if [ "$FAIL" -eq 0 ]; then echo "ALL GREEN — no 4xx/5xx across the FARM pillar."; exit 0
else echo "$FAIL endpoint(s) returned >= 400 — investigate above."; exit 1; fi

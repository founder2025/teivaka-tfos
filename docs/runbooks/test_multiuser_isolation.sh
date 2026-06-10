#!/usr/bin/env bash
# Multi-user independence + tenant-isolation smoke test. Run against prod.
#   BASE=https://teivaka.com bash docs/runbooks/test_multiuser_isolation.sh
# Creates 2 fresh accounts (A, B), then proves: B cannot see A's farm data, but
# both can use the shared community (post / follow / connect / chat).
set -e
BASE="${BASE:-https://teivaka.com}"
PW="Isotest2026!"
TS=$(date +%s)
A="iso.a.$TS@demo.tv"; B="iso.b.$TS@demo.tv"
jqget(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

reg(){ curl -s -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" -d "{\"first_name\":\"$1\",\"last_name\":\"Iso\",\"email\":\"$2\",\"password\":\"$PW\",\"date_of_birth\":\"1990-01-01\",\"account_type\":\"$3\",\"country\":\"FJ\",\"privacy_accepted\":true}" >/dev/null; }
login(){ curl -s -X POST "$BASE/api/v1/auth/login" -H "Content-Type: application/x-www-form-urlencoded" -d "username=$1&password=$PW" | jqget "['access_token']"; }
authget(){ curl -s "$BASE$2" -H "Authorization: Bearer $1"; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$BASE$2" -H "Authorization: Bearer $1"; }

echo "1) Register A (farmer) + B (buyer)"; reg Anna "$A" FARMER; reg Bula "$B" BUYER; sleep 1
TA=$(login "$A"); TB=$(login "$B")
echo "   A token: ${TA:0:12}…  B token: ${TB:0:12}…"
[ -n "$TA" ] && [ -n "$TB" ] || { echo "LOGIN FAILED"; exit 1; }

echo "2) Each /auth/me returns their OWN identity"
echo "   A: $(authget "$TA" /api/v1/auth/me | jqget "['data']['email']")"
echo "   B: $(authget "$TB" /api/v1/auth/me | jqget "['data']['email']")"

echo "3) ISOLATION — B's farms must be empty (no access to A's / operator's farms)"
echo "   B /farms => $(authget "$TB" /api/v1/farms | head -c 200)"

echo "4) ISOLATION — B cannot read the operator farm F001-A0EE (expect 403/404/empty)"
echo "   B GET /farms/F001-A0EE => HTTP $(code "$TB" /api/v1/farms/F001-A0EE)"
echo "   B GET /farms/F001-A0EE/dashboard => HTTP $(code "$TB" /api/v1/farms/F001-A0EE/dashboard)"

echo "5) ISOLATION — B's cash/tasks/cycles are empty (their own tenant only)"
echo "   B /tasks => $(authget "$TB" "/api/v1/tasks?limit=3" | head -c 120)"

echo "6) SOCIAL — B posts; A should see it in the country feed"
PID=$(curl -s -X POST "$BASE/api/v1/community/feed" -H "Authorization: Bearer $TB" -H "Content-Type: application/json" -d '{"body":"Isolation test post from B","audience":"everyone"}' | jqget "['data']['post_id']")
echo "   B post_id: $PID"
echo "   A feed contains it? $(authget "$TA" "/api/v1/community/feed?limit=20" | grep -c "$PID") (1 = yes)"

echo "7) SOCIAL — chat is connection-gated: B->A before mutual follow should 403"
AID=$(authget "$TA" /api/v1/auth/me | jqget "['data']['user_id']")
echo "   B GET chat with A (pre-connect) => HTTP $(code "$TB" "/api/v1/community/chat/with/$AID")"
echo "   (expect 403 until A and B follow each other)"

echo "DONE. Review: steps 3-5 must show NO operator/other-tenant data; step 6 must show 1; step 7 must be 403."

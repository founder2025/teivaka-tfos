#!/usr/bin/env bash
# forensic-audit.sh — READ-ONLY audit of the auth / email / verification wiring on prod.
#
# Usage:   bash 04_environment/forensic-audit.sh you@example.com
#   (the recipient is where ONE live delivery-test email is sent; default founder@teivaka.com)
#
# Safe: read-only except it sends a single test email through Resend (section 6).
# Secrets are masked. Paste the whole output back for diagnosis.
set +e
TO="${1:-founder@teivaka.com}"
ROOT="${TEIVAKA_ROOT:-/opt/teivaka}"
cd "$ROOT" 2>/dev/null

line(){ echo; echo "==== $* ===="; }
echo "================ TFOS AUTH/EMAIL FORENSIC AUDIT  $(date -u) ================"
echo "delivery-test recipient: $TO"

line "1. DEPLOY STATE (branch / HEAD)"
git symbolic-ref --short HEAD 2>/dev/null
git log -1 --format="%h  %ci  %s"

line "2. CONTAINER vs HOST CODE (B78 drift guard)"
bash "$ROOT/04_environment/verify-deploy.sh" 2>&1 | tail -4

line "3. EMAIL-GATE ORDER IN RUNNING CONTAINER (want _is_resend BEFORE _smtp_configured)"
docker exec teivaka_api sh -c "grep -n 'def send_verification_email\|if _is_resend\|if not _smtp_configured' /app/app/utils/email.py"

line "4. EMAIL ENV INSIDE THE RUNNING CONTAINER (secrets masked)"
docker exec teivaka_api sh -c '
  echo "SMTP_HOST        =[${SMTP_HOST}]"
  echo "SMTP_FROM        =[${SMTP_FROM}]"
  echo "FRONTEND_URL     =[${FRONTEND_URL}]"
  echo "SMTP_PASSWORD    =[$(printf %s "$SMTP_PASSWORD" | cut -c1-3)*** len=${#SMTP_PASSWORD}]"
  echo "GOOGLE_CLIENT_ID set=[$([ -n "${GOOGLE_CLIENT_ID}" ] && echo yes || echo no)]"
'

line "5. RESEND DOMAINS — verification status (PRIME SUSPECT for non-delivery)"
docker exec teivaka_api sh -c 'curl -s -H "Authorization: Bearer $SMTP_PASSWORD" https://api.resend.com/domains'
echo

line "6. LIVE DELIVERY TEST — FULL Resend API response (reveals errors/sandbox)"
docker exec -e TO="$TO" teivaka_api sh -c '
  FROM="${SMTP_FROM:-noreply@teivaka.com}"
  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $SMTP_PASSWORD" -H "Content-Type: application/json" \
    -d "{\"from\":\"$FROM\",\"to\":[\"$TO\"],\"subject\":\"TFOS forensic delivery test\",\"text\":\"forensic test $(date -u)\"}"
'
echo

line "7. RECENT USERS + VERIFICATION STATE"
docker exec teivaka_db psql -U teivaka -d teivaka_db -At -c \
"SELECT created_at, email, email_verified, (email_verification_token IS NOT NULL) AS has_token, email_verification_expires \
 FROM tenant.users ORDER BY created_at DESC LIMIT 8;"

line "8. RLS POSTURE ON tenant.users + API DB ROLE"
docker exec teivaka_db psql -U teivaka -d teivaka_db -At -c \
"SELECT 'rowsecurity='||relrowsecurity||'  force='||relforcerowsecurity FROM pg_class WHERE oid='tenant.users'::regclass;"
docker exec teivaka_api sh -c 'echo "API DB user = $(printf %s "${ASYNC_DATABASE_URL}${DATABASE_URL}" | sed -E "s#.*://([^:]+):.*#\1#" | head -c 40)"'

line "9. NEWEST VERIFICATION TOKEN STATE (read-only)"
docker exec teivaka_db psql -U teivaka -d teivaka_db -At -c \
"SELECT 'email='||email||'  verified='||email_verified||'  expired='||(email_verification_expires < now()) \
 FROM tenant.users WHERE email_verification_token IS NOT NULL ORDER BY created_at DESC LIMIT 1;"

line "10. WHAT THE RESEND-VERIFICATION ENDPOINT LOGS (last 200 lines, filtered)"
docker logs --tail 200 teivaka_api 2>&1 | grep -iE "resend|verification|email" | tail -15

line "11. CONTAINER HEALTH"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep teivaka

echo "================ END AUDIT ================"

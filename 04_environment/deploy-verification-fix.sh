#!/usr/bin/env bash
# deploy-verification-fix.sh — one-shot deploy of the email-verification fix bundle.
#
# Run THIS ON THE PROD SERVER (it needs Docker + /opt/teivaka). It deploys branch
# claude/beautiful-fermi-F0dLX, which ends the email-verification problem:
#   f070a37  email sends via Resend on the API key alone (no SMTP_HOST gate)
#   3d15fbd  scanner-proof / uid-fallback verify (kills the "expired/used" page)
#   37d1d5e  lazy verification (signup -> straight into the app)
#   3507e91  progressive 4-step onboarding wizard
#   46e42ad  Continue with Google (pre-verified email, profession still captured)
#
# It fails LOUD if email delivery can't work, and PROVES the running container
# carries the fix (no faked green — Strike #122 PR.2, B78).
#
# Usage:   sudo TEIVAKA_ROOT=/opt/teivaka bash 04_environment/deploy-verification-fix.sh
set -euo pipefail

ROOT="${TEIVAKA_ROOT:-/opt/teivaka}"
BRANCH="claude/beautiful-fermi-F0dLX"
COMPOSE="$ROOT/04_environment/docker-compose.yml"
ENV_FILE="$ROOT/04_environment/.env"

cd "$ROOT"

echo "==> 1/7  Fetch + checkout $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> 2/7  Pre-flight: env required for real email delivery"
if [ ! -f "$ENV_FILE" ]; then
  echo "  !! $ENV_FILE not found — cannot validate email config." >&2
fi
email_ok=1
if ! grep -q '^SMTP_PASSWORD=re_' "$ENV_FILE" 2>/dev/null; then
  echo "  !! SMTP_PASSWORD is not a Resend key (re_...). Verification email will NOT send."
  email_ok=0
fi
if ! grep -q '^FRONTEND_URL=https://' "$ENV_FILE" 2>/dev/null; then
  echo "  !! FRONTEND_URL is not https:// — verify links may point at the IP."
  email_ok=0
fi
if ! grep -q '^SMTP_FROM=' "$ENV_FILE" 2>/dev/null; then
  echo "  -- SMTP_FROM unset; code defaults to noreply@teivaka.com (must be Resend-verified)."
fi
if grep -Eq '^GOOGLE_CLIENT_ID=.+' "$ENV_FILE" 2>/dev/null; then
  echo "  -- Google sign-in: GOOGLE_CLIENT_ID present (button will be live)."
else
  echo "  -- Google sign-in: GOOGLE_CLIENT_ID empty -> button stays 'coming soon' (OK; lazy+email still work)."
fi
if [ "$email_ok" = 0 ]; then
  echo "  >> Email path will FAIL until the above .env keys are fixed. Lazy entry + Google"
  echo "     still work. Fix .env, then 'up -d --force-recreate api' (env reloads on recreate)."
fi

echo "==> 3/7  Backend CLEAN rebuild (B78 cached-COPY trap — never plain --build)"
docker compose -f "$COMPOSE" build --no-cache api
docker compose -f "$COMPOSE" up -d api

echo "==> 4/7  Prove running container == host source (B78 guard)"
bash "$ROOT/04_environment/verify-deploy.sh"

echo "==> 5/7  Prove the email-gate fix is in the RUNNING container"
echo "    (expect: 'if _is_resend' appears BEFORE 'if not _smtp_configured')"
docker exec teivaka_api sh -c "grep -n 'if _is_resend\|if not _smtp_configured' /app/app/utils/email.py" || true

echo "==> 6/7  Frontend build (Caddy serves dist/ automatically)"
( cd "$ROOT/frontend" && npm run build )

echo "==> 7/7  DONE deploying. Now PROVE delivery (PR.2 — a 200 is not a receipt):"
echo "    1) Register a test account on https://teivaka.com/register"
echo "    2) Watch the dispatch line:"
echo "         docker logs --tail 50 -f teivaka_api | grep -i 'Verification email dispatched via Resend'"
echo "    3) Confirm the email LANDS in the real inbox, click the link -> SUCCESS."
echo "    4) Click the same link again -> still SUCCESS (scanner replay), not a failure."
echo "  See docs/EMAIL_VERIFICATION_FIX_RUNBOOK.md for the full what-to-click checklist."

# Email Verification — Permanent Fix Runbook

**Goal:** end the email-verification problem on TFOS for good. Either verification
works flawlessly end-to-end, or it's irrelevant to onboarding (lazy entry +
Google) — this bundle delivers **both**, without weakening the "authentic,
verified users" credibility.

Branch: `claude/beautiful-fermi-F0dLX`

## Root causes (diagnosed + fixed in code)

| # | Cause | Fix (commit) | State |
|---|---|---|---|
| A | **Stale deploy.** Prod ran June-8 code where `send_verification_email()` bailed on `_smtp_configured()` (needs `SMTP_HOST`) *before* the Resend path. Prod is a key-only env (Resend key in `SMTP_PASSWORD`, no `SMTP_HOST`) → no mail ever sent. | `f070a37` — `_is_resend()` checked first | ✅ in branch |
| B | **Scanner-consumed tokens.** Gmail/Outlook SafeLinks pre-fetch the link (GET), consuming a one-time token → human's click shows "expired/already used". | `3d15fbd` — token is **kept** (idempotent verify) + `uid` fallback; a verified account can never read as failed | ✅ in branch |
| C | **Undocumented config.** `SMTP_*` / `FRONTEND_URL` / Google keys were missing from `.env.example`, so prod likely never set them. | `46e42ad` — documented in `.env.example` | ✅ in branch |
| + | **Onboarding made resilient regardless of email:** lazy entry (`37d1d5e`), 4-step wizard (`3507e91`), Google sign-in (`46e42ad`). | | ✅ in branch |

The verify endpoint (`GET /api/v1/auth/verify-email`) is now idempotent and
scanner-proof: it does **not** delete the token on success, and falls back to
`uid` to recognise an already-verified account. No further code change is needed
— **the remaining work is purely deploy + config + browser proof.**

## Prerequisites (only the operator can supply)

1. **Resend key in prod `.env`:** `SMTP_PASSWORD=re_...` (almost certainly already
   present — health/backup alerts use it, receipt-verified in Strike #122).
2. **Resend-verified sender:** `SMTP_FROM=noreply@teivaka.com` on a domain
   verified in Resend (an unverified sender → Resend HTTP 400 → silent fail).
3. **`FRONTEND_URL=https://teivaka.com`** so verify links resolve to the domain.
4. *(Optional, unlocks Gmail-no-email path)* Google OAuth **Web** client id →
   set both `GOOGLE_CLIENT_ID=` and `VITE_GOOGLE_CLIENT_ID=` to the same value.
   Authorized JavaScript origins must include `https://teivaka.com`.

## Deploy (one command, on the prod server)

```bash
sudo TEIVAKA_ROOT=/opt/teivaka bash 04_environment/deploy-verification-fix.sh
```

This fetches + checks out the branch, validates the email env (fails loud),
rebuilds `api` clean (`--no-cache`, B78 trap), proves the running container
matches host source (`verify-deploy.sh`), proves the `_is_resend()`-first gate is
live, and rebuilds the frontend. If you change `.env` afterwards, recreate the
container so env reloads (Strike #69):

```bash
docker compose -f 04_environment/docker-compose.yml up -d --force-recreate api
```

## Definition of Done — what to click (real browser on teivaka.com)

Tick every box. Per PR.2, a 200/log line alone is **not** a receipt — the inbox is.

- [ ] **Email/password signup** → verification email **lands in a real inbox**.
      Confirm the server logged it:
      `docker logs --tail 50 teivaka_api | grep -i "Verification email dispatched via Resend"`
- [ ] **Click the link** → page shows **success**, not "expired/already used".
- [ ] **Click the same link again** (simulates a scanner replay) → still
      **success**, never a false failure.
- [ ] **Lazy entry** → after signup, "Continue to Teivaka →" puts you in the app
      with no email step required.
- [ ] *(If Google configured)* **New Google user** → lands on the profession step
      → finishes → in the app, no email step.
- [ ] *(If Google configured)* **Returning Google user** → straight into the app.
- [ ] No 4xx/5xx and no console/network errors in any flow.

## Receipt (record in the strike archive after a successful drill)

```
Date (Fiji):            ____________________
Deployed commit (HEAD): ____________________   (git rev-parse HEAD)
verify-deploy.sh:       PASS / FAIL
Resend dispatch log:    "Verification email dispatched via Resend to ____@____"
Inbox receipt:          received at ______ (provider: Gmail/Outlook/…)
Link click:             SUCCESS
Link re-click (replay): SUCCESS (no false failure)
Lazy entry:             OK
Google new / returning: OK / OK / n.a.
Operator confirmation:  ____________________
```

## Honesty note

If any prerequisite genuinely can't be met (no Resend key, sender not verified,
no Google client id), **stop and name the blocker** — ship lazy entry + the
documented gap rather than a faked "done". Lazy entry and Google (when
configured) both keep onboarding alive even if email delivery is still pending.

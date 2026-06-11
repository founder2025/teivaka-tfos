# TFOS Security Hardening — 2026-06-11

Honest scope: this is a hardening pass, not "hacker-proof" (nothing is).
Fixed → verified; deferred → reasoned. Standing checklist at the bottom.

## Fixed in this pass (code, this branch)
| # | Item | Fix |
|---|---|---|
| 1 | API docs publicly exposed | `/docs`, `/redoc`, `/openapi.json` disabled unless `TFOS_DOCS=1` env is set — the API schema is an attacker's roadmap |
| 2 | Missing security headers | App-side middleware: X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy (Caddyfile is change-locked; applied in FastAPI instead) |
| 3 | Public counters spammable | Per-IP in-memory rate guard on `/platform/metric` (20/min), `/platform/banner` (60/min) |
| 4 | Invite endpoints brute-forceable | Rate guard on invite preview (20/min) and accept (10/5min); tokens are 18-byte urlsafe (≈2^104), single-use, 7-day expiry |
| 5 | Admin surface audit | Every `/admin/*` + founder endpoint re-checked: role enforced server-side via `_require_admin`/role checks, never UI-only |
| 6 | Public path inventory | Every PUBLIC_PATHS/PREFIXES entry justified: auth flows, webhooks (Twilio sig-verified per Inviolable #10), verify (Redis rate-limited), uploads (uuid4-unguessable GETs only), team invite (token-gated + rate-limited), platform flags/banner/metric (read-only or counters, rate-limited) |
| 7 | SQL injection | All queries parameterized (bind params); the few f-string fragments interpolate ONLY server-derived enum/column tokens, never user input — re-verified this branch |
| 8 | Admin grant abuse | Grants/revokes hash-chained to audit.events; founder role immutable from the panel; self-revoke blocked |

## OPERATOR ACTIONS REQUIRED (cannot be done from code)
1. **CRITICAL — rotate the default admin password** (`Teivaka2025!`, flagged in known-issues since launch).
   ⚠️ Do NOT use psql `crypt()/gen_salt('bf')` — it depends on pgcrypto and produces a hash
   variant that can mismatch the app's verifier (this bit us on 2026-06-11). Correct method —
   hash with the SAME library the app uses, inside the api container:
   ```
   docker exec -it teivaka_api python -c "from passlib.context import CryptContext; import getpass; print(CryptContext(schemes=['bcrypt']).hash(getpass.getpass('New password: ')))"
   docker exec teivaka_db psql -U teivaka -d teivaka_db -c "UPDATE tenant.users SET password_hash='<printed $2b$ hash>' WHERE email='<admin email>';"
   ```
   Then verify: old password fails, new password logs in.
2. Confirm `SECRET_KEY` in production .env is long-random (not a default) — rotate if in doubt (invalidates sessions).
3. Confirm DB + Redis ports are not exposed publicly (docker-compose binds / firewall).

## Deferred (reasoned, tracked)
- **Tokens in localStorage** → httpOnly-cookie auth is the right end-state but is a full auth migration touching login/refresh across app + PWA; XSS surface partially mitigated by headers + no third-party scripts. Tracked.
- **Per-route enforcement of feature flags on Farm/TIS pillars** (Home + Classroom gated today). Tracked.
- **Redis-backed rate limiting everywhere** (in-memory guard is per-worker). Verify already uses Redis; extend pattern when adding payment-adjacent endpoints (T1).
- **Full dependency CVE audit** (pip-audit / npm audit in CI). Tracked for the CI phase.
- **CSP tightening** lives in the locked Caddyfile — revisit with operator approval.

## Standing checklist for every future build
- New public endpoint? Justify, rate-limit, add to this doc.
- New table? Grants + (tenant.*) RLS per Inviolable #11; migration + runbook pair.
- New admin endpoint? Server-side role check, never UI-only.
- Secrets never in code or logs; uploads size/type-limited; SQL always parameterized.
- Anything touching money or custody: legal + RBF review first (Transaction & Trust doc, Gate #1).

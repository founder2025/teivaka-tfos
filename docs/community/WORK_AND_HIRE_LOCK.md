# Work & Hire — TCOF Gate 8 LOCK (2026-07-02)

Community pillar page 4 of 8. Locked under TCOF v1.0 (Purpose → Audit → Challenge →
Redesign → Stress Test → Optimize → Dominance → Lock). Execution order:
Feed → Following → Marketplace → **Work & Hire (this)** → Market Prices → Directory →
Network Map → Groups.

## What shipped (WH1–WH4, all deployed, alembic head 210)
- **WH1 — money + audit loop.** Service completion books BOTH `cash_ledger` legs
  (requester expense + provider income) + a `SERVICE_JOB_COMPLETED` audit row per party,
  each in that party's own RLS context, post-commit + best-effort. Concurrency-safe
  (atomic CLAIMED→COMPLETED gate; no double fee/audit), self-claim blocked, price>0.
  Hire path already emits `JOB_HIRED` + reuses the audited Labour worker-create.
- **WH2 — trust ladder on cards.** Employer (Find work), applicant (Applicants drawer),
  requester (Earn) trust badge + ★ rating, via `community.user_trust` join. Reuses the
  shared `TrustBadge`; renders nothing for NEW/absent (honest).
- **WH3 — two-sided reviews.** Employer↔worker (on ACCEPTED) and requester↔provider
  (on COMPLETED), riding `community.marketplace_reviews` via synthetic keys
  (`JOB:{app}:by-employer|by-worker`, `SVC:{job}:by-requester|by-provider`) so they feed
  the SAME trust ladder + ★. One review per direction (UNIQUE order_id). No new table.
- **WH4 — Promotions → Boost.** `community.featured_placements` (migration 210,
  polymorphic). Trust-gated (TRUSTED/VERIFIED), capped 1 active, 7 days, no faked payment;
  featured jobs/services sort top of Find work/Earn with a Featured badge. Advertiser
  SponsorCorner removed from the farmer tab.

## The moat (why it's dominant — Gate 7)
Hash-chained, bank/regulator-verifiable labour + services records tied to one earned,
portable reputation (a sale, a hire, a delivered service all count). A classifieds board
can't produce this; a competitor can't retroactively grant a farmer their track record.

## Verification status at lock
- ✅ All WH read endpoints exercised server-side via asyncpg + serialization (this session).
- ✅ All deploys green; head 210; deploy→verify gate honoured.
- ⏳ OPEN RECEIPT: the 2-account browser write-flow walkthrough (money legs land in Money,
  ★ appears after review, boost sorts to top). Reads clean ⇒ high confidence; not yet
  browser-confirmed. If a write-flow bug surfaces in use, this lock reopens for that item.

## Deferred backlog (filed at lock — none breaks the moat; ranked)
- **WH-b1 (G5) — price-at-claim.** Provider claims a service with no agreed price; price
  set only at completion. #1 gig-dispute vector. First fast-follow.
- **WH-b2 (G8) — one identity.** `worker_profiles` + `service_provider_profiles` are
  separate; unify so reputation/skills live on one profile.
- **WH-b3 (G6) — silent caps.** Provider fan-out 50, list LIMIT 200, applicants 100 — no
  "more exist" signal. Surface counts / paginate at scale.
- **WH-b4 (G7) — honest notify.** WhatsApp fan-out mock-logs unless creds+approved
  template+receipt (PR.2); "providers notified" can overstate. Gate the claim on real send.
- **WH-b5 (WH1-b) — service Post captures farm_id.** PostJobModal sends no farm_id, so a
  multi-farm requester's expense books to an arbitrary farm. Add a farm picker + deterministic
  fallback.
- **WH-b6 — paid boost.** WH4 is free/trust-gated; paid boost rides `featured_placements`
  once the payment rail (M-PAiSA Q8 / Stripe) lands.
- **WH-b7 — featured cleanup.** Expired/closed-item placements linger (harmless; filtered
  by `featured_until > now()` + status). Add a beat sweep at scale.

## Process lessons banked this session (avoid re-hitting)
- SQLAlchemy `text()` treats `:word` inside a string literal as a bind param → 500. Pass
  colon-bearing values as bind PARAMETERS, never inline.
- Adding a JOIN to a query with BARE (unqualified) columns can introduce a silent
  column-name collision (e.g. `created_at`) → "ambiguous column" 500. Qualify select/order
  columns whenever a JOIN is added.
- "Valid in psql" ≠ "works in the app" — reproduce via the app's asyncpg stack
  (`get_db_ctx` + `text()` + `jsonable_encoder`), not just psql/libpq.

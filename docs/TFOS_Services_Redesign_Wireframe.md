# TFOS Services (Service Hub) Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of the "Services" tab (`ServiceHub.jsx`, in `Market.jsx`) after the approved audit (SH1–SH27).

## Headline decisions
1. **Lead with the requester (SH10).** Most farmers *need* a service, not offer one. Default tab is
   **"My jobs"** with a prominent **"Post a job"** (standalone — `POST /service-jobs`, `farm_id` optional,
   verified). The provider/earn side moves to a second tab with the profile form **collapsed** behind
   a summary, so it no longer buries the job list.
2. **Post a job from here (SH12).** New `PostJobModal` (type/title/produce/qty/pickup/dropoff/needed-by/
   budget) — you no longer have to start from a Buyers order.
3. **Money input fixed (SH3).** `window.prompt` → a validated `CompletePriceModal` (no silent $0), with an
   honest note about the 5% provider fee.
4. **Platform parity (SH6/SH2/SH5/SH1):** `<TfpShell>` + app card/button classes; reads via `utils/api`
   (token refresh + humanized errors) with **error+Retry / loading** states (no more silent empties);
   `formatMoney`; shared a11y `<Modal>`; arrow-key tabs; drop the redundant "Service hub" `<h1>` →
   "Services"; no emoji (SH4); page-level **Ask AI** (SH9).

## Visual wireframe (Market › Services)
```
[no h1]                                                          [✨ Ask AI]
Connect the gaps — get produce moved or stored, or earn filling jobs near you.
[ My jobs | Earn ]   role=tab buttons, arrow-key nav

── MY JOBS (default) ──────────────────────────────────────────────
 [＋ Post a job]                                      (standalone request)
 ⟦ error → "Couldn't load your jobs · Retry" ⟧
 JobCard: title · type · STATUS · distance · produce → from → to · budget
   · CLAIMED → [Confirm done] (→ price modal)  · OPEN/CLAIMED → [Cancel]
   · COMPLETED → "Paid FJD X"
 (honest note in price modal: records the agreed price + 5% provider fee; Cash-book logging filed)

── EARN ───────────────────────────────────────────────────────────
 ▸ Your provider profile (collapsed summary + Edit; expanded setup if none)
   name/phone · services chips · base + GPS + radius · "Available for jobs"
 "Jobs near you"  → JobCard + [Claim job]   (radius-matched, nearest first)
 "Jobs you've claimed" → read-only list
```

## Fixes shipped (frontend)
- **SH1/SH2** api.js + error/Retry/loading (no silent empties). **SH3** validated price modal (no $0).
- **SH4** no emoji. **SH5** formatMoney. **SH6** TfpShell + app classes. **SH7** drop h1 / name unified.
- **SH9** Ask AI. **SH10** requester-first; provider profile collapsed. **SH12** standalone Post-a-job.
- Shared `<Modal>` (Esc/focus); arrow-key tabs; submit-locks; transparent 5% fee note.

## Filed (backend — honest, NOT faked)
- **SH17 (keystone)** book BOTH money legs to `cash_ledger` on completion — the **requester's expense**
  and the **provider's income** (today only a 5% provider fee accrues; neither leg is booked → both-sided
  cash leak, and provider can't build Bank Evidence from service income).
- **SH11 / SH24** expose contact (requester/claimer phone) + post-post status (seen/claimed-by/ETA) so
  matched parties coordinate **in-app** — also what makes the 5% take real (SH25, stops off-platform leakage).
- **SH20** map view of nearby jobs (reuse Leaflet). **SH22** provider ratings/trust signals.
- **SH18** recurring/scheduled jobs + provider fleet/capacity. **SH19** cold-chain record for cold-storage.
- **SH25** fee settlement/payout rail. **SH26** two-sided cold-start seeding (ops).
```

# TFOS Farm Pillar — Pre-Alpha Forensic Audit Ledger

Sequential redesign/audit of the Farm pillar before the 50-farmer alpha cohort.
One destination at a time; a page is not PASS until it works end-to-end, builds
clean, has no blank-screen path, scales (breakpoint named), and is honest (real
data or honest-empty). Resumable: each entry records status + findings + decisions.

Order: Overview → Tasks → Enterprise → Production → Field Events → Inventory →
Labour → Buyers → Cash → Assets & Equipment → Locations → Compliance → Analytics →
Reports → Weather → Library → Gallery → Partnerships → Settings.

Legend: ✅ PASS · 🟡 improved, open items · ▢ not started

---

## 1. Overview (/farm) — 🟡 improved (this pass)

**Brutal assessment.** Recently rebuilt to prototype format (real KPIs, Attention,
Advisor, Portfolio, Financial, Recent Activity) — solid and honest, but had two
real defects surfaced on the live screen and one scale risk.

**Strengths.** Real RLS data on every tile; flat icons + theme; Array-guarded (no
blank screen); honest gaps (AI recs "Building", 90-day projection omitted);
strike-mandated pieces preserved (LayerBackfillBanner, audit-chain footer); clear
"what/why" via Attention + Advisor.

**Weaknesses (found).**
- Cash Balance rendered blank — extraction read `data.balance`, but the endpoint
  returns `data.cash_balance_fjd` (cash.py:~352). FIXED → reads cash_balance_fjd,
  numeric, shows FJD 0 not blank.
- Best == Watch when only one enterprise has P&L signal (FarmDashboard derivations).
  FIXED → Watch only shows with ≥2 distinct enterprises; else "All healthy".

**Information architecture / layout.** Header → Health hero + 5 KPIs → Attention +
Advisor → Enterprise Portfolio (tabs) → Financial + Recent Activity → Active Cycles
→ audit-chain footer. Good hierarchy; matches "what next / why".

**UX + mobile.** Tiles tap to the right surface; one-handed grid; flat icons; plain
language. OK.

**AI opportunities (grounded only).** Real Best/Riskiest shown; recommendations +
90-day projection require a decision-engine projection + grounded advisor — flagged
future, not faked.

**Integration.** Links to cash / enterprises / tasks / compliance / reports / tis;
reuses financials, flocks, cycles, tasks, cash-ledger, compliance, chain-status.

**SCALE BREAKPOINT (named).** The page fires ~12 parallel queries per open (farm,
fin, crops, flocks, cycles, tasks, cash, farms, labor, compliance, chain, me).
Fine for alpha; at ~10k+ concurrent dashboard opens this is 12× the round-trips and
will pressure the API/DB pool. RECOMMEND (staged, next backend slice): a single
composite `GET /farm/overview/{farm_id}` that returns the dashboard payload in one
call. Not built this pass (additive backend work; no fabrication).

**Security.** All queries auth + farm-scoped; RLS enforced server-side. OK.

**Status:** 🟡 — two defects fixed + shipped; composite-endpoint scale work filed.

---
(remaining destinations pending — appended as each is audited)

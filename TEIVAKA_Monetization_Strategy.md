# TEIVAKA MONETIZATION STRATEGY

> **Status:** Canonical · Operator-ratified 2026-06-15 · **RESTRUCTURED & re-ratified
> 2026-06-25 (Hormozi lens: price OUTCOMES, not features; farmers = distribution,
> institutions = monetization).** Sections 1–11 below were rewritten in the 2026-06-25
> restructure; the funding plan + north star are carried forward unchanged. Wired into
> the platform via migrations 170–172 + `community.subscription_plans` /
> `community.product_catalog` (admin-editable, no deploy).
> **Confidentiality:** INTERNAL / CONFIDENTIAL — this is competitive IP. Do NOT publish
> any of this (pricing, revenue mix, channel design) to the public website or any
> public-facing surface. It lives in the repo as the team's source of truth and as the
> spec for building billing/monetization into the platform.
> **Source:** Operator-pasted strategy, locked verbatim below, with a current-financial-
> reality header added by the build agent.

---

## CURRENT FINANCIAL REALITY (as of 2026-06)

- **Software: pre-revenue.** The platform is in active build; no platform revenue yet.
- **Burn rate: ~FJD $850 / month** (~FJD $10,200 / year).
- **Funded by the pilot farms** — the two working farms (which return ~$10–$12 per $1
  spent) fund the software build. **Not investor capital.**
- **Implication (the strong story):** the company has reached its current build state on
  near-zero outside capital, self-funded by profitable operations. Breakeven on the
  software is **one institutional deal away** — a single NGO Package (FJD $10,000/yr,
  500 farmers) roughly covers the **entire annual software burn**; one Ministry Package
  (FJD $75,000/yr, 5,000 farmers) covers it **~7×**.

---

## Core Principle

Teivaka is **not a farm management software company.**

Teivaka is a **Pacific Agriculture Ecosystem Platform** that connects: Farmers,
Landowners, Buyers, Exporters, Input Suppliers, Service Providers, Financial
Institutions, NGOs, Government Agencies, and Agricultural Experts.

The business model must align with our mission:

- **Vision:** Transform Idle Land into Wealth
- **Mission:** Empower Every Farmer to Prosper
- **Goal:** Build the Future of Pacific Agriculture

Therefore, Teivaka should not rely primarily on charging farmers. The ecosystem is
designed so that organizations, businesses, and commercial participants help subsidize
access for farmers while Teivaka earns revenue from multiple channels.

---

## REVENUE DISTRIBUTION TARGET (mature mix)

| Revenue Source                 | Target % |
| ------------------------------ | -------- |
| Marketplace Transactions       | 30%      |
| Sponsored Farmer Seats         | 20%      |
| Farmer Subscriptions           | 15%      |
| Agribusiness Subscriptions     | 10%      |
| Advertising & Sponsorship      | 10%      |
| Education & Certifications     | 5%       |
| Financial Services Commissions | 5%       |
| Data & Insights                | 5%       |

Resilient by design — no dependence on a single revenue source.

---

## THE ECONOMIC ENGINE (the 2026-06-25 sharpening)

Farmers **create** value (records, verification, production, trust, data).
Institutions **consume** value (banks, exporters, buyers, governments, NGOs, insurers,
processors). Therefore: **Farmer = Distribution. Institution = Monetization.** We do not
charge a farmer for analytics when the bank is the one saving thousands because those
analytics exist. We price the *outcome* to whoever captures it.

The platform hardcodes **products, not just plans**: Farmer Plans · Sponsored Farmer
Seats · Teivaka Verified · Teivaka Market Access · Teivaka Intelligence · Compliance &
Traceability · Teivaka Academy · Advertising · Enterprise Contracts.

---

## PRODUCT 1 — FARMER PLANS  *(distribution: capture the network, don't milk it)*

Wired live + entitlement-gated (`community.subscription_plans`, internal codes
FREE/BASIC/PROFESSIONAL stable; farmer-visible names below). **No Enterprise on the
farmer side** — that's institutional Verified/Intelligence territory. No "unlimited"
anything on a farmer plan (those are custom-level economics).

**Free (forever)** — FJD 0. *Acquire the network — target 80–90% of farmers.*
Unlimited records, unlimited verification, community, marketplace, classroom, trust
score, 1 farm, **TIS 50/month**, basic reports, offline access.

**Farm Pro** — FJD **19/mo · 180/yr**. *Serious commercial smallholder — 5–15%.*
5 farms, 20 team members, **TIS 500/month**, advanced reports, **Loan Readiness Pack**,
buyer matching, inventory, labour management, season analytics.

**Farm Business** — FJD **69/mo · 690/yr**. *Commercial operation — 1–5%.*
25 farms, 100 users, **TIS 5,000/month**, forecasting, cashflow planning, automation,
advanced dashboards, branded reports, priority support, advanced verification.

> *Note: TIS caps above are per-MONTH (the product definition). The live limiter still
> meters per-DAY and over-delivers vs these caps; the daily→monthly conversion is a
> separate scheduled slice.*

---

## PRODUCT 2 — TEIVAKA VERIFIED™  *(where the money starts)*

Customers: **banks, exporters, insurers, buyers, processors.**
- **Starter** — FJD **500/mo** — Verified Farmer Network access, basic search, verification lookups.
- **Professional** — FJD **2,500/mo** — advanced search, verified supplier discovery, portfolio monitoring, risk dashboard, buyer matching.
- **Enterprise** — from FJD **10,000/mo** — custom integrations, API, bulk verification, compliance tools.

---

## PRODUCT 3 — TEIVAKA INTELLIGENCE™

Customers: **government, NGOs, development partners, research institutions.**
- **Regional Dashboard** — FJD **2,000/mo**.
- **National Dashboard** — FJD **10,000/mo**.
- **Custom Analytics** — from FJD **25,000** per project.

(Aggregated/anonymized only — no personal farmer data sold.)

---

## PRODUCT 4 — TEIVAKA MARKET ACCESS™

Customers: **exporters, buyers, processors.**
- **Buyer Subscription** — FJD **500/mo**.
- **Verified Supplier Discovery** — FJD **1,500/mo**.
- **Preferred Buyer Status** — FJD **3,000/mo**.

Plus marketplace transaction fees on produce **2%** · inputs **3%** · services **5%** ·
labour **5%**.

---

## PRODUCT 5 — SPONSORED FARMERS™  *(push hardest in Fiji)*

Organizations sponsor farmer access; farmers get it free. **FJD 10 / farmer / month.**
- FDB — 1,000 farmers → **FJD 10,000/mo**.
- Agricultural Ministry — 5,000 farmers → **FJD 50,000/mo**.
- NGO — 500 farmers → **FJD 5,000/mo**.

---

## PRODUCT 6 — COMPLIANCE & TRACEABILITY™  *(future gold mine)*

Customers: **exporters, processors, governments.** FJD **1,000–20,000/mo** by scale —
export-grade traceability, compliance reporting, audit-ready records.

---

## PRODUCT 7 — TEIVAKA ACADEMY™

Course revenue split **70% instructor / 30% Teivaka**. Certification **FJD 20** per
certificate.

---

## PRODUCT 8 — ADVERTISING  *(agriculture advertisers only — protect trust)*

Sponsored Listings — Starter **99/mo** · Growth **299/mo** · Premium **999/mo**.
Eligible: seed/fertilizer/equipment suppliers, banks, insurers, exporters, agribusiness.

---

## PRODUCT 9 — ENTERPRISE CONTRACTS / DATA & INSIGHTS

Bespoke institutional deals + aggregated data products (FJD **5,000–50,000/yr** per org).
Land Activation also lives here: land listing FJD 50/yr · premium FJD 250/yr · successful
match fee **1%–3%** of the first lease.

---

### The revenue logic (why fewer paying customers wins)

At 10,000 farmers, the poor model is `10,000 × FJD 20 = FJD 200k/mo` and dependent on
farmers paying. The better model — **500 paid farmers + 3 banks + 2 exporters + 1
ministry + 2 NGOs + marketplace + compliance** — yields **FJD 100k–300k/mo with far
fewer paying customers**, because institutions pay for the outcome the farmer network
produces. Teivaka is a **trust, intelligence, and market-infrastructure layer**, not farm
software.

---

## TEIVAKA NORTH STAR

The platform is designed so that farmers can **join, learn, connect, and sell free** —
and the **organizations that benefit from farmer participation help fund the ecosystem.**

The long-term objective is not maximizing subscription revenue. It is becoming the
**trusted digital infrastructure layer for Pacific agriculture.** When Teivaka becomes
the operating system connecting every farmer, landowner, buyer, supplier, educator,
lender, and institution, revenue scales naturally through transactions, sponsorships,
subscriptions, advertising, education, and financial services — a profitable company
that stays aligned with the mission of empowering every farmer to prosper.

---

## PRE-SEED FUNDING PLAN — FJD $75,000 (Operator-locked 2026-06-16)

**The Ask:** Teivaka is seeking **FJD $75,000 in pre-seed strategic funding** to transition
from a founder-funded pilot platform into a commercially ready agricultural ecosystem —
strengthening the product, expanding pilot-farm validation, onboarding 250 farmers,
establishing 10 demonstration farms, completing legal/operational readiness, and launching
publicly within 12 months. Expected to deliver 50 paying subscribers, 20 agribusiness
customers, 150 monthly active users, and ~FJD $40,000 ARR — laying the foundation for
national scale. (Pre-revenue with a completed product, pilot farms, and founder traction:
$75k is aggressive enough to matter, conservative enough to defend.)

### Allocation (totals to FJD $75,000)

| # | Use of funds | FJD | % |
|---|---|---|---|
| 1 | Product Strengthening & Commercial Readiness (hardening, not features) | 22,500 | 30% |
| 2 | Pilot Network & Data Validation (2 → 10 farms) | 15,000 | 20% |
| 3 | Farmer Acquisition & Onboarding (250 active) | 18,750 | 25% |
| 4 | Operations & Infrastructure (12-mo coverage) | 7,500 | 10% |
| 5 | Legal, Compliance & Governance | 5,250 | 7% |
| 6 | Launch Reserve (buffer) | 6,000 | 8% |
| | **Total** | **75,000** | **100%** |

- **1. Product hardening:** security, performance, mobile responsiveness, admin control
  room, marketplace stability, payment integration, subscription management, sponsored-seat
  infrastructure, audit logs, reporting engine, notifications, data validation, testing.
- **2. Pilot network:** 10 farms across Kava / Vegetables / Cassava / Mixed — real records,
  transactions, yields, reports → credible platform data.
- **3. Farmer acquisition:** village visits, demonstrations, workshops, printed material,
  video tutorials, community activation → *active users, not signups.*
- **4. Ops & infra:** DigitalOcean, Claude, OpenAI, domains, monitoring, storage, backups,
  security — 12 months.
- **5. Legal, Compliance & Governance — FJD $5,250 (the line most founders forget):**
  | Sub-item | FJD (approx) |
  |---|---|
  | Privacy Policy + Terms of Service (drafting + review) | 1,500 |
  | Marketplace Terms + Vendor / Partnership / Sponsored-Seat agreements | 1,750 |
  | Data protection / data-sharing agreements | 1,000 |
  | Business compliance (registration, accounting & tax setup) | 1,000 |
  | **Total** | **5,250** |
- **6. Launch reserve:** unexpected costs, server/API spikes, travel — because something
  always breaks.

### Phased timeline (done → funded → forecast)

**Phase 1 — Build & Prove · DONE · founder-funded (Year 0)**
- Full ecosystem built: four pillars (Community, TFOS, Classroom, TIS) + AI + admin.
- 2 working pilot farms returning ~$10–$12 per $1; they fund the build.
- Pre-revenue software at ~FJD $850/mo burn — self-funded, no outside capital.
- Public site live; signup/onboarding live; TIS live on WhatsApp.

**Phase 2 — Strengthen & Launch · THE $75,000 PRE-SEED · 12 months (Year 1)**
- Spend the allocation above → commercial-ready platform + public launch.
- Targets: 250 registered · 150 monthly active · 50 paying · 20 agribusiness · 10 pilot
  farms · legal/compliance complete.
- Revenue target ~**FJD $40,000 ARR**:
  | Source | FJD/yr |
  |---|---|
  | 50 farmers × $15/mo | 9,000 |
  | 20 businesses × $49/mo | 11,760 |
  | Advertising | ~5,000 |
  | Marketplace | ~5,000 |
  | Sponsored seats | ~10,000 |
  | **≈ Total** | **~40,000** |

**Phase 3 — Scale · FORECAST · post-pre-seed (Year 2+)**
- Sponsored seats (NGO → Ministry → National packages) become a leading channel;
  marketplace scales toward the largest source; Pacific expansion begins; revenue mix
  matures toward the 8-channel target above. Sets up the next (seed) round.

---

## BUILD ROADMAP (how this becomes real in the platform — not yet built)

This doc is the spec. Wiring it into the product is sequenced, billing-provider-gated
(Stripe / M-PAiSA merchant registration is still an open blocker per CLAUDE.md):

1. Subscription tiers (Free / Pro / Business / Enterprise) + entitlement gating.
2. Sponsored-seat issuance (org buys N seats → farmers redeem free access).
3. Marketplace transaction-fee capture (produce/input/service/labor).
4. Advertising + Verified Directory billing.
5. Classroom paid courses/certs.
6. Financial-services referral tracking + commission reconciliation.
7. Data & Insights (aggregated/anonymized only — privacy-preserving by construction).
8. Land Activation listings + match fees.
9. AI prompt metering per tier (ties into the TIS usage layer already in place).
10. API/integration billing (future).

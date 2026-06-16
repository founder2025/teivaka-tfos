# TEIVAKA MONETIZATION STRATEGY

> **Status:** Canonical · Operator-ratified 2026-06-15
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

## 1. FARMER SUBSCRIPTIONS

**Free Farmer** — Free forever. User acquisition, community growth, marketplace
liquidity, data generation, mission alignment. Includes: community, marketplace, market
prices, basic farm records, basic learning, weather, government notices, basic AI.

**Teivaka Pro** — FJD $15/mo or $150/yr. Commercial smallholders. Unlimited records,
labor mgmt, P&L tracking, financial reporting, yield analytics, planning tools, advanced
AI, priority marketplace visibility, premium training.

**Teivaka Business** — FJD $49/mo or $490/yr. Commercial farms, co-ops, agribusiness.
Multiple farms, team accounts, inventory, machinery, compliance reporting, advanced
analytics, BI tools.

**Enterprise** — from FJD $299/mo. Exporters, large co-ops, government programs,
corporate ag. Custom pricing by scale.

---

## 2. SPONSORED FARMER SEATS  *(projected to be one of the largest streams)*

Organizations buy subscriptions on behalf of farmers; farmers get access free.

- **NGO Package** — 500 farmers — FJD $10,000/yr (farmer access, impact dashboard,
  training, reporting).
- **NGO Growth Package** — 1,000 farmers — FJD $20,000/yr.
- **Ministry Package** — 5,000 farmers — FJD $75,000/yr (national dashboard, production
  analytics, program tracking, impact reporting).
- **National Agriculture Package** — 20,000+ farmers — custom, from FJD $250,000/yr.

---

## 3. MARKETPLACE TRANSACTION FEES  *(targeted largest source)*

- **Produce Marketplace** (farmers → buyers/hotels/restaurants/exporters/processors): **2%**
- **Input Marketplace** (seeds/fertilizers/chemicals/equipment): **3%**
- **Service Marketplace** (tractor/excavator/consultants/spraying): **5%**
- **Labor Marketplace** (employers hire workers): **5%**

---

## 4. ADVERTISING SYSTEM  *(agriculture-related advertisers only — protect trust)*

- Sponsored Listings — Starter FJD $99/mo · Growth FJD $299/mo · Premium FJD $999/mo.
- Eligible: seed/fertilizer/equipment suppliers, banks, insurers, exporters, agribusiness.

---

## 5. VERIFIED BUSINESS DIRECTORY

- Basic Listing — Free.
- Verified Listing — FJD $199/yr.
- Premium Verified Listing — FJD $999/yr (priority placement, verified badge, lead-gen,
  analytics).

---

## 6. TEIVAKA CLASSROOM

- Basic learning — free.
- Certificate Courses — FJD $49–$199 (Kava Farming, Commercial Vegetable Production,
  Farm Business Management, Agribusiness Entrepreneurship, Export Readiness).
- Professional Certification Programs — FJD $499–$2,000+ (agribusiness managers,
  extension officers, commercial farm managers).

---

## 7. FINANCIAL SERVICES COMMISSIONS

Partner with banks, credit providers, insurers. Revenue from loan / insurance /
equipment-financing / input-financing referrals. Commission **1%–5%** per partner
agreement.

---

## 8. DATA & INSIGHTS PLATFORM

**Only aggregated and anonymized data. No personal farmer data sold.**
Customers: government, NGOs, banks, researchers, development agencies.
Products: crop production reports, regional yield reports, input-demand forecasting,
labor-demand forecasting, land-utilization reports, market-trend reports.
Pricing: **FJD $5,000–$50,000/yr** per organization.

---

## 9. LAND ACTIVATION REVENUE  *(unique Teivaka advantage)*

Idle landowners connect with farmers.
- Land Listing Fee — FJD $50/yr.
- Premium Land Listing — FJD $250/yr.
- Successful Match Fee — **1%–3%** of the first lease agreement.

---

## 10. AI ASSISTANT MONETIZATION

- Free Tier — 10 prompts/month.
- Pro Tier — 100 prompts/month (included).
- Business Tier — unlimited fair usage (included).
- Enterprise — custom AI agents, additional pricing.

---

## 11. API & INTEGRATION REVENUE  *(future phase)*

Organizations pay to connect systems (government, ERP, financial, export).
Pricing: FJD $99–$999/month based on usage.

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

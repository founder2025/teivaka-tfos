# TFOS Transaction & Trust Architecture — Escrow, Reputation, Fulfillment, Zero-Noise TIS

**Status:** Architecture ratified for build; two OPERATOR DECISION gates flagged inline.
**Date:** 2026-06-11 · **Author:** Claude Code session, Operator-directed
**Scope:** Integrates four core product features into the existing TFOS architecture,
user flows, and technical roadmap. Vocabulary is mapped to the REAL platform
(Marketplace listings, community schema, audit.events spine) — not to abstract
"tiers" that don't exist in the codebase.

---

## 0. Current-state anchor (what these features build ON)

| Existing asset | Lives at | Reused by feature |
|---|---|---|
| Marketplace listings (6 categories, price_basis, details) | `community.listings` | 1, 3 |
| Hash-chained audit spine + `/verify/{hash}` | `audit.events`, `app/core/audit_chain.py` | 1, 2 |
| Bank Evidence PDF generator | `crop_bank_evidence.py` / `poultry_bank_evidence.py` (reportlab + QR) | 2 |
| KYC green tick + verified email gates | `tenant.users.kyc_verified`, `community_write` | 1, 2, 3 |
| Profession taxonomy (incl. `service_provider`) + Directory | `tenant.users.account_type`, `/people` | 3 |
| WhatsApp gateway (TIS bot +6797336211, OpenClaw + tis-bridge) | systemd `tis`, `/opt/tis-bridge` | 3, 4 |
| Cited agronomy KB + nutrition tool path (Strikes #62/#63) | `shared.kb_articles`, `shared.crop_nutrition_protocols` | 4 |
| Chat, notifications, groups, feed infrastructure | `community.*` | 1, 3 |

---

## 1. Escrow-Backed Transaction Engine (Anti-Scam Shield)

### ⚠️ OPERATOR DECISION GATE #1 — money movement
There is **no payment rail today** (Stripe not integrated; M-PAiSA merchant
registration = open blocker Q8, 2–6 week external lag). Additionally, holding
buyer funds in a "Teivaka clearing account" is likely **regulated activity in
Fiji (Reserve Bank of Fiji — e-money / trust account rules)**. Legal review is
required BEFORE Teivaka touches a single dollar of third-party money.
**Decision needed:** (a) pursue RBF-compliant client account + M-PAiSA rail, or
(b) launch with "directed escrow" (buyer pays via M-PAiSA P2P, uploads receipt,
admin verifies and marks order FUNDED — human-verified, not custodial).
Until decided, the build below is the **rail-agnostic ledger** — every state,
split and settlement is real; only the money-movement adapter is pluggable.
**No fake "funds secured" copy ships before a real rail or verified receipt.**

### Schema (migration 105 — `community` schema, endpoint-gated like listings)
```
community.orders (
  order_id TEXT PK ('ORD-…'), listing_id FK→listings, buyer_user_id UUID,
  seller_user_id UUID, qty NUMERIC, unit TEXT, amount_fjd NUMERIC(10,2),
  delivery_mode TEXT (PICKUP|TRANSPORT), status TEXT
    CHECK IN ('PLACED','FUNDED','DISPATCHED','DELIVERED','CONFIRMED',
              'SETTLED','DISPUTED','CANCELLED','REFUNDED'),
  funded_at, confirmed_at, settled_at TIMESTAMPTZ,
  funding_source TEXT ('MPAISA_RECEIPT'|'PSP'|'ADMIN'), funding_ref TEXT,
  audit_hash TEXT,                -- every state change emits audit.events
  created_at TIMESTAMPTZ)
community.order_events (order_id, from_status, to_status, actor_user_id,
  note, audit_hash, created_at)   -- the immutable order timeline
community.settlement_batches (batch_id PK, week_ending DATE, status
  ('OPEN','LOCKED','PAID'), total_fjd, paid_at, paid_by)
community.payout_lines (batch_id FK, order_id FK, payee_user_id, role
  ('FARMER','DRIVER','PLATFORM'), amount_fjd, status ('QUEUED','PAID'))
```

### User flow
1. Buyer taps **Order** on a listing → order PLACED (qty, delivery mode, total).
2. **Funding step** (rail-dependent per Decision Gate #1): PSP charge → FUNDED,
   or receipt upload → admin verifies → FUNDED. Seller is notified ONLY at
   FUNDED — ghost buyers never reach the farmer.
3. Seller prepares; (optional) Feature 3 dispatches transport → DISPATCHED.
4. Buyer taps **Confirm receipt** at the loading dock (PIN or QR on the order)
   → CONFIRMED. Every transition = one `audit.events` row (Inviolable spine).
5. Friday batch job sweeps CONFIRMED orders → payout_lines (farmer/driver/
   platform splits) → batch LOCKED → operator pays out → SETTLED.
6. DISPUTED freezes the order for admin resolution; nothing auto-releases.

### Why this kills the scam vector even pre-PSP
Fake-receipt fraud dies because the SELLER never acts on a buyer's claim —
only on the platform's FUNDED state, which only admin verification or a PSP
webhook can set. Buyer ghosting dies because nothing is prepared or shipped
before FUNDED.

---

## 2. Reputation Capital Ledger ("Likes to Loans")

### Principle: the ledger already exists — the SCORE is the new layer
`audit.events` already hash-chains every farm record; orders (Feature 1) add
verified commercial fulfilment. This feature adds a **transparent, explainable
aggregation** — NOT an opaque proprietary number. A bank must be able to read
the methodology on the PDF. (No invented credit math; every component is a
counted fact with its query printed in the doc.)

### Components of the Teivaka Commercial Reputation (TCR)
| Component | Source (all existing/Feature-1 tables) |
|---|---|
| Fulfilment rate (CONFIRMED ÷ FUNDED orders, 12-mo) | community.orders |
| Verified sales volume FJD (settled, 12-mo) | payout_lines |
| Dispute rate (DISPUTED ÷ orders) | community.orders |
| Crop-cycle completions + on-time harvests | tenant.production_cycles |
| Record density (audit events / month, tenure-weighted) | audit.events |
| Identity + credentials (KYC tick, Classroom certificates) | users, course_certificates |

Materialized nightly into `community.reputation_snapshots`
(user_id, score_0_100, component_jsonb, computed_at) — **pre-computed, never
on-demand** (Inviolable #3 pattern). Surfaces: profile "Verified record" card,
Directory, Marketplace seller header, and a new **Reputation page of the Bank
Evidence PDF** (component table + methodology + QR to /verify).

---

## 3. One-Click Closed-Loop Fulfillment (Unified Logistics)

### Honest scoping vs the spec
"Route optimization at the exact millisecond" is overkill for launch. The
shippable loop: **on FUNDED, broadcast the job to verified transporters in the
same region; first-accept wins; splits queue automatically.** Distance ranking
uses farm/listing island + locations data already in the platform. True route
optimization is a later enhancement, not a dependency.

### Schema (same migration family)
```
community.transport_jobs (job_id PK, order_id FK, pickup_text, dropoff_text,
  island, offer_fjd, status ('OPEN','ACCEPTED','PICKED_UP','DELIVERED',
  'CANCELLED'), driver_user_id, accepted_at, delivered_at, audit_hash)
community.transport_profiles (user_id PK, vehicle_type, capacity_kg,
  islands TEXT[], whatsapp, active BOOLEAN)  -- verified service_providers opt in
```

### Flow
FUNDED order with delivery_mode=TRANSPORT → job OPEN → WhatsApp broadcast via
the existing tis-bridge gateway to matching `transport_profiles` ("Job: 200kg
taro, Naqara→Vunisea jetty, FJD 40 — reply YES-{job_id}") → first YES wins
(reply webhook → ACCEPTED; race handled by single UPDATE … WHERE status='OPEN')
→ driver marks PICKED_UP/DELIVERED in-app or by WhatsApp keyword → buyer
confirm (Feature 1 step 4) closes the loop → payout split
(farmer / driver / platform fee %, configured in admin settings) queues into
the same Friday batch. Receipt-verified per PR.2: the WhatsApp job-alert
channel ships only after a test message is confirmed received by a real driver.

---

## 4. High-Signal Agronomy Knowledge Base (Contextual Zero-Noise TIS)

### ⚠️ OPERATOR DECISION GATE #2 — "strip out all social feeds"
Read literally, this deletes the Home pillar (Feed/Stories/Groups/Marketplace)
— which the sacred prototype mandates and the Operator ratified and shipped
this very week. **Adopted interpretation (binding unless Operator overrides):
the zero-noise mandate applies to the TIS CHANNEL, not the platform.** TIS
(WhatsApp + in-app) carries no feed content, no engagement mechanics, no ads,
no upsells — query in, cited answer out, nothing else. The social layer stays
where the prototype puts it. If the Operator truly wants the Feed removed,
that is a Prime Directive amendment requiring an explicit written decision.

### What already complies (do not rebuild)
- TIS answers nutrition queries ONLY from `shared.crop_nutrition_protocols`
  with citations + verification_status caveats (Strikes #62/#63, operational).
- Inviolable #1 (never hallucinate agronomy) and #7 (shared.* read-only).
- Library tab + partner guide pipeline (human-reviewed submissions).

### The build deltas
1. **Language policy:** TIS replies in the language of the query — English,
   Fijian (iTaukei), Fiji Hindi. Mechanism: the LLM translates the PRESENTATION
   of KB content; facts/dosages/citations come verbatim from the KB. The system
   prompt forbids introducing agronomy facts during translation. KB rows gain
   optional `title_fj / title_hi` fields over time (content work, B-track).
2. **Coverage growth as content ops:** the KB-candidates pipeline (real farmer
   questions logged when TIS lacks an article) is the priority queue for the
   agronomist/partner pipeline → Library submissions → review → publish.
3. **Context injection:** TIS queries already carry farm context; extend with
   region/soil/season tags on KB articles so retrieval prefers locally
   applicable guidance (Fiji soils, cyclone season windows, regional diseases).
4. **Zero-noise guard codified:** no module may inject feed, marketplace, or
   promotional content into TIS responses. Advisory channel = advisory only.

---

## Roadmap (sequenced, each phase shippable + browser-verifiable)

| Phase | Slice | Depends on |
|---|---|---|
| T1 | Migration 105: orders + order_events + settlement + payout_lines; Order button on listings; PLACED→FUNDED(admin-verified receipt)→CONFIRMED flow; order timeline UI; audit emission per transition | nothing — ships now |
| T2 | Friday settlement batch job + admin settlement console (lock batch, mark paid, payout lines) | T1 |
| T3 | Reputation snapshots (nightly task) + profile/Directory/Marketplace surfaces + Bank Evidence PDF reputation page | T1 (richer with T2 data) |
| T4 | transport_profiles opt-in + transport_jobs + WhatsApp broadcast/accept loop (PR.2 receipt-verified) + driver split in settlement | T1, T2 |
| T5 | TIS language policy (EN/FJ/HI) + zero-noise guard + KB region/season tags | nothing — parallel-safe |
| T6 | PSP adapter (M-PAiSA/Stripe) replacing admin-verified funding — schema unchanged | Decision Gate #1 + Q8 resolved |

**Out of scope until explicitly decided:** custodial fund-holding (Gate #1),
feed removal (Gate #2), millisecond route optimization (post-T4 enhancement).

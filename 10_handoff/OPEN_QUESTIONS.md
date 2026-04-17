# FILE: 10_handoff/OPEN_QUESTIONS.md

# Open Questions — Cody Must Answer Before Building
**Document Owner:** Teivaka TFOS Development Team
**To Be Answered By:** Uraia Koroi Kama (Cody), Founder, Teivaka PTE LTD
**Last Updated:** 2026-04-07

---

## How to Use This Document

Each question below is blocking or influencing a specific part of the build. The questions are ranked by Priority:
- **CRITICAL:** Build cannot proceed for the affected feature without this answer. Developer will implement a known default but the feature will be disabled/flagged until confirmed.
- **HIGH:** Implementation will proceed with a stated assumption, but the assumption may be wrong. Risk of rework if assumption is incorrect.
- **MEDIUM:** Implementation can proceed with a reasonable default. Low rework risk if answer changes default.

For each question, Cody should respond via WhatsApp with the answer, and the developer will update this document and the corresponding .env or database config.

---

## Question 1 — Profit Share Rate with Nayans (F001)

**Priority:** CRITICAL
**Question:** What is the exact profit share percentage (ProfitShareRate_%) that Teivaka pays to Nayans (the land owner of Save-A-Lot Farm, F001) from the farm's net profit?

**Context:**
F001 (Save-A-Lot Farm, Serua Province, 83 acres) is owned by Nayans under an iTaukei lease (NLTB) and operated by Teivaka. Teivaka covers all operating costs and labor. The profit after costs is shared between Teivaka and Nayans at an agreed percentage.

**Why It Matters:**
The profit_share module computes:
- `NayansShare_FJD = NetProfit_FJD × (ProfitShareRate_% / 100)`
- `TeivakaCut_FJD = NetProfit_FJD × (1 - ProfitShareRate_% / 100)`

Without this number, the profit share tab in the TFOS financial module cannot display correct values. If the module shows an incorrect figure and Nayans sees it, it could damage the commercial relationship.

**What Breaks If Unknown:**
- Profit share module cannot compute NayansShare_FJD or TeivakaCut_FJD
- TFOS financial reports for F001 will be incomplete
- The `profit_share_rate_pct` field in the `farms` table will be NULL (farm record created but field left empty)

**Default If Not Answered:**
The profit share tab and all profit split calculations will be HIDDEN (disabled) in the F001 dashboard until this value is confirmed and entered. A warning will be shown: "Profit share rate not configured — contact Cody."

**Implementation Note:**
This value is stored in `farms.profit_share_rate_pct` (configurable, not hardcoded). It can be updated at any time via PATCH /farms/F001 with FOUNDER-level auth.

**Who to Confirm With:** Cody + Nayans (or Nayans' representative). This may be a verbal agreement — if so, document it in writing before configuring in the system.

**Answer from Cody:** _____________________________ (fill this in)

---

## Question 2 — iTaukei Lease Expiry Year for F001

**Priority:** HIGH
**Question:** What year does the iTaukei (NLTB) lease for F001 (Save-A-Lot Farm, Serua Province) expire?

**Context:**
F001 operates under an iTaukei lease managed by the iTaukei Land Trust Board (NLTB). These leases typically run 30–99 years. The expiry year is critical for long-term investment decisions.

**Why It Matters:**
The Decision Engine's expansion_readiness signal (Phase 2) will factor in remaining lease years:
- If lease expires in < 5 years: Decision Engine flags this as a HIGH risk for capital investments (planting teak trees, building infrastructure, long-term forestry)
- If lease expires in > 20 years: expansion investment is justified

For the current Phase 1 MVP, this information is used as a metadata flag in the `farms` table (`lease_expiry_year`) and displayed on the farm detail screen as context for Cody.

**What Breaks If Unknown:**
- The `lease_expiry_year` field in the `farms` table will be NULL
- Farm detail screen will show a warning flag: "Lease expiry year unknown — update farm details"
- Expansion readiness scoring in Phase 2 will be unable to accurately assess risk

**Default If Not Answered:**
Field remains NULL with a warning displayed. No blocking behavior — this does not stop any operational feature.

**How to Find This:**
The NLTB lease document (or a copy of the lease agreement) should have the expiry date. If Cody doesn't have it, the NLTB office in Suva can provide it with the lease number.

**Answer from Cody:** _____________________________ (e.g., "Lease expires 2045" or "30-year lease starting 2015, expires 2045")

---

## Question 3 — WhatsApp Contact for F002 Viyasiyasi Farm Coordinator

**Priority:** HIGH
**Question:** Who is the primary contact at F002 (Viyasiyasi Farm, Kadavu Island) who should receive F002-specific alerts via WhatsApp? What is their WhatsApp number?

**Context:**
RULE-034 (F002FerryBuffer) is the most operationally critical automation rule in the system. When Kadavu island supplies are running low, an urgent WhatsApp alert must reach someone at F002 who can act on it — arrange a ferry order, contact Sea Master Shipping, or escalate to Cody.

Currently, F002 has no permanent assigned coordinator in the system (no full-time manager record). RULE-034, RULE-019 (goat weighing), RULE-020 (goat vaccination), and RULE-021 (livestock mortality) all need a F002 recipient.

**Why It Matters:**
If RULE-034 fires and the message goes only to Cody (who is in Serua, on the mainland), there is no local person on Kadavu to take immediate action. The point of the alert is to trigger immediate procurement before the ferry window closes — which requires someone with physical access to Kadavu or the ability to call Sea Master Shipping from a local context.

**What Breaks If Unknown:**
All F002 alerts will default to Cody's WhatsApp. This means:
- RULE-034 alerts reach Cody (correct) but no one on Kadavu (missing)
- RULE-019/020 (goat management) alerts go to Cody who may be far from Kadavu

**Default If Not Answered:**
All F002 alerts → Cody's WhatsApp. This works but is suboptimal for response speed on RULE-034.

**System Configuration:**
F002 coordinator WhatsApp number is stored in `farms.coordinator_whatsapp` (nullable field). Update via PATCH /farms/F002 after confirmed.

**Answer from Cody:** _____________________________ (Name + WhatsApp number for F002 coordinator)

---

## Question 4 — Sea Master Shipping (SUP-012) Ferry Schedule

**Priority:** CRITICAL
**Question:** How frequently does the Sea Master Shipping (supplier code SUP-012) ferry run between Suva and Kadavu? Is it weekly, twice weekly, or irregular? And what is the actual lead time (in days) from placing an order to receiving supplies at Viyasiyasi Farm?

**Context:**
RULE-034 (F002FerryBuffer) uses `lead_time_days` to calculate whether F002 supplies are at risk. The formula is:
```
current_stock_days_remaining < (lead_time_days + 7)  → CRITICAL alert fires
```

The `lead_time_days` default is currently set to 14 (conservative assumption: weekly ferry + 7-day buffer). If the ferry runs more frequently, this default is overly conservative (too many false alerts). If it runs less frequently or irregularly, the default is dangerously optimistic (RULE-034 won't fire early enough).

**Why It Matters:**
This is not a nice-to-have data point. Getting this wrong could mean Viyasiyasi Farm runs out of critical inputs (fertilizer, chemicals) because the system didn't alert early enough — or Cody gets bombarded with false CRITICAL alerts because the buffer is too conservative.

**What Breaks If Unknown:**
RULE-034 uses the hardcoded default of 14 days. This may be wrong. If the ferry is bi-weekly (twice per week), lead_time should be 7 days. If the ferry is fortnightly (every 2 weeks), lead_time should be 21 days.

**Default If Not Answered:**
`lead_time_days = 14` (conservative). This will over-alert rather than under-alert — safer error mode.

**How to Find This:**
- Sea Master Shipping contact information: ask Cody for the current contact number
- The ferry schedule should be available from Sea Master Shipping directly
- Viyasiyasi village residents will also know the schedule

**What the System Needs:**
- Ferry frequency (weekly / bi-weekly / fortnightly / on-demand)
- Standard lead time from Suva order to Viyasiyasi delivery (days)
- Whether the schedule is fixed or variable

**Answer from Cody:** _____________________________ (e.g., "Sea Master runs every Tuesday, lead time 5 days from order to delivery at Viyasiyasi")

---

## Question 5 — Aquaculture and Pig Modules in Phase 1

**Priority:** MEDIUM
**Question:** Should RULE-024 through RULE-028 (aquaculture and pig production rules) be built and tested in Phase 1 MVP, even though they are currently seeded as INACTIVE?

**Context:**
5 automation rules are seeded as inactive:
- RULE-024: Aquaculture TilapiaFeed (AQU-TIL)
- RULE-025: Aquaculture WaterQuality (AQU-TIL)
- RULE-026: Aquaculture HarvestReady (AQU-TIL)
- RULE-027: Pig Growth Monitoring (LIV-PIG)
- RULE-028: Pig Feeding (LIV-PIG)

These are seeded because the data exists in the v7.0 TFOS spreadsheet (rules were designed), but no aquaculture or pig production units are currently active.

**Developer Recommendation:** Do NOT build the rule execution logic in Phase 1. The rules are seeded (is_active = false) and the schema is ready. Activate in Phase 2 when:
- AQU-TIL: Tilapia pond infrastructure is confirmed at F001 or F002
- LIV-PIG: Biosecurity infrastructure (fencing, ASF testing protocol, isolation pen) is confirmed

**Why Recommendation is Phase 2:**
- ASF (African Swine Fever) is present in the Pacific region. Activating pig production without biosecurity infrastructure is a serious risk.
- Tilapia aquaculture requires pond construction — a capital investment decision not yet made.

**What Breaks If Wrong Decision:**
- If activated in Phase 1 without infrastructure: automation rules fire for non-existent livestock/ponds → false alerts → alarm fatigue
- If deferred to Phase 2 incorrectly: slight delay but no operational impact (rules are seeded and ready to activate)

**Default If Not Answered:**
Phase 2 deferral. Rules remain seeded as is_active = false. No rule execution logic built in Phase 1.

**Answer from Cody:** _____________________________ (e.g., "Confirm Phase 2 deferral" or "We have a pig pen at F002, build Phase 1")

---

## Question 6 — React Component Library Preference

**Priority:** MEDIUM
**Question:** Does Cody have a preference between shadcn/ui and Chakra UI as the React component library for the Teivaka PWA? Or should the developer choose?

**Context:**
The frontend React 18 PWA needs a component library for consistent UI elements (buttons, forms, cards, alerts, modals). Two options are strong candidates:

**Option A: shadcn/ui**
- Approach: Copy-paste components (not a runtime dependency)
- Pros: Highly customizable, lightweight, mobile-first, uses Tailwind CSS, excellent for PWA performance
- Cons: More initial setup, less pre-built components out of the box
- Best for: Custom brand feel, performance-critical PWA
- Teivaka recommendation: PREFERRED for Phase 1 MVP

**Option B: Chakra UI**
- Approach: Traditional component library (npm dependency)
- Pros: Excellent mobile support, built-in accessibility, comprehensive component set, good dark mode support
- Cons: Larger bundle size, more opinionated styling, harder to customize Teivaka brand colors
- Best for: Rapid development, less design customization needed

**Developer Recommendation:** shadcn/ui + Tailwind CSS for the TFOS PWA. Key reasons:
1. Bundle size: shadcn/ui components add ~2–5KB each vs Chakra's ~100KB+ base bundle
2. PWA performance on 3G: smaller bundle = faster first load for field workers
3. Customization: Teivaka's specific needs (farm dashboard layout, signal traffic lights, voice button) require custom components regardless of library choice — shadcn/ui makes this easier

**What Breaks If Wrong Decision:**
Neither is wrong — both produce functional UI. Changing from one to the other mid-development is a significant rework (1–2 days), so the decision should be made before frontend development begins.

**Default If Not Answered:**
shadcn/ui + Tailwind CSS (developer's recommendation).

**Answer from Cody:** _____________________________ (e.g., "Go with shadcn/ui as recommended" or "Use Chakra UI, I'm more familiar with it")

---

## Question 7 — Payment Processing for Subscription Billing

**Priority:** HIGH
**Question:** For the BASIC (FJD 49/mo) and PREMIUM (FJD 149/mo) subscription billing in Phase 2, should Teivaka use Stripe (international) or a Fiji-local payment processor?

**Context:**
When Phase 2 subscription billing is activated:
- BASIC tier: FJD 49/month (approximately USD 22/month)
- PREMIUM tier: FJD 149/month (approximately USD 67/month)
- CUSTOM tier: performance-linked (negotiated, invoiced manually)

**Option A: Stripe**
- International payment processor (stripe.com)
- Supports FJD billing natively
- Easy integration (Stripe SDK for Python)
- Strong developer documentation
- 2.9% + 30¢ transaction fee per charge
- Requires Teivaka to register a Stripe account with a valid business registration (Teivaka PTE LTD — Company No. 2025RC001894)
- Payout to Fiji bank account: supported via Stripe Payouts

**Option B: Local Fiji Payment Processor (BSP PayWay or ANZ eBanking)**
- Bank of South Pacific (BSP) and ANZ both have merchant processing services in Fiji
- May be required if Fiji Revenue & Customs Authority (FRCA) has specific requirements for digital service billing in FJD
- More complex integration, less developer-friendly
- Possible lower fees for domestic FJD transactions
- Contact: BSP Business Banking or ANZ Business Banking in Fiji

**Developer Recommendation:** Stripe for Phase 2. Reasons:
1. Developer simplicity: Stripe's integration takes 1–2 days vs 1–2 weeks for local processor
2. International readiness: Phase 3 Pacific expansion requires international billing
3. FJD is supported by Stripe
4. No indication that FRCA requires local processor for SaaS billing

**Regulatory Check Required:**
Confirm with Teivaka's accountant or FRCA if there is a requirement to use a Fiji-registered payment processor for FJD SaaS subscriptions. This is a legal question, not a technical one.

**Default If Not Answered:**
Stripe (developer recommendation). Phase 2 billing deferred from Phase 1 MVP regardless.

**Answer from Cody:** _____________________________ (e.g., "Use Stripe" or "Check with our accountant first, defer decision")

---

## Question 8 — Embedding Model for TIS Knowledge Base RAG

**Priority:** MEDIUM
**Question:** Should the TIS Knowledge Base RAG system use `text-embedding-3-small` (OpenAI, cheaper, faster) or `text-embedding-3-large` (OpenAI, more accurate, 5× more expensive) for generating KB article embeddings?

**Context:**
The TIS Knowledge Broker uses vector similarity search (pgvector) to find relevant KB articles for farmer questions. The embedding model determines how accurately the search finds relevant articles.

**Option A: text-embedding-3-small**
- Dimensions: 1,536
- Cost: $0.02 per 1 million tokens
- Speed: ~200–400ms per embedding generation
- Accuracy: Very good for domain-specific content (farm protocols in Fiji)
- Phase 1 cost estimate: ~$0.05 to embed all 49 initial articles (negligible)
- Phase 2 cost estimate: ~$1.00 to embed 419 articles (negligible)

**Option B: text-embedding-3-large**
- Dimensions: 3,072
- Cost: $0.13 per 1 million tokens (6.5× more expensive than small)
- Speed: ~400–800ms per embedding
- Accuracy: Marginally better for complex queries, noticeable improvement for multi-topic queries
- Phase 1 cost estimate: ~$0.30 (still negligible)
- Phase 2 cost estimate: ~$6.50 for 419 articles (still low)

**Developer Recommendation:** text-embedding-3-small for Phase 1 and Phase 2.

The difference in accuracy between small and large models is meaningful for general-purpose text search but marginal for specialized domain content (Fiji agriculture protocols are narrow in topic). The cosine similarity threshold (0.65) is more important to tune than the model choice. Upgrade to large model in Phase 3 if KB quality feedback shows systematic misses.

**pgvector index implication:**
- 1,536-dim vectors: `vector(1536)` type, ivfflat index with lists=100 — performs well to Phase 2
- 3,072-dim vectors: `vector(3072)` type, ivfflat with lists=100 — also works but index slightly larger

Changing model mid-deployment requires re-embedding ALL existing articles (because vectors from different models are not comparable). This is a 1-hour migration task — not a major problem, but worth doing it right from the start.

**Default If Not Answered:**
`text-embedding-3-small` (developer recommendation).

**Answer from Cody:** _____________________________ (e.g., "Use small model as recommended")

---

## Question 9 — Stripe Account Setup

**Priority:** MEDIUM
**Question:** Does Teivaka PTE LTD already have a Stripe account? If yes, who can provide the API keys? If no, who will create the Stripe account before Phase 2 billing launch?

**Context:**
Stripe requires:
1. A registered Stripe account linked to Teivaka PTE LTD (Company No. 2025RC001894)
2. Business verification (company registration documents)
3. Fiji bank account for payouts (BSP or ANZ recommended)
4. Secret key and publishable key for API integration

**Development vs Production:**
- Development: Use Stripe test mode (test keys provided with any free Stripe account — no real money moves)
- Production: Requires a verified Stripe business account

**What Breaks If Not Set Up:**
Phase 1 MVP does not require Stripe — manual invoicing is acceptable for Phase 1. Phase 2 BASIC and PREMIUM subscription tiers cannot be self-service activated without Stripe. New farm onboarding in Phase 2 will require Stripe.

**Timeline:**
Stripe account verification typically takes 1–3 business days after submitting documents. Should be started 2 weeks before Phase 2 billing launch.

**Action Required:**
1. Register at stripe.com with Teivaka business email
2. Submit verification documents (company registration, director ID)
3. Add Fiji bank account for payouts
4. Share Stripe API keys with developer (via secure channel, not WhatsApp text)

**Default If Not Answered:**
No Stripe in Phase 1 (correct default). Manual invoicing for Phase 1 farms. Reminder set for Phase 2.

**Answer from Cody:** _____________________________ (e.g., "No Stripe account yet, I'll create one before Phase 2" or "Yes, I have one, here are the keys")

---

## Question 10 — Expert Validation Partner for KB Content

**Priority:** ~~HIGH~~ → **MEDIUM** *(downgraded — no longer a Day 1 blocker)*
**Question:** Which agricultural institution in Fiji will be Teivaka's primary expert validator for Knowledge Base crop protocol articles? Who is the specific contact?

**Status Update (April 2026):**
The architecture of TIS has been updated to use the **Grounded Intelligence model** (see `03_backend/TIS_GROUNDED_INTELLIGENCE.md`). TIS no longer returns NOT_FOUND when no validated KB article exists. Instead, it answers from the **Fiji Agricultural Intelligence layer** (`09_knowledge_base/FIJI_FARM_INTELLIGENCE.md`) — a comprehensive, Fiji-specific knowledge base covering all 6 active crops, local pest management, locally available chemicals, FJD market prices, and farm-specific context for F001 and F002.

**This means:**
- TIS is fully functional at MVP launch with zero validated KB articles
- The KB validation question is now about quality improvement, not survival
- Every unanswered query is automatically logged to `shared.kb_article_candidates` — when you engage a validator, show them `GET /api/v1/knowledge/candidates` sorted by query_count to know exactly which articles to write first

**What Still Needs An Answer (but no longer blocks MVP):**
A validation partner is still valuable for Phase 2 — validated articles elevate TIS answers from "Fiji agricultural practice" to "Teivaka Validated Protocol," which builds long-term credibility with commercial farmers and enterprise clients. It's also required before Teivaka can market TIS as an expert-validated system.

**Options (unchanged — still valid for Phase 2):**

**Option A: Fiji Ministry of Agriculture (MoA)**
- Best for: Long-term partnership, government credibility, organic certification pathway

**Option B: SPC — Pacific Community (Noumea)**
- Best for: Indigenous Pacific crops (CRP-KAV, CRP-DAL, CRP-ROU, CRP-DUR, CRP-OTA)

**Option C: University of the South Pacific (USP)**
- Best for: Pest/disease science backing; research-grade citations

**Option D: Independent Agronomist Consultant**
- Best for: Fast, pragmatic validation; cheapest path to published=true articles

**Updated Recommendation:** No urgency for MVP. In Phase 2, engage Option D (independent agronomist) to validate the top 10 most-asked questions from `kb_article_candidates`. Then formalize with Option A (Fiji MoA) for ongoing validation. The KB builds from real farmer questions — not from guessing what to write.

**What Breaks If Never Resolved:**
Nothing breaks operationally. TIS continues to answer from Fiji Intelligence. What you lose: the "Teivaka Validated Protocol" authority label on answers, and the ability to market TIS as expert-validated to enterprise clients.

**Answer from Cody:** _____________________________ (e.g., "Will engage a consultant in Phase 2 — using Fiji Intelligence layer for MVP")

---

## Question 11 — Community Platform Architecture

**Priority:** MEDIUM
**Question:** Should the Community platform (Phase 2 marketplace, forum, buyer directory, price index) be built as part of the same FastAPI application (monolith) or as a separate service?

**Context:**
Community is a different product from TFOS:
- Different user types: buyers, suppliers, NGOs, government (not just farm operators)
- Different scaling profile: Community may get higher read traffic than TFOS (price index queries)
- Potential revenue sharing with third-party contributors (buyer directory listings)
- May eventually need separate compliance (different data privacy requirements for public marketplace)

**Option A: Same FastAPI Application (Monolith — recommended for Phase 2)**
- Community is a new module within the existing FastAPI app
- New routers: `/community/marketplace`, `/community/forum`, `/community/price-index`
- Shared database (PostgreSQL) with separate Community tables
- Shared auth system (users can be both farm operators and community members)
- Simpler to build, maintain, and debug
- Architecture.md already recommends this

**Option B: Separate FastAPI Service**
- Separate GitHub repository
- Separate Docker container
- Separate database (or shared PostgreSQL with logical separation)
- Internal API calls between TFOS and Community for price data
- More complex but allows independent scaling and deployment

**Developer Recommendation:** Same FastAPI application for Phase 2. The complexity of microservices is not justified until Phase 4 (when Community scales independently). See ADR-004 in SCALING_PLAN.md.

**What Breaks If Wrong Decision:**
Neither is wrong for Phase 2. If Community starts as a separate service and later needs to merge back into the monolith (or vice versa), that is 1–2 weeks of refactoring.

**Default If Not Answered:**
Monolith (same FastAPI app, new module) as per developer recommendation and ARCHITECTURE.md.

**Answer from Cody:** _____________________________ (e.g., "Monolith is fine for now, confirm ARCHITECTURE.md recommendation")

---

## Question 12 — Privacy Policy and Terms of Service

**Priority:** HIGH
**Question:** Does Teivaka have a Privacy Policy and Terms of Service? Who is drafting these documents, and when will they be ready for review?

**Context:**
A Privacy Policy and Terms of Service are legal requirements before any Phase 2 public launch (when Teivaka accepts paid subscriptions from the public). They must cover:

**Privacy Policy must address:**
- What personal data is collected (name, contact, farm location, income data)
- How AI processing works (Claude API processes farm query data — does any data stay with Anthropic?)
- Data storage location (Hetzner Nuremberg, Germany — GDPR territory even for Fiji users)
- Data retention policy
- User rights (right to export data, right to deletion)
- Third-party data sharing (Twilio for WhatsApp, Supabase for file storage, OpenAI for Whisper/embeddings)

**Terms of Service must address:**
- Subscription terms (billing cycle, cancellation, refund policy)
- Limitation of liability for crop recommendations (TIS KB is educational, not a guarantee of yield)
- Data ownership (farmers own their farm data — Teivaka cannot sell or share it)
- Acceptable use policy

**Regulatory Context:**
- Fiji does not yet have comprehensive data protection legislation (as of 2026), but farmers still have reasonable privacy expectations
- If Teivaka expands to Vanuatu, Samoa, or internationally, GDPR or local privacy laws may apply
- The processing of farm data through Claude API (hosted in US/EU) may have cross-border data transfer implications under future Pacific privacy frameworks

**What Breaks If Unknown:**
- Phase 2 public launch cannot occur without a published Privacy Policy
- App store distribution (if mobile app is built) requires Privacy Policy URL in app metadata
- Enterprise clients will ask for Privacy Policy and DPA (Data Processing Agreement) before signing
- This is a BLOCKING requirement for Phase 2 launch

**Recommended Action:**
1. Engage a Fiji-based lawyer with technology/IP experience (or an international SaaS-focused firm with Pacific experience)
2. Draft Privacy Policy and Terms using a SaaS-specific template (iubenda.com or Termly.io have good starting points)
3. Have lawyer review and customize for Fiji law
4. Host at `teivaka.com/privacy` and `teivaka.com/terms`

**Default If Not Answered:**
Phase 1 (internal Teivaka use only) does not require published Privacy Policy. Phase 2 public launch is BLOCKED until this is resolved.

**Answer from Cody:** _____________________________ (e.g., "Working with a lawyer — ETA [month]" or "Need a referral to a Fiji tech lawyer")

---

## Question 13 — Fijian Language Localization Scope for Phase 1

**Priority:** MEDIUM
**Question:** For Phase 1 MVP, which parts of the Teivaka UI and TIS responses should use Fijian (iTaukei) language, and which should be in English?

**Context:**
Fiji's primary agricultural workforce includes:
- iTaukei (indigenous Fijian) workers — primary language is Fijian (iTaukei), most also speak English
- Indo-Fijian workers — primary language is Fiji Hindi, most also speak English
- Cody and management team — fully bilingual (English and Fijian)

**Current design (already specified in TIS_SPECIFICATION.md):**
TIS voice and chat responses use mixed Fijian-English — warm sign-offs like "Vinaka, Laisenia!" and brief confirmations like "Io, done." This is already planned and requires no additional work.

**What Is NOT Decided:**
- Whether the full UI (menus, labels, error messages, dashboard) should have Fijian translation
- Whether WhatsApp alert messages should be in Fijian, English, or mixed
- Whether voice command recognition should support Fijian-language commands (e.g., "Loga ni kena vunau..." instead of "Log harvest...")

**Options:**

**Option A (Recommended): English UI + mixed Fijian-English TIS responses (current default)**
- All UI labels, menus, navigation: English
- TIS responses: mixed Fijian-English warm tone
- WhatsApp alerts: English with Fijian sign-offs ("Vinaka!" at the end)
- Voice commands: English (Whisper handles this well)
- Rationale: Phase 1 is internal Teivaka use — Cody and field workers are bilingual. Full iTaukei localization is a Phase 2 feature for when the platform reaches less-bilingual farming communities.

**Option B: Key alert phrases translated to Fijian**
- Critical alert subject lines in Fijian (e.g., "Vakatokai — Oqo e na gadreva me vakarorogo!" for "CRITICAL ALERT")
- Only top-level alert headlines, not full message body
- Small effort, meaningful for non-English-dominant workers

**Option C: Full iTaukei localization in Phase 1**
- All UI, alerts, and TIS in Fijian
- Requires translation of 200+ UI strings
- Requires hiring a native iTaukei speaker who is also technically literate
- High effort, would delay MVP by 3–4 weeks

**Developer Recommendation:** Option A for Phase 1 (English UI + warm Fijian-English TIS tone). Phase 2 can add full localization if user research shows it's needed.

**Default If Not Answered:**
Option A (English UI + mixed TIS responses). This is already the specified behavior.

**Answer from Cody:** _____________________________ (e.g., "English UI is fine for Phase 1, agree with recommendation")

---

## Question 14 — Access to TFOS v7.0 Google Sheets

**Priority:** HIGH
**Question:** Who has access to the TFOS v7.0 Google Sheets workbook, and can the developer be granted VIEW access for running the migration scripts?

**Context:**
The Teivaka TFOS v7.0 workbook is a 103-sheet Google Sheets document that is the source of truth for:
- All 49 productions with their metadata
- All 1,444 rotation rules (shared.actionable_rules)
- All 43 automation rules
- Worker data (11 workers)
- Customer data (16 customers, excluding deduplicated CUS-016)
- Farm and production unit configuration
- Active cycle data (7 cycles)

The migration scripts in `05_data_migration/migration_scripts/` (`extract_shared_data.py`, `extract_tenant_data.py`) read directly from this Google Sheets workbook via the Google Sheets API, using the spreadsheet_id and service account credentials.

**What Is Needed:**
1. The spreadsheet ID (the long string in the Google Sheets URL after `/d/`)
2. VIEW access granted to the developer's Google account (or a service account for automated access)
3. The correct sheet tab names (if they differ from what is expected in the migration scripts)

**Why This Is Required:**
Without access to the v7.0 spreadsheet, the migration scripts cannot extract data. Without running the migration scripts, the database cannot be seeded. Without a seeded database, nothing works.

**What the Developer Will Do With Access:**
- READ ONLY (VIEW access) — no changes will be made to the spreadsheet
- Run extraction scripts once (or twice if there are corrections needed)
- Verify data against validation queries (Step 8 of DEPLOYMENT_GUIDE.md)

**What Breaks If Not Provided:**
Migration cannot run. Database is empty. Validation queries return 0 rows. MVP cannot proceed.

**Action Required:**
1. Cody shares the TFOS v7.0 Google Sheets with developer's Gmail: [developer to provide their Gmail address to Cody]
2. Set to "Viewer" permission (not Editor)
3. Confirm sheet tab names have not changed since the migration scripts were written

**Answer from Cody:** _____________________________ (e.g., "Shared — check your Gmail" + confirmation of sheet structure)

---

## Question 15 — Hetzner Account and Server Provisioning

**Priority:** MEDIUM
**Question:** Does Cody have an existing Hetzner Cloud account? If yes, can the developer be granted project access or SSH key addition? If no, Cody needs to create an account at hetzner.com before production deployment.

**Context:**
The production server (Hetzner CAX21, ARM64, Ubuntu 24.04, Nuremberg) is the deployment target for the entire TFOS stack. Deployment requires either:
- Direct server access (SSH key added to the server)
- Hetzner Cloud Console access (to view server status, create volumes, check billing)

**What Is Needed:**
1. Hetzner account created at console.hetzner.cloud (if not already existing)
2. Server CAX21 provisioned (or confirm it is already running)
3. Developer's SSH public key added to the server's authorized_keys
4. Hetzner Volume (80GB) created and attached for postgres_data storage

**If Cody Already Has a Hetzner Account:**
- Add developer's SSH public key via Hetzner Console (Security → SSH Keys → Add) OR directly to the server via `~/.ssh/authorized_keys`
- Share server IP address with developer for deployment

**If Cody Does Not Have a Hetzner Account:**
- Register at hetzner.com (takes 5 minutes, credit card required, no minimum spend)
- Create project: "Teivaka Production"
- Provision CAX21 server (see DEPLOYMENT_GUIDE.md Step 1.1 for exact settings)
- Cost: €7.49/mo for server + €3.84/mo for 80GB volume = ~€11/mo

**Security Note:**
The developer should only have SSH access, not the Hetzner Console account credentials (username/password). Adding an SSH key is the secure way to grant server access without sharing account credentials.

**Default If Not Answered:**
Deployment cannot proceed without server access. Phase 1 MVP deployment is BLOCKED until resolved.

**Answer from Cody:** _____________________________ (e.g., "Yes, I have Hetzner account, here's the server IP, adding your SSH key now" or "No Hetzner account yet, creating today")

---

## Summary Tracking Table

| # | Question | Priority | Status | Answer Date |
|---|---------|----------|--------|------------|
| 1 | F001 Profit Share Rate with Nayans | CRITICAL | OPEN | |
| 2 | F001 iTaukei Lease Expiry Year | HIGH | OPEN | |
| 3 | F002 Farm Coordinator WhatsApp | HIGH | OPEN | |
| 4 | Sea Master Ferry Schedule (SUP-012) | CRITICAL | OPEN | |
| 5 | Aquaculture/Pig Modules Phase 1? | MEDIUM | OPEN | |
| 6 | React Component Library | MEDIUM | OPEN | |
| 7 | Payment Processor (Stripe vs Local) | HIGH | OPEN | |
| 8 | Embedding Model (small vs large) | MEDIUM | OPEN | |
| 9 | Stripe Account Setup | MEDIUM | OPEN | |
| 10 | KB Expert Validation Partner | ~~HIGH~~ MEDIUM | OPEN (non-blocking) | |
| 11 | Community Platform Architecture | MEDIUM | OPEN | |
| 12 | Privacy Policy and Terms of Service | HIGH | OPEN | |
| 13 | Fijian Language Localization Scope | MEDIUM | OPEN | |
| 14 | TFOS v7.0 Google Sheets Access | HIGH | OPEN | |
| 15 | Hetzner Account and Server Access | MEDIUM | OPEN | |

**CRITICAL items (1, 4): Developer will use safe defaults but BLOCKING features will not function until resolved.**
**HIGH items (2, 3, 7, 12, 14): Implementation proceeds with stated assumptions — rework risk if assumptions are wrong.**
**MEDIUM items (5, 6, 8, 9, 10, 11, 13, 15): Developer recommendation applied — low rework risk.**
**Note: Item 10 (KB Validation) downgraded from HIGH to MEDIUM — TIS Grounded Intelligence model removes the Day 1 dependency on validated articles. See 03_backend/TIS_GROUNDED_INTELLIGENCE.md.**

---

*Update this table as Cody provides answers. Mark Status as ANSWERED and record Answer Date.*

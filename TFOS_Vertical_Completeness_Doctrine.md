# TFOS VERTICAL COMPLETENESS DOCTRINE

**Document type:** Canonical (binding architecture/blueprint)
**Status:** Active
**Authority:** Uraia Koroi Kama (Cody), Founder, Teivaka PTE LTD
**Date locked:** 2026-05-01
**Authored:** Architect (Cowork chat) at Operator direction

---

## Changelog

- **2026-05-01 (v1.0):** Initial lock. Doctrine articulated by Operator at hour 12 of Sprint 6 lead-in, after Sprint 5 closed and the question "now we populate events for all groups" was reframed by the Operator as "complete vertical depth, not horizontal breadth." Architect drafted; Operator approved.

---

## 1. THE LOAD-BEARING PRINCIPLE

> **When a farmer signs up to TFOS for their domain, they must never find a gap. They must never feel TFOS is missing the basics of their operation. They must never feel they need a side notebook for anything important. They must feel TFOS was built for them.**

This is the standard. It is the bar that every group, every event, every form, every screen, every workflow in TFOS must clear before it ships to the farmer.

**Anything less is a trust violation, not a missing feature.**

---

## 2. WHY THIS IS THE LOAD-BEARING PRINCIPLE

### 2.1 The Pacific reality

Pacific Island smallholder farmers have been promised technology adoption their whole working lives. NGOs, donor projects, government extension officers, well-funded agtech startups — every one of them handed Pacific farmers half-built systems missing the obvious things. **Ministry workshops where the app didn't have a field for the most common crop variety. Donor pilots where the form refused to log a payment in M-PAiSA. SaaS tools that assumed broadband.** Every gap erodes a generation's worth of trust.

The Pacific farmer's default expectation, learned from experience, is: *technology is not for me. It will not understand my farm.*

**TFOS exists to break that expectation. The only way it breaks is by clearing the bar completely. There is no half-clearing.**

### 2.2 The audit chain and the moat depend on it

The TFOS economic moat is the audit-chained event stream that turns a farmer's daily logging into bank-grade evidence. That evidence is only valuable if it represents a **complete operational picture**.

A poultry farmer's bank evidence PDF that shows egg sales but no vaccinations, or feed deliveries but no mortality, is not bank-grade — it is a partial record that a credit officer will discount or reject. **Vertical incompleteness destroys the financial value of the data, not just the user experience.**

Bankability requires completeness. Completeness requires this doctrine.

### 2.3 The horizontal-vs-vertical trap

Sprint 5 shipped the 11-group taxonomy infrastructure (horizontal coverage). It is tempting — and a weak agent's default move — to follow this with a sprint that adds 5-10 events to each group as "sample coverage" for all 11 in parallel.

**That trap ships a system that supports nothing properly while appearing to support everything.** A poultry farmer signing up after such a sprint sees Poultry in (+), taps it, finds eggs and mortality but no vaccinations, no feed tracking, no biosecurity, no compliance integration — and abandons. The horizontal breadth was a feature mirage.

**This doctrine binds TFOS to vertical completeness first, horizontal breadth second.**

---

## 3. THE BINDING RULE

When TFOS builds support for a group (Poultry, Crops, Livestock, Aquaculture, Forestry, Apiculture, Perennials, Specialty, etc.), the build is not "complete" until a real farmer in that domain can:

1. **Log every event they would log in their physical notebook today**, without finding a missing event type
2. **Run their entire operational year** through TFOS without needing a parallel system, spreadsheet, or paper record for any operational activity
3. **Generate a Bank Evidence PDF** from TFOS data that a Pacific lender accepts as a complete operational record for the period
4. **Recognize the language** TFOS uses for their domain as the language a peer farmer in their region would actually use, not jargon translated from a textbook
5. **Find the controlled vocabularies** (vaccines, fertilizers, breeds, varieties, suppliers, buyers, certifications) populated with the inputs they actually buy and use
6. **Complete the daily, weekly, monthly, and seasonal workflows** without hitting a "Coming soon" or a workaround
7. **Surface their compliance records** (regulatory permits, certification audits, inspection logs) with the same rigor as their production records
8. **Operate offline** for the full duration of a 3G dropout in their region without losing data or being blocked from logging

**A group that fails any one of these eight tests is not shipped. It is in progress.**

---

## 4. THE COMPLETENESS CRITERIA — THE EIGHT GATES

Every group passes these eight gates before being declared shipped. The Operator (Founder, Cody) is the final arbiter of pass/fail per gate.

### Gate 1 — Event Taxonomy Completeness

The event types defined for the group cover every operational activity a farmer in that domain would record. Validated against:
- **A real farmer's actual notebook** for that domain (Pacific region preferred)
- **The Foundation xlsx schema** where applicable
- **Government regulatory requirements** (Ministry of Agriculture, MAQS, Customs) for that domain
- **Common-sense audit:** "What would a poultry farmer log this week?" answered by an actual poultry farmer, not by us guessing

Output: `shared.event_type_catalog` rows for the group, exhaustive for the domain.

### Gate 2 — Vocabulary Completeness

Every event type, every form field, every status, every dropdown option in the group flows through `shared.naming_dictionary` and reads in farmer-English at Year 6 reading level. Validated against:
- The Universal Naming Doctrine (Section 4 of MBI / `TFOS_Universal_Naming_Doctrine.md`)
- The "would the farmer say this?" test against a Pacific farmer in the relevant domain
- Cross-surface consistency: the same concept renders identically in (+), forms, reports, audit logs, voice TTS, WhatsApp alerts, and Bank Evidence PDFs

Output: `shared.naming_dictionary` rows complete for the group's full surface area.

### Gate 3 — Form Coverage

Every event type in the group has a form that:
- Honors the Universal Event Form Contract (Section 4a.4 of MBI)
- Carries the four anchors (Farm + Block + Crop/Production + Operator) or explicitly opts out via toggle
- Validates client-side (Zod) and server-side (Pydantic) with identical schemas
- Emits exactly one `audit.events` row with hash chain on success
- Renders in farmer-English from naming dictionary
- Works offline-first (IndexedDB queue + Workbox retry)
- Shows audit hash badge on success toast
- Honors backdating windows per `shared.event_type_catalog`

Output: form components shipped for every event type, no "Coming soon" placeholders.

### Gate 4 — Controlled Vocabulary Library Completeness AND Extensibility (v1.1, 2026-05-01)

Domain-specific controlled vocabularies (vaccine library, breed library, feed library, variety library, fertilizer library, certification library, supplier library, buyer library, etc.) ship with two binding properties:

**Property 1 — Operator-curated initial completeness.** Each library is populated with the inputs Pacific farmers in that domain actually buy and use, validated by the Operator (or domain validation reference). Initial Operator-seeded rows are visible to every farmer in that domain as global defaults. Controlled-vocabulary dropdowns are never empty when a farmer enters a form.

**Property 2 — Farmer-extensible at runtime.** Every library accepts farmer additions via two UI surfaces:
1. **In-form `+ Add new`** at the moment of need (zero context switch)
2. **Dedicated settings page** for bulk management (review additions, edit typos, soft-deactivate unused entries)

**Visibility rules (binding):**
- Operator-seeded global rows (`tenant_id IS NULL`) visible to all farmers
- Farmer additions (`tenant_id = farm's tenant`) visible only within that farm
- No farmer sees another farmer's private additions
- Operator (FOUNDER role) sees all rows for curation purposes

**Mutation rules (binding):**
- Soft-delete only — `is_active = false`, never hard-delete (audit chain integrity)
- DELETE blocked at RLS layer; UPDATE is_active=false is the only deactivation path
- Every library mutation emits an audit event (`LIBRARY_ROW_ADDED`, `LIBRARY_ROW_DEACTIVATED`, `LIBRARY_ROW_REACTIVATED`)
- Library mutations carry the four-anchor minimum (Farm + Operator); Block + Crop optional per mutation type

**Schema pattern (binding):**
Single polymorphic `shared.farm_libraries` table with `library_type` enum scaling across all 11 groups. No per-group separate library tables. FK to `tenant.tenants(tenant_id)`. Cross-group reuse begins here.

Examples per group:
- **Poultry:** vaccines (Newcastle, IBD, Marek's, Pox), feed grades (starter/grower/layer/finisher), breeds (ISA Brown, Hyline, Cobb 500, Ross 308), suppliers (Crest Chicken, Punja, Goodman Fielder, Bayer), buyers (supermarket, restaurant, market, family)
- **Crops:** varieties (Marshall talanoa cassava, Hawaiian Sunshine taro), fertilizers (NPK 12-12-17, urea), chemicals (already in `shared.chemical_library`)
- **Livestock:** breeds (Boer goat, Brahman cross), vaccines, dewormers, mineral supplements
- **Aquaculture:** species (tilapia, prawn, milkfish), feed grades, water treatments
- **Apiculture:** queen sources, mite treatments, foundation suppliers

Output: library tables populated with Operator-seeded globals; farmer-extensible CRUD UI live; audit chain wired; soft-delete plumbing complete; never an empty dropdown.

### Gate 5 — Reports + Read-Only Dashboards

The group has the reports and read-only dashboards a farmer in that domain expects to see. Per the binding "pages render, forms write" rule (MBI Inviolable #15).

Examples per group:
- **Poultry:** daily egg production rate, FCR (feed conversion ratio), mortality trend, vaccination calendar, flock-level production summary
- **Crops:** harvest by cycle, yield per block per crop, chemical compliance status, days-to-harvest forecast
- **Livestock:** weight trend per animal, breeding calendar, mortality + cause analysis, vaccination compliance
- **Aquaculture:** stocking density, growth rate, feed efficiency, water quality history

Output: per-group dashboard pages live, derived from event stream, no manual entry.

### Gate 6 — Compliance Integration

The group's regulatory compliance records (permits, certifications, inspections, registers) are first-class citizens in TFOS. Compliance documents are generated as PDFs and surfaced on `/farm/compliance`.

Examples per group:
- **Poultry:** MAQS poultry permit, biosecurity certification, vaccination register PDF
- **Crops:** chemical compliance dual-layer (already binding), organic certification audit trail
- **Livestock:** animal movement permits (MAQS), brand registration
- **Aquaculture:** Fisheries Department permit, water quality compliance
- **Forestry:** harvest permit, replanting compliance, sandalwood export permit

Output: per-group compliance documents generatable on demand from event stream.

### Gate 7 — Bank Evidence Integration

The Bank Evidence PDF dispatcher (Phase 6 + Phase 9) renders a complete operational record for any month for any group. The PDF must show:
- Production volume + quality
- Sales + revenue
- Inputs + costs (gross margin derivable)
- Compliance status
- Audit hash chain integrity proof

Output: monthly Bank Evidence PDF generates correctly for the group with no missing sections.

### Gate 8 — Solo Voice Compatibility

The group's primary daily events (the events a farmer logs every day or every week) are compatible with Solo voice TTS auto-play and ≤5 words read per action.

Examples per group:
- **Poultry:** "Eggs collected today" → farmer says number → done
- **Crops:** "How many kilograms today" → farmer says number → done
- **Livestock:** "Weight check, which animal" → farmer picks → "How many kilograms" → done

Output: Solo voice flow tested live for the group's top 3-5 events.

---

## 5. THE SHIP-NO-SHIP DECISION

A group is **shipped to farmers** only when all eight gates pass. Until all eight pass, the group is **in progress** and the Operator may choose to:

- **Hide the group entirely** from new farms (toggled-off-by-default in `farm_active_groups` for new sign-ups)
- **Show the group as a tile in (+) Level 1** with explicit "Coming soon — events arriving" copy (current Sprint 5 state)
- **Show the group as a tile with partial events** marked as "Beta — tell us what's missing" with a feedback channel

**Whichever choice the Operator makes for in-progress groups, the choice is documented in this doctrine's Section 8 (Group Status Register) and reviewed at every sprint boundary.**

The Operator does not declare a group shipped because "we ran out of time this sprint" or "events are good enough to start." **The bar is met or it is not.**

---

## 6. PHASING — HOW VERTICAL COMPLETENESS GETS BUILT

A complete group build is genuinely 4-6 weeks of focused work for a domain like poultry, and 6-12 months across all 11 groups. To ship visible progress while honoring the doctrine, each group's build is phased into nine internal phases:

### Phase X.0 — Taxonomy Lock
Operator + Architect produce a locked event taxonomy doc for the group. Validated against a real Pacific farmer in that domain (mandatory). Locked, signed off, no further changes during build except by explicit Operator directive.

**Time: 1-3 days. Deliverable: `TFOS_<Group>_Taxonomy.md` canonical doc.**

### Phase X.1 — Schema
Migrations land for: event_type_catalog rows, naming_dictionary rows, controlled-vocabulary library tables, audit.events CHECK constraint expansion, any group-specific tables.

**Time: 1-2 days. Deliverable: migrations + verified schema.**

### Phase X.2 — Form Scaffold (one canonical form, end-to-end)
The most-frequent event for the group (e.g., `EGGS_COLLECTED` for poultry, `HARVEST_LOGGED` for crops) ships as the canonical form. All subsequent forms in the group follow this scaffold. Pattern is proved with audit chain integrity end-to-end.

**Time: 2-3 days. Deliverable: one form live, audit chain verified.**

### Phase X.3 — Health/Lifecycle Forms
Forms for vaccinations, mortality, treatments, lifecycle transitions.

**Time: 4-6 days.**

### Phase X.4 — Production/Operations Forms
Forms for daily production logging (feed, weight, water, observations).

**Time: 3-5 days.**

### Phase X.5 — Sales/Inputs Forms
Forms for sales, deliveries, input receipts, financial flows.

**Time: 4-6 days.**

### Phase X.6 — Reports + Dashboards
Read-only dashboards and reports per Gate 5.

**Time: 3-5 days.**

### Phase X.7 — Compliance Integration
Permit/certification documents per Gate 6 + Bank Evidence integration per Gate 7.

**Time: 3-5 days.**

### Phase X.8 — Solo Voice + F002 Kadavu Test
Voice flow per Gate 8 + smoke test against F002 Kadavu reference user (or analog).

**Time: 2-3 days.**

**Total per group: ~22-35 working days.** Across 11 groups: ~50-77 working weeks for vertical completeness across the entire platform. **This is the honest number.**

---

## 7. CROSS-GROUP REUSE

Where a build pattern proves out in one group, it is reused — not rewritten — in subsequent groups:

- The form scaffold (Phase X.2 deliverable) becomes a template for all subsequent forms across all subsequent groups
- The controlled-vocabulary library pattern (vaccine library, breed library, etc.) becomes a template
- The compliance document generation pattern becomes a template
- The Bank Evidence integration pattern becomes a template

**This is what makes the second group cheaper than the first, and the eleventh group cheaper than the second.** Estimated cross-group reuse savings: ~30-40% per subsequent group after the first vertical ships.

Honest reuse-adjusted estimate for all 11 groups: **~6-9 calendar months of focused build at sustained pace.**

---

## 8. GROUP STATUS REGISTER

This register is updated at every sprint boundary. The Operator confirms or updates the status of each group.

| Group | Status | In-progress display | Sprint shipped | Notes |
|---|---|---|---|---|
| **CROPS** | Partial | Tile + existing events | Phase 4.2 (cycle/harvest), Sprint 5.10f (vocabulary) | Gates 1, 2 partial; Gates 3-8 incomplete |
| **PERENNIALS** | In progress (taxonomy not locked) | Tile + "Coming soon" empty Level 2 | Sprint 5 (group taxonomy) | Awaiting Phase X.0 lock |
| **LIVESTOCK** | Partial | Tile + 6 events | Migration 040 | Forms missing; Gates 3-8 incomplete |
| **POULTRY** | In progress (Sprint 6 starting) | Tile + "Coming soon" empty Level 2 | Sprint 5 (group taxonomy) | First group to ship vertical-complete; Phase X.0 in progress |
| **APICULTURE** | Partial | Tile + 1 event (HIVE_INSPECTION) | Pre-Sprint 5 | Forms missing; Gates 3-8 incomplete |
| **AQUACULTURE** | In progress (taxonomy not locked) | Tile + "Coming soon" empty Level 2 | Sprint 5 (group taxonomy) | Awaiting Phase X.0 lock |
| **FORESTRY** | In progress (taxonomy not locked) | Tile + "Coming soon" empty Level 2 | Sprint 5 (group taxonomy) | Awaiting Phase X.0 lock |
| **SPECIALTY** | In progress (taxonomy not locked) | Tile + "Coming soon" empty Level 2 | Sprint 5 (group taxonomy) | Awaiting Phase X.0 lock |
| **MONEY** | Partial | Tile + cash ledger live | Phase P-Doctrine-2 | Forms partial; Gates 5-7 incomplete |
| **NOTES** | Partial | Tile + basic notes | Pre-Sprint 5 | Gate 1 likely complete; rest incomplete |
| **OTHER** | Partial | Tile + 9 events | Pre-Sprint 5 | Likely never to ship "complete" — by definition catch-all |

**No group currently passes all eight gates. POULTRY is the first group targeted for full vertical completeness in Sprint 6.**

---

## 9. THE OPERATOR'S COMMITMENTS

By locking this doctrine, the Operator commits to:

1. **Recruiting one real Pacific farmer per group** as the validation reference for Phase X.0 taxonomy lock. Without a real farmer's input, no group's taxonomy is locked.
2. **Reviewing each gate personally** before declaring a group shipped. The eight gates are not a self-assessment by the build team.
3. **Accepting the honest timeline.** Vertical completeness across all 11 groups is 6-9 months of focused work post-reuse savings. The Operator does not pressure the build team to short-circuit gates for sprint speed.
4. **Funding the in-progress display.** While groups are in progress, they show as "Coming soon" tiles or are toggled off by default. The Operator accepts this user-visible signal of incompleteness as honest.

---

## 10. THE ARCHITECT'S COMMITMENTS

By locking this doctrine, the Architect (Cowork chat AI) commits to:

1. **Never sizing a group's build at less than the eight-gate reality.** Past sizing errors (e.g., "Sprint 6 = 2-3 days") are forbidden. Honest estimates only.
2. **Refusing to author a Migration that adds events without forms.** The Operator may override, but the default is: events ship with their forms.
3. **Refusing to declare a group shipped if any of the eight gates is unmet.** The Operator may override with explicit acknowledgment, but the default is: incomplete = not shipped.
4. **Updating the Group Status Register** at every sprint boundary as part of the handover doc refresh.
5. **Surfacing Pacific farmer validation gaps** as blockers, not as nice-to-haves. If Phase X.0 has not been validated by a real farmer in the domain, the Architect halts and flags before authoring Phase X.1 schema.

---

## 11. THE EXECUTION ENGINE'S COMMITMENTS

Claude Code (Execution Engine) operates within paste packs authored by the Architect. By extension of this doctrine:

1. **Never silently expands an event taxonomy** during a paste pack. If a paste pack to add 7 poultry events accidentally drifts to add 8, Claude Code halts and reports.
2. **Never ships a form** that violates the Universal Event Form Contract (already binding via MBI Inviolable #17, reinforced here).
3. **Never ships a "Coming soon" form placeholder** as a stand-in for a real form. If a form is not authored, the corresponding event tile is hidden from (+) Level 2, not rendered as a dead-end.

---

## 12. INTEGRATION WITH EXISTING DOCTRINE

This doctrine sits alongside the existing canonical doctrines and supersedes none of them. It refines and operationalizes the standard against which all build work is measured.

| Existing doctrine | Relationship to this doctrine |
|---|---|
| **Universal Naming Doctrine** (MBI Section 4) | Gate 2 (Vocabulary Completeness) operationalizes it per group |
| **Data Input Doctrine** (MBI Section 4a) | Gate 3 (Form Coverage) operationalizes the four-anchor model + Universal Event Form Contract per group |
| **Convergence Mandate** (Project Instruction Section 8) | This doctrine is the Convergence Mandate applied vertically (depth) rather than horizontally (breadth) |
| **The Onboarding Doctrine** (per Sprint 5.10 / pending MBI Inviolable #19) | Onboarding does not extract group-specific commitments; this doctrine ensures the experience after onboarding is complete-by-default for each group the farmer engages with |
| **Six-Step Cadence** (MBI Part 34) | Each Phase X.0 through X.8 is itself a Six-Step Cadence build |
| **F002 Kadavu reference** (MBI binding) | Gate 8 (Solo Voice) directly tests this; vertical completeness without F002 compatibility is incomplete |

Note: At the time this doctrine was locked, the prod MBI on /opt/teivaka was a v1.0 (April 2026) document with Parts 1-19 and no sub-parts. The Universal Naming Doctrine and Data Input Doctrine references in Section 12 above describe the canonical doctrine evolution as it exists in Operator-curated project knowledge (Cowork). The full sync of prod MBI to canonical evolution is filed as backlog item B22 (separate phase, scope: pull project-knowledge MBI v4.2 + standalone Naming/Input doctrines to /opt/teivaka, reconcile any prod-only edits since v1.0). This Vertical Completeness Doctrine is itself canonical and binding regardless of the sync status of the broader MBI evolution.

---

## 13. THE INVIOLABLE RULE (proposed for MBI Section 6 Inviolable #20)

> **A group is not shipped to farmers until it passes all eight Vertical Completeness Gates. Partial-event groups display as "Coming soon" or are toggled off by default. The Operator declares ship status; the Architect proposes status; the Execution Engine never declares status.**

Filed for Operator amendment to MBI.

---

## 14. THE FINAL DIRECTIVE

The TFOS mission is bankability for Pacific Island smallholder farmers. Bankability requires complete operational records. Complete operational records require vertical completeness per group.

**The first farmer who signs up to TFOS for poultry must feel: this is the system built for me, and it solves my entire job.**

The first farmer who signs up to TFOS for crops must feel the same.
The first farmer who signs up to TFOS for livestock must feel the same.
The first farmer who signs up to TFOS for any of the eleven groups must feel the same.

**That is the bar. This doctrine is how we hit it.**

---

*End of doctrine. Update only by explicit Operator amendment per MBI Part 33 Documentation Discipline.*

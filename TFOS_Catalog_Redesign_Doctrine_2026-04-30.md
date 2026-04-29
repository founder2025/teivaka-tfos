# TFOS CATALOG REDESIGN DOCTRINE

**Status:** BINDING. Approved by Operator (Cody) 2026-04-30.
**Authority:** Sits inside the canonical authority stack as an addendum to `TFOS_Master_Build_Instruction.md` Section 4a. When this document conflicts with prior interpretations of Section 4a.6, this document wins. Conflicts with the prototype `TFOS_Platform_Interactive_Prototype.html` are resolved per Section 8 Convergence Mandate.
**Scope:** Locks the (+) button (universal log button) architecture, settings architecture, and entity creation locations across the TFOS platform.
**Read this document before authoring any (+) UI work, settings UI work, or event-catalog migration work.**

---

## 1. WHY THIS DOCTRINE EXISTS

The (+) button is the most-used surface on TFOS. It is how every fact enters the audit chain. Every Bank Evidence PDF, every credit score, every regulatory submission depends on farmers logging consistently through this surface.

The shipped (+) button (as of 2026-04-30) had three structural problems flagged by Operator review:

1. It conflated three categories — events (things that happened), entities (persistent records), and settings (configurations) — in one modal
2. It had no clear group structure; 14 hardcoded tiles in mixed grammatical forms
3. It exposed unimplemented features as "Coming soon" tiles, leaking incompleteness on first tap
4. It hardcoded English strings rather than reading from the naming dictionary
5. It had no voice-first affordance, despite Solo mode being voice-driven by contract

Sprint 1 of the Catalog Redesign was held the night of 2026-04-29 / 2026-04-30. Operator made eight binding decisions. This document captures them.

---

## 2. THE EIGHT BINDING DECISIONS

### Decision 1 — The (+) button is for events only

**Rule:**
> The (+) button captures things that happened or are happening on the farm. It does not configure the farm. It does not create persistent entities. Entities live in Settings, in `/farms`, or in `/contacts`.

**Carve-outs:**
- Adding a new farm lives at `/farms` (top-level pillar, Commercial+ only)
- Blocks, zones, locations, equipment live in `/farm/settings`
- Workers, managers, team live in `/me/settings/team`
- Buyers, suppliers, partners live in `/contacts` (top-level for Commercial+) or `/me/settings/contacts` (Solo+Growth)

**Inline carve-out:** when an event flow needs an entity that doesn't exist yet (e.g., farmer hits "Sell" but the buyer isn't registered), the form offers an inline "Add buyer now" affordance instead of bouncing the farmer to Settings.

**Forbidden:** Adding "Add buyer", "Add block", "Add zone", "Add worker" as tiles in the (+) catalog itself.

### Decision 2 — Two settings surfaces, not five

**Rule:** TFOS has exactly two settings surfaces.

| Surface | URL | Purpose |
|---|---|---|
| Account-wide | /me/settings | Profile, security, billing, plan, language, timezone, units, notifications, voice & TIS preferences, team management, contacts (for Solo+Growth), data export |
| Active farm | /farm/settings | Farm profile, blocks, zones, locations, equipment, cycle defaults |

Plus two operating-data surfaces (not settings):

| Surface | URL | Purpose |
|---|---|---|
| Multi-farm | /farms | Top-level pillar (Commercial+ only). Farm switcher, multi-farm rollup, "Add new farm" button. |
| External contacts | /contacts | Top-level pillar for Commercial+, nested under /me/settings/contacts for Solo+Growth. Buyers, suppliers, partners. |

**Forbidden:** Per-pillar settings under Home, Classroom, or TIS.

### Decision 3 — (+) primary view: 5 group tiles + voice mic

**Rule:** The (+) modal opens to five Level-1 group tiles plus a voice mic at the top. No tiles for individual verbs at this layer.

Groups: Crops · Animals · Money · Notes · Other

The Animals tile is mode-derived — only shown when the active farm has logged at least one livestock event in its history (farms.has_livestock = true). Crops-only farmers do not see it.

### Decision 4 — Two-level (+) hierarchy

**Rule:** The (+) experience is two screens deep:
- Level 1: the 5-group primary view
- Level 2: group-specific sub-tiles, each with its own mic

Tapping a Level-1 tile opens a Level-2 sub-screen. Tapping a Level-2 sub-tile opens a single-question form.

**Crops Level 2:** Plant, Harvest, Water, Spray, Fertilize, Weed, Prune, Transplant, Land prep
**Animals Level 2 (mode-derived):** Birth, Death, Vaccinate, Weight, Bee check, New animal, Sell animal
**Money Level 2:** Sell crops, Pay someone, Buy supplies, Hire machine, Receive supplies, Wages paid, Delivery sent, Delivery confirmed
**Notes Level 2:** Pest, Disease, Weather, General, Photo only, Incident, Free note
**Other Level 2:** Start nursery, Nursery ready, Germinated, Worker check-in, Adjust supplies, Crop loss, Grade harvest, Start crop run, Close crop run

**Hidden / role-gated:** OVERRIDE_EXECUTED (FOUNDER only), EVENT_CORRECTED (system-derived), PAYMENT_RECEIVED (system-derived), STAGE_TRANSITION (Task Engine), TASK_ASSIGNED (Task Engine).

### Decision 5 — Three compound flows

**Rule:** Three (+) sub-tiles emit multiple events server-side as one transaction:
- **Hire machine** → EQUIPMENT_USE + CASH_OUT (+ LAND_PREP if work is land prep)
- **Sell crops** → DELIVERY_DISPATCHED + CASH_IN
- **Wages paid** → WAGE_PAID + CASH_OUT

All compound emits share an event_group_id UUID (column to be added to audit.events in Migration 037). Hash chain remains unbroken; either all events in a compound land in one transaction or none do.

### Decision 6 — Doctrine amendment

**Rule:** MBI Section 4a.6 is amended:

#### 6.1 New event type LAND_PREP

Added to Group 3 — Field Activity. Sub-types: CLEARING, EXCAVATION, TILLING, LEVELING, BED_FORMATION, FENCING.

Total event taxonomy grows from 43 to 44 events.

#### 6.2 Explicit event-vs-entity distinction in doctrine text

The MBI Section 4a is amended to include explicit event-vs-entity language: events are atomic timestamped facts in the audit chain; entities are mutable configurations in their own tables. The (+) button captures only events. Entity creation lives in /farms, /farm/settings, /me/settings/team, /contacts.

### Decision 7 — Five-layer architecture

**Rule:** The (+) experience is built as five layers:

- **Layer A:** Level-1 group tiles (5 + voice mic, mode-derived)
- **Layer B:** Level-2 sub-tiles (per-group sub-screen with mic + sub-tiles, role-filtered)
- **Layer C:** Single-question forms (anchors auto-prefilled, single notes field, voice option)
- **Layer D:** Entity creation lives elsewhere (/farms, /farm/settings, /me/settings/team, /contacts)
- **Layer E:** Compound flows hidden server-side (transactional emit with event_group_id)

All five layers backed by data-driven shared.event_type_catalog table (Migration 036, future). No hardcoded tile labels.

### Decision 8 — Mode derivation governs surface visibility

**Rule:** The (+) catalog and entity-creation surfaces are mode-derived, never user-toggled.

| Mode | Visibility |
|---|---|
| Solo | Simplified Level-1 (Crops, Money only). Animals only if has_livestock. No /farms. Contacts under /me/settings. |
| Growth | Full 5 Level-1 groups (Animals if has_livestock). No /farms. Contacts under /me/settings. |
| Commercial | Full (+). /farms pillar visible. /contacts pillar visible. |
| Enterprise | Commercial features + aggregate rollup at /farms. |
| FOUNDER | All visible + OVERRIDE_EXECUTED admin path. |

---

## 3. WHAT THIS DOCTRINE DOES NOT COVER

- Final wording of 8 verbs other than "Harvest" and "Fertilize" (Plant, Water, Spray, Weed, Look, Sell, Pay, Hire)
- Voice intent classification logic (Phase 11 deepening)
- Exact shared.event_type_catalog schema (Migration 036, Sprint 2)
- Exact event_group_id column shape (Migration 037, Sprint 5)
- Per-form field details for each of the 44 event types (Sprint 4)
- /farms, /contacts, /me/settings, /farm/settings page layouts (Sprint 6)

---

## 4. SIX-SPRINT EXECUTION MAP

**Sprint 1 — Doctrine** (DONE 2026-04-30): this document.

**Sprint 2 — Event catalog migration** (~3 hr): Migration 036 creates shared.event_type_catalog with 44 events. Backend GET /api/v1/event-catalog returns role-filtered list.

**Sprint 3 — Naming dictionary** (60-90 min Operator + ~2 hr build): populate shared.naming_dictionary per MBI Section 4. Drives every label.

**Sprint 4 — (+) UI rebuild** (1-2 sessions, ~6-8 hr): Level-1 5-group view, per-group Level-2 sub-screens, single-question forms, voice mic affordance.

**Sprint 5 — Compound flows** (~4 hr): Migration 037 adds event_group_id. Backend transactional emit. Frontend Hire/Sell/Wages forms.

**Sprint 6 — Settings + entity surfaces** (1-2 sessions, ~6-8 hr): /me/settings tabs, /farm/settings sub-pages, /farms (Commercial+), /contacts. Move entity creation out of (+).

---

## 5. CONVERGENCE TARGET

> A Pacific smallholder farmer can open TFOS, tap (+), choose a group, choose a sub-action, fill a one-question form, and submit — in fewer than four taps and zero text typing — for any of the 44 doctrine events.

When that test passes for every event, the Catalog Redesign is complete.

---

## 6. WHAT BREAKS IF THIS DOCTRINE IS VIOLATED

- Hardcoded English in (+) tiles → naming dictionary useless, multi-language blocked
- Entity creation in (+) → cognitive model fractures, abandonment rises
- Per-pillar settings → settings surface explodes, support load rises
- Single-emit replacing compound → friction rises, audit chain still works but UX degrades
- More than two-level depth → tap-fatigue, Solo mode fails ≤5-words rule

These are reversible debt, but reversing them is more expensive than not introducing them.

---

## 7. AUDIT TRAIL

| Date | Event | Actor |
|---|---|---|
| 2026-04-30 01:35 FJT | Sprint 1 doctrine session opened | Operator |
| 2026-04-30 02:35 FJT | All eight decisions locked | Operator |
| 2026-04-30 02:40 FJT | Memo authored in chat | Architect |
| 2026-04-30 ~03:00 FJT | Memo landed on prod | Architect/Claude Code |

**End of doctrine. Read again on every session that touches the (+) catalog, settings, or entity creation surfaces.**

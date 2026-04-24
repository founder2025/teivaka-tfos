# Onboarding Wizard — Fresh-Farm Flow Specification

**Version:** 1.1
**Authority:** Cody (Founder, Teivaka)
**Established:** 24 April 2026
**Scope:** Phase 4.2 Option 3 + Nav v2.1 — Fresh-Farm Onboarding

**Doctrine reference:** TFOS_DESIGN_DOCTRINE.md Part IV (Naming & Fresh-Start)
**Naming binding:** Universal Naming v2 — "Block" is the default farmer-facing term for a section of land. (01_architecture/UNIVERSAL_NAMING_V2_ADDENDUM.md)

**v1.1 delta (2026-04-24):** Universal Naming v2 binding applied — tile order
leads with Block; default label template is "My cassava block"; API payload
key renamed `patches` → `blocks`. DB column names unchanged per drift list
(tenant.production_units stays).

---

## Purpose

Close the fresh-farm gap. Any Pacific farmer — Fiji, Tonga, Samoa, PNG, future — signs up with email + password, verifies the email, and is guided through a 3-step wizard that captures everything the Task Engine needs to emit a first real task. No pre-seeded F001 / F002 residue. No engineer-facing IDs on screen.

Ends with the farmer completing their first task → first `audit.events` row → platform is alive for that tenant.

---

## Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Existing /register (email + password + country)                 │
│  → POST /api/v1/auth/register                                    │
│  → send verification email                                       │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Existing /verify-email (click link from email)                  │
│  → GET /api/v1/auth/verify-email?token=...                       │
│  → JWT issued, refresh cookie set                                │
│  → auto-redirect in 2s                                           │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Check: does tenant already have a farm row?                     │
│  GET /api/v1/onboarding/status                                   │
│  → { onboarding_complete: false, step: "FARM_BASICS" }           │
│  If complete → redirect to /farm (existing behavior)             │
│  If not complete → redirect to /onboarding/farm-basics           │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 1: /onboarding/farm-basics                                 │
│  - Farm name (text, voice-optional, required)                    │
│  - Location: GPS ping OR village picker OR skip                  │
│  - Rough area: acres slider 0-200 OR skip                        │
│  - Land tenure: iTaukei / freehold / crown / other / skip        │
│  - What to call a section of land (default is Block):            │
│    [Block] [Plot] [Bed] [Field] [Patch] (tile picker, req)       │
│  POST /api/v1/onboarding/farm-basics                             │
│  → creates tenant.farms row                                      │
│  → stores section_term preference on tenant                      │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 2: /onboarding/what-you-grow                               │
│  - Multi-select crop tiles (from shared.productions CRP rows)    │
│    Popular tiles first: cassava, eggplant, kava, pineapple,      │
│    taro, dalo, breadfruit, coconut, chili, ginger, etc.          │
│  - "Something else?" → free-text (one field only)                │
│  - For each selected crop: optional block names                  │
│    (defaults to "My cassava block" etc. if skipped —             │
│     default substitutes farmer's chosen section_term)            │
│  - Skip all option available                                     │
│  POST /api/v1/onboarding/production-units                        │
│  → creates tenant.production_units rows (with farmer_label)      │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 3: /onboarding/animals                                     │
│  - Multi-select animal tiles (from shared.productions LIV/API)   │
│    Tiles: goats, cows, pigs, chickens, ducks, bees, sheep        │
│  - For each: count (numpad or voice) + optional group name       │
│    (defaults to "My goats" etc. if skipped)                      │
│  - Skip all option available                                     │
│  POST /api/v1/onboarding/livestock                               │
│  → creates tenant.livestock rows (with farmer_label)             │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 4 (internal): Mode derivation + first task generation      │
│  POST /api/v1/onboarding/complete                                │
│  → auth.tenants.mode = SOLO / GROWTH derived from:               │
│    area + crop_count + animal_count + first-signup default       │
│  → auth.tenants.onboarded_at = NOW()                             │
│  → Task Engine: generate first task for each created PU/livestock│
│  → audit.events: OVERRIDE_EVENT 'TENANT_ONBOARDED'               │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Landing: /solo/task (Solo) OR /farm (Growth)                    │
│  → First task card rendered with voice TTS auto-play             │
│  → Farmer taps DONE → first task_completions row                 │
│  → audit.events: TASK_COMPLETED with hash-chained entry          │
│  → Platform is now alive for this tenant                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Frontend Route Map

### New routes (additive — no removals from existing App.jsx)

```
/onboarding/farm-basics       — Step 1 form
/onboarding/what-you-grow     — Step 2 crop selection
/onboarding/animals           — Step 3 livestock selection
/onboarding/first-task        — Step 4 transition + first task render
```

### Existing routes preserved (DO NOT MODIFY — v4 Part 23 item 28)

```
/register, /login, /verify-email, /forgot-password, /reset-password
/farm, /farm/harvest/new
/home, /tis, /community, /admin
```

### Route guard logic (additive to existing auth middleware)

```javascript
// In App.jsx useEffect after auth check:
// If authenticated AND tenant.onboarded_at IS NULL:
//   allow: /onboarding/*, /me, /logout
//   redirect all other routes to /onboarding/farm-basics
```

---

## Component Tree (frontend)

```
/opt/teivaka/frontend/src/pages/onboarding/
├── OnboardingShell.jsx          — wizard wrapper, progress bar (1/3, 2/3, 3/3)
├── FarmBasics.jsx               — Step 1 form
├── WhatYouGrow.jsx              — Step 2 crop multi-select
├── Animals.jsx                  — Step 3 livestock multi-select
└── FirstTask.jsx                — Step 4 transition + first task render

/opt/teivaka/frontend/src/components/onboarding/
├── CropTile.jsx                 — single crop selectable tile
├── AnimalTile.jsx               — single animal selectable tile
├── SectionTermPicker.jsx        — Block/Plot/Bed/Field/Patch picker (Block default)
├── VillagePicker.jsx            — optional location picker
├── GPSPingButton.jsx            — "use my location" button
├── VoiceLabelInput.jsx          — voice + text farmer_label input
├── NumpadCount.jsx              — touch-friendly number input
└── SkipAllButton.jsx            — "Skip — I'll add later" button

/opt/teivaka/frontend/src/lib/onboarding/
├── modeDerivation.js            — computes mode from area/crops/animals
└── onboardingApi.js              — API client wrapper
```

---

## Backend API Contracts

All endpoints use the standard response envelope: `{status, data, meta}` per v4 Part 14.

### GET /api/v1/onboarding/status

**Auth:** JWT required

**Response (not onboarded):**
```json
{
  "status": "success",
  "data": {
    "onboarding_complete": false,
    "current_step": "FARM_BASICS",
    "next_route": "/onboarding/farm-basics"
  }
}
```

**Response (complete):**
```json
{
  "status": "success",
  "data": {
    "onboarding_complete": true,
    "farm_id": "uuid",
    "mode": "SOLO",
    "next_route": "/solo/task"
  }
}
```

### POST /api/v1/onboarding/farm-basics

**Auth:** JWT required, tenant must have `onboarded_at IS NULL`

**Request:**
```json
{
  "farm_name": "Uncle Josefa's farm",
  "location": {
    "type": "gps",
    "lat": -18.1416,
    "lng": 178.4419
  },
  "area_acres": 3.5,
  "tenure_type": "itaukei",
  "section_term": "BLOCK"
}
```

Location types: `"gps"` (lat/lng), `"village"` (village_id from shared.villages), `"skip"`.
Tenure types: `itaukei | freehold | crown | other | skip`.
Section terms: `BLOCK | PLOT | BED | FIELD | PATCH` — **default `BLOCK`** per Universal Naming v2.

**Response:**
```json
{
  "status": "success",
  "data": {
    "farm_id": "uuid",
    "next_step": "WHAT_YOU_GROW",
    "next_route": "/onboarding/what-you-grow"
  }
}
```

### POST /api/v1/onboarding/production-units

**Auth:** JWT required, farm must exist

**Request:**
```json
{
  "crops": [
    {
      "production_id": "CRP-CAS-001",
      "blocks": [
        { "farmer_label": "Block near the creek" },
        { "farmer_label": "Back block" }
      ]
    },
    {
      "production_id": "CRP-EGG-002",
      "blocks": [
        { "farmer_label": null }
      ]
    }
  ]
}
```

If `farmer_label` is null for a block, backend fills with default: `"My {crop_name} {section_term}"` (e.g. "My cassava block" when section_term=BLOCK, "My cassava patch" if farmer chose PATCH). Farmer can edit later.

**Note on JSON key `blocks`:** this is the new Option 3 API contract. The underlying DB table remains `tenant.production_units` per drift list — Pydantic models in `schemas/onboarding.py` map `blocks` → `production_units` internally. API key is farmer-term-aligned; DB stays engineer-faithful.

**Response:**
```json
{
  "status": "success",
  "data": {
    "created_count": 3,
    "next_step": "ANIMALS",
    "next_route": "/onboarding/animals"
  }
}
```

### POST /api/v1/onboarding/livestock

**Auth:** JWT required, farm must exist

**Request:**
```json
{
  "groups": [
    {
      "production_id": "LIV-GOA-001",
      "count": 8,
      "farmer_label": "My goats"
    },
    {
      "production_id": "API-BEE-001",
      "count": 4,
      "farmer_label": null
    }
  ]
}
```

`count` may be 0 (no animals) — skip entirely by submitting empty `groups: []`.

**Response:**
```json
{
  "status": "success",
  "data": {
    "created_count": 12,
    "next_step": "COMPLETE",
    "next_route": "/onboarding/first-task"
  }
}
```

### POST /api/v1/onboarding/complete

**Auth:** JWT required, farm + entities must exist

**Request:** `{}` (empty body — server derives everything)

**Server side-effects:**
1. Derive mode:
   - If `area_acres >= 1.0` OR `crop_count > 2` OR `animal_count > 10` → `GROWTH`
   - Else → `SOLO`
2. Set `auth.tenants.mode` and `auth.tenants.onboarded_at = NOW()`
3. Call Task Engine `generate_initial_tasks(tenant_id)` → creates one task per PU + one per livestock group
4. Emit `audit.events` row: `event_type='TENANT_ONBOARDED'`, payload `{farm_id, mode, pu_count, animal_count, section_term}`

**Response:**
```json
{
  "status": "success",
  "data": {
    "mode": "SOLO",
    "first_task_id": "uuid",
    "next_route": "/solo/task"
  }
}
```

---

## Mode Derivation Logic

```python
def derive_initial_mode(
    area_acres: float | None,
    crop_count: int,
    animal_count: int,
) -> str:
    """
    TFOS_DESIGN_DOCTRINE.md Part II — mode is derived, never toggled.
    On first onboarding, default to SOLO unless scale signals otherwise.
    Graduation to GROWTH happens later via tenure + tasks-completed
    signals (Task Engine daily sweep).
    """
    if area_acres is not None and area_acres >= 1.0:
        return "GROWTH"
    if crop_count > 2:
        return "GROWTH"
    if animal_count > 10:
        return "GROWTH"
    return "SOLO"
```

`COMMERCIAL` is never set at onboarding. Requires admin assignment or multi-farm signal (Phase 14).

---

## Edge Cases

**Farmer skips everything.** Farmer lands on `/onboarding/farm-basics`, enters name, skips location, skips area, skips tenure, picks section term (default Block). Then skips crops and animals entirely. Result: farm row exists, mode=SOLO, no PUs, no livestock. Task Engine emits a single "tell me about your farm" prompt task. Farmer can progress from there.

**No connectivity during onboarding.** Each step POST queues to IndexedDB per v4 Part 16 offline rules. Farmer can complete onboarding offline; queue flushes on reconnect. Onboarding complete banner appears once all 4 steps have synced.

**Back button mid-onboarding.** Each step is idempotent on the server — re-POST same data just updates. UI back button allowed freely. Progress bar tracks furthest step reached.

**Abandon mid-onboarding.** Status endpoint always returns current step. Next login redirects to correct step. Onboarding expiry: 30 days. After 30 days without completion, abandonment protocol fires (v4 Part 22).

**Farmer returns after onboarding complete.** `GET /api/v1/onboarding/status` returns `onboarding_complete: true`; all `/onboarding/*` routes redirect to `/solo/task` or `/farm`.

**F001 / F002 pilot tenants.** Already onboarded — skip wizard entirely. Migration 028 (post-Phase 4.2 cleanup sprint) will set `onboarded_at` backfill for existing pilot tenants with NOW(). Until then, pilot operators use existing `/farm` UI.

---

## Verification Checklist (Phase 4.2 Option 3 close)

- [ ] Migration 027 applied, 4 `farmer_label` columns exist, 4 partial indexes exist
- [ ] New test account (fresh email, no F001 / F002 seed) can register
- [ ] Verify-email flow completes successfully
- [ ] `/onboarding/farm-basics` renders; farm name + GPS ping + section term picker all functional
- [ ] Section term picker tile order leads with **Block** and Block is the default selection
- [ ] POST `/api/v1/onboarding/farm-basics` creates `tenant.farms` row with all fields (section_term persisted)
- [ ] `/onboarding/what-you-grow` renders crop tiles from `shared.productions` CRP rows
- [ ] POST `/api/v1/onboarding/production-units` creates `tenant.production_units` rows with `farmer_label` populated
- [ ] Default farmer_label substitutes farmer's chosen section_term (e.g. "My cassava block" for section_term=BLOCK)
- [ ] `/onboarding/animals` renders animal tiles from LIV/API rows; skip-all works
- [ ] POST `/api/v1/onboarding/livestock` creates `tenant.livestock` rows with `farmer_label`
- [ ] POST `/api/v1/onboarding/complete` sets `auth.tenants.mode` correctly per derivation logic
- [ ] `audit.events` row emitted with `event_type='TENANT_ONBOARDED'`, hash-chain verified
- [ ] First task rendered on `/solo/task` for SOLO tenants, `/farm` for GROWTH
- [ ] Completing the first task creates `task_completions` row + `audit.events TASK_COMPLETED` row
- [ ] Second login: redirected past onboarding to `/solo/task` or `/farm`
- [ ] F001 / F002 pilot login path unchanged

---

## What This Spec Deliberately Does NOT Cover

- **Voice-only onboarding.** Text + tap is the minimum viable. Voice input on the wizard is Phase 5 voice pipeline deepening.
- **Fijian language strings.** i18n is Phase 12. English-only strings ship first; localization structure respects i18n by using a `t()` wrapper on every string.
- **Photo-based farm boundary drawing.** Farm map is Phase 6.5.
- **Buyer / worker onboarding.** Contacts flow is Phase 4b+ (separate screen, post-onboarding).
- **Subscription tier selection.** All new tenants default to BASIC 14-day trial (v4 Part 12). Tier selection appears only at trial expiry.
- **Referral code entry.** Phase 3.5a-b already captures this at registration. No wizard-side work.

---

## Files to Create / Modify (for Cody to hand to Claude Code)

### Backend

```
/opt/teivaka/11_application_code/alembic/versions/027_farmer_label_columns.py
    (CREATE — migration file from /04_execution/phase_4_2_option_3_plus_nav_v2_1/)

/opt/teivaka/11_application_code/app/routers/onboarding.py
    (CREATE — new router with 5 endpoints)

/opt/teivaka/11_application_code/app/services/onboarding_service.py
    (CREATE — mode derivation, first-task generation trigger)

/opt/teivaka/11_application_code/app/models/farm.py
    (MODIFY — add section_term column if absent)

/opt/teivaka/11_application_code/app/main.py
    (MODIFY — register onboarding router)
```

### Frontend

```
/opt/teivaka/frontend/src/pages/onboarding/OnboardingShell.jsx
/opt/teivaka/frontend/src/pages/onboarding/FarmBasics.jsx
/opt/teivaka/frontend/src/pages/onboarding/WhatYouGrow.jsx
/opt/teivaka/frontend/src/pages/onboarding/Animals.jsx
/opt/teivaka/frontend/src/pages/onboarding/FirstTask.jsx
    (ALL CREATE)

/opt/teivaka/frontend/src/components/onboarding/ (all files)
    (ALL CREATE)

/opt/teivaka/frontend/src/lib/onboarding/onboardingApi.js
/opt/teivaka/frontend/src/lib/onboarding/modeDerivation.js
    (BOTH CREATE)

/opt/teivaka/frontend/src/App.jsx
    (MODIFY — add onboarding routes ADDITIVELY; add onboarding guard in auth useEffect)
```

### Auth / tenant schema additions (may require a small migration 028 later)

```
auth.tenants columns needed:
  onboarded_at        TIMESTAMPTZ NULL
  section_term        VARCHAR(16) NULL  -- BLOCK/PLOT/BED/FIELD/PATCH (default BLOCK)

If these columns do not already exist on auth.tenants, bundle them into
migration 027 or add a small 027a patch migration.
```

---

## END OF SPEC

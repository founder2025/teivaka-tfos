# Farmer-Visible Term Rename Audit

**Version:** 1.1
**Authority:** Cody (Founder, Teivaka)
**Established:** 24 April 2026
**Scope:** Phase 4.2 Option 3 + Nav v2.1 — global rename of engineer-facing terms on farmer-visible surfaces only

**Doctrine reference:** TFOS_DESIGN_DOCTRINE.md Part IV (Naming & Fresh-Start)
**Naming binding:** Universal Naming v2 — "Block" is the default farmer-facing term for a section of land. (01_architecture/UNIVERSAL_NAMING_V2_ADDENDUM.md)

**v1.1 delta (2026-04-24):** Universal Naming v2 binding applied — default
farmer-facing term for a section of land is **Block** (was "Patch"). Rename
table updated throughout. DB column names unchanged per drift list
(tenant.production_units stays).

---

## Principle

**Internal surfaces keep engineer terms.** Admin panels, debug logs, support tools, API logs, internal services — unchanged. These are for engineers; engineer English is correct.

**Farmer-visible surfaces switch to farmer terms.** Every `.jsx` page a farmer can reach. Every API response field that renders directly to a farmer UI. Every WhatsApp message sent to a farmer. Every email subject line to a farmer. Every PDF generated for a farmer.

If a string is in a farmer-visible surface, rename. If not, leave it.

---

## Global Rename Table

| Old term (engineer) | New term (farmer) | Notes |
|---------------------|-------------------|-------|
| Production Unit | **Block** | Default per Universal Naming v2. Farmer picks Block / Plot / Bed / Field / Patch at onboarding; term follows tenant preference with Block as the initial selection. |
| Production Units | **Blocks** | Plural follows singular preference |
| PU-{id} | {farmer_label} | Never render composite IDs; fall back to UUID short-form if label is NULL |
| Production Cycle | **Crop cycle** OR **Season** | Either is acceptable; prefer "Season" in task copy, "Crop cycle" in form labels |
| Production Cycles | **Crop cycles** / **Seasons** | Plural |
| CYC-{id} | {farmer_label} | Never render composite IDs |
| Field Event | **Activity** | Applies to spraying, fertilizer, irrigation, scouting |
| Field Events | **Activities** | Plural |
| Cash Ledger | **Money** | Tabs: "Money in" / "Money out" |
| Harvest Log | **Harvest** | Singular; list page title: "Harvests" |
| Chemical Compliance Check | **Safety check** | Never expose "compliance" to farmer — it's a safety concept |
| Chemical Compliance Violation | **Not safe to harvest yet** | 409 modal copy |
| Withholding Period | **Safety wait** | e.g. "Safety wait: 7 days" |
| Rotation Gate | **Rotation check** | |
| Automation Rule | (invisible) | Never exposed to farmer |
| RULE-{id} | (invisible) | Never exposed to farmer |
| Decision Signal | (invisible) | Shown only as task context; never as "signal" |
| Alert | **Notice** | Or skip entirely — tasks replace alerts per v4.1 |
| Livestock | **Animals** | Except in admin. "Animals" is more natural. |
| Apiculture | **Bees** | "Bee activity" etc. |
| Tenant | (invisible) | Farmer never sees "tenant" — says "farm" |
| Tenant ID | (invisible) | Never shown to farmer |
| tenant_id | (invisible) | Never shown to farmer |

**Note on Block default:** Block is the Universal Naming v2 canonical default. Where tenant has not chosen otherwise during onboarding, all auto-generated labels and copy substitute "Block" for `{section_term}`. Tenants who choose a different section term (Plot/Bed/Field/Patch) see their chosen term in place of Block everywhere — the rename rule is substitution, not hard-coding.

---

## Execution — Cody runs these on the server

### Step 1 — find every farmer-visible file

```bash
cd /opt/teivaka/frontend/src

# Farmer-visible directories:
ls pages/farmer/
ls pages/solo/          # created by Phase 4.2
ls pages/onboarding/    # created by Option 3
ls layouts/FarmerShell.jsx
ls components/nav/      # BottomNav, TopAppBar
ls pages/Home.jsx
ls pages/tis/
```

### Step 2 — grep for each engineer term across farmer-visible files

Run each grep in `/opt/teivaka/frontend/src`. For each hit, determine if the file is farmer-visible. If yes, replace; if no, leave.

```bash
# Find "Production Unit" in farmer-visible files
grep -rn "Production Unit" pages/farmer/ pages/solo/ pages/onboarding/ layouts/ components/nav/ pages/Home.jsx pages/tis/

# Find "production unit" (lowercase)
grep -rn "production unit" pages/farmer/ pages/solo/ pages/onboarding/ layouts/ components/nav/ pages/Home.jsx pages/tis/

# Find "PU-" composite ID rendering
grep -rn "PU-" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Production Cycle"
grep -rn "Production Cycle" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "CYC-" composite ID rendering
grep -rn "CYC-" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Field Event"
grep -rn "Field Event" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Cash Ledger"
grep -rn "Cash Ledger" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Harvest Log"
grep -rn "Harvest Log" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Compliance" / "WHD" / "Withholding"
grep -rn "Compliance\|WHD\|Withholding" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Rotation Gate"
grep -rn "Rotation Gate" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Livestock" (vs Animals)
grep -rn "Livestock" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Automation Rule" / "RULE-"
grep -rn "Automation Rule\|RULE-" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Decision Signal" / "Signal"
grep -rn "Decision Signal" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find "Tenant" surfaced to farmer
grep -rn "Tenant\|tenant_id" pages/farmer/ pages/solo/ pages/onboarding/ layouts/

# Find residual "Patch" references that assume old default (Option 3 v1.0 residue)
# — post-Universal Naming v2, Block is the default. Patch only appears
# when farmer explicitly chose section_term=PATCH.
grep -rn "patch\|Patch\|PATCH" pages/farmer/ pages/solo/ pages/onboarding/ layouts/
```

### Step 3 — farmer-visible file whitelist

These `.jsx` files are farmer-visible. Every string inside them is a rename candidate.

```
/opt/teivaka/frontend/src/
├── pages/
│   ├── Landing.jsx                    — CHECK but DO NOT TOUCH per v4 Part 23 #28
│   ├── Login.jsx                      — DO NOT TOUCH
│   ├── Register.jsx                   — DO NOT TOUCH
│   ├── VerifyEmail.jsx                — DO NOT TOUCH
│   ├── ForgotPassword.jsx             — DO NOT TOUCH
│   ├── ResetPassword.jsx              — DO NOT TOUCH
│   ├── Home.jsx                       — rename farmer-visible strings
│   ├── tis/TIS.jsx                    — DO NOT TOUCH per v4 Part 23 #28
│   ├── farmer/                        — ALL rename candidates:
│   │   ├── FarmDashboard.jsx          — NARROW touch permission per Prototype Alignment
│   │   │                                Appendix (10-metric grid layout). Additive only.
│   │   ├── HarvestNew.jsx             — DO NOT TOUCH per v4 Part 23 #28
│   │   ├── CyclesList.jsx             — rename: "Production Cycle" → "Crop cycle"
│   │   ├── CycleDetail.jsx            — rename: full set
│   │   ├── FieldEventNew.jsx          — rename: "Field Event" → "Activity"
│   │   ├── AlertsInbox.jsx            — rename: "Alert" → "Notice" (or remove)
│   │   └── ... (full enumeration on server)
│   ├── solo/                          — created by Phase 4.2
│   │   └── SoloTaskCard.jsx           — verify no leaked engineer terms
│   └── onboarding/                    — created by Option 3
│       └── ... (new code — use farmer terms from day 1, Block default)
├── layouts/
│   └── FarmerShell.jsx                — DO NOT TOUCH per v4 Part 23 #28
│                                        (nav labels already correct per
│                                        Platform Architecture v1)
└── components/
    ├── nav/
    │   ├── BottomNav.jsx              — DO NOT TOUCH
    │   └── TopAppBar.jsx              — DO NOT TOUCH
    ├── farmer/                        — rename candidates (enumerate on server)
    ├── cycles/                        — rename: "Production Cycle" → "Crop cycle"
    ├── harvests/                      — rename: "Harvest Log" → "Harvest"
    ├── activities/                    — rename: "Field Event" → "Activity"
    └── modals/                        — rename: compliance modal copy
```

### Step 4 — execution order

**Priority 1 — task card surfaces (most visible).** Any file that renders a task card. Fix PU / cycle / activity names first. Every reference to a section of land renders as `{farmer_label}` if set, otherwise `"My {crop} {section_term}"` substituting the tenant's chosen section_term (default Block).

**Priority 2 — form labels.** Every form a farmer fills. Harvest form, activity form, cycle creation form.

**Priority 3 — list pages.** "Crop cycles", "Harvests", "Activities", "Animals" list titles.

**Priority 4 — modals.** 409 compliance modal copy (change "chemical compliance violation" to "not safe to harvest yet — your {chemical_name} is still inside its {N}-day safety wait").

**Priority 5 — notifications / WhatsApp.** Any message sent to farmer WhatsApp. Server-side in `notification_service.py`.

---

## Backend surfaces to audit

Farmer-facing API responses that render directly in UI. Check:

```bash
cd /opt/teivaka/11_application_code/app

# Any router that returns data to a farmer UI route
grep -rn "Production Unit\|Production Cycle\|Field Event\|Cash Ledger\|Harvest Log\|Rotation Gate" routers/

# API response schemas (Pydantic)
grep -rn "Production\|Cycle\|FieldEvent\|Ledger" schemas/
```

**Rule:** Pydantic schemas retain `production_unit_id`, `production_cycle_id`, etc. as field names — those are internal API contracts. But `display_name`, `description`, `label` fields returned to the UI use farmer terms. Add a `farmer_label` field to every response that renders an entity.

Example — harvest response:

```json
{
  "harvest_id": "uuid",
  "production_unit_id": "uuid",
  "production_unit_label": "Eggplant block near the mango tree",
  "cycle_id": "uuid",
  "cycle_label": "Eggplant — March season",
  "qty_kg": 26.5,
  "grade": "A"
}
```

UI renders `production_unit_label`. Never renders `production_unit_id`.

---

## WhatsApp notification copy

Server-side templates in `notification_service.py`. Every farmer-bound message reviewed.

Examples before / after:

**Before:** `"Compliance violation: PU002 cannot harvest until 2026-04-28 (Cypermethrin WHD)"`
**After:** `"Not safe yet — your {farmer_label} needs 3 more days before harvest (safety wait on {chemical_name})"`

**Before:** `"Production cycle CYC-F001-PU002-2026-003 reached HARVESTING stage"`
**After:** `"Your {farmer_label} is ready to harvest"`

**Before:** `"RULE-034 FIRED: F002FerryBuffer critical — diesel 6 days remaining"`
**After:** `"Order diesel before Friday — ferry cutoff. 6 days left."`

---

## Monthly PDF (bank evidence)

`monthly_report_service.py` — farmer-facing PDF template.

Rename all headers. Example:

**Before:** "Production Cycle Summary — CYC-F001-PU002-2026-003"
**After:** "Crop cycle summary — {farmer_label}"

**Before:** "Cash Ledger entries for period"
**After:** "Money in / out for the month"

**Before:** "Field Event log"
**After:** "What happened this month"

---

## Verification Checklist (rename complete)

- [ ] Grep on every term in the Global Rename Table returns zero hits in farmer-visible `.jsx` files
- [ ] Farmer-facing API responses include `*_label` fields for every entity
- [ ] UI components render `*_label` with UUID fallback (never raw UUID or composite ID)
- [ ] Section-of-land references substitute tenant's chosen `section_term` (default Block) wherever `farmer_label` is NULL
- [ ] 409 compliance modal uses "Not safe yet" copy
- [ ] WhatsApp notification templates reviewed and renamed
- [ ] Monthly PDF template reviewed and renamed
- [ ] Admin panel still uses engineer terms (intentional)
- [ ] Debug endpoints still use engineer terms (intentional)
- [ ] No accidental rename in `Landing.jsx`, `Login.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `TIS.jsx`, `BottomNav.jsx`, `TopAppBar.jsx`, `FarmerShell.jsx`, `HarvestNew.jsx` (protected per v4 Part 23 #28)
- [ ] FarmDashboard.jsx touch is limited to the 10-metric grid layout change per Prototype Alignment Appendix (no term-rename work inside FarmDashboard.jsx unless it falls within the grid change scope)
- [ ] New test account walks onboarding → completes first task → sees only farmer terms, no engineer residue, default section term visible as "Block"

---

## What This Audit Deliberately Does NOT Change

- Database column names (drift list still authoritative: `cycle_status`, `qty_kg`, `pu_id`, `chem_name`, `withholding_period_days`)
- ORM model class names (`ProductionCycle`, `ProductionUnit`, `FieldEvent`, `HarvestLog`)
- Alembic migration names (027, 028, etc.)
- Internal service function names (`validate_rotation`, `check_chemical_compliance`)
- API endpoint URLs (`/api/v1/cycles`, `/api/v1/harvests`, `/api/v1/field-events`)
- Pydantic schema class names and field names — only farmer-facing `*_label` fields are added
- Logs, Sentry error messages, debug output
- Admin panel strings
- CLAUDE.md, Master Build Instruction, architecture docs
- Git commit messages, branch names

Engineer English in engineer places. Farmer English in farmer places. The doctrine is surface-only.

---

## END OF AUDIT

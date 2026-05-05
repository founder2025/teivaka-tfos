# Strike #103 — farm_layer enum + suggested_layer schema (B75 Path C amendment)

## What shipped

Schema foundation for the 3-Layer Farming System Doctrine (Strike #101). Per Strike #101 Rule 1, every cycle must carry a layer classification; Strike #103 lays the schema rails. Strike #104 onboarding will backfill existing cycles + enforce NOT NULL for new cycles.

### Migration 072 — `072_layer_enum_seed`

(Revision ID shortened from `072_layer_enum_seed_suggested_layer` to fit `tenant.alembic_version` VARCHAR(32) — same lesson as Migration 069's rename.)

**Schema additions:**
- `shared.farm_layer` ENUM type with 3 values: `CASH_FLOW`, `FOOD_SECURITY`, `LONG_TERM_ASSET`
- `shared.productions.suggested_layer shared.farm_layer NULL` — default at cycle creation
- `shared.productions.requires_classification_at_creation BOOLEAN NOT NULL DEFAULT FALSE` — TRUE when production is layer-ambiguous and farmer must explicitly pick layer
- `shared.productions.layer_rationale TEXT NULL` — Architect's per-row reasoning (Operator review aide per Strike #98 Rule 4)
- `tenant.production_cycles.layer shared.farm_layer NULL` — NULL allowed pre-Strike-#104 backfill; will become NOT NULL after Strike #104 onboarding ships

**Idempotent GRANT:** `GRANT SELECT ON shared.productions TO teivaka_app` re-asserted (per B73 lesson learned from Migration 068's missed grant on `shared.crop_varieties`).

### B75 Path C amendment — Operator-confirmed seeding

**87 confident classifications** seeded with `suggested_layer` populated:

**35 CASH_FLOW** — short cycle (4-12wk crops; 6-8wk to 6mo livestock/aquaculture); weekly/biweekly market revenue:
- 11 Annual Vegetable: CRP-CAB, CRP-CAP, CRP-CHI, CRP-CUC, CRP-EGG, CRP-FRB, CRP-LBN, CRP-SQU, CRP-SCN, CRP-TOM, CRP-WAT
- 2 Aquaculture: AQU-PRW, AQU-TIL (both inactive; data ready for future activation)
- 16 Crop: CRP-AMR, CRP-CAR, CRP-CAU, CRP-CCB, CRP-COR, CRP-GOU, CRP-HRB, CRP-LET, CRP-MIN, CRP-OKR, CRP-ONI, CRP-PAR, CRP-RAD, CRP-SON, CRP-WCR, CRP-ZUC
- 1 Fruit: FRT-RME (annual rockmelon)
- 2 Indigenous/Specialty: CRP-DUR, CRP-GIN
- 3 Livestock: LIV-PBR, LIV-DCK, LIV-PLY

**27 FOOD_SECURITY** — staple, drought-tolerant, household + farm-staff food; reduces operating cost:
- 13 Crop: CRP-CWP, CRP-CUL, CRP-MOR, CRP-KAW, CRP-LAB, CRP-MAZ, CRP-MNB, CRP-PGP, CRP-RDR, CRP-RWT, CRP-SOR, CRP-URB, CRP-WNB
- 2 Fruit/Perennial: FRT-PLN, FRT-BRF
- 2 Indigenous/Specialty: CRP-OTA, CRP-ROU
- 2 Livestock: LIV-GOA, LIV-PIG (LIV-PIG inactive per Inviolable #8)
- 5 Root Crop: CRP-CAS, CRP-DAL, CRP-DTN, CRP-SPT, CRP-YAM
- 2 Support/Cover: SUP-LEG, SUP-NAP
- 1 Vegetable: CRP-URO

**25 LONG_TERM_ASSET** — perennial or 1+ year cycle; high-value; collateral-grade:
- 1 Apiculture: LIV-API
- 3 Cash Crop: CRP-COA, CRP-COF, CRP-VAN
- 2 Crop: CRP-CDM, CRP-KAV
- 5 Forestry: FOR-AGA, FOR-MAH, FOR-PIN, FOR-SAN, FOR-TEK
- 5 Fruit: FRT-CIT, FRT-NON, FRT-MAN, FRT-PAS, FRT-SRS
- 6 Fruit/Perennial: FRT-AVO, FRT-COC, FRT-CMQ, FRT-DRG, FRT-GUA, FRT-PAP
- 3 Livestock: LIV-CAT, LIV-DIR, LIV-SHP

**7 borderline classifications** with `suggested_layer = NULL` + `requires_classification_at_creation = TRUE`. Per Strike #98 Rule 4 (no Architect best-guess on Operator-domain decisions), these stay unset; farmer classifies per cycle at creation:

| ID | Crop | Borderline reason |
|---|---|---|
| FRT-BAN | BANANA | Cavendish-export = CASH_FLOW (weekly bunches) vs mixed/local stand = LONG_TERM_ASSET |
| FRT-PIN | PINEAPPLE | 18-24mo first crop (asset establishment) vs ratoon onwards (cash) |
| CRP-SUG | SUGARCANE | Multi-year ratoon (ASSET) vs annual harvest under FSC contract (CASH) |
| CRP-GAR | GARLIC | 5-6mo cycle, mostly imported in Fiji; small-scale local CASH vs household FOOD_SECURITY |
| CRP-PNT | PEANUT | Pacific groundnut = household protein primarily, can also be cash |
| CRP-POT | POTATO | Most Pacific potato is imported; locally-grown = small CASH vs FOOD_SECURITY |
| CRP-TUR | TURMERIC | Annual cycle (CASH) vs perennial production (ASSET) |

### Spread (DB confirmed)

| Layer | Count | % of catalog |
|---|---|---|
| CASH_FLOW | 35 | 37% |
| FOOD_SECURITY | 27 | 29% |
| LONG_TERM_ASSET | 25 | 27% |
| NULL (borderline) | 7 | 7% |
| **Total** | **94** | **100%** |

Roughly mirrors the doctrine's 50/30/20 target (skews toward CASH_FLOW because the catalog is vegetable-heavy; per-farm allocation will smooth based on actual cycle land share).

## Verification gates passed

- **Strike #90 PRE-CHECK clean**: All 94 proposed production_ids resolved against DB; zero drift, zero unresolved, zero DB-only orphans
- **Strike #72 asyncpg**: All DDL via separate `op.execute()` calls; multi-row UPDATE seeds use single statement with VALUES + JOIN
- **Strike #98 Rule 4**: 7 borderline rows defer to Operator per-cycle classification; no Architect best-guess
- **Strike #101 Rule 1**: layer column exists on `tenant.production_cycles` (NULL allowed; NOT NULL after Strike #104 onboarding backfill)
- **Strike #88**: Section 14 "Last commit:" unchanged

## What this strike does NOT do

- **Does NOT backfill `tenant.production_cycles.layer` for existing cycles** — Strike #104 (onboarding rebuild) will prompt Operator + farmers to classify each existing cycle on next login
- **Does NOT enforce NOT NULL on `tenant.production_cycles.layer`** yet — staged for after Strike #104 backfill completes
- **Does NOT change frontend** — Strike #105 (Farm Dashboard 3-Layer reshape) and Strike #106 (catalog filtering) are downstream
- **Does NOT compute layer-rolled-up CoKG** — Strike #107 ships that
- **Does NOT modify Bank Evidence PDF** — Strike #108 ships that

## Backlog

- **Strike #104** (next): Onboarding rebuild around 3-Layer mental model — establishes farmer's layer mix BEFORE cycle creation, backfills existing cycles via prompt-on-login flow
- **Strike #105**: Farm Dashboard 3-Layer reshape (per Strike #101 Rule 3)
- **Strike #106**: (+) catalog layer filter (per Strike #101 Rule 6)
- **Strike #107**: CoKG aggregation by layer + Decision Engine RULE-X (allocation drift signal at >5pp from 50/30/20)
- **Strike #108**: Bank Evidence PDF restructure with 3-layer narrative

### B77 (NEW — codified by this commit)

**CLAUDE.md `Strikes filed: 1-N` counter convention**: N tracks the highest strike number on disk (archive file exists in `00_project_overview/strikes/`), regardless of ship status. BACKLOG-only strikes count toward N. Codified in Strike #103 ship under Operator confirmation.

Rationale: counter is monotonic and represents the highest strike number of any kind on disk. Operator + Architect can both reason "what's the latest strike?" by reading one line. BACKLOG strikes still represent filed work (just not yet implemented).

Example: Strike #102 was filed BACKLOG in the Strike #100 commit; Strike #103 ships now. Counter goes `1-101 → 1-103` (skips 102 mentally because no separate ship commit, but #102 archive file existed since Strike #100; counter aligned with that filing-on-disk semantic going forward).

## Filed during

2026-05-05, after Strike #101 doctrine and B75 Operator review. Foundation for Strikes #104-#108. Doctrine binding from Strike #101 forward; this strike ships the schema rails.

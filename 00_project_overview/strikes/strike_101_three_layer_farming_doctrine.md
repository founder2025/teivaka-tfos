# Strike #101 — The 3-Layer Farming System Doctrine

## The doctrine

TFOS structures all farming activity around three layers, not eleven pillars. Pillars (CROPS, LIVESTOCK, POULTRY, BEES, AQUACULTURE, FORESTRY, etc.) describe WHAT a farmer produces. Layers describe WHY. Every cycle, production unit, and crop instance carries a layer classification that anchors the platform's economic intelligence.

## Operator's verbatim framework (2026-05-05)

> "Farming doesn't have a universal 'fixed' number of categories — it's classified differently depending on purpose, scale, system, and output. If you don't define it properly, you'll build a messy operation.
>
> There's no value in 'knowing categories' unless it sharpens your strategy. Most farmers stay broke because they operate in random mixed categories without system design.
>
> What's broken in most setups:
> - No classification = no structure
> - Mixing crops without cash flow planning
> - No separation between short-term vs long-term crops
> - No system linking farming type → revenue model
>
> Fix (Teivaka context):
> Forget 20 categories. Run this:
>
> **Teivaka Farming System = 3 Layers**
>
> 1. **Cash Flow Engine** — Eggplant, Cucumber, Cabbage, Capsicum. Weekly/biweekly income.
> 2. **Food Security Layer** — Cassava, Dalo, Sweet Potato. Reduces food cost + stabilizes operations.
> 3. **Long-Term Asset Crops** — Kava, Dragon Fruit, Papaya, Guava. Long-term, high-value returns.
>
> Everything you plant must fit ONE of these. Balance: 50% cash flow / 30% asset / 20% food security."

— Operator (Cody / Boss), Founder, Teivaka PTE LTD

## The three layers

### Layer 1 — Cash Flow Engine

**Purpose:** weekly / biweekly revenue. Pays operating costs, wages, ferry transport, M-PAiSA float.
**Crop characteristics:** short cycle (4-12 weeks), high turnover, market-validated demand, supply-chain proven.
**Examples (Pacific reality):** Eggplant, Cucumber, Cabbage, Capsicum, Tomato, French Beans, Long Bean, Chillies, Lettuce, Bok Choy.
**Livestock equivalents:** Broiler chicken (6-8 week cycles), Layer eggs (daily revenue), Tilapia (4-6 month grow-out).
**Bank Evidence framing:** "Farmer generates FJD $X/week from Cash Flow Engine; consistent revenue trajectory; primary loan-repayment surface."

### Layer 2 — Food Security Layer

**Purpose:** household + farm-staff food. Reduces operating cost. Stabilizes operations against price shocks. Risk hedge.
**Crop characteristics:** medium cycle (3-9 months), staple, drought-tolerant, locally-known, low input.
**Examples (Pacific reality):** Cassava, Dalo (Taro), Dalo ni Tana, Sweet Potato, Yam, Plantain, Breadfruit.
**Livestock equivalents:** Goat (ceremonial + meat), Pig (when active), Backyard layer.
**Bank Evidence framing:** "Farmer reduces FJD $Y/month operating cost via Food Security Layer; cost discipline signal; improves debt-service ratio."

### Layer 3 — Long-Term Asset Crops

**Purpose:** wealth building, intergenerational value, premium market positioning. Maturity 1-7 years.
**Crop characteristics:** perennial or long-cycle, high-value, premium market access, collateral-grade.
**Examples (Pacific reality):** Kava (yaqona), Dragon Fruit, Papaya, Guava, Mango, Coconut (mature stand), Sandalwood, Vanilla, Cocoa, Coffee.
**Livestock equivalents:** Beef cattle (24+ month grow-out), Dairy cattle, Apiculture (honey produces year 2+).
**Bank Evidence framing:** "Farmer holds Asset Crops portfolio with FJD $Z projected maturity value; collateral signal; long-horizon farm asset development."

## The 50 / 30 / 20 land allocation rule

**Operator-locked target balance:**
- **50% of land** → Cash Flow Engine
- **30% of land** → Long-Term Asset Crops
- **20% of land** → Food Security Layer

A farm dashboard surfaces actual vs target allocation. Drift past 5pp triggers a Decision Engine signal recommending rebalancing.

## Six binding rules

### Rule 1 — Every cycle carries a layer classification
Every row in `tenant.production_cycles` has a `layer` enum: `CASH_FLOW` | `FOOD_SECURITY` | `LONG_TERM_ASSET`. Required NOT NULL on cycle creation. Default suggested by `shared.productions.suggested_layer` when farmer creates a new cycle; farmer can override.

### Rule 2 — Pillars describe WHAT, layers describe WHY
The 11 pillars (CROPS, LIVESTOCK, POULTRY, BEES, etc.) are the production taxonomy. The 3 layers are the strategy taxonomy. **Both coexist. Neither replaces the other.** A POULTRY broiler operation IS a Cash Flow Engine layer. A POULTRY backyard layer IS Food Security. Same pillar, different layers.

### Rule 3 — Dashboard reshapes around layers
Farm Dashboard presents three top-level rows by layer (Cash Flow / Food Security / Asset). Within each row: net revenue trajectory, active cycles, land allocation %. Pillar breakdown is a secondary drill-down within each layer.

### Rule 4 — CoKG aggregates by layer
Cost-of-Goods-Knockoff (CoKG / FJD-per-kg) computed per cycle as today, but rolled up by layer for farm-level economic signal. Bank Evidence PDF leads with three-layer P&L narrative, not pillar-by-pillar list.

### Rule 5 — Onboarding establishes layer mix first
New-farm onboarding asks: "What's your Cash Flow Engine?" → "What's your Food Security Layer?" → "What are your Asset Crops?" before farmer creates first cycle. Pillar selection is downstream of layer selection. Farmer's mental model anchored in WHY before WHAT.

### Rule 6 — (+) catalog filters by layer
When farmer creates a new event in Solo or Growth mode, (+) catalog can filter by active layers. "Show me only Cash Flow Engine events" surfaces shorter-cycle events relevant to that layer's economics.

## Architectural impact (sequenced strikes)

This doctrine reshapes 8 architectural surfaces. Each becomes a distinct strike in the sequence:

| Strike | Surface | Estimated effort |
|---|---|---|
| Strike #102 | Full varieties catalog (already filed BACKLOG) | 30-45 min |
| Strike #103 | Schema migration: `layer` enum on production_cycles + `suggested_layer` on shared.productions | 45-60 min |
| Strike #104 | Onboarding rebuild around 3-Layer mental model | 60-90 min |
| Strike #105 | Farm Dashboard 3-Layer reshape | 60-90 min |
| Strike #106 | (+) catalog layer filtering + per-layer event recommendations | 30-45 min |
| Strike #107 | CoKG aggregation by layer + Decision Engine signal RULE-X (allocation drift) | 45-60 min |
| Strike #108 | Bank Evidence PDF restructure with 3-layer narrative | 60-90 min |
| Strike #109 | Naming Dictionary populates layer terminology (Section 4 of CLAUDE.md) | part of B74 / Naming session |

**Total architectural absorption:** 6-8 focused sessions, sequenced per Strike #79 (foundational completion first).

## What this doctrine does NOT do

- Does NOT replace pillars (CROPS, LIVESTOCK, etc.) — both taxonomies coexist
- Does NOT force farmers into rigid 50/30/20 allocation — target only, drift is signal not error
- Does NOT auto-assign layers to existing cycles — farmer reviews + classifies via onboarding hook
- Does NOT block existing CROPS pillar work — Strike #100's three-dropdown form architecture remains the form-level pattern; layer is an additional anchor on cycles, not a replacement for crop identity

## Why earlier strikes don't catch this

Strike #79 (foundational completion first) governs phase ordering, not architectural classification. Strike #98 (Vertical Completeness Doctrine) governs catalog density, not strategic categorization. Strike #100 (three-dropdown Crops form) governs form-level identity capture, not farm-level economic structure.

Strike #101 adds the strategic layer above all of those: the WHY beneath the WHAT.

## Bank Evidence credibility implication

A loan officer reading a Bank Evidence PDF generated post-Strike-#108 sees:

> "Farmer Cody runs disciplined 50/30/20 allocation:
> - **Cash Flow Engine (52%)** — Eggplant + Cucumber + Cabbage cycles generating FJD $2,400/month gross, FJD $1,650/month net
> - **Food Security Layer (18%)** — Cassava + Dalo reduce household + farm-staff food cost FJD $400/month
> - **Long-Term Asset Crops (30%)** — Kava (year 3), Dragon Fruit (year 1.5), Papaya (year 1) maturing for FJD $14,200 projected at year-end
>
> Verified via 47 anchored cycle events, audit chain hash 0xabc123..., public verification at /verify/<id>"

Three-layer = three-axis credit signal. Cash Flow Layer = repayment capacity. Asset Crops = collateral building. Food Security = cost discipline. **This is the moat.**

## Backlog opened by Strike #101

- **Strike #103**: `layer` enum migration + `suggested_layer` on shared.productions (~80 productions need layer classification — Operator-locked taxonomy per Strike #98 Rule 4; Architect proposes, Operator confirms per crop)
- **Strike #104**: Onboarding 3-Layer flow rebuild
- **Strike #105**: Farm Dashboard 3-Layer reshape
- **Strike #106**: (+) catalog layer filter
- **Strike #107**: CoKG aggregation + Decision Engine RULE-X (allocation drift signal)
- **Strike #108**: Bank Evidence PDF restructure
- **B75 (NEW)**: Operator confirms suggested_layer per production for all ~80 productions — required for Strike #103. Estimated 15-20 min Operator review (CASSAVA → FOOD_SECURITY; KAVA → LONG_TERM_ASSET; EGGPLANT → CASH_FLOW; etc. for ~80 rows).
- **B76 (NEW)**: Layer terminology in naming_dictionary — "Cash Flow Engine" / "Food Security Layer" / "Long-Term Asset Crops" plus farmer-facing equivalents. Ships in Naming Dictionary session.

## Filed during

2026-05-05, immediately after Strike #100 close. Operator delivered the framework verbatim during foundation marathon. Doctrine binding from this commit forward across all Strike #102+ work.

# Prototype V262 — Coverage Matrix · CANONICAL PAGE INDEX (audit scope)

> **CORRECTION (drift fixed):** the audit scope is the nav the prototype
> **actually renders** — `NAV.farm_unified` (`state.vertical = 'unified'`,
> Boss-locked). The legacy `NAV.farm` (which listed Cycles / Harvests / Field
> events as separate pages) is **NOT** what v262 renders. **There is no
> top-level Cycles or Harvests page.** That content is folded into **Production**
> (`coreProductionView`, a rollup dashboard) and **Enterprises**
> (`coreEnterprisesView`, the per-business surface where crop/animal events are
> logged via `launchEventForm`).
>
> This index is the single source of truth for what gets audited. All modules
> are decomposed **prototype-only**.

## The 20 farm pages (exactly the rendered left-nav)
| # | Nav label | id | Render fn | Lock | Audit status |
|---|---|---|---|---|---|
| 1 | Overview | overview | `coreOverviewV801` | — | ✅ COMPLETE (~55) |
| 2 | Farm History | history | (history view) | — | ☐ todo |
| 3 | Tasks | tasks | `coreTasksView` | — | ✅ COMPLETE (~35) |
| 4 | Decision Center | decisions | (decisions view) | 🔒 | ☐ todo |
| 5 | Enterprises | enterprises | `coreEnterprisesView` | 🔒 | ✅ COMPLETE (~45) — absorbs cycle/harvest mgmt |
| 6 | Production | production | `coreProductionView` | — | ✅ COMPLETE (~20) — cycles/harvests rollup |
| 7 | Inventory | inventory | (inventory view) | — | ☐ todo |
| 8 | Labor | labor | `coreLaborView` | — | ✅ COMPLETE (~130) |
| 9 | Buyers | buyers | (buyers view) | — | ☐ todo |
| 10 | Cash | cash | `cashOverviewView` | — | ✅ COMPLETE (~50) |
| 11 | Assets & Equipment | equipment | (equipment view) | — | ☐ todo |
| 12 | Locations | locations | (locations view) | — | ☐ todo |
| 13 | Compliance | compliance | `complianceStatusView` | — | ✅ COMPLETE (~75) |
| 14 | Analytics | analytics | (analytics view) | — | ☐ todo |
| 15 | Reports | reports | (reports view) | — | ☐ todo |
| 16 | Weather | weather | (weather view) | 🔒 | ☐ todo |
| 17 | Library | library | (library view) | — | ☐ todo |
| 18 | Gallery | gallery | (gallery view) | 🔒 | ☐ todo |
| 19 | Partnerships | partnerships | (partnerships view) | 🔒 | ☐ todo |
| 20 | Settings | settings | (settings view) | 🔒 | ☐ todo |

(Lock 🔒 = padlock shown in nav. Top pillars Home / Classroom / TIS / Me are separate from the Farm nav and audited last.)

## Reconciliation of prior modules
| Prior matrix file | Verdict |
|---|---|
| `COVERAGE_MATRIX_LABOUR.md` | ✅ valid — "Labor" IS page #8 |
| `COVERAGE_MATRIX_COMPLIANCE.md` | ✅ valid — "Compliance" IS page #13 |
| `COVERAGE_MATRIX_CASH.md` | ✅ valid — "Cash" IS page #10 |
| `COVERAGE_MATRIX_CYCLES.md` | ⚠️ **MIS-SCOPED** — "Cycles" is not a page. Content belongs under **Production (#6) + Enterprises (#5)**. Retained as sub-surface reference; banner added. |
| `COVERAGE_MATRIX_HARVESTS.md` | ⚠️ **MIS-SCOPED** — "Harvests" is not a page. Content belongs under **Production (#6) + Enterprises (#5)**. Retained as sub-surface reference; banner added. |

## Corrected go-forward order
Audit the real pages, prototype-only, to the Labour/Compliance depth bar:
**Production (#6)** → **Enterprises (#5)** (these two reconcile the cycles/harvest content) → Overview → Tasks → Inventory → Buyers → Assets & Equipment → Locations → Analytics → Reports → Decision Center → Farm History → Weather → Library → Gallery → Partnerships → Settings → then Home/Classroom/TIS/Me.

**Done: 7 / 20 farm pages** (Overview, Tasks, Enterprises, Production, Labor, Cash, Compliance).

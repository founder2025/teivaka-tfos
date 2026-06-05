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
| 2 | Farm History | history | `coreHistoryView` | — | ✅ COMPLETE (~15) |
| 3 | Tasks | tasks | `coreTasksView` | — | ✅ COMPLETE (~35) |
| 4 | Decision Center | decisions | `coreDecisionView` | 🔒 | ✅ COMPLETE (~20) |
| 5 | Enterprises | enterprises | `coreEnterprisesView` | 🔒 | ✅ COMPLETE (~45) — absorbs cycle/harvest mgmt |
| 6 | Production | production | `coreProductionView` | — | ✅ COMPLETE (~20) — cycles/harvests rollup |
| 7 | Inventory | inventory | `coreInventoryView` | — | ✅ COMPLETE (~50) |
| 8 | Labor | labor | `coreLaborView` | — | ✅ COMPLETE (~130) |
| 9 | Buyers | buyers | `coreBuyersView` | — | ✅ COMPLETE (~55) |
| 10 | Cash | cash | `cashOverviewView` | — | ✅ COMPLETE (~50) |
| 11 | Assets & Equipment | equipment | `coreEquipmentView` | — | ✅ COMPLETE (~55) |
| 12 | Locations | locations | `coreLocationsView` | — | ✅ COMPLETE (~25) |
| 13 | Compliance | compliance | `complianceStatusView` | — | ✅ COMPLETE (~75) |
| 14 | Analytics | analytics | `coreAnalyticsView` | — | ✅ COMPLETE (~55) |
| 15 | Reports | reports | `coreReportsView` | — | ✅ COMPLETE (~50) |
| 16 | Weather | weather | `coreWeatherView` | 🔒 | ✅ COMPLETE (~20) |
| 17 | Library | library | `producerLibrary` | — | ✅ COMPLETE (~25) |
| 18 | Gallery | gallery | `coreGalleryView` | 🔒 | ✅ COMPLETE (~25) |
| 19 | Partnerships | partnerships | `corePartnershipsView` | 🔒 | ✅ COMPLETE (~30) |
| 20 | Settings | settings | `coreSettingsView` | 🔒 | ✅ COMPLETE (~25) |

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

**Done: 20 / 20 farm pages — FARM NAV AUDIT COMPLETE.**

## Top-pillar + public surfaces (beyond Farm nav)
| Surface | Module file | Status |
|---|---|---|
| Home pillar (Feed/Following/Marketplace/Directory/Saved) | COVERAGE_MATRIX_HOME_PILLAR.md | ✅ ~60 |
| Classroom pillar | COVERAGE_MATRIX_CLASSROOM_PILLAR.md | ✅ ~20 |
| TIS pillar | COVERAGE_MATRIX_TIS_PILLAR.md | ✅ ~30 |
| Me / Profile | COVERAGE_MATRIX_ME_PROFILE.md | ✅ ~45 |
| Auth + Public Verify/Covenant + Control Room | COVERAGE_MATRIX_AUTH_PUBLIC_CONTROLROOM.md | ✅ ~50 |

## 🏁 TOTAL PROTOTYPE COVERAGE = 100% — ~1,100+ objects across 26 modules.

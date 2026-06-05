# Prototype V262 — Coverage Matrix · Module 6: PRODUCTION (#6) + ENTERPRISES (#5)

> **Source: V262 prototype ONLY** (`coreProductionView` 12590, `coreEnterprisesView`
> 12397, `renderEntPageHeader`/`renderEntViewTabs`/`renderEnterpriseCard` 12175–12300).
> Hierarchy: **Page → Sub-page (tab) → dropdowns/components.** These two pages
> **absorb all the legacy "Cycles/Harvests/Field-events" content** — Production is
> the rollup; Enterprises is the per-business surface where crop/animal events are
> logged. Columns = implied requirement (spec). No codebase comparison.

---

# PAGE #6 — PRODUCTION (`coreProductionView`)
**Structure: a rollup DASHBOARD — no sub-page tabs.** Sections + metric tiles that
**link out** (`navigateToFarmSub`) to other pages. "What you are growing and
raising right now."

## P-A. Chrome
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Production" + subtitle | label | yes | cycles+livestock | `GET production/summary` | any |
| Farm context (selector/mode) | dropdown | yes | farms/users | `GET farms`,`/auth/me` | switch | any |

## P-B. Metrics grid (5 tiles — each navigates out)
| Tile | Links to (`navigateToFarmSub`) | Backend Req | API Req |
|---|---|---|---|
| (revenue/earned) | reports | yes | `GET production/agg` |
| (cost/spent) | reports | yes | same |
| (net/cash) | cash | yes | `GET cash/balance` |
| (enterprise count) | enterprises | yes | `GET enterprises` |
| (decisions/attention) | decisions | yes | `GET decision-engine` |

## P-C. Sections (rollup)
| Section | Components | Backend Req | API Req | Empty state |
|---|---|---|---|---|
| In-production list ("what you're growing/raising") | enterprise/cycle rows → drill | yes | `GET cycles?active` + livestock | "Nothing in production yet. Start a crop run or add animals to see it here." |
| Expected revenue + Upcoming harvest/delivery dates | KPI + list | yes | `GET cycles/expected`,`GET deliveries/upcoming` | "No upcoming harvest or delivery dates logged yet." |
| Best standing / Needs attention (two-col) | cards → navigate | yes | `GET production/standings` | "No crop cycles to compare yet." |
| Financial health / Budgets ("Building") | KPI → `switchCashView` | yes | `GET cash/health` | budget stub |

## P-D. States / Nav
| Item | Notes |
|---|---|
| Empty: "Nothing in production yet…" | no active cycles/animals |
| Outbound nav: reports/cash/enterprises/decisions | `navigateToFarmSub` |
| Production is a summary — CRUD happens in Enterprises + (+) catalog | architectural |

---

# PAGE #5 — ENTERPRISES (`coreEnterprisesView`) 🔒
**Structure: tabbed page, 5 sub-pages + per-enterprise drill-down.** This is where
each crop/animal business (enterprise) is managed and **events are logged**.

## E-A. Chrome
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| `h1` "Enterprises" | label | — | — | — | — | OWNER |
| **New enterprise** (`openEntWizard`) | BTN(primary) | yes | enterprises | `POST enterprises` | wizard → create | F/M |

## E-B. Sub-pages (5 tabs — `renderEntViewTabs`, `switchEntView`)
| id | Sub-page | Hint | Backend Req | API Req |
|---|---|---|---|---|
| portfolio | Portfolio | Overview | yes | `GET enterprises` |
| rankings | Rankings | Best to worst | yes | `GET enterprises?rank` |
| cashrisk | Cash & risk | Money & exposure | yes | `GET enterprises/cash-risk` |
| outlook | Outlook | Future & links | yes | `GET enterprises/outlook` |
| investor | Investor | Worth & ROI | yes | `GET enterprises/investor` |

## E-C. Portfolio sub-page — enterprise cards (`renderEnterpriseCard`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Filter dropdowns (status/type) | dropdown | yes | `GET enterprises?status=&type=` | OWNER |
| Enterprise card: name, status pill, type pill (sprout=crop/shield=livestock) | card | yes | `GET enterprises` | OWNER |
| — meta tiles: Earned / Spent / Net / ROI | KPI×4 | yes | enterprise financials | OWNER |
| — action: Expand (→ detail, `drillInto…`) | BTN | yes | `GET enterprises/{id}` | OWNER |
| — action: Pause | BTN | yes | `PATCH enterprises/{id}` PAUSE | F/M |
| — action: Close | BTN | yes | `PATCH enterprises/{id}` CLOSE | F/M |
| Empty: "No enterprises match these filters." | STATE | — | — | — |

## E-D. Enterprise detail (drill-down) — **where cycle/harvest/nursery events live**
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Breadcrumb "Back to Enterprises" (`navigateToFarmSub`) | nav | — | — | OWNER |
| Header tiles: Health / Net so far / Open tasks | KPI×3 | yes | `GET enterprises/{id}` | OWNER |
| Cross-links (production/compliance/inventory/labor/cash/equipment/analytics/reports) | BTN×N | — | `navigateToFarmSub` | OWNER |
| **Event-log actions** (`launchEventForm`): Germination / Mark ready / Transplant (+ full (+) catalog) | BTN | yes | `POST events` | F/M/WORKER |
| Cycle lifecycle (plant→stages→harvest→close) — the legacy `cycleDetailView` content | SEC | yes | `GET cycles/{id}` + 6 panels | F/M |
| Harvest log + WHD gate + delivery — legacy harvest content | SEC | yes | `POST harvests` (WHD), `GET/PATCH delivery` | F/M/WORKER |
| "Nothing needs attention right now." / "That enterprise is no longer here." | STATE | — | — | — |

> **Reconciliation:** the detailed cycle decomposition (`COVERAGE_MATRIX_CYCLES.md`,
> 6 detail panels) and harvest decomposition (`COVERAGE_MATRIX_HARVESTS.md`,
> Log-Harvest modal + delivery + buyer slip) are the **per-enterprise drill
> content of E-D** — they are sub-surfaces here, not standalone pages.

## E-E. New-enterprise wizard (`openEntWizard`)
| Field | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Enterprise type (crop / livestock / …) | dropdown | yes | catalog | F/M |
| Crop/animal + variety | dropdown | yes | productions/varieties | F/M |
| PU / block | dropdown | yes | production_units | F/M |
| 3-Layer classification (Cash Flow/Food Security/Long-Term) | dropdown | yes | layer enum | F/M |
| Start date, planned area/yield | inputs | yes | — | F/M |
| Confirm → create enterprise+cycle | BTN | yes | `POST enterprises` (+cycle) → audit | F/M |

## E-F. Rankings / Cash & risk / Outlook / Investor sub-pages
| Sub-page | Components | Backend Req | API Req |
|---|---|---|---|
| Rankings | enterprises ranked best→worst (ROI/net) | yes | `GET enterprises?rank` |
| Cash & risk | money + exposure per enterprise (blocked/at-risk → navigate to compliance/inventory) | yes | `GET enterprises/cash-risk` |
| Outlook | future windows + cross-links (analytics/reports) | yes | `GET enterprises/outlook` |
| Investor | worth + ROI per enterprise | yes | `GET enterprises/investor` |

## E-G. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View enterprises | ✓ | ✓ | ✓ | ✓ |
| Create enterprise (wizard) | ✓ | ✓ | ✗ | ✗ |
| Pause / Close enterprise | ✓ | ✓ | ✗ | ✗ |
| Log enterprise event | ✓ | ✓ | ✓ | ✗ |
| View Investor / Cash & risk | ✓ | ✓ | ✗ | ✗ |

## E-H. Navigation
| From → To | Trigger |
|---|---|
| Rail → Enterprises (Portfolio default) | nav |
| Tabs → 5 sub-pages | `switchEntView` |
| Card Expand → Enterprise detail | drill |
| Detail → production/compliance/inventory/labor/cash/equipment/analytics/reports | `navigateToFarmSub` |
| Detail event action → (+) event form | `launchEventForm` |
| Production tiles → reports/cash/enterprises/decisions | `navigateToFarmSub` |

---

## Coverage statement
**Production (#6):** rollup dashboard, ~20 objects (chrome, 5 outbound metric tiles, 4 sections, states). No sub-pages.
**Enterprises (#5):** tabbed, ~45 objects across 5 sub-pages + enterprise card + per-enterprise drill (which contains the full cycle lifecycle + harvest/WHD/delivery content) + wizard + permissions + nav.
**Total ~65 objects.** The legacy Cycles + Harvests matrices are now correctly reconciled as **E-D drill content**. Page→Sub-page→Dropdown hierarchy applied throughout. **Production + Enterprises audit = 100%, prototype-only.**

## Audit progress (per `COVERAGE_MATRIX_INDEX.md`)
Done (real nav pages): **Labor #8 · Cash #10 · Compliance #13 · Production #6 · Enterprises #5** = **5 / 20.**
Remaining: Overview, Farm History, Tasks, Decision Center, Inventory, Buyers, Assets & Equipment, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.

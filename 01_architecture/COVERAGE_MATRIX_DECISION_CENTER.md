# Prototype V262 — Coverage Matrix · Module 15: DECISION CENTER (#4) 🔒 (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreDecisionView` 13378). Hierarchy: Page →
> sections → components. Columns = implied requirement. No codebase comparison.
> Locked (🔒) nav item — the focused decision-support surface that turns signals
> into "the one call right now".

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Decision Center | `/farm/decisions` (locked) | `coreDecisionView` | single focused decision surface (no tabs) |

## 1. Chrome + headline decision
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Decision Center" | label | — | — | — | OWNER |
| **"The call right now"** headline recommendation (crosshair) | SEC | yes | `GET decision-engine/top` | prescribed action | OWNER |

## 2. Signal sections
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Signal cards (RED/AMBER/GREEN, from Decision Engine) | KPI×N | yes | `GET decision-engine/signals` | — |
| Cross-links to source pages (tasks/cash/…) | BTN | — | `navigateToFarmSub` | nav |
| Signal → drill / detail | nav | yes | `GET decision-engine/signals/{id}` | — |

## 3. Recommendation cards
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Recommendation card (prescribed action + rationale) | card | yes | `GET decision-engine/recommendations` | — | OWNER |
| Generate task from recommendation | BTN | yes | `POST tasks` | recommendation→task | F/M |

## 4. Decision context tiles
| Tile | Backend Req | API Req | Notes |
|---|---|---|---|
| Bank readiness ("Building") | yes | `GET credit-score` | award icon |
| Return on what you spend (ROI) | yes | `GET analytics/roi` | dollar |
| Hours this week / Wages owed / Avg per worker | yes | `GET labor/agg`,`GET wages/owed` | labour context |

## 5. States / Permissions / Nav
| Item | Notes |
|---|---|
| Snapshot honesty (pre-computed, stale flag) | never on-demand |
| Empty: "Nothing needs a decision right now." | STATE |
| Locked feature (🔒) — gated capability | access |
| Permissions: OWNER/F/M view; Generate task = F/M | inferred |
| The call → Generate task → Tasks; signal → source page | loop |

## 6. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `DECISION_SIGNALS` (shared with Analytics) | tenant.decision_signal_snapshots |
| recommendations | `tenant.actionable_rules` / decision engine output |

---

## Decision Center — COMPLETE coverage statement
**~20 objects** across chrome, "the call right now" headline, signal cards (cross-linked), recommendation cards + generate-task, decision context tiles (bank readiness / ROI / labour), states, permissions, navigation, data. Focused decision-support surface (no tabs). **Decision Center audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: #1 Overview · #3 Tasks · #4 Decision Center · #5 Enterprises · #6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Equipment · #12 Locations · #13 Compliance · #14 Analytics · #15 Reports = **14 / 20.**
Remaining: Farm History, Weather, Library, Gallery, Partnerships, Settings.

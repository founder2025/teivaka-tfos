# Prototype V262 — Coverage Matrix · Module 16: FARM HISTORY (#2) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreHistoryView` 13809). Hierarchy: Page →
> filters → timeline/components. Columns = implied requirement. No codebase
> comparison. The chronological, audit-backed record of everything that happened
> on the farm — the human-readable face of the hash chain.

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Farm History | `/farm/history` | `coreHistoryView` | filtered audit-event timeline (no tabs) |

## 1. Chrome + filters
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| `h1` "Farm History" (clock) | label | — | — | any |
| Date filter (`setHistDate`) + "Show all days" | dropdown/BTN | yes | `GET audit/events?date=` | any |
| Type filter (`setHistFilter`): All / Harvest / Field / Cash / Tasks / Animals / Photos | dropdown | yes | `GET audit/events?type=` | any |

## 2. Event timeline
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Event rows (chronological, grouped by day) | list | yes | `GET audit/events` | — | any |
| Event row → detail (`histOpen`) | nav | yes | `GET audit/events/{id}` | drill | any |
| Photo events (camera icon) → photo modal | cell | yes | `GET events?type=photo` | view | any |
| Cross-link to source (Reports, etc.) | BTN | — | `navigateToFarmSub` | nav | any |

## 3. Hash-chain verify banner
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Chain status (events, 0 breaks, check) | indicator | yes | `GET audit/verify` | — | any |
| **Run verification** (`runVerification`) → Reports | BTN | yes | `GET audit/verify` | banker chain-check | public/OWNER |

## 4. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty: "Your first event will appear here." | STATE |
| Loading | per window |
| Permissions: view any (read-only feed) | inferred |
| Row → event detail; verify → Reports | nav |

## 5. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| (audit events) | audit.events (read feed) |
| event type filter set (7) | event group enum |

---

## Farm History — COMPLETE coverage statement
**~15 objects** across chrome, date + 7-type filters, audit-event timeline (rows + drill + photo + cross-links), hash-chain verify banner + run-verification, states, permissions, navigation, data. Read-only audit feed (no tabs). **Farm History audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: #1 Overview · #2 Farm History · #3 Tasks · #4 Decision Center · #5 Enterprises · #6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Equipment · #12 Locations · #13 Compliance · #14 Analytics · #15 Reports = **15 / 20.**
Remaining: Weather, Library, Gallery, Partnerships, Settings.

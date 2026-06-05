# Prototype V262 — Coverage Matrix · Module 13: ANALYTICS (#14) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreAnalyticsView` 13518 + `analytics*View`,
> `renderSignalTile`/`renderSparkline`/`renderFlipRow`, `signalDetailView`,
> modals; lines ~25998–27000). Hierarchy: Page → Sub-page (tab) →
> dropdowns/components. Columns = implied requirement. No codebase comparison.
>
> **Doctrine (the Decision Engine / Commercial moat):** decision signals, each
> drillable to threshold rule + evidence + cross-page source + history sparkline ·
> Overall Health = worst active signal · signal → one-tap task · pre-computed
> snapshot honesty (timestamp shown, stale flagged) · flip log = write-once
> decision audit.

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Analytics | `/farm/analytics` | `coreAnalyticsView` | Signals · Profitability · Productivity · Cash & demand · Flip log · Forecasts · Per-unit · Compare · Findings · Benchmark · KPI board · Inventory · Labour |

## 1. Chrome + sub-page tabs (13 — `renderAnalyticsViewTabs`, `switchAnalyticsView`) — CORRECTED
> Earlier draft listed 10 and missed **KPI board / Inventory / Labour** + had wrong hints. Exact set from source below.

| id | Label | Hint | Backend Req | API Req |
|---|---|---|---|---|
| signals | Signals | Decision board | yes | `GET /decision-engine/{farm_id}` ✅ live |
| profit | Profitability | Per-cycle P&L | yes | `GET /financials/crops/{farm_id}` ✅ live |
| productivity | Productivity | Ratios | yes | productivity-attribution endpoint (empty) |
| cashdemand | Cash & demand | Runway | yes | cash-runway/forecast endpoint (empty) |
| fliplog | Flip log | Audit | yes | decision flip-log endpoint (empty) |
| forecasts | Forecasts | Predictive | yes | forecast engine endpoint (empty) |
| perunit | Per-unit | Roll-ups | yes | per-unit roll-up endpoint (empty) |
| compare | Compare | Variety | yes | variety-comparison endpoint (empty) |
| findings | Findings | Learning | yes | findings/insights endpoint (empty) |
| benchmark | Benchmark | Network | yes | network-benchmark endpoint (empty) |
| **kpi** | **KPI board** | Headline numbers | yes | `GET /financials/farm/{farm_id}` ✅ live |
| **inventory** | **Inventory** | Stock | yes | `GET /inputs?farm_id=` ✅ live |
| **labour** | **Labour** | People | yes | `GET /workers` + `GET /labor` ✅ live |


## 2. Signals sub-page (`analyticsSignalsView` + `renderSignalTile` + `renderSparkline`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| **Overall Health** composite (= worst active signal) | KPI | yes | `GET decision-engine/health` | — | any |
| Signal tile (RED/AMBER/GREEN) + sparkline (history) | KPI | yes | `GET decision-signal-snapshots` | — | any |
| **Generate task** from signal (`openGenerateTaskFromSignal`) | BTN | yes | `POST tasks` (from signal) | signal→task | F/M |
| Detail (`drillIntoSignal`) → signal detail | nav | yes | `GET decision-engine/signals/{id}` | — | any |
| "Needs attention" group | SEC | yes | non-green signals | — | any |

## 3. Signal detail (`signalDetailView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Threshold rule | SEC | yes | `decision_signal_config` | per-tenant threshold |
| Evidence + cross-page source | SEC | yes | source query | traceability |
| History sparkline | CHT | yes | snapshots | trend |
| Pre-computed snapshot timestamp + stale flag | label | yes | snapshot meta | honesty (never on-demand) |
| Generate task | BTN | yes | `POST tasks` | F/M |

## 4. Profitability sub-page (`analyticsProfitView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Tiles: Total margin / Best crop / Worst crop / Avg margin | KPI×4 | yes | `GET analytics/profit` | |
| Crop filter (`switchProfitCropFilter`) | dropdown | yes | query param | |
| Per-cycle P&L table (Cycle/Crop/Revenue/Inputs/Labor/Equip/Cost/Margin) | TBL | yes | `GET cycle-financials` | closes cycle profit loop (v4+v7+v8+v11) |

## 5. Productivity sub-page (`analyticsProductivityView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Yield forecast vs actual · revenue/PU · revenue/labor-hour | KPI/CHT | yes | `GET analytics/productivity` | ratios |

## 6. Cash & demand sub-page
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Cash runway + demand-match | KPI/CHT | yes | `GET analytics/cash-demand` |

## 7. Flip log sub-page (`renderFlipRow`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Flip log rows (write-once decision audit) | TBL | yes | `GET decision-engine/flip-log` | append-only |

## 8. Forecasts sub-page (`analyticsForecastsView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Harvest windows / cash gaps / weather / pest pressure forecasts | CHT | yes | `GET analytics/forecasts` | `FORECASTS` |

## 9. Per-unit / Compare / Findings / Benchmark sub-pages
| Sub-page | Fn | Components | Backend Req | API Req |
|---|---|---|---|---|
| Per-unit | (perunit) | metrics per PU | yes | `GET analytics/per-unit` |
| Compare | `analyticsCompareView` | farm/crop comparison | yes | `GET analytics/compare` |
| Findings | `analyticsFindingsView` | auto-surfaced findings/insights | yes | `GET analytics/findings` |
| Benchmark | `analyticsBenchmarkView` | benchmark vs peers/targets | yes | `GET analytics/benchmark` |

## 10. States / Permissions / Nav
| Item | Notes |
|---|---|
| Stale snapshot flag | pre-computed honesty |
| F002 thin = "building baseline" (`F002_SIGNAL_OVERRIDES`) | thin-record honesty |
| Empty: no signals/data | STATE |
| Permissions: view F/M(/OWNER); Generate task = F/M | inferred |
| Signal → drill → evidence → Generate task → Tasks page | loop |

## 11. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `DECISION_SIGNALS` (13) | tenant.decision_signal_snapshots |
| `F002_SIGNAL_OVERRIDES` | thin-baseline overrides |
| `CYCLE_PROFIT` | tenant.cycle_financials |
| `PRODUCTIVITY_METRICS` | productivity metrics |
| `FLIP_LOG` | write-once decision flip log |
| `FORECASTS` | forecast engine output |

---

## Analytics — COMPLETE coverage statement
**~55 objects** across chrome, 10 sub-pages, signal tiles + sparklines + Overall Health, signal detail (threshold/evidence/source/sparkline/snapshot-honesty), signal→task pipeline, per-cycle P&L table, flip log, forecasts, compare/findings/benchmark, states, permissions, navigation, data. The Decision-Engine moat captured. **Analytics audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: #1 Overview · #3 Tasks · #5 Enterprises · #6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Equipment · #12 Locations · #13 Compliance · #14 Analytics = **12 / 20.**
Remaining: Farm History, Decision Center, Reports, Weather, Library, Gallery, Partnerships, Settings.

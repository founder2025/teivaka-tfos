# Prototype V262 — Coverage Matrix · Module 10: BUYERS (#9) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreBuyersView` 23082 + `buyers*View`,
> `renderBuyerCard`/`renderDemandSignalCard`/`renderConcentrationDonut`/
> `renderSubscore`/`renderCommunicationLogRow`/`renderDisputeCard`,
> `buyerDetailView`, modals; lines ~22940–23820). Hierarchy: Page → Sub-page
> (tab) → dropdowns/components. Columns = implied requirement. No codebase
> comparison.
>
> **Doctrine:** Buyer Reliability Score (4-factor: payment + consistency +
> volume + relationship age) · receivables ageing · demand → forecast ·
> concentration risk · F002 ferry (Kadavu Co-op / Vunisea Resort: ferry cost +
> next ferry + weather-cancel risk).

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Buyers | `/farm/buyers` | `coreBuyersView` | Directory · Active orders · Receivables · Demand signals · Pipeline · Analytics |

## 1. Chrome
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Buyers" | label | — | — | — | any |
| **Add buyer** (`openAddBuyer`) | BTN | yes | customers | `POST customers` BUYER_ADDED | add | F/M |

## 2. Sub-page tabs (6 — `renderBuyersViewTabs`)
| id | Sub-page | Backend Req | API Req |
|---|---|---|---|
| directory | Directory | yes | `GET customers` |
| orders | Active orders | yes | `GET orders?open` |
| receivables | Receivables | yes | `GET receivables` |
| demand | Demand signals | yes | `GET demand-signals` |
| pipeline | Pipeline | yes | `GET pipeline` |
| analytics | Analytics | yes | `GET buyers/analytics` |

## 3. Stats strip
| Tile | Backend Req | API Req |
|---|---|---|
| Open orders / Fulfilling / Awaiting payment / Disputed | yes | `GET orders/agg` |

## 4. Directory sub-page (`buyersDirectoryView` + `renderBuyerCard`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Type/status filter dropdowns | dropdown | yes | `GET customers?type=&status=` | any |
| Buyer card → detail (`drillIntoBuyerDetail`) | card | yes | `GET customers/{id}` | any |
| — **Reliability score** (0–100) + status pill | KPI | yes | reliability calc | any |
| — YTD revenue / Terms / Owed / Last order | KPI×4 | yes | orders+receivables | any |
| — **WhatsApp deep-link** (wa.me, preferred channel) | BTN | — | `wa.me` | any |
| — Log order / Log payment | BTN×2 | yes | `POST orders`,`POST payments` | F/M |
| Empty: no buyers | STATE | — | — | — |

## 5. Active orders sub-page (`buyersOrdersView`)
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Orders list (status: PENDING…PAID) | TBL/list | yes | `GET orders` | — |
| Order status advance | dropdown/BTN | yes | `PATCH orders/{id}/status` | fulfil → cash |
| New order (`openOrder`) | BTN/MOD | yes | `POST orders` | create |

## 6. Receivables sub-page (`buyersReceivablesView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Ageing buckets (0-7 / 8-14 / 15-30 / 30+) | KPI×4 | yes | `GET receivables?aged` | banker metric |
| Per-buyer owed + Log payment (`openPayment`) | row+BTN | yes | `POST payments` PAYMENT_RECEIVED | collect → cash in |

## 7. Demand signals sub-page (`buyersDemandView` + `renderDemandSignalCard`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Demand signal card (buyer demand → forecast) | card | yes | `GET demand-signals` | feeds Cash forecast PROJECTED_INFLOWS |

## 8. Pipeline sub-page (`buyersPipelineView`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Pipeline stages (leads → qualified → negotiating → won) | SEC | yes | `GET pipeline` |
| Prospect cards (`BUYERS_PROSPECTS`) → convert | card | yes | `PATCH pipeline/{id}` |

## 9. Analytics sub-page (`buyersAnalyticsView` + `renderConcentrationDonut`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Buyer concentration donut (`renderConcentrationDonut`) | CHT | yes | `GET buyers/concentration` | concentration risk (banker) |
| Revenue/reliability trend charts | CHT | yes | `GET buyers/analytics` | |

## 10. Buyer detail (`buyerDetailView`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| **Reliability 4-factor breakdown** (`renderSubscore`: payment / consistency / volume / relationship age) | KPI×4 | yes | `GET customers/{id}/reliability` |
| Communication log (`renderCommunicationLogRow`) + Log communication (`openCommunication`) | TBL+BTN | yes | `GET/POST communications` COMMUNICATION_LOGGED |
| Dispute cards (`renderDisputeCard`) + Log dispute (`openDispute`) | card+BTN | yes | `GET/POST disputes` DISPUTE_LOGGED |
| Per-buyer order history + cycle attribution | SEC | yes | `GET orders?customer=` |
| F002 ferry doctrine (Kadavu Co-op / Vunisea Resort: ferry cost + next ferry + weather-cancel) | SEC | yes | `GET farms/{id}/ferry` |

## 11. Modals (events)
| Modal | Trigger | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Add buyer | `openAddBuyer` | yes | `POST customers` | F/M |
| Log order | `openOrder` | yes | `POST orders` | F/M |
| Log payment | `openPayment` | yes | `POST payments` | F/M |
| Log communication | `openCommunication` | yes | `POST communications` | F/M |
| Log dispute | `openDispute` | yes | `POST disputes` | F/M |

## 12. Notifications / States
| Item | Trigger | Channel |
|---|---|---|
| Receivable overdue (ageing) | invoice aged | in-app/WhatsApp |
| Demand signal → forecast inflow | buyer demand | feeds Cash |
| Concentration risk high | one buyer dominant | in-app |
| Dispute open | dispute logged | in-app |
| Toast on add/order/payment/comm/dispute | mutation | in-app |

## 13. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View buyers | ✓ | ✓ | ✗ | ✓ |
| Add buyer / order / payment / comm / dispute | ✓ | ✓ | ✗ | ✗ |
| View receivables / reliability / analytics | ✓ | ✓ | ✗ | ✗ |

## 14. Navigation
| From → To | Trigger |
|---|---|
| Rail → Buyers (Directory default) | nav |
| Tabs → 6 sub-pages | view switch |
| Buyer card → Buyer detail | `drillIntoBuyerDetail` |
| WhatsApp deep-link → wa.me | onclick |
| Demand → Cash forecast | cross-link |

## 15. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `BUYER_TYPES` (10) | customer_type enum |
| `BUYERS_RICH` | tenant.customers |
| `BUYERS_PROSPECTS` | pipeline leads |
| `ORDERS_RICH` | tenant.orders + order_line_items |
| `COMMUNICATION_LOG` | tenant.communications |
| `DEMAND_SIGNALS` | demand signals |
| `DISPUTE_LOG` | tenant.disputes |
| `PIPELINE` | sales pipeline |

---

## Buyers — COMPLETE coverage statement
**~55 objects** across chrome, 6 sub-pages (Directory/Active orders/Receivables/Demand/Pipeline/Analytics), stats strip, buyer card (reliability + WhatsApp + log actions), receivables ageing (4 buckets), demand cards, pipeline stages, concentration donut, buyer detail (4-factor reliability + comms + disputes + ferry), 5 event modals, notifications, permissions, navigation, data. **Buyers audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **Overview #1 · Tasks #3 · Enterprises #5 · Production #6 · Inventory #7 · Labor #8 · Buyers #9 · Cash #10 · Compliance #13 = 9 / 20.**
Remaining: Farm History, Decision Center, Assets & Equipment, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.

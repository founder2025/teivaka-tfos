> ⚠️ **SCOPE CORRECTION:** "Harvests" is **NOT a top-level page** in V262's
> rendered nav (`NAV.farm_unified`). This content is a **sub-surface of
> Production (#6) + Enterprises (#5)**. Also: this file predates the
> prototype-only rule and still references the codebase — superseded. See
> `COVERAGE_MATRIX_INDEX.md` for the canonical 20-page scope.

# Prototype V262 — Coverage Matrix · Module 2: HARVESTS (forensic, 100%)

> **The monetisation + bank-evidence surface.** Decomposed from prototype source
> (`renderHarvest*` + `harvestDetailView` + `renderLogHarvestModal` +
> corrections/buyer-slip, lines ~16280–17330).
>
> **Backend baseline (real, this branch):**
> `POST /harvests/compliance-check` (WHD pre-check), `POST /harvests` (log,
> WHD-enforced by API pre-check + DB trigger), `GET /harvests`, `GET /harvests/{id}`;
> `GET/POST /delivery`, `PATCH /delivery/{id}/status`. The **WHD gate + delivery
> split are live** — this is the moat's working core.
>
> Legend as Module 1. PR: ✅ live / 🟡 partial / ❌ none.

## Page identity
| Page | Route | Render fn | Views | Entry |
|---|---|---|---|---|
| Harvests | `/farm/harvests` | `producerHarvestsView`-equiv | Log·Calendar·Buyer·Analytics | rail nav; row→detail; (+) Log harvest |

## A. Page chrome
| Component | Type | Backend | API | Workflow | Permission | PR | Missing |
|---|---|---|---|---|---|---|---|
| `h1` "Harvests" | label | — | — | — | any | ✅ | |
| **Buyer slip** | BTN(secondary) | yes | **none** | generate slip + QR | any | ❌ | `openBuyerSlip`; no slip/PDF endpoint |
| **Log harvest** | BTN(primary) | yes | `POST /harvests` | log workflow (WHD) | FOUNDER/MANAGER/WORKER | ✅ | `openLogHarvest` |

## B. View tabs (4 — `renderHarvestViewTabs`)
| id | Label | PR | Backing |
|---|---|---|---|
| log | Log | ✅ | `GET /harvests` |
| calendar | Calendar | ❌ | no date-bucketed aggregation endpoint |
| buyer | Buyer | 🟡 | customers/orders exist; per-buyer harvest rollup ❌ |
| analytics | Analytics | ❌ | no harvest analytics endpoint |

## C. Stats strip (5 tiles — `renderHarvestStatsStrip`)
| Tile | Calc | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Total this month (kg) | Σ qty in window | yes | `GET /harvests` (client sum) | 🟡 | server aggregation ideal |
| Grade A % | gradeA/total | yes | **none** | ❌ | grade rollup (credit-score input) |
| Revenue this month | Σ qty×price | yes | **none** | ❌ | needs price on harvest/order join |
| (Avg price / CoKG) | derived | yes | **none** | ❌ | |
| Outstanding deliveries | count not-confirmed | yes | `GET /delivery` | 🟡 | client count |

## D. Filters (`renderHarvestFilters`)
| Filter | Values | Backend | API | PR |
|---|---|---|---|---|
| Status (`switchHarvestStatusFilter`) | logged/dispatched/confirmed/corrected/lost | yes | client over list | 🟡 |
| Grade (`switchHarvestGradeFilter`) | A/B/Reject | yes | client | 🟡 |
| Time window (`switchHarvestTimeWindow`) | today/week/month/quarter/all | yes | `GET /harvests?date_from/to` | ✅ |
| Buyer (`switchHarvestBuyerFilter`) | all / buyer | yes | client | 🟡 |

## E. Harvest row (`renderHarvestRow`) + delivery pill
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Row: date, crop, qty kg, grade, buyer, price, total | row | yes | `GET /harvests` | 🟡 | buyer/price not on harvest_log directly |
| Delivery state pill (`renderDeliveryStatePill`): logged/dispatched/confirmed/corrected/lost | badge | yes | `GET /delivery` | 🟡 | join harvest↔delivery |
| Row onclick → harvest detail | nav | yes | `GET /harvests/{id}` | ✅ | |

## F. Harvest detail (`harvestDetailView`, 5 panels)
| Panel | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Harvest info (qty/grade/date/cycle/PU) | SEC | yes | `GET /harvests/{id}` | ✅ | |
| Chemical / WHD compliance | SEC | yes | `POST /harvests/compliance-check` | ✅ | live WHD |
| Delivery split (dispatch→confirm timeline) | SEC | yes | `GET/PATCH /delivery` | 🟡 | UI not built on prod page |
| Post-harvest loss | SEC | yes | **none** (harvest_loss table exists, unexposed) | ❌ | no loss endpoint |
| Grade A% → credit-score input | KPI | yes | **none** | ❌ | feeds bank evidence |
| Correction history (`HARVEST_CORRECTIONS`) | SEC | yes | **none** | ❌ | EVENT_CORRECTED endpoint |

## G. Log Harvest modal (`renderLogHarvestModal` → `confirmLogHarvest`) — THE moat form
| Field | Type | Backend | API | Validation | PR | Missing |
|---|---|---|---|---|---|---|
| Farm | sel | yes | `GET /farms` | required | ✅ | |
| Block (PU) | sel | yes | `GET /production-units` | required | ✅ | |
| Crop | sel | yes | productions | required | ✅ | |
| Cycle | sel | yes | `GET /cycles` | required (NOT NULL) | ✅ | |
| Whole-farm toggle (`wholeFarmToggle`) | checkbox | client | — | — | 🟡 | |
| **WHD check banner (Clear to harvest / HARD-BLOCK)** | indicator | yes | `POST /harvests/compliance-check` | **blocks submit if not clear** | ✅ | **live — inviolable #2** |
| Date | date | yes | — | ≤ today, backdate window | ✅ | |
| Time | time | yes | — | — | ✅ | |
| Qty kg | num | yes | — | >0 | ✅ | |
| Grade (+`gradeFeedback`) | sel | yes | — | A/B/C | ✅ | |
| Buyer | sel | yes | customers | optional | 🟡 | buyer not stored on harvest_log |
| Price (`logHarvestPrice`) | num | yes | — | — | 🟡 | not persisted on harvest |
| Total (`logHarvestTotal`, auto) | calc | client | — | — | 🟡 | |
| Deliver-now toggle | checkbox | yes | `POST /delivery` | — | 🟡 | chained delivery |
| Standing-price toggle | checkbox | yes | price_master | — | ❌ | |
| Photo / Voice attach | BTN(stubs→toast) | yes | **none** | — | ❌ | media upload |
| Notes | textarea | yes | quality_notes | — | ✅ | |
| Backdate reason | text | yes | — | required if backdated | 🟡 | |
| **Submit** (`confirmLogHarvest`) | BTN | yes | `POST /harvests` | WHD 409 gate | ✅ | live |

## H. Correct Harvest modal (`openCorrectHarvest`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| EVENT_CORRECTED form (never silent edit) | MOD/FORM | yes | **none** | ❌ | correction endpoint + audit chain link |

## I. Buyer Slip generator (`openBuyerSlip` + `renderQRPlaceholder`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Buyer slip document | MOD | yes | **none** | ❌ | slip generation |
| Verification QR (`renderQRPlaceholder`) | CHT | yes | `GET /verify/{hash}` exists | 🟡 | QR is decorative; verify route exists |

## J. Calendar / Buyer / Analytics views
| View | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Calendar (harvest windows) | SEC | yes | **none** | ❌ | date aggregation |
| Buyer view (per-buyer harvest+delivery) | SEC | yes | partial | ❌ | buyer↔harvest rollup |
| Analytics (yield trends, grade mix) | CHT | yes | **none** | ❌ | analytics endpoint |

## K. Data structures
| Const | Real source | PR |
|---|---|---|
| `HARVESTS_RICH` (23 fabricated) | `tenant.harvest_log` | ✅ table exists |
| `HARVEST_CORRECTIONS` | no correction table | ❌ |
| `BUYER_PRICING` | `tenant.price_master` | 🟡 |

## L. States / Notifications
| Item | Type | PR |
|---|---|---|
| WHD HARD-BLOCK (409) on non-clear harvest | error/gate | ✅ live (API + trigger) |
| Empty: no harvests in window | STATE | ✅ |
| Toast on log/dispatch/confirm | notification | ✅ |
| Delivery-due / outstanding nudge | notification | ❌ |

---

## Harvests coverage summary
- **Objects:** ~55 across chrome, 4 views, stats, filters, row, 5 detail panels, the Log modal (19 fields), correction + buyer-slip modals.
- **PR:** ✅ ~24 (the WHD-gated log loop, list, detail, delivery, filters by date) · 🟡 ~13 (buyer/price persistence, delivery UI, stats client-side) · ❌ ~18 (buyer slip + QR doc, corrections endpoint, post-harvest loss, grade-A% credit, calendar/analytics, standing price, media).
- **Verdict: ~55% production-ready — the money loop is real.** Log-with-WHD → deliver → confirm works end-to-end; the **gaps are the bank-evidence outputs** (buyer slip, signed verification doc, grade-A% credit signal, corrections audit) — exactly the moat polish worth building next.
- **Contrast:** Harvests (~55%) is far more complete than Labour (~22%) — confirms the audit should drive build *here* first.

## Next
Module 3 = **Cash** (forecast/ledger/bank-evidence), Module 4 = **Compliance** (chemical register/cert/override). Then — per my recommendation — **resume building** the highest-value Harvests gaps (buyer slip + signed verify doc + grade-A% credit), since that completes the wedge that earns the first dollar.

# Prototype V262 — Coverage Matrix · Module 20: PARTNERSHIPS (#19) 🔒 (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`corePartnershipsView` 38131, `renderPartnerHome`
> 38796, `openAddPartner`/`openCreatePartnershipModal`/`openPartnershipDetail`,
> `renderPublicVerifyStatement` 39277, `renderPartnershipCorrectionsSection` 39527,
> `openDispatchDistributionModal` 40164, `PARTNERSHIP_STATEMENTS`). Hierarchy:
> Page → sections → components. Columns = implied requirement. No codebase
> comparison. Locked (🔒). Profit-share doctrine (inviolable #9: hide if rate NULL).

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Partnerships | `/farm/partnerships` (locked) | `corePartnershipsView` | partnership list + detail + statements + distribution |

## 1. Chrome
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Partnerships" (users) + profit-share framing | label | yes | profit_share | `GET partnerships` | — | OWNER |
| **Create partnership** (`openCreatePartnershipModal`) | BTN | yes | partnerships | `POST partnerships` | create | OWNER |
| **Add partner** (`openAddPartner`) | BTN | yes | partners | `POST partnerships/{id}/partners` | add member | OWNER |

## 2. Partnership list
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Partner card (name, type, share %, status) → detail (`openPartnershipDetail`) | card | yes | `GET partnerships` | OWNER |
| Profit-share summary (hide if rate NULL — inviolable #9) | KPI | yes | `GET profit-share` | OWNER |
| Statements summary per partnership | SEC | yes | `GET partnerships/{id}/statements` | OWNER |
| Empty: "No partnerships yet" | STATE | — | — | — |

## 3. Partnership detail (`openPartnershipDetail`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Partner roster + shares | SEC | yes | `GET partnerships/{id}` | — | OWNER |
| Distribution statements (`PARTNERSHIP_STATEMENTS`) | TBL | yes | `GET partnerships/{id}/statements` | — | OWNER |
| **Dispatch distribution** (`openDispatchDistributionModal`) | BTN/MOD | yes | `POST partnerships/{id}/dispatch` | distribute → notify | OWNER |
| Public verify statement (`renderPublicVerifyStatement`) | SEC | yes | `GET verify/statement/{id}` | banker/partner verify | public |
| Corrections (`renderPartnershipCorrectionsSection`) | SEC | yes | `POST partnerships/{id}/correct` | EVENT_CORRECTED | OWNER |
| Partner correction status panel (`renderPartnerCorrectionStatusPanel`) | SEC | yes | `GET corrections?partnership=` | — | OWNER |
| Operator partner-inbox banner (`renderOperatorPartnerInboxBanner`) | banner | yes | `GET partner-requests` | — | OWNER |

## 4. Modals
| Modal | Trigger | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Create partnership | `openCreatePartnershipModal` | yes | `POST partnerships` | OWNER |
| Add partner | `openAddPartner` | yes | `POST partnerships/{id}/partners` | OWNER |
| Dispatch distribution | `openDispatchDistributionModal` | yes | `POST partnerships/{id}/dispatch` | OWNER |

## 5. States / Permissions / Nav
| Item | Notes |
|---|---|
| Profit-share hidden if rate NULL | inviolable #9 |
| Empty: "No partnerships yet" / "None added yet" | STATE |
| Incoming partner requests inbox | banner |
| Locked feature (🔒) | access |
| Permissions: OWNER manages; verify = public | inferred |
| List → detail → dispatch/verify/corrections | nav |

## 6. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| (partnerships) | partnerships + partners tables |
| `PARTNERSHIP_STATEMENTS` | distribution statements |
| (profit share) | tenant.profit_share / farms.profit_share_rate_pct |
| (corrections) | corrections (EVENT_CORRECTED) |

---

## Partnerships — COMPLETE coverage statement
**~30 objects** across chrome (create partnership / add partner), partnership list (cards + profit-share + statements + empty), partnership detail (roster + statements + dispatch distribution + public verify + corrections + correction-status + partner inbox), 3 modals, states, permissions, navigation, data. Profit-share NULL-gating (inviolable #9) + public-verifiable distribution statements captured. **Partnerships audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done = **19 / 20.** Remaining: Settings.

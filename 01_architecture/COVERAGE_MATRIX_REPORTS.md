# Prototype V262 — Coverage Matrix · Module 14: REPORTS (#15) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreReportsView` 13861 + `reports*View`,
> `renderHashChainBanner`/`renderReportRow`/`renderCreditScoreHero`/
> `renderBankEvidenceDoc`/`renderQR`/`renderDispatchRow`/`renderRecipientCard`/
> `renderScheduleCard`, `reportPreviewView`, modals; lines ~27021–29202).
> Hierarchy: Page → Sub-page (tab) → dropdowns/components. Columns = implied
> requirement. No codebase comparison.
>
> **Doctrine (THE MOAT / convergence):** every page's record → one signed,
> hash-chained, QR-verifiable document → banker's WhatsApp → a loan. Bank
> Evidence PDF (credit score + factors + profile + harvest + cash + compliance +
> QR) · hash-chain integrity banner (events count, 0 breaks) · 3 actions
> (REPORT_GENERATED / REPORT_DISPATCHED / REPORT_VERIFIED) · F002 thin-record
> honesty (not fabricated depth).

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Reports | `/farm/reports` | `coreReportsView` | Library · Bank Evidence · Net Worth · Dispatch log · Recipients · Schedule |

## 1. Chrome + hash-chain banner
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Reports" | label | — | — | — | OWNER |
| **Generate report** (`openGenerateReport`) | BTN | yes | reports | `POST reports` REPORT_GENERATED | generate | OWNER |
| **Hash-chain integrity banner** (`renderHashChainBanner`): events count · 0 breaks · hash | indicator | yes | `GET audit/verify` | — | OWNER |
| **Run verification** (`runVerification`) | BTN | yes | `GET audit/verify` | banker chain-check | public/OWNER |

## 2. Sub-page tabs (6 — `renderReportsViewTabs`)
| id | Sub-page | Backend Req | API Req |
|---|---|---|---|
| library | Library | yes | `GET reports` |
| bankevidence | Bank Evidence | yes | `GET reports/bank-evidence` |
| networth | Net Worth | yes | `GET reports/net-worth` |
| dispatchlog | Dispatch log | yes | `GET reports/dispatches` |
| recipients | Recipients | yes | `GET reports/recipients` |
| schedule | Schedule | yes | `GET reports/schedule` |

## 3. Stats strip
| Tile | Backend Req | API Req |
|---|---|---|
| Reports available / Last Bank Evidence / Credit score (each → tab) | yes | `GET reports/summary`,`GET credit-score` |

## 4. Library sub-page (`reportsLibraryView` + `renderReportRow`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Report type filter (`switchReportTypeFilter`) | dropdown | yes | query param | OWNER |
| Report table (Report / Type / Sources / Last dispatched / Verify) | TBL | yes | `GET reports` | OWNER |
| Row → report preview (`drillIntoReport`) | nav | yes | `GET reports/{id}` | OWNER |
| View / Dispatch per row | BTN×2 | yes | `GET reports/{id}`,`POST reports/{id}/dispatch` | OWNER |
| 8 report types (`REPORT_TYPES`): Bank Evidence, CoKG, compliance log, harvest, cash flow, cycle P&L, labor, buyer statement | — | yes | report engine | OWNER |

## 5. Bank Evidence sub-page (`renderCreditScoreHero` + `renderBankEvidenceDoc` + `renderQR`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Credit-score hero (`renderCreditScoreHero`): score + factors | KPI | yes | `GET credit-score` | 720 F001 / 640 F002 |
| Bank Evidence document (`renderBankEvidenceDoc`): profile + harvest + cash + compliance | SEC | yes | `GET reports/bank-evidence` | the PDF body |
| QR verification (`renderQR`) | CHT | yes | `GET verify/{hash}` | scannable |
| F002 thin-record honesty (8-month track, 640, not fabricated) | label | yes | — | integrity over length |

## 6. Net Worth sub-page
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Net-worth statement (assets − liabilities) | SEC | yes | `GET reports/net-worth` |

## 7. Dispatch log sub-page (`renderDispatchRow`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Dispatch trail rows (channel/recipient/when/status) | TBL | yes | `GET reports/dispatches` | REPORT_DISPATCHED log |
| Channels: WhatsApp (Operator) / email (banker) / QR (buyer) / download | — | yes | dispatch service | |

## 8. Recipients sub-page (`reportsRecipientsView` + `renderRecipientCard`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Recipient card (banker/buyer/operator + channel) | card | yes | `GET reports/recipients` |
| Add/manage recipient | BTN | yes | `POST reports/recipients` |

## 9. Schedule sub-page (`reportsScheduleView` + `renderScheduleCard`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Schedule card (recurring report + cadence) | card | yes | `GET reports/schedule` |
| Add/edit schedule | BTN | yes | `POST reports/schedule` |

## 10. Report preview (`reportPreviewView`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Full report preview (drill) + dispatch | SEC+BTN | yes | `GET reports/{id}` |

## 11. Modals
| Modal | Trigger | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Generate report | `openGenerateReport` | yes | `POST reports` REPORT_GENERATED | OWNER |
| Dispatch report | `openDispatchReport(rid, channel)` | yes | `POST reports/{id}/dispatch` REPORT_DISPATCHED | OWNER |

## 12. Verify loop / States / Permissions / Nav
| Item | Notes |
|---|---|
| Verify loop (`runVerification`) — chain intact + numbers match source events | REPORT_VERIFIED |
| Hash-chain banner: events count, 0 breaks | trust primitive |
| F002 thin honesty | not fabricated |
| Empty: no reports/dispatches | STATE |
| Permissions: Reports = OWNER; verify = public (banker) | inferred |
| Library row → preview → dispatch → Dispatch log | flow |

## 13. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `REPORT_TYPES` (8) | report type enum |
| `REPORTS_RICH` | generated reports |
| `BANK_EVIDENCE_DATA` | bank-evidence aggregate (audit.events + cash + compliance + credit) |
| `DISPATCH_LOG` | report dispatch trail |
| `RECIPIENTS` | report recipients |
| `SCHEDULE` | report schedule |

---

## Reports — COMPLETE coverage statement
**~50 objects** across chrome, hash-chain integrity banner + verify, 6 sub-pages (Library/Bank Evidence/Net Worth/Dispatch log/Recipients/Schedule), 8 report types, credit-score hero + Bank Evidence doc + QR, dispatch channels (WhatsApp/email/QR/download), recipients, schedule, report preview, generate/dispatch modals, verify loop, states, permissions, navigation, data. The convergence/moat page captured. **Reports audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: #1 Overview · #3 Tasks · #5 Enterprises · #6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Equipment · #12 Locations · #13 Compliance · #14 Analytics · #15 Reports = **13 / 20.**
Remaining: Farm History, Decision Center, Weather, Library, Gallery, Partnerships, Settings.

# Prototype V262 — Coverage Matrix · Module 4: COMPLIANCE (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderCompliance*`, `compliance*View`,
> `renderDualLayerIndicator`, `renderComplianceBlockCard`, `renderCertCard`,
> `renderOverrideRow`, modals `openLogChemical`/`openFounderOverride`/`openAddCert`;
> lines ~25089–25950, +`complianceAreasView` 13203). Every column = the implied
> requirement (the spec). No codebase/git comparison.
>
> **Doctrine surfaced:** inviolable #2 (chemical WHD dual-layer, never bypassable
> without logged FOUNDER override); dual regime (F001 conventional WHD / F002
> organic POETCom). Type: SEC/BTN/KPI/FORM/INP/TBL/CHT/MOD/STATE/DATA.

## Page identity
| Page | Route | Render fn | Views | Doctrine |
|---|---|---|---|---|
| Compliance | `/farm/compliance` | `complianceStatusView` + tab views | Status·Areas·Chemical register·Certifications·Overrides·Calendar·Analytics | Dual-layer WHD; FOUNDER-only override; dual regime |

## 1. Page chrome
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| `h1` "Compliance" | label | — | — | — | — | any |
| **Log chemical / spray** (`openLogChemical`) | BTN(primary) | yes | field_events(SPRAY) + chemical_library | `POST events` (SPRAY) | chemical apply → sets WHD | F/M/WORKER |
| View tabs (7) | nav | — | — | — | switch view | any |

## 2. Dual-layer indicator (`renderDualLayerIndicator`) — inviolable #2 made visible
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Shield header | label | — | — | |
| Layer 1 — "Spray check" (API pre-check) | indicator | yes | `POST harvests/compliance-check` | UX 409 |
| Layer 2 — "Permanent record check" (DB trigger) | indicator | yes | DB trigger `enforce_harvest_compliance` | hard gate |
| Statement: "Every harvest passes two independent checks. Neither can be bypassed without a logged FOUNDER override." | label | — | — | doctrine |

## 3. Status view (`complianceStatusView` + `renderComplianceBlockCard`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| Capital tile: Blocked now (clickable→filter) | KPI | yes | field_events+chemical_library | `GET compliance/status` | filter | any |
| Capital tile: Harvest-safe (clickable) | KPI | yes | same | same | filter | any |
| Capital tile: Compliance streak | KPI | yes | override/violation history | `GET compliance/streak` | — | any |
| Capital tile: WHD-active count | KPI | yes | field_events WHD | computed | — | any |
| Status filter pills (`switchComplianceStatusFilter`) | BTN×N | yes | — | query param | — | any |
| Block card (`renderComplianceBlockCard`) → block detail | card | yes | per-PU WHD | `GET compliance/status/{pu}` | drill (`drillIntoBlockCompliance`) | any |
| — comp-status-pill (WHD/clear/blocked) + clear-date countdown | badge | yes | clearance calc | computed | — | any |
| — blocking chemical + clock icon | label | yes | chemical_library WHD | — | — | any |
| Organic-regime banner (F002): "no synthetic · POETCom certified · harvest-safe" | banner | yes | farm regime flag | `GET farms/{id}` | — | any |

## 4. Areas view (`complianceAreasView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Area/zone-grouped compliance status | SEC | yes | `GET compliance/status?group=area` | zones rollup |

## 5. Chemical register (`complianceRegisterView`)
| Component | Type | Backend Req | DB Req | API Req | Permission |
|---|---|---|---|---|---|
| 10-chemical library table | TBL | yes | shared.chemical_library | `GET chemicals` | any |
| — per-chem: name, WHD days, REI hours, MRL ppm, registered crops | cols | yes | chemical_library | — | any |
| — restricted flag (Paraquat red) | badge | yes | hazard_class/approved | — | any |

## 6. Certifications (`complianceCertsView` + `renderCertCard`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| Tiles: Active certs / Expiring soon / Expired / Next renewal | KPI×4 | yes | certifications | `GET certifications` | — | OWNER |
| **Add cert** (`openAddCert`) | BTN | yes | certifications | `POST certifications` | add → audit | F/M |
| Cert card (`renderCertCard`): name, issuer, cert number, scope, issue/expiry, verify hash | card | yes | certifications | `GET certifications/{id}` | — | OWNER |
| — "Renew" btn | BTN | yes | certifications | `PATCH certifications/{id}` | renew | F/M |

## 7. Overrides (`complianceOverridesView` + `renderOverrideRow`)
| Component | Type | Backend Req | DB Req | API Req | Permission |
|---|---|---|---|---|---|
| Header: "Every FOUNDER override · permanent record · counts against compliance score" | label | — | — | — | OWNER |
| Tiles: Total overrides / YTD / Credit-score impact / Avg days early | KPI×4 | yes | harvest_compliance_overrides | `GET overrides` | OWNER |
| Override row (`renderOverrideRow`): who/when/reason/block/chem + verify hash | row | yes | override table + audit | `GET overrides` | OWNER |

## 8. Calendar (`complianceCalendarView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Upcoming compliance events (clear-dates / REI windows / cert renewals) | SEC | yes | `GET compliance/calendar` | aggregated |
| "View weather" link (`openWeatherCenter`) | BTN | — | nav | cross-link |
| "Renew" btns | BTN | yes | `PATCH certifications/{id}` | renew |

## 9. Analytics (`complianceAnalyticsView`)
| Component | Type | Backend Req | Calc | API Req |
|---|---|---|---|---|
| Compliance score card + report | CHT | yes | score formula | `GET analytics/compliance-score` |
| Override history chart + report | CHT | yes | override trend | `GET analytics/overrides` |
| Chemical use by type chart + report | CHT | yes | chem usage agg | `GET analytics/chem-use` |
| MRL safety margin card + report | CHT | yes | MRL vs applied | `GET analytics/mrl-margin` |
| Compliance certificate (export) card | CHT/report | yes | clean-record export | `GET reports/compliance-cert` |

## 10. Modals (full field lists)
| Modal | Trigger | Fields | Confirm | Backend Req | Permission |
|---|---|---|---|---|---|
| Log chemical / spray | `openLogChemical` | block(sel), applicator, chemical(sel→shows WHD/REI `chemInfo`), rate (e.g. 50ml/100L), area (0.2ha), date, conditions (e.g. "Clear, no rain") | `confirmLogChemical` | `POST events` SPRAY → DB sets `whd_clearance_date` | F/M/WORKER |
| **FOUNDER override (sacred)** | `openFounderOverride` | reason textarea **≥20 chars** (`ovrReason`+`ovrReasonCount`), **two-step confirm checkbox** (`ovrConfirm`), CRITICAL-WhatsApp warning, execute btn (`ovrExecBtn`) | `confirmFounderOverride` | `POST overrides` → audit + CRITICAL alert + credit-score ding | **FOUNDER only** |
| Add certificate | `openAddCert` | farm, added-by, type (Organic/Food safety/Export eligibility/Applicator license/GAP), name, issuer, cert number, scope, issue date, expiry date | `confirmAddCert` | `POST certifications` | F/M |
| Correct compliance record | `openCorrectCompliance`/`openCorrectComplianceRecord` | EVENT_CORRECTED fields | — | `POST compliance/{id}/correct` | F/M |

## 11. Compliance Reports (implied outputs)
| Report | Source | Output | Backend Req | Permission |
|---|---|---|---|---|
| Export compliance certificate (clean chemical record) | chem record | PDF (premium-buyer passport) | report engine | OWNER |
| Chemical register / application log | field_events SPRAY | CSV (audit trail) | `GET chemicals/export` | OWNER |
| Override register | override table | PDF/CSV | `GET overrides/export` | OWNER |
| Compliance inputs → Bank Evidence PDF | dual-layer + certs | feeds Phase 9 | report engine | OWNER |

## 12. Compliance Notifications (implied)
| Notification | Trigger | Channel | Recipient |
|---|---|---|---|
| **CRITICAL FOUNDER override** | override executed | WhatsApp (critical) | OWNER/FOUNDER |
| WHD clear-date reminder | clearance approaching | in-app | OWNER |
| Cert expiring soon / expired | cert near/past expiry | in-app/WhatsApp | OWNER |
| REI window active | spray REI | in-app | WORKER |
| Harvest blocked (WHD) | harvest attempt during WHD | in-app 409 | actor |
| Toast on chem-log/cert/override save | mutation | in-app | actor |

## 13. Compliance Permissions matrix (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View compliance | ✓ | ✓ | ✓ | ✓ |
| Log chemical/spray | ✓ | ✓ | ✓ | ✗ |
| Add / renew certificate | ✓ | ✓ | ✗ | ✗ |
| **Execute WHD override** | ✓ | ✗ | ✗ | ✗ |
| View overrides / credit impact | ✓ | ✓ | ✗ | ✗ |
| Correct compliance record | ✓ | ✓ | ✗ | ✗ |
| Generate compliance cert/report | ✓ | ✓ | ✗ | ✗ |

## 14. Navigation paths
| From → To | Trigger |
|---|---|
| Rail → Compliance (Status default) | nav |
| Status tile → filtered status | `switchComplianceStatusFilter` |
| Block card → Block Compliance Detail | `drillIntoBlockCompliance` |
| Tabs → views | `switchComplianceView` |
| Calendar → Weather | `openWeatherCenter` |
| Analytics "Open full report" → report | onclick |

## 15. Data structures (prototype mock → implied schema)
| Const | Implied table/config |
|---|---|
| `CHEMICAL_LIBRARY` (10) | shared.chemical_library (WHD/REI/MRL/registered_crops/restricted) |
| `COMPLIANCE_BLOCKS` | per-PU compliance status (derived from field_events) |
| `CHEM_APPLICATIONS` | tenant.field_events (SPRAY) |
| `CERTIFICATIONS` | tenant.certifications |
| `OVERRIDE_LOG` | tenant.harvest_compliance_overrides |

## 16. States
| State | Where |
|---|---|
| Blocked (WHD active) — red pill + countdown | block card |
| Harvest-safe (clear) — green | block card |
| Organic regime (no synthetic) — F002 banner | status |
| Cert expiring soon / expired | certs |
| Empty: no chemicals/certs/overrides | resp. views |
| Override two-step gate (execute disabled until reason≥20 + confirm) | override modal |

---

## Compliance — COMPLETE coverage statement
**~75 objects** across 16 sections: page chrome, dual-layer indicator, 7 views (Status/Areas/Chemical register/Certifications/Overrides/Calendar/Analytics), 4 modals (incl. the sacred FOUNDER override with its ≥20-char + two-step + CRITICAL-WhatsApp gate), reports, notifications, a full permissions matrix, navigation, data, states. Dual regime (F001 conventional / F002 organic POETCom) captured. **Compliance audit = 100%, prototype-only.**

## Audit progress
Complete (prototype-only, full depth): **Labour, Compliance.** Drafted (lighter / pre-prototype-only rule): Harvests, Cash — flagged to upgrade to this standard. The **moat trio (Harvests + Cash + Compliance)** + Labour are now audited. Remaining pages: Overview, Cycles, Field Events, Inventory, Buyers, Equipment, Analytics, Reports, Decisions, Locations, Weather, Gallery, Library, Partnerships + Home/Classroom/TIS/Me.

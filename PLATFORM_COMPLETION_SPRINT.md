# PLATFORM_COMPLETION_SPRINT.md — living tracker

**Goal:** present the **real platform** (not the prototype) on **Tue 2026-06-16**.
Every surface in `docs/TFOS_MyFarm_Prototype_v263_20260608.html` live in prod —
real route, real data (or honest-empty), real (+) actions, prototype-faithful —
by **2026-06-15**.

**Operator decision (2026-06-08):** ship a living product to present. M-PAiSA
(and any genuine external integration) is **deferred** and shown honest-empty —
never faked. We present *what the platform actually does*.

## The bar (every surface)
1. Route resolves to a real React page (no 404/stub).
2. Real data from `tenant.*` / read-only views over `audit.events` — never mock.
3. Every (+)/action emits a real `audit.events` row via the Universal Event Form
   Contract, RLS-scoped, hitting a working endpoint.
4. Looks/behaves like the prototype.

## The façade rule (de-fake, don't copy)
Prototype = spec for layout/flow, NOT its numbers. Where the prototype fakes
data, wire the real backend or show honest-empty. Known façades: **Cash** (no-op
write + false "audit row" toast), **Reports/Bank Evidence** (hardcoded
1840kg/FJD 14,200/67 events), **Analytics** (empty shell). Prod has the real
backends — wire them.

## Deferred-by-design (honest-empty, flagged — NOT faked)
- M-PAiSA payments (external merchant reg, Q8)
- Anything needing Operator data not yet provided (flag on contact)
- Cited agronomy beyond seeded KB (Inviolable #1)

## Deploy discipline
- FE: `npm run build`. BE: `build --no-cache api && up -d api` then
  `bash 04_environment/verify-deploy.sh` (B78 guard). Push to
  `claude/parity-farm-surfaces`.

---

## Status legend
✅ real & live · 🟢 real, polish pending · 🟡 partial/needs wiring · 🔴 todo · ⏸ deferred-honest

## FARM pillar (20)
| Surface | Status | Notes |
|---|---|---|
| Overview | 🟢 | health card + weather strip + compliance tile real (this sprint); audit remaining tiles for fabricated numbers |
| Farm History | 🟢 | real audit.events read |
| Tasks | 🟢 | real queue (reorganised) |
| Decision Center | 🟡 | real signals; verify no empty fabrication |
| Enterprises | 🟡 | list exists; per-enterprise detail tabs from real data pending |
| Production (Cycles) | 🟡 | list real; **6-panel cycle detail + real nursery create** pending |
| Inventory | 🟡 | real inputs; parity pass |
| Labor | 🟢 | real workers/attendance |
| Cash | 🟡 | **verify writes are real** (de-fake), multi-tab parity |
| Assets & Equipment | 🟡 | thin; parity pass |
| Locations | ✅ | L1–L3 map shipped |
| Compliance | ✅ | crop-WHD page + endpoint (this sprint) |
| Analytics | 🟡 | back with real decision_signals or honest-empty |
| Reports | 🟡 | **Bank Evidence must read real audit.events** (de-fake #1) |
| Weather | 🟢 | real Open-Meteo |
| Library | 🟡 | uncertain depth; parity pass |
| Gallery | 🟡 | real photos; capture stubs |
| Partnerships | 🟡 | parity pass |
| Settings | 🟡 | parity pass |
| Field Events | 🟢 | log shipped; reconcile to unified nav |

## HOME pillar (5)
| Feed 🟡 | Following 🔴 | Marketplace 🔴 | Directory 🔴 | Saved 🔴 |

## CLASSROOM (5)
| Overview 🟡 | Tracks 🔴 | My progress 🔴 | Certification+QR 🔴 | Bookmarks 🔴 |

## TIS (5)
| Chat ✅ | History 🔴 | Voice 🔴 | Plan my farm 🔴 | Usage 🔴 |

## AVATAR dropdown
| Profile ✅ | Settings ✅ | Subscription 🔴 | Referrals 🔴 | Affiliate program 🔴 | Affiliate console 🔴 | Team 🔴 | View Covenant 🟡 | Verify a record ✅ | Export data 🟡 | Control Room (admin) 🟡 | Sign out ✅ |

---

## Phases (to 2026-06-15)
- **P1 (Jun 8–9) FARM moat de-fake + Overview honesty** — Reports/Bank Evidence (real audit.events), Cash (real writes), Analytics (real signals/honest-empty), Overview tile audit.
- **P2 (Jun 9–10) FARM Production + Enterprises** — cycles list/calendar/planner, 6-panel cycle detail, real nursery create, enterprise detail tabs.
- **P3 (Jun 10–11) FARM rail finish + audit** — History/Tasks/Decision/Inventory/Labor/Buyers/Equipment/Locations/Weather/Gallery/Partnerships/Library/Settings; route↔nav↔endpoint audit; zero dead links.
- **P4 (Jun 11–12) HOME** — Feed/Following/Marketplace/Directory/Saved front+back.
- **P5 (Jun 12–13) CLASSROOM + TIS sub-pages** — tracks/progress/cert+QR/bookmarks; TIS history/voice/plan/usage.
- **P6 (Jun 13–14) AVATAR dropdown** — subscription/referrals/affiliate/team/covenant/export/control-room.
- **P7 (Jun 14–15) FULL-PLATFORM SWEEP** — every route, every (+), every endpoint; no 4xx/5xx; zero fabricated numbers; deploy + smoke; presentation dry-run.

## Running log
- 2026-06-08: Sprint opened. Prior this session: Prime Directive ratified; single canonical prototype (v263); Field Events log; Overview FARM SUMMARY health card + weather strip; crop-WHD endpoint + Compliance page; B78 deploy guard.

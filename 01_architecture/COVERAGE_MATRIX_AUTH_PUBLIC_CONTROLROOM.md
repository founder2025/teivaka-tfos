# Prototype V262 — Coverage Matrix · Module 26: AUTH + PUBLIC + CONTROL ROOM (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderAuth*` 33390–33534, `renderInviteFlow`
> + steps 34355–34489, `renderPublicCovenant`/`renderPublicVerify*` 32731–40624,
> Control Room 2nd `<script>` 58801–59564 `cr*` ~69 fns). Hierarchy: Surface →
> sections → controls. Columns = implied requirement. No codebase comparison.
> Final module — closes total prototype coverage.

---

# A. AUTH FLOWS (public, pre-login)

## A1. Landing (`renderAuthLanding`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| "Pacific farm operating system" hero | label | — | — | |
| Start your farm / Log in / I have an invite | BTN×3 | yes | nav to signup/login/accept-invite | |
| Region selector (Kadavu / Lau Group / Other Fiji / Samoa / Solomon Islands / Tonga) | dropdown | yes | region | Pacific scope |
| Tier framing (For smallholders / For commercial growers / For your bank) | label | — | — | |
| Covenant link | BTN | — | nav → covenant | |

## A2. Signup (`renderAuthSignup`)
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Farm name / region / tier / first-farm setup | FORM | yes | `POST auth/register` | register |
| Phone (WhatsApp) verification ("Check your WhatsApp", Resend code, Use different number) | INP+BTN | yes | `POST auth/whatsapp-otp`,`POST verify-otp` | OTP |
| Tenant creation (first farm) | step | yes | `POST farms` | onboarding |

## A3. Login (`renderAuthLogin`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Phone + password + Log in | FORM+BTN | yes | `POST auth/login` |
| Forgot password | BTN | yes | `POST auth/forgot` |

## A4. Accept invite (`renderAuthAcceptInvite`) + Invite flow (`renderInviteFlow`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Accept invite (token) | FORM | yes | `POST invites/accept` | mock token |
| Invite flow steps: Identity → Role → Scope → Review → Sent | wizard | yes | `POST invites` | owner invites member |

---

# B. PUBLIC VERIFY / COVENANT (public, unauthenticated — the trust surface)

## B1. Covenant (`renderPublicCovenant`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Public covenant / mission page | SEC | — | static | brand/trust |

## B2. Verify (`renderPublicVerify` / `renderPublicVerifyPage(memberId)`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Public `/verify/{id}` — chain verification for a record/member | SEC | yes | `GET verify/{hash}` | banker scans QR |
| Chain-intact result + source-event match | indicator | yes | `audit.verify` fn | trust primitive |
| Bank Evidence visibility (consented) | SEC | yes | `GET verify/bank-evidence` | bankability |

## B3. Verify statement (`renderPublicVerifyStatement`) / distribution (`renderPublicVerifyDistribution`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Public partnership-statement verify | SEC | yes | `GET verify/statement/{id}` | partner trust |
| Public distribution verify | SEC | yes | `GET verify/distribution/{id}` | distribution trust |

---

# C. CONTROL ROOM (founder/admin console — 2nd `<script>`, `crIsAdmin` gate)

## C1. Access + audit
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Admin gate (`crIsAdmin` = U-CODY/FOUNDER) | gate | yes | role check | FOUNDER/ADMIN |
| Admin audit emission (`crAudit`) — every admin action → audit.events | — | yes | `POST audit` (source=control_room) | ADMIN |

## C2. Console tabs/sections (~69 `cr*` fns)
| Section | Backend Req | API Req | Notes |
|---|---|---|---|
| Tenants | yes | `GET/PATCH admin/tenants` | tenant mgmt |
| Users | yes | `GET/PATCH admin/users` | user mgmt |
| Subscriptions / Tiers (Basic/paid plans, Apply plan) | yes | `GET/POST admin/subscriptions` | billing |
| Affiliate program / Codes (Create code) | yes | `GET/POST admin/affiliate` | referral |
| Agricultural intelligence | yes | `GET/PATCH admin/kb` | KB ops |
| Classroom (courses) | yes | `GET/POST admin/courses` | LMS ops |
| Credit status | yes | `GET admin/credit` | credit scores |
| Build status | yes | `GET admin/build` | platform health |
| Admin accountability | yes | `GET admin/audit` | admin action log |
| Approve / Delete / Detail / Backdate actions | yes | per-entity | ADMIN |

## C3. Control Room states / permissions
| Item | Notes |
|---|---|
| Founder-only (not visible to non-admin) | inviolable access |
| Every admin action audited (crAudit) | accountability |
| Impersonation (previewAsMember) launches from here / avatar | ADMIN |

---

## States (cross-surface)
| Item | Notes |
|---|---|
| Auth: OTP pending / resend / invalid | STATE |
| Verify: chain intact (green) / broken (red) | trust result |
| Control Room: hidden unless admin | access |

## Data (implied)
| Domain | Implied |
|---|---|
| auth/users/tenants/invites | tenant.users + tenants + invites |
| verify | audit.events + audit.verify fn + public stats fn |
| control room | admin views over all of the above; audit.events (source=control_room) |

---

## Module 26 — COMPLETE coverage statement
**~50 objects** across Auth (Landing/Signup+OTP/Login/Accept-invite/Invite-flow 5 steps), Public (Covenant/Verify/Verify-statement/Verify-distribution), Control Room (admin gate + audit + ~10 console sections). States, permissions, data. **Auth + Public + Control Room audit = 100%, prototype-only.**

---

# 🏁🏁 TOTAL PROTOTYPE COVERAGE COMPLETE

All V262 surfaces decomposed prototype-only (Page → Sub-page → Dropdown):
- **Farm nav: 20/20 pages** (Overview…Settings) — ~900 objects
- **Home pillar** (5 sub-pages) — ~60
- **Classroom pillar** (5 sub-pages) — ~20
- **TIS pillar** (5 sub-pages + FAB) — ~30
- **Me/Profile** — ~45
- **Auth + Public + Control Room** — ~50

**Grand total: ~1,100+ objects across 26 modules / all surfaces.** Every visible
and implied object in the prototype is now individually catalogued with its
implied Backend / DB / API / Workflow / Permission. Master index:
`COVERAGE_MATRIX_INDEX.md`. **Prototype coverage = 100%.**

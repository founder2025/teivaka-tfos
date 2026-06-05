# Prototype V262 — Coverage Matrix · Module 21: SETTINGS (#20) 🔒 (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreSettingsView` 38084 + `openEditFarmProfile`/
> `openInviteUser`/`toggleIntegration`). Hierarchy: Page → setting sections →
> controls. Columns = implied requirement. No codebase comparison. Locked (🔒).

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Settings | `/farm/settings` (locked) | `coreSettingsView` | grouped settings sections (no tabs) |

## 1. Farm profile section
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Farm profile card + **Edit** (`openEditFarmProfile`) | SEC+BTN | yes | `GET/PATCH farms/{id}` | OWNER |
| Manage (→ Locations/farm details) | BTN | — | `navigateToFarmSub` | OWNER |

## 2. Team & roles section
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Member list (name + role) | list | yes | `GET members` | — | OWNER |
| Role assignment (FOUNDER/MANAGER/WORKER/VIEWER) "By role" view | dropdown | yes | `PATCH members/{id}/role` | change role | OWNER |
| **Invite user** (`openInviteUser`) | BTN/MOD | yes | `POST invites` | invite flow | OWNER |

## 3. Preferences section (dropdowns)
| Setting | Type | Values | Backend Req | API Req |
|---|---|---|---|---|
| Measurement unit | dropdown | kg / lb | yes | `PATCH me/prefs` |
| Currency | dropdown | FJD | yes | `PATCH me/prefs` |
| Language | dropdown | English / iTaukei / Hindi | yes | `PATCH me/prefs` |
| Theme (light/dark) | toggle | — | client+persist | localStorage / `PATCH me/prefs` |
| Farmer level (accessibility override) | dropdown | smallholder/producer/commercial | yes | `PATCH me/prefs` |

## 4. Integrations section
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Integration toggles (`toggleIntegration`) — WhatsApp / M-PAiSA / bank / weather | INP | yes | `PATCH integrations` | OWNER |

## 5. Subscription / tier section
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Tier display (FREE/BASIC/PREMIUM/PROFESSIONAL/CUSTOM) + upgrade | SEC+BTN | yes | `GET/POST subscriptions` | OWNER |

## 6. Danger zone (implied — from `renderDangerZone`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Export data / delete / transfer ownership | BTN | yes | `POST data-export`,`DELETE`,`POST transfer` | OWNER |

## 7. States / Permissions / Nav
| Item | Notes |
|---|---|
| Save confirmation toasts | per setting |
| Locked feature (🔒) | access |
| Permissions: OWNER for farm/team/integrations/tier; preferences self | inferred |
| Settings → Locations / Subscription / Members | nav |

## 8. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| (farm profile) | tenant.farms |
| (members/roles) | tenant.users + roles |
| (prefs) | user preferences (measurement/currency/language/theme/level) |
| (integrations) | integration config |
| (tier) | subscription |

---

## Settings — COMPLETE coverage statement
**~25 objects** across farm profile (edit), team & roles (member list + role assignment + invite), preferences (measurement/currency/language/theme/level dropdowns), integrations toggles, subscription/tier, danger zone (export/delete/transfer), states, permissions, navigation, data. **Settings audit = 100%, prototype-only.**

---

# 🏁 FARM NAV AUDIT COMPLETE — 20 / 20 pages

All farm-pillar pages decomposed prototype-only, Page → Sub-page → Dropdown:
#1 Overview · #2 Farm History · #3 Tasks · #4 Decision Center · #5 Enterprises ·
#6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Assets &
Equipment · #12 Locations · #13 Compliance · #14 Analytics · #15 Reports ·
#16 Weather · #17 Library · #18 Gallery · #19 Partnerships · #20 Settings.

**Total ~900+ objects catalogued across 20 pages.** (Cycles/Harvests reconciled
as Production/Enterprises sub-surfaces.)

**Remaining for full prototype coverage:** the top-pillar surfaces outside the
Farm nav — Home (Feed/Following/Marketplace/Directory/Saved), Classroom, TIS
(Chat/History/Voice/Plan-my-farm/Usage), Me/Profile, Auth, and the public
Verify/Covenant pages + founder Control Room. These are tracked as the next
audit phase.

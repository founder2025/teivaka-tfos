# Prototype V262 — Coverage Matrix · Module 25: ME / PROFILE (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderProfilePage`/`renderOwnProfilePage` 9425,
> `renderProfileHeader`/`renderProfile*Panel` 34870–35010, `renderProfileLaunchpad`
> 44051, `profSettings` 9579, `renderProfileTenancyHistory`/`renderProfileTransferButton`,
> `renderDangerZone` 35160, `renderAvatarHTML` 40882). Hierarchy: Page → sections/
> panels → controls. Columns = implied requirement. No codebase comparison.

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Me / Profile | `/me` | `renderOwnProfilePage`/`renderProfilePage(uid,mode)` | profile header + panels + launchpad + settings |

## 1. Profile header (`renderProfileHeader`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Avatar (`renderAvatarHTML`) + name + role/tier | label | yes | `GET me`/`GET users/{id}` | self/viewer |
| Change profile picture (upload/remove — `submitAvatarChange`/`removeAvatar`) | BTN/MOD | yes | `POST media/avatar` | self |
| Edit profile | BTN | yes | `PATCH me` | self |
| Profession badge (`renderProfessionBadge`) | badge | yes | profile | viewer |

## 2. Panels
| Panel | Fn | Components | Backend Req | API Req |
|---|---|---|---|---|
| Activity feed | `renderProfileActivityFeed` | recent events | yes | `GET audit/events?actor=` |
| Tasks | `renderProfileTasksPanel` | Assigned/Completed/Completion rate/Overdue/Current+Longest streak/On-time rate | yes | `GET tasks?worker=` |
| Attendance | `renderProfileAttendancePanel` | Shifts wk/mo/qtr, Total hours | yes | `GET labor?worker=` |
| Involvement | `renderProfileInvolvementPanel` | blocks/cycles involved | yes | `GET involvement` |
| Trust | `renderProfileTrustPanel` | Attested by/for others, Trust contribution, Disputes | yes | `GET trust/{id}` |
| Cycles | `renderProfileCyclesPanel` | cycle activity ("No cycle activity yet.") | yes | `GET cycles?worker=` |
| Worker-record CTA | `renderProfileWorkerRecordCTA` | claim/link worker record | yes | `POST link-worker` |

## 3. Launchpad (`renderProfileLaunchpad` + `renderLaunchpadTile`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Quick-action tiles (per role/profile) | tile×N | yes | varies | self |

## 4. Me settings (`profSettings`) — `/me/settings` + sub-routes
| Setting | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Preferences (measurement/currency/language/theme) | dropdown/toggle | yes | `PATCH me/prefs` | shared w/ Settings |
| Switch mode (`/me/settings/mode`) | dropdown | derived | `/auth/me` | mode |
| Subscription (`/me/subscription`) | SEC | yes | `GET/POST subscriptions` | tier |
| Referrals (`/me/referrals`) | SEC | yes | `GET me/referral` | referral |
| Team (`/me/team`) | SEC | yes | `GET members` | OWNER |
| Export data (`/me/data`) | BTN | yes | `POST data-export` | self |

## 5. Tenancy / ownership
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Tenancy history (`renderProfileTenancyHistory`) | SEC | yes | `GET me/tenancies` | self |
| Transfer ownership (`renderProfileTransferButton`) | BTN/MOD | yes | `POST transfer` | OWNER |
| Incoming requests banner (`renderIncomingRequestsBanner`) | banner | yes | `GET requests` | OWNER |

## 6. Danger zone (`renderDangerZone`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Delete account / leave farm / transfer | BTN | yes | `DELETE`/`POST leave`/`POST transfer` | self/OWNER |

## 7. Avatar menu (`renderAvatarHTML` dropdown — global)
| Item | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Profile / Settings / Subscription | nav | — | nav | |
| Switch level (smallholder/producer/commercial) | dropdown | yes | `PATCH me/prefs` | accessibility override |
| Switch tenant (`tenantSwitcher`) | dropdown | yes | `GET/POST tenant-switch` | multi-tenant |
| Impersonate (admin) (`previewAsMember`) | BTN | yes | impersonation | ADMIN |
| Theme toggle | toggle | client | localStorage | |
| Logout | BTN | yes | `POST logout` | self |

## 8. States / Permissions / Nav
| Item | Notes |
|---|---|
| Own profile vs other-member profile (canEdit gate) | permission |
| Empty: "No cycle activity yet." | STATE |
| Impersonation pill when previewing as member | ADMIN |
| Permissions: self-edit; transfer/team = OWNER; impersonate = ADMIN | inferred |

## 9. Data (prototype mock → implied schema)
| Domain | Implied |
|---|---|
| profile | tenant.users + profile |
| trust/attestation | trust/attestation tables |
| tenancy | tenant memberships |
| prefs | user preferences |

---

## Me / Profile — COMPLETE coverage statement
**~45 objects** across profile header (avatar/edit/badge), 7 panels (activity/tasks/attendance/involvement/trust/cycles/worker-CTA), launchpad tiles, Me settings (prefs/mode/subscription/referrals/team/data), tenancy history + transfer ownership + requests banner, danger zone, global avatar menu (level/tenant/impersonate/theme/logout). States, permissions, navigation, data. **Me/Profile audit = 100%, prototype-only.**

## Audit progress
Farm nav 20/20 ✅ · Home ✅ · Classroom ✅ · TIS ✅ · Me/Profile ✅. Remaining: Auth flows, public Verify/Covenant, Control Room.

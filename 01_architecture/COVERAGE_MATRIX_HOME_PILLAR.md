# Prototype V262 — Coverage Matrix · Module 22: HOME PILLAR (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderHome` 9307, `renderFeed`/`renderFollowing`/
> `renderMarketplace`/`renderDirectory`/`renderSaved`, `renderCommunity*` 45102–45500,
> `renderMarketplaceV78` 47872, `renderVerifyFarmersSurface`/`renderServiceCatalogSurface`
> 47523). Hierarchy: Pillar → Sub-page (nav) → dropdowns/components. Columns =
> implied requirement. No codebase comparison.
>
> **The social / marketplace / verification layer** — distinct from the Farm
> pillar. 5 sub-pages.

## Pillar identity
| Pillar | Nav sub-pages | Render fn |
|---|---|---|
| Home | Feed · Following · Marketplace · Directory · Saved | `renderHome` |

## 1. Feed sub-page (`renderFeed` / `renderCommunityFeed`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Audience filter (Everyone/Farmers/Buyers/Bankers/Your followers) | dropdown | yes | `GET community/posts?audience=` | — | any |
| **Composer** (`renderCommunityComposer`) | FORM | yes | `POST community/posts` | post | any |
| — post text + type | INP | yes | — | — | any |
| — add media (`cmAddMedia`, `cmRemovePhoto`) | BTN | yes | `POST media` | upload | any |
| — tag location (`cmTagLocation`/`cmSetLocation`/`cmClearLocation`/Add place) | BTN | yes | geo | — | any |
| — attach farm record (`openRecordPicker`) | BTN | yes | `GET events` | link record | any |
| — topics manager (`openTopicsManager`) | BTN | yes | topics | — | any |
| — visibility selector | dropdown | yes | post.visibility | — | any |
| — submit (`submitCommunityPost`) | BTN | yes | `POST community/posts` | post | any |
| Post card (`renderCommunityPostCard`) | card | yes | `GET community/posts` | — | any |
| — like (`toggleLikePost`) + reaction tray (`toggleReactTray`) + reaction summary | BTN | yes | `POST likes/reactions` | react | any |
| — replies (`togglePostReplies`) + reply (`setReplyTarget`/`submitReply` + reply media) | BTN+FORM | yes | `GET/POST comments` | reply | any |
| — share (`openShareMenu`) | BTN | yes | share | — | any |
| — post menu (`openPostMenu`) — flag/report/edit/delete | BTN | yes | `POST flags` | moderate | any/owner |
| Moderation report card (`renderModerationReportCard`) | card | yes | `GET/PATCH moderation` | review | ADMIN |
| Empty: "No posts match your filter." | STATE | — | — | — | — |

## 2. Following sub-page (`renderFollowing`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Followed-farmers feed | list | yes | `GET community/posts?following` | — | any |
| Follow requests (`renderContactRowFollowRequest`, `submitFollowRequest`) | row+BTN | yes | `POST follows` / `PATCH follows/{id}` | follow/accept | any |
| Specific-user search (`renderV77SpecificUserSearch`) | INP | yes | `GET users/search` | — | any |

## 3. Marketplace sub-page (`renderMarketplaceV78`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Region-first / Global-Export toggle (`rgnToggleExport`) | dropdown | yes | `GET marketplace?scope=` | — | any |
| Profession-aware framing | label | yes | profession | — | any |
| **New listing** (`openNewMarketplaceListing`) | BTN/MOD | yes | `POST marketplace/listings` | list | any |
| — listing modal: what (Crop/Livestock/Tools-equipment), Item, Quantity, Pay via (Cash/Bank transfer), Location (Suva pickup…) | FORM | yes | — | — | any |
| Listing card (`renderMarketplaceListingCard`) + offer / WhatsApp | card+BTN | yes | `GET marketplace/listings` | offer | any |
| **New procurement intent** (`openNewProcurementIntent`) | BTN/MOD | yes | `POST marketplace/intents` | post demand | any |
| Procurement intent card (`renderProcurementIntentCard`) | card | yes | `GET marketplace/intents` | — | any |

## 4. Directory sub-page (`renderDirectory`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| **Verify farmers surface** (`renderVerifyFarmersSurface`) | SEC | yes | `GET directory/farmers` | verification pillar |
| — tiles: Total farmer profiles / Verified farmers / Bank Evidence visible / PDF available | KPI×4 | yes | `GET directory/stats` | trust signals |
| — verified-farmer card (`renderVerifyFarmerCard`) + verification badge | card | yes | `GET directory/farmers/{id}` | bankability |
| **Service catalog** (`renderServiceCatalogSurface`) | SEC | yes | `GET directory/services` | providers |
| — service provider card (`renderServiceProviderCard`) + message/follow | card+BTN | yes | `GET services/{id}` | contact |

## 5. Saved sub-page (`renderSaved`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Saved posts/listings | list | yes | `GET saved` |
| Unsave | BTN | yes | `DELETE saved/{id}` |

## 6. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty states (feed/following/saved/marketplace) | STATE |
| Moderation/flag → ADMIN review | permission |
| Verification badges → Bank Evidence (Directory ↔ Reports) | cross-link |
| Partner home variant (`renderPartnerHome`) | partner face |
| Permissions: post/react/follow = any; moderate = ADMIN | inferred |

## 7. Data (prototype mock → implied schema)
| Domain | Implied (community schema, migration 017) |
|---|---|
| posts/likes/comments/follows/blocks/flags | community.* tables |
| marketplace listings + procurement intents | marketplace tables |
| service providers / verification | directory + verification |
| saved | saved/bookmarks |

---

## Home pillar — COMPLETE coverage statement
**~60 objects** across 5 sub-pages: Feed (composer + media/location/record-attach/topics + post cards + like/react/reply/share/flag + moderation), Following (feed + follow requests + user search), Marketplace (region/export toggle + listings + procurement intents + offers), Directory (verify-farmers surface + service catalog), Saved. States, permissions, navigation, data (community schema). **Home pillar audit = 100%, prototype-only.**

## Audit progress
**Farm nav: 20/20 ✅.** Top pillars: **Home ✅.** Remaining: Classroom, TIS, Me/Profile, Auth, public Verify/Covenant, Control Room.

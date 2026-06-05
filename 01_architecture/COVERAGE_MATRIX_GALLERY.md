# Prototype V262 — Coverage Matrix · Module 19: GALLERY (#18) 🔒 (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreGalleryView` 30186, `galleryViewSwitcher`
> 30130, `renderPhotoModal` 30319, `GALLERY_PHOTOS`/`GALLERY_FILTERS`). Hierarchy:
> Page → Sub-page (tab) → components. Columns = implied requirement. No codebase
> comparison. Locked (🔒) nav item.

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Gallery | `/farm/gallery` (locked) | `coreGalleryView` (+ `galleryViewSwitcher`) | Photos · Timeline · By location · Record groups · AI analysis · Evidence packs |

## 1. Chrome + view switcher
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| `h1` "Gallery" | label | — | — | any |
| View switcher (6 tabs, `switchGalleryView`) | tabs | yes | per-view | any |
| Filters (`GALLERY_FILTERS`) | dropdown | yes | `GET media?filter=` | any |
| Bulk select | INP | client | — | any |

## 2. Sub-page tabs (6)
| Sub-page | Backend Req | API Req | Notes |
|---|---|---|---|
| Photos | yes | `GET media?type=photo` | grid |
| Timeline | yes | `GET media?order=date` | chronological |
| By location | yes | `GET media?group=block` | per-block |
| Record groups | yes | `GET media?group=event` | by event/record |
| AI analysis | yes | `GET media/ai-analysis` | "Building" (photo analysis) |
| Evidence packs | yes | `GET evidence-packs` | bundle for bank/buyer |

## 3. Photos sub-page
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Photo grid (cards → `openPhotoModal`) | grid | yes | `GET media` | any |
| Photo card: thumbnail, geotag (pin), linked event | card | yes | media + event link | any |
| Video (Building) | card | yes | `GET media?type=video` | any |
| Bulk select → action | INP+BTN | yes | bulk ops | F/M |

## 4. Photo modal (`renderPhotoModal`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Full photo + metadata (date/location/event/operator) | MOD | yes | `GET media/{id}` | audit-linked |
| Linked event / cross-link | BTN | — | `navigateToFarmSub` | nav |

## 5. Evidence packs sub-page
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| **Build an evidence pack** (select photos → bundle) | BTN | yes | `POST evidence-packs` | bundle → dispatch (Reports) | OWNER |
| Evidence pack cards | card | yes | `GET evidence-packs` | — | OWNER |

## 6. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty: no photos | STATE |
| AI analysis / Video = "Building" | stub-in-prototype |
| Locked feature (🔒) | access |
| Permissions: view any; build evidence pack = OWNER; bulk = F/M | inferred |
| Photo → modal → linked event; evidence pack → Reports | nav |

## 7. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `GALLERY_PHOTOS` | media/photos table (+ object storage) |
| `GALLERY_FILTERS` | filter set |
| (evidence packs) | evidence_packs table |

---

## Gallery — COMPLETE coverage statement
**~25 objects** across chrome (view switcher + filters + bulk select), 6 sub-pages (Photos/Timeline/By location/Record groups/AI analysis/Evidence packs), photo grid + cards (geotag + linked event), photo modal, build-evidence-pack, states, permissions, navigation, data. **Gallery audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done = **18 / 20.** Remaining: Partnerships, Settings.

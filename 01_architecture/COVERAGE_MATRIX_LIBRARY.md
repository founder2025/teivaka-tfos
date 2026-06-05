# Prototype V262 — Coverage Matrix · Module 18: LIBRARY (#17) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`producerLibrary` 10256, `farmLibraryEnhanced`
> 10213, `libEnterprisesTab` 10232, `renderLibSearch` 10698). Hierarchy: Page →
> Sub-page (tab) → components. Columns = implied requirement. No codebase
> comparison. "Look it up. Plain words." — the grounded knowledge base (no LLM
> hallucination; cited articles).

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Library | `/farm/library` | `producerLibrary` (face-adaptive `farmLibraryEnhanced`) | Crops & Varieties · Chemicals · Pests · Diseases · Fertilizers · Livestock & Vet · Poultry · Feed & medicine · Guides & tools |

## 1. Chrome
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| `h1` "Library" + "Knowledge for your farm / Look it up. Plain words." | label | — | — | any |
| Search bar (`renderLibSearch`) | INP | yes | `GET kb/search?q=` | any |
| **Request library update** (`openLibRequestUpdate`) | BTN | yes | `POST kb/candidates` (kb_article_candidates) | request | any |
| "What affects my crops" quick lens | SEC | yes | `GET kb?crop=` | any |
| Hide Livestock & Vet toggle (settings strip) | INP | client | — | any |

## 2. Sub-page tabs (9)
| Sub-page | Backend Req | API Req | Notes |
|---|---|---|---|
| Crops & Varieties | yes | `GET productions`,`GET crop-varieties` | crop catalog + varieties |
| Chemicals | yes | `GET chemicals` | WHD/REI/MRL library |
| Pests | yes | `GET kb?type=pest` | |
| Diseases | yes | `GET kb?type=disease` | |
| Fertilizers | yes | `GET kb?type=fertilizer` + nutrition protocols | NPK |
| Livestock & Vet | yes | `GET kb?type=livestock` | |
| Poultry | yes | `GET kb?type=poultry` | |
| Feed & medicine | yes | `GET kb?type=feed` | |
| Guides & tools | yes | `GET kb-articles` | how-to guides |

## 3. Tab content (per sub-page)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Article/entry cards (crop/chem/pest/etc.) | card×N | yes | `GET kb-articles?type=` | cited |
| Article detail (drill) | SEC | yes | `GET kb-articles/{id}` | verification status surfaced |
| Crops tab: variety catalog | TBL | yes | `GET crop-varieties` | |
| Chemicals tab: per-chem WHD/REI/MRL/registered crops + restricted flag | TBL | yes | `GET chemicals` | shared with Compliance |
| Fertilizers tab: NPK nutrition protocols (cited, verification_status) | SEC | yes | `GET nutrition-protocols` | FAO-cited, never LLM-generated |

## 4. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty: no results for search | STATE |
| Verification-status caveat on articles (SEED_FAO_UNVERIFIED → reviewed → validated) | inviolable #1 (no hallucination) |
| Permissions: read any; request update any; edits via migration only (shared.* read-only) | inviolable #7 |
| Search → article detail; cross-link to Compliance (chemicals) | nav |

## 5. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| (crops/varieties) | shared.productions + crop_varieties |
| (chemicals) | shared.chemical_library |
| (articles) | shared.kb_articles + kb_embeddings (pgvector) |
| (nutrition) | shared.crop_nutrition_protocols |
| (update requests) | shared.kb_article_candidates |

---

## Library — COMPLETE coverage statement
**~25 objects** across chrome (search + request-update + quick lens + hide toggle), 9 sub-page tabs (Crops & Varieties/Chemicals/Pests/Diseases/Fertilizers/Livestock & Vet/Poultry/Feed & medicine/Guides & tools), tab content (article cards + detail + variety/chemical/nutrition tables), states, permissions, navigation, data. Grounded-KB + verification-status (inviolable #1) captured. **Library audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done = **17 / 20.** Remaining: Gallery, Partnerships, Settings.

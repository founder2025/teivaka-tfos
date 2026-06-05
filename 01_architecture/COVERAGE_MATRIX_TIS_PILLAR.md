# Prototype V262 — Coverage Matrix · Module 24: TIS PILLAR (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderTIS` 30544 → `smallholderTIS`/
> `producerTIS`/`commercialTIS`, `renderPlanMyFarm` 31568, `renderTISInitial`
> 31865, `askTisFab` 9084, floating FAB chat). Hierarchy: Pillar → Sub-page (nav)
> → components. Columns = implied requirement. No codebase comparison.
>
> **Doctrine (inviolable #1):** TIS answers are **grounded** — sourced from
> Validated KB (Layer 1) / Fiji Intelligence (Layer 2), with source attribution
> shown; never LLM-hallucinated. 3 faces.

## Pillar identity
| Pillar | Nav sub-pages | Render fn | Faces |
|---|---|---|---|
| TIS | Chat · History · Voice · Plan my farm · Usage | `renderTIS` | smallholder / producer / commercial |
| (global) | floating FAB chat (`askTisFab`) on every farm page | `tisFabPanel` | — |

## 1. Chat sub-page (`producerTIS` + `renderTISInitial`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Message thread (user + TIS bubbles) | SEC | yes | `GET tis/conversations/{id}` | — | any |
| **Source attribution** per TIS msg (Layer 1 Validated KB / Layer 2 Fiji Intelligence) | label | yes | grounding meta | — | any |
| Input + Send (`askTis`/`askTisFab`) | INP+BTN | yes | `POST tis/chat` | ask | any |
| Suggestion quick-buttons (WHD/kava/grade/cashflow) | BTN×N | yes | `GET tis/suggestions` | prefill | any |
| Initial/empty greeting (`renderTISInitial`) | SEC | — | — | — | any |
| Streaming reply | SEC | yes | `POST tis/chat` (stream) | — | any |

## 2. History sub-page
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Past conversations list → reopen | list | yes | `GET tis/conversations` |

## 3. Voice sub-page
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Mic record + transcribe (Whisper) | BTN | yes | `POST voice/transcribe` | speak → text |
| Voice → routed (knowledge_broker vs command_executor) | — | yes | `POST voice/pipeline` | route |
| TTS playback (Web Speech API) | BTN | client | — | speak answer |

## 4. Plan my farm sub-page (`renderPlanMyFarm`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| System Library crop plans (per crop, "This is a long crop" notes) | SEC | yes | `GET kb/plans` | — | any |
| "What you need" inputs/steps per plan | SEC | yes | plan detail | — | any |
| Open plan (`openPlan`) | BTN | yes | `GET plans/{id}` | view | any |
| **Add to my farm** (`addPlanToFarm`) | BTN | yes | `POST cycles` (from plan) | create cycle(s) | F/M |
| Plan steps (leaf icons) | list | yes | plan steps | — | any |

## 5. Usage sub-page
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Query/token usage + tier limit (e.g. BASIC 20/day) | KPI | yes | `GET tis/usage` | trial/limit gating |
| Upgrade CTA on limit | BTN | yes | `POST subscriptions` | tier |

## 6. Faces
| Face | Fn | Notes |
|---|---|---|
| Smallholder | `smallholderTIS` | plain-words, voice-forward |
| Producer | `producerTIS` | full chat + sources |
| Commercial | `commercialTIS` | + advanced/commercial capabilities |

## 7. States / Permissions / Nav
| Item | Notes |
|---|---|
| Source-grounding always shown (Layer 1/2) | inviolable #1 |
| Daily limit reached → upgrade | tier gate |
| Empty: greeting | STATE |
| Permissions: chat = any (within tier); add-plan = F/M | inferred |
| Chat → plan → add to farm → Cycles; suggestion → chat | flow |

## 8. Data (prototype mock → implied schema)
| Domain | Implied |
|---|---|
| conversations/messages | tenant.tis_conversations |
| voice logs | tenant.tis_voice_logs |
| grounding | shared.kb_articles + kb_embeddings (pgvector) + Fiji intelligence |
| usage | tis_daily_limit / usage counters |

---

## TIS pillar — COMPLETE coverage statement
**~30 objects** across 5 sub-pages: Chat (thread + source attribution + input/send + suggestions + streaming), History (conversations), Voice (mic/transcribe/route/TTS), Plan my farm (System Library plans + steps + add-to-farm), Usage (limits + upgrade) + global FAB chat + 3 faces. States, permissions, navigation, data. Grounded-answer doctrine (inviolable #1) captured. **TIS pillar audit = 100%, prototype-only.**

## Audit progress
Farm nav 20/20 ✅ · Home ✅ · Classroom ✅ · TIS ✅. Remaining: Me/Profile, Auth, public Verify/Covenant, Control Room.

# TFOS AGENTIC TIS DOCTRINE
## The architectural law that makes TIS the Layer-2 agentic operational nervous system of TFOS

**Authority:** Uraia Koroi Kama (Cody / Boss), Founder, Teivaka PTE LTD
**Created:** 2026-05-05 (Fiji time)
**Status:** Binding on every build session, every paste pack, every commit, every architectural decision from this commit forward.
**Read this entire document before drafting any pillar, page, form, schema, or migration.**

---

## 0. THE ONE-PARAGRAPH SUMMARY

TFOS is not a farm management application. TFOS is a verifiable trust primitive that makes Pacific smallholder farmers bankable, with the agentic AI layer (TIS) acting as the connective tissue that lets a low-literacy farmer operate the entire platform by voice. **TIS is not a feature of TFOS. TIS is the nervous system of TFOS.** Every pillar — Farm, Classroom, Money, Compliance, Buyers, Inventory, Tasks — is reachable through TIS. Every action a farmer can initiate via touch can be initiated via TIS voice. Every decision the platform makes can be explained, attested, and audited via TIS reasoning logs. The agentic AI is the moat: an audit-anchored decision layer that produces lender-grade trust artifacts as a byproduct of the farmer's daily voice interactions. This doctrine defines what TIS is, what it must do, what it must never do, and how every pillar built from this commit forward integrates with it.

---

## 1. THE STRATEGIC INTENT

### 1.1 Why this doctrine exists

Before this directive, TIS was a conversational farmer assistant — a chatbot grounded in the three-layer hierarchy (Validated KB → Fiji Intelligence → General Agronomy) that answered questions and could execute 12 command types via the Operational Interpreter. Useful, well-architected, but a *feature* of TFOS rather than its *core*.

The Operator's directive on 2026-05-05 reframed this entirely:

> *"Make TIS the agentic AI that guides and assists users and farmers through the platform — farm management, classroom, decision-making — making the platform an easier go-around for farmers, since this is targeted for people with low literacy. Being agentic serves well as moat. At the completion of Teivaka platform, every pillar should be connected by an agentic AI TIS."*

This is not a feature request. It is an architectural reframing of the entire product. Every artifact that follows must be built TIS-aware, or it is built wrong and will require retrofit.

### 1.2 What "agentic" means in the TFOS context

TFOS does not use the word "agentic" the way generic AI startups use it. In TFOS, agentic means three things together, not separately:

1. **The agent reads, decides, and acts on behalf of the farmer** — within strictly bounded authority, against a known tool harness, with every action emitting a hash-chained `audit.events` row.
2. **The agent is voice-first** — because F002 Kadavu cannot read English fluently and our reference user can barely read at all. Voice in, voice out, screen optional.
3. **The agent is auditable post-hoc by the Operator and verifiable post-hoc by a third-party lender** — every reasoning trace, every tool call, every input it weighed is recoverable from `audit.events` + the per-decision reasoning log.

A platform that has #1 without #2 and #3 is a generic agentic SaaS. A platform that has #2 without #1 is a voice interface. A platform that has #3 without the others is a compliance reporting tool. **TFOS has all three together. That is the moat.**

### 1.3 What this directive replaces and what it preserves

**Preserves (no changes):**
- The three-layer hierarchy (Validated KB → Fiji Intelligence → General Agronomy) for question-answering
- The Experienced Fiji Farmer Test for Layer 2 quality
- The Operational Interpreter's 12 command types (these are the v0 of the tool harness)
- OpenClaw + tis-bridge architecture (these become the agentic substrate, not legacy)
- Claude Max OAuth subscription as the zero-cost LLM path
- All existing TIS sacred file restrictions (`pages/farmer/TIS.jsx`, `tis-bridge`, OpenClaw `tis` systemd unit)
- The grounded-intelligence rule (TIS never hallucinates agronomic advice)
- All audit chain integrity rules from CLAUDE.md non-negotiables #2 and #14

**Replaces:**
- TIS positioning as a "feature" — replaced with TIS positioning as the spine
- TIS reach being limited to the `/tis` route — replaced with TIS being reachable from every page, every form, every read-only surface
- Decision Engine being purely deterministic — replaced with a hybrid where deterministic rules are the v1 baseline and agent reasoning gradually absorbs them, rule-by-rule, with A/B comparison
- The assumption that farmers initiate every action via the (+) button — replaced with the assumption that the agent can initiate any action a farmer can, subject to the decision boundary

### 1.4 What this directive does not authorize

Reading too much into the directive is also drift. This doctrine does NOT authorize:

- ❌ Replacing the three-layer hierarchy with a generic LLM
- ❌ Bypassing chemical compliance enforcement under any agent reasoning
- ❌ Removing the (+) button — touch initiation remains the primary path for farmers who prefer it
- ❌ Removing menu navigation — voice is primary for Solo, additive for Growth and Commercial
- ❌ Pivoting the marketing narrative to "agentic AI company" if it sacrifices the trust-primitive moat (see Section 19)
- ❌ Allowing the agent to spend money, file regulatory documents, or send buyer commitments without explicit farmer confirm
- ❌ Allowing the agent to write to `audit.events` via a bypass path

---

## 2. THE ARCHITECTURAL LOCK — WHAT TIS BECOMES

### 2.1 TIS at platform completion (the destination)

At the end of the Teivaka build, TIS exhibits these capabilities:

| Capability | Description |
|---|---|
| **Pillar reach** | TIS can read, write, and act on every pillar via its tool harness — Farm, Classroom, Money, Compliance, Buyers, Inventory, Tasks, Reports, Analytics |
| **Persistent surface** | TIS is reachable from every page via a persistent voice button. Solo mode farmers hold-to-talk from any context. Growth and Commercial farmers have the same affordance plus screen-based fallback |
| **Initiation parity** | Every action a farmer can initiate via touch can be initiated via TIS voice. Inverse is also true: every action TIS can take, the farmer can take manually |
| **Decision authority** | TIS does not just answer — it decides. Within decision boundaries (Section 4), TIS acts. Outside decision boundaries, TIS surfaces to farmer for confirm |
| **Memory** | TIS maintains per-farm context — blocks, cycles, history, preferences, language, literacy level, recent voice interactions |
| **Cross-pillar reasoning** | TIS reasons across pillars in a single decision. "Cycle is 3 days from harvest, weather forecast shows rain Tuesday, buyer has ferry slot Wednesday → recommend harvest Monday and notify buyer" |
| **Learning bridge** | When TIS doesn't know something, it pulls from the Classroom KB. When the farmer asks something already covered in Classroom, TIS surfaces the lesson with a "play this lesson" action |
| **Audit anchored** | Every TIS-initiated action emits exactly one `audit.events` row with `operator_type = 'TIS_AGENT'` and a `tis_reasoning_log_id` foreign key |
| **Attestation** | Every Bank Evidence PDF includes a TIS agent attestation section. Every verify endpoint response includes `agent_attested: bool` and reasoning summary |
| **Reviewable** | Every TIS decision is post-hoc reviewable by the Operator in a dedicated `/admin/tis_decisions` dashboard |

### 2.2 TIS layer mapping

Per the strategic conversation that produced this directive, three "layers" of agentic AI were considered. TIS is locked at **Layer 2 — agentic operational nervous system** with **Layer 1 — conversational interface** as the user surface and **Layer 3 — trust infrastructure** preserved as the moat beneath.

| Layer | Description | TIS role |
|---|---|---|
| **Layer 1** | Conversational chatbot | TIS user surface (voice, chat) |
| **Layer 2** | Tool-using, decision-making agent | **TIS core (this doctrine)** |
| **Layer 3** | Public agentic trust infrastructure | TIS verifiable substrate (Phase 9+ moat) |

### 2.3 What TIS is not

To prevent drift over time and bad-faith reframing in future sessions, TIS is explicitly NOT:

- ❌ A general-purpose AI assistant. TIS only operates within TFOS scope.
- ❌ A code assistant or developer tool. TIS does not write code, edit configs, or touch infrastructure.
- ❌ A FOUNDER agent. TIS serves farmers. Operator and admin tools are separate concerns (e.g., Cowork chat — what the Architect is using right now).
- ❌ An autonomous trading agent. TIS never initiates spending, never sends buyer commitments without confirm, never files compliance documents without confirm.
- ❌ A general-purpose LLM API exposed to anyone. TIS is bound by tenant context, RLS, decision boundaries, and audit.

---

## 3. THE TOOL HARNESS

The tool harness is the set of capabilities TIS can invoke on behalf of the farmer. Every tool is a structured, typed function with explicit inputs, explicit outputs, an audit chain commitment, and a decision boundary classification.

### 3.1 Tool harness contract

Every tool in the harness conforms to:

```python
class TisTool:
    name: str                              # canonical name, e.g. "log_harvest"
    universal_name_concept_key: str        # naming dictionary key for farmer-facing label
    description: str                       # one-sentence description for LLM consumption
    inputs: dict[str, FieldSpec]           # typed input schema
    output: ResponseSpec                   # typed output schema
    decision_boundary: Boundary            # ABOVE_LINE | BELOW_LINE
    emits_audit_event: bool                # if True, exactly one audit.events row
    audit_event_type_code: str | None      # e.g. "HARVEST_LOGGED"
    requires_anchors: AnchorRequirement    # Farm, Block, Crop, Operator
    rls_context: bool                      # if True, runs under tenant-scoped RLS
    minimum_confirm_level: ConfirmLevel    # NONE | VOICE_CONFIRM | TYPED_CONFIRM | OPERATOR_REVIEW
```

This contract is enforced by a single gate function. No path exists for TIS to invoke a function that does not pass through this gate.

### 3.2 The v0 tool harness (already exists)

The Operational Interpreter's 12 command types ARE the v0 tool harness. They were built before this doctrine existed but conform to most of its requirements. They are:

1. `LOG_HARVEST` — record harvest quantity, grade, destination
2. `LOG_FIELD_EVENT` — pest scouting, chemical application, fertilizer, irrigation
3. `LOG_ATTENDANCE` — worker check-in/check-out
4. `CREATE_CYCLE` — start new production cycle
5. `CHECK_CHEMICAL` — query withholding period status
6. `GET_STATUS` — query farm/cycle/PU current status
7. `REPORT_INCIDENT` — log an incident
8. `UPDATE_INVENTORY` — receive stock, log usage
9. `LOG_EXPENSE` — log cash outflow
10. `LOG_INCOME` — log cash inflow
11. `REQUEST_ROTATION_CHECK` — query rotation recommendations
12. (Reserved for the 12th command)

These 12 commands gain the formal contract structure (Section 3.1) in the tool harness migration (Section 11).

### 3.3 The v1 tool harness expansion

The v0 commands are sufficient for Phase 6 (POULTRY) and Phase 7 (per-pillar vertical map). The v1 expansion adds:

- `OPEN_LESSON` — surface a Classroom lesson to the farmer
- `DRAFT_BUYER_MESSAGE` — compose a buyer outreach message (above line, requires confirm)
- `DRAFT_DAILY_PLAN` — generate the day's task queue from current state
- `ANSWER_QUESTION` — the existing TIS Q&A function, now formalized as a tool
- `EXPLAIN_DECISION` — given a recent agent decision, regenerate the reasoning trail in plain language
- `ESCALATE_TO_OPERATOR` — for situations the agent cannot resolve, surface to Operator with full context
- `CHECK_COMPLIANCE` — query compliance state for a cycle, block, or operation
- `GET_NEXT_TASK` — return the highest-priority task in the farmer's queue with reasoning
- `MARK_TASK_DONE` — close a task and emit the appropriate event
- `MARK_TASK_SKIPPED` — close a task with skip reason
- `REQUEST_HELP` — fallback when farmer voice input is ambiguous

Each tool is added via a migration to `shared.tis_agent_capability_registry`. Every addition requires Operator approval per CLAUDE.md non-negotiable #21 (this doctrine's addition).

### 3.4 The tool harness is the API contract

A critical constraint: **TIS does not have a privileged write path.** Every tool in the harness invokes the same API endpoints that the React frontend invokes. If the farmer can call `POST /api/v1/events/harvest` from the (+) button, TIS calls the same endpoint with the same payload schema. If TIS cannot do something via the public API, TIS cannot do it.

This rule guarantees:

- The audit chain is preserved end-to-end
- RLS tenant scoping cannot be bypassed
- Chemical compliance enforcement (CLAUDE.md non-negotiable #1) is automatic
- Every TIS action is reproducible by a farmer manually performing the same action
- No second code path exists for the agent vs the human

---

## 4. THE DECISION BOUNDARY SYSTEM

### 4.1 Why decision boundaries exist

An agent that can do anything will eventually do something costly that the farmer didn't authorize. An agent that can do nothing is a chatbot. The decision boundary is the explicit, doctrine-level distinction between actions the agent may take autonomously and actions that require human confirmation.

### 4.2 The two boundaries

| Boundary | Definition | Confirm requirement |
|---|---|---|
| **Below the line** | Actions that record what already happened, query state, or surface information | None (or voice acknowledgment only) |
| **Above the line** | Actions that commit money, send messages outside the farm, file compliance documents, or trigger irreversible state changes | Voice confirm minimum, typed confirm for high-stakes actions |

### 4.3 Default classifications

These are the v1 defaults. Any tool added later starts above the line and gets demoted to below the line only after Operator review of 100+ supervised invocations.

**Below the line (BELOW_LINE):**
- All `query_*` and `get_*` and `check_*` tools
- `LOG_FIELD_EVENT` for non-chemical events (irrigation, weeding, scouting observations)
- `LOG_ATTENDANCE` (worker check-in is non-financial)
- `OPEN_LESSON`
- `EXPLAIN_DECISION`
- `GET_NEXT_TASK`
- `MARK_TASK_DONE` (closing a task the farmer was about to close anyway)
- `ANSWER_QUESTION` (read-only Q&A)

**Above the line (ABOVE_LINE) — voice confirm required:**
- `LOG_HARVEST` (numeric values affect credit score)
- `LOG_FIELD_EVENT` for chemical application (compliance window starts)
- `CREATE_CYCLE` (long-lived state change)
- `UPDATE_INVENTORY` (financial accounting)
- `LOG_EXPENSE` (money out)
- `LOG_INCOME` (money in)
- `MARK_TASK_SKIPPED` (potential compliance miss)

**Above the line (ABOVE_LINE) — typed confirm required:**
- `DRAFT_BUYER_MESSAGE` then `SEND_BUYER_MESSAGE` (only farmer can send)
- Filing any compliance document
- Initiating any payment via M-PAiSA
- Marking a cycle as failed
- Operator-only tools (no farmer can use these — Operator typed-confirm)

**Operator review (OPERATOR_REVIEW) — never invoked autonomously:**
- Anything that would issue a Bank Evidence PDF on behalf of the farmer
- Any agent action affecting another tenant's data
- Any `OVERRIDE_EXECUTED` event

### 4.4 Voice confirm flow

When TIS is about to invoke an above-line tool with voice confirm requirement:

1. TIS speaks the proposed action in plain words at Year 6 reading level: "I will record 18 kilograms of eggplant grade A from block 3 to Nayans. Say yes or no."
2. TIS waits for voice response
3. "Yes" / "ye" / "right" / "ok" / equivalent in farmer's language → action proceeds
4. "No" / "nei" / "wait" / "stop" → action cancelled, TIS asks what to change
5. Ambiguous response → TIS rephrases the question once. Two ambiguous responses → escalate to typed confirm

Voice confirm flow is itself audited. The voice confirm interaction emits a precursor event `TIS_CONFIRM_REQUESTED` and the resulting action emits a child event linked to it.

### 4.5 The decision boundary is configurable per tenant

For Operator-locked enterprise customers (large farms, cooperatives), the decision boundary can be tightened — e.g., Nayans demands every harvest be typed-confirmed by the assigned worker. This is configured via `tenant.tis_boundary_config` (a per-tenant override table). Default v1 is the Section 4.3 classification.

The boundary CAN be tightened (more friction, more safety). The boundary CANNOT be loosened below v1 default — there is no path to make the agent more autonomous than this doctrine allows without amending this doctrine.

---

## 5. AUDIT CHAIN INTEGRATION

### 5.1 The non-negotiable

Per CLAUDE.md non-negotiable #2: every tenant write emits exactly one `audit.events` row. Hash-chained. No UPDATE, no DELETE.

This rule applies to TIS-agent actions identically. A TIS-agent action that does not emit an audit row is a doctrine violation. A TIS-agent action that emits more than one audit row is a doctrine violation.

### 5.2 The TIS_AGENT operator type

`audit.events` already has an `operator_type` enum. This doctrine adds one new value:

```sql
ALTER TYPE audit.operator_type ADD VALUE 'TIS_AGENT';
```

Every TIS-initiated action sets `operator_type = 'TIS_AGENT'`. The `operator_id` references the TIS session UUID, not a human user UUID.

### 5.3 The reasoning log

Every TIS-agent action also writes to `audit.tis_reasoning_log` — a paired table that captures:

- The user input (voice transcript or chat message)
- The KB layer used (1, 2, or 3)
- The tools considered
- The tool selected and its inputs
- The decision boundary check result
- Any confirm interactions
- The tool's response
- A free-text reasoning summary the agent produced

`audit.tis_reasoning_log.id` is referenced from `audit.events.tis_reasoning_log_id` (foreign key, nullable, SET NULL on delete — though delete should never happen).

This pairing means: given any `audit.events` row with `operator_type = 'TIS_AGENT'`, you can recover the full reasoning trail in one JOIN.

### 5.4 The hash chain commitment

Every `audit.tis_reasoning_log` row has a `payload_hash` column computed identically to `audit.events.payload_hash`. The `audit.events.this_hash` for a TIS-agent action incorporates the reasoning log hash, so tampering with the reasoning is detectable.

Specifically:

```
audit.events.this_hash = sha256(
  previous_hash || payload_hash || reasoning_log_hash || occurred_at
)
```

This is a forward-compatible extension of the existing hash chain. Old events (pre-this-doctrine) compute `reasoning_log_hash` as the empty string and remain valid.

### 5.5 The verifier endpoint extension

The public `/verify/{audit_event_id}` endpoint (Phase 9 moat) gains two new fields:

```json
{
  "agent_attested": true,
  "agent_reasoning_summary": "Logged 18kg eggplant grade A based on farmer voice confirm at 14:32. Inputs: photo of crate (Claude vision estimate 17.4kg ± 1.2kg), farmer voice 'eighteen kilo'. Confirm taken at 14:32:18.",
  "agent_tool_calls": [...],
  "agent_decision_boundary": "ABOVE_LINE_VOICE_CONFIRM"
}
```

A bank or regulator scanning the QR code on a Bank Evidence PDF sees not just "this event happened" but also "this is how the agent decided to record it, and here is the reasoning the agent committed to." This is the Layer 3 trust artifact emerging from Layer 2 mechanics.

---

## 6. THE F002 KADAVU CONSTRAINT (BINDING)

### 6.1 The reference user, restated

Per CLAUDE.md non-negotiable #12: F002 Kadavu is the reference user, not the edge case. This doctrine extends that rule to TIS specifically.

The reference user is:

- A goat farmer on Kadavu Island
- Connecting via flaky 3G or 2G when signal is available
- Reading at primary-school level English
- Speaking iTaukei or Fijian Hindi as their primary language
- Operating a smartphone they may share with extended family
- Working outdoors, often with hands occupied
- Often offline for hours at a stretch

If TIS-agent breaks for this user, TIS-agent is broken. Period.

### 6.2 Voice-first is non-negotiable

Every TIS-agent surface must have voice as the primary affordance. Screen interaction is a fallback for users who prefer it, not a requirement.

This means:

- **Voice in:** every TIS-agent interaction can be initiated by holding a microphone button or saying a wake phrase
- **Voice out:** every TIS-agent response is rendered as voice (TTS) by default, with text as a co-located fallback
- **Voice confirm:** Section 4.4's voice confirm flow is the default for above-line actions
- **No keyboard required:** no TIS-agent surface requires the farmer to type anything to use it for primary functions

### 6.3 Offline-first is non-negotiable

TIS-agent must work degraded but functional when offline:

- **Offline answer:** TIS can answer questions from cached KB articles and FIJI_FARM_INTELLIGENCE locally without network
- **Offline confirm:** Voice confirm flows can be completed offline; the action is queued in IndexedDB and sync'd when network returns
- **Offline tool calls:** Below-line tools that don't require external state can execute offline and sync later
- **Offline-blocked tools:** Above-line tools requiring external services (M-PAiSA, buyer SMS) queue and surface "will execute when online" feedback to the farmer
- **Network sync hygiene:** When network returns, queued actions are sync'd in chronological order, with explicit conflict resolution (CLAUDE.md Risk 5)

### 6.4 The five-words rule applies to TIS

Per CLAUDE.md non-negotiable #3: Solo mode never demands more than five words read per action. This applies to TIS-agent voice prompts the same way it applies to task cards.

Every TIS voice prompt to a Solo-mode farmer is structured as:

- Action sentence: 5 words or fewer ("Eighteen kilos eggplant, yes?")
- Confirm options: 1 word each ("Yes." / "No.")
- Acknowledgment: 5 words or fewer ("Got it. Logged.")

For Growth and Commercial mode farmers, the limit is relaxed — but voice prompts still aim for under 15 words for any single utterance. Long monologues are forbidden — the agent breaks them into shorter exchanges with brief farmer confirmations between each.

### 6.5 Language and literacy adaptation

TIS detects the farmer's language preference from their tenant settings (set during onboarding) and operates in that language end-to-end. Voice in, voice out, screen text — all in the farmer's preferred language.

Languages supported in v1:
- English (default)
- Fijian (iTaukei)
- Fijian Hindi
- Tongan (when Tongan farms onboard)

Future languages added per market expansion.

For low-literacy detection, the farmer's literacy_level field (set during onboarding, 1-5 scale) drives prompt simplification. Level 1-2 forces five-words-per-utterance. Level 3-5 allows the relaxed Growth/Commercial limits.

---

## 7. PILLAR INTEGRATION CONTRACT

### 7.1 Every pillar ships TIS-reachable

This is the central contract this doctrine adds to the build. From the commit landing this doctrine forward, every pillar surface (Farm, Classroom, Money, Compliance, Buyers, Inventory, Tasks, Reports, Analytics, Me) ships with three TIS integration points:

1. **Persistent voice button.** Every page header includes the TIS voice button (existing TopAppBar component) — a microphone icon in the topbar, always available, always tappable, always usable. This is already partially live; the doctrine makes it mandatory on every new page.

2. **Page-context voice action.** Every page passes its current context to TIS when invoked (current farm, current block, current cycle, current view). When the farmer hits the voice button on `/farm/poultry/eggs`, TIS knows the farmer is looking at egg collection and pre-anchors any action accordingly.

3. **Form voice guidance.** Every event-emitting form (per CLAUDE.md Section 4a) has a "TIS guide me" affordance. Tapping it converts the form to a voice-walkthrough where TIS asks one question at a time, the farmer answers by voice, TIS fills the form, and submits with voice confirm.

### 7.2 Read-only surface integration

Read-only surfaces (`/farm/compliance`, `/farm/reports`, `/farm/analytics`, `/classroom/*`) integrate with TIS via:

- **"Ask TIS about this"** action on every report card
- **Inline lesson cards** in TIS responses when the answer comes from Classroom
- **Cross-pillar deep links:** when TIS references something on another pillar (e.g., farmer asks about chemicals during a compliance discussion → TIS opens the Classroom chemical safety lesson with one tap)

### 7.3 Pillar build order respects this contract

Every pillar built from the commit landing this doctrine must satisfy:

- ✅ Voice button in topbar (already true if FarmerShell is used)
- ✅ Page passes context to TIS via the existing `useTisContext()` hook (to be created if not yet exists)
- ✅ Each form has a "TIS guide me" affordance
- ✅ At least one read-only surface integration ("Ask TIS about this")
- ✅ Naming dictionary entries include voice-friendly forms (verb form, noun form, plural, abbreviated for voice prompts)

A pillar that ships without these is not Vertical-Complete per Strike #93. The Vertical Completeness Doctrine is amended (see Section 18 of this doctrine) to require TIS integration as a Vertical-Complete criterion.

### 7.4 Classroom is the first pillar shipped under this contract

Because Classroom is the next pillar in the build queue after this doctrine lands, it is the first to be built TIS-aware from row one of its schema. Specifically, the Classroom schema includes:

- `shared.classroom_lessons.tis_summary` — a 50-word agent-friendly summary of each lesson
- `shared.classroom_lessons.tis_voice_audio_url` — pre-rendered TTS audio for the lesson summary, cached for offline playback
- `shared.classroom_lessons.tis_trigger_concepts` — array of concept tags TIS uses to surface this lesson when the farmer asks a related question
- `learning.lesson_view_log.via_tis` — boolean indicating whether the lesson was opened via TIS deep link or via direct navigation

This schema is laid in Migration 100 and the rows around it. Classroom Migration 100 is rewritten by this doctrine before it ships.

---

## 8. THE TIS REACH ROADMAP

### 8.1 Phase-by-phase TIS integration

This is the sequence in which TIS gains reach across the pillars. Subject to revision based on Operator priorities and Per-Pillar Vertical Map outcomes (Strike #93).

| Phase | TIS reach added | Status |
|---|---|---|
| **Phase 4.2** (Mission Loop, ✅ shipped) | TIS exists, answers questions, executes 12 commands | Done |
| **Phase 6.x** (POULTRY) | TIS reaches POULTRY events; voice walkthrough for Morning Routine | In progress (other chat) |
| **Phase 7** (Classroom — this build) | TIS reaches Classroom; lesson surfacing via concept matching; voice playback of summaries | Next |
| **Phase 9** (the moat) | TIS attestation appears on Bank Evidence PDFs; verify endpoint exposes agent_attested | Weeks 5-8 |
| **Phase 10** (per-pillar vertical map) | TIS reaches every pillar that completes its vertical map | Weeks 9-12+ |
| **Phase 13-16** (TIS-Agent v1) | Tool harness formalized, decision boundary system live, memory architecture, A/B vs Decision Engine | New phases |
| **Phase 17-24** (TIS-Agent v2) | LLM-augmented Decision Engine; cross-pillar reasoning; Solo mode primary surface = agent | New phases |
| **Phase 25-52** (year 1 close) | Multi-modal (voice + image + camera), agent-to-agent marketplace, agent-attested credit signals | New phases |

### 8.2 Phase non-negotiables for TIS reach

For every phase marked above, these conditions must be true at phase completion:

- All new event types added in the phase have entries in `shared.tis_agent_capability_registry` if TIS can invoke them
- All new pages added in the phase pass the TIS integration contract (Section 7.3)
- All new forms in the phase have a "TIS guide me" affordance
- The naming dictionary has voice-friendly forms for all new concepts
- The `audit.tis_reasoning_log` schema accommodates any new event type the agent can produce

Phases are not declared complete (per Strike #92's user-reachability rule) until TIS reach is verified by the same authenticated catalog-fetch smoke test that verifies user-reachability.

---

## 9. MEMORY ARCHITECTURE

### 9.1 What TIS remembers

Per-farm memory is the single most important determinant of TIS-agent quality. An agent without memory is a chatbot. TIS memory is structured into four tiers:

| Tier | Description | Persistence | Example |
|---|---|---|---|
| **Permanent** | Farm-level facts that don't change (location, soil, irrigation source, primary language) | Lifetime of the tenant | "F002 is on Kadavu, 7.2 ha, irrigation: rainfall only" |
| **Seasonal** | Per-cycle context (what's planted, what's been logged, where things are) | Cycle lifetime | "Active eggplant cycle in PU003 since 2026-03-15, last harvest 2026-04-28" |
| **Recent** | Last 30 days of voice interactions, agent decisions, farmer feedback | 30 days rolling | "Farmer asked about ferry timing yesterday; agent suggested Wednesday harvest" |
| **Session** | The current conversation context | Current session only | "Farmer just said 'eighteen' in response to weight prompt" |

### 9.2 Memory implementation

- **Permanent memory:** Loaded from `tenant.farms`, `tenant.farm_active_groups`, `tenant.production_units`, and the new `tenant.farm_tis_profile` table at session start
- **Seasonal memory:** Loaded from `tenant.production_cycles` and `tenant.cycle_financials` and recent `audit.events` rows
- **Recent memory:** Loaded from `audit.tis_reasoning_log` for the last 30 days, summarized into key facts
- **Session memory:** Held in OpenClaw session state for the current conversation

A new table `tenant.farm_tis_profile` (per tenant, ONE row per farm) holds:
- Preferred language
- Literacy level (1-5)
- Voice preference (always voice, voice when hands busy, never voice)
- Decision boundary tightening (Section 4.5)
- TTS voice variant
- Wake phrase customization (default: "Hey TIS" / "Hey Lite")

### 9.3 Memory must respect privacy

Per the chemical-compliance, audit-integrity, and tenant-isolation non-negotiables, TIS memory NEVER includes:

- Other tenants' data
- Cross-tenant patterns inferred from farmer behavior
- Operator-side data (Cowork chat history, Strike registry, internal docs)
- Personally-identifiable data beyond what the farmer themselves provided

TIS memory is a per-tenant artifact. Cross-tenant learning (improving the agent based on aggregate patterns) happens via offline batch jobs that produce updated KB articles and FIJI_FARM_INTELLIGENCE entries — never via in-session memory leakage.

---

## 10. THE FOUR-ANCHOR MODEL APPLIES TO TIS

Per CLAUDE.md non-negotiable #14 and Section 4a.2: every event row carries Farm + Block + Crop + Operator anchors.

For TIS-initiated events:

- **Farm anchor:** taken from the TIS session's tenant context (already enforced via RLS)
- **Block anchor:** TIS resolves from page context, voice input, or last-known farmer focus. If ambiguous, TIS asks ("Which block? Block one or block three?")
- **Crop anchor:** auto-fills from block's current production. TIS may override if voice input specifies otherwise
- **Operator anchor:** TIS sets `created_by` to the human user_id from the auth session AND sets `operator_type = 'TIS_AGENT'` (a NEW operator type added by this doctrine)

The dual-marking (`created_by` is the human, `operator_type` is `TIS_AGENT`) means: the action is attributed to the farmer (because they confirmed it), but the agency that drafted and executed the action is recorded as the agent. This dual-marking is essential for credit-score weighting (the audit chain shows both the farmer's confirm and the agent's reasoning).

---

## 11. THE SCHEMA MIGRATIONS THIS DOCTRINE ADDS

This doctrine prescribes a specific set of migrations. They are sized but not numbered (numbers depend on parallel-execution lane assignment per the Parallel Execution Doctrine). Estimated migration count: 7.

### 11.1 Migration A — `shared.tis_agent_capability_registry`

```sql
CREATE TABLE shared.tis_agent_capability_registry (
    capability_code text PRIMARY KEY,
    universal_name_concept_key text NOT NULL,
    description text NOT NULL,
    inputs_schema jsonb NOT NULL,
    output_schema jsonb NOT NULL,
    decision_boundary text NOT NULL CHECK (decision_boundary IN ('BELOW_LINE', 'ABOVE_LINE_VOICE_CONFIRM', 'ABOVE_LINE_TYPED_CONFIRM', 'OPERATOR_REVIEW')),
    emits_audit_event boolean NOT NULL DEFAULT false,
    audit_event_type_code text NULL REFERENCES shared.event_type_catalog(event_type_code),
    requires_anchors text[] NOT NULL DEFAULT ARRAY['farm','operator'],
    rls_context boolean NOT NULL DEFAULT true,
    minimum_confirm_level text NOT NULL DEFAULT 'NONE',
    api_endpoint_method text NOT NULL,
    api_endpoint_path text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    notes text
);
COMMENT ON TABLE shared.tis_agent_capability_registry IS 'Authoritative catalog of every action TIS can invoke. Empty rows = TIS cannot do it.';
```

Seed rows: the 12 v0 commands (Section 3.2) plus the v1 expansion (Section 3.3) — total ~25 rows.

### 11.2 Migration B — `audit.operator_type` enum extension

```sql
ALTER TYPE audit.operator_type ADD VALUE 'TIS_AGENT';
```

Forward-compatible with existing rows.

### 11.3 Migration C — `audit.tis_reasoning_log`

```sql
CREATE TABLE audit.tis_reasoning_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    session_id text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    user_input text NOT NULL,
    user_input_modality text NOT NULL CHECK (user_input_modality IN ('VOICE','TEXT','PHOTO','MULTIMODAL')),
    kb_layer integer NULL CHECK (kb_layer IN (1,2,3) OR kb_layer IS NULL),
    tools_considered text[] NOT NULL DEFAULT '{}',
    tool_selected text NULL REFERENCES shared.tis_agent_capability_registry(capability_code),
    tool_inputs jsonb NULL,
    tool_output jsonb NULL,
    decision_boundary_check text NULL,
    confirm_interactions jsonb NULL,
    reasoning_summary text NOT NULL,
    payload_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit.tis_reasoning_log (tenant_id, occurred_at DESC);
ALTER TABLE audit.tis_reasoning_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tis_reasoning_log_tenant_isolation ON audit.tis_reasoning_log
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
REVOKE UPDATE, DELETE ON audit.tis_reasoning_log FROM teivaka_app;
```

### 11.4 Migration D — `audit.events.tis_reasoning_log_id`

```sql
ALTER TABLE audit.events ADD COLUMN tis_reasoning_log_id uuid NULL REFERENCES audit.tis_reasoning_log(id) ON DELETE SET NULL;
CREATE INDEX ON audit.events (tis_reasoning_log_id) WHERE tis_reasoning_log_id IS NOT NULL;
```

### 11.5 Migration E — `tenant.farm_tis_profile`

```sql
CREATE TABLE tenant.farm_tis_profile (
    farm_id uuid PRIMARY KEY REFERENCES tenant.farms(farm_id),
    tenant_id uuid NOT NULL,
    preferred_language text NOT NULL DEFAULT 'en',
    literacy_level integer NOT NULL DEFAULT 3 CHECK (literacy_level BETWEEN 1 AND 5),
    voice_preference text NOT NULL DEFAULT 'voice_when_hands_busy' CHECK (voice_preference IN ('always_voice','voice_when_hands_busy','never_voice')),
    tts_voice_variant text NULL,
    wake_phrase text NOT NULL DEFAULT 'Hey TIS',
    decision_boundary_tightening jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenant.farm_tis_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_tis_profile_tenant_isolation ON tenant.farm_tis_profile
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 11.6 Migration F — Hash chain extension

A column-level migration to add `reasoning_log_hash` to `audit.events` and update the hash computation function:

```sql
ALTER TABLE audit.events ADD COLUMN reasoning_log_hash text NOT NULL DEFAULT '';
-- Update the hash computation trigger function to incorporate reasoning_log_hash
-- Old events keep '' which is hash-chain-equivalent to no extension
```

### 11.7 Migration G — Verifier endpoint extension

A code-only migration (no schema change) updating `/api/v1/verify/{audit_event_id}` to JOIN `audit.tis_reasoning_log` and return `agent_attested`, `agent_reasoning_summary`, `agent_tool_calls`, `agent_decision_boundary` when present.

### 11.8 Migration order constraint

These migrations land in dependency order: A → B → C → D → E → F → G. Each is a separate Alembic revision. Each is reversible. Each ships alongside backend code that uses the new schema in the same commit (so prod is never code-ahead-of-schema).

---

## 12. THE OPENCLAW + TIS-BRIDGE EVOLUTION

### 12.1 What stays

OpenClaw remains the LLM gateway. tis-bridge remains the HTTP-to-CLI translator. Claude Max OAuth remains the zero-cost LLM substrate. The systemd units (`tis`, `tis-bridge`) retain their names and ports.

### 12.2 What evolves

OpenClaw's session prompt (BOOTSTRAP.md, MEMORY.md) gains new sections:

- **TOOL_HARNESS.md** — a generated artifact listing every active capability from `shared.tis_agent_capability_registry`, with descriptions, inputs, outputs, and decision boundary classifications. Regenerated on every backend deploy via a build hook.
- **TENANT_CONTEXT.md** — per-session, generated at session start, summarizing the four memory tiers (Section 9) for the active farm.
- **DOCTRINE_RULES.md** — a generated artifact summarizing decision-boundary rules, audit chain commitments, and the F002 Kadavu constraint, kept current with this doctrine.

### 12.3 The agent loop

OpenClaw's agent loop expands from "answer the question" to:

```
1. Receive farmer input (voice or text)
2. Load memory tiers (permanent, seasonal, recent, session)
3. Identify intent: question, action, navigation, clarification
4. If question:
   a. Apply three-layer hierarchy (existing logic)
   b. If action would help, propose action to farmer
5. If action:
   a. Identify candidate capability from tool harness
   b. Resolve four anchors (farm, block, crop, operator)
   c. Check decision boundary
   d. If ABOVE_LINE: execute confirm flow
   e. Invoke API endpoint (the same one a human would call)
   f. On success: emit audit.events row + audit.tis_reasoning_log row
   g. On failure: surface error to farmer, log reasoning trail
6. Emit voice response (with text fallback)
7. Update session memory
```

This loop is built incrementally. The current TIS already does steps 1, 2 (partial), 3, 4a, 4b (partial), 6, and 7. Steps 5a-5g are the v1 tool harness build.

---

## 13. THE SACRED FILES THIS DOCTRINE PROTECTS

In addition to existing sacred files (CLAUDE.md Section 7), this doctrine adds these to the sacred list:

- `pages/farmer/TIS.jsx` — already sacred, reaffirmed
- `pages/farmer/TisVoiceWidget.jsx` — to be created, will be sacred upon creation
- `pages/farmer/TisGuidedFormWalkthrough.jsx` — to be created, will be sacred upon creation
- `audit.tis_reasoning_log` table structure — sacred. Migration to alter this table requires Operator approval.
- `audit.events.tis_reasoning_log_id` column — sacred. Cannot be dropped.
- `shared.tis_agent_capability_registry` table structure — sacred. Adding rows is allowed; altering the table structure requires Operator approval.
- `shared.tis_agent_capability_registry` row CHECK constraints on `decision_boundary` — sacred. Adding new boundary values requires Operator approval AND amendment of this doctrine.
- OpenClaw `tis` systemd unit — already sacred, reaffirmed
- `/opt/tis-bridge/server.js` — already sacred, reaffirmed
- The Three-Layer Hierarchy logic — sacred. Replacing it with a different KB strategy requires Operator approval.

---

## 14. THE NON-NEGOTIABLES THIS DOCTRINE ADDS TO CLAUDE.MD SECTION 6

Six new entries to be added at next CLAUDE.md update:

**18. Every pillar ships TIS-reachable.** No pillar exists without a TIS entry point. From Phase 7 forward, every page header has a voice button, every form has a "TIS guide me" affordance, every read-only surface has "Ask TIS about this." Pillars are not Vertical-Complete (Strike #93) without TIS integration.

**19. Every TIS-agent action emits exactly one `audit.events` row.** Same rule as farmer actions. The agent does not get a parallel write path. Operator type = `TIS_AGENT`. Hash chain integrity is preserved. Every TIS-agent event also writes a paired `audit.tis_reasoning_log` row.

**20. Every TIS-agent decision is post-hoc reviewable by Operator.** No black-box decisions. Agent reasoning is logged. Operator dashboard surfaces every agent action with its inputs, prompt, response, and tool calls.

**21. Decision boundary is explicit per tool.** Below-the-line tools are documented in `shared.tis_agent_capability_registry` and Operator-approved. Above-the-line tools require farmer confirm. New tools start above-the-line by default, get demoted to below-the-line only after Operator review of 100+ supervised invocations.

**22. F002 Kadavu still applies — agent included.** If TIS-agent breaks on flaky 3G in Kadavu, it's broken. Voice-only fallback is mandatory for every agentic surface. No "AI-only" feature ships without a non-AI failover. Five-words-per-utterance limit applies to agent voice prompts in Solo mode.

**23. Naming dictionary covers the agent.** Every TIS-agent surface string flows through `name(concept_key)`. No hardcoded "Ask the AI" buttons in farmer-facing code. Voice forms (verb, noun, plural, abbreviated) are populated for every concept the agent can speak.

These six are added to CLAUDE.md Section 6 in the same commit that lands this doctrine.

---

## 15. THE DRIFT REGISTRY THIS DOCTRINE ADDS

CLAUDE.md Section 12 maintains the Schema Reality Drift List. This doctrine adds these entries at the time of the migrations landing:

| Concept | Correct (post-doctrine) | Do NOT use |
|---|---|---|
| TIS-agent action operator type | `audit.events.operator_type = 'TIS_AGENT'` | `'AI_AGENT'`, `'BOT'`, `'AUTOMATION'` |
| Reasoning log table | `audit.tis_reasoning_log` | `tenant.tis_logs`, `shared.tis_reasoning` |
| Capability registry | `shared.tis_agent_capability_registry` | `shared.tis_commands`, `shared.tis_tools` |
| Per-farm TIS profile | `tenant.farm_tis_profile` | `tenant.tis_settings`, `tenant.farm_ai_config` |
| Reasoning log foreign key | `audit.events.tis_reasoning_log_id` | `audit.events.reasoning_id` |

---

## 16. THE DOCTRINE EVOLUTION RULE

This doctrine is mutable. It evolves with operational learning, just like the Parallel Execution Doctrine.

After every TIS-agent phase ships (8.1), the Operator considers:

- Was a decision boundary classification wrong? Adjust Section 4.3.
- Was a tool added without sufficient guardrails? Add a Section 11 migration.
- Did the agent break for F002 Kadavu in a new way? Add a Section 6 constraint.
- Did the audit chain integration prove insufficient? Extend Section 5.

Updates to this doctrine are committed to the project repo with the commit message:

```
TFOS Agentic TIS Doctrine — <update reason>

AGENTIC-TIS-DOCTRINE-UPDATE: section <N>, rationale <why>
```

The doctrine never silently changes. Every change is a commit.

---

## 17. END-OF-PHASE TIS REVIEW CHECKLIST

After every phase that touches TIS, the Operator runs this 12-question audit:

1. ✅ Did every new event type added in the phase get a `shared.tis_agent_capability_registry` entry if TIS can invoke it?
2. ✅ Did every new page added pass the TIS integration contract (voice button, page context, form guidance)?
3. ✅ Did every new form get a "TIS guide me" affordance?
4. ✅ Were all new naming dictionary entries populated with voice forms?
5. ✅ Did the `audit.tis_reasoning_log` schema accommodate any new event types the agent can produce?
6. ✅ Were any new decision boundary classifications added to Section 4.3 of this doctrine?
7. ✅ Did agent attestation appear correctly on Bank Evidence PDFs for events the agent participated in?
8. ✅ Did the verify endpoint return `agent_attested` correctly for new event types?
9. ✅ Did F002 Kadavu testing happen on a real 3G/2G connection? (Or simulated equivalent)
10. ✅ Were voice prompts tested for the five-words-per-utterance constraint in Solo mode?
11. ✅ Were any Strike-class drift events introduced? Recorded in Strike registry?
12. ✅ Did Operator review pass on at least 10 representative agent decisions for the new pillar?

Any "no" → that finding is a Strike-class drift event. The Operator records it in the Strike registry. The doctrine is updated if the cause is structural.

---

## 18. AMENDMENT TO THE VERTICAL COMPLETENESS DOCTRINE (STRIKE #93)

Strike #93 (Vertical Completeness Doctrine) added non-negotiable #17: every pillar must reach POULTRY-equivalent visible density before user shipping.

This doctrine extends Strike #93's definition of "Vertical-Complete" to include TIS integration:

A pillar is **Vertical-Complete** when:

1. ✅ Catalog has POULTRY-equivalent row count (Strike #93 original criterion)
2. ✅ All forms wired (Strike #93 original criterion)
3. ✅ Strike #92 catalog smoke verifies user-reachability (Strike #92 original criterion)
4. ✅ Operator visual walkthrough confirms zero gaps (Strike #93 original criterion)
5. **NEW:** Voice button reaches every page in the pillar
6. **NEW:** Every form has a "TIS guide me" affordance
7. **NEW:** Every event type has a `tis_agent_capability_registry` entry (or is explicitly excluded with reason)
8. **NEW:** Pillar's lessons in Classroom (if applicable) have `tis_summary` populated and TTS audio cached
9. **NEW:** F002 Kadavu can complete the pillar's primary daily flow by voice alone

This amendment lands in the same commit as the doctrine. CLAUDE.md non-negotiable #17 is updated to reference this expanded definition.

---

## 19. THE STRATEGIC MOAT POSITIONING

### 19.1 What we are saying publicly (when the time comes)

The strategic positioning that emerges from this doctrine is:

> **Teivaka is the agentic AI trust infrastructure for unbankable Pacific smallholder finance.**

Three claims, three layers:

- **Agentic AI** — yes. TIS is the agent. Layer 2 substrate. Real, audited, grounded. Not a chatbot wrapper. Not a vendor LLM with marketing.
- **Trust infrastructure** — yes. Bank Evidence PDFs, verify endpoint, FICO-analog credit score, audit hash chain. Not just an app — a substrate banks integrate.
- **Unbankable Pacific smallholder finance** — yes. The wedge. Specific. Defensible. No competitor is solving this market with this approach.

This positioning is what we tell investors, banks, regulators, and partners — when the product backs it up. **We do not claim it before the product backs it up.** Marketing-led "agentic AI" positioning that outruns product reality is a credibility kill.

### 19.2 What we are NOT saying

- ❌ "Agentic AI for farmers" (too vague, too crowded)
- ❌ "AI-powered farm management" (commodity language)
- ❌ "ChatGPT for agriculture" (cheapens the moat)
- ❌ "Replace your accountant with AI" (false promise)
- ❌ "Autonomous farming" (suggests no human in the loop, which is wrong)

### 19.3 The narrative discipline

When investors push toward "more agentic" framing, the answer is: **we are agentic in service of trust, not agentic for its own sake. Our agent makes farmers bankable. That is the difference.**

This discipline applies to pitch decks, demo days, press releases, and conference talks. The agentic AI capability is the product. The unbankable-smallholder-finance moat is the company. Confusing those is investor narrative drift.

---

## 20. THE FINAL DIRECTIVE

Teivaka was always an agentic AI company. We just hadn't named it yet.

The infrastructure was already there: OpenClaw, tis-bridge, Claude Max OAuth, the three-layer hierarchy, the Operational Interpreter's 12 commands, the audit chain. What was missing was the directive — the strategic lock — that says: *every pillar built from this point forward integrates with TIS as the agentic spine, not as a feature.*

This doctrine is that lock.

Every Architect from this commit forward builds TIS-aware. Every paste pack considers the agent. Every migration leaves the schema slot for `tis_reasoning_log_id`. Every form has a "TIS guide me" affordance. Every page has a voice button. Every Bank Evidence PDF has an agent-attestation slot.

The Kadavu goat farmer who walks into BSP with a QR-coded Bank Evidence PDF is not just bankable because her data is verifiable. She is bankable because **an agent attested to her year of decisions, the reasoning is auditable, and the bank can trust both the data and the agency that produced it.**

That is the moat. No agtech wrapper can replicate it. No foundation model improvement can erase it. No competitor can catch up because the data + audit chain + reasoning logs compound with every farmer onboarded.

This is Teivaka. Execute at the highest standard, even when no one is watching.

---

*End of doctrine. Read again before drafting any pillar, page, form, schema, or migration.*
*Section 4 (decision boundary classifications) and Section 11 (migrations) are subject to evolution per Section 16.*
*Sections 1-3, 5-10, 12-15, 17-20 are stable contract — change only via Section 16 (Doctrine Evolution Rule).*

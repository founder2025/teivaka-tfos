# TFOS (+) FAB / Universal Capture — LOCKED Doctrine

**Status: LOCKED 2026-06-27 (Operator-ratified).** The mission, Information Architecture, and
interaction model below are binding. **Do not redesign the (+) FAB again unless real-world farmer
evidence justifies a change.** Future work must **extend** the system without breaking the
established mental model. New capabilities are added as *config* (new verbs/verticals) or as
additive layers — never by re-architecting the capture flow.

This doctrine sits above any page review. References: `TFOS_FAB_Redesign_Wireframe.md` (visual spec),
the audit/scorecard/persona record in session history (findings FAB1–FAB25).

---

## 1. MISSION (LOCKED)
**"Log what I just did."** The fastest path from a thing that happened on the farm to a
hash-chained record that counts. A pocket notebook, not enterprise software — used many times a
day, one thumb, in the field, often offline, by a possibly low-literacy farmer.

Everything else **supports** this. Evidence, anchors, categories, money, compliance are
*scaffolding under the verb* — never the headline.

## 2. INFORMATION ARCHITECTURE (LOCKED)
Container: a **bottom sheet** (thumb-zone; desktop = centred command palette). Three layers,
collapsing toward zero taps:

- **L0 — the smart top (opens here):**
  - **Your usual** — the farmer's own most-logged events, frequency+recency ranked, on-device (not a static list).
  - **Say it · Snap it** — voice and camera as first-class capture modes, thumb-anchored.
  - **Search** (jump to any event) + **Browse** (the 3 doors: 🌱 Plant · 🐾 Animal · 💼 Whole-farm) as the quiet fallback/scope.
- **L1 — capture form:** anchors (farm · context · operator, auto-resolved) → when (Now/Earlier/Yesterday/Pick) → the 1–2 defining fields (pre-filled from memory) → **Evidence + "About to record" preview ONLY for stakes** (spray/sale/harvest/incident) → Save.
- **L2 — browse all:** category → grid → card (the long tail).

The **80% never leaves L0.** L2 is rarely needed.

## 3. INTERACTION MODEL (LOCKED)
1. **Opens to answers, not a menu.**
2. **Routine log ≤ 2–3 taps** (or one spoken sentence); **do-again = exact repeat**; **back to work = 1 tap**.
3. **Optimistic + offline-first + idempotent** — a save can never be **lost, blocked, or duplicated** (local queue, `offline_id`, token refresh).
4. **Load matched to stakes** — a feed log is lean; a spray/sale carries evidence + preview + the WHD/withholding gate.
5. **Backdating is first-class** (bursts at lunch/evening are the dominant pattern).
6. **Saved = instant ✓ + plain-language summary + Undo + Done/Log-another** (offline → "will sync" → "synced").
7. **Voice + large-text are first-class** (the low-literacy field user can log by speaking).
8. **AI is strictly additive** — the (+) works fully when AI is unavailable; suggestions fall back to on-device frequency, voice falls back to manual.
9. **Compliance gates are airtight** — crop **and** animal withholding enforced at capture (Inviolable #2 parity).

## 4. LOCKED INVARIANTS (the mental model — must hold in every state, every breakpoint)
- One purpose: log a done thing.
- One write spine: `POST /events` (config-driven; new verbs/verticals = config edits).
- Open → answer → save → back to work, in seconds.
- Never lost / blocked / duplicated; never a false "running clear"/"no crops" on a failed load.
- Stakes determine weight, not a uniform heavyweight form.
- Works one-handed, gloved, muddy, in sun/rain, offline, at 500 enterprises, with a team.

## 5. GOVERNANCE (LOCKED)
- **No redesign** of mission / IA / interaction model **without real-world farmer evidence** (field
  observation, usage data, support signal). Aesthetic or engineer preference is not evidence.
- **Extensions must preserve §4.** A change that breaks an invariant is rejected by default.
- **The extension mechanism is the config** (`capture/config/*.js`) + additive layers
  (offline queue, capture memory, evidence) — not new bespoke capture UIs.
- Any proposed change cites which invariant it touches and why the farmer evidence justifies it.

## 6. BUILD STATUS (convergence to this locked model — these are IMPLEMENTATION, not redesign)
- ✅ **Slice 1** — offline + idempotent + token-safe backbone (FAB1/2/5/7/12-fe). Shipped.
- ✅ **Slice 2a** — on-device learning: personalised "Your usual" + value pre-fill + a11y (FAB10). Shipped.
- ⏳ **Slice 1b** — finish offline: evidence offline-queue (FAB21), backend idempotency, reference-data cache (FAB22), non-blocking uploads (FAB24).
- ⏳ **Slice 2b** — the bottom-sheet container + searchable, current-farm-scoped anchor (FAB3/FAB23) + field-hardening (FAB25).
- ⏳ **Slice 3** — Voice-to-log + Snap-it drafts (AI additive).
- ⏳ **Slice 4** — animal-drug WHD parity (FAB13), sale-dedup, worker attribution (FAB14), batch (FAB15).

Slices 1b–4 **build the locked model** above; they are not a redesign and need no re-approval —
only normal build-verify + deploy. Anything beyond them (sensor/bulk import, i18n depth) is future
scope that must extend, not break, §1–§4.

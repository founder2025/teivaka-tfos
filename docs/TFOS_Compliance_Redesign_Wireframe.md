# TFOS Compliance Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/compliance` (`CropCompliance.jsx` + `crop_compliance.py`) after the audit
(CO1–CO29). The enforcement *gate* (harvest trigger, Inviolable #2) is real and stays untouched.
This pass fixes the **compliance VIEW**, whose two worst sins are (a) it **fakes a clean record on
load failure** (CO1–CO3) and (b) it **hides chemical applications that aren't fully specified**
(CO18) and never flags **off-label** use (CO19) — on the one surface lenders and regulators trust.

## Headline decisions
1. **Never fake "clean" (CO1/CO2/CO3 — critical).** Every tab routes through api.js + cached-on-error:
   on a load error show **ErrorCard + Retry** (or a degraded banner if we have cached data) — NEVER
   the green "no overrides / all harvest-safe / nothing logged" state. A compliance claim must never
   be a side-effect of a failed fetch.
2. **Stop hiding, stop guessing (CO18/CO4/CO19 — backend).** The holds/register queries switch
   `INNER JOIN`→`LEFT JOIN` on `chemical_library` and read the **stored** `field_events.whd_clearance_date`
   (trigger-computed) instead of recomputing (CO20/CO12). Result:
   - `chemical_application=true` with **no chemical picked** now appears as **"Chemical applied —
     not identified · WHD unknown"** (a *needs-attention* state, never "clear").
   - **Off-label** use is flagged by comparing `chemical_library.registered_crops` to the cycle's
     `production_id` — "Not registered for {crop}".
3. **One answer, up top (cognitive load / decisions).** Status leads with a single verdict banner —
   *"N blocks can't be sold yet · next clears in X days"* or *"All blocks harvest-safe"* — then the
   block grid. The marketing strip shrinks; the FOUNDER-override button is **de-emphasised**
   ("Wait for clearance" is primary) and **pre-selects the block** when it does route to harvest (CO25).
4. **Honest standing, not a fake score (CO6/CO28).** The permanent "—" score is replaced by a real,
   defined **Compliance standing** derived from live data: *Clean* (0 overrides, 0 unknown/off-label,
   0 active blocks) vs a list of the actual dings. No invented 0–100 number.
5. **Platform + a11y (CO7/CO8/CO14/CO16/CO17/CO24/CO26):** api.js; view-aware **Ask AI**; `role=tab`
   + arrow-key tabs; shared `<Modal>` for override; register shows **dose + who applied + off-label
   badge** and a "latest 500" note; Analytics shares the register query (no duplicate fetch);
   responsive capital strips.

## Visual wireframe (Status tab)
```
⛅ Weather affects spray windows · Open weather
Compliance — spray safety & chemical records · Save-A-Lot Farm     [Farm ▾] [✨ Ask AI] [＋ Log chemical]
[ Status | Areas | Chemical register | Certifications | Overrides | Calendar | Analytics ]  role=tab

╔ VERDICT ══════════════════════════════════════════════════════════════╗
║  🔴 2 blocks can't be sold yet — next clears in 3 days (Mar 14)         ║   ← the one answer
║     (or 🟢 All active blocks are harvest-safe)                          ║
╚════════════════════════════════════════════════════════════════════════╝
Dual-layer enforcement: ACTIVE · spray check + permanent record check (compact strip)

[ Blocked now 2 ][ Needs attention 1 ][ Harvest-safe 4 ][ Overrides YTD 0 ]   ← responsive
[ All | Blocked | Needs attention | Clear ]

⟦ compQ error + no cache → "Couldn't load compliance · Retry" (NEVER all-clear) ⟧

 ┌ Block A · Cassava            🔴 Harvest blocked ──────────────────────┐
 │ Gramoxone applied 11 Mar · WHD 14d · clears 25 Mar · in 3 days        │
 │ ⚠ Not registered for Cassava (off-label)         [Wait] · [Override…] │
 ├ Block B · Tomato             🟠 Needs attention ──────────────────────┤
 │ Chemical applied 09 Mar — not identified · WHD unknown. Add the        │
 │ chemical so its withholding period can protect the harvest.  [Fix log] │
 └ Block C · Dalo               🟢 Clear · buyer-ready ──────────────────┘

OVERRIDES tab: error → ErrorCard (never the green "banker-clean" message)
              "Showing overrides across all your farms" (honest until CO5 farm-scoping ships)
REGISTER tab: Date · Chemical · Block · Crop · Dose · By · WHD · Clears · Verify  + "latest 500" note
              unidentified + off-label rows shown with a badge (no longer hidden)
```

## Fixes shipped — frontend (`CropCompliance.jsx`)
- **CO1/CO2/CO3** api.js + ErrorCard/Retry/degraded — no clean-state-on-error anywhere.
- **CO6/CO28** real "Compliance standing" replaces the "—" score. **CO8** view-aware Ask AI.
- **CO14** `role=tab` + arrow keys; shared `<Modal>` override (Esc/focus-trap). **CO25** override
  de-emphasised + block pre-selected via `openFormModal("harvest_new", {cycle_id})`.
- **CO18/CO19 surfaced** — "not identified / off-label" cards + register badges. **CO24** dose + by.
- **CO16** "latest 500" note. **CO17** responsive strips. **CO26** Analytics reuses `["comp-reg"]`.
- Verdict banner (cognitive load); compact dual-layer strip.

## Fixes bundled — backend (`crop_compliance.py`, NO migration) → STAGE
- **CO18/CO4/CO12/CO20** status + register: `LEFT JOIN chemical_library`, read stored
  `whd_clearance_date` (fallback to computed), surface `unspecified` (chem_application w/o chemical_id).
- **CO19** `off_label` = `production_id <> ANY(registered_crops)`. **CO24** register adds `dose`,
  `applied_by` (created_by→users). **CO13** overrides YTD uses the current year, not a hardcoded date.
- Status returns `attention_count` + per-block `state` ("blocked"|"unknown"|"off_label").

## Filed (honest — bigger / needs migration, NOT faked)
- **CO5** farm-scope overrides — `harvest_compliance_overrides` has **no farm_id**; add the column +
  populate at override write (harvests.py) + filter. Until then the tab is honestly labelled
  "across all your farms." **Migration.**
- **CO20 (full)** precompute holds into a `compliance_hold`/decision-signal table (read-time join
  is the Inviolable-#3 anti-pattern at scale). **CO11/CO21** unify crop + animal-drug withholding
  into one compliance model/page. **CO22** worker re-entry interval. **CO23** MRL per export market.
  **CO27** auto-task/notify on clearance. **CO29** crop-specific harvest rules (kava 180-day, PHI).
  **CO9** certifications store. Each filed with its real backing requirement.
```

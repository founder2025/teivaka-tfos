# (+) FAB / Universal Capture — Complete Visual Wireframe & Spec (2026-06-27)

North star: *the fastest path from "I just did X" to "it's recorded and it counts."* Pocket
notebook, one thumb, in the field, often offline. Design-only (no code). Palette = existing app
tokens (cream / paper / soil / green / amber / red / line).

──────────────────────────────────────────────────────────────────────────
## 1. DESIGN TOKENS

**Type scale (mobile, px / weight)**
- Sheet title           17 / 600   soil
- Section label         11 / 700   muted · UPPERCASE · letter-spacing .6
- Chip / list label     14 / 600   soil
- Mode-button label     16 / 700   soil
- Field label           13 / 600   soil
- Input text            16 / 500   (≥16 to stop iOS zoom)
- Summary / body        13 / 400   soil
- Meta / hash           11 / 400   mono · muted

**Spacing — 8pt grid.** Sheet padding 16 · section gap 16 · chip gap 8 · in-card row gap 10.
**Radii.** Sheet top 20 · cards 16 · chips 999 · inputs 12.
**Targets.** Min tap 48×48 · mode buttons 64 tall · (+) 56 (mobile center) / 32 (desktop pill).
**Elevation.** Sheet shadow 0 -8 24 rgba(0,0,0,.18) · scrim rgba(0,0,0,.40).

**Icons (lucide).** chips 14 · mode buttons 20 · verb tiles 22 · (+) 28.
Mapping: Feed `Wheat` · Eggs `Egg` · Mortality `Skull` · Observation `Eye` · Spray `Droplet`
· Harvest `Wheat` · Cash-in `HandCoins` · Cash-out `Wallet` · Plant `Sprout` · Animal `PawPrint`
· Whole `Banknote` · Say-it `Mic` · Snap-it `Camera` · Search `Search` · Saved `Check`.

──────────────────────────────────────────────────────────────────────────
## 2. BOTTOM SHEET — STATE A · OPEN (peek) · MOBILE

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░  ← scrim (tap = dismiss)
┌─────────────────────────┐
│         ▁▁▁▁▁           │  drag handle 36×4 (swipe ↓ = close)
│ Log what you just did   │  17/600 soil          [aria: dialog title]
│                         │
│ RIGHT NOW · 6:10am      │  11/700 muted          ← AI suggestions
│ ┌────────┐┌────────┐    │  chips 48 tall, gap 8
│ │🌾 Feed  ││🥚 Eggs │    │
│ │ flock A ││        │    │
│ └────────┘└────────┘    │
│ ┌────────┐              │
│ │💀 Death ││            │
│ └────────┘              │
│                         │
│ DO AGAIN                │  ← recents / 1-tap repeat
│ ┌──────────────┐┌─────┐ │
│ │↻ Feed 25kg   ││↻ …  │ │
│ │  yesterday   ││     │ │
│ └──────────────┘└─────┘ │
│                         │
│ 🔍 Search any record…   │  input 48 tall
│                         │
│ BROWSE  🌱Plant 🐾Animal│  quiet category row (demoted)
│         💼Whole-farm     │
├─────────────────────────┤  ← thumb zone divider
│ ╔═══════════╗╔════════╗ │  PRIMARY MODES, 64 tall, lowest = most reachable
│ ║ 🎤 Say it ║║📷 Snap ║ │  green outline, soil label
│ ╚═══════════╝╚════════╝ │
└─────────────────────────┘
peek height ≈ 58% vh · grows to 92% on capture
```
**Hierarchy (top→down = least→most reachable):** title (context) → suggestions (the 80%) →
do-again → search → browse → **Say-it / Snap-it pinned at the very bottom (thumb)**.
**Hidden:** full 50-event catalog (Browse), Evidence card, "About to record" preview, advanced
fields, date editing — all summoned only when needed.

──────────────────────────────────────────────────────────────────────────
## 3. STATE B · LEAN CAPTURE (routine — sheet expands)  ·  3rd tap = Save

```
┌─────────────────────────┐
│ ‹ Back        Feed       │  back chevron (44²) + verb title 17/600
│                          │
│ Flock A · you · Today    │  ANCHOR LINE (auto) 13/400 muted — tap to change
│ [Now][Earlier][Yest][📅] │  when-chips (Now preselected)        ← backdating
│                          │
│ How much?                │  field label 13/600
│   ┌──┐  ┌──────┐  ┌──┐   │  number stepper, 48² buttons
│   │ −│  │  25  │  │ +│   │  pre-filled last value, big 18/700
│   └──┘  └──────┘  └──┘   │  unit: kg (auto)
│                          │
│ + Add detail             │  reveals tier-2 fields
│ Notes (optional)  …      │
│                          │
├─────────────────────────┤
│ ╔══════════════════════╗ │  SAVE — full-width, 56 tall, green, thumb
│ ║   ✓  Save            ║ │
│ ╚══════════════════════╝ │
└─────────────────────────┘
```
No Evidence card, no preview — load matched to stakes. One field. Save is the only big target.

──────────────────────────────────────────────────────────────────────────
## 4. STATE C · VOICE  ·  STATE D · SNAP

```
   SAY IT (listening)              SNAP IT → finish-or-later
┌─────────────────────┐        ┌─────────────────────────┐
│ ‹ Back              │        │ [ live camera viewfinder ]│
│                     │        │      GPS ● · 6:12am       │
│      ◉ 0:03         │ aria   │        ( ◯ shutter )      │
│   ░▒▓ listening ░▒▓ │ -live  └─────────────────────────┘
│                     │              ↓ photo taken
│ "fed flock A 25 kg  │        ┌─────────────────────────┐
│  this morning"      │        │ [thumb]  Pest on leaf?  │ AI guess
│                     │        │ ┌─────────┐┌──────────┐ │
│ ┌─────────────────┐ │        │ │Finish now││Save for  │ │
│ │ Feed·Flock A·25kg│ │ draft │ │          ││ later    │ │
│ │ ·8am   ✎ edit   │ │ card  │ └─────────┘└──────────┘ │
│ └─────────────────┘ │        └─────────────────────────┘
│ ╔═════════════════╗ │  "Save for later" → draft tray + gentle nudge.
│ ║   ✓ Save        ║ │  Unsure parse → drops into State B pre-filled (never a dead end).
│ ╚═════════════════╝ │
└─────────────────────┘
```

──────────────────────────────────────────────────────────────────────────
## 5. STATE E · COMPLIANCE (spray) — heavier BY DESIGN (confidence > speed)

```
┌─────────────────────────┐
│ ‹ Back        Spray      │
│ Eggplant · you · Today   │  anchor + when
│ Chemical                 │
│ 🔍 [ Karate Zeon…      ] │  search REAL library (Inviolable #2)
│   ⚠ Harvest blocked 7d   │  amber callout — clears 14 Jul   ← WHD confidence
│ Rate  [ 2.0 ] ml/L       │
│ ┌───────────────────────┐│  EVIDENCE card (shown — stakes)
│ │ EVIDENCE · lifts trust ││
│ │ [📷][📍][🎤][👥]      ││
│ └───────────────────────┘│
│ ┌───────────────────────┐│  ABOUT TO RECORD (preview — stakes)
│ │✔ CHEMICAL_APPLIED ·    ││
│ │  Eggplant · 14 Jul     ││
│ └───────────────────────┘│
│ ╔══════════════════════╗ │
│ ║  ✓  Save             ║ │
│ ╚══════════════════════╝ │
└─────────────────────────┘
```
Same chrome appears for sales/harvest. A feed log never sees it.

──────────────────────────────────────────────────────────────────────────
## 6. LOADING & CONFIRMATION

**Loading (never blank, never blocking):**
```
suggestions cold:   [▒▒▒▒][▒▒▒▒][▒▒▒▒]   shimmer chips (cache fills instantly when warm)
list/anchors:       ▒▒▒▒▒▒▒▒  skeleton rows
load failure:       ⚠ Couldn't load — Retry      (NEVER "you have no crops")
save:               OPTIMISTIC — no spinner; queued + flushing in background
```

**Confirmation — STATE F (online & offline):**
```
        ✓                        ✓  (cloud-pending dot)
   (check draws 300ms)        Saved · will sync
   Saved                      Feed · Flock A · 25 kg · today
   Feed · Flock A · 25 kg     ───────────────
   ───────────────            ↩ Undo (5s ▓▓▓░░)
   ↩ Undo (5s ▓▓▓░░)          [ Log another ] [ Done ]
   [ Log another ] [ Done ]
        (online)                     (offline → later toast: "Synced ✓")
```
Optimistic + Undo replaces a pre-confirm. Idempotent (`offline_id`) → no duplicate on the chain.
"Done" = 1 tap back to work; "Log another" keeps the anchor for the burst.

──────────────────────────────────────────────────────────────────────────
## 7. ANIMATIONS (motion spec)
- **Open:** sheet translateY 100%→0, 280ms `cubic-bezier(.32,.72,0,1)`; scrim fade 200ms; light haptic.
- **Chip / button press:** scale .97, 80ms.
- **Form expand:** sheet height grows 220ms ease-out; content cross-fade 140ms.
- **Save:** check stroke-draws 300ms + success haptic; content cross-fades to State F 180ms.
- **Undo toast:** slide-up 160ms, 5s progress bar, auto-dismiss.
- **Close:** reverse 240ms.
- **`prefers-reduced-motion`:** all translate/scale/draw → opacity fades only; check appears, not drawn.

──────────────────────────────────────────────────────────────────────────
## 8. ACCESSIBILITY
- `role="dialog"` `aria-modal`, **focus trap**, focus returns to the (+) on close; **Esc** closes;
  drag handle has an invisible "Close" button for AT.
- Every input has `<label htmlFor>`; number steppers `aria-label` "increase/decrease".
- Chips/choices `role="button"` `aria-pressed`; **selection = checkmark + colour** (never colour alone).
- `aria-live="polite"`: "Saved", offline "will sync"/"synced", recording timer, GPS status, load errors.
- **Voice is a first-class input** (low-literacy / low-vision can log by speaking).
- Targets ≥48px; inputs ≥16px; AA contrast (soil #5c4033 on cream; green ✓ has the word "Saved").
- Honors OS **dynamic/large text**; reading order: title → suggestions → do-again → modes → search → browse.

──────────────────────────────────────────────────────────────────────────
## 9. RESPONSIVE

**MOBILE (<640) — the primary.** Full-width bottom sheet, peek 58% / expand 92%. Modes 2-up at the
bottom thumb arc. Everything above scrolls. (Wireframes §2–6.)

**TABLET (640–1024).** Bottom sheet, **max-width 560 centred**, peek 64% (more above the fold).
Suggestions in a **2-col** grid; do-again 2-col; modes stay 2-up full-width. Still thumb-anchored
(tablets are held two-handed but tapped one-thumb) — modes stay at the bottom edge.
```
            ┌───────────────────────────┐
            │            ▁▁▁▁           │
            │ Log what you just did     │
            │ RIGHT NOW · 6:10am        │
            │ [Feed A][Eggs][Death][▢]  │  2-col suggestions
            │ DO AGAIN  [↻ Feed][↻ …]   │
            │ 🔍 Search…                 │
            │ BROWSE 🌱 🐾 💼            │
            │ ╔════════╗ ╔════════╗     │
            │ ║🎤 Say  ║ ║📷 Snap ║     │
            │ ╚════════╝ ╚════════╝     │
            └───────────────────────────┘
```

**DESKTOP (≥1025) — NOT a bottom sheet (no thumb).** A **centred command-palette modal, 600 wide**,
opened by the top-bar (+) pill or **⌘/Ctrl-L**. Keyboard-first: Search is focused on open; **↑/↓**
move through suggestions, **Enter** selects, **Esc** closes. Mode buttons top-right. Same content,
re-prioritised for keyboard, not thumb.
```
        ┌──────────────────────────────────────────┐
        │ Log what you just did      🎤 Say  📷 Snap │
        │ 🔍 Type to search, or pick…    [focused]   │
        │ ── Suggested now ─────────────────────────│
        │  › Feed flock A            ⏎               │  ↑/↓ + Enter
        │    Eggs collected                          │
        │    Mortality                               │
        │ ── Do again ──────────────────────────────│
        │    ↻ Feed 25kg (yesterday)                 │
        │ ── Browse ── 🌱 Plant  🐾 Animal  💼 Whole │
        └──────────────────────────────────────────┘
```

──────────────────────────────────────────────────────────────────────────
## 10. INVARIANTS (must hold in every state, every breakpoint)
1. Routine log ≤ 3 taps, 0 blocking waits; do-again = 2; back-to-work = 1.
2. Opens to *answers* (suggestions + Say/Snap), never to a bare menu.
3. Optimistic + offline-queued + idempotent — a save can never be lost, blocked, or duplicated.
4. Load matched to stakes — evidence/preview only for spray/sale/harvest/incident.
5. Current-farm scoped; anchor auto-resolved; operator changeable (worker attribution).
6. Voice + large-text are first-class (the low-literacy Pacific smallholder can log).
```

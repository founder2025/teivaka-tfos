# TFOS Locations Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/locations` (LocationsPage.jsx, Resources › Locations tab) after the
approved audit (LOC1–LOC34).

## Headline decisions
1. **Map becomes the hero** (LOC29): full-width, taller, with a compact draw-hint + status
   legend — not a 460px third column. Zones/blocks read below it.
2. **A no-draw create on-ramp** (LOC16/LOC31): "Add block" opens a manual **name + type +
   area** form (`POST /production-units`, verified) — a farmer who can't/won't draw on
   satellite can still build their farm. "Draw on map" stays for those who want geometry.
3. **Land summary up top** (LOC33 partial): Total area · Zones · Blocks · **Unmapped** (blocks
   with no drawn geometry) — real land composition + draw-completeness. (Area-by-3-Layer needs
   a backend join → filed.)
4. **Lower cognitive load** (LOC12): summary → map → blocks → detail → enterprises, then a
   collapsible **"More tools"** (capacity calc, facilities, worker-attendance link, footer).
5. **Platform parity:** reads via `utils/api` (token refresh + humanized errors, LOC3);
   write failures now toast (LOC4); removed the printed UUID (LOC1 ×2) and the retired
   `ModeDropdown` (LOC5); emoji → lucide `Sparkles` (LOC6); redundant `<h1>` dropped (LOC9);
   page-level **Ask AI** (LOC10); animal location reads honest **"Not mapped yet"** not a fake
   "Livestock area" (LOC14); shared a11y `<Modal>` (Esc/focus) for the add-block form.

## Visual wireframe (Resources › Locations tab)
```
[no h1/UUID]                              [🌱 Farm ▾] [✨ Ask AI] [＋ Add block] [▦ Draw on map]
Where everything happens · zones, blocks, the farm map
[ Total area ][ Zones ][ Blocks ][ Unmapped (n) ]          ← land summary (LOC33)
⟦ zones&pus both error → "Couldn't load locations · Retry" ⟧
┌────────────────────────────── FARM MAP (hero, full-width ~520px) ──────────────────────────┐
│  draw · auto-area · GPS              legend: ▮Growing ▮Harvesting ▮Resting ▮Idle ▮Empty       │
│  <FarmMap/> (draw Zone/Block/Boundary on satellite, name it, Save)                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
Zones: [All][East fields ▸][Livestock ▸]        🔎 Search blocks
BLOCK LIST (grid)  ·  each: code · crop/zone · status pill (Empty/Growing/Harvesting/Resting/Idle)
── Block detail (on select) ── rename · What's-due (harvest+tasks) · Rotation & rest (cited) · Teach TIS
── Every enterprise & where it is ── crops→block (Find); animals → "Not mapped yet" (honest, LOC14)
── More tools ▾ (collapsed) ── Capacity calculator · Facilities · Worker attendance · Map/GPS footer
```

## Fixes shipped (frontend)
- **LOC1** drop farm UUID (subtitle + map header). **LOC3** reads via `utils/api`; **LOC4**
  rename/teach/rotation failures toast. **LOC5** remove ModeDropdown. **LOC6** Sparkles, not ✨.
- **LOC9** drop `<h1>`. **LOC10** page Ask AI. **LOC12** map-hero + collapsible "More tools".
- **LOC14** animals show "Not mapped yet" (no fake "Livestock area").
- **LOC16/LOC31** manual Add-block modal (name + enterprise/type + area → `POST /production-units`).
- **LOC33 (partial)** land summary (total area · zones · blocks · unmapped). `puArea` now also
  reads `area_sqm` so manually-added blocks show their area.
- Keeps verbatim: the satellite map, block What's-due, **cited Rotation & rest**, Teach TIS,
  capacity calc, a11y row buttons.

## Filed (backend / FarmMap — honest, NOT faked)
- **LOC23** colour the map by **block status** (Growing/Harvesting/…) — needs FarmMap to map
  ref_id→state and restyle; filed to avoid risking the working map this pass.
- **LOC24** `PUT /farm-map` is destructive replace-all → concurrency data-loss + **orphan PUs**
  when a block shape is deleted; move to feature-level edits + reconcile delete.
- **LOC30** geometry is JSON (no PostGIS/spatial index) → no server-side "which block contains
  this GPS point" (blocks worker geo-lock auto-attribution at the DB layer).
- **LOC33 (full)** area **by 3-Layer** (Cash-Flow/Food-Security/Long-term, Strike #101 50/30/20).
- **LOC27/28** soil/site data (pH, type, drainage, slope) + water-source mapping per block.
- **LOC20/34** land tenure / iTaukei lease boundary + expiry; verifiable farm GPS for Bank Evidence.
- **LOC25/26** multi-parcel (scattered plots) + block sub-division (beds). **LOC18** delete/
  edit-area/reassign (needs DELETE endpoints). **LOC19** offline/low-bandwidth map fallback.
```

# Universal Capture Engine — Gate 1: The Config Schema (the spine)

One engine. Per-vertical config. Verb-first. Inference-driven. Bounded ≤2–3 screens.
Sits ON TOP of the proven `POST /events` polymorphic pipeline → `audit.events`.
Adding a vertical or event = a config edit, not new UI.

## 0. Where things live (separation of concerns)
- **Backend registry (`schemas/events_registry.py`) = the truth for fields/validation/typed-event/target-table.** Untouched. `event_type → (PayloadSchema, target_table, version)`.
- **Capture config (NEW, `frontend/src/capture/config/<vertical>.js`) = the PRESENTATION truth:** the verb set, verb→typed-event resolution, which payload fields to ask at which depth, inference, icons, copy. This is the moat asset — declarative, per vertical.
- **The engine (NEW, one component) reads the config and renders.** No per-vertical UI code.

## 1. The schema (TypeScript-style for precision)

```ts
type VerticalConfig = {
  vertical: "CROPS" | "LIVESTOCK" | ...;     // matches catalog_group
  verbs: Verb[];                             // 6–8, daily-frequency ordered
};

type Verb = {
  id: string;                 // "harvest"
  label: string;              // STANDARD term — "Harvest & Post-Harvest"
  descriptor: string;         // plain helper line — "harvesting, grading, storage"
  icon: string;               // lucide-react name only
  resolve: Resolution;        // how this verb becomes one or more typed events
};

// A verb resolves via exactly ONE of: primary-only | primary+also | branch.
// This caps disclosure at ≤1 decision screen after the verb tap.
type Resolution = {
  primary?: EventSpec;        // the zero-extra-tap default (the verb's core meaning)
  also?: AlsoToggle[];        // optional ADDITIVE typed events (checkbox toggles)
  branch?: Branch;            // OR a single mutually-exclusive choice
};

type Branch = {
  prompt: string;             // "What happened?" — one screen of icon choices
  options: (EventSpec & { choiceLabel: string; choiceIcon: string })[];
};

type AlsoToggle = EventSpec & { toggleLabel: string; toggleIcon: string };

type EventSpec = {
  event_type: string;         // MUST be a key in the backend registry (the typed event)
  capture: Field[];           // payload fields to surface (subset/all of the payload)
  infer?: InferRule;          // context that auto-fills anchors / picks this spec
};

type Field = {
  name: string;               // EXACT backend payload field name (e.g. "qty_kg")
  ask: string;                // farmer-facing prompt, completes the sentence
  input: "number" | "money" | "choice" | "photo" | "voice" | "text" | "date";
  tier: "quick" | "detail";   // quick = shown by default; detail = behind "Add detail"
  prefill?: "inferred" | "last" | "today" | null;
  options?: {value:string; label:string; icon?:string}[];  // for input:"choice"
  required?: false;           // FORGIVING — engine never hard-blocks submit
};

type InferRule = {
  anchorsFromContext: boolean; // farm/cycle/zone/operator auto-injected, never asked…
  disambiguateWhen: string;    // …unless this is true (e.g. "multipleActiveCycles")
};
```

## 2. Engine runtime (the bounded flow)
1. **Screen 1 — verb grid:** render `config.verbs` (icons + standard label + descriptor). One tap.
2. **Auto-attach anchors:** from `CurrentFarmContext` + active-cycle query — farm, and if exactly one active cycle, the crop/cycle/zone. Operator = logged-in user. Never asked when unambiguous.
3. **Screen 2 — resolve (only if needed):** if `branch` → one icon-choice screen; if `primary`+`also` → the primary's quick fields with the `also` toggles inline; if `primary` only → straight to capture.
4. **Capture:** render `tier:"quick"` fields (number steppers / photo / voice / choice chips, big targets). A single **"Add detail"** expander reveals `tier:"detail"` fields. No required blocks.
5. **Submit:** for each selected `EventSpec`, POST `/events` with `{event_type, anchors (inferred), payload (captured + defaults)}` → backend registry validates → writes the **exact typed `audit.events` row**. A verb with `also` toggles fires multiple typed events (one audit row each) — uses the existing `compound_emits` concept.

**Depth dial = the `tier` field + the "Add detail" expander. Uniform for everyone. No `mode`.** (Optional later: a per-user "always expand detail" preference for field officers — never derived, never default.)

## 3. PROOF — one schema, two verticals

### 3a. CROPS config (excerpt — full verb set + 2 verbs expanded)
8 verbs (standard ops terms): Irrigation & Fertilizing · Crop Protection · Crop Monitoring · Crop Maintenance · **Harvest & Post-Harvest** · Sales & Delivery · Planting & Establishment · Inputs & Inventory.

```js
{ id:"harvest", label:"Harvest & Post-Harvest", descriptor:"harvesting, grading, storage",
  icon:"ShoppingBasket",
  resolve:{
    primary:{ event_type:"HARVEST_LOGGED",
      infer:{ anchorsFromContext:true, disambiguateWhen:"multipleActiveCycles" },
      capture:[
        { name:"qty_kg", ask:"How much did you pick?", input:"number", tier:"quick", prefill:null },
        { name:"photo",  ask:"Photo of the harvest",   input:"photo",  tier:"quick" },
        { name:"grade",  ask:"Quality",                input:"choice", tier:"detail",
          options:[{value:"A",label:"Best"},{value:"B",label:"Good"},{value:"REJECT",label:"Reject"}] },
      ] },
    also:[
      { toggleLabel:"Some spoiled", toggleIcon:"Trash2", event_type:"POST_HARVEST_LOSS",
        capture:[{name:"qty_kg",ask:"How much lost?",input:"number",tier:"quick"},
                 {name:"reason",ask:"Why?",input:"choice",tier:"detail",options:[/*spoilage…*/]}] },
      { toggleLabel:"Sorted by grade", toggleIcon:"Scale", event_type:"GRADING", capture:[/*…*/] },
      { toggleLabel:"Put in storage",  toggleIcon:"Warehouse", event_type:"STORAGE_LOGGED", capture:[/*…*/] },
      { toggleLabel:"Crop finished",   toggleIcon:"CircleCheck", event_type:"CYCLE_CLOSED", capture:[/*…*/] },
    ] } }

{ id:"protection", label:"Crop Protection", descriptor:"spraying, weed & pest control",
  icon:"ShieldCheck",
  resolve:{ branch:{ prompt:"What did you do?", options:[
    { choiceLabel:"Sprayed chemical", choiceIcon:"SprayCan", event_type:"CHEMICAL_APPLIED",
      capture:[{name:"chemical_id",ask:"Which chemical?",input:"choice",tier:"quick",prefill:"last"},
               {name:"application_rate",ask:"Rate",input:"number",tier:"detail"}] },   // sets WHD
    { choiceLabel:"Natural/bio control", choiceIcon:"Leaf", event_type:"BIOLOGICAL_CONTROL_APPLIED", capture:[/*…*/] },
    { choiceLabel:"Weeded", choiceIcon:"Scissors", event_type:"WEED_MANAGEMENT", capture:[/*…*/] },
  ] } } }
```

### 3b. LIVESTOCK config (excerpt — proves the SAME schema) 
Same `VerticalConfig`/`Verb`/`Resolution` types, different data. Standard livestock-ops verbs:
Feeding & Water · **Health & Treatment** · Production (eggs/milk) · Flock/Herd Management ·
Biosecurity & Housing · Sales & Delivery · Inputs & Supplies · Incidents.

```js
{ id:"production", label:"Production", descriptor:"eggs, milk, weight",
  icon:"Egg",
  resolve:{ branch:{ prompt:"What did you collect?", options:[
    { choiceLabel:"Eggs", choiceIcon:"Egg", event_type:"EGGS_COLLECTED",
      infer:{ anchorsFromContext:true, disambiguateWhen:"multipleFlocks" },
      capture:[{name:"qty_eggs",ask:"How many eggs?",input:"number",tier:"quick"},
               {name:"broken_eggs",ask:"Any broken?",input:"number",tier:"detail"},
               {name:"grade_breakdown",ask:"By size",input:"choice",tier:"detail"}] },
    { choiceLabel:"Milk", choiceIcon:"MilkOff", event_type:"MILK_COLLECTED", capture:[/*qty_litres…*/] },
    { choiceLabel:"Weighed", choiceIcon:"Scale", event_type:"WEIGHT_CHECK", capture:[/*avg_weight…*/] },
  ] } } }

{ id:"health", label:"Health & Treatment", descriptor:"vaccines, medicine, sickness, deaths",
  icon:"Stethoscope",
  resolve:{ branch:{ prompt:"What happened?", options:[
    { choiceLabel:"Vaccinated", choiceIcon:"Syringe", event_type:"VACCINATION_GIVEN", capture:[/*vaccine, dose…*/] }, // sets withholding
    { choiceLabel:"Gave medicine", choiceIcon:"Pill", event_type:"MEDICATION_GIVEN", capture:[/*…*/] },
    { choiceLabel:"Looks sick", choiceIcon:"Eye", event_type:"HEALTH_OBSERVATION", capture:[/*severity…*/] },
    { choiceLabel:"Some died", choiceIcon:"TriangleAlert", event_type:"MORTALITY_LOGGED",
      capture:[{name:"qty_dead",ask:"How many died?",input:"number",tier:"quick"},
               {name:"cause",ask:"Likely cause",input:"choice",tier:"quick",
                options:[{value:"DISEASE",label:"Disease"},{value:"PREDATION",label:"Predator"},{value:"UNKNOWN",label:"Not sure"}]}] },
    { choiceLabel:"Culled", choiceIcon:"Ban", event_type:"CULL_LOGGED", capture:[/*…*/] },
  ] } } }
```

**The proof:** identical schema (`VerticalConfig→Verb→Resolution→EventSpec→Field`), zero engine changes — Livestock is *just a different config file*. Every `event_type` is a real backend registry key → real typed `audit.events` row. Adding Aquaculture/Forestry later = write `aquaculture.js`, nothing else.

## 4. Zero-data-loss guarantee
Every verb path terminates in one or more `event_type`s that already exist in the backend registry. The engine submits the same `/events` envelope the typed form submits today (anchors + payload), enriched by inference/defaults, never reduced. WHD (CHEMICAL_APPLIED) and withholding (VACCINATION_GIVEN) enforcement fire exactly as now. Bank Evidence chain 100% intact. The 39 (Crops) / N (Livestock) types are an internal concern the farmer never sees.

## 5. Completeness
The Crops config's verbs collectively `resolve` to ALL 39 CROPS event types (Gate 2 coverage table — already mapped, 39/39, zero orphans, no padlocks). Same guarantee per vertical: a config is only "shipped" when its verbs cover every user-facing `event_type` in that `catalog_group`.

---
**Next (Gate 2–5):** the full Crops 39→verb coverage table (done in prior turn — fold in), the complete verb taxonomy with icons/strings, per-verb flow specs + tap counts (harvest ≤3), success metrics. Then the build paste-pack.

---

## Build status (2026-06-22) — engine LIVE, Crops config at 23 events

- **Engine** (`frontend/src/capture/CaptureEngine.jsx`): config-driven, full Resolution
  (primary | branch), number stepper, choice/text inputs, active-cycle inference,
  auto-injects `production_id`. Reachable at route `/farm/capture`.
- **Crops config** (`frontend/src/capture/config/crops.js`): 7 verbs / 23 wired
  `/events`-native events — Monitoring, Watered & Fed, Crop Maintenance, Crop
  Protection, Planting & Establishment, Storage & Stock, Sales & Disposal. All
  verified writing typed `field_events` + `audit.events` on prod (CROP_HEALTH,
  WEED_MANAGEMENT, PLANTING, CROP_SOLD confirmed).
- **Not yet covered (need BACKEND, not config):** `CHEMICAL_APPLIED` (chemical
  picker + WHD UX), `HARVEST_LOGGED` (legacy `/harvests` → migrate to `/events`, B75),
  `CYCLE_CREATED` (production_cycles create-path), the 12 padlocked events (no registry).
- **(+) cutover:** still gated — the live (+) (`LogSheet`) reaches ~27 crop events;
  the engine covers 23. Flip only after full coverage OR a hybrid (engine verbs +
  legacy fallback for uncovered events), else it regresses access.

**Next chunk:** backend gap work (CHEMICAL picker / Harvest→/events / locked-event
registry) → full coverage → non-regressive (+) cutover.

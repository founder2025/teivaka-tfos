/**
 * Universal Capture Engine — CROPS config.
 *
 * Schema (Gate 1): VerticalConfig -> Verb -> Resolution(primary|branch) ->
 * EventSpec -> Field(tier quick/detail). PRESENTATION layer only; the backend
 * events_registry.py stays the truth. Field `name`s are EXACT backend payload keys.
 * The engine auto-injects production_id from the active cycle (inference).
 *
 * COVERAGE: 7 verbs, 29 wired /events-native crop events — every one writes a real
 * typed field_events + audit.events row.
 * STILL SEQUENCED (need backend, NOT faked here): CHEMICAL_APPLIED (chemical picker
 * + WHD UX), HARVEST_LOGGED (legacy /harvests — B75), CYCLE_CREATED (production_cycles
 * create-path), CYCLE_CLOSED, nursery pack (GERMINATION_LOGGED/NURSERY_BATCH_CREATED/
 * NURSERY_READY), INPUT_PURCHASED/INPUT_RECEIVED (Money pillar). Each = a config edit once ready.
 */
const opts = (...vs) => vs.map((v) => (typeof v === "string" ? { value: v, label: v } : v));

export const cropsConfig = {
  vertical: "CROPS",
  verbs: [
    {
      id: "monitoring", label: "Crop Monitoring", descriptor: "health, pests, disease, notes", icon: "Eye",
      resolve: { branch: { prompt: "What did you see?", options: [
        { choiceLabel: "Looks healthy / ok", event_type: "CROP_HEALTH_OBSERVATION", capture: [
          { name: "status", ask: "How does it look?", input: "choice", tier: "quick", options: opts({value:"HEALTHY",label:"Healthy"},{value:"STRESSED",label:"Stressed"},{value:"POOR",label:"Poor"}) },
          { name: "issue", ask: "Anything you noticed", input: "text", tier: "detail" } ] },
        { choiceLabel: "Pests", event_type: "PEST_SCOUTING", capture: [
          { name: "pest_type", ask: "Which pest?", input: "choice", tier: "quick", options: opts("Whitefly","Aphid","Cutworm","Fruit fly","Caterpillar","Other") },
          { name: "density", ask: "How many?", input: "choice", tier: "quick", options: opts({value:"low",label:"A few"},{value:"med",label:"Some"},{value:"high",label:"A lot"}) },
          { name: "affected_area", ask: "Where / how much", input: "text", tier: "detail" } ] },
        { choiceLabel: "Confirmed a pest", event_type: "PEST_CONFIRMED", capture: [
          { name: "pest_type", ask: "Which pest?", input: "choice", tier: "quick", options: opts("Whitefly","Aphid","Cutworm","Fruit fly","Caterpillar","Other") },
          { name: "severity", ask: "How bad?", input: "choice", tier: "quick", options: opts({value:"low",label:"Mild"},{value:"med",label:"Moderate"},{value:"high",label:"Severe"}) },
          { name: "affected_area", ask: "Where / how much", input: "text", tier: "detail" } ] },
        { choiceLabel: "Disease", event_type: "DISEASE_SCOUTING", capture: [
          { name: "disease_type", ask: "Which disease?", input: "choice", tier: "quick", options: opts("Early blight","Late blight","Powdery mildew","Bacterial wilt","Mosaic virus","Other") },
          { name: "severity", ask: "How bad?", input: "choice", tier: "quick", options: opts({value:"low",label:"Mild"},{value:"med",label:"Moderate"},{value:"high",label:"Bad"}) },
          { name: "affected_plants", ask: "Plants affected", input: "number", tier: "detail" } ] },
        { choiceLabel: "Confirmed a disease", event_type: "DISEASE_CONFIRMED", capture: [
          { name: "disease_type", ask: "Which disease?", input: "choice", tier: "quick", options: opts("Early blight","Late blight","Powdery mildew","Bacterial wilt","Mosaic virus","Other") },
          { name: "severity", ask: "How bad?", input: "choice", tier: "quick", options: opts({value:"low",label:"Mild"},{value:"med",label:"Moderate"},{value:"high",label:"Severe"}) },
          { name: "affected_plants", ask: "Plants affected", input: "number", tier: "detail" } ] },
        { choiceLabel: "General note", event_type: "FIELD_OBSERVATION", capture: [
          { name: "observation_type", ask: "About what?", input: "choice", tier: "quick", options: opts({value:"GROWTH_NOTE",label:"Growth"},{value:"SOIL_CONDITION",label:"Soil"},{value:"EQUIPMENT_ISSUE",label:"Equipment"},{value:"GENERAL",label:"General"}) },
          { name: "notes", ask: "Note", input: "text", tier: "detail" } ] },
        { choiceLabel: "Lost seedlings", event_type: "NURSERY_LOSS", capture: [
          { name: "seedlings_lost", ask: "How many lost?", input: "number", tier: "quick" },
          { name: "cause", ask: "Cause", input: "choice", tier: "quick", options: opts({value:"DAMPING_OFF",label:"Rot / damping off"},{value:"PEST",label:"Pest"},{value:"WEATHER",label:"Weather"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Stopped this crop", event_type: "CYCLE_ABANDONED", capture: [
          { name: "reason", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"FAILURE",label:"Crop failed"},{value:"WEATHER",label:"Weather"},{value:"PEST",label:"Pest/disease"},{value:"DECISION",label:"My decision"},{value:"OTHER",label:"Other"}) } ] },
      ] } },
    },
    {
      id: "water_feed", label: "Watered & Fed", descriptor: "watering and fertilizing", icon: "Droplet",
      resolve: { branch: { prompt: "Which did you do?", options: [
        { choiceLabel: "Watered", event_type: "IRRIGATION", capture: [
          { name: "method", ask: "How?", input: "choice", tier: "quick", options: opts({value:"DRIP",label:"Drip"},{value:"OVERHEAD",label:"Overhead"},{value:"FLOOD",label:"Flood"},{value:"HAND",label:"By hand"}) },
          { name: "duration_minutes", ask: "How long (minutes)", input: "number", tier: "detail" },
          { name: "water_source", ask: "Water source", input: "text", tier: "detail" } ] },
        { choiceLabel: "Fertilized / fed", event_type: "FERTILIZER_APPLIED", capture: [
          { name: "product_name", ask: "What did you use?", input: "text", tier: "quick" },
          { name: "rate_kg_per_ha", ask: "Rate (kg/ha)", input: "number", tier: "detail" },
          { name: "application_method", ask: "How applied", input: "choice", tier: "detail", options: opts({value:"BROADCAST",label:"Broadcast"},{value:"BAND",label:"Band"},{value:"FOLIAR",label:"Foliar"},{value:"FERTIGATION",label:"Fertigation"}) } ] },
      ] } },
    },
    {
      id: "maintenance", label: "Crop Maintenance", descriptor: "pruning, mulching, thinning", icon: "Scissors",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Pruned / trained", event_type: "PRUNING_TRAINING", capture: [
          { name: "activity", ask: "Which?", input: "choice", tier: "quick", options: opts({value:"PRUNE",label:"Prune"},{value:"TRAIN",label:"Train"},{value:"STAKE",label:"Stake"},{value:"TIE",label:"Tie"}) },
          { name: "plants_count", ask: "How many plants", input: "number", tier: "detail" },
          { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" } ] },
        { choiceLabel: "Mulched", event_type: "MULCHING", capture: [
          { name: "material", ask: "Material", input: "choice", tier: "quick", options: opts({value:"STRAW",label:"Straw"},{value:"GRASS",label:"Grass"},{value:"PLASTIC",label:"Plastic"},{value:"LEAVES",label:"Leaves"}) },
          { name: "area_treated_ha", ask: "Area (ha)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Thinned", event_type: "THINNING", capture: [
          { name: "plants_removed", ask: "Plants removed", input: "number", tier: "quick" },
          { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" } ] },
      ] } },
    },
    {
      id: "protection", label: "Crop Protection", descriptor: "weed & natural pest control", icon: "ShieldCheck",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Weeded", event_type: "WEED_MANAGEMENT", capture: [
          { name: "method", ask: "How?", input: "choice", tier: "quick", options: opts({value:"MANUAL",label:"By hand"},{value:"MECHANICAL",label:"Machine"},{value:"MULCH",label:"Mulch"},{value:"COVER_CROP",label:"Cover crop"}) },
          { name: "area_treated_ha", ask: "Area (ha)", input: "number", tier: "detail" },
          { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" } ] },
        { choiceLabel: "Natural / bio control", event_type: "BIOLOGICAL_CONTROL_APPLIED", capture: [
          { name: "agent", ask: "What did you use?", input: "text", tier: "quick" },
          { name: "target_pest", ask: "Target pest", input: "text", tier: "detail" },
          { name: "area_ha", ask: "Area (ha)", input: "number", tier: "detail" } ] },
      ] } },
    },
    {
      id: "planting", label: "Planting & Establishment", descriptor: "planting, transplant, land prep", icon: "Sprout",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Planted", event_type: "PLANTING", capture: [
          { name: "plant_count", ask: "How many plants", input: "number", tier: "quick" },
          { name: "variety", ask: "Variety", input: "text", tier: "detail" },
          { name: "spacing_cm", ask: "Spacing (cm)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Transplanted", event_type: "TRANSPLANT_LOGGED", capture: [
          { name: "plants_transplanted", ask: "How many seedlings", input: "number", tier: "quick" },
          { name: "spacing_cm", ask: "Spacing (cm)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Prepared the land", event_type: "LAND_PREP", capture: [
          { name: "activity", ask: "What?", input: "choice", tier: "quick", options: opts({value:"PLOUGH",label:"Plough"},{value:"HARROW",label:"Harrow"},{value:"BED_FORM",label:"Make beds"},{value:"CLEAR",label:"Clear"},{value:"AMEND_SOIL",label:"Improve soil"}) },
          { name: "area_prepared_ha", ask: "Area (ha)", input: "number", tier: "detail" },
          { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" } ] },
        { choiceLabel: "Planted a cover crop", event_type: "COVER_CROP_PLANTED", capture: [
          { name: "cover_crop", ask: "Which cover crop", input: "text", tier: "quick" },
          { name: "area_ha", ask: "Area (ha)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Saved seed", event_type: "SEED_SAVED", capture: [
          { name: "crop", ask: "Crop / variety", input: "text", tier: "quick" },
          { name: "qty_kg", ask: "Quantity (kg)", input: "number", tier: "detail" } ] },
      ] } },
    },
    {
      id: "storage", label: "Storage & Stock", descriptor: "storing produce, stock checks", icon: "Warehouse",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Put into storage", event_type: "STORAGE_LOGGED", capture: [
          { name: "produce", ask: "What produce", input: "text", tier: "quick" },
          { name: "qty_kg", ask: "Quantity (kg)", input: "number", tier: "quick" },
          { name: "location", ask: "Where", input: "text", tier: "detail" } ] },
        { choiceLabel: "Checked storage", event_type: "STORAGE_CHECK", capture: [
          { name: "produce", ask: "What produce", input: "text", tier: "quick" },
          { name: "condition", ask: "Condition", input: "choice", tier: "quick", options: opts({value:"GOOD",label:"Good"},{value:"FAIR",label:"Fair"},{value:"SPOILING",label:"Spoiling"}) },
          { name: "qty_kg", ask: "Quantity (kg)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Counted stock", event_type: "INPUT_INVENTORY_CHECK", capture: [
          { name: "item", ask: "What did you count", input: "text", tier: "quick" },
          { name: "qty_on_hand", ask: "Amount on hand", input: "number", tier: "quick" } ] },
      ] } },
    },
    {
      id: "sales", label: "Sales & Disposal", descriptor: "sold, gave away, or lost produce", icon: "Coins",
      resolve: { branch: { prompt: "What happened?", options: [
        { choiceLabel: "Sold for money", event_type: "CROP_SOLD", capture: [
          { name: "qty_kg", ask: "How much (kg)", input: "number", tier: "quick" },
          { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" },
          { name: "buyer", ask: "Buyer", input: "text", tier: "detail" } ] },
        { choiceLabel: "Gave away / home use", event_type: "CROP_GIVEN", capture: [
          { name: "qty_kg", ask: "How much (kg)", input: "number", tier: "quick" },
          { name: "recipient", ask: "Given to", input: "text", tier: "detail" } ] },
        { choiceLabel: "Some spoiled / lost", event_type: "POST_HARVEST_LOSS", capture: [
          { name: "qty_kg", ask: "How much lost (kg)", input: "number", tier: "quick" },
          { name: "reason", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"SPOILAGE",label:"Spoiled"},{value:"PEST",label:"Pest/disease"},{value:"REJECTED",label:"Buyer rejected"},{value:"TRANSPORT",label:"Transport damage"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Sorted by grade", event_type: "GRADING", capture: [
          { name: "grade", ask: "Grade", input: "choice", tier: "quick", options: opts({value:"A",label:"A — Best"},{value:"B",label:"B — Good"},{value:"C",label:"C — Local"}) },
          { name: "qty_kg", ask: "Quantity (kg)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Sent to buyer", event_type: "DELIVERY_DISPATCHED", capture: [
          { name: "buyer", ask: "Buyer", input: "text", tier: "quick" },
          { name: "qty_kg", ask: "Quantity (kg)", input: "number", tier: "quick" },
          { name: "transport", ask: "How sent", input: "choice", tier: "detail", options: opts({value:"OWN",label:"Own vehicle"},{value:"CARRIER",label:"Carrier"},{value:"FERRY",label:"Ferry"}) } ] },
        { choiceLabel: "Buyer received it", event_type: "DELIVERY_CONFIRMED", capture: [
          { name: "qty_accepted", ask: "Accepted (kg)", input: "number", tier: "quick" },
          { name: "qty_rejected", ask: "Rejected (kg)", input: "number", tier: "detail" } ] },
      ] } },
    },
  ],
};

export default cropsConfig;

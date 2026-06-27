/**
 * Universal Capture Engine — POULTRY config (Animal vertical, Slice 3a).
 *
 * Same schema as crops, but the CONTEXT is a FLOCK (not a crop cycle): events anchor
 * on flock_id and write to tenant.poultry_event_log via POST /events. Field `name`s are
 * EXACT backend payload keys (verified against events_registry.py poultry payloads).
 *
 * COVERAGE: 25 poultry events across 8 verbs + 1 lifecycle link (FLOCK_PLACED). The 7
 * added 2026-06-24 (consolidation Step 1 — FEED_PURCHASED, CULL_LOGGED,
 * MORTALITY_INVESTIGATED, VISITOR_LOGGED, PEST_CONTROL_APPLIED, EQUIPMENT_MAINTAINED,
 * SUPPLIES_RECEIVED) close the (+) coverage gap vs the dedicated poultry/*New pages.
 * VISITOR_LOGGED.arrival_time is autofilled from the occurred date (quick capture;
 * the dedicated page keeps full arrival/departure precision until Step 3). Every one writes a
 * real poultry_event_log + audit.events row. autofillDate maps the chosen date into
 * required *_date payload keys; `input:"library"` fields resolve a farm_libraries UUID
 * (feed/vaccine); spec.validate runs a client check before submit (EGGS_GRADED sum==total).
 * FLOCK_PLACED stays a link verb (dedicated /flocks create-route with breed picker).
 * DEFERRED: optional FK pickers (buyer/supplier/disinfectant) — all optional, omitted for now.
 */
const opts = (...vs) => vs.map((v) => (typeof v === "string" ? { value: v, label: v } : v));

export const poultryConfig = {
  vertical: "POULTRY",
  context: {
    loader: "/api/v1/flocks",
    extract: (body) => { let l = body?.data ?? body; if (l && !Array.isArray(l)) l = l.items || l.flocks || []; return l || []; },
    idKey: "flock_id",
    optionLabel: (f) => `${f.flock_label || f.flock_id}${f.current_count != null ? ` · ${f.current_count} birds` : ""}`,
    shortLabel: (f) => f.flock_label || f.flock_id,
    contextLabel: "Flock",
    contextLabelPlural: "flocks",
    loadingMsg: "Loading your flocks…",
    emptyMsg: "No active flock yet — place a flock first.",
    pickPrompt: "Select flock…",
    buildAnchors: (f) => ({ farm_id: f.farm_id, flock_id: f.flock_id, ...(f.current_pu_id ? { pu_id: f.current_pu_id } : {}) }),
    injectPayload: () => ({}),
    // FAB13: pre-check whether a flock can be sold (mirrors the server gate so the
    // farmer is warned BEFORE filling a sale form). Read-only; the hard gate still runs on submit.
    saleEligibilityUrl: (f) => `/api/v1/flocks/${encodeURIComponent(f.flock_id)}/sale-eligibility`,
  },
  verbs: [
    {
      id: "eggs", label: "Eggs", descriptor: "collected or sold", icon: "Egg",
      resolve: { branch: { prompt: "What about the eggs?", options: [
        { choiceLabel: "Collected eggs", event_type: "EGGS_COLLECTED", capture: [
          { name: "qty_eggs", ask: "How many eggs?", input: "number", tier: "quick" },
          { name: "broken_eggs", ask: "Broken", input: "number", tier: "detail" } ] },
        { choiceLabel: "Sold / gave eggs", event_type: "EGGS_SOLD", precheck: "sale", autofillDate: ["sale_date"], capture: [
          { name: "qty_eggs", ask: "How many eggs?", input: "number", tier: "quick" },
          { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" },
          { name: "disposition", ask: "Sold or given?", input: "choice", tier: "detail", options: opts({value:"SOLD",label:"Sold"},{value:"GIVEN",label:"Given"}) },
          { name: "buyer_id", ask: "Buyer", input: "library", libraryType: "POULTRY_BUYER", tier: "detail" } ] },
        { choiceLabel: "Graded eggs", event_type: "EGGS_GRADED",
          validate: (v) => { const t=+v.total_qty||0, s=(+v.grade_a_qty||0)+(+v.grade_b_qty||0)+(+v.cracked_qty||0)+(+v.dirty_qty||0); return t && s!==t ? `Grades must add up to the total (${s} ≠ ${t}).` : ""; },
          capture: [
          { name: "total_qty", ask: "Total eggs graded", input: "number", tier: "quick" },
          { name: "grade_a_qty", ask: "Grade A", input: "number", tier: "quick" },
          { name: "grade_b_qty", ask: "Grade B", input: "number", tier: "quick" },
          { name: "cracked_qty", ask: "Cracked", input: "number", tier: "quick" },
          { name: "dirty_qty", ask: "Dirty", input: "number", tier: "quick" } ] },
      ] } },
    },
    {
      id: "feed", label: "Feed", descriptor: "feed received or used", icon: "Wheat",
      resolve: { branch: { prompt: "Feed in or used?", options: [
        { choiceLabel: "Feed received", event_type: "FEED_RECEIVED", autofillDate: ["delivery_date"], capture: [
          { name: "feed_type_id", ask: "Which feed?", input: "library", libraryType: "POULTRY_FEED", tier: "quick" },
          { name: "qty_kg", ask: "How much (kg)?", input: "number", tier: "quick" },
          { name: "cost_fjd", ask: "Cost (FJD)", input: "number", tier: "detail" },
          { name: "supplier_id", ask: "Supplier", input: "library", libraryType: "POULTRY_SUPPLIER", tier: "detail" } ] },
        { choiceLabel: "Feed used", event_type: "FEED_USED", autofillDate: ["used_date"], capture: [
          { name: "feed_type_id", ask: "Which feed?", input: "library", libraryType: "POULTRY_FEED", tier: "quick" },
          { name: "qty_kg", ask: "How much (kg)?", input: "number", tier: "quick" } ] },
        { choiceLabel: "Bought feed", event_type: "FEED_PURCHASED", capture: [
          { name: "feed_id", ask: "Which feed?", input: "library", libraryType: "POULTRY_FEED", tier: "quick" },
          { name: "qty_kg", ask: "How much (kg)?", input: "number", tier: "quick" },
          { name: "cost_fjd", ask: "Total cost (FJD)", input: "number", tier: "quick" },
          { name: "payment_method", ask: "Paid by", input: "choice", tier: "quick", options: opts({value:"CASH",label:"Cash"},{value:"MPAISA",label:"M-PAiSA"},{value:"CHEQUE",label:"Cheque"},{value:"CREDIT",label:"Credit"},{value:"OTHER",label:"Other"}) },
          { name: "supplier_id", ask: "Supplier", input: "library", libraryType: "POULTRY_SUPPLIER", tier: "detail" },
          { name: "invoice_ref", ask: "Invoice / receipt #", input: "text", tier: "detail" } ] },
      ] } },
    },
    {
      id: "birds", label: "Birds in / out", descriptor: "added or sold birds", icon: "Bird",
      resolve: { branch: { prompt: "What happened with the birds?", options: [
        { choiceLabel: "Added birds", event_type: "BIRD_REPLACEMENT", capture: [
          { name: "qty_added", ask: "How many added?", input: "number", tier: "quick" },
          { name: "reason", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"REPLACEMENT",label:"Replacement"},{value:"EXPANSION",label:"Expansion"},{value:"RECOVERY",label:"Recovery"}) },
          { name: "supplier_id", ask: "Supplier", input: "library", libraryType: "POULTRY_SUPPLIER", tier: "detail" },
          { name: "cost_fjd", ask: "Cost (FJD)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Sold birds", event_type: "BIRDS_SOLD", precheck: "sale", autofillDate: ["sale_date"], capture: [
          { name: "qty_sold", ask: "How many sold?", input: "number", tier: "quick" },
          { name: "sale_type", ask: "Sold as?", input: "choice", tier: "quick", options: opts({value:"LIVE_BIRD",label:"Live bird"},{value:"DRESSED",label:"Dressed"},{value:"EGGS_LAYER_END",label:"Spent layer"}) },
          { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" },
          { name: "buyer_id", ask: "Buyer", input: "library", libraryType: "POULTRY_BUYER", tier: "detail" } ] },
      ] } },
    },
    {
      id: "health", label: "Health", descriptor: "deaths, sickness, medication", icon: "Stethoscope",
      resolve: { branch: { prompt: "What did you see?", options: [
        { choiceLabel: "Deaths", event_type: "MORTALITY_LOGGED", capture: [
          { name: "qty_dead", ask: "How many died?", input: "number", tier: "quick" },
          { name: "cause", ask: "Likely cause", input: "choice", tier: "quick", options: opts({value:"DISEASE",label:"Disease"},{value:"PREDATION",label:"Predator"},{value:"INJURY",label:"Injury"},{value:"OLD_AGE",label:"Old age"},{value:"UNKNOWN",label:"Unknown"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Sickness / symptoms", event_type: "HEALTH_OBSERVATION", capture: [
          { name: "severity", ask: "How bad?", input: "choice", tier: "quick", options: opts({value:"MILD",label:"Mild"},{value:"MODERATE",label:"Moderate"},{value:"SEVERE",label:"Severe"},{value:"CLEARED",label:"Cleared / recovered"}) },
          { name: "qty_affected", ask: "Birds affected", input: "number", tier: "quick" },
          { name: "symptoms", ask: "Symptoms", input: "multichoice", tier: "quick", options: opts({value:"COUGHING",label:"Coughing"},{value:"SNEEZING",label:"Sneezing"},{value:"DIARRHEA",label:"Diarrhea"},{value:"LETHARGY",label:"Lethargy"},{value:"REDUCED_APPETITE",label:"Off feed"},{value:"REDUCED_PRODUCTION",label:"Fewer eggs"},{value:"SWELLING",label:"Swelling"},{value:"NASAL_DISCHARGE",label:"Runny nose"},{value:"EYE_DISCHARGE",label:"Runny eyes"},{value:"FEATHER_LOSS",label:"Feather loss"},{value:"LIMPING",label:"Limping"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Vaccinated", event_type: "VACCINATION_GIVEN", batch: true, capture: [
          { name: "vaccine_id", ask: "Which vaccine?", input: "library", libraryType: "POULTRY_VACCINE", tier: "quick" },
          { name: "route", ask: "How given?", input: "choice", tier: "quick", options: opts({value:"DRINKING_WATER",label:"In water"},{value:"INJECTION",label:"Injection"},{value:"EYE_DROP",label:"Eye drop"},{value:"SPRAY",label:"Spray"},{value:"OTHER",label:"Other"}) },
          { name: "qty_doses", ask: "Doses", input: "number", tier: "detail" } ] },
        { choiceLabel: "Gave medication", event_type: "MEDICATION_GIVEN", autofillDate: ["given_date"], capture: [
          { name: "medication_name", ask: "Medicine name", input: "text", tier: "quick" },
          { name: "route", ask: "How given?", input: "choice", tier: "detail", options: opts({value:"DRINKING_WATER",label:"In water"},{value:"INJECTION",label:"Injection"},{value:"ORAL",label:"Oral"},{value:"SPRAY",label:"Spray"},{value:"FEED",label:"In feed"},{value:"OTHER",label:"Other"}) },
          { name: "dose", ask: "Dose", input: "text", tier: "detail" } ] },
        { choiceLabel: "Culled birds", event_type: "CULL_LOGGED", capture: [
          { name: "qty_culled", ask: "How many culled?", input: "number", tier: "quick" },
          { name: "reason", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"DISEASE",label:"Disease"},{value:"INJURY",label:"Injury"},{value:"POOR_PRODUCTION",label:"Poor production"},{value:"END_OF_CYCLE",label:"End of cycle"},{value:"OVERCROWDING",label:"Overcrowding"},{value:"OTHER",label:"Other"}) },
          { name: "disposal_method", ask: "Disposed how?", input: "choice", tier: "quick", options: opts({value:"BURIED",label:"Buried"},{value:"BURNED",label:"Burned"},{value:"COMPOSTED",label:"Composted"},{value:"RENDERING",label:"Rendering"},{value:"OTHER",label:"Other"}) },
          { name: "cleared_by", ask: "Cleared by", input: "choice", tier: "quick", options: opts({value:"OWNER",label:"Me"},{value:"VET",label:"Vet"},{value:"EXTENSION_OFFICER",label:"Extension officer"},{value:"WORKER",label:"Worker"}) } ] },
        { choiceLabel: "Investigated a death", event_type: "MORTALITY_INVESTIGATED", capture: [
          { name: "suspected_cause", ask: "Suspected cause", input: "choice", tier: "quick", options: opts({value:"DISEASE",label:"Disease"},{value:"PREDATOR",label:"Predator"},{value:"HEAT_STRESS",label:"Heat stress"},{value:"FEED_RELATED",label:"Feed-related"},{value:"INJURY",label:"Injury"},{value:"UNKNOWN",label:"Unknown"},{value:"OTHER",label:"Other"}) },
          { name: "investigation_method", ask: "How investigated?", input: "choice", tier: "quick", options: opts({value:"VISUAL_INSPECTION",label:"Visual inspection"},{value:"NECROPSY",label:"Necropsy"},{value:"VET_CONSULTATION",label:"Vet consult"},{value:"LAB_TEST",label:"Lab test"},{value:"EXTERNAL_EXAMINATION_ONLY",label:"External exam only"}) },
          { name: "findings", ask: "What did you find?", input: "text", tier: "quick" },
          { name: "action_taken", ask: "Action taken", input: "text", tier: "detail" } ] },
      ] } },
    },
    {
      id: "monitor", label: "Weigh & monitor", descriptor: "weight, temperature, water", icon: "Scale",
      resolve: { branch: { prompt: "What did you measure?", options: [
        { choiceLabel: "Weighed birds", event_type: "WEIGHT_CHECK", capture: [
          { name: "avg_weight_g", ask: "Average weight (g)", input: "number", tier: "quick" },
          { name: "sample_size", ask: "Birds weighed", input: "number", tier: "quick" } ] },
        { choiceLabel: "Temperature", event_type: "TEMPERATURE_RECORDED", batch: true, capture: [
          { name: "temperature_celsius", ask: "Temperature (°C)", input: "number", tier: "quick" },
          { name: "time_of_day", ask: "When?", input: "choice", tier: "quick", options: opts({value:"MORNING",label:"Morning"},{value:"MIDDAY",label:"Midday"},{value:"AFTERNOON",label:"Afternoon"},{value:"EVENING",label:"Evening"},{value:"NIGHT",label:"Night"}) } ] },
        { choiceLabel: "Water used", event_type: "WATER_CONSUMED", capture: [
          { name: "qty_litres", ask: "Litres", input: "number", tier: "quick" },
          { name: "source", ask: "Source", input: "choice", tier: "quick", options: opts({value:"TANK",label:"Tank"},{value:"TAP",label:"Tap"},{value:"WELL",label:"Well"},{value:"RAIN",label:"Rain"},{value:"OTHER",label:"Other"}) },
          { name: "period", ask: "Over", input: "choice", tier: "quick", options: opts({value:"DAILY",label:"A day"},{value:"WEEKLY",label:"A week"},{value:"MONTHLY",label:"A month"}) } ] },
      ] } },
    },
    {
      id: "coop", label: "Coop & litter", descriptor: "litter, cleaning, moving birds", icon: "Home",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Changed litter", event_type: "LITTER_CHANGED", batch: true, capture: [
          { name: "litter_type", ask: "Litter type", input: "choice", tier: "quick", options: opts({value:"WOOD_SHAVINGS",label:"Wood shavings"},{value:"RICE_HUSK",label:"Rice husk"},{value:"SAWDUST",label:"Sawdust"},{value:"STRAW",label:"Straw"},{value:"OTHER",label:"Other"}) },
          { name: "qty_kg", ask: "Amount (kg)", input: "number", tier: "quick" },
          { name: "removed_litter_disposal", ask: "Old litter went to", input: "choice", tier: "quick", options: opts({value:"COMPOSTED",label:"Compost"},{value:"BURNED",label:"Burned"},{value:"BURIED",label:"Buried"},{value:"SPREAD_ON_FIELD",label:"On field"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Cleaned coop", event_type: "COOP_CLEANED", batch: true, capture: [
          { name: "cleaning_method", ask: "How?", input: "choice", tier: "quick", options: opts({value:"WATER_RINSE",label:"Water rinse"},{value:"DISINFECTANT_SPRAY",label:"Disinfectant"},{value:"FULL_DEEP_CLEAN",label:"Deep clean"},{value:"DRY_SWEEP",label:"Dry sweep"}) },
          { name: "cleaner_role", ask: "Who cleaned?", input: "choice", tier: "quick", options: opts({value:"OWNER",label:"Me"},{value:"WORKER",label:"Worker"},{value:"FAMILY",label:"Family"},{value:"EXTERNAL",label:"Hired"}) } ] },
        { choiceLabel: "Moved birds", event_type: "FLOCK_MOVED", capture: [
          { name: "from_location", ask: "From", input: "text", tier: "quick" },
          { name: "to_location", ask: "To", input: "text", tier: "quick" },
          { name: "qty_moved", ask: "How many", input: "number", tier: "quick" },
          { name: "reason", ask: "Why?", input: "choice", tier: "detail", options: opts({value:"SPACE",label:"More space"},{value:"SEPARATION",label:"Separation"},{value:"AGE_BAND",label:"Age band"},{value:"QUARANTINE",label:"Quarantine"},{value:"MAINTENANCE",label:"Maintenance"},{value:"OTHER",label:"Other"}) },
          { name: "move_method", ask: "How moved", input: "choice", tier: "detail", options: opts({value:"CARRIED",label:"Carried"},{value:"HERDED",label:"Herded"},{value:"CRATED",label:"Crated"}) } ] },
      ] } },
    },
    {
      id: "incident", label: "Incident", descriptor: "predator, theft, damage", icon: "AlertTriangle",
      resolve: { branch: { prompt: "What happened?", options: [
        { choiceLabel: "Report an incident", event_type: "INCIDENT_REPORTED", capture: [
          { name: "incident_type", ask: "What kind?", input: "choice", tier: "quick", options: opts({value:"PREDATOR_ATTACK",label:"Predator"},{value:"THEFT",label:"Theft"},{value:"ESCAPE",label:"Escape"},{value:"INJURY",label:"Injury"},{value:"STRUCTURAL_DAMAGE",label:"Damage"},{value:"EQUIPMENT_FAILURE",label:"Equipment"},{value:"UTILITY_OUTAGE",label:"Power/water"},{value:"OTHER",label:"Other"}) },
          { name: "severity", ask: "How serious?", input: "choice", tier: "quick", options: opts({value:"LOW",label:"Low"},{value:"MEDIUM",label:"Medium"},{value:"HIGH",label:"High"},{value:"CRITICAL",label:"Critical"}) },
          { name: "birds_affected_qty", ask: "Birds affected", input: "number", tier: "detail" },
          { name: "estimated_loss_fjd", ask: "Estimated loss (FJD)", input: "number", tier: "detail" } ] },
      ] } },
    },
    // Lifecycle: placing a new flock uses the dedicated create-route (breed picker + audit).
    {
      id: "biosecurity", label: "Biosecurity & upkeep", descriptor: "visitors, pests, equipment, supplies", icon: "ShieldCheck",
      resolve: { branch: { prompt: "What do you want to log?", options: [
        { choiceLabel: "Visitor came", event_type: "VISITOR_LOGGED", autofillDate: ["arrival_time"], capture: [
          { name: "visitor_type", ask: "Who visited?", input: "choice", tier: "quick", options: opts({value:"BUYER",label:"Buyer"},{value:"SUPPLIER",label:"Supplier"},{value:"VET",label:"Vet"},{value:"EXTENSION_OFFICER",label:"Extension officer"},{value:"INSPECTOR",label:"Inspector"},{value:"OTHER_FARMER",label:"Other farmer"},{value:"FAMILY",label:"Family"},{value:"OTHER",label:"Other"}) },
          { name: "purpose", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"DELIVERY",label:"Delivery"},{value:"PURCHASE",label:"Purchase"},{value:"VETERINARY",label:"Veterinary"},{value:"INSPECTION",label:"Inspection"},{value:"CONSULTATION",label:"Consultation"},{value:"SOCIAL",label:"Social"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Pest control", event_type: "PEST_CONTROL_APPLIED", batch: true, capture: [
          { name: "pest_target", ask: "Target pest", input: "choice", tier: "quick", options: opts({value:"RODENTS",label:"Rodents"},{value:"FLIES",label:"Flies"},{value:"MITES",label:"Mites"},{value:"LICE",label:"Lice"},{value:"COCKROACHES",label:"Cockroaches"},{value:"OTHER",label:"Other"}) },
          { name: "applicator_role", ask: "Who applied it?", input: "choice", tier: "quick", options: opts({value:"OWNER",label:"Me"},{value:"WORKER",label:"Worker"},{value:"EXTERNAL_PEST_CONTROL",label:"Hired pest control"}) },
          { name: "non_chemical_method", ask: "Non-chemical method", input: "choice", tier: "detail", options: opts({value:"TRAPS",label:"Traps"},{value:"PHYSICAL_REMOVAL",label:"Physical removal"},{value:"PREDATOR_BIRDS",label:"Predator birds"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Fixed equipment", event_type: "EQUIPMENT_MAINTAINED", capture: [
          { name: "equipment_type", ask: "Which equipment?", input: "choice", tier: "quick", options: opts({value:"FEEDER",label:"Feeder"},{value:"WATERER",label:"Waterer"},{value:"HEATING",label:"Heating"},{value:"VENTILATION",label:"Ventilation"},{value:"LIGHTING",label:"Lighting"},{value:"NEST_BOX",label:"Nest box"},{value:"FENCING",label:"Fencing"},{value:"OTHER",label:"Other"}) },
          { name: "maintenance_type", ask: "What did you do?", input: "choice", tier: "quick", options: opts({value:"REPAIR",label:"Repair"},{value:"CLEANING",label:"Cleaning"},{value:"REPLACEMENT",label:"Replacement"},{value:"INSPECTION",label:"Inspection"},{value:"CALIBRATION",label:"Calibration"}) },
          { name: "performed_by", ask: "Who did it?", input: "choice", tier: "quick", options: opts({value:"OWNER",label:"Me"},{value:"WORKER",label:"Worker"},{value:"EXTERNAL_SERVICE",label:"Hired service"}) },
          { name: "cost_fjd", ask: "Cost (FJD)", input: "number", tier: "detail" } ] },
        { choiceLabel: "Supplies received", event_type: "SUPPLIES_RECEIVED", capture: [
          { name: "supply_type", ask: "What supplies?", input: "choice", tier: "quick", options: opts({value:"BEDDING",label:"Bedding"},{value:"EQUIPMENT",label:"Equipment"},{value:"MEDICAL",label:"Medical"},{value:"CLEANING",label:"Cleaning"},{value:"FEED_ADDITIVES",label:"Feed additives"},{value:"PACKAGING",label:"Packaging"},{value:"OTHER",label:"Other"}) },
          { name: "qty_received", ask: "How much?", input: "number", tier: "quick" },
          { name: "unit", ask: "Unit", input: "choice", tier: "quick", options: opts({value:"KG",label:"kg"},{value:"L",label:"litres"},{value:"UNITS",label:"units"},{value:"BAGS",label:"bags"},{value:"BOXES",label:"boxes"}) },
          { name: "cost_fjd", ask: "Cost (FJD)", input: "number", tier: "detail" },
          { name: "supplier_name", ask: "Supplier", input: "text", tier: "detail" } ] },
      ] } },
    },
    { id: "flock_new", label: "Place a new flock", descriptor: "start a new batch of birds", icon: "PlusCircle", route: "/farm/poultry/flocks/new" },
  ],
};

export default poultryConfig;

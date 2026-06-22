/**
 * Universal Capture Engine — POULTRY config (Animal vertical, Slice 3a).
 *
 * Same schema as crops, but the CONTEXT is a FLOCK (not a crop cycle): events anchor
 * on flock_id and write to tenant.poultry_event_log via POST /events. Field `name`s are
 * EXACT backend payload keys (verified against events_registry.py poultry payloads).
 *
 * COVERAGE (3a): 14 FK-free poultry events across 6 verbs + 1 lifecycle link. Every one
 * writes a real poultry_event_log + audit.events row. autofillDate maps the chosen date
 * into required *_date payload keys so the farmer enters it once.
 * DEFERRED to 3b (need a farm_libraries picker UUID, like the chemical picker):
 *   FEED_RECEIVED / FEED_USED (feed_type_id), VACCINATION_GIVEN (vaccine_id), EGGS_GRADED
 *   (sum==total validator). FLOCK_PLACED stays a link verb (dedicated /flocks create-route).
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
    loadingMsg: "Loading your flocks…",
    emptyMsg: "No active flock yet — place a flock first.",
    pickPrompt: "Select flock…",
    buildAnchors: (f) => ({ farm_id: f.farm_id, flock_id: f.flock_id, ...(f.current_pu_id ? { pu_id: f.current_pu_id } : {}) }),
    injectPayload: () => ({}),
  },
  verbs: [
    {
      id: "eggs", label: "Eggs", descriptor: "collected or sold", icon: "Egg",
      resolve: { branch: { prompt: "What about the eggs?", options: [
        { choiceLabel: "Collected eggs", event_type: "EGGS_COLLECTED", capture: [
          { name: "qty_eggs", ask: "How many eggs?", input: "number", tier: "quick" },
          { name: "broken_eggs", ask: "Broken", input: "number", tier: "detail" } ] },
        { choiceLabel: "Sold / gave eggs", event_type: "EGGS_SOLD", autofillDate: ["sale_date"], capture: [
          { name: "qty_eggs", ask: "How many eggs?", input: "number", tier: "quick" },
          { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" },
          { name: "disposition", ask: "Sold or given?", input: "choice", tier: "detail", options: opts({value:"SOLD",label:"Sold"},{value:"GIVEN",label:"Given"}) } ] },
      ] } },
    },
    {
      id: "birds", label: "Birds in / out", descriptor: "added or sold birds", icon: "Bird",
      resolve: { branch: { prompt: "What happened with the birds?", options: [
        { choiceLabel: "Added birds", event_type: "BIRD_REPLACEMENT", capture: [
          { name: "qty_added", ask: "How many added?", input: "number", tier: "quick" },
          { name: "reason", ask: "Why?", input: "choice", tier: "quick", options: opts({value:"REPLACEMENT",label:"Replacement"},{value:"EXPANSION",label:"Expansion"},{value:"RECOVERY",label:"Recovery"}) } ] },
        { choiceLabel: "Sold birds", event_type: "BIRDS_SOLD", autofillDate: ["sale_date"], capture: [
          { name: "qty_sold", ask: "How many sold?", input: "number", tier: "quick" },
          { name: "sale_type", ask: "Sold as?", input: "choice", tier: "quick", options: opts({value:"LIVE_BIRD",label:"Live bird"},{value:"DRESSED",label:"Dressed"},{value:"EGGS_LAYER_END",label:"Spent layer"}) },
          { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" } ] },
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
        { choiceLabel: "Gave medication", event_type: "MEDICATION_GIVEN", autofillDate: ["given_date"], capture: [
          { name: "medication_name", ask: "Medicine name", input: "text", tier: "quick" },
          { name: "route", ask: "How given?", input: "choice", tier: "detail", options: opts({value:"DRINKING_WATER",label:"In water"},{value:"INJECTION",label:"Injection"},{value:"ORAL",label:"Oral"},{value:"SPRAY",label:"Spray"},{value:"FEED",label:"In feed"},{value:"OTHER",label:"Other"}) },
          { name: "dose", ask: "Dose", input: "text", tier: "detail" } ] },
      ] } },
    },
    {
      id: "monitor", label: "Weigh & monitor", descriptor: "weight, temperature, water", icon: "Scale",
      resolve: { branch: { prompt: "What did you measure?", options: [
        { choiceLabel: "Weighed birds", event_type: "WEIGHT_CHECK", capture: [
          { name: "avg_weight_g", ask: "Average weight (g)", input: "number", tier: "quick" },
          { name: "sample_size", ask: "Birds weighed", input: "number", tier: "quick" } ] },
        { choiceLabel: "Temperature", event_type: "TEMPERATURE_RECORDED", capture: [
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
        { choiceLabel: "Changed litter", event_type: "LITTER_CHANGED", capture: [
          { name: "litter_type", ask: "Litter type", input: "choice", tier: "quick", options: opts({value:"WOOD_SHAVINGS",label:"Wood shavings"},{value:"RICE_HUSK",label:"Rice husk"},{value:"SAWDUST",label:"Sawdust"},{value:"STRAW",label:"Straw"},{value:"OTHER",label:"Other"}) },
          { name: "qty_kg", ask: "Amount (kg)", input: "number", tier: "quick" },
          { name: "removed_litter_disposal", ask: "Old litter went to", input: "choice", tier: "quick", options: opts({value:"COMPOSTED",label:"Compost"},{value:"BURNED",label:"Burned"},{value:"BURIED",label:"Buried"},{value:"SPREAD_ON_FIELD",label:"On field"},{value:"OTHER",label:"Other"}) } ] },
        { choiceLabel: "Cleaned coop", event_type: "COOP_CLEANED", capture: [
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
    { id: "flock_new", label: "Place a new flock", descriptor: "start a new batch of birds", icon: "PlusCircle", route: "/farm/poultry/flocks/new" },
  ],
};

export default poultryConfig;

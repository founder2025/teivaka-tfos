/**
 * Universal Capture Engine — LIVESTOCK config (Animal vertical, Slice 3b-ii).
 *
 * Cattle / goats / sheep / pigs / horses. Unlike poultry (flock-anchored), livestock has
 * no per-animal entity yet — events anchor at FARM level and carry species + animal_ref in
 * the payload (writes to tenant.livestock_events via POST /events). Field `name`s are EXACT
 * backend payload keys (verified against the _LivestockBase + livestock payloads).
 *
 * COVERAGE: 8 livestock events across 6 verbs. Every one writes a real livestock_events +
 * audit.events row. `species` (required Literal) leads each event; autofillDate fills the
 * required *_date key from the chosen date. animal_ref (tag/group) is an optional detail.
 */
const opts = (...vs) => vs.map((v) => (typeof v === "string" ? { value: v, label: v } : v));
const SPECIES = opts(
  { value: "CATTLE", label: "Cattle" }, { value: "GOAT", label: "Goat" }, { value: "SHEEP", label: "Sheep" },
  { value: "PIG", label: "Pig" }, { value: "HORSE", label: "Horse" }, { value: "OTHER", label: "Other" },
);
const SPECIES_FIELD = { name: "species", ask: "Which animal?", input: "choice", tier: "quick", options: SPECIES };
const REF_FIELD = { name: "animal_ref", ask: "Tag / name / group", input: "text", tier: "detail" };

export const livestockConfig = {
  vertical: "LIVESTOCK",
  context: {
    loader: "/api/v1/farms",
    extract: (body) => { let l = body?.data?.farms ?? body?.data ?? body?.farms ?? body; if (l && !Array.isArray(l)) l = l.farms || l.items || []; return l || []; },
    idKey: "farm_id",
    optionLabel: (f) => f.farm_name || f.name || f.farm_id,
    shortLabel: (f) => f.farm_name || f.name || f.farm_id,
    contextLabel: "Farm",
    loadingMsg: "Loading your farm…",
    emptyMsg: "No farm found — set up your farm first.",
    pickPrompt: "Select farm…",
    buildAnchors: (f) => ({ farm_id: f.farm_id }),
    injectPayload: () => ({}),
  },
  verbs: [
    {
      id: "new_animals", label: "New animals", descriptor: "born or bought", icon: "PlusCircle",
      resolve: { branch: { prompt: "Where from?", options: [
        { choiceLabel: "Born on farm", event_type: "LIVESTOCK_BIRTH", autofillDate: ["birth_date"], capture: [
          SPECIES_FIELD,
          { name: "qty_born", ask: "How many born?", input: "number", tier: "quick" },
          { name: "qty_alive", ask: "Born alive", input: "number", tier: "detail" },
          REF_FIELD ] },
        { choiceLabel: "Bought / acquired", event_type: "LIVESTOCK_ACQUIRED", autofillDate: ["acquired_date"], capture: [
          SPECIES_FIELD,
          { name: "qty", ask: "How many?", input: "number", tier: "quick" },
          { name: "cost_fjd", ask: "Cost (FJD)", input: "number", tier: "detail" },
          { name: "source", ask: "From who / where", input: "text", tier: "detail" },
          REF_FIELD ] },
      ] } },
    },
    {
      id: "death", label: "Death / loss", descriptor: "an animal died", icon: "Skull",
      resolve: { primary: { event_type: "LIVESTOCK_MORTALITY", autofillDate: ["death_date"], capture: [
        SPECIES_FIELD,
        { name: "qty_dead", ask: "How many died?", input: "number", tier: "quick" },
        { name: "cause", ask: "Likely cause", input: "choice", tier: "quick", options: opts({value:"DISEASE",label:"Disease"},{value:"PREDATION",label:"Predator"},{value:"INJURY",label:"Injury"},{value:"BIRTHING",label:"Birthing"},{value:"OLD_AGE",label:"Old age"},{value:"UNKNOWN",label:"Unknown"},{value:"OTHER",label:"Other"}) },
        REF_FIELD ] } },
    },
    {
      id: "sale", label: "Sold animals", descriptor: "money in from a sale", icon: "HandCoins",
      resolve: { primary: { event_type: "LIVESTOCK_SALE", autofillDate: ["sale_date"], capture: [
        SPECIES_FIELD,
        { name: "qty", ask: "How many sold?", input: "number", tier: "quick" },
        { name: "total_revenue_fjd", ask: "Money received (FJD)", input: "number", tier: "quick" },
        { name: "buyer_name", ask: "Buyer", input: "text", tier: "detail" },
        REF_FIELD ] } },
    },
    {
      id: "health", label: "Vaccination", descriptor: "vaccine or treatment", icon: "Syringe",
      resolve: { primary: { event_type: "VACCINATION", autofillDate: ["given_date"], capture: [
        SPECIES_FIELD,
        { name: "vaccine_name", ask: "Vaccine / medicine", input: "text", tier: "quick" },
        { name: "qty_animals", ask: "Animals treated", input: "number", tier: "detail" },
        { name: "withholding_days_meat", ask: "Meat withhold (days)", input: "number", tier: "detail" },
        { name: "withholding_days_milk", ask: "Milk withhold (days)", input: "number", tier: "detail" },
        REF_FIELD ] } },
    },
    {
      id: "milk", label: "Milk", descriptor: "milk collected", icon: "Milk",
      resolve: { primary: { event_type: "MILK_COLLECTED", autofillDate: ["collected_date"], capture: [
        SPECIES_FIELD,
        { name: "qty_litres", ask: "Litres", input: "number", tier: "quick" },
        { name: "session", ask: "When?", input: "choice", tier: "quick", options: opts({value:"MORNING",label:"Morning"},{value:"EVENING",label:"Evening"},{value:"FULL_DAY",label:"Full day"}) },
        REF_FIELD ] } },
    },
    {
      id: "move_breed", label: "Move / breed", descriptor: "moved paddock or mated", icon: "Repeat",
      resolve: { branch: { prompt: "What did you do?", options: [
        { choiceLabel: "Moved animals", event_type: "ANIMAL_MOVED", autofillDate: ["moved_date"], capture: [
          SPECIES_FIELD,
          { name: "to_location", ask: "Moved to", input: "text", tier: "quick" },
          { name: "qty", ask: "How many", input: "number", tier: "detail" },
          { name: "from_location", ask: "Moved from", input: "text", tier: "detail" },
          { name: "reason", ask: "Why?", input: "text", tier: "detail" },
          REF_FIELD ] },
        { choiceLabel: "Breeding / mating", event_type: "BREEDING_LOGGED", autofillDate: ["breeding_date"], capture: [
          SPECIES_FIELD,
          { name: "method", ask: "Method", input: "choice", tier: "quick", options: opts({value:"NATURAL",label:"Natural"},{value:"AI",label:"AI"},{value:"PREGNANCY_CHECK",label:"Pregnancy check"}) },
          { name: "result", ask: "Result", input: "choice", tier: "detail", options: opts({value:"MATED",label:"Mated"},{value:"PREGNANT",label:"Pregnant"},{value:"NOT_PREGNANT",label:"Not pregnant"},{value:"UNKNOWN",label:"Unknown"}) },
          { name: "sire_ref", ask: "Sire (bull/buck) tag", input: "text", tier: "detail" },
          REF_FIELD ] },
      ] } },
    },
  ],
};

export default livestockConfig;

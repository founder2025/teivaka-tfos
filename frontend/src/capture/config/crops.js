/**
 * Universal Capture Engine — CROPS config.
 *
 * Schema (Gate 1): VerticalConfig -> Verb -> Resolution(primary|branch) ->
 * EventSpec -> Field(tier quick/detail). PRESENTATION layer only; the backend
 * events_registry.py stays the truth for fields/validation/typed-event. Field
 * `name`s below are the EXACT backend payload keys (STRIKE_96_FIELDS).
 *
 * FUNCTIONAL NOW (4 verbs, all /events-native + wired):
 *   Crop Monitoring · Watered & Fed · Crop Maintenance · Crop Protection.
 * SEQUENCED (need backend first — NOT added here to avoid faked/padlocked tiles):
 *   Harvest & Post-Harvest (HARVEST_LOGGED is legacy /harvests — needs B75),
 *   Sales & Delivery + Inputs & Inventory (depend on the 12 locked events),
 *   Planting & Establishment (CYCLE_CREATED is a create-path special case),
 *   plus CHEMICAL_APPLIED (needs a chemical picker + WHD UX).
 * Adding any of those = a config edit here once their backend is ready. Engine untouched.
 */
export const cropsConfig = {
  vertical: "CROPS",
  verbs: [
    {
      id: "monitoring",
      label: "Crop Monitoring",
      descriptor: "crop health, pests, disease",
      icon: "Eye",
      resolve: {
        branch: {
          prompt: "What did you see?",
          options: [
            {
              choiceLabel: "Looks healthy / ok",
              event_type: "CROP_HEALTH_OBSERVATION",
              capture: [
                { name: "status", ask: "How does it look?", input: "choice", tier: "quick",
                  options: [{ value: "HEALTHY", label: "Healthy" }, { value: "STRESSED", label: "Stressed" }, { value: "POOR", label: "Poor" }] },
                { name: "issue", ask: "Anything you noticed", input: "text", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Pests",
              event_type: "PEST_SCOUTING",
              capture: [
                { name: "pest_type", ask: "Which pest?", input: "choice", tier: "quick",
                  options: ["Whitefly", "Aphid", "Cutworm", "Fruit fly", "Caterpillar", "Other"].map((v) => ({ value: v, label: v })) },
                { name: "density", ask: "How many?", input: "choice", tier: "quick",
                  options: [{ value: "low", label: "A few" }, { value: "med", label: "Some" }, { value: "high", label: "A lot" }] },
                { name: "affected_area", ask: "Where / how much", input: "text", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Disease",
              event_type: "DISEASE_SCOUTING",
              capture: [
                { name: "disease_type", ask: "Which disease?", input: "choice", tier: "quick",
                  options: ["Early blight", "Late blight", "Powdery mildew", "Bacterial wilt", "Mosaic virus", "Other"].map((v) => ({ value: v, label: v })) },
                { name: "severity", ask: "How bad?", input: "choice", tier: "quick",
                  options: [{ value: "low", label: "Mild" }, { value: "med", label: "Moderate" }, { value: "high", label: "Bad" }] },
                { name: "affected_plants", ask: "Plants affected", input: "number", tier: "detail" },
              ],
            },
          ],
        },
      },
    },
    {
      id: "water_feed",
      label: "Watered & Fed",
      descriptor: "watering and fertilizing",
      icon: "Droplet",
      resolve: {
        branch: {
          prompt: "Which did you do?",
          options: [
            {
              choiceLabel: "Watered",
              event_type: "IRRIGATION",
              capture: [
                { name: "method", ask: "How?", input: "choice", tier: "quick",
                  options: [{ value: "DRIP", label: "Drip" }, { value: "OVERHEAD", label: "Overhead" }, { value: "FLOOD", label: "Flood" }, { value: "HAND", label: "By hand" }] },
                { name: "duration_minutes", ask: "How long (minutes)", input: "number", tier: "detail" },
                { name: "water_source", ask: "Water source", input: "text", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Fertilized / fed",
              event_type: "FERTILIZER_APPLIED",
              capture: [
                { name: "product_name", ask: "What did you use?", input: "text", tier: "quick" },
                { name: "rate_kg_per_ha", ask: "Rate (kg/ha)", input: "number", tier: "detail" },
                { name: "application_method", ask: "How applied", input: "choice", tier: "detail",
                  options: [{ value: "BROADCAST", label: "Broadcast" }, { value: "BAND", label: "Band" }, { value: "FOLIAR", label: "Foliar" }, { value: "FERTIGATION", label: "Fertigation" }] },
              ],
            },
          ],
        },
      },
    },
    {
      id: "maintenance",
      label: "Crop Maintenance",
      descriptor: "pruning, mulching, thinning",
      icon: "Scissors",
      resolve: {
        branch: {
          prompt: "What did you do?",
          options: [
            {
              choiceLabel: "Pruned / trained",
              event_type: "PRUNING_TRAINING",
              capture: [
                { name: "activity", ask: "Which?", input: "choice", tier: "quick",
                  options: [{ value: "PRUNE", label: "Prune" }, { value: "TRAIN", label: "Train" }, { value: "STAKE", label: "Stake" }, { value: "TIE", label: "Tie" }] },
                { name: "plants_count", ask: "How many plants", input: "number", tier: "detail" },
                { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Mulched",
              event_type: "MULCHING",
              capture: [
                { name: "material", ask: "Material", input: "choice", tier: "quick",
                  options: [{ value: "STRAW", label: "Straw" }, { value: "GRASS", label: "Grass" }, { value: "PLASTIC", label: "Plastic" }, { value: "LEAVES", label: "Leaves" }] },
                { name: "area_treated_ha", ask: "Area (ha)", input: "number", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Thinned",
              event_type: "THINNING",
              capture: [
                { name: "plants_removed", ask: "Plants removed", input: "number", tier: "quick" },
                { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" },
              ],
            },
          ],
        },
      },
    },
    {
      id: "protection",
      label: "Crop Protection",
      descriptor: "weed & natural pest control",
      icon: "ShieldCheck",
      resolve: {
        branch: {
          prompt: "What did you do?",
          options: [
            {
              choiceLabel: "Weeded",
              event_type: "WEED_MANAGEMENT",
              capture: [
                { name: "method", ask: "How?", input: "choice", tier: "quick",
                  options: [{ value: "MANUAL", label: "By hand" }, { value: "MECHANICAL", label: "Machine" }, { value: "MULCH", label: "Mulch" }, { value: "COVER_CROP", label: "Cover crop" }] },
                { name: "area_treated_ha", ask: "Area (ha)", input: "number", tier: "detail" },
                { name: "labor_hours", ask: "Hours worked", input: "number", tier: "detail" },
              ],
            },
            {
              choiceLabel: "Natural / bio control",
              event_type: "BIOLOGICAL_CONTROL_APPLIED",
              capture: [
                { name: "agent", ask: "What did you use?", input: "text", tier: "quick" },
                { name: "target_pest", ask: "Target pest", input: "text", tier: "detail" },
                { name: "area_ha", ask: "Area (ha)", input: "number", tier: "detail" },
              ],
            },
          ],
        },
      },
    },
  ],
};

export default cropsConfig;

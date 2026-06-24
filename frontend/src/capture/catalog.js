/**
 * catalog.js — the unified (+) catalog model (prototype-parity rebuild 2026-06-24).
 *
 * The prototype's (+) is ONE searchable accordion catalog (`openCatalogOverlay`):
 * search + "condensed essentials" toggle + collapsible GROUPS of event-type cards →
 * tap a card → the form. Two taps, not the five-deep vertical→sub-flow→verb→branch
 * drill prod had drifted into.
 *
 * This flattens the four Capture Engine configs (crops / poultry / livestock / money)
 * into that catalog WITHOUT touching the forms themselves: each config VERB becomes a
 * catalog GROUP (its natural activity-domain — "Crop Monitoring", "Eggs", "Money in"…),
 * and each event spec under it becomes a CARD. Clicking a card opens the existing
 * CaptureEngine form for that event_type (see CaptureEngine `preselect`). `route` verbs
 * (start a crop, place a flock, harvest, labour) stay handoffs to their rich pages.
 *
 * Enterprise scope: a vertical the farm doesn't run (per farm_active_groups) is hidden;
 * Whole-farm money is always shown. Fail-open when groups are unknown.
 */
import cropsConfig from "./config/crops";
import poultryConfig from "./config/animal-poultry";
import livestockConfig from "./config/animal-livestock";
import moneyConfig from "./config/whole-money";

// vertical key -> { config, groups[] } — groups are the farm_active_groups that switch
// this vertical on. MONEY (whole-farm) is universal and never gated.
export const CONFIGS = {
  CROPS:     { config: cropsConfig,     groups: ["CROPS", "PERENNIALS", "FORESTRY", "SPECIALTY"] },
  POULTRY:   { config: poultryConfig,   groups: ["POULTRY"] },
  LIVESTOCK: { config: livestockConfig, groups: ["LIVESTOCK"] },
  MONEY:     { config: moneyConfig,     groups: [] },   // whole-farm: always shown
};

// Display order (Crops is priority vertical → first; whole-farm money last).
const ORDER = ["CROPS", "POULTRY", "LIVESTOCK", "MONEY"];

// Condensed mode = the handful every farmer logs (mirrors the prototype's 8-essential
// SOLO_CATALOG, extended for the animal + money verticals prod actually ships).
export const ESSENTIALS = new Set([
  // crops
  "PLANTING", "IRRIGATION", "FERTILIZER_APPLIED", "CHEMICAL_APPLIED",
  "FIELD_OBSERVATION", "PEST_SCOUTING", "CROP_SOLD",
  // money
  "CASH_IN", "CASH_OUT",
  // poultry
  "EGGS_COLLECTED", "MORTALITY_LOGGED", "FEED_USED",
  // livestock
  "LIVESTOCK_MORTALITY", "MILK_COLLECTED", "LIVESTOCK_SALE",
]);

export function configForVertical(vkey) {
  return CONFIGS[vkey]?.config || cropsConfig;
}

/**
 * Build the catalog as ordered accordion sections.
 * @param {string[]|null} activeGroups farm_active_groups (null/empty => fail-open, show all)
 * @returns {{id,title,sub,vertical,cards:[{key,label,desc,icon,eventType?,route?,essential}]}[]}
 */
export function buildCatalog(activeGroups) {
  const hasScope = Array.isArray(activeGroups) && activeGroups.length > 0;
  const sections = [];
  for (const vkey of ORDER) {
    const entry = CONFIGS[vkey];
    if (!entry) continue;
    // Enterprise scope: hide a vertical this farm doesn't run (money always shown).
    if (vkey !== "MONEY" && hasScope && !entry.groups.some((g) => activeGroups.includes(g))) continue;

    for (const v of entry.config.verbs) {
      const cards = [];
      if (v.route) {
        cards.push({ key: `${vkey}:${v.id}`, label: v.label, desc: v.descriptor || "", icon: v.icon, route: v.route, essential: false });
      } else if (v.resolve?.primary) {
        const s = v.resolve.primary;
        cards.push({ key: `${vkey}:${s.event_type}`, label: v.label, desc: v.descriptor || "", icon: v.icon, eventType: s.event_type, essential: ESSENTIALS.has(s.event_type) });
      } else if (v.resolve?.branch?.options) {
        for (const o of v.resolve.branch.options) {
          cards.push({ key: `${vkey}:${o.event_type}`, label: o.choiceLabel, desc: "", icon: v.icon, eventType: o.event_type, essential: ESSENTIALS.has(o.event_type) });
        }
      }
      if (cards.length) {
        sections.push({ id: `${vkey}:${v.id}`, title: v.label, sub: v.descriptor || "", vertical: vkey, cards });
      }
    }
  }
  return sections;
}

export default buildCatalog;

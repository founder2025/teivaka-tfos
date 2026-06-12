/**
 * personas.js — the canonical 12-tier persona taxonomy (frontend SSOT).
 *
 * Mirrors backend app/core/account_types.py. Replaces the ~8 duplicated/stale
 * `PROF`/`PROF_LABEL` maps that were keyed on the OLD 8 lowercase values. Resolve
 * a persona from either the UPPER account_type or the lowercase `profession`
 * (and legacy values map forward), so every badge/label/launcher reads from here.
 */
import {
  Sprout, ShoppingCart, Factory, Truck, Landmark, Building2, Ship, Package, Users,
  Home, BookOpen, Tractor, Sparkles, Store, Contact, ShieldCheck,
} from "lucide-react";

// group ∈ PRODUCER | TRADE | CAPITAL | GOVERNANCE | SERVICE
export const PERSONAS = {
  PRIMARY_PRODUCER:        { label: "Primary Producer",      short: "Farmer",    Icon: Sprout,       color: "#6AA84F", group: "PRODUCER" },
  COMMERCIAL_BUYER:        { label: "Commercial Buyer",      short: "Buyer",     Icon: ShoppingCart, color: "#3E7B8C", group: "TRADE" },
  AGRI_INPUT_SUPPLIER:     { label: "Agri-Input Supplier",   short: "Supplier",  Icon: Factory,      color: "#BF9000", group: "TRADE" },
  LOGISTICS_OPERATOR:      { label: "Logistics & Fleet",     short: "Logistics", Icon: Truck,        color: "#7A5C4E", group: "SERVICE" },
  BANKER_COMMERCIAL:       { label: "Commercial Bank",       short: "Banker",    Icon: Landmark,     color: "#5E6D7E", group: "CAPITAL" },
  DONOR_DEVELOPMENT:       { label: "Development / Donor",    short: "Donor",     Icon: Landmark,     color: "#5E6D7E", group: "CAPITAL" },
  AGRIBUSINESS_ENTERPRISE: { label: "Agribusiness",          short: "Business",  Icon: Building2,    color: "#8B6914", group: "TRADE" },
  COMMODITY_EXPORTER:      { label: "Commodity Exporter",    short: "Exporter",  Icon: Ship,         color: "#2F5D3A", group: "TRADE" },
  TRADE_IMPORTER:          { label: "Trade Importer",        short: "Importer",  Icon: Package,      color: "#5E6D7E", group: "TRADE" },
  MATAQALI_TRUSTEE:        { label: "Mataqali Trustee",      short: "Trustee",   Icon: Users,        color: "#5C4033", group: "GOVERNANCE" },
  GOVERNMENT_REGULATOR:    { label: "Government Regulator",  short: "Regulator", Icon: Users,        color: "#A32D2D", group: "GOVERNANCE" },
  QUALITY_AUDITOR:         { label: "Quality Auditor",       short: "Auditor",   Icon: Users,        color: "#A32D2D", group: "GOVERNANCE" },
};

// Ordered list of the 12 (for selects). value = canonical UPPER key.
export const PERSONA_OPTIONS = Object.entries(PERSONAS).map(([value, p]) => ({ value, label: p.label }));

// Legacy 8 lowercase profession keys → canonical (old data / existing users).
const LEGACY = {
  farmer: "PRIMARY_PRODUCER", buyer: "COMMERCIAL_BUYER", supplier: "AGRI_INPUT_SUPPLIER",
  service_provider: "LOGISTICS_OPERATOR", banker: "BANKER_COMMERCIAL",
  business: "AGRIBUSINESS_ENTERPRISE", exporter: "COMMODITY_EXPORTER", importer: "TRADE_IMPORTER",
  other: "AGRIBUSINESS_ENTERPRISE",
};

/** Resolve any account_type / profession value to a canonical UPPER key, or null. */
export function personaKey(v) {
  if (!v) return null;
  const up = String(v).toUpperCase();
  if (PERSONAS[up]) return up;
  return LEGACY[String(v).toLowerCase()] || null;
}
/** Full persona descriptor { key, label, short, Icon, color, group } or null. */
export function personaOf(v) {
  const k = personaKey(v);
  return k ? { key: k, ...PERSONAS[k] } : null;
}
/** Human label, with a graceful fallback so we never render a raw key. */
export function personaLabel(v) {
  const p = personaOf(v);
  return p ? p.label : (v ? String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Member");
}
export function personaGroup(v) {
  return personaOf(v)?.group || null;
}

// ---------------------------------------------------------------------------
// Persona × pillar launchers (ratified matrix). Each persona group sees its own
// set of pillar tiles on the profile hub; the full nav still allows free roam.
// ---------------------------------------------------------------------------
const PILLAR = {
  home:      { key: "home",      label: "Home",        to: "/home",            Icon: Home },
  farm:      { key: "farm",      label: "Farm",        to: "/farm",            Icon: Tractor },
  tis:       { key: "tis",       label: "TIS",         to: "/tis",             Icon: Sparkles },
  classroom: { key: "classroom", label: "Classroom",   to: "/classroom",       Icon: BookOpen },
  market:    { key: "market",    label: "Marketplace", to: "/home/marketplace", Icon: Store },
  directory: { key: "directory", label: "Directory",   to: "/home/directory",  Icon: Contact },
  verify:    { key: "verify",    label: "Verify",      to: "/verify",          Icon: ShieldCheck },
};

export const PILLARS_BY_GROUP = {
  PRODUCER:   [PILLAR.home, PILLAR.farm, PILLAR.tis, PILLAR.classroom, PILLAR.market, PILLAR.directory],
  TRADE:      [PILLAR.home, PILLAR.market, PILLAR.directory, PILLAR.classroom, PILLAR.tis],
  SERVICE:    [PILLAR.home, PILLAR.market, PILLAR.directory, PILLAR.classroom, PILLAR.tis],
  CAPITAL:    [PILLAR.home, PILLAR.directory, PILLAR.classroom, PILLAR.tis, PILLAR.market, PILLAR.verify],
  GOVERNANCE: [PILLAR.home, PILLAR.directory, PILLAR.classroom, PILLAR.farm, PILLAR.tis, PILLAR.verify],
};

/** Pillar-launcher tiles for a persona (falls back to PRODUCER's set). */
export function pillarsFor(v) {
  return PILLARS_BY_GROUP[personaGroup(v)] || PILLARS_BY_GROUP.PRODUCER;
}

// Top-nav (PillarTabs) visibility per group — which of home/classroom/farm/tis show.
// Ratified matrix: Farm hidden for TRADE/SERVICE/CAPITAL; TIS shown for all
// (read-only for non-producers — enforced at content level, not hidden).
const NAV_PILLARS_BY_GROUP = {
  PRODUCER:   ["home", "classroom", "farm", "tis"],
  TRADE:      ["home", "classroom", "tis"],
  SERVICE:    ["home", "classroom", "tis"],
  CAPITAL:    ["home", "classroom", "tis"],
  GOVERNANCE: ["home", "classroom", "farm", "tis"],
};

/** Top-nav pillar keys a persona may see (falls back to PRODUCER's full set). */
export function navPillarKeys(v) {
  return NAV_PILLARS_BY_GROUP[personaGroup(v)] || NAV_PILLARS_BY_GROUP.PRODUCER;
}

/** True for farm-operating personas (show farm records / TIS / producer copy). */
export function isProducer(v) {
  return personaGroup(v) === "PRODUCER";
}

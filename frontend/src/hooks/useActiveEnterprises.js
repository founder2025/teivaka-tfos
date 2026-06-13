/**
 * useActiveEnterprises — Slice C. Reads the farm's declared enterprises
 * (tenant.farm_active_groups via GET /farms/{id}/active-groups) so any
 * surface can shape itself to what the farmer actually farms.
 *
 * Returns the set of ACTIVE production groups (CROPS, POULTRY, AQUACULTURE…),
 * never the cross-cutting MONEY/NOTES/OTHER. The single source of truth that
 * Slice B writes at onboarding and Settings lets the farmer change.
 */
import { useEffect, useState } from "react";

const PRODUCTION_GROUPS = ["CROPS", "PERENNIALS", "LIVESTOCK", "POULTRY", "APICULTURE", "AQUACULTURE", "FORESTRY", "SPECIALTY"];

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function useActiveEnterprises(farmId) {
  const [active, setActive] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!farmId) { setActive([]); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/v1/farms/${encodeURIComponent(farmId)}/active-groups`, { headers: authHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = await r.json();
        const rows = b?.data?.groups || b?.data || b?.groups || [];
        const on = rows
          .filter((g) => g.is_active && PRODUCTION_GROUPS.includes(g.catalog_group))
          .map((g) => g.catalog_group);
        if (alive) setActive(on);
      } catch (e) { if (alive) { setActive([]); setError(String(e.message || e)); } }
    })();
    return () => { alive = false; };
  }, [farmId]);

  return { active, loading: active === null, error };
}

// Every vertical's display config: label, the route that serves it, and whether
// it has a real dashboard yet or renders the honest stub.
export const VERTICAL_CONFIG = {
  CROPS:       { label: "Crops",         route: "/farm/cycles",       deep: true,  unit: "block",  add: "Plant your first crop cycle" },
  PERENNIALS:  { label: "Trees & vines", route: "/farm/perennials",   deep: false, unit: "stand",  add: "Add your first orchard or vine stand" },
  POULTRY:     { label: "Poultry",       route: "/farm/poultry",      deep: true,  unit: "flock",  add: "Place your first flock" },
  LIVESTOCK:   { label: "Livestock",     route: "/farm/livestock",    deep: false, unit: "herd",   add: "Log your first animals" },
  APICULTURE:  { label: "Bees",          route: "/farm/apiculture",   deep: false, unit: "hive",   add: "Register your first hive" },
  AQUACULTURE: { label: "Fish & sea",    route: "/farm/aquaculture",  deep: false, unit: "pond",   add: "Add your first pond or cage" },
  FORESTRY:    { label: "Forestry",      route: "/farm/forestry",     deep: false, unit: "woodlot", add: "Add your first woodlot" },
  SPECIALTY:   { label: "Specialty",     route: "/farm/specialty",    deep: false, unit: "unit",   add: "Add your first protected/specialty unit" },
};

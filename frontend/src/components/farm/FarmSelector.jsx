/**
 * FarmSelector — dropdown of all farms in the user's tenant.
 *
 * Selection is held in CurrentFarmContext (localStorage-backed). On mount,
 * if the persisted id is missing or invalid, falls back to the first farm
 * returned by /api/v1/farms.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon } from "lucide-react";

import { useCurrentFarm } from "../../context/CurrentFarmContext";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
  muted:  "#8A7863",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.farms ?? [];
}

export default function FarmSelector() {
  const { farmId, setFarmId } = useCurrentFarm();
  const { data: farms = [], isLoading } = useQuery({
    queryKey: ["farms"],
    queryFn: fetchFarms,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!farms.length) return;
    const valid = farms.some((f) => f.farm_id === farmId);
    if (!valid) setFarmId(farms[0].farm_id);
  }, [farms, farmId, setFarmId]);

  if (isLoading) {
    return (
      <div
        className="inline-flex items-center rounded-lg animate-pulse"
        style={{ background: "#EFE7D6", height: 36, width: 200 }}
      />
    );
  }

  if (!farms.length) {
    return (
      <span className="text-sm" style={{ color: C.muted }}>
        No farms yet
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
      style={{ background: "white", border: `1px solid ${C.border}` }}
    >
      <MapIcon size={14} style={{ color: C.muted }} />
      <select
        value={farmId || ""}
        onChange={(e) => setFarmId(e.target.value)}
        className="bg-transparent text-sm font-medium border-0 focus:outline-none cursor-pointer"
        style={{ color: C.soil }}
        aria-label="Select farm"
      >
        {farms.map((f) => {
          const parts = [f.farm_id];
          if (f.farm_name) parts.push(f.farm_name);
          if (f.location_island) parts.push(f.location_island);
          return (
            <option key={f.farm_id} value={f.farm_id}>
              {parts.join(" · ")}
            </option>
          );
        })}
      </select>
    </span>
  );
}

/**
 * ActiveCyclesTable — pulls /api/v1/cycles?farm_id=&cycle_status=ACTIVE.
 *
 * Read-only this commit. Sort/filter/sticky-header come Day 4+.
 *
 * Backend uses query param name `cycle_status`, not `status` — matched against
 * the deployed router on 2026-04-25.
 */
import { useQuery } from "@tanstack/react-query";

const C = {
  soil:    "#5C4033",
  greenDk: "#3E7B1F",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

async function fetchActiveCycles(farmId) {
  if (!farmId) return [];
  const url = `/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&cycle_status=ACTIVE`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.cycles ?? body?.cycles ?? [];
}

function dayCount(plantingDate) {
  if (!plantingDate) return "—";
  const planted = new Date(plantingDate);
  if (isNaN(planted.getTime())) return "—";
  const now = new Date();
  const diff = Math.floor((now - planted) / (1000 * 60 * 60 * 24));
  return diff < 0 ? "—" : String(diff);
}

const TH_STYLE = {
  color: C.muted,
  borderBottom: `1px solid ${C.border}`,
  background: C.cream,
};
const TD_STYLE = { color: C.soil, borderBottom: `1px solid ${C.border}` };

export default function ActiveCyclesTable({ farmId }) {
  const { data: cycles = [], isLoading, error } = useQuery({
    queryKey: ["cycles", farmId, "ACTIVE"],
    queryFn: () => fetchActiveCycles(farmId),
    enabled: !!farmId,
  });

  if (isLoading) {
    return (
      <div
        className="rounded animate-pulse"
        style={{ background: "#EFE7D6", height: 80 }}
      />
    );
  }
  if (error) {
    return (
      <div className="text-sm" style={{ color: C.muted }}>
        Couldn't load cycles ({error.message}).
      </div>
    );
  }
  if (!cycles.length) {
    return (
      <div className="text-sm" style={{ color: C.muted }}>
        No active cycles for this farm yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Cycle", "Crop", "PU", "Day", "Status"].map((h) => (
              <th
                key={h}
                className="text-left text-[10px] uppercase tracking-wider font-semibold px-2 py-2"
                style={TH_STYLE}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => (
            <tr key={c.cycle_id}>
              <td
                className="px-2 py-2 font-mono text-[11px]"
                style={TD_STYLE}
              >
                {c.cycle_id}
              </td>
              <td className="px-2 py-2" style={TD_STYLE}>
                {c.production_name || c.production_id || "—"}
              </td>
              <td
                className={`px-2 py-2 ${c.pu_farmer_label ? "" : "font-mono text-[11px]"}`}
                style={TD_STYLE}
              >
                {c.pu_farmer_label || c.pu_id || "—"}
              </td>
              <td className="px-2 py-2" style={TD_STYLE}>
                {dayCount(c.planting_date)}
              </td>
              <td className="px-2 py-2" style={TD_STYLE}>
                <span
                  className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{
                    background: C.cream,
                    color: C.greenDk,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {c.cycle_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

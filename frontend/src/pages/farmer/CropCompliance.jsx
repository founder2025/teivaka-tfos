/**
 * CropCompliance.jsx — /farm/compliance
 *
 * The v263 coreComplianceView (crop chemical-WHD slice), backed entirely by
 * GET /api/v1/crops/compliance/{farm_id}:
 *   { blocked_count, active_blocks[], upcoming_clearances[], checked_cycles }
 *
 * Sections (prototype-faithful): dual-layer enforcement banner, "N blocked
 * right now — do not sell", KPI tiles (Blocked now / Harvest-safe / Clearing
 * ≤14d), and per-block withholding detail cards. The dual-layer copy is an
 * accurate description of the real enforcement (Inviolable #2) — not mock data.
 * Poultry compliance is preserved at /farm/compliance/poultry.
 */
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, FlaskConical, CheckCircle2 } from "lucide-react";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD", amber: "#BF9000", red: "#D4442E", redTint: "#FBEAE6",
};
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
function fmtDate(s) { if (!s) return "—"; try { return new Date(s + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } }

function Tile({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-2xl font-extrabold mt-0.5" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function CropComplianceInner() {
  const { farmId } = useCurrentFarm();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["crop-compliance", farmId],
    queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`),
    enabled: !!farmId, retry: 0,
  });
  const d = data?.data || {};
  const blocks = d.active_blocks ?? [];
  const blocked = d.blocked_count ?? 0;
  const checked = d.checked_cycles ?? 0;
  const upcoming = d.upcoming_clearances ?? [];
  const safe = Math.max(0, checked - blocked);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Compliance</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Spray safety &amp; chemical withholding — every harvest provable</div>
        </div>
        <FarmSelector />
      </div>

      {/* dual-layer enforcement explainer (accurate — Inviolable #2) */}
      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.greenTint }}>
        <div className="flex items-center gap-2 font-bold mb-2" style={{ color: C.greenDk }}><ShieldCheck size={16} />Dual-layer withholding enforcement — always on</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-xs" style={{ color: C.soil }}><b>Layer 1 — pre-check.</b> When you log a harvest, every chemical&apos;s withholding period is checked first; anything still inside the window is refused before it&apos;s recorded.</div>
          <div className="text-xs" style={{ color: C.soil }}><b>Layer 2 — hard gate.</b> A database trigger blocks the record outright if it ever slips past — it cannot be bypassed by any app, script, or import.</div>
        </div>
      </div>

      {/* blocked-now banner */}
      {isLoading ? (
        <div className="rounded-2xl animate-pulse" style={{ height: 80, background: C.cream }} />
      ) : isError ? (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: C.border, color: C.muted }}>Couldn&apos;t load compliance right now — try again shortly.</div>
      ) : blocked > 0 ? (
        <div className="rounded-2xl border p-4" style={{ borderLeft: `4px solid ${C.red}`, borderColor: C.border, background: C.redTint }}>
          <div className="font-bold flex items-center gap-2" style={{ color: C.red }}><ShieldAlert size={16} />{blocked} {blocked === 1 ? "block" : "blocks"} on hold — do not sell or harvest</div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>A chemical was applied and its withholding period hasn&apos;t cleared. The record shows you stopped.</div>
        </div>
      ) : (
        <div className="rounded-2xl border p-4" style={{ borderLeft: `4px solid ${C.green}`, borderColor: C.border, background: C.greenTint }}>
          <div className="font-bold flex items-center gap-2" style={{ color: C.greenDk }}><CheckCircle2 size={16} />Nothing on hold — every active cycle is clear to harvest</div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>{checked} active {checked === 1 ? "cycle" : "cycles"} checked. The record proves it.</div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid gap-2 grid-cols-3">
        <Tile label="Blocked now" value={blocked} sub="do not sell" color={blocked > 0 ? C.red : C.greenDk} />
        <Tile label="Harvest-safe" value={safe} sub="clear to sell" color={C.greenDk} />
        <Tile label="Clearing ≤14d" value={upcoming.length} sub="soon" color={C.amber} />
      </div>

      {/* on-hold detail cards */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>On hold — do not sell</h2>
          {blocks.map((b) => (
            <div key={b.cycle_id} className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border, borderLeft: `3px solid ${C.red}` }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold" style={{ color: C.ink }}>{b.crop || "Crop"} · {b.block_name || b.pu_id}</div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: C.red }}>{b.days_remaining}d left</span>
              </div>
              <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: C.muted }}><FlaskConical size={12} />{b.chemical} · applied {fmtDate(b.applied_date)} · {b.whd_days}-day withholding</div>
              <div className="text-xs mt-0.5" style={{ color: C.soil }}>Clears <b>{fmtDate(b.clear_date)}</b> — safe to harvest from then.</div>
            </div>
          ))}
        </div>
      )}

      {/* poultry compliance preserved (locked vertical, kept reachable) */}
      <div className="pt-1">
        <button onClick={() => navigate("/farm/compliance/poultry")} className="text-xs underline" style={{ color: C.greenDk }}>View poultry compliance →</button>
      </div>
    </div>
  );
}

export default function CropCompliance() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <CropComplianceInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

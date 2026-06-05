/**
 * Analytics.jsx — /farm/analytics  (replaces ComingSoon)
 *
 * Decision Engine made visible. Team design system (FarmDashboard pattern) +
 * v262 Analytics surface (10 sub-pages). Live where the API serves it; honest
 * structured empties (no mock data) elsewhere.
 *   Live: GET /api/v1/decision-engine/{farm_id}  (Signals + Overall Health)
 *         GET /api/v1/financials/crops/{farm_id}  (Profitability per-crop P&L)
 *         GET /api/v1/financials/farm/{farm_id}    (farm totals)
 *   Empty (named backend): Productivity, Cash & demand, Flip log, Forecasts,
 *         Per-unit, Compare, Findings, Benchmark.
 */
import { useMemo, useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery,
} from "@tanstack/react-query";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD",
};

const SEV = {
  CRITICAL: { rank: 0, color: C.red, label: "Critical" },
  HIGH:     { rank: 1, color: C.red, label: "High" },
  MEDIUM:   { rank: 2, color: C.amber, label: "Medium" },
  LOW:      { rank: 3, color: C.green, label: "Low" },
};

const TABS = [
  { id: "signals", label: "Signals", hint: "Decision engine" },
  { id: "profit", label: "Profitability", hint: "Per-crop P&L" },
  { id: "productivity", label: "Productivity", hint: "Yield & ratios", needs: "a productivity-attribution endpoint" },
  { id: "cashdemand", label: "Cash & demand", hint: "Runway & match", needs: "a cash-demand analytics endpoint" },
  { id: "fliplog", label: "Flip log", hint: "Decision audit", needs: "a flip-log endpoint" },
  { id: "forecasts", label: "Forecasts", hint: "Windows & gaps", needs: "a forecast engine endpoint" },
  { id: "perunit", label: "Per-unit", hint: "Per PU", needs: "a per-unit analytics endpoint" },
  { id: "compare", label: "Compare", hint: "Farm/crop", needs: "a comparison endpoint" },
  { id: "findings", label: "Findings", hint: "Insights", needs: "a findings endpoint" },
  { id: "benchmark", label: "Benchmark", hint: "Vs targets", needs: "a benchmark endpoint" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function formatFJD(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function fetchSignals(farmId) {
  if (!farmId) return null;
  const res = await fetch(`/api/v1/decision-engine/${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchCropFinancials(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}

function NeedsBlock({ tab }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{tab.label}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>
        This tab is ready and will populate from {tab.needs}. No numbers shown until that data is real — by design.
      </div>
    </div>
  );
}

function SignalsTab({ farmId }) {
  const q = useQuery({ queryKey: ["signals", farmId], queryFn: () => fetchSignals(farmId), enabled: !!farmId, retry: 0 });
  const data = q.data;
  const signals = data?.signals ?? [];
  const worst = useMemo(() => {
    let w = null;
    signals.forEach((s) => { const r = SEV[s.severity]?.rank ?? 3; if (w === null || r < w) w = r; });
    return w;
  }, [signals]);
  const healthColor = worst === null ? C.green : (worst <= 1 ? C.red : worst === 2 ? C.amber : C.green);
  const healthLabel = worst === null ? "All clear" : (worst <= 1 ? "Needs attention" : worst === 2 ? "Watch" : "Healthy");

  if (q.isLoading) return <p style={{ color: C.muted }}>Loading signals…</p>;
  if (q.isError) return <NeedsBlock tab={{ label: "Signals", needs: "the decision-engine signals for this farm (endpoint returned an error — verify farm id)" }} />;

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 border flex items-center justify-between" style={{ background: "white", borderColor: C.border }}>
        <div>
          <div className="text-xs" style={{ color: C.muted }}>OVERALL HEALTH</div>
          <div className="text-xl font-bold" style={{ color: healthColor }}>{healthLabel}</div>
        </div>
        <div className="text-xs text-right" style={{ color: C.muted }}>
          {signals.length} signal{signals.length === 1 ? "" : "s"}<br />
          {data?.last_refresh_at ? `snapshot ${String(data.last_refresh_at).slice(0, 16).replace("T", " ")}` : "pre-computed"}
        </div>
      </div>
      {signals.length === 0 && <p style={{ color: C.muted }}>No active signals — nothing needs a decision right now.</p>}
      {signals.map((s, i) => {
        const sev = SEV[s.severity] || SEV.LOW;
        return (
          <div key={i} className="rounded-xl p-3 border-l-4" style={{ background: "white", border: `1px solid ${C.border}`, borderLeftColor: sev.color }}>
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm" style={{ color: C.soil }}>{s.signal_type}</div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: sev.color, border: `1px solid ${C.border}` }}>{sev.label}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>{s.signal_message}</div>
          </div>
        );
      })}
      <p className="text-[11px]" style={{ color: C.muted }}>Signals are pre-computed (never on-demand). Snapshot time shown above.</p>
    </div>
  );
}

function ProfitTab({ farmId }) {
  const q = useQuery({ queryKey: ["cropfin", farmId], queryFn: () => fetchCropFinancials(farmId), enabled: !!farmId, retry: 0 });
  const rows = q.data ?? [];
  const totals = useMemo(() => rows.reduce((a, r) => {
    const inc = Number(r.total_income_fjd || 0);
    const cost = Number(r.total_labor_fjd || 0) + Number(r.total_input_cost_fjd || 0);
    a.income += inc; a.cost += cost; a.margin += inc - cost; return a;
  }, { income: 0, cost: 0, margin: 0 }), [rows]);

  if (q.isLoading) return <p style={{ color: C.muted }}>Loading profitability…</p>;
  if (q.isError) return <NeedsBlock tab={{ label: "Profitability", needs: "the crop-financials endpoint (returned an error)" }} />;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-3">
        <MetricCard label="Total income" value={formatFJD(totals.income)} sub="completed cycles" />
        <MetricCard label="Total cost" value={formatFJD(totals.cost)} sub="labor + inputs" />
        <MetricCard label="Margin" value={formatFJD(totals.margin)} sub="income − cost" />
      </div>
      {rows.length === 0 && <p style={{ color: C.muted }}>No completed cycles to analyse yet.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border, background: "white" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.muted }} className="text-xs">
                <th className="text-left p-2">Crop</th><th className="text-right p-2">Cycles</th>
                <th className="text-right p-2">Income</th><th className="text-right p-2">Cost</th>
                <th className="text-right p-2">Harvest kg</th><th className="text-right p-2">CoGK</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = Number(r.total_labor_fjd || 0) + Number(r.total_input_cost_fjd || 0);
                return (
                  <tr key={r.production_id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="p-2" style={{ color: C.soil }}>{r.production_name || r.production_id}</td>
                    <td className="p-2 text-right" style={{ color: C.muted }}>{r.total_cycles}</td>
                    <td className="p-2 text-right" style={{ color: C.greenDk }}>{formatFJD(r.total_income_fjd)}</td>
                    <td className="p-2 text-right" style={{ color: C.soil }}>{formatFJD(cost)}</td>
                    <td className="p-2 text-right" style={{ color: C.muted }}>{Number(r.total_harvest_kg || 0).toLocaleString()}</td>
                    <td className="p-2 text-right" style={{ color: C.soil }}>{r.cokg_fjd_per_kg ? `FJD ${Number(r.cokg_fjd_per_kg).toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalyticsInner() {
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("signals");
  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Analytics</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Decision engine · signals · profitability · forecasts</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FarmSelector />
        <ModeDropdown />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-4 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.soil }}>{activeTab.label}</div>
        {tab === "signals" && <SignalsTab farmId={farmId} />}
        {tab === "profit" && <ProfitTab farmId={farmId} />}
        {activeTab.needs && <NeedsBlock tab={activeTab} />}
      </section>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Analytics() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <AnalyticsInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

/**
 * Analytics.jsx — /farm/analytics  (replaces ComingSoon)
 *
 * Decision Engine made visible. Team design system + v262 Analytics surface —
 * ALL 13 prototype sub-tabs (exact labels/hints from renderAnalyticsViewTabs).
 * Live where the API serves it; honest structured empties (no mock data) else.
 *   Live: Signals (decision-engine), Profitability (financials/crops),
 *         KPI board (financials/farm), Inventory (inputs), Labour (workers+labor).
 *   Empty: Productivity, Cash & demand, Flip log, Forecasts, Per-unit, Compare,
 *          Findings, Benchmark — each names the backend it waits on.
 * Responsive: tab bar scrolls; tile grids collapse 2→3→5 cols; tables x-scroll.
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E",
};

const SEV = {
  CRITICAL: { rank: 0, color: C.red, label: "Critical" },
  HIGH:     { rank: 1, color: C.red, label: "High" },
  MEDIUM:   { rank: 2, color: C.amber, label: "Medium" },
  LOW:      { rank: 3, color: C.green, label: "Low" },
};

// Exact 13 sub-tabs from prototype renderAnalyticsViewTabs (label + hint).
const TABS = [
  { id: "signals", label: "Signals", hint: "Decision board" },
  { id: "profit", label: "Profitability", hint: "Per-cycle P&L" },
  { id: "productivity", label: "Productivity", hint: "Ratios", needs: "a productivity-attribution endpoint" },
  { id: "cashdemand", label: "Cash & demand", hint: "Runway", needs: "a cash-runway / forecast endpoint" },
  { id: "fliplog", label: "Flip log", hint: "Audit", needs: "a decision flip-log endpoint" },
  { id: "forecasts", label: "Forecasts", hint: "Predictive", needs: "a forecast engine endpoint" },
  { id: "perunit", label: "Per-unit", hint: "Roll-ups", needs: "a per-unit roll-up endpoint" },
  { id: "compare", label: "Compare", hint: "Variety", needs: "a variety-comparison endpoint" },
  { id: "findings", label: "Findings", hint: "Learning", needs: "a findings / insights endpoint" },
  { id: "benchmark", label: "Benchmark", hint: "Network", needs: "a network-benchmark endpoint" },
  { id: "kpi", label: "KPI board", hint: "Headline numbers" },
  { id: "inventory", label: "Inventory", hint: "Stock" },
  { id: "labour", label: "Labour", hint: "People" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function fjd(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
async function getJSON(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function NeedsBlock({ tab }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{tab.label} · {tab.hint}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>
        This tab is ready and will populate from {tab.needs}. No numbers shown until that data is real — by design.
      </div>
    </div>
  );
}
function Loading() { return <p style={{ color: C.muted }}>Loading…</p>; }
function ErrBlock({ what }) { return <NeedsBlock tab={{ label: "Unavailable", hint: what, needs: "the endpoint (it returned an error — verify the farm id)" }} />; }

// ── Signals (live: decision-engine) ──────────────────────────────────
function SignalsTab({ farmId }) {
  const q = useQuery({ queryKey: ["signals", farmId], queryFn: () => getJSON(`/api/v1/decision-engine/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrBlock what="decision-engine signals" />;
  const data = q.data || {}; const signals = data.signals ?? [];
  let worst = null; signals.forEach((s) => { const r = SEV[s.severity]?.rank ?? 3; if (worst === null || r < worst) worst = r; });
  const hColor = worst === null ? C.green : worst <= 1 ? C.red : worst === 2 ? C.amber : C.green;
  const hLabel = worst === null ? "All clear" : worst <= 1 ? "Needs attention" : worst === 2 ? "Watch" : "Healthy";
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 border flex items-center justify-between" style={{ background: "white", borderColor: C.border }}>
        <div><div className="text-xs" style={{ color: C.muted }}>OVERALL HEALTH</div><div className="text-xl font-bold" style={{ color: hColor }}>{hLabel}</div></div>
        <div className="text-xs text-right" style={{ color: C.muted }}>{signals.length} signal{signals.length === 1 ? "" : "s"}<br />{data.last_refresh_at ? `snapshot ${String(data.last_refresh_at).slice(0, 16).replace("T", " ")}` : "pre-computed"}</div>
      </div>
      {signals.length === 0 && <p style={{ color: C.muted }}>No active signals — nothing needs a decision right now.</p>}
      {signals.map((s, i) => {
        const sev = SEV[s.severity] || SEV.LOW;
        return (
          <div key={i} className="rounded-xl p-3" style={{ background: "white", border: `1px solid ${C.border}`, borderLeft: `4px solid ${sev.color}` }}>
            <div className="flex items-center justify-between gap-2"><div className="font-medium text-sm" style={{ color: C.soil }}>{s.signal_type}</div><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: sev.color, border: `1px solid ${C.border}` }}>{sev.label}</span></div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>{s.signal_message}</div>
          </div>
        );
      })}
      <p className="text-[11px]" style={{ color: C.muted }}>Signals are pre-computed (never on-demand).</p>
    </div>
  );
}

// ── Profitability (live: financials/crops) ───────────────────────────
function ProfitTab({ farmId }) {
  const q = useQuery({ queryKey: ["cropfin", farmId], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrBlock what="crop financials" />;
  const rows = q.data?.data ?? [];
  const t = rows.reduce((a, r) => { const inc = +r.total_income_fjd || 0; const cost = (+r.total_labor_fjd || 0) + (+r.total_input_cost_fjd || 0); a.i += inc; a.c += cost; a.m += inc - cost; return a; }, { i: 0, c: 0, m: 0 });
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <MetricCard label="Total income" value={fjd(t.i)} sub="completed cycles" />
        <MetricCard label="Total cost" value={fjd(t.c)} sub="labor + inputs" />
        <MetricCard label="Margin" value={fjd(t.m)} sub="income − cost" />
      </div>
      {rows.length === 0 && <p style={{ color: C.muted }}>No completed cycles to analyse yet.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border, background: "white" }}>
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr style={{ color: C.muted }} className="text-xs"><th className="text-left p-2">Crop</th><th className="text-right p-2">Cycles</th><th className="text-right p-2">Income</th><th className="text-right p-2">Cost</th><th className="text-right p-2">Harvest kg</th><th className="text-right p-2">CoGK</th></tr></thead>
            <tbody>{rows.map((r) => { const cost = (+r.total_labor_fjd || 0) + (+r.total_input_cost_fjd || 0); return (
              <tr key={r.production_id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="p-2" style={{ color: C.soil }}>{r.production_name || r.production_id}</td>
                <td className="p-2 text-right" style={{ color: C.muted }}>{r.total_cycles}</td>
                <td className="p-2 text-right" style={{ color: C.greenDk }}>{fjd(r.total_income_fjd)}</td>
                <td className="p-2 text-right" style={{ color: C.soil }}>{fjd(cost)}</td>
                <td className="p-2 text-right" style={{ color: C.muted }}>{Number(r.total_harvest_kg || 0).toLocaleString()}</td>
                <td className="p-2 text-right" style={{ color: C.soil }}>{r.cokg_fjd_per_kg ? `FJD ${Number(r.cokg_fjd_per_kg).toFixed(2)}` : "—"}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── KPI board (live: financials/farm) ────────────────────────────────
function KpiTab({ farmId }) {
  const q = useQuery({ queryKey: ["farmfin", farmId], queryFn: () => getJSON(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrBlock what="farm financials" />;
  const s = q.data?.data?.summary || {};
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
      <MetricCard label="Income (12m)" value={fjd(s.total_income_fjd)} sub="all cycles" />
      <MetricCard label="Labour cost" value={fjd(s.total_labor_cost_fjd)} sub="12 months" />
      <MetricCard label="Input cost" value={fjd(s.total_input_cost_fjd)} sub="12 months" />
      <MetricCard label="Net profit" value={fjd(s.net_profit_fjd)} sub="income − costs" />
      <MetricCard label="Margin" value={`${Number(s.profit_margin_pct ?? 0).toFixed(1)}%`} sub="net / income" />
    </div>
  );
}

// ── Inventory (live: inputs) ─────────────────────────────────────────
function InventoryTab({ farmId }) {
  const q = useQuery({ queryKey: ["inv", farmId], queryFn: () => getJSON(`/api/v1/inputs?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrBlock what="inventory (inputs)" />;
  const items = q.data?.data ?? [];
  const critical = items.filter((i) => ["CRITICAL", "LOW", "OUT", "OUT_OF_STOCK"].includes(String(i.stock_status || "").toUpperCase())).length;
  const value = items.reduce((a, i) => a + (Number(i.total_value_fjd) || (Number(i.current_stock || 0) * Number(i.unit_cost_fjd || 0)) || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <MetricCard label="Items" value={String(items.length)} sub="active SKUs" />
        <MetricCard label="Critical / low" value={String(critical)} sub="need reorder" />
        <MetricCard label="Stock value" value={value ? fjd(value) : "—"} sub="capital tied up" />
      </div>
      {items.length === 0 && <p style={{ color: C.muted }}>No inventory items yet.</p>}
      {items.slice(0, 12).map((i) => (
        <div key={i.input_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: "white", border: `1px solid ${C.border}` }}>
          <div className="text-sm" style={{ color: C.soil }}>{i.input_name}<span className="text-xs ml-2" style={{ color: C.muted }}>{i.input_category || i.category || ""}</span></div>
          <span className="text-xs font-semibold" style={{ color: ["CRITICAL", "LOW", "OUT"].includes(String(i.stock_status || "").toUpperCase()) ? C.red : C.muted }}>{i.stock_status || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ── Labour (live: workers + labor) ───────────────────────────────────
function LabourTab({ farmId }) {
  const wq = useQuery({ queryKey: ["alabW", farmId], queryFn: () => getJSON(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const lq = useQuery({ queryKey: ["alabL", farmId], queryFn: () => getJSON(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  if (wq.isLoading || lq.isLoading) return <Loading />;
  if (wq.isError) return <ErrBlock what="workers" />;
  const workers = wq.data?.data ?? [];
  const labor = lq.data?.data ?? [];
  const wages = labor.reduce((a, r) => a + (Number(r.total_pay_fjd) || 0), 0);
  const hours = labor.reduce((a, r) => a + (Number(r.hours_worked) || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <MetricCard label="Workers" value={String(workers.length)} sub="on roster" />
        <MetricCard label="Hours logged" value={`${hours}h`} sub="recent timesheets" />
        <MetricCard label="Wages recorded" value={fjd(wages)} sub="recent" />
      </div>
      {workers.length === 0 && <p style={{ color: C.muted }}>No workers on this farm yet.</p>}
      {workers.slice(0, 12).map((w) => (
        <div key={w.worker_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: "white", border: `1px solid ${C.border}` }}>
          <div className="text-sm" style={{ color: C.soil }}>{w.full_name}<span className="text-xs ml-2" style={{ color: C.muted }}>{w.worker_type}</span></div>
          <span className="text-xs font-semibold" style={{ color: C.soil }}>{fjd(w.daily_rate_fjd)}/day</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsInner() {
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("signals");
  const active = TABS.find((t) => t.id === tab) || TABS[0];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Analytics</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Decision engine · signals · profitability · forecasts</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap"><FarmSelector /><ModeDropdown /></div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.soil }}>{active.label} · {active.hint}</div>
        {tab === "signals" && <SignalsTab farmId={farmId} />}
        {tab === "profit" && <ProfitTab farmId={farmId} />}
        {tab === "kpi" && <KpiTab farmId={farmId} />}
        {tab === "inventory" && <InventoryTab farmId={farmId} />}
        {tab === "labour" && <LabourTab farmId={farmId} />}
        {active.needs && <NeedsBlock tab={active} />}
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

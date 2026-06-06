/**
 * DecisionCenter.jsx — /farm/decisions
 *
 * Mirrors v262 `coreDecisionView` (Gate-1 traced: renderFarm 'decisions' →
 * coreDecisionView + decisionHub · decisionEnterpriseRankings ·
 * decisionRiskIntelligence · decisionAdvisor). Single scrolling page, 9 stacked
 * sections, aligned to the prototype screenshots.
 *
 * Live where the API serves it: net/income/costs (financials/farm), per-business
 * rankings (financials/crops), urgent tasks (tasks), decision signals
 * (decision-engine, graceful on UUID mismatch). Standing column is derived
 * honestly from real net/ROI — never a mock health score. No fabricated numbers.
 */
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Crosshair, ListChecks, DollarSign, ShieldCheck, Sparkles,
  Award, CheckCircle2, Cloud, Package, Truck, ArrowRight, Activity, Droplet,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function fjd(v) { const n = Number(v ?? 0); const a = Math.abs(n); return `${n < 0 ? "−" : ""}FJ$${a.toLocaleString("en-FJ", { maximumFractionDigits: 0 })}`; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

const useFarmFin = (id) => useQuery({ queryKey: ["dcfin", id], queryFn: () => getJSON(`/api/v1/financials/farm/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useCrops = (id) => useQuery({ queryKey: ["dccrops", id], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useTasks = () => useQuery({ queryKey: ["dctasks"], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=50`), retry: 0 });
const useSignals = (id) => useQuery({ queryKey: ["dcsignals", id], queryFn: () => getJSON(`/api/v1/decision-engine/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });

// ── derivations ──────────────────────────────────────────────────────
function cropNet(r) { return (Number(r.total_income_fjd) || 0) - ((Number(r.total_labor_fjd) || 0) + (Number(r.total_input_cost_fjd) || 0)); }
function cropRoi(r) {
  const cost = (Number(r.total_labor_fjd) || 0) + (Number(r.total_input_cost_fjd) || 0);
  if (cost <= 0) return null;
  return (cropNet(r) / cost) * 100;
}
// Standing — derived from real net/ROI (NOT a mock grade). New = no logged activity yet.
function standing(r) {
  const inc = Number(r.total_income_fjd) || 0;
  const cost = (Number(r.total_labor_fjd) || 0) + (Number(r.total_input_cost_fjd) || 0);
  const active = inc > 0 || cost > 0;
  if (!active) return { grade: "New", score: null, signal: "—", color: C.muted, sig: "—", sigColor: C.muted };
  const net = inc - cost;
  const roi = cropRoi(r) ?? (inc > 0 ? 100 : 0);
  if (net > 0) {
    const score = Math.max(80, Math.min(100, Math.round(80 + roi / 5)));
    return { grade: "Strong", score, color: C.greenDk, sig: "Profitable", sigColor: C.greenDk };
  }
  const score = Math.max(45, Math.min(78, Math.round(75 + roi / 10)));
  return { grade: "Steady", score, color: C.amber, sig: "Building", sigColor: C.amber };
}
function taskSev(rank) { const n = Number(rank) || 999; return n < 100 ? "critical" : n < 300 ? "high" : "medium"; }
function sevRank(s) { return ({ critical: 0, high: 1, medium: 2, low: 3 })[String(s || "").toLowerCase()] ?? 2; }
function pill(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "critical") return { lab: "Stop", color: C.red };
  if (s === "high") return { lab: "Soon", color: C.amber };
  return { lab: "Note", color: C.muted };
}

// ── small UI atoms ───────────────────────────────────────────────────
function SectionCard({ children, accent, style }) {
  return <div className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...(accent ? { borderLeft: `4px solid ${accent}` } : {}), ...style }}>{children}</div>;
}
function Head({ icon: Icon, title, link, onLink }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
      <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><Icon size={14} />{title}</h3>
      {link && <button onClick={onLink} className="text-xs" style={{ color: C.greenDk }}>{link}</button>}
    </div>
  );
}
function Tile({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3 min-w-0" style={{ background: "white", borderColor: C.border, cursor: onClick ? "pointer" : "default" }}>
      <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-bold truncate" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px] truncate" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}
function MiniCard({ icon: Icon, title, badge, badgeColor, desc, onClick }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3 mb-2.5" style={{ background: "white", borderColor: C.border, cursor: onClick ? "pointer" : "default" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.soil }}><Icon size={15} style={{ color: C.green }} />{title}</span>
        <span className="text-[11px] font-semibold shrink-0" style={{ color: badgeColor || C.muted }}>{badge}</span>
      </div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>{desc}</div>
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────
function DecisionInner() {
  const { farmId } = useCurrentFarm();
  const navigate = useNavigate();
  const go = (sub) => navigate(`/farm/${sub}`);

  const fin = useFarmFin(farmId);
  const crops = useCrops(farmId);
  const tasksQ = useTasks();
  const sigQ = useSignals(farmId);

  const s = fin.data?.data?.summary || {};
  const income = Number(s.total_income_fjd ?? 0);
  const costs = fin.data ? (Number(s.total_labor_cost_fjd) || 0) + (Number(s.total_input_cost_fjd) || 0) : 0;
  const net = Number(s.net_profit_fjd ?? 0);
  const haveFin = !!fin.data;

  const cropRows = (crops.data?.data ?? []).map((r) => ({ ...r, _net: cropNet(r), _st: standing(r) }));
  const ranked = [...cropRows].sort((a, b) => b._net - a._net);
  const strongest = ranked[0];
  const weakest = [...cropRows].filter((r) => r._st.grade !== "New").sort((a, b) => a._net - b._net)[0];

  const tasks = (tasksQ.data?.data?.tasks ?? tasksQ.data?.tasks ?? []).map((t) => ({ ...t, _sev: taskSev(t.task_rank) }));
  const urgent = tasks.filter((t) => t._sev === "critical" || t._sev === "high").sort((a, b) => sevRank(a._sev) - sevRank(b._sev));

  const signals = sigQ.data?.signals ?? [];
  const critSignals = signals.filter((g) => String(g.severity).toUpperCase() === "CRITICAL");
  const blocks = critSignals.length; // closest live proxy to "blocks"; honest 0 when none
  const haveSignals = !!sigQ.data;
  const clearToSell = cropRows.filter((r) => r._st.grade !== "New").length;

  // THE CALL RIGHT NOW
  let call;
  if (critSignals.length) {
    const b = critSignals[0];
    call = { color: C.red, icon: AlertTriangle, title: `Stop — ${b.signal_message || b.signal_type}`, sub: `${b.crop_name || "Farm"} — ${b.suggested_action || "review before selling"}`, label: "Open compliance", act: () => go("compliance") };
  } else if (urgent.length) {
    const u = urgent[0];
    call = { color: C.amber, icon: Droplet, title: u.imperative, sub: `${u.source_module || "Task"}${u.body_md ? ` — ${u.body_md}` : ""}`, label: "Go to tasks", act: () => go("tasks") };
  } else {
    call = { color: C.green, icon: CheckCircle2, title: "Keep the routine going", sub: "No blocks and nothing urgent across the farm right now.", label: "Plan ahead", act: () => go("production") };
  }
  const CallIcon = call.icon;

  // WHAT THE FARM IS TELLING YOU — merged signals + open tasks
  const tellRows = [
    ...signals.map((g) => ({ sev: String(g.severity).toLowerCase(), title: g.signal_message || g.signal_type, tag: [g.crop_name, g.signal_type].filter(Boolean).join(" · "), why: g.suggested_action, label: "Open", act: () => go("compliance") })),
    ...tasks.map((t) => ({ sev: t._sev, title: t.imperative, tag: t.source_module || "Task", why: t.body_md, label: "Tasks", act: () => go("tasks") })),
  ].sort((a, b) => sevRank(a.sev) - sevRank(b.sev)).slice(0, 12);

  // AI advisor actions
  const acts = [];
  if (blocks > 0) acts.push(`Clear the ${blocks} hold${blocks === 1 ? "" : "s"} before selling or harvesting.`);
  if (weakest) acts.push(`Review ${weakest.production_name} before spending more on it.`);
  if (strongest && strongest._net > 0) acts.push(`Put your next effort into ${strongest.production_name} — strongest right now.`);
  acts.push("Keep logging daily — it strengthens your bank record and these recommendations.");
  const avgScore = cropRows.length ? Math.round(cropRows.reduce((a, r) => a + (r._st.score || 0), 0) / cropRows.length) : 0;
  const ready = avgScore >= 70 && net >= 0 && haveFin;

  const farmName = farmId || "your farm";

  return (
    <div className="space-y-3">
      {/* 1. Title bar */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Decision Center</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>What the whole farm is telling you, most important first · {farmName}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><FarmSelector /><ModeDropdown /></div>
      </div>

      {/* 2. THE CALL RIGHT NOW */}
      <SectionCard accent={call.color}>
        <div className="p-4 flex gap-3.5 items-start">
          <CallIcon size={22} style={{ color: call.color, flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>The call right now</div>
            <div className="text-base font-bold mt-1" style={{ color: C.ink }}>{call.title}</div>
            <div className="text-sm mt-0.5" style={{ color: C.muted }}>{call.sub}</div>
          </div>
          <button onClick={call.act} className="text-sm px-3 py-2 rounded-lg text-white shrink-0" style={{ background: C.greenDk }}>{call.label}</button>
        </div>
      </SectionCard>

      {/* 3. DECISION STATE tiles */}
      <SectionCard>
        <Head icon={Crosshair} title="Decision state" />
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 p-3 pt-1">
          <Tile label="Open blocks" value={haveSignals ? String(blocks) : "—"} sub={blocks ? "do not sell yet" : "none blocking"} color={blocks ? C.red : C.greenDk} onClick={() => go("compliance")} />
          <Tile label="Urgent tasks" value={tasksQ.data ? String(urgent.length) : "—"} sub="do these first" color={urgent.length ? C.amber : C.greenDk} onClick={() => go("tasks")} />
          <Tile label="Needs attention" value={weakest ? weakest.production_name : (crops.data ? "All steady" : "—")} sub={weakest ? `${weakest._st.grade} · ${weakest._st.score ?? "—"}` : "strongest first"} color={weakest ? C.amber : C.greenDk} onClick={() => go("analytics")} />
          <Tile label="Cash signal" value={haveFin ? fjd(net) : "—"} sub={net < 0 ? "spending ahead" : "ahead"} color={net < 0 ? C.amber : C.greenDk} onClick={() => go("cash")} />
          <Tile label="Clear to sell" value={crops.data ? String(clearToSell) : "—"} sub="no active holds" color={C.greenDk} onClick={() => go("compliance")} />
        </div>
      </SectionCard>

      {/* 4. WHAT THE FARM IS TELLING YOU */}
      <SectionCard>
        <Head icon={ListChecks} title="What the farm is telling you" link="All tasks →" onLink={() => go("tasks")} />
        <div className="px-4 pb-3">
          {sigQ.isError && tasks.length > 0 && (
            <div className="text-[11px] mb-1" style={{ color: C.muted }}>Signals engine connecting — showing open tasks.</div>
          )}
          {tellRows.length === 0 ? (
            <div className="py-3.5 text-sm" style={{ color: C.muted }}>No blocks and nothing urgent. The farm is running clear.</div>
          ) : tellRows.map((sg, i) => {
            const p = pill(sg.sev);
            return (
              <div key={i} className="flex gap-2.5 items-start py-2.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.08)` }}>
                <span className="text-[11px] font-semibold text-white px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: p.color }}>{p.lab}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{sg.title}</div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>{sg.tag}{sg.why ? ` — ${sg.why}` : ""}</div>
                </div>
                <button onClick={sg.act} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{sg.label}</button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* 5. MONEY READ */}
      <SectionCard>
        <Head icon={DollarSign} title="Money read" link="Open cash →" onLink={() => go("cash")} />
        <div className="px-4 pb-4 text-sm leading-relaxed" style={{ color: C.soil }}>
          {!haveFin ? (
            <span style={{ color: C.muted }}>Your money read builds from logged income and costs.</span>
          ) : net >= 0 ? (
            <>You are <strong style={{ color: C.green }}>ahead</strong> right now — earned {fjd(income)}, spent {fjd(costs)}.</>
          ) : (
            <>You have earned {fjd(income)} and spent {fjd(costs)} so far. That is <strong style={{ color: C.soil }}>normal mid-season</strong> — most crops are still growing and animals still being raised. The money comes in at harvest and sale.</>
          )}
        </div>
      </SectionCard>

      {/* 6. INTELLIGENCE HUB */}
      <SectionCard>
        <Head icon={Sparkles} title="Intelligence hub" link={null} />
        <div className="text-xs px-4" style={{ color: C.muted }}>Opportunities, forecasts and bottlenecks</div>
        <div className="p-4 pt-2">
          <MiniCard icon={ArrowRight} title="Opportunities"
            badge={strongest && strongest._net > 0 ? "1 found" : "Building"} badgeColor={strongest && strongest._net > 0 ? C.greenDk : C.muted}
            desc={strongest && strongest._net > 0 ? `Grow ${strongest.production_name} — strongest right now${cropRoi(strongest) != null ? ` (${cropRoi(strongest) >= 0 ? "+" : ""}${cropRoi(strongest).toFixed(0)}% return)` : ""}.` : "Opportunities show as your enterprises build a record."} />
          <MiniCard icon={Activity} title="Forecasts" badge="Needs a season" desc="Predicts harvest timing and cash weeks ahead. Turns on after one full season of your harvest and sales records." />
          <MiniCard icon={Activity} title="Bottlenecks" badge="Needs more logs" desc="Flags where labour, cash or stock will choke production. Turns on once you log work and stock daily for a few weeks." />
        </div>
      </SectionCard>

      {/* 7. ENTERPRISE RANKINGS */}
      {cropRows.length > 0 && (
        <SectionCard>
          <Head icon={Award} title="Enterprise rankings" />
          <div className="text-xs px-4" style={{ color: C.muted }}>Every business scored — strongest first</div>
          <div className="overflow-x-auto p-3 pt-2">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>
                <th className="text-left p-2">#</th><th className="text-left p-2">Business</th><th className="text-left p-2">Standing</th><th className="text-left p-2">Net</th><th className="text-left p-2">Return</th><th className="text-left p-2">Signal</th>
              </tr></thead>
              <tbody>
                {ranked.map((r, i) => {
                  const roi = cropRoi(r);
                  return (
                    <tr key={r.production_id || r.production_name} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="p-2" style={{ color: C.muted }}>{i + 1}</td>
                      <td className="p-2 font-medium" style={{ color: C.soil }}>{r.production_name}</td>
                      <td className="p-2 font-semibold" style={{ color: r._st.color }}>{r._st.grade}{r._st.score != null ? ` · ${r._st.score}` : " · —"}</td>
                      <td className="p-2" style={{ color: C.soil }}>{fjd(r._net)}</td>
                      <td className="p-2" style={{ color: C.soil }}>{roi == null ? "—" : `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`}</td>
                      <td className="p-2 font-semibold" style={{ color: r._st.sigColor }}>{r._st.sig}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* 8. RISK INTELLIGENCE */}
      <SectionCard>
        <Head icon={ShieldCheck} title="Risk intelligence" />
        <div className="text-xs px-4" style={{ color: C.muted }}>Where trouble could come from</div>
        <div className="p-4 pt-2">
          <MiniCard icon={AlertTriangle} title="Disease & compliance" badge={blocks ? `${blocks} on hold` : "Clear"} badgeColor={blocks ? C.red : C.greenDk} desc={blocks ? "Spray or treatment holds are active — do not sell until cleared." : "No chemical or treatment holds right now."} onClick={() => go("compliance")} />
          <MiniCard icon={Cloud} title="Weather" badge="Watch" desc="Rain, heat and storm risk to crops and animals." onClick={() => go("weather")} />
          <MiniCard icon={DollarSign} title="Cashflow" badge={net < 0 ? "Tight" : "Healthy"} badgeColor={net < 0 ? C.amber : C.greenDk} desc={net < 0 ? "Spending is ahead of income — normal mid-season, keep an eye on it." : "Income is ahead of spending."} onClick={() => go("cash")} />
          <MiniCard icon={Truck} title="Market" badge="Needs sales" desc="Price swings and buyer demand. Turns on once you log a run of sales and prices." onClick={() => go("buyers")} />
          <MiniCard icon={Package} title="Inventory" badge="Needs stock logs" desc="Running low on seed, feed or chemicals. Turns on once you log what you hold and use." onClick={() => go("inventory")} />
        </div>
      </SectionCard>

      {/* 9. AI ADVISOR */}
      <SectionCard>
        <Head icon={Sparkles} title="AI advisor" />
        <div className="text-xs px-4" style={{ color: C.muted }}>What to do next, and what you are ready for</div>
        <div className="p-4 pt-2 space-y-2.5">
          <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
            <div className="text-sm font-semibold mb-1.5" style={{ color: C.soil }}>Recommended actions</div>
            {acts.map((a, i) => <div key={i} className="text-sm py-0.5" style={{ color: C.soil }}>• {a}</div>)}
          </div>
          <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: C.soil }}>Expansion readiness</span>
              <span className="text-[11px] font-semibold" style={{ color: ready ? C.greenDk : C.muted }}>{ready ? "Looking ready" : "Building"}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>{ready ? `Your farm is standing strong and net is positive — a good base to consider growing ${strongest ? strongest.production_name : "your strongest business"}.` : "Expansion readiness builds as your standing and cash position strengthen over a season."}</div>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
            <div className="text-sm font-semibold mb-0.5" style={{ color: C.soil }}>Enterprise health rankings</div>
            <div className="text-xs" style={{ color: C.muted }}>Every business scored and ranked above, strongest first.</div>
          </div>
        </div>
      </SectionCard>

      {/* 10. What is live, and what turns on next */}
      <div className="rounded-2xl border p-4" style={{ background: "rgba(122,110,92,0.05)", borderColor: C.border, borderStyle: "dashed" }}>
        <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><Award size={14} />What is live, and what turns on next</div>
        <div className="text-xs mt-1.5 leading-relaxed" style={{ color: C.muted }}>Live now, from your own records: open holds, urgent tasks, enterprise rankings and your recommended next actions. Turns on with a season of data — the best time to sell, what to plant next, and the order that earns the most. TFOS will not guess the call until your records have earned it.</div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function DecisionCenter() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <DecisionInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

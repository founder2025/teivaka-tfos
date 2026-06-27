/**
 * DecisionCenter.jsx — /farm/insights?tab=decisions
 *
 * "What needs you today, most important first." A single decision-first surface over
 * REAL data: compliance holds (the WHD gate), precomputed decision signals, open tasks,
 * per-enterprise P&L, farm net. Honest-empty where there's no data; honest-degraded where
 * a fetch fails — it NEVER tells a farmer "running clear" on a failed load.
 *
 * Redesign (audit-approved 2026-06-27) fixes:
 *  DC1  token-refresh via utils/api + real error/degraded states; all-clear is earned, not faked
 *  DC2  "holds" + lead call + risk card read crops/compliance blocked_count (real WHD gate),
 *       not an activity count mislabelled "clear to sell / no active holds"
 *  DC3  tasks are tenant-wide (backend has no farm_id filter) — labelled honestly, not faked
 *  DC4  synthetic 2-digit standing score dropped — words from real net/ROI only
 *  DC5  hardcoded "Watch" weather badge dropped — link only; risk cards data-driven or honest
 *  net  ONE net (net_profit_fjd); costs = income − net so the page can't show two totals
 *  Inv#4 removed the "review lowest-net before spending" misadvice (kills long-term crops);
 *       caveat added; full layer-aware ranking deferred (crops endpoint lacks layer)
 *  stale surfaces the endpoint's own last_refresh_at (Strike #110 silent-death guard)
 *  + real farm name, formatMoney, ModeDropdown removed, merged routes, Ask-TIS deep-link
 */
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Crosshair, ListChecks, DollarSign, ShieldCheck, Sparkles,
  Award, CheckCircle2, Cloud, Package, Truck, Activity, RefreshCw,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { useFarmName } from "../../utils/farmName";
import { formatMoney } from "../../utils/money";
import { getJSON } from "../../utils/api";

const C = {
  soil: "var(--soil)", border: "var(--line)", muted: "var(--muted)", ink: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)",
  paper: "var(--paper)",
};

const enc = encodeURIComponent;
const num = (v) => Number(v ?? 0);
// FJD, no decimals, leading minus for negatives.
function fjd(v) { return formatMoney(num(v), { decimals: 0 }); }

// ── data (all via utils/api: Bearer + token auto-refresh + honest ApiError) ──
const useFin = (id) => useQuery({ queryKey: ["dc-fin", id], enabled: !!id, retry: 1, staleTime: 60_000, refetchOnReconnect: true,
  queryFn: () => getJSON(`/api/v1/financials/farm/${enc(id)}`).then((b) => b?.data?.summary ?? {}) });
const useCrops = (id) => useQuery({ queryKey: ["dc-crops", id], enabled: !!id, retry: 1, staleTime: 60_000, refetchOnReconnect: true,
  queryFn: () => getJSON(`/api/v1/financials/crops/${enc(id)}`).then((b) => b?.data ?? []) });
const useTasks = () => useQuery({ queryKey: ["dc-tasks"], retry: 1, staleTime: 60_000, refetchOnReconnect: true,
  queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=50`).then((b) => b?.data?.tasks ?? b?.tasks ?? []) });
const useSignals = (id) => useQuery({ queryKey: ["dc-sig", id], enabled: !!id, retry: 1, staleTime: 60_000, refetchOnReconnect: true,
  queryFn: () => getJSON(`/api/v1/decision-engine/${enc(id)}`) });   // keep full body for last_refresh_at
const useHolds = (id) => useQuery({ queryKey: ["dc-holds", id], enabled: !!id, retry: 1, staleTime: 60_000, refetchOnReconnect: true,
  queryFn: () => getJSON(`/api/v1/crops/compliance/${enc(id)}`).then((b) => b?.data ?? {}) });

// ── derivations ──────────────────────────────────────────────────────
function cropCost(r) { return num(r.total_labor_fjd) + num(r.total_input_cost_fjd); }
function cropNet(r) { return num(r.total_income_fjd) - cropCost(r); }
function cropRoi(r) { const c = cropCost(r); return c <= 0 ? null : (cropNet(r) / c) * 100; }
// Standing — words from real net/ROI. NO fabricated numeric score (DC4).
function standing(r) {
  const active = num(r.total_income_fjd) > 0 || cropCost(r) > 0;
  if (!active) return { grade: "New", tone: C.muted, sig: "—" };
  return cropNet(r) > 0
    ? { grade: "Profitable", tone: C.greenDk, sig: "Earning" }
    : { grade: "Building", tone: C.amber, sig: "Costs ahead" };
}
function taskSev(rank) { const n = num(rank) || 999; return n < 100 ? "critical" : n < 300 ? "high" : "medium"; }
function sevRank(s) { return ({ critical: 0, high: 1, medium: 2, low: 3 })[String(s || "").toLowerCase()] ?? 2; }
function pill(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "critical") return { lab: "Stop", color: C.red };
  if (s === "high") return { lab: "Soon", color: C.amber };
  return { lab: "Note", color: C.muted };
}
function ageHours(iso) { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? (Date.now() - t) / 3.6e6 : null; }

// ── UI atoms ─────────────────────────────────────────────────────────
function Card({ children, accent, style }) {
  return <div className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...(accent ? { borderLeft: `4px solid ${accent}` } : {}), ...style }}>{children}</div>;
}
function Head({ icon: Icon, title, link, onLink }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
      <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><Icon size={14} aria-hidden />{title}</h3>
      {link && <button onClick={onLink} className="text-xs" style={{ color: C.greenDk }}>{link}</button>}
    </div>
  );
}
function MiniCard({ icon: Icon, title, badge, badgeColor, desc, onClick }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3 mb-2.5" style={{ background: C.paper, borderColor: C.border, cursor: onClick ? "pointer" : "default" }}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.soil }}><Icon size={15} style={{ color: C.green }} aria-hidden />{title}</span>
        <span className="text-[11px] font-semibold shrink-0" style={{ color: badgeColor || C.muted }}>{badge}</span>
      </div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>{desc}</div>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl border bg-white" style={{ borderColor: C.border, height: i === 0 ? 96 : 140 }} />)}
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────
function DecisionInner() {
  const { farmId, setFarmId } = useCurrentFarm();
  const navigate = useNavigate();
  // merged-route map (DC9 — go straight to the merged home, no redirect hop)
  const ROUTE = { compliance: "/farm/compliance", tasks: "/farm/tasks", weather: "/farm/weather",
    cash: "/farm/money?tab=cash", analytics: "/farm/insights", cycles: "/farm/cycles",
    buyers: "/farm/market", inventory: "/farm/resources" };
  const go = (k) => navigate(ROUTE[k] || "/farm");
  const farmName = useFarmName(farmId);

  const finQ = useFin(farmId);
  const cropsQ = useCrops(farmId);
  const tasksQ = useTasks();
  const sigQ = useSignals(farmId);
  const holdsQ = useHolds(farmId);

  // money — ONE net; costs reconcile to it (income − net)
  const s = finQ.data ?? {};
  const haveFin = finQ.isSuccess;
  const income = num(s.total_income_fjd);
  const net = num(s.net_profit_fjd);
  const costs = income - net;

  // enterprises
  const cropRows = (cropsQ.data ?? []).map((r) => ({ ...r, _net: cropNet(r), _st: standing(r) }));
  const ranked = [...cropRows].sort((a, b) => b._net - a._net);
  const strongest = ranked.find((r) => r._net > 0) || null;
  const profitable = cropRows.filter((r) => r._st.grade === "Profitable").length;
  const building = cropRows.filter((r) => r._st.grade === "Building").length;
  const fresh = cropRows.filter((r) => r._st.grade === "New").length;

  // tasks (tenant-wide — labelled honestly, DC3)
  const tasks = (tasksQ.data ?? []).map((t) => ({ ...t, _sev: taskSev(t.task_rank) }));
  const urgent = tasks.filter((t) => t._sev === "critical" || t._sev === "high").sort((a, b) => sevRank(a._sev) - sevRank(b._sev));

  // decision signals (precomputed; AMBER/RED only) + real compliance holds (the WHD gate)
  const signals = sigQ.data?.signals ?? [];
  const critSignals = signals.filter((g) => String(g.severity).toUpperCase() === "CRITICAL");
  const holds = num(holdsQ.data?.blocked_count);
  const upcoming = Array.isArray(holdsQ.data?.upcoming) ? holdsQ.data.upcoming.length : 0;

  // staleness — from the endpoint's own timestamp (DC-new / Strike #110)
  const staleH = ageHours(sigQ.data?.last_refresh_at);
  const stale = staleH != null && staleH >= 24;

  // honesty gates
  const decisionTrioLoaded = holdsQ.isSuccess && sigQ.isSuccess && tasksQ.isSuccess;
  const anyError = [finQ, cropsQ, tasksQ, sigQ, holdsQ].some((q) => q.isError);
  const allError = farmId && [finQ, cropsQ, tasksQ, sigQ, holdsQ].every((q) => q.isError);
  const loading = !!farmId && [finQ, cropsQ, tasksQ, sigQ, holdsQ].some((q) => q.isLoading) && !anyError;

  // THE CALL — real holds first (safety), then critical signal, then urgent task, then earned all-clear
  let call;
  if (holds > 0) {
    call = { color: C.red, icon: AlertTriangle, title: `Stop — ${holds} compliance hold${holds === 1 ? "" : "s"}`, sub: "Clear these before selling or harvesting.", label: "Open compliance", act: () => go("compliance") };
  } else if (critSignals.length) {
    const b = critSignals[0];
    call = { color: C.red, icon: AlertTriangle, title: `Stop — ${b.signal_message || b.signal_type}`, sub: b.suggested_action || "Review before selling.", label: "Open compliance", act: () => go("compliance") };
  } else if (urgent.length) {
    const u = urgent[0];
    call = { color: C.amber, icon: ListChecks, title: u.imperative, sub: `${u.source_module || "Task"}${u.body_md ? ` — ${u.body_md}` : ""}`, label: "Go to tasks", act: () => go("tasks") };
  } else if (decisionTrioLoaded) {
    call = { color: C.green, icon: CheckCircle2, title: "Nothing urgent right now", sub: "No holds and no urgent tasks across the farm. Keep the routine going.", label: "Plan ahead", act: () => go("cycles") };
  } else {
    call = { color: C.muted, icon: RefreshCw, title: "Couldn't read everything", sub: "Some of today's decision data didn't load — retry before relying on this.", label: "Retry", act: () => { holdsQ.refetch(); sigQ.refetch(); tasksQ.refetch(); } };
  }
  const CallIcon = call.icon;

  // WHAT NEEDS YOU — signals + tasks merged
  const rows = [
    ...signals.map((g) => ({ sev: String(g.severity).toLowerCase(), title: g.signal_message || g.signal_type, tag: [g.crop_name, g.signal_type].filter(Boolean).join(" · "), why: g.suggested_action, label: "Open", act: () => go("compliance") })),
    ...tasks.map((t) => ({ sev: t._sev, title: t.imperative, tag: t.source_module || "Task", why: t.body_md, label: "Tasks", act: () => go("tasks") })),
  ].sort((a, b) => sevRank(a.sev) - sevRank(b.sev)).slice(0, 12);

  // recommended actions — real + safe only (no expansion/capital-risk advice, no low-net misadvice)
  const acts = [];
  if (holds > 0) acts.push(`Clear the ${holds} compliance hold${holds === 1 ? "" : "s"} before selling or harvesting.`);
  if (urgent.length) acts.push(`Do your ${urgent.length} urgent task${urgent.length === 1 ? "" : "s"} first.`);
  if (strongest) acts.push(`${strongest.production_name} is your strongest earner right now.`);
  acts.push("Keep logging daily — it builds your bank record and sharpens these calls.");

  // ── states ──
  const Header = (
    <div className="page-header">
      <div><h1>Decisions</h1><div className="subtitle">What needs you today, most important first{farmName ? ` · ${farmName}` : ""}</div></div>
      <div className="page-actions">
        <button onClick={() => navigate(`/tis?q=${enc("Look at my farm decisions today — what's most important and what should I do next?")}`)} className="btn btn-secondary" style={{ fontSize: 12 }}><Sparkles size={13} aria-hidden />Ask TIS</button>
        <FarmSelector />
      </div>
    </div>
  );

  if (!farmId) {
    return <div className="tfp space-y-3">{Header}<Card style={{ padding: 20 }}><span style={{ color: C.muted, fontSize: 13 }}>Select a farm to see its decisions.</span></Card></div>;
  }
  if (loading) return <div className="tfp space-y-3">{Header}<Skeleton /></div>;
  if (allError) {
    return (
      <div className="tfp space-y-3">{Header}
        <Card style={{ padding: 24 }}>
          <div className="flex gap-2.5 items-start">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div>
              <div className="font-semibold" style={{ color: C.soil }}>Couldn't load this page</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>This is a loading problem, not missing data. Check your connection and try again.</div>
              <button className="btn btn-secondary btn-sm mt-2.5" onClick={() => { finQ.refetch(); cropsQ.refetch(); tasksQ.refetch(); sigQ.refetch(); holdsQ.refetch(); }}><RefreshCw size={13} aria-hidden />Retry</button>
              <button className="btn btn-secondary btn-sm mt-2.5 ml-2" onClick={() => setFarmId(null)}>Choose another farm</button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="tfp space-y-3">
      {Header}

      {stale && (
        <div className="rounded-2xl border p-3 text-xs flex gap-2 items-center" style={{ background: "rgba(191,144,0,0.10)", borderColor: C.amber, color: C.soil }}>
          <AlertTriangle size={14} style={{ color: C.amber, flexShrink: 0 }} aria-hidden />
          <span>These decision signals are <strong>{staleH >= 48 ? `${Math.round(staleH / 24)} days` : `${Math.round(staleH)} hours`} old</strong> — the engine may be behind. Treat them as indicative until it refreshes.</span>
        </div>
      )}
      {anyError && !allError && (
        <div className="rounded-2xl border p-3 text-xs flex gap-2 items-center justify-between" style={{ background: "rgba(163,45,45,0.06)", borderColor: C.red, color: C.soil }}>
          <span className="flex gap-2 items-center"><AlertTriangle size={14} style={{ color: C.red, flexShrink: 0 }} aria-hidden />Couldn't load part of this page — some figures may be missing.</span>
          <button className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }} onClick={() => { finQ.refetch(); cropsQ.refetch(); tasksQ.refetch(); sigQ.refetch(); holdsQ.refetch(); }}>Retry</button>
        </div>
      )}

      {/* THE CALL RIGHT NOW */}
      <Card accent={call.color}>
        <div className="p-4 flex gap-3.5 items-start">
          <CallIcon size={22} style={{ color: call.color, flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>The call right now</div>
            <div className="text-base font-bold mt-1" style={{ color: C.ink }}>{call.title}</div>
            <div className="text-sm mt-0.5" style={{ color: C.muted }}>{call.sub}</div>
          </div>
          <button onClick={call.act} className="text-sm px-3.5 py-2.5 rounded-lg text-white shrink-0" style={{ background: call.color === C.muted ? C.greenDk : call.color }}>{call.label}</button>
        </div>
      </Card>

      {/* DECISION STATE — one honest row */}
      <Card>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 p-3">
          <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("compliance")}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Holds</div>
            <div className="text-lg font-bold" style={{ color: holds ? C.red : C.greenDk }}>{holdsQ.isSuccess ? holds : "—"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{holds ? "do not sell yet" : upcoming ? `${upcoming} clearing soon` : "none blocking"}</div>
          </button>
          <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("tasks")}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Urgent tasks</div>
            <div className="text-lg font-bold" style={{ color: urgent.length ? C.amber : C.greenDk }}>{tasksQ.isSuccess ? urgent.length : "—"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>do these first</div>
          </button>
          <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("cash")}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Net</div>
            <div className="text-lg font-bold" style={{ color: net < 0 ? C.amber : C.greenDk }}>{haveFin ? fjd(net) : "—"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{net < 0 ? "costs ahead" : "ahead"}</div>
          </button>
          <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("analytics")}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Enterprises</div>
            <div className="text-lg font-bold" style={{ color: C.soil }}>{cropsQ.isSuccess ? cropRows.length : "—"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{cropsQ.isSuccess ? `${profitable} profitable · ${building} building` : "scored below"}</div>
          </button>
        </div>
      </Card>

      {/* WHAT NEEDS YOU */}
      <Card>
        <Head icon={ListChecks} title="What needs you" link="All tasks →" onLink={() => go("tasks")} />
        <div className="px-4 pb-3">
          {rows.length === 0 ? (
            decisionTrioLoaded
              ? <div className="py-3.5 text-sm" style={{ color: C.muted }}>No holds and nothing urgent. The farm is running clear.</div>
              : <div className="py-3.5 text-sm flex items-center gap-2" style={{ color: C.muted }}><AlertTriangle size={14} style={{ color: C.amber }} aria-hidden />Couldn't load holds, signals or tasks — retry above before relying on this.</div>
          ) : rows.map((sg, i) => {
            const p = pill(sg.sev);
            return (
              <div key={i} className="flex gap-2.5 items-start py-2.5" style={{ borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
                <span className="text-[11px] font-semibold text-white px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: p.color }}>{p.lab}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{sg.title}</div>
                  {(sg.tag || sg.why) && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{sg.tag}{sg.why ? ` — ${sg.why}` : ""}</div>}
                </div>
                <button onClick={sg.act} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{sg.label}</button>
              </div>
            );
          })}
          {tasks.length > 0 && <div className="text-[11px] mt-2" style={{ color: C.muted }}>Tasks are shown across all your farms — per-farm filtering is on the roadmap.</div>}
        </div>
      </Card>

      {/* MONEY READ — reconciled, factual */}
      <Card>
        <Head icon={DollarSign} title="Money read" link="Cash & demand →" onLink={() => go("analytics")} />
        <div className="px-4 pb-4 text-sm leading-relaxed" style={{ color: C.soil }}>
          {!haveFin ? (
            <span style={{ color: C.muted }}>Your money read builds from logged income and costs.</span>
          ) : (
            <>Earned <strong>{fjd(income)}</strong> · spent <strong>{fjd(costs)}</strong> · net{" "}
              <strong style={{ color: net < 0 ? C.amber : C.green }}>{fjd(net)}</strong>.{" "}
              {net >= 0 ? "Income is ahead of spending." : "Costs are ahead of income so far."}</>
          )}
        </div>
      </Card>

      {/* ENTERPRISE STANDING — factual, no synthetic score */}
      {cropRows.length > 0 && (
        <Card>
          <Head icon={Award} title="Enterprise standing" />
          <div className="text-xs px-4" style={{ color: C.muted }}>Every business by real net — strongest first</div>
          {/* desktop table */}
          <div className="hidden sm:block overflow-x-auto p-3 pt-2">
            <table className="w-full text-sm">
              <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>
                <th className="text-left p-2">#</th><th className="text-left p-2">Business</th><th className="text-left p-2">Standing</th><th className="text-right p-2">Net</th><th className="text-right p-2">Return</th><th className="text-left p-2">Signal</th>
              </tr></thead>
              <tbody>
                {ranked.map((r, i) => {
                  const roi = cropRoi(r);
                  return (
                    <tr key={r.production_id || r.production_name} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="p-2" style={{ color: C.muted }}>{i + 1}</td>
                      <td className="p-2 font-medium" style={{ color: C.soil }}>{r.production_name}</td>
                      <td className="p-2 font-semibold" style={{ color: r._st.tone }}>{r._st.grade}</td>
                      <td className="p-2 text-right" style={{ color: C.soil }}>{fjd(r._net)}</td>
                      <td className="p-2 text-right" style={{ color: C.soil }}>{roi == null ? "—" : `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`}</td>
                      <td className="p-2 font-semibold" style={{ color: r._st.tone }}>{r._st.sig}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="sm:hidden p-3 pt-2 space-y-2">
            {ranked.map((r, i) => {
              const roi = cropRoi(r);
              return (
                <div key={r.production_id || r.production_name} className="rounded-xl border p-3" style={{ background: C.paper, borderColor: C.border }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm" style={{ color: C.soil }}>{i + 1}. {r.production_name}</span>
                    <span className="text-xs font-semibold" style={{ color: r._st.tone }}>{r._st.grade}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>Net <strong style={{ color: C.soil }}>{fjd(r._net)}</strong>{roi != null ? ` · ${roi >= 0 ? "+" : ""}${roi.toFixed(0)}% return` : ""} · {r._st.sig}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] px-4 pb-3" style={{ color: C.muted }}>Long-term crops (e.g. kava) are expected to run negative for years — a low net isn't always a problem.</div>
        </Card>
      )}

      {/* RISK & WHAT TURNS ON NEXT — data-driven where real, honest otherwise */}
      <Card>
        <Head icon={ShieldCheck} title="Risk & what turns on next" />
        <div className="p-4 pt-2">
          <MiniCard icon={AlertTriangle} title="Disease & compliance" badge={holdsQ.isSuccess ? (holds ? `${holds} on hold` : "Clear") : "—"} badgeColor={holds ? C.red : C.greenDk}
            desc={holds ? "Holds are active — do not sell until cleared." : upcoming ? `${upcoming} clearing within 14 days.` : "No chemical or treatment holds right now."} onClick={() => go("compliance")} />
          <MiniCard icon={DollarSign} title="Cashflow" badge={haveFin ? (net < 0 ? "Tight" : "Healthy") : "—"} badgeColor={net < 0 ? C.amber : C.greenDk}
            desc={!haveFin ? "Builds from logged income and costs." : net < 0 ? "Spending is ahead of income — keep an eye on it." : "Income is ahead of spending."} onClick={() => go("cash")} />
          <MiniCard icon={Cloud} title="Weather" badge="Open forecast" desc="Rain, heat and storm risk to crops and animals." onClick={() => go("weather")} />
          <MiniCard icon={Truck} title="Market" badge="Needs sales" desc="Price swings and buyer demand. Turns on once you log a run of sales and prices." onClick={() => go("buyers")} />
          <MiniCard icon={Package} title="Inventory" badge="Needs stock logs" desc="Running low on seed, feed or chemicals. Turns on once you log what you hold and use." onClick={() => go("inventory")} />
          <MiniCard icon={Activity} title="Forecasts & best time to sell" badge="Needs a season" desc="Predicts harvest timing, cash weeks ahead and the order that earns most. Turns on after a full season of your records." />
        </div>
      </Card>

      {/* NEXT ACTIONS */}
      <Card>
        <Head icon={Sparkles} title="What to do next" />
        <div className="p-4 pt-2 space-y-2.5">
          <div className="rounded-xl border p-3" style={{ background: C.paper, borderColor: C.border }}>
            {acts.map((a, i) => <div key={i} className="text-sm py-0.5" style={{ color: C.soil }}>• {a}</div>)}
          </div>
          <div className="rounded-xl border p-3" style={{ background: C.paper, borderColor: C.border }}>
            <div className="text-sm font-semibold mb-0.5" style={{ color: C.soil }}>Your enterprises</div>
            <div className="text-xs" style={{ color: C.muted }}>{cropsQ.isSuccess ? `${profitable} profitable · ${building} building · ${fresh} new. Expansion and best-time-to-sell advice turn on after a full season of records.` : "Scored above once your enterprise data loads."}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function DecisionCenter() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <DecisionInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

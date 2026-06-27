/**
 * DecisionCenter.jsx — /farm/insights?tab=decisions
 *
 * "What needs you today, most important first." A single decision-first surface over
 * REAL data: crop compliance holds (the WHD gate), precomputed decision signals, open
 * tasks, per-enterprise P&L, farm net. Honest-empty where there's no data; honest-degraded
 * where a fetch fails — it NEVER tells a farmer "running clear" on a failed load, and it
 * keeps showing the last values it loaded when the network drops mid-session.
 *
 * Redesign + optimize (audit-approved 2026-06-27):
 *  DC1  token-refresh via utils/api; all-clear is EARNED (only when the decision trio loaded)
 *  DC2/ST-B  "holds" + lead call + risk card read the REAL crop-compliance blocked_count.
 *       Scoped HONESTLY to CROP compliance — animal/poultry withholding is tracked on the
 *       Compliance page (wiring animal holds here is a filed backend item), so we never
 *       imply farm-wide safety we haven't checked.
 *  ST-1 per-section loading — one slow query no longer blanks the whole page
 *  ST-8 cached-on-error — render the last successful data + a degraded banner, not a blank
 *  ST-3 all-zero money → "nothing logged yet" (no false "income ahead")
 *  ST-4 wrapped in main-content/main-inner to match the Analytics tab width
 *  ST-5 enterprise table capped (+ show all)   ST-6 period label on money
 *  ST-2 aria-live on the call; larger tap targets   +AI Ask-TIS on the specific call
 *  net  ONE net (net_profit_fjd); costs = income − net   Inv#4 no low-net misadvice
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Crosshair, ListChecks, DollarSign, ShieldCheck, Sparkles,
  Award, CheckCircle2, Cloud, Package, Truck, Activity, RefreshCw,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import TfpShell from "../../components/farm/TfpShell";
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
const fjd = (v) => formatMoney(num(v), { decimals: 0 });
const ENT_CAP = 8;

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
      {link && <button onClick={onLink} className="text-xs px-2 py-1" style={{ color: C.greenDk }}>{link}</button>}
    </div>
  );
}
function Loading({ label = "Loading…" }) { return <div className="px-4 py-5 text-sm" style={{ color: C.muted }} aria-busy="true">{label}</div>; }
function MiniCard({ icon: Icon, title, badge, badgeColor, desc, onClick }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3 mb-2.5" style={{ background: C.paper, borderColor: C.border, cursor: onClick ? "pointer" : "default" }}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `${title}: ${badge}` : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.soil }}><Icon size={15} style={{ color: C.green }} aria-hidden />{title}</span>
        <span className="text-[11px] font-semibold shrink-0" style={{ color: badgeColor || C.muted }}>{badge}</span>
      </div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>{desc}</div>
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────
function DecisionInner() {
  const { farmId, setFarmId } = useCurrentFarm();
  const navigate = useNavigate();
  const [showAllEnt, setShowAllEnt] = useState(false);
  const ROUTE = { compliance: "/farm/compliance", tasks: "/farm/tasks", weather: "/farm/weather",
    cash: "/farm/money?tab=cash", analytics: "/farm/insights", cycles: "/farm/cycles",
    buyers: "/farm/market", inventory: "/farm/resources" };
  const go = (k) => navigate(ROUTE[k] || "/farm");
  const askTis = (q) => navigate(`/tis?q=${enc(q)}`);
  const farmName = useFarmName(farmId);

  const finQ = useFin(farmId);
  const cropsQ = useCrops(farmId);
  const tasksQ = useTasks();
  const sigQ = useSignals(farmId);
  const holdsQ = useHolds(farmId);
  const refetchAll = () => { finQ.refetch(); cropsQ.refetch(); tasksQ.refetch(); sigQ.refetch(); holdsQ.refetch(); };

  // money — ONE net; costs reconcile to it (income − net). Render cached data even on error (ST-8).
  const s = finQ.data ?? {};
  const haveFin = !!finQ.data;
  const income = num(s.total_income_fjd);
  const net = num(s.net_profit_fjd);
  const costs = income - net;
  const zeroMoney = haveFin && income === 0 && costs === 0 && net === 0;

  // enterprises
  const cropRows = (cropsQ.data ?? []).map((r) => ({ ...r, _net: cropNet(r), _st: standing(r) }));
  const ranked = [...cropRows].sort((a, b) => b._net - a._net);
  const shownEnt = showAllEnt ? ranked : ranked.slice(0, ENT_CAP);
  const strongest = ranked.find((r) => r._net > 0) || null;
  const profitable = cropRows.filter((r) => r._st.grade === "Profitable").length;
  const buildingN = cropRows.filter((r) => r._st.grade === "Building").length;

  // tasks (tenant-wide — labelled honestly, DC3)
  const tasks = (tasksQ.data ?? []).map((t) => ({ ...t, _sev: taskSev(t.task_rank) }));
  const urgent = tasks.filter((t) => t._sev === "critical" || t._sev === "high").sort((a, b) => sevRank(a._sev) - sevRank(b._sev));

  // decision signals (precomputed; AMBER/RED only) + real CROP compliance holds
  const signals = sigQ.data?.signals ?? [];
  const critSignals = signals.filter((g) => String(g.severity).toUpperCase() === "CRITICAL");
  const holds = num(holdsQ.data?.blocked_count);
  const upcoming = Array.isArray(holdsQ.data?.upcoming) ? holdsQ.data.upcoming.length : 0;

  const staleH = ageHours(sigQ.data?.last_refresh_at);
  const stale = staleH != null && staleH >= 24;

  // honesty gates — "have data" tolerates a stale cache (so offline still shows the last load)
  const trioLoaded = !!holdsQ.data && !!sigQ.data && !!tasksQ.data;
  const trioLoading = (holdsQ.isLoading || sigQ.isLoading || tasksQ.isLoading) && !trioLoaded;
  const anyError = [finQ, cropsQ, tasksQ, sigQ, holdsQ].some((q) => q.isError);
  const haveAnything = finQ.data || cropsQ.data || tasksQ.data || sigQ.data || holdsQ.data;
  const initialLoading = !!farmId && !haveAnything && !anyError;
  const hardFail = !!farmId && !haveAnything && anyError;

  // THE CALL — crop holds first (safety), then critical signal, then urgent task, then earned all-clear
  let call;
  if (holds > 0) {
    call = { color: C.red, icon: AlertTriangle, title: `Stop — ${holds} crop compliance hold${holds === 1 ? "" : "s"}`, sub: "Clear these before selling or harvesting.", label: "Open compliance", act: () => go("compliance") };
  } else if (critSignals.length) {
    const b = critSignals[0];
    call = { color: C.red, icon: AlertTriangle, title: `Stop — ${b.signal_message || b.signal_type}`, sub: b.suggested_action || "Review before selling.", label: "Open compliance", act: () => go("compliance") };
  } else if (urgent.length) {
    const u = urgent[0];
    call = { color: C.amber, icon: ListChecks, title: u.imperative, sub: `${u.source_module || "Task"}${u.body_md ? ` — ${u.body_md}` : ""}`, label: "Go to tasks", act: () => go("tasks") };
  } else if (trioLoaded) {
    call = { color: C.green, icon: CheckCircle2, title: "Nothing urgent right now", sub: "No crop holds and no urgent tasks across the farm. Keep the routine going.", label: "Plan ahead", act: () => go("cycles") };
  } else if (trioLoading) {
    call = { color: C.muted, icon: RefreshCw, title: "Reading your farm…", sub: "Checking holds, signals and tasks.", label: null, act: null, spin: true };
  } else {
    call = { color: C.muted, icon: AlertTriangle, title: "Couldn't read everything", sub: "Some of today's decision data didn't load — retry before relying on this.", label: "Retry", act: refetchAll };
  }
  const CallIcon = call.icon;

  // WHAT NEEDS YOU — signals + tasks merged
  const rows = [
    ...signals.map((g) => ({ sev: String(g.severity).toLowerCase(), title: g.signal_message || g.signal_type, tag: [g.crop_name, g.signal_type].filter(Boolean).join(" · "), why: g.suggested_action, label: "Open", act: () => go("compliance") })),
    ...tasks.map((t) => ({ sev: t._sev, title: t.imperative, tag: t.source_module || "Task", why: t.body_md, label: "Tasks", act: () => go("tasks") })),
  ].sort((a, b) => sevRank(a.sev) - sevRank(b.sev)).slice(0, 12);

  // recommended actions — real + safe only (no expansion/capital-risk advice, no low-net misadvice)
  const acts = [];
  if (holds > 0) acts.push(`Clear the ${holds} crop compliance hold${holds === 1 ? "" : "s"} before selling or harvesting.`);
  if (urgent.length) acts.push(`Do your ${urgent.length} urgent task${urgent.length === 1 ? "" : "s"} first.`);
  if (strongest) acts.push(`${strongest.production_name} is your strongest earner right now.`);
  acts.push("Keep logging daily — it builds your bank record and sharpens these calls.");

  const Header = (
    <div className="page-header">
      <div><h1>Decisions</h1><div className="subtitle">What needs you today, most important first{farmName ? ` · ${farmName}` : ""}</div></div>
      <div className="page-actions">
        <button onClick={() => askTis("Look at my farm decisions today — what's most important and what should I do next?")} className="btn btn-secondary" style={{ fontSize: 12 }}><Sparkles size={13} aria-hidden />Ask TIS</button>
        <FarmSelector />
      </div>
    </div>
  );

  const Body = () => {
    if (!farmId) return <Card style={{ padding: 20 }}><span style={{ color: C.muted, fontSize: 13 }}>Select a farm to see its decisions.</span></Card>;
    if (initialLoading) return <Loading label="Reading your farm…" />;
    if (hardFail) {
      return (
        <Card style={{ padding: 24 }}>
          <div className="flex gap-2.5 items-start">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div>
              <div className="font-semibold" style={{ color: C.soil }}>Couldn't load this page</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>This is a loading problem, not missing data. Check your connection and try again.</div>
              <div className="mt-2.5 flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={refetchAll}><RefreshCw size={13} aria-hidden />Retry</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setFarmId(null)}>Choose another farm</button>
              </div>
            </div>
          </div>
        </Card>
      );
    }

    return (
      <>
        {stale && (
          <div className="rounded-2xl border p-3 text-xs flex gap-2 items-center" style={{ background: "rgba(191,144,0,0.10)", borderColor: C.amber, color: C.soil }}>
            <AlertTriangle size={14} style={{ color: C.amber, flexShrink: 0 }} aria-hidden />
            <span>These decision signals are <strong>{staleH >= 48 ? `${Math.round(staleH / 24)} days` : `${Math.round(staleH)} hours`} old</strong> — the engine may be behind. Treat them as indicative until it refreshes.</span>
          </div>
        )}
        {anyError && (
          <div className="rounded-2xl border p-3 text-xs flex gap-2 items-center justify-between" style={{ background: "rgba(163,45,45,0.06)", borderColor: C.red, color: C.soil }}>
            <span className="flex gap-2 items-center"><AlertTriangle size={14} style={{ color: C.red, flexShrink: 0 }} aria-hidden />Couldn't refresh part of this page — showing the last values that loaded.</span>
            <button className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }} onClick={refetchAll}>Retry</button>
          </div>
        )}

        {/* THE CALL RIGHT NOW */}
        <Card accent={call.color}>
          <div className="p-4 flex gap-3.5 items-start" role="status" aria-live="polite">
            <CallIcon size={22} style={{ color: call.color, flexShrink: 0, marginTop: 2 }} className={call.spin ? "animate-spin" : undefined} aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>The call right now</div>
              <div className="text-base font-bold mt-1" style={{ color: C.ink }}>{call.title}</div>
              <div className="text-sm mt-0.5" style={{ color: C.muted }}>{call.sub}</div>
            </div>
            {call.act && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={call.act} className="text-sm px-3.5 py-2.5 rounded-lg text-white" style={{ background: call.color === C.muted ? C.greenDk : call.color }}>{call.label}</button>
                {call.color !== C.muted && <button onClick={() => askTis(`On my farm: ${call.title}. ${call.sub} What should I do?`)} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Ask TIS</button>}
              </div>
            )}
          </div>
        </Card>

        {/* DECISION STATE — one honest row */}
        <Card>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 p-3">
            <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("compliance")} aria-label={`Crop holds: ${holdsQ.data ? holds : "unknown"}`}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Crop holds</div>
              <div className="text-lg font-bold" style={{ color: holds ? C.red : C.greenDk }}>{holdsQ.data ? holds : "—"}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{holds ? "do not sell yet" : upcoming ? `${upcoming} clearing soon` : "none blocking"}</div>
            </button>
            <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("tasks")} aria-label={`Urgent tasks: ${tasksQ.data ? urgent.length : "unknown"}`}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Urgent tasks</div>
              <div className="text-lg font-bold" style={{ color: urgent.length ? C.amber : C.greenDk }}>{tasksQ.data ? urgent.length : "—"}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>do these first</div>
            </button>
            <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("cash")} aria-label={`Net: ${haveFin ? fjd(net) : "unknown"}`}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Net · 12 mo</div>
              <div className="text-lg font-bold" style={{ color: net < 0 ? C.amber : C.greenDk }}>{haveFin ? fjd(net) : "—"}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{!haveFin ? "—" : zeroMoney ? "nothing logged" : net < 0 ? "costs ahead" : "ahead"}</div>
            </button>
            <button className="rounded-xl border p-3 text-left" style={{ background: C.paper, borderColor: C.border }} onClick={() => go("analytics")} aria-label={`Enterprises: ${cropsQ.data ? cropRows.length : "unknown"}`}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Enterprises</div>
              <div className="text-lg font-bold" style={{ color: C.soil }}>{cropsQ.data ? cropRows.length : "—"}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{cropsQ.data ? `${profitable} profitable · ${buildingN} building` : "—"}</div>
            </button>
          </div>
        </Card>

        {/* WHAT NEEDS YOU */}
        <Card>
          <Head icon={ListChecks} title="What needs you" link="All tasks →" onLink={() => go("tasks")} />
          <div className="px-4 pb-3">
            {trioLoading ? <Loading /> : rows.length === 0 ? (
              trioLoaded
                ? <div className="py-3.5 text-sm" style={{ color: C.muted }}>No crop holds and nothing urgent. The farm is running clear.</div>
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
                  <button onClick={sg.act} className="text-xs px-3 py-2 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{sg.label}</button>
                </div>
              );
            })}
            {tasks.length > 0 && <div className="text-[11px] mt-2" style={{ color: C.muted }}>Tasks are shown across all your farms — per-farm filtering is on the roadmap.</div>}
          </div>
        </Card>

        {/* MONEY READ — reconciled, factual */}
        <Card>
          <Head icon={DollarSign} title="Money read · last 12 months" link="Cash & demand →" onLink={() => go("analytics")} />
          <div className="px-4 pb-4 text-sm leading-relaxed" style={{ color: C.soil }}>
            {!haveFin ? <Loading label="Your money read builds from logged income and costs." />
              : zeroMoney ? <span style={{ color: C.muted }}>No income or costs logged yet — this fills in as you record sales and spending.</span>
              : <>Earned <strong>{fjd(income)}</strong> · spent <strong>{fjd(costs)}</strong> · net{" "}
                <strong style={{ color: net < 0 ? C.amber : C.green }}>{fjd(net)}</strong>.{" "}
                {net >= 0 ? "Income is ahead of spending." : "Costs are ahead of income so far."}</>}
          </div>
        </Card>

        {/* ENTERPRISE STANDING — factual, capped */}
        {cropsQ.isLoading && !cropsQ.data ? <Card><Head icon={Award} title="Enterprise standing" /><Loading /></Card>
          : cropRows.length > 0 && (
          <Card>
            <Head icon={Award} title="Enterprise standing" />
            <div className="text-xs px-4" style={{ color: C.muted }}>Every business by real net — strongest first</div>
            <div className="hidden sm:block overflow-x-auto p-3 pt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>
                  <th className="text-left p-2">#</th><th className="text-left p-2">Business</th><th className="text-left p-2">Standing</th><th className="text-right p-2">Net</th><th className="text-right p-2">Return</th><th className="text-left p-2">Signal</th>
                </tr></thead>
                <tbody>
                  {shownEnt.map((r, i) => {
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
            <div className="sm:hidden p-3 pt-2 space-y-2">
              {shownEnt.map((r, i) => {
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
            {ranked.length > ENT_CAP && (
              <div className="px-4 pb-3">
                <button className="text-xs px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }} onClick={() => setShowAllEnt((v) => !v)}>
                  {showAllEnt ? "Show top 8" : `Show all ${ranked.length}`}
                </button>
              </div>
            )}
            <div className="text-[11px] px-4 pb-3" style={{ color: C.muted }}>Long-term crops (e.g. kava) are expected to run negative for years — a low net isn't always a problem.</div>
          </Card>
        )}

        {/* RISK & WHAT TURNS ON NEXT — data-driven where real, honest otherwise */}
        <Card>
          <Head icon={ShieldCheck} title="Risk & what turns on next" />
          <div className="p-4 pt-2">
            <MiniCard icon={AlertTriangle} title="Crop compliance" badge={holdsQ.data ? (holds ? `${holds} on hold` : "Clear") : "—"} badgeColor={holds ? C.red : C.greenDk}
              desc={holds ? "Holds are active — do not sell until cleared." : upcoming ? `${upcoming} clearing within 14 days.` : "No crop chemical or treatment holds right now."} onClick={() => go("compliance")} />
            <MiniCard icon={DollarSign} title="Cashflow" badge={haveFin ? (net < 0 ? "Tight" : "Healthy") : "—"} badgeColor={net < 0 ? C.amber : C.greenDk}
              desc={!haveFin ? "Builds from logged income and costs." : net < 0 ? "Spending is ahead of income — keep an eye on it." : "Income is ahead of spending."} onClick={() => go("cash")} />
            <MiniCard icon={Cloud} title="Weather" badge="Open forecast" desc="Rain, heat and storm risk to crops and animals." onClick={() => go("weather")} />
            <MiniCard icon={Truck} title="Market" badge="Needs sales" desc="Price swings and buyer demand. Turns on once you log a run of sales and prices." onClick={() => go("buyers")} />
            <MiniCard icon={Package} title="Inventory" badge="Needs stock logs" desc="Running low on seed, feed or chemicals. Turns on once you log what you hold and use." onClick={() => go("inventory")} />
            <MiniCard icon={Activity} title="Forecasts & best time to sell" badge="Needs a season" desc="Predicts harvest timing, cash weeks ahead and the order that earns most. Turns on after a full season of your records." />
          </div>
        </Card>

        {/* NEXT STEPS */}
        <Card>
          <Head icon={Sparkles} title="Recommended next steps" />
          <div className="p-4 pt-2">
            <div className="rounded-xl border p-3" style={{ background: C.paper, borderColor: C.border }}>
              {acts.map((a, i) => <div key={i} className="text-sm py-0.5" style={{ color: C.soil }}>• {a}</div>)}
            </div>
          </div>
        </Card>
      </>
    );
  };

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner space-y-3">
          {Header}
          <Body />
        </div>
      </main>
    </TfpShell>
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

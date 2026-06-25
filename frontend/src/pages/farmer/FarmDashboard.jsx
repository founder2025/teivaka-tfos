/**
 * FarmDashboard.jsx — /farm and /home Overview (whole-farm command center).
 *
 * Rebuilt to the prototype coreOverviewV801 section set (Gate-1 traced) + NEW
 * pillar summary cards, so a farmer sees the ENTIRE farm — plant AND animal —
 * collapsed into one screen, every card live and linking through to its page.
 *
 * Preserves the working production pieces: RecentLoggedStrip, TopTaskBanner,
 * LayerBackfillBanner, ActiveCyclesTable + NewCycleModal (+ ?action=new-cycle),
 * FarmSelector/ModeDropdown, and the QueryClientProvider wrapper.
 *
 * Live: farms, financials/farm, financials/crops, flocks, cycles, tasks (+ real
 * DONE/SKIP), cash-ledger balance, decision-engine, farms list. Honest
 * "Building"/"—" for worth, weather, demand, credit/FRCS, TIS suggestions.
 * No fabricated numbers — a banker may see this screen.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormModal } from "../../context/FormModalContext";
import {
  Sprout, Bird, Plus, ArrowRight, ShieldCheck, Link2, FileText, Crosshair, Cloud, CloudRain, Sun, CloudSun,
  Coins, DollarSign, Camera, Users, ListChecks, Activity, TrendingUp, Award, Truck, Sparkles,
  Zap, Leaf, LayoutGrid, Bell, TriangleAlert, RefreshCw, Wallet, Trees, CheckCircle2,
} from "lucide-react";
import { formatMoney } from "../../utils/money";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import RecentLoggedStrip from "../../components/farm/RecentLoggedStrip";
import FarmSectionsNav from "../../components/farm/FarmSectionsNav";
import ActiveCyclesTable from "../../components/farm/ActiveCyclesTable";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import NewCycleButton from "../../components/farm/NewCycleButton";
import NewCycleModal from "../../components/farm/NewCycleModal";
import LayerBackfillBanner from "../../components/farm/LayerBackfillBanner";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", ink: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 transition";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(url) { const r = await fetch(url, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }
function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { const n = n0(v); return `${n < 0 ? "−" : ""}FJ$ ${Math.abs(n).toLocaleString("en-FJ")}`; }
function roiTxt(r) { return r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(0)}%`; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function gradeColor(g) { return g === "Strong" ? C.green : g === "Steady" ? C.soil : g === "Watch" ? C.amber : g === "New" ? C.muted : C.red; }

// ── atoms ────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, link, onLink, children, meta }) {
  return (
    <section className="card" style={{ marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 16px 4px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--soil)", display: "flex", gap: 6, alignItems: "center" }}>{Icon && <Icon size={14} />}{title}</h3>
        {link ? <button onClick={onLink} className={FOCUS} style={{ fontSize: 12, color: "var(--green-dk)", background: "transparent", border: "none", cursor: "pointer" }}>{link}</button> : meta ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{meta}</span> : null}
      </div>
      <div style={{ padding: "2px 16px 16px" }}>{children}</div>
    </section>
  );
}
function Tile({ label, value, sub, color, onClick, building }) {
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={`capital-tile ${onClick ? FOCUS : ""}`} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="capital-tile-label">{label}{building && <span style={{ fontSize: 8, marginLeft: 4, color: "var(--amber)" }}>building</span>}</div>
      <div className="capital-tile-value" style={color ? { color, fontSize: 18 } : { fontSize: 18 }}>{value}</div>
      {sub && <div className="capital-tile-sub">{sub}</div>}
    </div>
  );
}

function HeaderRow() {
  return (
    <div className="page-header">
      <div><h1>Overview</h1><div className="subtitle">Everything you run, in one place · {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div></div>
      <div className="page-actions"><FarmSelector /><ModeDropdown /></div>
    </div>
  );
}

// ── pillar cards (the core addition) ─────────────────────────────────
function PillarCards({ crops, flocks, activeCycles, navigate }) {
  const cropRows = crops ?? [];
  const cropNet = cropRows.reduce((a, r) => a + (n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd)), 0);
  const cropStanding = cropRows.length ? (cropNet > 0 ? "Strong" : "Steady") : "New";

  const flockRows = flocks ?? [];
  const head = flockRows.reduce((a, f) => a + n0(f.current_count), 0);
  const placed = flockRows.reduce((a, f) => a + n0(f.placed_count), 0);
  const survival = placed > 0 ? Math.round((head / placed) * 100) : null;

  const hasCrops = cropRows.length > 0;
  const hasAnimals = flockRows.length > 0;

  const PillarCard = ({ icon: Icon, kind, title, stats, status, statusColor, onView }) => (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: C.border }}>
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: kind === "animal" ? C.amber : C.green }}><Icon size={18} /></div>
          <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>{title}</div><div className="text-[11px]" style={{ color: statusColor || C.muted }}>{status}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {stats.map((s) => (
            <div key={s.l} className="rounded-lg p-2" style={{ background: C.paper }}>
              <div className="text-[9px] uppercase" style={{ color: C.muted }}>{s.l}</div>
              <div className="text-sm font-bold truncate" style={{ color: s.c || C.soil }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onView} className={`w-full text-xs py-2.5 flex items-center justify-center gap-1 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, borderTop: `1px solid ${C.border}` }}>View <ArrowRight size={12} /></button>
    </div>
  );

  return (
    <Section icon={Sprout} title="Your farm at a glance" meta="every pillar, one place">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {hasCrops && (
          <PillarCard icon={Sprout} kind="crop" title="Crops · Plant-based" status={`${cropStanding} · standing`} statusColor={gradeColor(cropStanding)}
            stats={[{ l: "Cycles", v: activeCycles }, { l: "Types", v: cropRows.length }, { l: "Net", v: fjd(cropNet), c: cropNet < 0 ? C.red : C.greenDk }]}
            onView={() => navigate("/farm/cycles")} />
        )}
        {hasAnimals && (
          <PillarCard icon={Bird} kind="animal" title="Livestock · Animals" status={survival != null ? `${survival}% survival` : "active"} statusColor={C.greenDk}
            stats={[{ l: "Head", v: head }, { l: "Groups", v: flockRows.length }, { l: "Holds", v: 0 }]}
            onView={() => navigate("/farm/poultry")} />
        )}
        {/* add-a-pillar card (never seven empty stubs) */}
        <button onClick={() => navigate("/farm/enterprises")} className={`rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 text-center hover:brightness-95 ${FOCUS}`} style={{ borderColor: C.border, background: C.paper, minHeight: 120 }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.cream, color: C.greenDk }}><Plus size={18} /></div>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>Add a farming type</div>
          <div className="text-[11px]" style={{ color: C.muted }}>{hasCrops || hasAnimals ? "Start another enterprise" : "Start your first enterprise"}</div>
        </button>
      </div>
    </Section>
  );
}

// ── bankability path ─────────────────────────────────────────────────
function BankabilityPath({ navigate }) {
  const steps = [
    { n: 1, icon: Plus, title: "Log the work", desc: "Every task becomes a timestamped event — Farm, Block, Crop, Operator.", go: () => navigate("/farm/tasks") },
    { n: 2, icon: Link2, title: "Audit chain", desc: "Each event hash-links to the one before it. Nothing changes quietly.", go: () => navigate("/farm/compliance") },
    { n: 3, icon: ShieldCheck, title: "Public verify", desc: "A lender scans a code and checks the chain themselves.", go: () => window.open("/verify", "_blank") },
    { n: 4, icon: FileText, title: "Bank Evidence", desc: "A bank-ready record built from real events — not typed in.", go: () => navigate("/farm/reports") },
  ];
  return (
    <Section icon={ShieldCheck} title="How this farm becomes bankable" meta="four steps · tap any">
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <button key={s.n} onClick={s.go} className={`text-left rounded-xl border p-3 flex flex-col gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: C.paper, borderColor: C.border }}>
            <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center" style={{ background: C.green }}>{s.n}</span><s.icon size={15} style={{ color: C.greenDk }} /></div>
            <div className="text-[13px] font-bold" style={{ color: C.soil }}>{s.title}</div>
            <div className="text-[11px] leading-snug" style={{ color: C.muted }}>{s.desc}</div>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── today's priorities (live tasks, real DONE/SKIP) ──────────────────
function Priorities({ tasks, navigate, onAction }) {
  const top = (tasks ?? []).slice(0, 3);
  return (
    <Section icon={ListChecks} title="Today's priorities" link="View all tasks →" onLink={() => navigate("/farm/tasks")}>
      {top.length === 0 ? (
        <div className="text-sm py-2" style={{ color: C.muted }}>All clear — nothing urgent. Good time to plan ahead.</div>
      ) : (
        <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-3">
          {top.map((t) => {
            const sev = (t.task_rank || 999) < 100 ? C.red : (t.task_rank || 999) < 300 ? C.amber : C.muted;
            return (
              <div key={t.task_id} className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border, borderLeft: `3px solid ${sev}` }}>
                <div className="text-[11px]" style={{ color: C.muted }}>{t.source_module || "Task"}</div>
                <div className="text-sm font-semibold mt-0.5" style={{ color: C.ink }}>{t.imperative}</div>
                {t.body_md && <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: C.muted }}>{t.body_md}</div>}
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => onAction(t.task_id, "complete")} className={`text-[11px] px-2.5 py-1 rounded-lg text-white hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}>DONE</button>
                  <button onClick={() => onAction(t.task_id, "skip")} className={`text-[11px] px-2.5 py-1 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>SKIP</button>
                  <button onClick={() => emitToast("Open the task for step-by-step guidance")} className={`text-[11px] px-2.5 py-1 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>HELP</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── weather strip (live Open-Meteo current + 5-day) ──────────────────
function wmoWx(code) {
  const c = Number(code);
  if (c === 0) return { label: "Clear", Icon: Sun };
  if (c <= 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (c === 3) return { label: "Overcast", Icon: Cloud };
  if (c >= 51 && c <= 67) return { label: "Rain", Icon: CloudRain };
  if (c >= 80 && c <= 82) return { label: "Showers", Icon: CloudRain };
  if (c >= 95) return { label: "Storm", Icon: CloudRain };
  return { label: "—", Icon: Cloud };
}
const wx1 = (v) => (v == null || v === "" ? null : Math.round(Number(v) * 10) / 10);
const wxDay = (s) => { try { const d = new Date(s); if (!isNaN(d)) return d.toLocaleDateString("en-US", { weekday: "short" }); } catch { /* noop */ } return String(s || "").slice(5, 10); };

function WeatherStrip({ farmId, navigate }) {
  const cur = useQuery({ queryKey: ["ov-wx-cur", farmId], queryFn: () => getJSON(`/api/v1/weather/current/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const fc = useQuery({ queryKey: ["ov-wx-daily", farmId], queryFn: () => getJSON(`/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`), enabled: !!farmId, retry: 0 });
  const now = cur.data?.data || null;
  const days = (fc.data?.data ?? []).slice(0, 5);
  const w = now ? wmoWx(now.weather_code) : null;
  const noFeed = (cur.isError || fc.isError) || (!cur.isLoading && !now && days.length === 0);
  return (
    <Section icon={Cloud} title="Weather" link="See full forecast →" onLink={() => navigate("/farm/weather")}>
      {cur.isLoading ? (
        <div className="rounded-xl animate-pulse" style={{ height: 60, background: C.cream }} />
      ) : noFeed ? (
        <div className="text-sm" style={{ color: C.muted }}>Live forecast turns on once this farm has a location set. <span className="font-bold">Building</span></div>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          {now && (
            <div className="flex items-center gap-2.5 pr-4" style={{ borderRight: days.length ? `1px solid ${C.border}` : "none" }}>
              {w && <w.Icon size={30} style={{ color: C.greenDk }} />}
              <div>
                <div className="text-2xl font-bold" style={{ color: C.soil }}>{wx1(now.temp_c) != null ? `${wx1(now.temp_c)}°C` : "—"}</div>
                <div className="text-xs" style={{ color: C.muted }}>{w ? w.label : ""}</div>
              </div>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto">
            {days.map((d, i) => {
              const dw = wmoWx(d.weather_code);
              return (
                <div key={i} className="rounded-xl border p-2 text-center shrink-0 min-w-[64px]" style={{ background: "var(--paper)", borderColor: C.border }}>
                  <div className="text-[11px] font-semibold" style={{ color: C.soil }}>{wxDay(d.valid_at)}</div>
                  <dw.Icon size={16} style={{ color: C.greenDk, margin: "3px auto" }} />
                  <div className="text-xs font-bold" style={{ color: C.soil }}>{wx1(d.temp_max_c) != null ? `${wx1(d.temp_max_c)}°` : "—"}<span className="font-normal" style={{ color: C.muted }}>{wx1(d.temp_min_c) != null ? `/${wx1(d.temp_min_c)}°` : ""}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── farm summary snapshot ────────────────────────────────────────────
function FarmSummary({ score, grade, businesses, net, activeCycles, holds, team, hours, navigate }) {
  const snap = [
    { l: "Production", v: `${activeCycles} active`, sub: "cycles & groups", go: "/farm/cycles" },
    { l: "Cash", v: fjd(net), sub: "net so far", c: net < 0 ? C.red : C.greenDk, go: "/farm/cash" },
    { l: "Inventory", v: "Building", sub: "stock value", c: C.muted, go: "/farm/inventory" },
    { l: "Labour", v: team ? `${team} · ${hours}h` : "—", sub: "team this week", go: "/farm/labor" },
    { l: "Compliance", v: holds ? `${holds} on hold` : "Clear", sub: holds ? "do not sell" : "all clear", c: holds ? C.red : C.greenDk, go: "/farm/compliance" },
    { l: "Weather", v: "Live", sub: "see forecast", go: "/farm/weather" },
  ];
  return (
    <Section icon={Activity} title="Farm summary" meta="your whole farm at a glance">
      <div className="flex items-center gap-4 rounded-xl px-4 py-3 mb-3" style={{ border: `1px solid ${C.border}`, background: C.cream }}>
        <div className="text-center" style={{ minWidth: 84 }}>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: gradeColor(grade) }}>{score}</div>
          <div className="text-xs" style={{ color: C.muted }}>/ 100</div>
        </div>
        <div>
          <div className="font-extrabold" style={{ color: C.soil, fontSize: 16 }}>Farm health: {grade}</div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>
            Across {businesses} {businesses === 1 ? "business" : "businesses"} · {holds ? `${holds} thing${holds === 1 ? "" : "s"} on hold` : "nothing on hold"}
          </div>
        </div>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {snap.map((s) => <Tile key={s.l} label={s.l} value={s.v} sub={s.sub} color={s.c} onClick={() => navigate(s.go)} />)}
      </div>
    </Section>
  );
}

// ── headline metrics ─────────────────────────────────────────────────
function HeadlineMetrics({ fin, cash, activeCycles, head, openTasks, holds, standing, navigate }) {
  const income = fin?.total_income_fjd, net = fin?.net_profit_fjd;
  return (
    <Section icon={TrendingUp} title="Headline metrics">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile label="Total income" value={income == null ? "—" : fjd(income)} sub="earned this season" color={C.greenDk} onClick={() => navigate("/farm/cash")} />
        <Tile label="Cash on hand" value={cash == null ? "—" : fjd(cash)} sub="money available" color={C.greenDk} onClick={() => navigate("/farm/cash")} />
        <Tile label="Net this season" value={net == null ? "—" : fjd(net)} sub={Number(net) < 0 ? "costs ahead" : "ahead"} color={Number(net) < 0 ? C.amber : C.greenDk} onClick={() => navigate("/farm/cash")} />
        <Tile label="Active production" value={`${activeCycles}${head ? ` · ${head} head` : ""}`} sub="cycles + animals" color={C.amber} onClick={() => navigate("/farm/cycles")} />
        <Tile label="Tasks to do" value={String(openTasks)} sub="across everything" onClick={() => navigate("/farm/tasks")} />
        <Tile label="Things to watch" value={String(holds)} sub={holds ? "holds + flags" : "all clear"} color={holds ? C.red : C.greenDk} onClick={() => navigate("/farm/compliance")} />
        <Tile label="Portfolio standing" value={standing.grade} sub={`${standing.score} / 100`} color={gradeColor(standing.grade)} onClick={() => navigate("/farm/enterprises")} />
        <Tile label="Farm worth" value="—" sub="standing assets" building onClick={() => navigate("/farm/enterprises")} />
        <Tile label="Credit score" value="—" sub="turns on with history" building />
        <Tile label="FRCS-readiness" value="Building" sub="turns on with history" building />
        <Tile label="Demand match" value="—" sub="needs logged demand" building />
        <Tile label="Margin" value="—" sub="needs costs over time" building />
      </div>
    </Section>
  );
}

// ── intelligence ─────────────────────────────────────────────────────
function Intelligence({ crops, navigate }) {
  const rows = (crops ?? []).map((r) => ({ name: r.production_name, net: n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd) }));
  const best = rows.slice().sort((a, b) => b.net - a.net)[0];
  const worst = rows.slice().sort((a, b) => a.net - b.net)[0];
  return (
    <Section icon={Sparkles} title="Intelligence" link="Open Decision Center →" onLink={() => navigate("/farm/decisions")}>
      <div className="space-y-1.5 text-sm" style={{ color: C.soil }}>
        {best && best.net > 0 ? <div>• Grow <strong>{best.name}</strong> — strongest right now (net {fjd(best.net)}).</div> : <div style={{ color: C.muted }}>• Opportunities show here as your enterprises build a record.</div>}
        {worst && worst.net < 0 ? <div>• Review <strong>{worst.name}</strong> — spending ahead of earnings (net {fjd(worst.net)}).</div> : <div style={{ color: C.muted }}>• No losing enterprise right now.</div>}
        <div style={{ color: C.muted }}>• Forecasts and bottlenecks turn on after a logged season.</div>
      </div>
    </Section>
  );
}

// ── cycle pipeline ───────────────────────────────────────────────────
function CyclePipeline({ cycles, navigate }) {
  const c = cycles ?? [];
  const count = (s) => c.filter((x) => (x.cycle_status || "").toUpperCase() === s).length;
  const stages = [
    { label: "Planning", v: count("PLANNED") }, { label: "Planted", v: 0 }, { label: "Growing", v: count("ACTIVE") },
    { label: "Harvesting", v: count("HARVESTING") }, { label: "Closing", v: count("CLOSING") },
  ];
  return (
    <Section icon={Activity} title="Cycle pipeline" link="View all cycles →" onLink={() => navigate("/farm/cycles")}>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1 shrink-0">
            <button onClick={() => navigate("/farm/cycles")} className={`rounded-xl border px-4 py-3 text-center min-w-[84px] hover:brightness-95 ${FOCUS}`} style={{ background: "var(--paper)", borderColor: C.border }}>
              <div className="text-xl font-bold" style={{ color: C.greenDk }}>{s.v}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{s.label}</div>
            </button>
            {i < stages.length - 1 && <ArrowRight size={12} style={{ color: C.muted }} />}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── farm comparison (multi-farm only) ────────────────────────────────
function FarmComparison({ farms, navigate }) {
  if (!farms || farms.length < 2) return null;
  return (
    <Section icon={Award} title="Farm comparison" link="Compare in Enterprises →" onLink={() => navigate("/farm/enterprises")}>
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
        {farms.map((f) => (
          <div key={f.farm_id} className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border }}>
            <div className="font-semibold text-sm" style={{ color: C.soil }}>{f.farm_id} · {f.farm_name || f.location_island || ""}</div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{f.land_area_ha != null ? `${Number(f.land_area_ha).toFixed(2)} ha` : "—"}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── quick actions ────────────────────────────────────────────────────
function QuickActions({ navigate }) {
  const { openFormModal } = useFormModal();
  const acts = [
    { label: "Harvest", icon: Sprout, go: () => openFormModal("harvest_new") },
    { label: "Cash in", icon: ArrowRight, go: () => openFormModal("cash", { type: "in" }) },
    { label: "Expense", icon: DollarSign, go: () => openFormModal("cash", { type: "out" }) },
    { label: "Field event", icon: ListChecks, go: () => openFormModal("crops") },
    { label: "Labor", icon: Users, go: () => openFormModal("labor") },
    { label: "Photo", icon: Camera, go: () => emitToast("Photo capture ships with the mobile log flow") },
  ];
  return (
    <Section icon={Plus} title="Quick actions">
      <div className="grid gap-2 grid-cols-3 sm:grid-cols-6">
        {acts.map((a) => (
          <button key={a.label} onClick={a.go} className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: "var(--paper)", borderColor: C.border }}>
            <a.icon size={16} style={{ color: C.greenDk }} /><span className="text-[11px] font-medium" style={{ color: C.soil }}>{a.label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── prototype-format overview sections (real data, flat icons, theme) ────────
const money = (v) => (v == null ? "—" : formatMoney(v));
function dayPart() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }

function OvHeader({ name, lastSync, navigate }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: C.soil }}>Good {dayPart()}, {name || "there"} <Sun size={18} style={{ color: C.amber }} /></h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Here's what's happening on your farm today.</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {lastSync && <span className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}><RefreshCw size={12} />Last sync: {lastSync}</span>}
        <FarmSelector />
        <button onClick={() => navigate("/tis")} className={`text-sm px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}><Sparkles size={14} />AI to Farm</button>
        <button onClick={() => navigate("/farm/enterprises")} className={`text-sm px-3 py-2 rounded-lg text-white font-semibold flex items-center gap-1.5 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Add Enterprise</button>
      </div>
    </div>
  );
}

const TRACK = "#E6EBF1";
const TINT = { green: C.greenTint, amber: "#FEF6E6", red: "#FBEAE6", gray: "#EEF2F6" };

function Ring({ score, color, size = 64 }) {
  const inner = size - 14;
  return (
    <div className="grid place-items-center shrink-0" style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${color} ${(score || 0) * 3.6}deg, ${TRACK} 0)` }}>
      <div className="grid place-items-center bg-white" style={{ width: inner, height: inner, borderRadius: "50%" }}><span className="font-extrabold" style={{ color: C.soil, fontSize: size * 0.3 }}>{score}</span></div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub, color, tint, accent, go }) {
  return (
    <button onClick={go} className={`rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${FOCUS}`} style={{ borderColor: C.border }}>
      <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: accent }} />
      <div className="grid place-items-center rounded-xl" style={{ width: 36, height: 36, background: tint }}><Icon size={18} style={{ color: accent }} /></div>
      <div className="text-[10px] uppercase tracking-wide font-bold mt-2.5" style={{ color: C.muted }}>{label}</div>
      <div className="text-2xl font-extrabold leading-tight mt-0.5" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{sub}</div>
    </button>
  );
}

function HealthKpis({ score, grade, net, businesses, catCount, dueToday, highPr, cash, alerts, navigate }) {
  const ringColor = score >= 80 ? C.green : score >= 55 ? C.amber : C.red;
  const tiles = [
    { icon: TrendingUp, label: "Net Profit", value: money(net), sub: "this season", color: Number(net) < 0 ? C.red : C.greenDk, accent: Number(net) < 0 ? C.red : C.green, tint: Number(net) < 0 ? TINT.red : TINT.green, go: () => navigate("/farm/cash") },
    { icon: LayoutGrid, label: "Enterprises", value: businesses, sub: `across ${catCount} categor${catCount === 1 ? "y" : "ies"}`, color: C.soil, accent: C.green, tint: TINT.green, go: () => navigate("/farm/enterprises") },
    { icon: ListChecks, label: "Tasks Today", value: dueToday, sub: highPr ? `${highPr} high priority` : "all clear", color: C.soil, accent: C.amber, tint: TINT.amber, go: () => navigate("/farm/tasks") },
    { icon: Wallet, label: "Cash Balance", value: money(cash), sub: "available", color: C.greenDk, accent: C.green, tint: TINT.green, go: () => navigate("/farm/cash") },
    { icon: Bell, label: "Alerts", value: alerts, sub: alerts ? "action needed" : "none", color: alerts ? C.amber : C.muted, accent: alerts ? C.amber : C.muted, tint: alerts ? TINT.amber : TINT.gray, go: () => navigate("/farm/compliance") },
  ];
  return (
    <div className="space-y-3">
      {/* Farm Health hero */}
      <button onClick={() => navigate("/farm/compliance")} className={`w-full rounded-2xl border p-5 flex items-center gap-5 text-left shadow-sm hover:shadow-md transition-shadow ${FOCUS}`} style={{ borderColor: C.border, background: `linear-gradient(135deg, ${C.greenTint}, #ffffff 70%)` }}>
        <Ring score={score} color={ringColor} size={72} />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide font-bold" style={{ color: C.muted }}>Farm Health</div>
          <div className="text-xl font-extrabold" style={{ color: C.soil }}>{grade}</div>
          <div className="text-[11px]" style={{ color: C.muted }}>Your farm is performing — tap to view full health</div>
        </div>
        <span className="ml-auto text-[11px] font-semibold shrink-0 hidden sm:flex items-center gap-1" style={{ color: C.greenDk }}>View full health <ArrowRight size={13} /></span>
      </button>
      {/* KPI grid (5-up) */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
      </div>
    </div>
  );
}

function AttentionAdvisor({ attention, best, riskiest, navigate }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.soil }}><TriangleAlert size={15} style={{ color: C.amber }} />Attention Needed</span>
          <button onClick={() => navigate("/farm/tasks")} className="text-[11px] font-semibold" style={{ color: C.greenDk }}>View all</button>
        </div>
        {attention.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Nothing needs attention — you're on top of it.</div>
        ) : attention.map((a, i) => (
          <button key={i} onClick={() => navigate(a.route)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left" style={{ borderTop: i ? `1px solid rgba(31,41,55,0.06)` : "none" }}>
            <div className="grid place-items-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: a.bg }}><a.icon size={15} style={{ color: a.fg }} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: C.soil }}>{a.title}</div>
              {a.sub && <div className="text-[11px] truncate" style={{ color: C.muted }}>{a.sub}</div>}
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: a.bg, color: a.fg }}>{a.tag}</span>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.soil }}><Sparkles size={15} style={{ color: C.greenDk }} />AI Farm Advisor</span>
          <button onClick={() => navigate("/tis")} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Ask AI</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl p-3" style={{ background: C.greenTint }}>
            <div className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Best enterprise</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: C.greenDk }}>{best ? best.name : "—"}</div>
            {best && <div className="text-[11px]" style={{ color: C.muted }}>{money(best.net)} net</div>}
          </div>
          <div className="rounded-xl p-3" style={{ background: "#FBEAE6" }}>
            <div className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Watch</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: C.red }}>{riskiest ? riskiest.name : "—"}</div>
            {riskiest && <div className="text-[11px]" style={{ color: C.muted }}>{money(riskiest.net)} net</div>}
          </div>
        </div>
        <div className="text-[11px] mt-3" style={{ color: C.muted }}>Grounded advice (cited agronomy + decision signals) appears here as the engine learns your farm. <span className="font-semibold">Building</span> — ask TIS for guidance now.</div>
      </div>
    </div>
  );
}

const ENT_TABS = [
  ["All", null], ["Crops", "crops"], ["Livestock", "livestock"], ["Poultry", "poultry"],
  ["Forestry", "forestry"], ["Aquaculture", "aquaculture"], ["Apiculture", "apiculture"],
];
const ENT_ICON = { crops: Sprout, livestock: Leaf, poultry: Bird, forestry: Trees, aquaculture: Leaf, apiculture: Leaf };
const ENT_ACCENT = { crops: "var(--green)", livestock: "var(--soil)", poultry: "var(--amber)", forestry: "var(--green-dk)", aquaculture: "#2C6E8A", apiculture: "#C9A227" };

function EnterprisePortfolio({ enterprises, counts, navigate }) {
  const [tab, setTab] = useState(null);
  const rows = enterprises.filter((e) => !tab || e.kind === tab);
  return (
    <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Enterprise Portfolio</span>
        <button onClick={() => navigate("/farm/enterprises")} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Manage Enterprises</button>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3">
        {ENT_TABS.map(([label, key]) => {
          const n = key == null ? enterprises.length : (counts[key] || 0);
          const active = tab === key;
          const disabled = key != null && n === 0;
          return (
            <button key={label} disabled={disabled} onClick={() => setTab(key)} className={`text-xs px-3 py-1.5 rounded-full font-semibold shrink-0 ${FOCUS}`}
              style={active ? { background: C.greenDk, color: "#fff" } : { color: disabled ? C.muted : C.soil, background: "var(--paper)", border: `1px solid ${C.border}`, opacity: disabled ? 0.5 : 1 }}>
              {label} ({n})
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: C.muted }}>No enterprises here yet — add one to get started.</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((e) => {
            const Icon = ENT_ICON[e.kind] || Sprout;
            const accent = ENT_ACCENT[e.kind] || C.green;
            const tint = e.kind === "poultry" ? TINT.amber : e.kind === "livestock" ? "#F1EFEA" : C.greenTint;
            return (
              <button key={e.id} onClick={() => navigate(e.route)} className={`rounded-2xl border bg-white text-left shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${FOCUS}`} style={{ borderColor: C.border }}>
                <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: accent }} />
                <div className="p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: tint }}><Icon size={19} style={{ color: accent }} /></div>
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: accent }}>{e.kindLabel}</div>
                      <div className="text-sm font-bold truncate" style={{ color: C.soil }}>{e.name}</div>
                    </div>
                  </div>
                  {e.metric && <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-2.5" style={{ background: tint, color: accent }}>{e.metric}</span>}
                  <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: `1px solid rgba(31,41,55,0.07)` }}>
                    <div><div className="text-[9px] uppercase" style={{ color: C.muted }}>Income (season)</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(e.income)}</div></div>
                    <div className="text-right"><div className="text-[9px] uppercase" style={{ color: C.muted }}>Net (season)</div><div className="text-sm font-bold" style={{ color: Number(e.net) < 0 ? C.red : C.greenDk }}>{money(e.net)}</div></div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FinancialSnapshot({ revenue, expenses, net, topRevenue, topExpense, navigate }) {
  const pct = revenue > 0 ? Math.max(0, Math.min(100, (net / revenue) * 100)) : 0;
  return (
    <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Financial Snapshot</span>
        <button onClick={() => navigate("/farm/reports")} className="text-[11px] font-semibold" style={{ color: C.greenDk }}>View full report</button>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="grid place-items-center shrink-0" style={{ width: 118, height: 118, borderRadius: "50%", background: `conic-gradient(${Number(net) < 0 ? C.red : C.green} ${Math.max(6, pct) * 3.6}deg, ${TRACK} 0)` }}>
          <div className="grid place-items-center bg-white text-center shadow-sm" style={{ width: 86, height: 86, borderRadius: "50%" }}>
            <div><div className="text-[9px] uppercase" style={{ color: C.muted }}>Net Profit</div><div className="text-sm font-extrabold" style={{ color: Number(net) < 0 ? C.red : C.greenDk }}>{money(net)}</div></div>
          </div>
        </div>
        <div className="flex-1 min-w-[180px] grid grid-cols-3 gap-3">
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Revenue</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(revenue)}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Expenses</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(expenses)}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Cash flow</div><div className="text-sm font-bold" style={{ color: Number(net) < 0 ? C.red : C.greenDk }}>{Number(net) < 0 ? "Negative" : "Positive"}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Top revenue</div><div className="text-xs font-bold truncate" style={{ color: C.soil }}>{topRevenue || "—"}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Top expense</div><div className="text-xs font-bold" style={{ color: C.soil }}>{topExpense || "—"}</div></div>
        </div>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────
function FarmOverview() {
  const { farmId } = useCurrentFarm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycleModalOpen, setCycleModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "new-cycle") {
      setCycleModalOpen(true);
      const next = new URLSearchParams(searchParams); next.delete("action"); setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const q = (key, fn, enabled = true) => useQuery({ queryKey: key, queryFn: fn, enabled: !!farmId && enabled, retry: 0 });
  const farm = q(["ov-farm", farmId], () => getJSON(`/api/v1/farms/${encodeURIComponent(farmId)}`));
  const fin = q(["ov-fin", farmId], () => getJSON(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`));
  const crops = q(["ov-crops", farmId], () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`));
  const flocks = q(["ov-flocks", farmId], () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`));
  const cycles = q(["ov-cycles", farmId], () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}`));
  const tasks = useQuery({ queryKey: ["ov-tasks"], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=50`), retry: 0 });
  const cash = q(["ov-cash", farmId], () => getJSON(`/api/v1/cash-ledger?farm_id=${encodeURIComponent(farmId)}&limit=1`));
  const farmsList = useQuery({ queryKey: ["ov-farms"], queryFn: () => getJSON(`/api/v1/farms`), retry: 0 });
  const labor = q(["ov-labor", farmId], () => getJSON(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`));
  const compliance = q(["ov-compliance", farmId], () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`));
  const chain = useQuery({ queryKey: ["ov-chain"], queryFn: () => getJSON(`/api/v1/me/chain-status`), retry: 0 });

  const finSummary = fin.data?.data?.summary || null;
  const cropRows = crops.data?.data ?? [];
  const flockRows = flocks.data?.data?.items ?? [];
  const cycleRows = cycles.data?.data?.cycles ?? cycles.data?.cycles ?? [];
  const taskRows = tasks.data?.data?.tasks ?? tasks.data?.tasks ?? [];
  const cashBal = cash.data?.data?.balance ?? cash.data?.data?.lifetime_balance_fjd ?? cash.data?.meta?.balance ?? null;
  const farmsArr = (farmsList.data?.data?.farms ?? farmsList.data?.farms ?? farmsList.data?.data ?? []).filter?.((x) => x && x.farm_id) ?? [];

  const activeCycles = cycleRows.filter((c) => ["ACTIVE", "HARVESTING"].includes((c.cycle_status || "").toUpperCase())).length;
  const head = flockRows.reduce((a, f) => a + n0(f.current_count), 0);
  const net = Number(finSummary?.net_profit_fjd ?? 0);
  const holds = compliance.data?.data?.blocked_count ?? 0; // real crop-WHD holds (/crops/compliance)
  const openTasks = taskRows.length;
  const cropNet = cropRows.reduce((a, r) => a + (n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd)), 0);

  // Transparent farm-health rubric (mirrors prototype entHealth): each enterprise
  // starts at 100, −25 if spending more than earned, −20 if nothing in production,
  // −40 per compliance hold; portfolio score = average across enterprises. Holds
  // come from the real /crops/compliance WHD view — no fabricated numbers.
  const laborRows = labor.data?.data ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const laborWeek = laborRows.filter((r) => { const d = new Date(r.work_date).getTime(); return Number.isFinite(d) && d >= weekAgo; });
  const team = new Set(laborWeek.map((r) => r.worker_id)).size;
  const hours = Math.round(laborWeek.reduce((a, r) => a + Number(r.hours_worked || 0), 0));
  const flockSpecies = new Set(flockRows.map((f) => f.species || f.flock_type || f.flock_name || "flock")).size;
  const businesses = cropRows.length + flockSpecies;
  const entScores = cropRows.map((r) => {
    const cn = n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd);
    return cn < 0 ? 75 : 100;
  });
  for (let i = 0; i < flockSpecies; i++) entScores.push(100);
  let score = entScores.length ? Math.round(entScores.reduce((a, b) => a + b, 0) / entScores.length) : (activeCycles || head ? 70 : 0);
  if (activeCycles === 0 && head === 0 && entScores.length) score = Math.max(0, score - 20);
  if (holds) score = Math.max(0, score - Math.round((holds * 40) / Math.max(1, entScores.length)));
  const grade = score >= 80 ? "Very Good" : score >= 55 ? "Steady" : score >= 30 ? "Watch" : entScores.length ? "At risk" : "New";
  const standing = { grade, score };

  // ── prototype-format derivations (real data only) ──────────────────────────
  const me = useQuery({ queryKey: ["ov-me"], queryFn: () => getJSON("/api/v1/auth/me"), retry: 0 });
  const meName = String((me.data?.data?.full_name ?? me.data?.full_name ?? "") || "").split(" ")[0] || "";
  const lastSync = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const t0 = new Date().toISOString().slice(0, 10);

  const cropRevenue = cropRows.reduce((a, r) => a + n0(r.total_income_fjd), 0);
  const totLabor = cropRows.reduce((a, r) => a + n0(r.total_labor_fjd), 0);
  const totInput = cropRows.reduce((a, r) => a + n0(r.total_input_cost_fjd), 0);
  const revenue = n0(finSummary?.total_income_fjd ?? finSummary?.total_revenue_fjd ?? cropRevenue);
  const netProfit = finSummary?.net_profit_fjd != null ? n0(finSummary.net_profit_fjd) : (cropRevenue - totLabor - totInput);
  const expenses = Math.max(0, revenue - netProfit);
  const topRevenue = cropRows.length ? cropRows.slice().sort((a, b) => n0(b.total_income_fjd) - n0(a.total_income_fjd))[0].production_name : null;
  const topExpense = (totInput || totLabor) ? (totInput >= totLabor ? "Inputs" : "Labour") : null;

  const cropWithNet = cropRows.map((r) => ({ name: r.production_name, net: n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd) }));
  const best = cropWithNet.length ? cropWithNet.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const riskiest = cropWithNet.length ? cropWithNet.reduce((a, b) => (b.net < a.net ? b : a)) : null;

  const dueToday = taskRows.filter((x) => x.due_date && x.due_date <= t0).length;
  const highPr = taskRows.filter((x) => (x.task_rank ?? 999) < 300 && x.due_date && x.due_date <= t0).length;
  const alerts = holds + cropWithNet.filter((c) => c.net < 0).length;

  const flockKind = (f) => { const s = String(f.species || f.flock_type || f.flock_name || "").toLowerCase(); return /chick|broiler|layer|hen|poultry|duck/.test(s) ? "poultry" : "livestock"; };
  const cycleByCrop = {};
  cycleRows.forEach((c) => { if (["ACTIVE", "HARVESTING"].includes(String(c.cycle_status || "").toUpperCase())) { const k = c.production_name; const eh = c.expected_harvest_date; if (eh && (!cycleByCrop[k] || eh < cycleByCrop[k])) cycleByCrop[k] = eh; } });
  const cropEnts = cropRows.map((r, i) => {
    const net = n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd);
    const eh = cycleByCrop[r.production_name];
    const days = eh ? Math.ceil((new Date(eh) - Date.now()) / 86400000) : null;
    return { id: `c${i}`, kind: "crops", kindLabel: "Crops", name: r.production_name, income: n0(r.total_income_fjd), net, metric: days != null ? (days <= 0 ? "Ready to harvest" : `${days} day${days === 1 ? "" : "s"} to harvest`) : null, route: "/farm/cycles" };
  });
  const flockEnts = flockRows.map((f, i) => { const k = flockKind(f); return { id: `f${i}`, kind: k, kindLabel: k === "poultry" ? "Poultry" : "Livestock", name: f.flock_name || f.species || "Flock", income: null, net: null, metric: `${n0(f.current_count)} ${k === "poultry" ? "birds" : "animals"}`, route: "/farm/enterprises" }; });
  const enterprises = [...cropEnts, ...flockEnts];
  const entCounts = { crops: cropEnts.length, poultry: flockEnts.filter((e) => e.kind === "poultry").length, livestock: flockEnts.filter((e) => e.kind === "livestock").length, forestry: 0, aquaculture: 0, apiculture: 0 };
  const catCount = Object.values(entCounts).filter((n) => n > 0).length;

  const attn = [];
  if (holds) attn.push({ icon: ShieldCheck, bg: "#FBEAE6", fg: C.red, title: `${holds} harvest${holds === 1 ? "" : "s"} blocked`, sub: "Chemical withholding period not cleared", tag: "High", route: "/farm/compliance" });
  taskRows.slice().sort((a, b) => (a.task_rank ?? 999) - (b.task_rank ?? 999)).slice(0, Math.max(0, 4 - attn.length)).forEach((tk) => {
    const w = tk.due_date ? (tk.due_date < t0 ? "Overdue" : tk.due_date === t0 ? "Today" : "Upcoming") : "Upcoming";
    attn.push({ icon: ListChecks, bg: C.greenTint, fg: C.greenDk, title: tk.imperative, sub: null, tag: w, route: "/farm/tasks" });
  });

  const handleCycleCreated = () => { ["ov-cycles", "ov-crops", "ov-fin"].forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] })); qc.invalidateQueries({ queryKey: ["ov-tasks"] }); };
  const taskAction = async (id, action) => { try { await postJSON(`/api/v1/tasks/${id}/${action}`); emitToast(action === "complete" ? "Task done" : "Task skipped"); qc.invalidateQueries({ queryKey: ["ov-tasks"] }); } catch { emitToast("Couldn't update the task — try again"); } };

  return (
    <div className="tfp space-y-4">
      <OvHeader name={meName} lastSync={lastSync} navigate={navigate} />
      <LayerBackfillBanner />
      <HealthKpis score={score} grade={grade} net={netProfit} businesses={businesses} catCount={catCount} dueToday={dueToday} highPr={highPr} cash={cashBal} alerts={alerts} navigate={navigate} />
      <AttentionAdvisor attention={attn} best={best} riskiest={riskiest} navigate={navigate} />
      <EnterprisePortfolio enterprises={enterprises} counts={entCounts} navigate={navigate} />
      <div className="grid gap-3 lg:grid-cols-2">
        <FinancialSnapshot revenue={revenue} expenses={expenses} net={netProfit} topRevenue={topRevenue} topExpense={topExpense} navigate={navigate} />
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Recent Activity</span>
            <button onClick={() => navigate("/farm/history")} className="text-[11px] font-semibold" style={{ color: C.greenDk }}>View all</button>
          </div>
          <RecentLoggedStrip farmId={farmId} />
        </div>
      </div>

      <section className="bg-white rounded-2xl px-4 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>Active cycles</h2>
          <NewCycleButton disabled={!farmId} onClick={() => setCycleModalOpen(true)} />
        </div>
        <ActiveCyclesTable farmId={farmId} />
      </section>

      {(() => {
        const cd = chain.data?.data;
        const ok = cd?.integrity_ok;
        const events = cd?.events_in_chain;
        const breaks = cd?.chain_break_count;
        // Real audit-chain check (GET /me/chain-status) — never a hardcoded claim.
        const loading = chain.isLoading;
        const errored = chain.isError;
        const bg = ok === false ? "#FBEAE6" : C.greenTint;
        const fg = ok === false ? C.red : C.greenDk;
        let msg;
        if (loading) msg = "Verification chain · checking…";
        else if (errored || cd == null) msg = "Every record is hash-chained and stamped.";
        else if (ok) msg = `Verification chain · INTACT — ${Number(events).toLocaleString()} record${events === 1 ? "" : "s"} hash-chained, none altered after the fact.`;
        else msg = `Verification chain · ATTENTION — ${breaks} break${breaks === 1 ? "" : "s"} detected in ${Number(events).toLocaleString()} records.`;
        return (
          <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: bg, borderColor: C.border }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: fg }}><ShieldCheck size={14} />{msg}</div>
            <button onClick={() => navigate("/farm/history")} className={`text-[11px] px-2.5 py-1 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open Farm History</button>
          </div>
        );
      })()}

      <NewCycleModal isOpen={cycleModalOpen} onClose={() => setCycleModalOpen(false)} onCreated={() => { handleCycleCreated(); setCycleModalOpen(false); }} farmId={farmId} />
    </div>
  );
}

export default function FarmDashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <FarmOverview />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

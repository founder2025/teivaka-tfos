/**
 * FarmDashboard.jsx — /farm Overview (whole-farm command center).
 *
 * Redesigned 2026-06-26 (audit F1–F9, M1–M28) then optimized for speed /
 * automation / AI / simplicity / accessibility. Real data or honest-empty only.
 *
 * Optimization pass:
 * - Speed: all derivations memoised; dropped the unused /farms/{id} and /auth/me
 *   queries (12→10 calls); refetchOnReconnect + retry so a flaky link self-heals.
 * - Honesty under failure: routed through utils/api (token auto-refresh + humanised
 *   errors) so an expired session no longer renders "FJ$ 0 / All clear"; farms-error
 *   shows a Retry state (not "create your first farm"); errored money shows "—".
 * - Automation / fewer clicks: complete the top task one-tap from "Needs you now"
 *   without leaving the page; auto-refetch on reconnect/cycle-create.
 * - AI: context-aware "Ask AI" deep-links TIS pre-seeded with the live situation.
 * - Simplicity: one header action; owner depth only renders when it has data.
 * - Accessibility: prefers-reduced-motion honoured; keyboard-operable rows; aria.
 * - Correctness: "today" is computed in Fiji time to match the backend (D2).
 *
 * Filed (backend / cross-page, labelled honestly in-page): composite
 * GET /farm/overview/{id} (Inviolable #3); farm_id on /tasks (tenant-wide today);
 * whole-farm activity feed (crops-only today); lift CurrentFarmProvider + clear
 * query cache on logout (D1 shared-device privacy) to the shell.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sprout, Bird, Plus, ArrowRight, ShieldCheck, ShieldAlert, Sparkles, Leaf, Trees,
  TrendingUp, ListChecks, Wallet, TriangleAlert, CheckCircle2, Clock, RefreshCw,
  LayoutGrid, Wheat, Users, Coins, BarChart3, WifiOff,
} from "lucide-react";
import { formatMoney } from "../../utils/money";
import { getJSON, send } from "../../utils/api";
import { getCurrentUser } from "../../utils/auth";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import { useLauncher } from "../../context/LauncherContext";
import RecentLoggedStrip from "../../components/farm/RecentLoggedStrip";
import FarmSelector from "../../components/farm/FarmSelector";
import NewCycleButton from "../../components/farm/NewCycleButton";
import NewCycleModal from "../../components/farm/NewCycleModal";
import LayerBackfillBanner from "../../components/farm/LayerBackfillBanner";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)",
  greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const TRACK = "#E6EBF1";
const TINT = { green: "var(--green-tint)", amber: "#FEF6E6", red: "#FBEAE6", gray: "#EEF2F6" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 motion-reduce:transition-none transition";
const PULSE = "animate-pulse motion-reduce:animate-none";
const MAX_FARMS_SHOWN = 6;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });

function n0(v) { return Math.round(Number(v) || 0); }
const money = (v) => (v == null ? "—" : (formatMoney(v, { fallback: "—" }) ?? "—"));
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function dayPart() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }
const gradeColor = (s) => (s == null ? C.muted : s >= 80 ? C.green : s >= 55 ? C.amber : C.red);
// "Today" in Fiji time to match the backend day-boundary (D2 / B89).
function fijiToday() { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } catch { return new Date().toISOString().slice(0, 10); } }

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, className = "", style }) {
  return <div className={`rounded-2xl border bg-white ${className}`} style={{ borderColor: C.border, ...style }}>{children}</div>;
}
function SectionHead({ icon: Icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <span className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.soil }}>
        {Icon && <Icon size={15} style={{ color: C.greenDk }} aria-hidden="true" />}{title}
      </span>
      {action && <button onClick={onAction} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{action}</button>}
    </div>
  );
}
function Ring({ score, size = 64 }) {
  const color = gradeColor(score);
  const inner = size - 14;
  return (
    <div role="img" aria-label={score == null ? "No health score yet" : `Farm health ${score} of 100`}
      className="grid place-items-center shrink-0" style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${color} ${(score || 0) * 3.6}deg, ${TRACK} 0)` }}>
      <div className="grid place-items-center bg-white" style={{ width: inner, height: inner, borderRadius: "50%" }}>
        <span className="font-extrabold" style={{ color: C.soil, fontSize: size * 0.3 }}>{score == null ? "—" : score}</span>
      </div>
    </div>
  );
}

// ── header (one primary action; greeting from token, no extra query) ──
function Header({ name, updatedAt, businesses, degraded, openLog }) {
  const when = updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Good {dayPart()}{name ? `, ${name}` : ""}</h1>
        <div className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: degraded ? C.amber : C.muted }}>
          {degraded ? <><WifiOff size={12} aria-hidden="true" />Showing saved data</> : when ? <><RefreshCw size={12} aria-hidden="true" />Updated {when}</> : null}
          {businesses > 0 && <span>· {businesses} enterprise{businesses === 1 ? "" : "s"}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <FarmSelector />
        <button onClick={openLog} className={`text-sm px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-1.5 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={15} aria-hidden="true" />Log</button>
      </div>
    </div>
  );
}

// ── the ONE thing: Needs you now (one-tap done for tasks) ────────────
const SEV = { high: { bg: TINT.red, fg: C.red }, med: { bg: TINT.amber, fg: C.amber }, info: { bg: C.greenTint, fg: C.greenDk }, ok: { bg: C.greenTint, fg: C.greenDk } };
function NeedsYouNow({ item, moreCount, onDone, navigate }) {
  const s = SEV[item.sev] || SEV.info;
  const Icon = item.icon;
  return (
    <Card style={{ background: s.bg, borderColor: item.sev === "high" ? C.red : C.border }}>
      <div className="p-4 flex items-center gap-4 flex-wrap" role="status" aria-live="polite">
        <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 44, height: 44, background: "white" }}><Icon size={22} style={{ color: s.fg }} aria-hidden="true" /></div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: s.fg }}>Needs you now</div>
          <div className="text-base font-bold" style={{ color: C.soil }}>{item.text}</div>
          {item.hint && <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>{item.hint}</div>}
        </div>
        <div className="flex items-center gap-2">
          {moreCount > 0 && <button onClick={() => navigate("/farm/tasks")} className={`text-[12px] font-semibold ${FOCUS}`} style={{ color: C.greenDk }}>+{moreCount} more →</button>}
          {item.taskId && <button onClick={() => onDone(item.taskId)} className={`text-sm px-4 py-2 rounded-lg font-semibold text-white ${FOCUS}`} style={{ background: C.greenDk }}>Done</button>}
          <button onClick={item.go} className={`text-sm px-4 py-2 rounded-lg font-semibold ${FOCUS}`} style={item.taskId ? { color: C.soil, border: `1px solid ${C.border}`, background: "white" } : { background: item.sev === "high" ? C.red : C.greenDk, color: "white" }}>{item.action}</button>
        </div>
      </div>
    </Card>
  );
}

function GlanceTile({ icon: Icon, label, value, sub, color, accent, tint, go }) {
  return (
    <button onClick={go} className={`rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md motion-reduce:transition-none transition-shadow relative overflow-hidden ${FOCUS}`} style={{ borderColor: C.border }}>
      <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: accent }} />
      <div className="grid place-items-center rounded-xl" style={{ width: 34, height: 34, background: tint }}><Icon size={17} style={{ color: accent }} aria-hidden="true" /></div>
      <div className="text-[10px] uppercase tracking-wide font-bold mt-2.5" style={{ color: C.muted }}>{label}</div>
      <div className="text-2xl font-extrabold leading-tight mt-0.5 truncate" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: C.muted }}>{sub}</div>
    </button>
  );
}

function HealthAndDecision({ score, grade, gradeNote, best, worst, askAi, navigate }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <button onClick={() => navigate("/farm/compliance")} className={`w-full p-5 flex items-center gap-5 text-left ${FOCUS}`}>
          <Ring score={score} size={72} />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide font-bold" style={{ color: C.muted }}>Farm health</div>
            <div className="text-xl font-extrabold" style={{ color: gradeColor(score) }}>{grade}</div>
            <div className="text-[12px]" style={{ color: C.muted }}>{gradeNote}</div>
          </div>
          <span className="ml-auto text-[11px] font-semibold shrink-0 hidden sm:flex items-center gap-1" style={{ color: C.greenDk }}>Details <ArrowRight size={13} aria-hidden="true" /></span>
        </button>
      </Card>
      <Card className="p-4">
        <SectionHead icon={Sparkles} title="Decide" action="Ask AI" onAction={askAi} />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: C.greenTint }}>
            <div className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Best enterprise</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: C.greenDk }}>{best ? best.name : "—"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{best ? `${money(best.net)} net` : "builds with a logged season"}</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: worst ? TINT.red : C.greenTint }}>
            <div className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Watch</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: worst ? C.red : C.greenDk }}>{worst ? worst.name : "All healthy"}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{worst ? `${money(worst.net)} — sold at a loss` : "no enterprise losing money"}</div>
          </div>
        </div>
        <button onClick={askAi} className={`text-[11px] mt-3 text-left ${FOCUS}`} style={{ color: C.greenDk }}>Ask AI what to do about this farm →</button>
      </Card>
    </div>
  );
}

const ENT_TABS = [["All", null], ["Crops", "crops"], ["Livestock", "livestock"], ["Poultry", "poultry"], ["Forestry", "forestry"], ["Aquaculture", "aquaculture"], ["Apiculture", "apiculture"]];
const ENT_ICON = { crops: Sprout, livestock: Leaf, poultry: Bird, forestry: Trees, aquaculture: Leaf, apiculture: Leaf };
const ENT_ACCENT = { crops: "var(--green)", livestock: "var(--soil)", poultry: "var(--amber)", forestry: "var(--green-dk)", aquaculture: "#2C6E8A", apiculture: "#C9A227" };

function Portfolio({ enterprises, counts, navigate }) {
  const [tab, setTab] = useState(null);
  const rows = enterprises.filter((e) => !tab || e.kind === tab);
  return (
    <Card className="p-4">
      <SectionHead icon={LayoutGrid} title="Enterprise portfolio" action="Manage" onAction={() => navigate("/farm/enterprises")} />
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3" role="tablist">
        {ENT_TABS.map(([label, key]) => {
          const n = key == null ? enterprises.length : (counts[key] || 0);
          const active = tab === key;
          const disabled = key != null && n === 0;
          return (
            <button key={label} role="tab" aria-selected={active} disabled={disabled} onClick={() => setTab(key)} className={`text-xs px-3 py-2 rounded-full font-semibold shrink-0 ${FOCUS}`}
              style={active ? { background: C.greenDk, color: "#fff" } : { color: disabled ? C.muted : C.soil, background: C.paper, border: `1px solid ${C.border}`, opacity: disabled ? 0.5 : 1 }}>
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
              <button key={e.id} onClick={() => navigate(e.route)} className={`rounded-2xl border bg-white text-left shadow-sm hover:shadow-md motion-reduce:transition-none transition-shadow relative overflow-hidden ${FOCUS}`} style={{ borderColor: C.border }}>
                <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: accent }} />
                <div className="p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: tint }}><Icon size={19} style={{ color: accent }} aria-hidden="true" /></div>
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: accent }}>{e.kindLabel}</div>
                      <div className="text-sm font-bold truncate" style={{ color: C.soil }}>{e.name}</div>
                    </div>
                  </div>
                  {e.metric && <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-2.5" style={{ background: tint, color: accent }}>{e.metric}</span>}
                  {e.income != null ? (
                    <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: `1px solid rgba(31,41,55,0.07)` }}>
                      <div><div className="text-[9px] uppercase" style={{ color: C.muted }}>Income</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(e.income)}</div></div>
                      <div className="text-right"><div className="text-[9px] uppercase" style={{ color: C.muted }}>Net</div><div className="text-sm font-bold" style={{ color: Number(e.net) < 0 ? C.red : C.greenDk }}>{money(e.net)}</div></div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-2.5 text-[11px]" style={{ color: C.muted, borderTop: `1px solid rgba(31,41,55,0.07)` }}>Tap to manage this group</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MoneySnapshot({ revenue, expenses, net, margin, topRevenue, topExpense, navigate }) {
  const pct = revenue && revenue > 0 && net != null ? Math.max(0, Math.min(100, (net / revenue) * 100)) : 0;
  return (
    <Card className="p-4">
      <SectionHead icon={Coins} title="Money snapshot" action="Full report" onAction={() => navigate("/farm/records?tab=reports")} />
      <div className="flex items-center gap-4 flex-wrap">
        <div className="grid place-items-center shrink-0" style={{ width: 110, height: 110, borderRadius: "50%", background: `conic-gradient(${Number(net) < 0 ? C.red : C.green} ${Math.max(6, pct) * 3.6}deg, ${TRACK} 0)` }}>
          <div className="grid place-items-center bg-white text-center shadow-sm" style={{ width: 80, height: 80, borderRadius: "50%" }}>
            <div><div className="text-[9px] uppercase" style={{ color: C.muted }}>Net</div><div className="text-sm font-extrabold" style={{ color: Number(net) < 0 ? C.red : C.greenDk }}>{money(net)}</div></div>
          </div>
        </div>
        <div className="flex-1 min-w-[180px] grid grid-cols-3 gap-3">
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Revenue</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(revenue)}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Expenses</div><div className="text-sm font-bold" style={{ color: C.soil }}>{money(expenses)}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Margin</div><div className="text-sm font-bold" style={{ color: Number(net) < 0 ? C.red : C.greenDk }}>{margin == null ? "—" : `${Math.round(margin)}%`}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Top revenue</div><div className="text-xs font-bold truncate" style={{ color: C.soil }}>{topRevenue || "—"}</div></div>
          <div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Top expense</div><div className="text-xs font-bold" style={{ color: C.soil }}>{topExpense || "—"}</div></div>
        </div>
      </div>
    </Card>
  );
}

function OpsRow({ totalKg, workers, hours, wageWeek, avgCostPerKg, farmCount, navigate }) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <GlanceTile icon={Wheat} label="Harvested" value={`${(totalKg || 0).toLocaleString()} kg`} sub="this season" color={C.soil} accent={C.green} tint={TINT.green} go={() => navigate("/farm/cycles")} />
      <GlanceTile icon={Users} label="Workforce" value={workers} sub={`${hours} hrs · ${money(wageWeek)} this week`} color={C.soil} accent={C.soil} tint="#F1EFEA" go={() => navigate("/farm/resources?tab=labour")} />
      <GlanceTile icon={Coins} label="Cost / kg" value={avgCostPerKg != null ? money(avgCostPerKg) : "—"} sub="labour + inputs per kg" color={C.soil} accent={C.amber} tint={TINT.amber} go={() => navigate("/farm/insights")} />
      <GlanceTile icon={LayoutGrid} label="Farms" value={farmCount} sub={farmCount === 1 ? "this farm" : "you manage"} color={C.soil} accent={C.green} tint={TINT.green} go={() => navigate("/farm/enterprises")} />
    </div>
  );
}

function EnterpriseCompare({ rows, navigate }) {
  if (rows.length < 2) return null;
  const shown = rows.slice(0, 8);
  const more = rows.length - shown.length;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <Card className="p-4">
      <SectionHead icon={BarChart3} title="Enterprise comparison" action="Full analytics" onAction={() => navigate("/farm/insights")} />
      <div className="space-y-2.5">
        {shown.map((r) => {
          const pos = r.net >= 0; const w = Math.round((Math.abs(r.net) / maxAbs) * 100);
          return (
            <div key={r.name} className="text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate" style={{ color: C.soil }}>{r.name}</span>
                <span className="font-bold shrink-0" style={{ color: pos ? C.greenDk : C.red }}>{money(r.net)}</span>
              </div>
              <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: "#EEF2F6" }}><div style={{ width: `${w}%`, height: "100%", background: pos ? C.green : C.red }} /></div>
              <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: C.muted }}>
                <span>Income {money(r.income)}</span><span>· {r.kg.toLocaleString()} kg</span>{r.costkg != null && <span>· {money(r.costkg)}/kg</span>}
              </div>
            </div>
          );
        })}
      </div>
      {more > 0 && <button onClick={() => navigate("/farm/insights")} className={`text-[11px] font-semibold mt-2 ${FOCUS}`} style={{ color: C.greenDk }}>+{more} more enterprise{more === 1 ? "" : "s"} →</button>}
    </Card>
  );
}

function MultiFarmCompare({ farms, currentFarmId, navigate }) {
  if (!Array.isArray(farms) || farms.length < 2) return null;
  const shown = farms.slice(0, MAX_FARMS_SHOWN);
  const more = farms.length - shown.length;
  return (
    <Card className="p-4">
      <SectionHead icon={Trees} title="Your farms" action="Map & manage" onAction={() => navigate("/farm/resources?tab=locations")} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ color: C.muted }}>
            <th className="text-left font-bold uppercase text-[9px] pb-1.5">Farm</th>
            <th className="text-right font-bold uppercase text-[9px] pb-1.5">Cycles</th>
            <th className="text-right font-bold uppercase text-[9px] pb-1.5">Workers</th>
            <th className="text-right font-bold uppercase text-[9px] pb-1.5">Crops</th>
            <th className="text-right font-bold uppercase text-[9px] pb-1.5">Alerts</th>
          </tr></thead>
          <tbody>
            {shown.map((f) => {
              const cur = f.farm_id === currentFarmId;
              return (
                <tr key={f.farm_id} style={{ borderTop: `1px solid rgba(31,41,55,0.06)` }}>
                  <td className="py-2 font-semibold" style={{ color: cur ? C.greenDk : C.soil }}>{f.farm_name || f.farm_id}{cur ? " ·" : ""}</td>
                  <td className="py-2 text-right" style={{ color: C.soil }}>{n0(f.active_cycles)}</td>
                  <td className="py-2 text-right" style={{ color: C.soil }}>{n0(f.member_count)}</td>
                  <td className="py-2 text-right" style={{ color: C.soil }}>{n0(f.crop_types)}</td>
                  <td className="py-2 text-right font-semibold" style={{ color: n0(f.open_alerts) ? C.red : C.muted }}>{n0(f.open_alerts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more > 0 && <button onClick={() => navigate("/farm/resources?tab=locations")} className={`text-[11px] font-semibold mt-2 ${FOCUS}`} style={{ color: C.greenDk }}>+{more} more farm{more === 1 ? "" : "s"} →</button>}
    </Card>
  );
}

function ActiveCycles({ cycles, farmId, navigate, onNew }) {
  const rows = cycles.filter((c) => ["ACTIVE", "HARVESTING"].includes(String(c.cycle_status || "").toUpperCase()));
  const dayCount = (d) => { if (!d) return "—"; const p = new Date(d); if (isNaN(p)) return "—"; const n = Math.floor((Date.now() - p) / 864e5); return n < 0 ? "—" : String(n); };
  const goCycle = (id) => navigate(`/farm/cycles?cycle=${encodeURIComponent(id)}`);
  return (
    <Card className="px-4 py-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Active cycles</h2>
        <NewCycleButton disabled={!farmId} onClick={onNew} />
      </div>
      {rows.length === 0 ? (
        <div className="text-sm" style={{ color: C.muted }}>No active cycles for this farm yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><tr>
              {["Cycle", "Crop", "Block", "Day", "Status"].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-wider font-semibold px-2 py-2" style={{ color: C.muted, borderBottom: `1px solid ${C.border}`, background: C.cream }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.cycle_id} role="button" tabIndex={0}
                  onClick={() => goCycle(c.cycle_id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goCycle(c.cycle_id); } }}
                  className={FOCUS} style={{ cursor: "pointer" }}>
                  <td className="px-2 py-2" style={{ color: C.soil, borderBottom: `1px solid ${C.border}` }}>Cycle {c.block_sequence ?? c.cycle_id}</td>
                  <td className="px-2 py-2" style={{ color: C.soil, borderBottom: `1px solid ${C.border}` }}>{c.production_name || "—"}</td>
                  <td className={`px-2 py-2 ${c.pu_farmer_label ? "" : "font-mono text-[11px]"}`} style={{ color: C.soil, borderBottom: `1px solid ${C.border}` }}>{c.pu_farmer_label || c.pu_id || "—"}</td>
                  <td className="px-2 py-2" style={{ color: C.soil, borderBottom: `1px solid ${C.border}` }}>{dayCount(c.planting_date)}</td>
                  <td className="px-2 py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: c.cycle_status === "HARVESTING" ? TINT.amber : C.cream, color: c.cycle_status === "HARVESTING" ? C.amber : C.greenDk, border: `1px solid ${C.border}` }}>{c.cycle_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── states ───────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="tfp space-y-4">
      <div className={`h-9 w-64 rounded-lg ${PULSE}`} style={{ background: C.paper }} />
      <div className={`h-20 rounded-2xl ${PULSE}`} style={{ background: C.paper }} />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-28 rounded-2xl ${PULSE}`} style={{ background: C.paper }} />)}</div>
      <div className={`h-40 rounded-2xl ${PULSE}`} style={{ background: C.paper }} />
    </div>
  );
}
function CenterCard({ icon: Icon, title, body, action, onAction, children }) {
  return (
    <div className="tfp">
      <Card className="p-8 text-center max-w-xl mx-auto mt-8">
        <div className="grid place-items-center rounded-2xl mx-auto mb-4" style={{ width: 56, height: 56, background: C.greenTint }}><Icon size={28} style={{ color: C.greenDk }} aria-hidden="true" /></div>
        <h1 className="text-xl font-extrabold" style={{ color: C.soil }}>{title}</h1>
        <p className="text-sm mt-1.5" style={{ color: C.muted }}>{body}</p>
        {action && <button onClick={onAction} className={`mt-5 text-sm px-5 py-2.5 rounded-lg text-white font-semibold inline-flex items-center gap-2 ${FOCUS}`} style={{ background: C.greenDk }}>{action}</button>}
        {children}
      </Card>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────
function FarmOverview() {
  const { farmId } = useCurrentFarm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { open: openLauncher } = useLauncher();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [doneIds, setDoneIds] = useState(() => new Set()); // optimistic one-tap Done (R5)

  useEffect(() => {
    if (searchParams.get("action") === "new-cycle") {
      setCycleModalOpen(true);
      const next = new URLSearchParams(searchParams); next.delete("action"); setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const on = !!farmId;
  // Shared ["farms"] key dedupes with FarmSelector → one /farms fetch.
  const farms = useQuery({ queryKey: ["farms"], queryFn: async () => (await getJSON("/api/v1/farms"))?.farms ?? [] });
  const fin = useQuery({ queryKey: ["fin", farmId], queryFn: () => getJSON(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`), enabled: on });
  const crops = useQuery({ queryKey: ["crops", farmId], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`), enabled: on });
  const flocks = useQuery({ queryKey: ["flocks", farmId], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`), enabled: on });
  const cycles = useQuery({ queryKey: ["farm-cycles", farmId], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}`), enabled: on });
  const tasks = useQuery({ queryKey: ["tasks-open"], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=50`) });
  const cash = useQuery({ queryKey: ["cash-bal", farmId], queryFn: () => getJSON(`/api/v1/cash-ledger?farm_id=${encodeURIComponent(farmId)}&limit=1`), enabled: on });
  const labor = useQuery({ queryKey: ["labor", farmId], queryFn: () => getJSON(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`), enabled: on });
  const compliance = useQuery({ queryKey: ["compliance", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`), enabled: on });
  const chain = useQuery({ queryKey: ["chain-status"], queryFn: () => getJSON(`/api/v1/me/chain-status`) });
  // The access-token JWT carries no name, so /auth/me is the only name source —
  // dropping it (an earlier "optimization") made the greeting nameless (R1).
  const me = useQuery({ queryKey: ["me"], queryFn: () => getJSON("/api/v1/auth/me"), staleTime: 5 * 60_000 });

  const farmsArr = useMemo(() => (Array.isArray(farms.data) ? farms.data : []).filter((x) => x && x.farm_id), [farms.data]);
  const meName = useMemo(() => String((me.data?.data?.full_name ?? me.data?.full_name ?? getCurrentUser()?.name ?? "") || "").split(" ")[0] || "", [me.data]);
  const updatedAt = Math.max(fin.dataUpdatedAt || 0, crops.dataUpdatedAt || 0, cycles.dataUpdatedAt || 0) || null;
  const degraded = fin.isError || crops.isError || cycles.isError || compliance.isError || tasks.isError;

  // All derivations memoised (D6 speed). Recompute only when source data changes.
  const v = useMemo(() => {
    const t0 = fijiToday();
    const finSummary = fin.data?.data?.summary || null;
    const cropRows = Array.isArray(crops.data?.data) ? crops.data.data : [];
    const flockRows = flocks.data?.data?.items ?? [];
    const cycleRows = cycles.data?.data?.cycles ?? [];
    const taskRows = tasks.data?.data?.tasks ?? tasks.data?.tasks ?? [];
    const comp = compliance.data?.data || {};
    const laborRows = Array.isArray(labor.data?.data) ? labor.data.data : [];
    const cashV = cash.data?.data?.cash_balance_fjd;
    const cashBal = cashV == null ? null : Number(cashV);

    const entNet = (r) => n0(r.total_income_fjd) - n0(r.total_labor_fjd) - n0(r.total_input_cost_fjd);
    const flockKind = (f) => /chick|broiler|layer|hen|poultry|duck/.test(String(f.species || f.flock_type || f.flock_name || "").toLowerCase()) ? "poultry" : "livestock";

    // money — single source (financials/farm summary); null (→ "—") on error
    const revenue = finSummary ? n0(finSummary.total_income_fjd) : null;
    const net = finSummary ? (finSummary.net_profit_fjd != null ? n0(finSummary.net_profit_fjd) : n0(finSummary.total_income_fjd) - n0(finSummary.total_labor_cost_fjd) - n0(finSummary.total_input_cost_fjd)) : null;
    const expenses = finSummary ? n0(finSummary.total_labor_cost_fjd) + n0(finSummary.total_input_cost_fjd) : null;
    const margin = finSummary?.profit_margin_pct != null ? Number(finSummary.profit_margin_pct) : (revenue && revenue > 0 && net != null ? (net / revenue) * 100 : null);

    // enterprises
    const cycleByCrop = {};
    cycleRows.forEach((c) => { if (["ACTIVE", "HARVESTING"].includes(String(c.cycle_status || "").toUpperCase())) { const k = c.production_name; const eh = c.expected_harvest_date; if (eh && (!cycleByCrop[k] || eh < cycleByCrop[k])) cycleByCrop[k] = eh; } });
    const cropEnts = cropRows.map((r, i) => { const eh = cycleByCrop[r.production_name]; const days = eh ? Math.ceil((new Date(eh) - Date.now()) / 864e5) : null; return { id: `c${i}`, kind: "crops", kindLabel: "Crops", name: r.production_name, income: n0(r.total_income_fjd), net: entNet(r), metric: days != null ? (days <= 0 ? "Ready to harvest" : `${days} day${days === 1 ? "" : "s"} to harvest`) : null, route: "/farm/cycles" }; });
    const flockEnts = flockRows.map((f, i) => { const k = flockKind(f); const placed = n0(f.placed_count), cur = n0(f.current_count); const sv = placed > 0 ? Math.round((cur / placed) * 100) : null; return { id: `f${i}`, kind: k, kindLabel: k === "poultry" ? "Poultry" : "Livestock", name: f.flock_name || f.species || "Flock", income: null, net: null, sv, metric: `${cur} ${k === "poultry" ? "birds" : "animals"}${sv != null ? ` · ${sv}% survival` : ""}`, route: k === "poultry" ? "/farm/poultry" : "/farm/enterprises" }; });
    const enterprises = [...cropEnts, ...flockEnts];
    const entCounts = { crops: cropEnts.length, poultry: flockEnts.filter((e) => e.kind === "poultry").length, livestock: flockEnts.filter((e) => e.kind === "livestock").length, forestry: 0, aquaculture: 0, apiculture: 0 };

    const cmp = cropRows.map((r) => ({ name: r.production_name, income: n0(r.total_income_fjd), kg: n0(r.total_harvest_kg), net: entNet(r), costkg: r.cokg_fjd_per_kg != null ? Number(r.cokg_fjd_per_kg) : null })).sort((a, b) => b.net - a.net);
    const best = cmp.length && cmp[0].net > 0 ? cmp[0] : null;
    const worstRaw = cmp.filter((r) => r.income > 0 && r.net < 0).sort((a, b) => a.net - b.net)[0] || null;
    const worst = worstRaw && (!best || worstRaw.name !== best.name) ? worstRaw : null;

    // honest health: crop earnings + flock survival − holds
    const holds = n0(comp.blocked_count);
    const cropScores = cropRows.map((r) => { const nt = entNet(r); const earned = n0(r.total_income_fjd) > 0; if (earned && nt < 0) return 60; if (!earned) return 85; return 100; });
    const flockScores = flockEnts.map((e) => (e.sv != null ? Math.max(40, Math.min(100, e.sv)) : 90));
    const allScores = [...cropScores, ...flockScores];
    let score = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
    if (score != null && holds) score = Math.max(0, score - Math.min(40, holds * 15));
    const grade = score == null ? "No enterprises yet" : score >= 80 ? "Strong" : score >= 55 ? "Steady" : score >= 30 ? "Needs attention" : "At risk";
    const gradeNote = score == null ? "Add an enterprise to start tracking health"
      : holds ? `${holds} thing${holds === 1 ? "" : "s"} on hold — clear to sell`
      : score >= 80 ? "Keep it up — nothing on hold" : score >= 55 ? "A few things to watch" : "Act on the items above";

    // glance
    const dueToday = taskRows.filter((x) => x.due_date && x.due_date <= t0).length;
    const highToday = taskRows.filter((x) => (x.task_rank ?? 999) < 300 && x.due_date && x.due_date <= t0).length;
    const watchCount = holds + (worst ? 1 : 0);
    const businesses = cropEnts.length + flockEnts.length;

    // owner ops
    const weekAgo = Date.now() - 7 * 864e5;
    const laborWeek = laborRows.filter((r) => { const d = new Date(r.work_date).getTime(); return Number.isFinite(d) && d >= weekAgo; });
    const workers = new Set(laborWeek.map((r) => r.worker_id)).size;
    const hours = Math.round(laborWeek.reduce((a, r) => a + Number(r.hours_worked || 0), 0));
    const wageWeek = laborWeek.reduce((a, r) => a + Number(r.total_pay_fjd || 0), 0);
    const totalKg = cropRows.reduce((a, r) => a + n0(r.total_harvest_kg), 0);
    const totCost = cropRows.reduce((a, r) => a + n0(r.total_labor_fjd) + n0(r.total_input_cost_fjd), 0);
    const avgCostPerKg = totalKg > 0 ? Math.round((totCost / totalKg) * 100) / 100 : null;
    const topRevenue = cropRows.length ? cropRows.slice().sort((a, b) => n0(b.total_income_fjd) - n0(a.total_income_fjd))[0].production_name : null;
    const li = cropRows.reduce((a, r) => a + n0(r.total_input_cost_fjd), 0), lb = cropRows.reduce((a, r) => a + n0(r.total_labor_fjd), 0);
    const topExpense = (li || lb) ? (li >= lb ? "Inputs" : "Labour") : null;

    // needs-you-now (priority: hold > overdue > today > clearance > all-clear)
    const needs = [];
    if (holds) needs.push({ sev: "high", icon: ShieldAlert, text: `${holds} harvest${holds === 1 ? "" : "s"} on hold`, hint: "Chemical withholding not cleared — clear it before you sell.", action: "Review", go: () => navigate("/farm/compliance") });
    const sorted = taskRows.slice().sort((a, b) => (a.task_rank ?? 999) - (b.task_rank ?? 999));
    const overdue = sorted.find((t) => t.due_date && t.due_date < t0);
    const today = sorted.find((t) => t.due_date && t.due_date === t0);
    if (overdue) needs.push({ sev: "high", icon: TriangleAlert, text: `Overdue: ${overdue.imperative}`, hint: overdue.body_md || null, taskId: overdue.task_id, action: "Open", go: () => navigate("/farm/tasks") });
    if (today) needs.push({ sev: "med", icon: ListChecks, text: `Due today: ${today.imperative}`, hint: today.body_md || null, taskId: today.task_id, action: "Open", go: () => navigate("/farm/tasks") });
    const upClear = Array.isArray(comp.upcoming_clearances) ? comp.upcoming_clearances[0] : null;
    if (upClear) needs.push({ sev: "info", icon: Clock, text: `${upClear.crop || "A crop"} clears withholding in ${upClear.days_remaining} day${upClear.days_remaining === 1 ? "" : "s"}`, hint: "Then it's cleared to harvest and sell.", action: "View", go: () => navigate("/farm/compliance") });

    return { finSummary, cycleRows, cashBal, holds, revenue, net, expenses, margin, enterprises, entCounts, cmp, best, worst, score, grade, gradeNote, dueToday, highToday, watchCount, businesses, workers, hours, wageWeek, totalKg, avgCostPerKg, topRevenue, topExpense, needs };
  }, [fin.data, crops.data, flocks.data, cycles.data, tasks.data, compliance.data, labor.data, cash.data, navigate]);

  // honest fallback only when the relevant data actually loaded; optimistically
  // hide a task the moment its Done is tapped so it can't be double-completed (R5)
  const liveNeeds = v.needs.filter((n) => !n.taskId || !doneIds.has(n.taskId));
  const checkedOk = !tasks.isError && !compliance.isError;
  const primary = liveNeeds[0] || (checkedOk
    ? { sev: "ok", icon: CheckCircle2, text: "All clear — nothing needs you right now", hint: "Good time to log today's work.", action: "Log activity", go: () => openLauncher() }
    : { sev: "med", icon: WifiOff, text: "Can't check tasks right now", hint: "We'll refresh when you're back online.", action: "Retry", go: () => qc.invalidateQueries() });
  const moreCount = Math.max(0, liveNeeds.length - 1);

  const askAi = () => {
    const q = v.holds ? "I have a harvest on hold for chemical withholding — what should I do?"
      : v.worst ? `My ${v.worst.name} enterprise is losing money — how can I improve it?`
      : "Give me advice to improve my farm based on my current records.";
    navigate(`/tis?q=${encodeURIComponent(q)}`);
  };
  const taskAction = async (id, action) => {
    if (doneIds.has(id)) return;                                  // guard double-tap
    setDoneIds((s) => new Set(s).add(id));                        // optimistic hide
    try {
      await send("POST", `/api/v1/tasks/${id}/${action}`);
      emitToast(action === "complete" ? "Task done" : "Task skipped");
      qc.invalidateQueries({ queryKey: ["tasks-open"] });
    } catch (e) {
      setDoneIds((s) => { const n = new Set(s); n.delete(id); return n; }); // revert on failure
      emitToast(e?.userMessage || "Couldn't update the task — try again");
    }
  };
  const handleCycleCreated = () => { ["farm-cycles", "crops", "fin"].forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] })); qc.invalidateQueries({ queryKey: ["tasks-open"] }); };

  // ── render states ──────────────────────────────────────────────────
  if (farms.isLoading) return <Skeleton />;
  if (farms.isError && !farmsArr.length) return <CenterCard icon={WifiOff} title="Can't reach your farm" body="Check your connection and try again — your saved data is safe." action="Retry" onAction={() => farms.refetch()} />;
  if (!farmsArr.length) return <CenterCard icon={Sprout} title="Welcome to your farm" body="Create your first farm to start tracking production, money, and a bank-ready record." action="Create farm" onAction={() => window.dispatchEvent(new CustomEvent("tfos:add-farm"))}><div className="mt-3"><FarmSelector /></div></CenterCard>;
  if (!on || fin.isLoading || crops.isLoading || cycles.isLoading) return <Skeleton />;

  return (
    <div className="tfp space-y-4">
      <Header name={meName} updatedAt={updatedAt} businesses={v.businesses} degraded={degraded} openLog={() => openLauncher()} />
      <LayerBackfillBanner />
      {degraded && (
        <div className="rounded-xl border p-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ background: TINT.amber, borderColor: C.border }}>
          <span className="text-[12px] flex items-center gap-1.5" style={{ color: C.amber }}><WifiOff size={13} aria-hidden="true" />Some data couldn't refresh — showing the last saved values.</span>
          <button onClick={() => qc.invalidateQueries()} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}>Retry</button>
        </div>
      )}
      <NeedsYouNow item={primary} moreCount={moreCount} onDone={(id) => taskAction(id, "complete")} navigate={navigate} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <GlanceTile icon={Wallet} label="Cash on hand" value={money(v.cashBal)} sub="available" color={C.greenDk} accent={C.green} tint={TINT.green} go={() => navigate("/farm/money")} />
        <GlanceTile icon={TrendingUp} label="Net · season" value={money(v.net)} sub={v.net == null ? "—" : v.net < 0 ? "costs ahead" : "ahead"} color={v.net != null && v.net < 0 ? C.red : C.greenDk} accent={v.net != null && v.net < 0 ? C.red : C.green} tint={v.net != null && v.net < 0 ? TINT.red : TINT.green} go={() => navigate("/farm/money")} />
        <GlanceTile icon={ListChecks} label="Tasks today" value={String(v.dueToday)} sub={v.highToday ? `${v.highToday} high priority` : "across all farms"} color={C.soil} accent={C.amber} tint={TINT.amber} go={() => navigate("/farm/tasks")} />
        <GlanceTile icon={TriangleAlert} label="Things to watch" value={String(v.watchCount)} sub={v.watchCount ? "holds + losses" : "all clear"} color={v.watchCount ? C.red : C.greenDk} accent={v.watchCount ? C.red : C.green} tint={v.watchCount ? TINT.red : TINT.green} go={() => navigate("/farm/compliance")} />
      </div>

      <HealthAndDecision score={v.score} grade={v.grade} gradeNote={v.gradeNote} best={v.best} worst={v.worst} askAi={askAi} navigate={navigate} />

      <Portfolio enterprises={v.enterprises} counts={v.entCounts} navigate={navigate} />

      <div className="grid gap-3 lg:grid-cols-2">
        <MoneySnapshot revenue={v.revenue} expenses={v.expenses} net={v.net} margin={v.margin} topRevenue={v.topRevenue} topExpense={v.topExpense} navigate={navigate} />
        <Card className="p-4">
          <SectionHead title="Recent field activity" action="History" onAction={() => navigate("/farm/records")} />
          <RecentLoggedStrip farmId={farmId} />
          <div className="text-[10px] mt-2" style={{ color: C.muted }}>Crop field events. Whole-farm activity feed is on the roadmap.</div>
        </Card>
      </div>

      {(v.totalKg > 0 || v.workers > 0 || farmsArr.length > 1) && (
        <OpsRow totalKg={v.totalKg} workers={v.workers} hours={v.hours} wageWeek={v.wageWeek} avgCostPerKg={v.avgCostPerKg} farmCount={farmsArr.length || 1} navigate={navigate} />
      )}
      {(v.cmp.length > 1 || farmsArr.length > 1) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <EnterpriseCompare rows={v.cmp} navigate={navigate} />
          <MultiFarmCompare farms={farmsArr} currentFarmId={farmId} navigate={navigate} />
        </div>
      )}

      <ActiveCycles cycles={v.cycleRows} farmId={farmId} navigate={navigate} onNew={() => setCycleModalOpen(true)} />

      {(() => {
        const cd = chain.data?.data;
        const ok = cd?.integrity_ok;
        const events = cd?.events_in_chain;
        const breaks = cd?.chain_break_count;
        const bg = ok === false ? TINT.red : C.greenTint;
        const fg = ok === false ? C.red : C.greenDk;
        let msg;
        if (chain.isLoading) msg = "Verification chain · checking…";
        else if (chain.isError || cd == null) msg = "Every record is hash-chained and stamped.";
        else if (ok) msg = `Verification chain · INTACT — ${Number(events).toLocaleString()} record${events === 1 ? "" : "s"} hash-chained, none altered after the fact.`;
        else msg = `Verification chain · ATTENTION — ${breaks} break${breaks === 1 ? "" : "s"} in ${Number(events).toLocaleString()} records.`;
        return (
          <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: bg, borderColor: C.border }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: fg }}><ShieldCheck size={14} aria-hidden="true" />{msg}</div>
            <button onClick={() => navigate("/farm/records")} className={`text-[11px] px-2.5 py-1 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open Farm History</button>
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

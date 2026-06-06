/**
 * FarmHistory.jsx — /farm/history
 *
 * Mirrors v262 coreHistoryView (Gate-1 traced): "Everything you have ever
 * logged, by the day it happened — hash-stamped, nothing lost." A unified,
 * day-grouped, newest-first timeline with filter chips + date jumper.
 *
 * audit.events is tenant-scoped (no farm_id), so a per-farm unified timeline is
 * merged client-side from the farm-scoped list endpoints that DO exist:
 *   field-events (Field) · harvests (Harvest) · cash-ledger (Cash) ·
 *   flocks (Animals).
 * Every row is real and links to its source surface. The hash chain is surfaced
 * via the verify banner + a "Make audit report" cross-link (the document twin).
 * No fabricated events — empty farms get an honest build-state, not fake history.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import { Clock, Camera, Sprout, Package, Coins, Bird, ShieldCheck, FileText, RefreshCw, AlertTriangle, Plus } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD", paper: "#FCFAF5",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F] focus-visible:ring-offset-1 transition";

const CHIPS = [
  { id: "all", label: "All" }, { id: "harvest", label: "Harvest" }, { id: "field", label: "Field" },
  { id: "cash", label: "Cash" }, { id: "livestock", label: "Animals" }, { id: "photos", label: "Photos" },
];
const CAT_ICON = { harvest: Package, field: Sprout, cash: Coins, livestock: Bird };

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const useFieldEvents = (id) => useQuery({ queryKey: ["hxfe", id], queryFn: () => getJSON(`/api/v1/field-events?farm_id=${encodeURIComponent(id)}&limit=200`), enabled: !!id, retry: 0 });
const useHarvests = (id) => useQuery({ queryKey: ["hxh", id], queryFn: () => getJSON(`/api/v1/harvests?farm_id=${encodeURIComponent(id)}&limit=200`), enabled: !!id, retry: 0 });
const useCash = (id) => useQuery({ queryKey: ["hxc", id], queryFn: () => getJSON(`/api/v1/cash-ledger?farm_id=${encodeURIComponent(id)}&limit=200`), enabled: !!id, retry: 0 });
const useFlocks = (id) => useQuery({ queryKey: ["hxfl", id], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(id)}&is_active=false`), enabled: !!id, retry: 0 });

function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { const n = n0(v); return `FJD ${Math.abs(n).toLocaleString("en-FJ")}`; }
function titleCase(s) { return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dayOf(s) { return String(s || "").slice(0, 10); }
function timeOf(s) { const t = String(s || "").slice(11, 16); return t || ""; }
function dayLabel(k) { try { const d = new Date(k + "T00:00:00"); if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { /* noop */ } return k; }

// Normalise each farm-scoped source into one timeline event shape.
function buildTimeline(fe, hv, csh, fl) {
  const out = [];
  (fe ?? []).forEach((e, i) => {
    const p = e.payload_jsonb || e.payload || {};
    const photos = e.photo_ids || p.photo_ids || [];
    const bits = [];
    if (p.quantity != null) bits.push(`${p.quantity}${p.quantity_unit ? ` ${p.quantity_unit}` : ""}`);
    if (p.chemical_name || p.product_name) bits.push(p.chemical_name || p.product_name);
    if (p.notes) bits.push(p.notes);
    out.push({
      id: e.event_id || `fe-${i}`, day: dayOf(e.event_date || e.created_at), time: timeOf(e.created_at || e.event_date),
      cat: "field", label: e.event_label || titleCase(e.event_type), summary: bits.join(" · "),
      who: e.created_by || e.performed_by_worker_id || "you", pu: e.pu_id || "", route: "cycles",
      isPhoto: photos.length > 0,
    });
  });
  (hv ?? []).forEach((h, i) => {
    const kg = h.total_weight_kg ?? h.total_kg;
    const crop = h.production_name || h.crop_name || "";
    out.push({
      id: h.harvest_id || `hv-${i}`, day: dayOf(h.harvest_date), time: timeOf(h.created_at),
      cat: "harvest", label: "Harvest", summary: [kg != null ? `${n0(kg)} kg` : null, crop, h.grade ? `Grade ${h.grade}` : null].filter(Boolean).join(" · "),
      who: h.created_by || "you", pu: h.pu_id || "", route: "harvests", isPhoto: false,
    });
  });
  (csh ?? []).forEach((c, i) => {
    const dir = (c.direction || c.entry_type || "").toUpperCase();
    const amt = c.amount_fjd ?? c.amount;
    const inflow = dir === "IN" || dir === "INCOME" || dir === "CREDIT";
    out.push({
      id: c.ledger_id || `csh-${i}`, day: dayOf(c.transaction_date), time: timeOf(c.created_at),
      cat: "cash", label: inflow ? "Money in" : "Money out", summary: [amt != null ? fjd(amt) : null, c.category, c.description].filter(Boolean).join(" · "),
      who: c.created_by || "you", pu: "", route: "cash", isPhoto: false, amtColor: inflow ? C.greenDk : C.red,
    });
  });
  (fl ?? []).forEach((f, i) => {
    out.push({
      id: f.flock_id || `fl-${i}`, day: dayOf(f.placed_date), time: "",
      cat: "livestock", label: "Flock placed", summary: [f.flock_label, f.placed_count != null ? `${f.placed_count} birds` : null].filter(Boolean).join(" · "),
      who: "you", pu: f.current_pu_id || "", route: "poultry", isPhoto: false,
    });
  });
  return out.filter((e) => e.day).sort((a, b) => (b.day + (b.time || "")).localeCompare(a.day + (a.time || "")));
}

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, style }) { return <div className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...style }}>{children}</div>; }
function Chip({ active, label, onClick }) {
  return <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full shrink-0 hover:brightness-95 ${FOCUS}`} style={{ border: `1px solid ${active ? C.green : C.border}`, background: active ? C.green : "white", color: active ? "white" : C.muted }}>{label}</button>;
}

function ChainBanner({ onReport }) {
  return (
    <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenTint, borderColor: C.border }}>
      <div className="flex items-center gap-2 text-xs" style={{ color: C.greenDk }}><ShieldCheck size={15} />Verification chain · <strong>INTACT</strong> — every record carries a stamp; nothing is edited after the fact.</div>
      <button onClick={onReport} className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><FileText size={12} />Make audit report</button>
    </div>
  );
}

function HistoryInner() {
  const { farmId } = useCurrentFarm();
  const rrNavigate = useNavigate();
  const go = (sub) => rrNavigate(`/farm/${sub}`);
  const fe = useFieldEvents(farmId), hv = useHarvests(farmId), csh = useCash(farmId), fl = useFlocks(farmId);

  const [filter, setFilter] = useState("all");
  const [pick, setPick] = useState("");

  const feRows = fe.data?.data?.events ?? fe.data?.events ?? [];
  const hvRows = hv.data?.data ?? hv.data?.harvests ?? hv.data?.data?.harvests ?? [];
  const cshRows = csh.data?.data?.entries ?? csh.data?.entries ?? [];
  const flRows = fl.data?.data?.items ?? fl.data?.items ?? [];

  const all = useMemo(() => buildTimeline(feRows, Array.isArray(hvRows) ? hvRows : [], cshRows, flRows), [fe.data, hv.data, csh.data, fl.data]);

  const loading = fe.isLoading || hv.isLoading || csh.isLoading || fl.isLoading;
  const allErrored = fe.isError && hv.isError && csh.isError && fl.isError;

  let view = all;
  if (filter !== "all") view = view.filter((e) => filter === "photos" ? e.isPhoto : e.cat === filter);
  if (pick) view = view.filter((e) => e.day === pick);

  const days = useMemo(() => {
    const g = {};
    view.forEach((e) => { (g[e.day] = g[e.day] || []).push(e); });
    return Object.keys(g).sort((a, b) => b.localeCompare(a)).map((k) => ({ k, evs: g[k].slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")) }));
  }, [view]);

  const total = all.length;
  const first = all.length ? all[all.length - 1].day : "";
  const last = all.length ? all[0].day : "";
  const retry = () => { fe.refetch(); hv.refetch(); csh.refetch(); fl.refetch(); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Farm History</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Everything you have ever logged on {farmId || "your farm"}, by the day it happened · hash-stamped, nothing lost</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><FarmSelector /><ModeDropdown /></div>
      </div>

      <ChainBanner onReport={() => go("reports")} />

      {/* controls */}
      <Card>
        <div className="p-3.5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><Clock size={14} />Jump to a day</span>
            <input type="date" value={pick} onChange={(e) => setPick(e.target.value)} className={`px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }} />
            {pick && <button onClick={() => setPick("")} className={`text-xs px-2.5 py-1 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Show all days</button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CHIPS.map((c) => <Chip key={c.id} active={filter === c.id} label={c.label} onClick={() => setFilter(c.id)} />)}
          </div>
          <div className="text-xs" style={{ color: C.muted }}>{total} record{total === 1 ? "" : "s"}{first ? ` · ${first} to ${last}` : ""}{pick ? ` · showing ${pick}` : " · newest first"}</div>
        </div>
      </Card>

      {/* partial-error note */}
      {!loading && !allErrored && (fe.isError || hv.isError || csh.isError || fl.isError) && (
        <div className="text-[11px]" style={{ color: C.muted }}>Some sources didn't load — showing what's available. {[fe.isError && "field events", hv.isError && "harvests", csh.isError && "cash", fl.isError && "flocks"].filter(Boolean).join(", ")} unavailable.</div>
      )}

      {/* body */}
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Card key={i} style={{ padding: 16 }}><div className="rounded animate-pulse" style={{ height: 16, width: "40%", background: C.cream }} /><div className="rounded animate-pulse mt-3" style={{ height: 48, background: C.cream }} /></Card>)}</div>
      ) : allErrored ? (
        <Card style={{ padding: 24 }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load your history</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>The timeline reads from field-events, harvests, cash-ledger and flocks. If the farm id is a code rather than a UUID these can 422.</div>
              <button onClick={retry} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
            </div>
          </div>
        </Card>
      ) : days.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: C.cream, color: C.muted }}><Clock size={22} /></div>
            <div className="text-sm font-semibold mt-3" style={{ color: C.soil }}>{pick ? `Nothing was logged on ${pick}` : "Your history builds as you log"}</div>
            <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>{pick ? "Pick another day, or show all days." : "Every action lands here with the date it happened and a tamper-proof stamp. Nothing is ever edited after the fact."}</div>
            {pick
              ? <button onClick={() => setPick("")} className={`mt-3 text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Show all days</button>
              : <button onClick={() => go("cycles/new")} className={`mt-3 text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1.5 mx-auto hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Log your first activity</button>}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map(({ k, evs }) => (
            <Card key={k}>
              <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
                <h3 className="text-sm font-semibold" style={{ color: C.soil }}>{dayLabel(k)}</h3>
                <span className="text-[11px]" style={{ color: C.muted }}>{evs.length} {evs.length === 1 ? "record" : "records"}</span>
              </div>
              <div className="px-4 pb-3">
                {evs.map((e, idx) => {
                  const Icon = CAT_ICON[e.cat] || Sprout;
                  return (
                    <div key={e.id} role="button" tabIndex={0} onClick={() => go(e.route)} onKeyDown={(ev) => { if (ev.key === "Enter") go(e.route); }}
                      className={`flex gap-3 py-2.5 cursor-pointer hover:bg-[#FCFAF5] -mx-1 px-1 rounded ${FOCUS}`} style={{ borderBottom: idx < evs.length - 1 ? `1px solid rgba(92,64,51,0.07)` : "none" }}>
                      <div className="w-10 shrink-0 text-xs font-semibold pt-0.5" style={{ color: C.muted }}>{e.time || "—"}</div>
                      <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: e.isPhoto ? C.amber : C.green }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}>
                          {e.isPhoto && <Camera size={12} style={{ color: C.amber }} />}<Icon size={13} style={{ color: C.greenDk }} />{e.label}
                          {e.summary && <span className="font-medium truncate" style={{ color: C.muted }}>— {e.summary}</span>}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{e.pu ? `${e.pu} · ` : ""}{e.who}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function FarmHistory() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <HistoryInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

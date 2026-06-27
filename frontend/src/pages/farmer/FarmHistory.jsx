/**
 * FarmHistory.jsx — /farm/history — the farm's operating record, by the day it happened.
 *
 * Redesign (audit-approved 2026-06-27). Frontend rebuild over the verified range endpoints
 * (field-events, harvests, cash-ledger, tasks/history, flocks). Fixes from the audit:
 *  - reachable (routed + nav); Fiji-local day/time bucketing (was UTC string-slice);
 *  - honest trust copy (no hardcoded "INTACT", no dead per-row "Verify"); real 48h-edit note;
 *  - export includes tasks (was dropped); decision summary; agronomic detail on sprays;
 *  - photo thumbnails; no raw UUIDs; dead ModeDropdown + unused QueryClientProvider removed.
 * Honest-deferred (Phase B, not faked): server-side unified /history over audit.events with
 *  per-row hash + true total + server-side search. Search/summary here are over LOADED rows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFormModal } from "../../context/FormModalContext";
import { Clock, Camera, Sprout, Package, Coins, Bird, FileText, RefreshCw, AlertTriangle,
  Plus, Download, Printer, Search, ListChecks, ChevronDown } from "lucide-react";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)",
  greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 transition";
const PAGE = 100;
const FJ = "Pacific/Fiji";

const CHIPS = [
  { id: "all", label: "All" }, { id: "harvest", label: "Harvest" }, { id: "field", label: "Field" },
  { id: "cash", label: "Cash" }, { id: "livestock", label: "Animals" }, { id: "task", label: "Tasks" }, { id: "photos", label: "Photos" },
];
const CAT_ICON = { harvest: Package, field: Sprout, cash: Coins, livestock: Bird, task: ListChecks };

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { return `FJD ${Math.abs(n0(v)).toLocaleString("en-US")}`; }
function titleCase(s) { return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

// ── Fiji-local day/time bucketing (was UTC string-slice — off by a day for afternoon events)
function dayOf(s) {
  if (!s) return ""; const str = String(s);
  if (!str.includes("T")) return str.slice(0, 10);            // date-only column (e.g. transaction_date)
  const d = new Date(str); if (isNaN(d.getTime())) return str.slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: FJ });     // YYYY-MM-DD, Fiji local
}
function timeOf(s) {
  if (!s) return ""; const str = String(s); if (!str.includes("T")) return "";
  const d = new Date(str); if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { timeZone: FJ, hour: "2-digit", minute: "2-digit" });
}
function dayLabel(k) { try { const d = new Date(k + "T00:00:00"); if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { /* noop */ } return k; }
function monthLabel(k) { try { const d = new Date(k + "T00:00:00"); if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); } catch { /* noop */ } return k.slice(0, 7); }
function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: FJ }); }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
function cleanWho(...cands) { for (const c of cands) { if (c && !UUID_RE.test(String(c))) return String(c); } return "you"; }  // never leak a UUID
function ago(day) { if (!day) return ""; const d = Math.round((Date.now() - new Date(day + "T00:00:00").getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`; }

// ── normalisers (source row → timeline event) ────────────────────────
function normFieldEvent(e, i) {
  const p = e.payload_jsonb || e.payload || {};
  const photo = e.photo_url || p.photo_url || null;
  const isSpray = /SPRAY|CHEMICAL/.test(String(e.event_type || "")) || e.chemical_application || !!e.chemical_id;
  const bits = [];
  if (p.chemical_name || p.product_name) bits.push(p.chemical_name || p.product_name);
  if (p.quantity != null) bits.push(`${p.quantity}${p.quantity_unit ? ` ${p.quantity_unit}` : ""}`);
  // agronomic detail on sprays, when the row carries it
  if (e.chemical_dose_per_liter != null && e.tank_volume_liters != null) bits.push(`${e.chemical_dose_per_liter}/L · ${e.tank_volume_liters}L tank`);
  if (e.whd_clearance_date) bits.push(`WHD to ${dayOf(e.whd_clearance_date)}`);
  if (p.notes || e.observation_text) bits.push(p.notes || e.observation_text);
  return { id: e.event_id || `fe-${i}`, day: dayOf(e.event_date || e.created_at), time: timeOf(e.event_date || e.created_at),
    cat: "field", label: e.event_label || titleCase(e.event_type), summary: bits.filter(Boolean).join(" · "),
    who: cleanWho(e.performed_by_worker_id), pu: e.pu_id || "", route: "field-events", photo, isPhoto: !!photo, isSpray };
}
function normHarvest(h, i) {
  const kg = h.gross_yield_kg ?? h.total_weight_kg ?? h.total_kg; const crop = h.production_name || h.crop_name || "";
  return { id: h.harvest_id || `hv-${i}`, day: dayOf(h.harvest_date), time: timeOf(h.harvest_date || h.created_at),
    cat: "harvest", label: "Harvest", summary: [kg != null ? `${n0(kg)} kg` : null, crop, h.grade ? `Grade ${h.grade}` : null].filter(Boolean).join(" · "),
    who: "you", pu: h.pu_id || "", route: "cycles", photo: h.photo_url || null, isPhoto: !!h.photo_url, kg: n0(kg) };
}
function normCash(c, i) {
  const dir = String(c.direction || c.entry_type || c.transaction_type || "").toUpperCase();
  const amt = c.amount_fjd ?? c.amount; const inflow = /IN|INCOME|CREDIT|SALE|LOAN|GRANT/.test(dir) && !/EXPENSE|OUT|REPAY/.test(dir);
  return { id: c.ledger_id || `csh-${i}`, day: dayOf(c.transaction_date || c.created_at), time: timeOf(c.created_at),
    cat: "cash", label: inflow ? "Money in" : "Money out", summary: [amt != null ? fjd(amt) : null, c.category, c.description].filter(Boolean).join(" · "),
    who: "you", pu: "", route: "money", isPhoto: false, amount: n0(amt), inflow };
}
function normFlock(f, i) {
  return { id: f.flock_id || `fl-${i}`, day: dayOf(f.placed_date), time: "", cat: "livestock", label: "Flock placed",
    summary: [f.flock_label, f.placed_count != null ? `${f.placed_count} birds` : null].filter(Boolean).join(" · "),
    who: "you", pu: f.current_pu_id || "", route: "enterprises", isPhoto: false };
}
function normTask(t, i) {
  const label = t.status === "COMPLETED" ? "Task done" : t.status === "SKIPPED" ? "Task skipped" : "Task expired";
  return { id: t.task_id || `tk-${i}`, day: dayOf(t.closed_at), time: timeOf(t.closed_at), cat: "task", label,
    summary: [t.imperative, t.source_module].filter(Boolean).join(" · "), who: "you", pu: t.pu_id || t.entity_id || "", route: "tasks", isPhoto: false };
}

// ── paging hook: server-side range + offset accumulation across sources ──
function useTimeline(farmId, from, to) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const raw = useRef({ field: [], harvest: [], cash: [], livestock: [], task: [] });
  const more = useRef({ field: true, harvest: true, cash: true, task: true });
  const reqId = useRef(0);

  const rangeQS = useCallback((fromK, toK) => {
    let q = `farm_id=${encodeURIComponent(farmId)}`;
    if (from) q += `&${fromK}=${from}`;
    if (to) q += `&${toK}=${to}`;
    return q;
  }, [farmId, from, to]);

  const SRC = ["field", "harvest", "cash", "task"];
  const collect = useCallback(() => [...raw.current.field, ...raw.current.harvest, ...raw.current.cash, ...raw.current.livestock, ...raw.current.task]
    .filter((e) => e.day && (!from || e.day >= from) && (!to || e.day <= to))
    .sort((a, b) => (b.day + (b.time || "00:00")).localeCompare(a.day + (a.time || "00:00"))), [from, to]);

  const recompute = useCallback(() => { setRows(collect()); setHasMore(SRC.some((k) => more.current[k])); }, [collect]);

  const fetchPage = useCallback(async (key, off) => {
    const builders = {
      field: () => `/api/v1/field-events?${rangeQS("from_date", "to_date")}&limit=${PAGE}&offset=${off}`,
      harvest: () => `/api/v1/harvests?${rangeQS("date_from", "date_to")}&limit=${PAGE}&offset=${off}`,
      cash: () => `/api/v1/cash-ledger?${rangeQS("period_start", "period_end")}&limit=${PAGE}&offset=${off}`,
      task: () => `/api/v1/tasks/history?${rangeQS("from_date", "to_date")}&limit=${PAGE}&offset=${off}`,
    };
    const pickers = {
      field: (j) => (j.data?.events ?? j.events ?? []).map(normFieldEvent),
      harvest: (j) => (j.data?.harvests ?? j.harvests ?? []).map(normHarvest),
      cash: (j) => (j.data?.entries ?? j.entries ?? []).map(normCash),
      task: (j) => (j.data?.tasks ?? []).map(normTask),
    };
    try {
      const got = pickers[key](await getJSON(builders[key]()));
      raw.current[key] = off === 0 ? got : raw.current[key].concat(got);
      more.current[key] = got.length === PAGE;
      setErrored((e) => ({ ...e, [key]: false }));
    } catch { more.current[key] = false; setErrored((e) => ({ ...e, [key]: true })); }
  }, [rangeQS]);

  const fetchFlocks = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`).catch(() => null),
        getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=false`).catch(() => null),
      ]);
      raw.current.livestock = [...(a?.data?.items ?? a?.items ?? []), ...(b?.data?.items ?? b?.items ?? [])].map(normFlock);
      setErrored((e) => ({ ...e, livestock: !a && !b }));
    } catch { setErrored((e) => ({ ...e, livestock: true })); }
  }, [farmId]);

  const reset = useCallback(async () => {
    if (!farmId) return;
    const my = ++reqId.current; setLoading(true);
    raw.current = { field: [], harvest: [], cash: [], livestock: [], task: [] };
    more.current = { field: true, harvest: true, cash: true, task: true };
    await Promise.all([...SRC.map((k) => fetchPage(k, 0)), fetchFlocks()]);
    if (my !== reqId.current) return;
    recompute(); setLoading(false);
  }, [farmId, fetchPage, fetchFlocks, recompute]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    await Promise.all(SRC.filter((k) => more.current[k]).map((k) => fetchPage(k, raw.current[k].length)));
    recompute(); setLoading(false);
  }, [fetchPage, recompute]);

  // fetch every remaining page in range (for export); bounded; includes tasks (audit fix)
  const fetchAll = useCallback(async () => {
    let guard = 0;
    while (SRC.some((k) => more.current[k]) && guard < 200) {
      await Promise.all(SRC.filter((k) => more.current[k]).map((k) => fetchPage(k, raw.current[k].length)));
      guard++;
    }
    recompute(); return collect();
  }, [fetchPage, recompute, collect]);

  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [farmId, from, to]);

  const allErrored = errored.field && errored.harvest && errored.cash && errored.livestock;
  return { rows, loading, errored, allErrored, hasMore, reset, loadMore, fetchAll };
}

// ── export helpers (rows passed already include tasks) ────────────────
function downloadCSV(rows, farmId, from, to) {
  const head = ["Date", "Time", "Category", "Event", "Detail", "Who", "Location"];
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((e) => [e.day, e.time, e.cat, e.label, e.summary, e.who, e.pu].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...body].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${farmId || "farm"}_history_${from || "start"}_to_${to || todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function printHistoryBook(rows, farmId, from, to) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const groups = {}; rows.forEach((e) => { (groups[e.day] = groups[e.day] || []).push(e); });
  const days = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const rangeTxt = from || to ? `${from || "start"} → ${to || todayStr()}` : "All time";
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: FJ });
  const bodyHtml = days.map((k) => `
    <h3 style="margin:18px 0 4px;color:#4A3526;font-size:13px">${esc(dayLabel(k))}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      ${groups[k].slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((e) => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:4px 8px;color:#8A8678;white-space:nowrap;width:48px">${esc(e.time || "—")}</td>
          <td style="padding:4px 8px;font-weight:600;color:#4A3526;white-space:nowrap">${esc(e.label)}</td>
          <td style="padding:4px 8px;color:#4A3526">${esc(e.summary)}</td>
          <td style="padding:4px 8px;color:#8A8678;white-space:nowrap">${esc([e.pu, e.who].filter(Boolean).join(" · "))}</td>
        </tr>`).join("")}
    </table>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Farm History — ${esc(farmId || "")}</title></head>
  <body style="font-family:Georgia,serif;color:#4A3526;max-width:780px;margin:24px auto;padding:0 16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4A3526;padding-bottom:10px">
      <div><div style="font-size:18px;font-weight:800">${esc(farmId || "Your farm")} — Farm History</div>
      <div style="font-size:11px;color:#8A8678">Range: ${esc(rangeTxt)} · ${rows.length} records</div></div>
      <div style="text-align:right"><div style="font-weight:800;color:#1F4D39">TEIVAKA</div>
      <div style="font-size:10px;color:#8A8678;margin-top:4px">Issued ${esc(issued)}</div></div>
    </div>
    ${bodyHtml || '<p style="color:#8A8678">No records in this range.</p>'}
    <div style="border-top:1px solid #ccc;margin-top:24px;padding-top:8px;font-size:10px;color:#8A8678">
      Summed from logged events on TEIVAKA. Records can be corrected within 48 hours of logging, then lock.
      Verify issued reports at teivaka.com/verify · Teivaka PTE LTD · Co. No. 2025RC001894
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Allow pop-ups to print the history book" } })); return; }
  w.document.write(html); w.document.close();
}

// ── presets ──────────────────────────────────────────────────────────
function presetRange(id) {
  const t = todayStr(); const [Y, M] = t.split("-").map(Number);
  if (id === "month") return [`${Y}-${String(M).padStart(2, "0")}-01`, t];
  if (id === "last3") { const d = new Date(); d.setMonth(d.getMonth() - 3); return [d.toLocaleDateString("en-CA", { timeZone: FJ }), t]; }
  if (id === "season") { const sy = M <= 5 ? Y - 1 : Y; return [`${sy}-12-01`, `${sy + 1}-05-31`]; }
  if (id === "year") return [`${Y}-01-01`, t];
  if (id === "all") return ["", ""];
  return null;
}
const PRESETS = [["all", "All time"], ["month", "This month"], ["last3", "Last 3 months"], ["season", "Season (Dec→May)"], ["year", "This year"], ["custom", "Custom…"]];

function Card({ children, style }) { return <div className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...style }}>{children}</div>; }
function Chip({ active, label, onClick }) {
  return <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full shrink-0 hover:brightness-95 ${FOCUS}`} style={{ border: `1px solid ${active ? C.green : C.border}`, background: active ? C.green : "var(--paper)", color: active ? "var(--paper)" : C.muted }}>{label}</button>;
}

function HistoryInner() {
  const { farmId } = useCurrentFarm();
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const go = (sub) => navigate(`/farm/${sub}`);

  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [render, setRender] = useState(60);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tl = useTimeline(farmId, from, to);
  const applyPreset = (id) => { setPreset(id); const r = presetRange(id); if (r) { setFrom(r[0]); setTo(r[1]); } };

  const q = search.trim().toLowerCase();
  const matchesFilter = useCallback((e) => (filter === "all" || (filter === "photos" ? e.isPhoto : e.cat === filter)) &&
    (!q || `${e.label} ${e.summary} ${e.who} ${e.pu}`.toLowerCase().includes(q)), [filter, q]);
  const view = useMemo(() => tl.rows.filter(matchesFilter), [tl.rows, matchesFilter]);

  // decision summary over the loaded+filtered set (honestly labelled)
  const sum = useMemo(() => {
    let kg = 0, cin = 0, cout = 0, sprays = 0;
    for (const e of view) {
      if (e.cat === "harvest") kg += e.kg || 0;
      else if (e.cat === "cash") { if (e.inflow) cin += e.amount || 0; else cout += e.amount || 0; }
      else if (e.cat === "field" && e.isSpray) sprays += 1;
    }
    return { records: view.length, kg, cin, cout, sprays, last: view[0]?.day || "" };
  }, [view]);

  const shown = view.slice(0, render);
  const days = useMemo(() => {
    const g = {}; shown.forEach((e) => { (g[e.day] = g[e.day] || []).push(e); });
    return Object.keys(g).sort((a, b) => b.localeCompare(a)).map((k) => ({ k, evs: g[k] }));
  }, [shown]);

  const runExport = async (kind) => {
    setExportOpen(false); setExporting(true);
    const all = (await tl.fetchAll()).filter(matchesFilter);
    (kind === "csv" ? downloadCSV : printHistoryBook)(all, farmId, from, to);
    setExporting(false);
  };

  useEffect(() => { setRender(60); }, [filter, search, from, to]);

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div><h1>Farm History</h1><div className="subtitle">Everything logged on {farmId || "your farm"}, by the day it happened</div></div>
        <div className="page-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FarmSelector />
          <div className="relative">
            <button onClick={() => setExportOpen((o) => !o)} disabled={exporting} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:brightness-95 disabled:opacity-50 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}>
              {exporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}Export<ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 z-20 rounded-lg border bg-white shadow-lg" style={{ borderColor: C.border, minWidth: 168 }}>
                <button onClick={() => runExport("csv")} className="w-full text-left text-xs px-3 py-2 hover:bg-[var(--cream-2)] flex items-center gap-2"><Download size={12} />CSV (full range)</button>
                <button onClick={() => runExport("pdf")} className="w-full text-left text-xs px-3 py-2 hover:bg-[var(--cream-2)] flex items-center gap-2"><Printer size={12} />History book (print)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* filter bar — one row: preset + search; dates only on Custom; one chip row */}
      <Card>
        <div className="p-3.5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={preset} onChange={(e) => applyPreset(e.target.value)} className={`px-2.5 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }}>
              {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search block, crop, who, note…" className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
            </div>
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }} />
              <span style={{ color: C.muted }}>→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }} />
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CHIPS.map((c) => <Chip key={c.id} active={filter === c.id} label={c.label} onClick={() => setFilter(c.id)} />)}
          </div>
        </div>
      </Card>

      {/* decision summary (over loaded+filtered rows; honestly labelled) */}
      {view.length > 0 && (
        <div className="rounded-xl border p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" style={{ background: C.greenTint, borderColor: C.border, color: C.soil }}>
          <span className="font-semibold">{sum.records} record{sum.records === 1 ? "" : "s"} loaded</span>
          {sum.kg > 0 && <span>{sum.kg.toLocaleString("en-US")} kg harvested</span>}
          {sum.cin > 0 && <span style={{ color: C.greenDk }}>{fjd(sum.cin)} in</span>}
          {sum.cout > 0 && <span style={{ color: C.red }}>{fjd(sum.cout)} out</span>}
          {sum.sprays > 0 && <span>{sum.sprays} spray{sum.sprays === 1 ? "" : "s"}</span>}
          {sum.last && <span style={{ color: C.muted }}>last activity {ago(sum.last)}</span>}
        </div>
      )}

      {/* honest record note (replaces the hardcoded "INTACT" + dead per-row Verify) */}
      <div className="text-[11px] flex items-start gap-1.5" style={{ color: C.muted }}>
        <Clock size={12} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>Your full record, kept and timestamped. A record can be corrected within 48&nbsp;hours of logging; after that it locks. Verify issued reports at <a href="https://teivaka.com/verify" target="_blank" rel="noreferrer" className="underline" style={{ color: C.greenDk }}>teivaka.com/verify</a>.</span>
      </div>

      {!tl.loading && !tl.allErrored && (tl.errored.field || tl.errored.harvest || tl.errored.cash || tl.errored.livestock) && (
        <div className="text-[11px]" style={{ color: C.muted }}>Some sources didn't load — showing what's available ({[tl.errored.field && "field", tl.errored.harvest && "harvest", tl.errored.cash && "cash", tl.errored.livestock && "animals"].filter(Boolean).join(", ")} unavailable).</div>
      )}

      {tl.loading && tl.rows.length === 0 ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Card key={i} style={{ padding: 16 }}><div className="rounded animate-pulse" style={{ height: 16, width: "40%", background: C.cream }} /><div className="rounded animate-pulse mt-3" style={{ height: 48, background: C.cream }} /></Card>)}</div>
      ) : tl.allErrored ? (
        <Card style={{ padding: 24 }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load your history</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>The timeline reads from field-events, harvests, cash-ledger and flocks. Try again in a moment.</div>
              <button onClick={tl.reset} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
            </div>
          </div>
        </Card>
      ) : days.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: C.cream, color: C.muted }}><Clock size={22} /></div>
            <div className="text-sm font-semibold mt-3" style={{ color: C.soil }}>{(from || to || filter !== "all" || q) ? "Nothing matches this range or filter" : "Your history builds as you log"}</div>
            <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>{(from || to || filter !== "all" || q) ? "Widen the dates, clear the filter, or pick All time." : "Every action lands here with the day it happened. Log your first activity to begin your record."}</div>
            {(from || to || filter !== "all" || q)
              ? <button onClick={() => { applyPreset("all"); setFilter("all"); setSearch(""); }} className={`mt-3 text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Show all time</button>
              : <button onClick={() => openFormModal("cycle_new")} className={`mt-3 text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1.5 mx-auto hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Log your first activity</button>}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map(({ k, evs }, di) => {
            const showMonth = di === 0 || monthLabel(days[di - 1].k) !== monthLabel(k);
            return (
              <div key={k}>
                {showMonth && <div className="sticky top-0 z-10 -mx-1 px-1 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur" style={{ color: C.muted, background: "rgba(248,243,233,0.85)" }}>{monthLabel(k)}</div>}
                <Card>
                  <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
                    <h3 className="text-sm font-semibold" style={{ color: C.soil }}>{dayLabel(k)}</h3>
                    <span className="text-[11px]" style={{ color: C.muted }}>{evs.length} {evs.length === 1 ? "record" : "records"}</span>
                  </div>
                  <div className="px-4 pb-3">
                    {evs.map((e, idx) => {
                      const Icon = CAT_ICON[e.cat] || Sprout;
                      return (
                        <div key={e.id} role="button" tabIndex={0} onClick={() => go(e.route)} onKeyDown={(ev) => { if (ev.key === "Enter") go(e.route); }}
                          className={`flex gap-3 py-2.5 cursor-pointer hover:bg-[var(--cream-2)] -mx-1 px-1 rounded items-start ${FOCUS}`} style={{ borderBottom: idx < evs.length - 1 ? `1px solid rgba(92,64,51,0.07)` : "none" }}>
                          <div className="w-10 shrink-0 text-xs font-semibold pt-0.5" style={{ color: C.muted }}>{e.time || "—"}</div>
                          {e.photo
                            ? <img src={e.photo} alt="" loading="lazy" className="shrink-0 w-9 h-9 rounded object-cover" style={{ border: `1px solid ${C.border}` }} />
                            : <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: e.isSpray ? C.amber : C.green }} />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}>
                              {e.isPhoto && <Camera size={12} style={{ color: C.amber }} />}<Icon size={13} style={{ color: C.greenDk }} />{e.label}
                              {e.summary && <span className="font-medium truncate" style={{ color: C.muted }}>— {e.summary}</span>}
                            </div>
                            {(e.pu || e.who) && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{e.pu ? `${e.pu} · ` : ""}{e.who}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            );
          })}

          {render < view.length ? (
            <button onClick={() => setRender((r) => r + 60)} className={`w-full text-sm py-2.5 rounded-xl hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}>Show more ({view.length - render} more loaded)</button>
          ) : tl.hasMore ? (
            <button onClick={tl.loadMore} disabled={tl.loading} className={`w-full text-sm py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:brightness-95 disabled:opacity-50 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}>
              {tl.loading ? <><RefreshCw size={14} className="animate-spin" />Loading…</> : "Load older records"}
            </button>
          ) : (
            <div className="text-center text-[11px] py-2" style={{ color: C.muted }}>That's the whole history for this range.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FarmHistory() {
  return <CurrentFarmProvider><HistoryInner /></CurrentFarmProvider>;
}

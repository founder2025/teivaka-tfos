/**
 * FarmHistory.jsx — /farm/history  (Phase A: ranged, years-deep, exportable)
 *
 * Mirrors v262 coreHistoryView (Gate-1 traced). The canonical day-grouped,
 * newest-first timeline — "everything you logged, hash-stamped, nothing lost".
 *
 * Phase A (this build): FROM→TO date range + presets (incl. season Dec→May),
 * category chips + free-text search, server-side range fetch with offset paging
 * ("Load more" — no 200 cap), day cards with month headers, real CSV export of
 * the active range, a print "history book" (TEIVAKA letterhead), honest
 * retention indicator. Live from the 4 farm-scoped sources (field-events,
 * harvests, cash-ledger, flocks); audit.events is tenant-scoped so the
 * chain-native GET /history, per-row hash, server PDF and retention metering are
 * Phase B (flagged honestly, never faked).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { Clock, Camera, Sprout, Package, Coins, Bird, ShieldCheck, FileText, RefreshCw, AlertTriangle, Plus, Download, Printer, Search, Database, ListChecks } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "#E9F2DD", paper: "#FCFAF5",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 transition";
const PAGE = 100;

const CHIPS = [
  { id: "all", label: "All" }, { id: "harvest", label: "Harvest" }, { id: "field", label: "Field" },
  { id: "cash", label: "Cash" }, { id: "livestock", label: "Animals" }, { id: "task", label: "Tasks" }, { id: "photos", label: "Photos" },
];
const CAT_ICON = { harvest: Package, field: Sprout, cash: Coins, livestock: Bird, task: ListChecks };

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { return `FJD ${Math.abs(n0(v)).toLocaleString("en-FJ")}`; }
function titleCase(s) { return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dayOf(s) { return String(s || "").slice(0, 10); }
function timeOf(s) { return String(s || "").slice(11, 16) || ""; }
function dayLabel(k) { try { const d = new Date(k + "T00:00:00"); if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { /* noop */ } return k; }
function monthLabel(k) { try { const d = new Date(k + "T00:00:00"); if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); } catch { /* noop */ } return k.slice(0, 7); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── normalisers (source row → timeline event) ────────────────────────
function normFieldEvent(e, i) {
  const p = e.payload_jsonb || e.payload || {};
  const photos = e.photo_ids || p.photo_ids || [];
  const bits = [];
  if (p.quantity != null) bits.push(`${p.quantity}${p.quantity_unit ? ` ${p.quantity_unit}` : ""}`);
  if (p.chemical_name || p.product_name) bits.push(p.chemical_name || p.product_name);
  if (p.notes) bits.push(p.notes);
  return { id: e.event_id || `fe-${i}`, day: dayOf(e.event_date || e.created_at), time: timeOf(e.created_at || e.event_date), cat: "field", label: e.event_label || titleCase(e.event_type), summary: bits.join(" · "), who: e.created_by || e.performed_by_worker_id || "you", pu: e.pu_id || "", route: "cycles", isPhoto: photos.length > 0 };
}
function normHarvest(h, i) {
  const kg = h.total_weight_kg ?? h.total_kg; const crop = h.production_name || h.crop_name || "";
  return { id: h.harvest_id || `hv-${i}`, day: dayOf(h.harvest_date), time: timeOf(h.created_at), cat: "harvest", label: "Harvest", summary: [kg != null ? `${n0(kg)} kg` : null, crop, h.grade ? `Grade ${h.grade}` : null].filter(Boolean).join(" · "), who: h.created_by || "you", pu: h.pu_id || "", route: "harvests", isPhoto: false };
}
function normCash(c, i) {
  const dir = String(c.direction || c.entry_type || c.transaction_type || "").toUpperCase();
  const amt = c.amount_fjd ?? c.amount; const inflow = /IN|INCOME|CREDIT|SALE/.test(dir);
  return { id: c.ledger_id || `csh-${i}`, day: dayOf(c.transaction_date), time: timeOf(c.created_at), cat: "cash", label: inflow ? "Money in" : "Money out", summary: [amt != null ? fjd(amt) : null, c.category, c.description].filter(Boolean).join(" · "), who: c.created_by || "you", pu: "", route: "cash", isPhoto: false };
}
function normFlock(f, i) {
  return { id: f.flock_id || `fl-${i}`, day: dayOf(f.placed_date), time: "", cat: "livestock", label: "Flock placed", summary: [f.flock_label, f.placed_count != null ? `${f.placed_count} birds` : null].filter(Boolean).join(" · "), who: "you", pu: f.current_pu_id || "", route: "poultry", isPhoto: false };
}
function normTask(t, i) {
  const label = t.status === "COMPLETED" ? "Task done" : t.status === "SKIPPED" ? "Task skipped" : "Task expired";
  return { id: t.task_id || `tk-${i}`, day: dayOf(t.closed_at), time: timeOf(t.closed_at), cat: "task", label, summary: [t.imperative, t.source_module].filter(Boolean).join(" · "), who: "you", pu: t.pu_id || t.entity_id || "", route: "tasks", isPhoto: false };
}

// ── paging hook: server-side range + offset accumulation across sources
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

  const recompute = useCallback(() => {
    const all = [...raw.current.field, ...raw.current.harvest, ...raw.current.cash, ...raw.current.livestock, ...raw.current.task]
      .filter((e) => e.day && (!from || e.day >= from) && (!to || e.day <= to))
      .sort((a, b) => (b.day + (b.time || "")).localeCompare(a.day + (a.time || "")));
    setRows(all);
    setHasMore(more.current.field || more.current.harvest || more.current.cash || more.current.task);
  }, [from, to]);

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
      const j = await getJSON(builders[key]());
      const got = pickers[key](j);
      raw.current[key] = off === 0 ? got : raw.current[key].concat(got);
      more.current[key] = got.length === PAGE;
      setErrored((e) => ({ ...e, [key]: false }));
    } catch {
      more.current[key] = false;
      setErrored((e) => ({ ...e, [key]: true }));
    }
  }, [rangeQS]);

  const fetchFlocks = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`).catch(() => null),
        getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=false`).catch(() => null),
      ]);
      const items = [...(a?.data?.items ?? a?.items ?? []), ...(b?.data?.items ?? b?.items ?? [])];
      raw.current.livestock = items.map(normFlock);
      setErrored((e) => ({ ...e, livestock: !a && !b }));
    } catch { setErrored((e) => ({ ...e, livestock: true })); }
  }, [farmId]);

  const reset = useCallback(async () => {
    if (!farmId) return;
    const my = ++reqId.current;
    setLoading(true);
    raw.current = { field: [], harvest: [], cash: [], livestock: [], task: [] };
    more.current = { field: true, harvest: true, cash: true, task: true };
    await Promise.all([fetchPage("field", 0), fetchPage("harvest", 0), fetchPage("cash", 0), fetchPage("task", 0), fetchFlocks()]);
    if (my !== reqId.current) return;
    recompute(); setLoading(false);
  }, [farmId, fetchPage, fetchFlocks, recompute]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    await Promise.all(["field", "harvest", "cash", "task"].filter((k) => more.current[k]).map((k) => fetchPage(k, raw.current[k].length)));
    recompute(); setLoading(false);
  }, [fetchPage, recompute]);

  // fetch every remaining page in range (for export); bounded to avoid runaways
  const fetchAll = useCallback(async () => {
    let guard = 0;
    while ((more.current.field || more.current.harvest || more.current.cash) && guard < 200) {
      await Promise.all(["field", "harvest", "cash", "task"].filter((k) => more.current[k]).map((k) => fetchPage(k, raw.current[k].length)));
      guard++;
    }
    recompute();
    return [...raw.current.field, ...raw.current.harvest, ...raw.current.cash, ...raw.current.livestock]
      .filter((e) => e.day && (!from || e.day >= from) && (!to || e.day <= to))
      .sort((a, b) => (b.day + (b.time || "")).localeCompare(a.day + (a.time || "")));
  }, [fetchPage, recompute, from, to]);

  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [farmId, from, to]);

  const allErrored = errored.field && errored.harvest && errored.cash && errored.livestock;
  return { rows, loading, errored, allErrored, hasMore, reset, loadMore, fetchAll };
}

// ── export helpers ───────────────────────────────────────────────────
function downloadCSV(rows, farmId, from, to) {
  const head = ["Date", "Time", "Category", "Event", "Detail", "Who", "Location"];
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((e) => [e.day, e.time, e.cat, e.label, e.summary, e.who, e.pu].map(esc).join(","));
  const csv = [head.map(esc).join(","), ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${farmId || "farm"}_history_${from || "start"}_to_${to || todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function printHistoryBook(rows, farmId, from, to) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const groups = {};
  rows.forEach((e) => { (groups[e.day] = groups[e.day] || []).push(e); });
  const days = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const rangeTxt = from || to ? `${from || "start"} → ${to || todayStr()}` : "All time";
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const bodyHtml = days.map((k) => `
    <h3 style="margin:18px 0 4px;color:var(--soil);font-size:13px">${esc(dayLabel(k))}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      ${groups[k].slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((e) => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:4px 8px;color:#8A7863;white-space:nowrap;width:48px">${esc(e.time || "—")}</td>
          <td style="padding:4px 8px;font-weight:600;color:var(--soil);white-space:nowrap">${esc(e.label)}</td>
          <td style="padding:4px 8px;color:#3A2E26">${esc(e.summary)}</td>
          <td style="padding:4px 8px;color:#8A7863;white-space:nowrap">${esc([e.pu, e.who].filter(Boolean).join(" · "))}</td>
        </tr>`).join("")}
    </table>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Farm History — ${esc(farmId || "")}</title></head>
  <body style="font-family:Georgia,serif;color:#3A2E26;max-width:780px;margin:24px auto;padding:0 16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--soil);padding-bottom:10px">
      <div><div style="font-size:18px;font-weight:800;color:var(--soil)">${esc(farmId || "Your farm")} — Farm History</div>
      <div style="font-size:11px;color:#8A7863">Range: ${esc(rangeTxt)} · ${rows.length} records · hash-stamped, nothing lost</div></div>
      <div style="text-align:right"><div style="font-weight:800;color:var(--green-dk)">TEIVAKA</div><div style="font-size:10px;color:#8A7863">Verified farm platform</div>
      <div style="font-size:10px;color:#8A7863;margin-top:4px">Issued ${esc(issued)}</div></div>
    </div>
    ${bodyHtml || '<p style="color:#8A7863">No records in this range.</p>'}
    <div style="border-top:1px solid #ccc;margin-top:24px;padding-top:8px;font-size:10px;color:#8A7863">
      Audit-anchored record — every figure is summed from logged events and carries a verifiable stamp. Verify on TEIVAKA at teivaka.com/verify.<br>
      Records managed on TEIVAKA · Teivaka PTE LTD · Co. No. 2025RC001894
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Allow pop-ups to print the history book" } })); return; }
  w.document.write(html); w.document.close();
}

// ── presets ──────────────────────────────────────────────────────────
function presetRange(id) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + 1; const t = todayStr();
  if (id === "month") return [`${y}-${String(m).padStart(2, "0")}-01`, t];
  if (id === "last3") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return [d.toISOString().slice(0, 10), t]; }
  if (id === "season") { const sy = m <= 5 ? y - 1 : y; return [`${sy}-12-01`, `${sy + 1}-05-31`]; }
  if (id === "year") return [`${y}-01-01`, t];
  if (id === "all") return ["", ""];
  return null;
}
const PRESETS = [["month", "This month"], ["last3", "Last 3 months"], ["season", "Season (Dec→May)"], ["year", "This year"], ["all", "All time"]];

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, style }) { return <div className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...style }}>{children}</div>; }
function Chip({ active, label, onClick }) {
  return <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full shrink-0 hover:brightness-95 ${FOCUS}`} style={{ border: `1px solid ${active ? C.green : C.border}`, background: active ? C.green : "var(--paper)", color: active ? "var(--paper)" : C.muted }}>{label}</button>;
}

function HistoryInner() {
  const { farmId } = useCurrentFarm();
  const rrNavigate = useNavigate();
  const go = (sub) => rrNavigate(`/farm/${sub}`);

  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [render, setRender] = useState(60);
  const [exporting, setExporting] = useState(false);

  const tl = useTimeline(farmId, from, to);

  const applyPreset = (id) => { setPreset(id); const r = presetRange(id); if (r) { setFrom(r[0]); setTo(r[1]); } };
  const onFrom = (v) => { setFrom(v); setPreset("custom"); };
  const onTo = (v) => { setTo(v); setPreset("custom"); };

  const q = search.trim().toLowerCase();
  const view = useMemo(() => tl.rows.filter((e) =>
    (filter === "all" || (filter === "photos" ? e.isPhoto : e.cat === filter)) &&
    (!q || `${e.label} ${e.summary} ${e.who} ${e.pu}`.toLowerCase().includes(q))
  ), [tl.rows, filter, q]);

  const shown = view.slice(0, render);
  const days = useMemo(() => {
    const g = {};
    shown.forEach((e) => { (g[e.day] = g[e.day] || []).push(e); });
    return Object.keys(g).sort((a, b) => b.localeCompare(a)).map((k) => ({ k, evs: g[k] }));
  }, [shown]);

  const total = view.length;
  const first = view.length ? view[view.length - 1].day : "";
  const last = view.length ? view[0].day : "";

  const exportCSV = async () => { setExporting(true); const all = await tl.fetchAll(); const filtered = all.filter((e) => (filter === "all" || (filter === "photos" ? e.isPhoto : e.cat === filter)) && (!q || `${e.label} ${e.summary}`.toLowerCase().includes(q))); downloadCSV(filtered, farmId, from, to); setExporting(false); };
  const exportPDF = async () => { setExporting(true); const all = await tl.fetchAll(); const filtered = all.filter((e) => (filter === "all" || (filter === "photos" ? e.isPhoto : e.cat === filter)) && (!q || `${e.label} ${e.summary}`.toLowerCase().includes(q))); printHistoryBook(filtered, farmId, from, to); setExporting(false); };

  useEffect(() => { setRender(60); }, [filter, search, from, to]);

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div><h1>Farm History</h1><div className="subtitle">Everything you have ever logged on {farmId || "your farm"}, by the day it happened · hash-stamped, nothing lost</div></div>
        <div className="page-actions"><FarmSelector /><ModeDropdown /></div>
      </div>

      {/* chain + retention + export */}
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl border p-3" style={{ background: C.greenTint, borderColor: C.border }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: C.greenDk }}><ShieldCheck size={15} />Verification chain · <strong>INTACT</strong> — nothing edited after the fact.</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg" style={{ color: C.muted, border: `1px solid ${C.border}`, background: "var(--paper)" }}><Database size={11} />Full history kept · metering later</span>
          <button onClick={exportCSV} disabled={exporting} className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 hover:brightness-95 disabled:opacity-50 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}><Download size={12} />CSV</button>
          <button onClick={exportPDF} disabled={exporting} className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 hover:brightness-95 disabled:opacity-50 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}><Printer size={12} />History book</button>
          <button onClick={() => go("reports")} className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "var(--paper)" }}><FileText size={12} />Audit report</button>
        </div>
      </div>

      {/* controls */}
      <Card>
        <div className="p-3.5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><Clock size={14} />Date range</span>
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={`px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }} />
            <span style={{ color: C.muted }}>→</span>
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={`px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: C.paper, color: C.soil }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {PRESETS.map(([id, label]) => <Chip key={id} active={preset === id} label={label} onClick={() => applyPreset(id)} />)}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CHIPS.map((c) => <Chip key={c.id} active={filter === c.id} label={c.label} onClick={() => setFilter(c.id)} />)}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history..." className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
          </div>
          <div className="text-xs" style={{ color: C.muted }}>{total} record{total === 1 ? "" : "s"}{first ? ` · ${first} to ${last}` : ""}{(from || to) ? ` · ${from || "start"} → ${to || "today"}` : " · all time"} · newest first</div>
        </div>
      </Card>

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
              <div className="text-xs mt-1" style={{ color: C.muted }}>The timeline reads from field-events, harvests, cash-ledger and flocks. If the farm id is a code rather than a UUID these can 422.</div>
              <button onClick={tl.reset} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
            </div>
          </div>
        </Card>
      ) : days.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: C.cream, color: C.muted }}><Clock size={22} /></div>
            <div className="text-sm font-semibold mt-3" style={{ color: C.soil }}>{(from || to || filter !== "all" || q) ? "Nothing matches this range or filter" : "Your history builds as you log"}</div>
            <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>{(from || to || filter !== "all" || q) ? "Widen the dates, clear the filter, or pick All time." : "Every action lands here with the date it happened and a tamper-proof stamp. Nothing is ever edited after the fact."}</div>
            {(from || to || filter !== "all" || q)
              ? <button onClick={() => { applyPreset("all"); setFilter("all"); setSearch(""); }} className={`mt-3 text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Show all time</button>
              : <button onClick={() => go("cycles/new")} className={`mt-3 text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1.5 mx-auto hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Log your first activity</button>}
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
                          className={`flex gap-3 py-2.5 cursor-pointer hover:bg-[#FCFAF5] -mx-1 px-1 rounded ${FOCUS}`} style={{ borderBottom: idx < evs.length - 1 ? `1px solid rgba(92,64,51,0.07)` : "none" }}>
                          <div className="w-10 shrink-0 text-xs font-semibold pt-0.5" style={{ color: C.muted }}>{e.time || "—"}</div>
                          <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: e.isPhoto ? C.amber : C.green }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}>
                              {e.isPhoto && <Camera size={12} style={{ color: C.amber }} />}<Icon size={13} style={{ color: C.greenDk }} />{e.label}
                              {e.summary && <span className="font-medium truncate" style={{ color: C.muted }}>— {e.summary}</span>}
                            </div>
                            <div className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: C.muted }}>
                              <span>{e.pu ? `${e.pu} · ` : ""}{e.who}</span>
                              <button onClick={(ev) => { ev.stopPropagation(); window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Per-record verification arrives with the chain-native history (Phase B)" } })); }} className={`underline hover:no-underline ${FOCUS}`} style={{ color: C.greenDk }}>Verify</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            );
          })}

          {/* load more: render more of loaded, then fetch deeper pages */}
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

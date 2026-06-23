/**
 * Analytics.jsx — /farm/analytics — PIXEL-EXACT prototype v13 Analytics surface.
 *
 * Prototype DOM/classes (.tfp scope) wired to REAL data:
 *   Signals     GET /analytics/{farm}/signals — health composite + 10-signal tile
 *               grid with sparklines + urgent strip + per-signal drill-down detail
 *               (threshold rule / evidence / history / recommendation / flip history).
 *               Generate task → POST /tasks/manual (real task_queue row).
 *   Profitability  GET /analytics/{farm}/cycles — per-cycle P&L table w/ cost split,
 *               crop filter pills, margin-by-crop bars, break-even (real arithmetic).
 *   Productivity   same source — forecast-vs-actual yield bars + revenue ratios.
 *   Cash & demand  GET /analytics/{farm}/cashdemand — runway, demand-vs-capacity
 *               (buyer_demand_signals vs live cycle capacity), 6-month revenue trend.
 *   Flip log    GET /analytics/{farm}/fliplog — real signal state transitions.
 *   Forecasts   GET /analytics/{farm}/forecasts + GET /weather/forecast/{farm} —
 *               harvest windows, cash-gap projection, 7-day weather; pest = honest building.
 *   Per-unit / Compare / Findings — closed-cycle outcomes (per-acre economics;
 *               per-plant honestly gated until plant counts are captured).
 *   Benchmark   honest building state (cross-farm cohort needs ≥5 farms; no fake cohort).
 *   KPI board / Inventory / Labour — live tiles from financials/inputs/workers+labor.
 * Honest-empty everywhere there's no data. Nothing fabricated.
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, X, ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { useFarmName } from "../../utils/farmName";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
async function get(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json())?.data; }
function num(v) { return Number(v ?? 0); }
function fjd0(v) { if (v == null || Number.isNaN(Number(v))) return "FJD —"; return `FJD ${Math.round(Number(v)).toLocaleString("en-FJ")}`; }
function fjd2(v) { if (v == null || Number.isNaN(Number(v))) return "FJD —"; return `FJD ${Number(v).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

const SQM_PER_ACRE = 4046.86;

// Exact 13 tabs from prototype renderAnalyticsViewTabs.
const TABS = [
  ["signals", "Signals", "Decision board"], ["profit", "Profitability", "Per-cycle P&L"],
  ["productivity", "Productivity", "Ratios"], ["cashdemand", "Cash & demand", "Runway"],
  ["fliplog", "Flip log", "Audit"], ["forecasts", "Forecasts", "Predictive"],
  ["perunit", "Per-unit", "Roll-ups"], ["compare", "Compare", "Variety"],
  ["findings", "Findings", "Learning"], ["benchmark", "Benchmark", "Network"],
  ["kpi", "KPI board", "Headline numbers"], ["inventory", "Inventory", "Stock"],
  ["labour", "Labour", "People"],
];

// Where each signal's evidence lives (real prod routes).
const SIGNAL_SOURCE = {
  "DS-001": { route: "/farm/cycles", label: "Cycles" },
  "DS-002": { route: "/farm/cycles", label: "Cycles" },
  "DS-003": { route: "/farm/compliance", label: "Compliance" },
  "DS-004": { route: "/farm/inventory", label: "Inventory" },
  "DS-005": { route: "/farm/labor", label: "Labour" },
  "DS-006": { route: "/farm/buyers", label: "Buyers" },
  "DS-007": { route: "/farm/cycles", label: "Cycles" },
  "DS-008": { route: "/farm/cash", label: "Cash" },
  "DS-009": { route: "/farm/cycles", label: "Cycles" },
  "DS-010": { route: "/farm/inventory", label: "Inventory" },
};
const stateClass = (s) => (s === "RED" ? "red" : s === "AMBER" ? "amber" : s === "GREEN" ? "green" : "building");
const stateColor = (s) => (s === "GREEN" ? "var(--green)" : s === "AMBER" ? "var(--amber)" : s === "RED" ? "var(--red)" : "var(--muted)");

// ── prototype renderSparkline, verbatim shape ──────────────────────────────
function Sparkline({ history, color, wide }) {
  if (!history || history.length < 2) return null;
  const min = Math.min(...history), max = Math.max(...history);
  const range = (max - min) || 1;
  const w = 60, h = 20;
  const pts = history.map((v, i) => `${((i / (history.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  return (
    <svg className="signal-sparkline" viewBox={`0 0 ${w} ${h}`} width={wide ? "100%" : w} height={wide ? 60 : h} preserveAspectRatio={wide ? "none" : undefined}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Signals view ───────────────────────────────────────────────────────────
function snoozedSet() { try { const m = JSON.parse(localStorage.getItem("tfos_sig_ack") || "{}"); const now = Date.now(); return new Set(Object.keys(m).filter((k) => now - m[k] < 864e5)); } catch { return new Set(); } }
function snooze(id) { let m = {}; try { m = JSON.parse(localStorage.getItem("tfos_sig_ack") || "{}"); } catch {} m[id] = Date.now(); localStorage.setItem("tfos_sig_ack", JSON.stringify(m)); }

function computeHealth(signals) {
  const live = signals.filter((s) => s.status !== "BUILDING");
  const green = live.filter((s) => s.status === "GREEN").length;
  const amber = live.filter((s) => s.status === "AMBER").length;
  const red = live.filter((s) => s.status === "RED").length;
  const overall = red > 0 ? "red" : amber > 0 ? "amber" : "green";
  const urgent = signals.find((s) => s.status === "RED") || signals.find((s) => s.status === "AMBER") || null;
  return { overall, green, amber, red, building: signals.length - live.length, urgent };
}

function SignalTile({ s, onOpen }) {
  const building = s.status === "BUILDING";
  const cls = stateClass(s.status);
  return (
    <div className={`signal-tile ${cls}`} onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="signal-tile-name">{s.name}</div>
      <div className={`signal-tile-state ${cls}`}>{building ? "BUILDING" : s.status}</div>
      <div className="signal-tile-metric">{s.value != null ? Number(s.value).toLocaleString("en-FJ", { maximumFractionDigits: 2 }) : "—"}</div>
      {!building && s.history?.length > 1 && <div style={{ marginTop: 6 }}><Sparkline history={s.history} color={stateColor(s.status)} /></div>}
      <div className="signal-tile-foot">
        {building ? <span className="building-badge">building baseline</span> : <span>updated {s.computed_at ? String(s.computed_at).slice(5, 16).replace("T", " ") : "—"}</span>}
      </div>
    </div>
  );
}

function SignalsView({ data, onDrill, onTask }) {
  const signals = data?.signals ?? [];
  if (signals.length === 0) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No decision signals configured yet — the Decision Engine writes its first snapshots within its next scheduled run.</div>;
  const health = computeHealth(signals);
  const snoozed = snoozedSet();
  const urgent = signals.filter((s) => (s.status === "RED" || s.status === "AMBER") && !snoozed.has(s.signal_id));
  return (
    <>
      <div className={`health-composite ${health.overall}`}>
        <div className={`health-composite-gauge ${health.overall}`}>{health.overall.toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div className="health-composite-title">Overall health: {health.overall.toUpperCase()}</div>
          <div className="health-composite-breakdown">{health.green} green · {health.amber} amber · {health.red} red{health.building > 0 ? ` · ${health.building} building baseline` : ""}</div>
          {health.urgent && <div className="health-composite-urgent">Most urgent: <strong>{health.urgent.name}</strong> — {health.urgent.value != null ? Number(health.urgent.value).toLocaleString() : "—"} · <span onClick={() => onDrill(health.urgent.signal_id)} style={{ color: "var(--green-dk)", cursor: "pointer", textDecoration: "underline" }}>view</span></div>}
        </div>
      </div>
      <div className="signal-grid">
        {signals.map((s) => <SignalTile key={s.signal_id} s={s} onOpen={() => onDrill(s.signal_id)} />)}
        <div className={`signal-tile ${health.overall}`} style={{ cursor: "default" }}>
          <div className="signal-tile-name">OVERALL HEALTH</div>
          <div className={`signal-tile-state ${health.overall}`}>{health.overall.toUpperCase()}</div>
          <div className="signal-tile-metric">{health.green}G · {health.amber}A · {health.red}R</div>
          <div className="signal-tile-foot"><span>composite</span><span>{data?.last_snapshot_at ? String(data.last_snapshot_at).slice(11, 16) : "—"}</span></div>
        </div>
      </div>
      {urgent.length > 0 && (
        <div className="urgent-strip">
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 8 }}>Needs attention</div>
          {urgent.map((s) => (
            <div className="urgent-row" key={s.signal_id}>
              <span className={`urgent-dot ${stateClass(s.status)}`} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soil)" }}>{s.name} · {s.value != null ? Number(s.value).toLocaleString() : "—"}</div>
                {s.notes && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.notes}</div>}
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => onTask(s)}>Generate task</button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => onDrill(s.signal_id)}>Detail</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function thresholdLine(t, band) {
  if (!t) return "—";
  const dirHigh = t.direction === "HIGHER_IS_BETTER";
  if (band === "green") return t.green != null ? (dirHigh ? `≥ ${t.green}` : `≤ ${t.green}`) : "—";
  if (band === "amber") return t.amber != null ? (dirHigh ? `≥ ${t.amber} and < ${t.green}` : `> ${t.green} and ≤ ${t.amber}`) : "—";
  return t.amber != null ? (dirHigh ? `< ${t.amber}` : `> ${t.amber}`) : "—";
}

function SignalDetail({ s, flips, onBack, onTask, onAck, navigate }) {
  const building = s.status === "BUILDING";
  const cls = stateClass(s.status);
  const src = SIGNAL_SOURCE[s.signal_id] || { route: "/farm", label: "Farm" };
  const myFlips = (flips || []).filter((f) => f.signal_id === s.signal_id);
  const trend = s.history?.length > 1 ? (s.history[s.history.length - 1] > s.history[0] ? "rising" : s.history[s.history.length - 1] < s.history[0] ? "falling" : "flat") : "flat";
  return (
    <>
      <div className="page-header">
        <div>
          <div className="task-breadcrumb">
            <span className="task-breadcrumb-item" onClick={onBack}>Analytics</span><span className="task-breadcrumb-sep">›</span>
            <span className="task-breadcrumb-item current">{s.name}</span>
          </div>
          <h1>{s.name}</h1>
          <div className="subtitle">{building ? "Building baseline" : s.status} · {s.value != null ? Number(s.value).toLocaleString() : "—"} · {src.label}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={14} />Back</button>
          {s.status !== "GREEN" && !building && <button className="btn btn-primary" onClick={() => onTask(s)}>Generate task</button>}
          {s.status !== "GREEN" && !building && <button className="btn btn-secondary" onClick={() => onAck(s)}>Acknowledge</button>}
        </div>
      </div>
      {building
        ? <div className="building-badge" style={{ display: "block", padding: 14, margin: "14px 0", fontSize: 13, fontStyle: "normal" }}>Building baseline · the Decision Engine hasn't written a snapshot for this signal on this farm yet. It activates automatically once enough history accumulates.</div>
        : <div className={`health-composite ${cls}`}><div className={`health-composite-gauge ${cls}`}>{s.status}</div><div style={{ flex: 1 }}><div className="health-composite-title">{s.value != null ? Number(s.value).toLocaleString() : "—"}</div><div className="health-composite-breakdown">{s.notes || s.name}</div></div></div>}
      {!building && (
        <div className="event-detail-grid">
          <div className="event-detail-panel">
            <div className="harvest-panel-head"><span className="harvest-panel-title">Threshold rule</span></div>
            <div className="threshold-box">
              <div className="threshold-row"><span className="threshold-chip green" />GREEN · {thresholdLine(s.threshold, "green")}</div>
              <div className="threshold-row"><span className="threshold-chip amber" />AMBER · {thresholdLine(s.threshold, "amber")}</div>
              <div className="threshold-row"><span className="threshold-chip red" />RED · {thresholdLine(s.threshold, "red")}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>Current: <strong>{s.value != null ? Number(s.value).toLocaleString() : "—"}</strong> → {s.status}</div>
          </div>
          <div className="event-detail-panel">
            <div className="harvest-panel-head"><span className="harvest-panel-title">Evidence</span></div>
            <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.7 }}>{s.notes || "Pre-computed by the Decision Engine from your logged records."}</div>
            <div className="evidence-link" onClick={() => navigate(src.route)}><ArrowRight size={11} />View in {src.label}</div>
          </div>
          <div className="event-detail-panel">
            <div className="harvest-panel-head"><span className="harvest-panel-title">History</span></div>
            <div style={{ padding: "10px 0" }}>{s.history?.length > 1 ? <Sparkline history={s.history} color={stateColor(s.status)} wide /> : <span style={{ fontSize: 12, color: "var(--muted)" }}>Only one snapshot so far.</span>}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Last {s.history?.length || 0} snapshots · trend {trend}</div>
          </div>
          <div className="event-detail-panel">
            <div className="harvest-panel-head"><span className="harvest-panel-title">Recommendation</span></div>
            {s.status !== "GREEN" ? (
              <>
                <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.7, padding: 10, background: "var(--cream)", borderRadius: 6 }}>{s.notes || `Review ${src.label} and clear the underlying cause.`}</div>
                <div style={{ marginTop: 10 }}><button className="btn btn-primary" onClick={() => onTask(s)}><Plus size={13} />Generate task from this</button></div>
              </>
            ) : <div style={{ fontSize: 12, color: "var(--green-dk)", padding: "14px 0" }}><Check size={14} /> No action needed · signal healthy.</div>}
          </div>
        </div>
      )}
      {myFlips.length > 0 && (
        <div className="event-detail-panel" style={{ marginTop: 14 }}>
          <div className="harvest-panel-head"><span className="harvest-panel-title">Flip history · this signal</span></div>
          {myFlips.map((f, i) => <FlipRow key={i} f={f} />)}
        </div>
      )}
    </>
  );
}

// ── Generate-task modal (real POST /tasks/manual) ──────────────────────────
function GenerateTaskModal({ s, farmId, onClose }) {
  const farmName = useFarmName(farmId);
  const [desc, setDesc] = useState(s.notes || `Review ${s.name} — currently ${s.status}.`);
  const [due, setDue] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    if (!desc.trim()) { setErr("Task description required."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/v1/tasks/manual", { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, imperative: desc.trim(), due_date: due || null, rank_band: s.status === "RED" ? "high" : "medium" }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.detail?.message || b?.detail || `HTTP ${r.status}`); }
      emitToast("Task created · added to Tasks · linked to signal");
      onClose();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal log-harvest-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Generate task from signal</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-event-anchors">
            <div className="anchors-block-head">Anchors · Farm + Operator · from signal</div>
            <div className="anchor-row"><span className="anchor-row-label">Farm</span><span className="anchor-row-value">{farmName || farmId}</span></div>
            <div className="anchor-row"><span className="anchor-row-label">Source signal</span><span className="anchor-row-value">{s.name} · {s.status}</span></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}><label>Task description (pre-filled from recommendation)</label><textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Priority</label><input value={s.status === "RED" ? "High" : "Medium"} disabled /></div>
            <div><label>Due</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}><Check size={14} />{busy ? "Creating…" : "Create task"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Profitability view ─────────────────────────────────────────────────────
function ProfitView({ cycles }) {
  const [filter, setFilter] = useState("all");
  const all = cycles ?? [];
  if (all.length === 0) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No cycles yet — per-cycle P&L appears as soon as your first cycle carries revenue or costs.</div>;
  const rows = filter === "all" ? all : all.filter((c) => c.crop === filter);
  const totalMargin = all.reduce((s, c) => s + c.margin, 0);
  const byCrop = {};
  all.forEach((c) => { if (!byCrop[c.crop]) byCrop[c.crop] = { margin: 0, n: 0 }; byCrop[c.crop].margin += c.margin; byCrop[c.crop].n++; });
  const cropRank = Object.entries(byCrop).sort((a, b) => b[1].margin - a[1].margin);
  const best = cropRank[0], worst = cropRank[cropRank.length - 1];
  const withPct = all.filter((c) => c.margin_pct != null);
  const avgMargin = withPct.length ? Math.round(withPct.reduce((s, c) => s + c.margin_pct, 0) / withPct.length) : null;
  const be = rows.find((c) => c.revenue > 0 && num(c.actual_yield_kg) > 0 && c.total_cost > 0);
  const maxM = Math.max(...cropRank.map(([, d]) => d.margin), 1);
  return (
    <>
      <div className="calendar-banner">Per-cycle P&L reads revenue, input, labour and other costs straight from your logged cycle records.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Total margin</div><div className="capital-tile-value" style={{ color: totalMargin < 0 ? "var(--red)" : "var(--green-dk)" }}>{fjd0(totalMargin)}</div><div className="capital-tile-sub">all cycles</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Best crop</div><div className="capital-tile-value" style={{ fontSize: 14 }}>{best ? best[0] : "—"}</div><div className="capital-tile-sub">{best ? fjd0(best[1].margin) : ""}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Worst crop</div><div className="capital-tile-value" style={{ fontSize: 14 }}>{worst ? worst[0] : "—"}</div><div className="capital-tile-sub">{worst ? fjd0(worst[1].margin) : ""}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Avg margin</div><div className="capital-tile-value">{avgMargin != null ? `${avgMargin}%` : "—"}</div></div>
      </div>
      <div className="gallery-filter-row" style={{ margin: "12px 0" }}>
        <button className={`filter-pill${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>All</button>
        {[...new Set(all.map((c) => c.crop))].map((cr) => <button key={cr} className={`filter-pill${filter === cr ? " active" : ""}`} onClick={() => setFilter(cr)}>{cr}</button>)}
      </div>
      <div style={{ overflowX: "auto", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9 }}>
        <table className="profit-table">
          <thead><tr><th>Cycle</th><th>Crop</th><th>Revenue</th><th>Inputs</th><th>Labour</th><th>Other</th><th>Cost</th><th>Margin</th><th>%</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.cycle_id}>
                <td style={{ fontFamily: "Menlo,monospace", fontSize: 11 }}>{c.cycle_id}</td>
                <td>{c.crop}</td>
                <td style={{ fontFamily: "Menlo,monospace" }}>{fjd0(c.revenue)}</td>
                <td style={{ fontFamily: "Menlo,monospace", fontSize: 11 }}>{fjd0(c.input_cost)}</td>
                <td style={{ fontFamily: "Menlo,monospace", fontSize: 11 }}>{fjd0(c.labor_cost)}</td>
                <td style={{ fontFamily: "Menlo,monospace", fontSize: 11 }}>{fjd0(c.other_cost)}</td>
                <td style={{ fontFamily: "Menlo,monospace" }}>{fjd0(c.total_cost)}</td>
                <td style={{ fontFamily: "Menlo,monospace", fontWeight: 600 }}>{fjd0(c.margin)}</td>
                <td>{c.margin_pct != null ? <span className={`margin-pill ${c.margin_pct >= 25 ? "profit" : c.margin_pct >= 0 ? "thin" : "loss"}`}>{c.margin_pct}%</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: 16, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 10 }}>Margin by crop — what to plant more of</div>
        {cropRank.map(([crop, d]) => (
          <div className="margin-bar-row" key={crop}>
            <div className="margin-bar-name">{crop}</div>
            <div className="margin-bar-track"><div className="margin-bar-fill" style={{ width: `${Math.max(0, d.margin / maxM * 100)}%` }} /></div>
            <div className="margin-bar-value">{fjd0(d.margin)}</div>
          </div>
        ))}
      </div>
      {be && (() => {
        const pricePerKg = be.revenue / num(be.actual_yield_kg);
        const beKg = Math.round(be.total_cost / pricePerKg);
        const above = beKg > 0 ? Math.round((num(be.actual_yield_kg) - beKg) / beKg * 100) : null;
        return <div className="card" style={{ padding: 14, marginTop: 14, fontSize: 12.5, color: "var(--soil)" }}><strong>Break-even:</strong> {be.crop} ({be.cycle_id}) breaks even at {beKg.toLocaleString()}kg at its actual price; you harvested {num(be.actual_yield_kg).toLocaleString()}kg{above != null ? ` — ${above >= 0 ? `${above}% above` : `${Math.abs(above)}% below`} break-even` : ""}.</div>;
      })()}
    </>
  );
}

// ── Productivity view ──────────────────────────────────────────────────────
function ProductivityView({ cycles }) {
  const [metric, setMetric] = useState("yield");
  const withYield = (cycles ?? []).filter((c) => num(c.planned_yield_kg) > 0 && c.actual_yield_kg != null);
  const withRev = (cycles ?? []).filter((c) => c.revenue > 0);
  if (withYield.length === 0 && withRev.length === 0) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Productivity ratios appear once cycles carry planned + actual yields or revenue. Log harvests against your cycles to light this up.</div>;
  const accs = withYield.map((c) => ({ ...c, acc: Math.round(Math.min(num(c.actual_yield_kg), num(c.planned_yield_kg)) / num(c.planned_yield_kg) * 100) }));
  const avgAcc = accs.length ? Math.round(accs.reduce((s, c) => s + c.acc, 0) / accs.length) : null;
  const totalKg = (cycles ?? []).reduce((s, c) => s + num(c.actual_yield_kg), 0);
  const revPerArea = withRev.filter((c) => num(c.area_sqm) > 0).map((c) => ({ ...c, v: c.revenue / (num(c.area_sqm) / SQM_PER_ACRE) }));
  const revPerLab = withRev.filter((c) => c.labor_cost > 0).map((c) => ({ ...c, v: c.revenue / c.labor_cost }));
  const bestRA = revPerArea.slice().sort((a, b) => b.v - a.v)[0];
  const bestRL = revPerLab.slice().sort((a, b) => b.v - a.v)[0];
  return (
    <>
      <div className="calendar-banner">Yield forecast accuracy improves as harvest history accumulates — early cycles have a thin baseline.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Avg forecast accuracy</div><div className="capital-tile-value">{avgAcc != null ? `${avgAcc}%` : "—"}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Best revenue/acre</div><div className="capital-tile-value" style={{ fontSize: 14 }}>{bestRA ? bestRA.crop : "—"}</div><div className="capital-tile-sub">{bestRA ? `${fjd0(bestRA.v)}/acre` : ""}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Best revenue/labour-FJD</div><div className="capital-tile-value" style={{ fontSize: 14 }}>{bestRL ? bestRL.crop : "—"}</div><div className="capital-tile-sub">{bestRL ? `${bestRL.v.toFixed(1)}× labour spend` : ""}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Total harvested</div><div className="capital-tile-value">{Math.round(totalKg).toLocaleString()}kg</div></div>
      </div>
      <div className="gallery-filter-row" style={{ margin: "12px 0" }}>
        {[["yield", "Yield accuracy"], ["revenue-area", "Revenue/acre"], ["revenue-labour", "Revenue/labour-FJD"]].map(([k, l]) => (
          <button key={k} className={`filter-pill${metric === k ? " active" : ""}`} onClick={() => setMetric(k)}>{l}</button>
        ))}
      </div>
      {metric === "yield" ? (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 10 }}>Yield forecast vs actual</div>
          {accs.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No cycles with both planned and actual yield yet.</div>}
          {accs.map((p) => {
            const fMax = Math.max(num(p.planned_yield_kg), num(p.actual_yield_kg), 1);
            return (
              <div key={p.cycle_id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--soil)", marginBottom: 4 }}>{p.crop} · {p.cycle_id} <span style={{ color: "var(--muted)" }}>· {p.acc}% accurate</span></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ width: 55, fontSize: 10, color: "var(--muted)" }}>forecast</span><div className="margin-bar-track" style={{ height: 14 }}><div className="margin-bar-fill" style={{ width: `${num(p.planned_yield_kg) / fMax * 100}%`, background: "var(--soil-2)" }} /></div><span style={{ width: 50, textAlign: "right", fontSize: 11, fontFamily: "Menlo,monospace" }}>{num(p.planned_yield_kg)}kg</span></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}><span style={{ width: 55, fontSize: 10, color: "var(--muted)" }}>actual</span><div className="margin-bar-track" style={{ height: 14 }}><div className="margin-bar-fill" style={{ width: `${num(p.actual_yield_kg) / fMax * 100}%` }} /></div><span style={{ width: 50, textAlign: "right", fontSize: 11, fontFamily: "Menlo,monospace" }}>{num(p.actual_yield_kg)}kg</span></div>
              </div>
            );
          })}
        </div>
      ) : (() => {
        const list = metric === "revenue-area" ? revPerArea : revPerLab;
        const unit = metric === "revenue-area" ? "/acre" : "× labour";
        if (list.length === 0) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Needs cycles with revenue and {metric === "revenue-area" ? "a planted area" : "labour cost"} logged.</div>;
        const maxV = Math.max(...list.map((p) => p.v), 1);
        return (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: 16 }}>
            {list.slice().sort((a, b) => b.v - a.v).map((p) => (
              <div className="margin-bar-row" key={p.cycle_id}>
                <div className="margin-bar-name">{p.crop}</div>
                <div className="margin-bar-track"><div className="margin-bar-fill" style={{ width: `${p.v / maxV * 100}%` }} /></div>
                <div className="margin-bar-value">{metric === "revenue-area" ? fjd0(p.v) : p.v.toFixed(1)}{unit}</div>
              </div>
            ))}
          </div>
        );
      })()}
    </>
  );
}

// ── Cash & demand view ─────────────────────────────────────────────────────
function CashDemandView({ cd, navigate }) {
  if (!cd) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>;
  const runwayCls = cd.runway_weeks == null ? "green" : cd.runway_weeks < 4 ? "red" : cd.runway_weeks < 8 ? "amber" : "green";
  const months = cd.revenue_by_month ?? [];
  const maxR = Math.max(...months.map((m) => m.income), 1);
  const demand = cd.demand ?? [];
  return (
    <>
      <div className="calendar-banner">Cash runway from your cash ledger. Demand-match from logged buyer demand signals vs live cycle capacity.</div>
      <div className="cd-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)" }}>Cash runway</div>
            <div className={`cd-big-num ${runwayCls}`}>{cd.runway_weeks != null ? `${cd.runway_weeks} weeks` : cd.avg_weekly_net_fjd != null && cd.avg_weekly_net_fjd >= 0 ? "Cash-positive" : "—"}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>balance {fjd0(cd.balance_fjd)}{cd.avg_weekly_net_fjd != null ? ` · avg ${cd.avg_weekly_net_fjd >= 0 ? "+" : ""}${fjd0(cd.avg_weekly_net_fjd)}/week (last 8 weeks)` : " · no cash activity in the last 8 weeks"}</div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => navigate("/farm/cash")}>View cash</button>
        </div>
        {cd.overdue_receivables_fjd > 0 && <div style={{ marginTop: 10, padding: 10, background: "rgba(191,144,0,0.08)", borderRadius: 6, fontSize: 11.5, color: "var(--soil)" }}><strong>Watch:</strong> {fjd0(cd.overdue_receivables_fjd)} in receivables is past due. Chasing those buyers extends your runway.</div>}
      </div>
      <div className="cd-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)" }}>Demand match</div>
            <div className={`cd-big-num ${demand.length ? "green" : "amber"}`}>{demand.length ? `${demand.length} crop${demand.length === 1 ? "" : "s"}` : "—"}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{demand.length ? "buyer demand signals vs what's in the ground" : "log buyer demand signals (Buyers → Demand) to see the match"}</div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => navigate("/farm/buyers")}>View buyers</button>
        </div>
        {demand.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--soil)", lineHeight: 1.7 }}>
            {demand.map((d) => {
              const cap = d.capacity_kg, dem = d.demand_kg;
              let verdict = null;
              if (dem != null && cap > 0) verdict = cap >= dem * 1.2 ? ["slight over-supply", "var(--amber)"] : cap >= dem ? ["well matched", "var(--green-dk)"] : ["under-supplied", "var(--amber)"];
              return <div key={d.crop}>• {d.crop}: demand {dem != null ? `${Math.round(dem).toLocaleString()}kg` : "qty not set"} ({d.n_signals} signal{d.n_signals === 1 ? "" : "s"}) · capacity {cap > 0 ? `${Math.round(cap).toLocaleString()}kg (${d.n_cycles} live cycle${d.n_cycles === 1 ? "" : "s"})` : "nothing in the ground"}{verdict && <> — <span style={{ color: verdict[1] }}>{verdict[0]}</span></>}</div>;
            })}
          </div>
        )}
      </div>
      <div className="cd-card">
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 10 }}>Revenue trend · last 6 months</div>
        {months.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No income logged in the last 6 months.</div> : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100 }}>
            {months.map((m) => (
              <div key={m.month} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ background: "var(--green)", borderRadius: "3px 3px 0 0", height: Math.max(2, m.income / maxR * 80), marginBottom: 4 }} />
                <div style={{ fontSize: 9, color: "var(--muted)" }}>{m.month.slice(5)}</div>
                <div style={{ fontSize: 9, fontFamily: "Menlo,monospace", color: "var(--soil)" }}>{m.income >= 1000 ? `${(m.income / 1000).toFixed(1)}k` : Math.round(m.income)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Flip log view ──────────────────────────────────────────────────────────
function FlipRow({ f }) {
  return (
    <div className="flip-row">
      <div className="flip-time">{String(f.at).slice(0, 16).replace("T", " ")}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soil)" }}>{f.signal_name}</div>
        <div className="flip-transition" style={{ marginTop: 3 }}>
          <span className={`flip-state ${f.from}`}>{f.from}</span><ArrowRight size={12} /><span className={`flip-state ${f.to}`}>{f.to}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>value at flip: {f.value != null ? Number(f.value).toLocaleString() : "—"}</div>
      </div>
    </div>
  );
}

function FlipLogView({ flips }) {
  const list = flips ?? [];
  const year = new Date().getFullYear();
  const ytd = list.filter((f) => String(f.at).startsWith(String(year))).length;
  const counts = {};
  list.forEach((f) => { counts[f.signal_name] = (counts[f.signal_name] || 0) + 1; });
  const volatile = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const last = list[0];
  return (
    <>
      <div className="page-header" style={{ paddingTop: 0 }}><div><h1 style={{ fontSize: 20 }}>Decision signals flip log</h1><div className="subtitle">Every signal state change · timestamped · derived from pre-computed snapshots</div></div></div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Flips (YTD)</div><div className="capital-tile-value">{ytd}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Most volatile</div><div className="capital-tile-value" style={{ fontSize: 13 }}>{volatile ? volatile[0].split(" ")[0] : "—"}</div><div className="capital-tile-sub">{volatile ? `${volatile[1]} flips` : ""}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Signals flipped</div><div className="capital-tile-value">{Object.keys(counts).length}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Last flip</div><div className="capital-tile-value" style={{ fontSize: 13 }}>{last ? last.signal_name.split(" ")[0] : "—"}</div><div className="capital-tile-sub">{last ? String(last.at).slice(0, 10) : ""}</div></div>
      </div>
      <div className="calendar-banner" style={{ margin: "12px 0" }}>Flip events are derived from the Decision Engine's snapshot history — write-once decision records.</div>
      {list.length === 0 && <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No state changes recorded yet — flips appear the first time a signal moves between GREEN, AMBER and RED.</div>}
      {list.map((f, i) => <FlipRow key={i} f={f} />)}
    </>
  );
}

// ── Forecasts view ─────────────────────────────────────────────────────────
function ForecastsView({ fc, weather, navigate }) {
  const [type, setType] = useState("harvest");
  const harvest = fc?.harvest_windows ?? [];
  const proj = fc?.cash_projection ?? [];
  const wx = weather ?? [];
  return (
    <>
      <div className="gallery-filter-row" style={{ margin: "14px 0" }}>
        {[["harvest", "Harvest windows"], ["cash", "Cash gaps"], ["weather", "Weather"], ["pest", "Pest pressure"]].map(([k, l]) => (
          <button key={k} className={`filter-pill${type === k ? " active" : ""}`} onClick={() => setType(k)}>{l}</button>
        ))}
      </div>
      {type === "harvest" && (harvest.length === 0
        ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No live cycles with an expected harvest date. Set expected dates on your cycles to see windows here.</div>
        : harvest.map((h) => (
          <div key={h.cycle_id} className={`forecast-card ${h.overdue ? "danger" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: 13, color: "var(--soil)" }}>{h.crop} · {h.pu_id}</strong><span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "Menlo,monospace" }}>{h.date}</span></div>
            <div style={{ fontSize: 12, color: "var(--soil)", marginTop: 6 }}>{h.overdue ? "Expected harvest date has passed — harvest or update the cycle." : `Expected harvest window opens ${h.date}.`}{h.planned_yield_kg ? ` Planned yield ${Math.round(h.planned_yield_kg).toLocaleString()}kg.` : ""}</div>
          </div>
        )))}
      {type === "cash" && (proj.length === 0
        ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Cash-gap projection needs cash activity in the last 8 weeks — log income and expenses in Cash to light this up.</div>
        : (
          <>
            {proj.map((p) => (
              <div key={p.week_offset} className={`forecast-card ${p.projected_balance < 0 ? "danger" : ""}`}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: 13, color: "var(--soil)" }}>Week +{p.week_offset}</strong><span style={{ fontSize: 11.5, fontFamily: "Menlo,monospace", color: p.projected_balance < 0 ? "var(--red)" : "var(--muted)" }}>{fjd0(p.projected_balance)}</span></div>
                {p.projected_balance < 0 && <div style={{ fontSize: 12, color: "var(--soil)", marginTop: 6 }}>Projected to go negative — plan sales or trim spend before this week.<button className="btn btn-secondary" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => navigate("/farm/cash")}>Open Cash</button></div>}
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "6px 2px" }}>Straight-line projection at your average weekly net ({fjd0(fc?.avg_weekly_net_fjd)}/week over the last 8 weeks).</div>
          </>
        ))}
      {type === "weather" && (wx.length === 0
        ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No forecast rows for this farm yet — the weather feed populates on its scheduled fetch.</div>
        : wx.map((d, i) => {
          const heavy = num(d.precip_mm) >= 20 || num(d.precip_prob_pct) >= 80;
          return (
            <div key={i} className={`forecast-card ${heavy ? "danger" : num(d.precip_prob_pct) >= 50 ? "warn" : ""}`}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: 13, color: "var(--soil)" }}>{String(d.valid_at).slice(0, 10)}</strong><span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "Menlo,monospace" }}>{d.temp_min_c != null ? `${Math.round(d.temp_min_c)}–${Math.round(d.temp_max_c)}°C` : d.temp_c != null ? `${Math.round(d.temp_c)}°C` : ""}</span></div>
              <div style={{ fontSize: 12, color: "var(--soil)", marginTop: 6 }}>Rain {num(d.precip_mm)}mm ({num(d.precip_prob_pct)}% chance) · wind {num(d.wind_kmh)}km/h{heavy ? " — heavy rain risk: hold spraying, check harvest holds." : ""}</div>
              {heavy && <div style={{ marginTop: 8 }}><button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => navigate("/farm/compliance")}>View spray compliance</button></div>}
            </div>
          );
        }))}
      {type === "pest" && (
        <div className="card" style={{ padding: 20 }}>
          <span className="building-badge">building</span>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>Pest-pressure forecasting needs scouting history — log pest and disease observations through the (+) catalog and this view activates as the record builds. No model output is shown until it's grounded in your data.</div>
        </div>
      )}
      <div className="calendar-banner" style={{ marginTop: 14 }}>Forecasts are projections from your current data. Weather comes from the external 7-day feed. Accuracy improves with history.</div>
    </>
  );
}

// ── Per-unit / Compare / Findings (closed-cycle outcomes) ─────────────────
function rollup(list) {
  const r = { cycles: list.length, earned: 0, spent: 0, profit: 0, yieldKg: 0, areaAcre: 0 };
  list.forEach((c) => { r.earned += c.revenue; r.spent += c.total_cost; r.profit += c.margin; r.yieldKg += num(c.actual_yield_kg); r.areaAcre += num(c.area_sqm) / SQM_PER_ACRE; });
  return r;
}
const perAcre = (r, k) => (r.areaAcre > 0 ? r[k] / r.areaAcre : null);

function RollupTable({ title, groups }) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}><strong style={{ color: "var(--soil)", fontSize: 13 }}>{title}</strong></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "var(--cream-2)", color: "var(--muted)", textAlign: "right" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Group</th><th style={{ padding: "8px 12px", textAlign: "center" }}>Cycles</th>
            <th style={{ padding: "8px 12px" }}>Cost/acre</th><th style={{ padding: "8px 12px" }}>Yield/acre</th>
            <th style={{ padding: "8px 12px" }}>Rev/acre</th><th style={{ padding: "8px 12px" }}>Profit/acre</th>
          </tr></thead>
          <tbody>
            {groups.map((g) => {
              const p = perAcre(g.roll, "profit");
              return (
                <tr key={g.label} style={{ borderBottom: "1px solid var(--line)", textAlign: "right" }}>
                  <td style={{ padding: "8px 12px", textAlign: "left", color: "var(--soil)", fontWeight: 600 }}>{g.label}{g.roll.cycles < 3 && <span style={{ color: "var(--amber)", fontSize: 9 }}> low sample</span>}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{g.roll.cycles}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "spent") != null ? fjd0(perAcre(g.roll, "spent")) : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "yieldKg") != null ? `${Math.round(perAcre(g.roll, "yieldKg")).toLocaleString()}kg` : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "earned") != null ? fjd0(perAcre(g.roll, "earned")) : "—"}</td>
                  <td style={{ padding: "8px 12px", color: p == null ? "var(--soil)" : p >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{p != null ? fjd0(p) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function groupBy(outcomes, keyFn) {
  const m = {};
  outcomes.forEach((o) => { const k = keyFn(o); if (k == null) return; (m[k] = m[k] || []).push(o); });
  return Object.keys(m).map((k) => ({ label: k, roll: rollup(m[k]) }));
}

function PerUnitView({ cycles }) {
  const outcomes = (cycles ?? []).filter((c) => c.status === "CLOSED");
  if (outcomes.length === 0) {
    return <div className="card" style={{ padding: 20 }}><strong style={{ color: "var(--soil)" }}>Per-unit economics</strong><div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>No closed cycles for this farm yet. Per-unit numbers (cost, yield, revenue and profit per acre, zone and block) appear the moment you close a cycle — Cycles → open a cycle → Close.</div></div>;
  }
  const farm = rollup(outcomes);
  const tile = (label, val, sub) => (
    <div key={label} style={{ flex: 1, minWidth: 120, background: "var(--cream-2)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, color: "var(--soil)", fontWeight: 600, marginTop: 4 }}>{val}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const zones = groupBy(outcomes, (o) => o.zone_name || "No zone").sort((a, b) => (perAcre(b.roll, "profit") ?? -1e9) - (perAcre(a.roll, "profit") ?? -1e9));
  const blocks = groupBy(outcomes, (o) => o.pu_name || o.pu_id).sort((a, b) => (perAcre(b.roll, "profit") ?? -1e9) - (perAcre(a.roll, "profit") ?? -1e9));
  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <strong style={{ color: "var(--soil)" }}>Per-unit economics · whole farm</strong>
        <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 12px" }}>Based on {farm.cycles} closed cycle{farm.cycles === 1 ? "" : "s"}. Per-plant figures activate once plant counts are captured at planting — until then, per-acre is the honest unit.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {tile("Cost / acre", perAcre(farm, "spent") != null ? fjd0(perAcre(farm, "spent")) : "—", `${farm.areaAcre.toFixed(2)} cycle-acres`)}
          {tile("Revenue / acre", perAcre(farm, "earned") != null ? fjd0(perAcre(farm, "earned")) : "—")}
          {tile("Profit / acre", perAcre(farm, "profit") != null ? fjd0(perAcre(farm, "profit")) : "—")}
          {tile("Yield / acre", perAcre(farm, "yieldKg") != null ? `${Math.round(perAcre(farm, "yieldKg")).toLocaleString()}kg` : "—")}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>Total: {fjd0(farm.earned)} earned · {fjd0(farm.spent)} spent · {fjd0(farm.profit)} profit · {Math.round(farm.yieldKg).toLocaleString()}kg over {farm.areaAcre.toFixed(2)} cycle-acres.</div>
      </div>
      <RollupTable title="By zone" groups={zones} />
      <RollupTable title="By block" groups={blocks} />
    </>
  );
}

function CompareView({ cycles }) {
  const [sort, setSort] = useState("profit");
  const outcomes = (cycles ?? []).filter((c) => c.status === "CLOSED");
  if (outcomes.length === 0) {
    return <div className="card" style={{ padding: 20 }}><strong style={{ color: "var(--soil)" }}>Comparison</strong><div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>Nothing to compare yet. Crop and soil-type rankings appear once you close cycles — each closed cycle adds one row to compare against the rest.</div></div>;
  }
  const sortFn = (a, b) => {
    if (sort === "yield") return (perAcre(b.roll, "yieldKg") ?? -1e9) - (perAcre(a.roll, "yieldKg") ?? -1e9);
    if (sort === "cost") return (perAcre(a.roll, "spent") ?? 1e9) - (perAcre(b.roll, "spent") ?? 1e9);
    return (perAcre(b.roll, "profit") ?? -1e9) - (perAcre(a.roll, "profit") ?? -1e9);
  };
  const table = (title, groups) => (
    <div className="card" key={title} style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}><strong style={{ color: "var(--soil)", fontSize: 13 }}>{title}</strong></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "var(--cream-2)", color: "var(--muted)", textAlign: "right" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Rank</th><th style={{ padding: "8px 12px", textAlign: "left" }}>Group</th>
            <th style={{ padding: "8px 12px", textAlign: "center" }}>Cycles</th><th style={{ padding: "8px 12px" }}>Yield/acre</th>
            <th style={{ padding: "8px 12px" }}>Cost/acre</th><th style={{ padding: "8px 12px" }}>Rev/acre</th>
            <th style={{ padding: "8px 12px" }}>Profit/acre</th><th style={{ padding: "8px 12px" }}>Margin</th>
          </tr></thead>
          <tbody>
            {groups.slice().sort(sortFn).map((g, i) => {
              const p = perAcre(g.roll, "profit");
              const mg = g.roll.earned > 0 ? Math.round(g.roll.profit / g.roll.earned * 100) : null;
              return (
                <tr key={g.label} style={{ borderBottom: "1px solid var(--line)", textAlign: "right" }}>
                  <td style={{ padding: "8px 12px", textAlign: "left", color: "var(--muted)" }}>{i + 1}</td>
                  <td style={{ padding: "8px 12px", textAlign: "left", color: "var(--soil)", fontWeight: 600 }}>{g.label}{g.roll.cycles < 3 && <span style={{ color: "var(--amber)", fontSize: 9 }} title="Low sample — indicative, not conclusive"> low sample</span>}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{g.roll.cycles}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "yieldKg") != null ? `${Math.round(perAcre(g.roll, "yieldKg")).toLocaleString()}kg` : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "spent") != null ? fjd0(perAcre(g.roll, "spent")) : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{perAcre(g.roll, "earned") != null ? fjd0(perAcre(g.roll, "earned")) : "—"}</td>
                  <td style={{ padding: "8px 12px", color: p == null ? "var(--soil)" : p >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{p != null ? fjd0(p) : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{mg != null ? `${mg}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <>
      <div className="card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <strong style={{ color: "var(--soil)" }}>Comparison · what performs best</strong>
        <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "6px 0 10px" }}>Ranked across {outcomes.length} closed cycle{outcomes.length === 1 ? "" : "s"}. Groups under 3 cycles are flagged low-sample — read them as hints, not conclusions. Variety rankings activate once varieties are captured per cycle.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>Rank by:</span>
          {[["yield", "Yield"], ["cost", "Lowest input cost"], ["profit", "Profit"]].map(([k, l]) => (
            <button key={k} className={`btn btn-sm ${sort === k ? "btn-primary" : "btn-secondary"}`} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
      </div>
      {table("By crop", groupBy(outcomes, (o) => o.crop))}
      {table("By soil type", groupBy(outcomes, (o) => o.soil_type || "Not set"))}
    </>
  );
}

const LEARNING_MIN = 3;
function bestGroupFinding(groups, metricFn, { higherBetter, minGapPct }) {
  const q = groups.filter((g) => g.roll.cycles >= LEARNING_MIN && metricFn(g.roll) != null);
  if (q.length < 2) return { status: "insufficient" };
  q.sort((a, b) => (higherBetter ? metricFn(b.roll) - metricFn(a.roll) : metricFn(a.roll) - metricFn(b.roll)));
  const win = q[0], run = q[1], wv = metricFn(win.roll), rv = metricFn(run.roll);
  const gap = higherBetter ? wv - rv : rv - wv;
  const gapPct = Math.abs(gap) / (Math.abs(rv) || 1) * 100;
  if (gapPct < (minGapPct || 10)) return { status: "tooClose" };
  return { status: "ok", win, run, wv, rv, gapPct, n: win.roll.cycles };
}
function FindingCard({ f, sentence, evidence }) {
  if (!f || f.status !== "ok") return null;
  const strong = f.n >= 5;
  const color = strong ? "var(--green)" : "var(--amber)";
  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color }}>{strong ? "Finding · strong" : "Early signal"}</span>
        <span style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: "auto" }}>{f.n} cycles · vs {f.run.roll.cycles}</span>
      </div>
      <div style={{ fontSize: 14, color: "var(--soil)", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: sentence }} />
      {evidence && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>{evidence}</div>}
    </div>
  );
}
function FindingsView({ cycles }) {
  const outcomes = (cycles ?? []).filter((c) => c.status === "CLOSED");
  const head = (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 14 }}>
      <strong style={{ color: "var(--soil)" }}>What your farm is learning</strong>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, marginTop: 6 }}>These are conclusions the system will only state once enough closed cycles back them — at least {LEARNING_MIN} cycles in the winning group and a clear gap over the next best. Until then it stays quiet and shows what is still building. No guesses dressed as facts.</div>
    </div>
  );
  if (outcomes.length === 0) return <>{head}<div className="card" style={{ padding: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>Nothing learned yet — close some cycles and findings appear here as the evidence stacks up.</div></>;
  const cropGroups = groupBy(outcomes, (o) => o.crop);
  const profA = (r) => perAcre(r, "profit");
  const cards = [];
  const fCrop = bestGroupFinding(cropGroups, profA, { higherBetter: true, minGapPct: 15 });
  if (fCrop.status === "ok") cards.push(<FindingCard key="crop" f={fCrop} sentence={`Across everything, <strong>${fCrop.win.label}</strong> returns the most per acre.`} evidence={`${fjd0(fCrop.wv)}/acre vs ${fjd0(fCrop.rv)} for ${fCrop.run.label} — ${Math.round(fCrop.gapPct)}% ahead.`} />);
  const fYield = bestGroupFinding(cropGroups, (r) => perAcre(r, "yieldKg"), { higherBetter: true, minGapPct: 10 });
  if (fYield.status === "ok") cards.push(<FindingCard key="yield" f={fYield} sentence={`<strong>${fYield.win.label}</strong> gives your best yield per acre.`} evidence={`${Math.round(fYield.wv).toLocaleString()}kg/acre vs ${Math.round(fYield.rv).toLocaleString()} for ${fYield.run.label}.`} />);
  const fCost = bestGroupFinding(cropGroups, (r) => perAcre(r, "spent"), { higherBetter: false, minGapPct: 10 });
  if (fCost.status === "ok") cards.push(<FindingCard key="cost" f={fCost} sentence={`<strong>${fCost.win.label}</strong> costs the least to grow per acre.`} evidence={`${fjd0(fCost.wv)}/acre in costs vs ${fjd0(fCost.rv)} for ${fCost.run.label}.`} />);
  [...new Set(outcomes.map((o) => o.crop))].forEach((crop) => {
    const soilG = groupBy(outcomes.filter((o) => o.crop === crop), (o) => o.soil_type || "Not set");
    const fSoil = bestGroupFinding(soilG, profA, { higherBetter: true, minGapPct: 15 });
    if (fSoil.status === "ok") cards.push(<FindingCard key={`soil-${crop}`} f={fSoil} sentence={`<strong>${crop}</strong> does best on <strong>${fSoil.win.label}</strong> soil.`} evidence={`${fjd0(fSoil.wv)}/acre on ${fSoil.win.label} vs ${fjd0(fSoil.rv)} on ${fSoil.run.label}.`} />);
  });
  const leader = cropGroups.filter((g) => profA(g.roll) != null).sort((a, b) => profA(b.roll) - profA(a.roll))[0];
  const building = leader && leader.roll.cycles < LEARNING_MIN
    ? <div style={{ fontSize: 12.5, color: "var(--soil)", marginBottom: 4 }}>Leading so far: <strong>{leader.label}</strong> at {fjd0(profA(leader.roll))}/acre — but only {leader.roll.cycles} cycle{leader.roll.cycles === 1 ? "" : "s"}. Need {LEARNING_MIN - leader.roll.cycles} more to call it.</div>
    : null;
  return (
    <>
      {head}
      {cards}
      {cards.length === 0 && (
        <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--muted)" }}>
          <div style={{ fontSize: 13, color: "var(--soil)", fontWeight: 600, marginBottom: 6 }}>Still building — nothing confirmed yet</div>
          {building || <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Close more cycles across different crops to start surfacing findings.</div>}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>The system would rather say nothing than guess. This is what protects the findings’ credibility.</div>
        </div>
      )}
      {cards.length > 0 && building && <div className="card" style={{ padding: "14px 16px", borderLeft: "3px solid var(--muted)" }}><div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Still building</div>{building}</div>}
    </>
  );
}

// ── Benchmark (honest network state) ───────────────────────────────────────
const MIN_COHORT_FARMS = 5;
function BenchmarkView({ cycles }) {
  const myCrops = [...new Set((cycles ?? []).filter((c) => c.status === "CLOSED").map((c) => c.crop))];
  return (
    <>
      <div className="card" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <strong style={{ color: "var(--soil)" }}>How you compare to farms like yours</strong>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, marginTop: 6 }}>These figures are anonymised and pooled across many farms — never any one farm’s numbers. A benchmark only appears once at least {MIN_COHORT_FARMS} farms have logged that crop, so no farm can be picked out. Your own records stay yours; they are never shown to anyone else.</div>
      </div>
      {myCrops.length === 0
        ? <div className="card" style={{ padding: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>Close a few cycles first — once you have your own results, we can show how they stack up against the wider network.</div>
        : (
          <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--muted)" }}>
            <div style={{ fontSize: 13, color: "var(--soil)", fontWeight: 600, marginBottom: 6 }}>No benchmarks yet for your crops</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>The network is still building a cohort for: {myCrops.join(", ")}. Benchmarks appear at {MIN_COHORT_FARMS}+ farms per crop — no cohort, no number.</div>
          </div>
        )}
    </>
  );
}

// ── KPI board / Inventory / Labour ─────────────────────────────────────────
function KpiBoardView({ fin, cycles, workers, labor }) {
  const s = fin?.data?.summary || fin?.summary || {};
  const inc = num(s.total_income_fjd), cost = num(s.total_labor_cost_fjd) + num(s.total_input_cost_fjd);
  const net = s.net_profit_fjd != null ? num(s.net_profit_fjd) : inc - cost;
  const live = (cycles ?? []).filter((c) => ["ACTIVE", "HARVESTING"].includes(c.status)).length;
  const hours = (labor ?? []).reduce((a, r) => a + num(r.hours_worked), 0);
  const wages = (labor ?? []).reduce((a, r) => a + num(r.total_pay_fjd), 0);
  const roi = cost > 0 ? Math.round(net / cost * 100) : null;
  const tile = (label, val, sub, color) => (
    <div className="capital-tile" key={label}><div className="capital-tile-label">{label}</div><div className="capital-tile-value" style={color ? { color } : undefined}>{val}</div>{sub && <div className="capital-tile-sub">{sub}</div>}</div>
  );
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 2px 12px" }}>The numbers that matter most, on one board — all read from your logged records right now.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {tile("Net so far", fjd0(net), "crops + animals", net < 0 ? "var(--red)" : "var(--green-dk)")}
        {tile("Money earned", fjd0(inc), "all businesses", "var(--green-dk)")}
        {tile("Money spent", fjd0(cost), "inputs, labour, more")}
        {tile("Live cycles", String(live), "in the ground now")}
        {tile("Cycles all-time", String((cycles ?? []).length), "logged on this farm")}
        {tile("Hours logged", `${Math.round(hours)}h`, "across the team")}
        {tile("Wages recorded", fjd0(wages), `${(workers ?? []).length} worker${(workers ?? []).length === 1 ? "" : "s"}`)}
        <div className="capital-tile"><div className="capital-tile-label">Bank readiness</div><div className="capital-tile-value" style={{ fontSize: 14, color: "var(--muted)" }}>Building</div><div className="capital-tile-sub">needs a season</div></div>
      </div>
      <div className="card" style={{ padding: "14px 16px", marginTop: 14 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 6 }}>Return on what you spend</div>
        {roi != null
          ? <div style={{ fontSize: 13, color: "var(--soil)" }}>For every {fjd0(100)} you spent, you made about {fjd0(100 + roi)} back — a {roi}% return so far this season.</div>
          : <div style={{ fontSize: 13, color: "var(--muted)" }}>Return on spend shows here once you have logged some costs.</div>}
      </div>
    </>
  );
}

function BuildCard({ title, body, cta, onGo }) {
  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ color: "var(--soil)", fontSize: 13 }}>{title}</strong>
        <span className="building-badge" style={{ marginLeft: "auto" }}>Building</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{body}</div>
      {cta && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={onGo}>{cta}</button>}
    </div>
  );
}

function InventoryAnalyticsView({ items, navigate }) {
  const list = items ?? [];
  const critical = list.filter((i) => ["CRITICAL", "LOW", "OUT", "OUT_OF_STOCK"].includes(String(i.stock_status || "").toUpperCase())).length;
  const value = list.reduce((a, i) => a + (num(i.total_value_fjd) || num(i.current_stock) * num(i.unit_cost_fjd) || 0), 0);
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 2px 12px" }}>How your stock moves and what it is worth. Builds as you log what comes in and what gets used.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
        <div className="capital-tile"><div className="capital-tile-label">Items</div><div className="capital-tile-value">{list.length}</div><div className="capital-tile-sub">active SKUs</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Critical / low</div><div className="capital-tile-value" style={critical ? { color: "var(--red)" } : undefined}>{critical}</div><div className="capital-tile-sub">need reorder</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Stock value</div><div className="capital-tile-value">{value ? fjd0(value) : "—"}</div><div className="capital-tile-sub">capital tied up</div></div>
      </div>
      <BuildCard title="Usage rate" body="How fast you go through seed, feed, fuel and chemicals — builds as Receive/Use movements accumulate." cta="Open Inventory" onGo={() => navigate("/farm/inventory")} />
      <BuildCard title="Reorder signals" body="A heads-up to buy more before you run out — driven by your reorder levels and lead times." cta="Open Inventory" onGo={() => navigate("/farm/inventory")} />
    </>
  );
}

function LabourAnalyticsView({ workers, labor, navigate }) {
  const team = workers ?? [];
  const hours = (labor ?? []).reduce((a, r) => a + num(r.hours_worked), 0);
  const wages = (labor ?? []).reduce((a, r) => a + num(r.total_pay_fjd), 0);
  const avg = team.length ? Math.round(wages / team.length) : 0;
  return (
    <>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
        <div className="capital-tile"><div className="capital-tile-label">Hours logged</div><div className="capital-tile-value">{Math.round(hours)}h</div><div className="capital-tile-sub">{team.length} worker{team.length === 1 ? "" : "s"}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Wages recorded</div><div className="capital-tile-value">{fjd0(wages)}</div><div className="capital-tile-sub">across the team</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Avg per worker</div><div className="capital-tile-value">{fjd0(avg)}</div><div className="capital-tile-sub">recorded so far</div></div>
      </div>
      <BuildCard title="Output per worker" body="How much each worker produces, once you tag work to harvests." cta="Open Labour" onGo={() => navigate("/farm/labor")} />
      <BuildCard title="Labour cost by business" body="What labour costs each enterprise to run." cta="Open Labour" onGo={() => navigate("/farm/labor")} />
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
function AnalyticsInner() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("signals");
  const [drill, setDrill] = useState(null);   // signal_id
  const [taskFor, setTaskFor] = useState(null); // signal object
  const [, force] = useState(0);

  const sigQ = useQuery({ queryKey: ["an-signals", farmId], queryFn: () => get(`/api/v1/analytics/${encodeURIComponent(farmId)}/signals`), enabled: !!farmId });
  const flipQ = useQuery({ queryKey: ["an-flips", farmId], queryFn: () => get(`/api/v1/analytics/${encodeURIComponent(farmId)}/fliplog`), enabled: !!farmId && (view === "fliplog" || !!drill) });
  const cycQ = useQuery({ queryKey: ["an-cycles", farmId], queryFn: () => get(`/api/v1/analytics/${encodeURIComponent(farmId)}/cycles`), enabled: !!farmId });
  const cdQ = useQuery({ queryKey: ["an-cd", farmId], queryFn: () => get(`/api/v1/analytics/${encodeURIComponent(farmId)}/cashdemand`), enabled: !!farmId && view === "cashdemand" });
  const fcQ = useQuery({ queryKey: ["an-fc", farmId], queryFn: () => get(`/api/v1/analytics/${encodeURIComponent(farmId)}/forecasts`), enabled: !!farmId && view === "forecasts" });
  const wxQ = useQuery({ queryKey: ["an-wx", farmId], queryFn: () => fetch(`/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })).then((b) => b?.data ?? []), enabled: !!farmId && view === "forecasts" });
  const finQ = useQuery({ queryKey: ["an-fin", farmId], queryFn: () => fetch(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : {})), enabled: !!farmId && view === "kpi" });
  const invQ = useQuery({ queryKey: ["an-inv", farmId], queryFn: () => fetch(`/api/v1/inputs?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })).then((b) => b?.data ?? []), enabled: !!farmId && view === "inventory" });
  const wkQ = useQuery({ queryKey: ["an-wk", farmId], queryFn: () => fetch(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })).then((b) => b?.data ?? []), enabled: !!farmId && (view === "labour" || view === "kpi") });
  const lbQ = useQuery({ queryKey: ["an-lb", farmId], queryFn: () => fetch(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })).then((b) => b?.data ?? []), enabled: !!farmId && (view === "labour" || view === "kpi") });

  const signals = sigQ.data?.signals ?? [];
  const cycles = cycQ.data?.cycles ?? [];
  const flips = flipQ.data?.flips ?? [];
  const liveN = signals.filter((s) => s.status !== "BUILDING").length;
  const snapTime = sigQ.data?.last_snapshot_at ? String(sigQ.data.last_snapshot_at).slice(11, 16) : null;
  const drillSignal = drill ? signals.find((s) => s.signal_id === drill) : null;

  function ack(s) { snooze(s.signal_id); emitToast("Signal acknowledged · snoozed 24h · stays visible in the grid"); force((n) => n + 1); }

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          {drillSignal ? (
            <SignalDetail s={drillSignal} flips={flips} onBack={() => setDrill(null)} onTask={setTaskFor} onAck={ack} navigate={navigate} />
          ) : (
            <>
              <div className="page-header">
                <div><h1>Analytics</h1><div className="subtitle">Decision board · {liveN} live signal{liveN === 1 ? "" : "s"} · pre-computed by the Decision Engine{snapTime ? ` · last snapshot ${snapTime}` : ""}</div></div>
                <div className="page-actions">
                  {snapTime && <span className="event-anchor-chip" style={{ cursor: "pointer" }} onClick={() => emitToast(`Signals are pre-computed by the Decision Engine. Last snapshot ${snapTime}.`)}><Clock size={12} />Snapshot {snapTime}</span>}
                  <FarmSelector />
                </div>
              </div>
              <div className="cycle-view-tabs">
                {TABS.map(([id, l, s]) => <div key={id} className={`task-tab ${view === id ? "active" : ""}`} onClick={() => { setView(id); setDrill(null); }}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></div>)}
              </div>
              {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its analytics.</div>
                : view === "signals" ? (sigQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div> : <SignalsView data={sigQ.data} onDrill={setDrill} onTask={setTaskFor} />)
                : view === "profit" ? (cycQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div> : <ProfitView cycles={cycles} />)
                : view === "productivity" ? <ProductivityView cycles={cycles} />
                : view === "cashdemand" ? <CashDemandView cd={cdQ.data} navigate={navigate} />
                : view === "fliplog" ? <FlipLogView flips={flips} />
                : view === "forecasts" ? <ForecastsView fc={fcQ.data} weather={wxQ.data} navigate={navigate} />
                : view === "perunit" ? <PerUnitView cycles={cycles} />
                : view === "compare" ? <CompareView cycles={cycles} />
                : view === "findings" ? <FindingsView cycles={cycles} />
                : view === "benchmark" ? <BenchmarkView cycles={cycles} />
                : view === "kpi" ? <KpiBoardView fin={finQ.data} cycles={cycles} workers={wkQ.data} labor={lbQ.data} />
                : view === "inventory" ? <InventoryAnalyticsView items={invQ.data} navigate={navigate} />
                : <LabourAnalyticsView workers={wkQ.data} labor={lbQ.data} navigate={navigate} />}
            </>
          )}
          {taskFor && <GenerateTaskModal s={taskFor} farmId={farmId} onClose={() => setTaskFor(null)} />}
        </div>
      </main>
    </TfpShell>
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

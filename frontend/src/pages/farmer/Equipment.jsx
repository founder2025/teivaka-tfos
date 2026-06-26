/**
 * Equipment.jsx — /farm/equipment (Resources › Equipment tab) — audit-approved redesign (2026-06-26).
 *
 * Fleet/Maintenance/Usage/Costs/Parts under <TfpShell>, wired to real data:
 *   Fleet      GET/POST/PATCH /equipment — cost/hr (operating) + status + book value
 *   Maintenance GET/POST /equipment-maintenance — due board + log (resets service, clears down)
 *   Usage      GET/POST /equipment-usage — hours/fuel + cycle allocation (bumps current_hours)
 *   Parts      GET/POST/PATCH /equipment-parts — spares w/ on-hand/lead-time/ferry
 * All POST/PATCH hash-chained (emit_audit_event). Nothing fabricated — empty until logged.
 *
 * Redesign (audit EQ1–EQ40):
 *  · reads via getJSON / writes via send (token refresh + humanized errors, EQ5); Fiji time (EQ6)
 *  · cached-on-error: error card + Retry, degraded banner (EQ2); removed UUID sub (EQ1)
 *  · honest cost labels: "operating cost/hour (excl. depreciation)" + "Value written down (book)"
 *    — nothing auto-depreciates (EQ3/EQ25)
 *  · DECOMMISSIONED → its own `retired` status: excluded from down/service/book value (EQ14)
 *  · Parts adjust modal (no window.prompt, EQ11); resolve-with-condition modal (EQ13)
 *  · shared <Modal> Esc/focus/role (EQ8); tab buttons + arrow keys (EQ7); view-aware Ask AI (EQ9)
 *  · book value via formatMoney (EQ10); cycle dropdown disambiguated (EQ15); dismissible hint (EQ31)
 *  · submit-locks on writes; "latest 200" note when capped (EQ22)
 * FILED (backend): fuel+maint → cash_ledger (EQ4 keystone), real depreciation (EQ25), consume
 *  parts on repair (EQ26/EQ19), rental income (EQ27), implements (EQ28), km unit on create (EQ12),
 *  calibration/hygiene logs (EQ29/EQ30), location/holder (EQ35), utilization/ROA (EQ38).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Pencil, Tractor, Droplets, Wrench, Truck, Factory, Warehouse, Package, AlertTriangle, Sparkles } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } // Fiji day (EQ6)
function plusDaysISO(n) { return new Date(Date.parse(todayISO()) + n * 864e5).toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); }
function num(v) { return Number(v ?? 0); }
function fjd0(v) { return formatMoney(v ?? 0, { decimals: 0 }); }
function fjd2(v) { return formatMoney(v ?? 0, { decimals: 2 }); }

const TYPE_LABEL = { TRACTOR: "Tractor", IRRIGATION: "Irrigation", VEHICLE: "Vehicle", PROCESSING: "Processing", STORAGE: "Storage", TOOL: "Tool", OTHER: "Other" };
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
const TYPE_ICON = { TRACTOR: Tractor, IRRIGATION: Droplets, VEHICLE: Truck, PROCESSING: Factory, STORAGE: Warehouse, TOOL: Wrench, OTHER: Package };
const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DECOMMISSIONED"];
const RESOLVE_CONDITIONS = ["EXCELLENT", "GOOD", "FAIR"];
const VIEWS = [["fleet", "Fleet", "Assets"], ["maintenance", "Maintenance", "Service"], ["usage", "Usage", "Hours & fuel"], ["costs", "Costs", "Per-hour & P&L"], ["parts", "Parts", "Spares"]];
const STATUS_LABEL = { ok: "OK", "due-soon": "Due soon", overdue: "Overdue", down: "Down", retired: "Retired" };
const AI_PROMPTS = {
  fleet: "How do I decide whether to repair or replace farm equipment?",
  maintenance: "How do I set a preventive maintenance schedule for my farm machinery?",
  usage: "How do I cut fuel costs and run my equipment more efficiently?",
  costs: "Which of my assets cost the most per hour and what should I do about it?",
  parts: "Which spare parts should I keep on hand for my farm equipment?",
};

function effStatus(e) {
  if (e.condition === "DECOMMISSIONED") return "retired";       // EQ14: retired ≠ down
  if (e.condition === "POOR") return "down";
  if (e.next_service_date) { const d = Date.parse(e.next_service_date); if (Number.isFinite(d)) { const days = Math.floor((d - Date.parse(todayISO())) / 864e5); if (days < 0) return "overdue"; if (days <= 30) return "due-soon"; } }
  return "ok";
}
function serviceLabel(e) {
  if (!e.next_service_date) return "Calendar-tracked";
  const d = Date.parse(e.next_service_date); if (!Number.isFinite(d)) return "Calendar-tracked";
  const days = Math.floor((d - Date.parse(todayISO())) / 864e5);
  return days < 0 ? `OVERDUE ${Math.abs(days)}d` : `${days}d to service`;
}
function yearOf(d) { if (!d) return ""; const y = new Date(d).getFullYear(); return Number.isFinite(y) ? y : ""; }
function cycleLabel(c, all) { // EQ15 disambiguation
  const name = c.crop_name || c.farmer_label || "Crop run";
  const dup = all.filter((x) => (x.crop_name || x.farmer_label) === (c.crop_name || c.farmer_label)).length > 1;
  return dup ? `${name} — ${c.farmer_label || String(c.cycle_id).replace("CYC-", "")}` : name;
}

async function getList(url) { return (await getJSON(url))?.data ?? []; }
const getEquipment = (f) => getList(`/api/v1/equipment?farm_id=${encodeURIComponent(f)}`);
const getUsage = (f) => getList(`/api/v1/equipment-usage?farm_id=${encodeURIComponent(f)}`);
const getMaint = (f) => getList(`/api/v1/equipment-maintenance?farm_id=${encodeURIComponent(f)}`);
const getParts = (f) => getList(`/api/v1/equipment-parts?farm_id=${encodeURIComponent(f)}`);
const getCycles = () => getJSON("/api/v1/cycles").then((b) => b?.data?.cycles || b?.data || []).catch(() => []);

function costPerHour(e, usage, maint) {
  const hrs = num(e.current_hours);
  if (hrs <= 0) return null;
  const fuel = usage.filter((u) => u.equipment_id === e.equipment_id).reduce((s, u) => s + num(u.fuel_cost_fjd), 0);
  const mnt = maint.filter((m) => m.equipment_id === e.equipment_id).reduce((s, m) => s + num(m.total_cost_fjd), 0);
  return (fuel + mnt) / hrs;
}

// Shared modal: Esc-to-close, role=dialog/aria-modal, focus-on-open (EQ8).
function Modal({ title, onClose, children, foot, maxWidth }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button className="overlay-close" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}
function ErrorCard({ msg, onRetry }) {
  return <div className="card" style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}><div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 10 }}><AlertTriangle size={16} style={{ color: "var(--amber)" }} /><span style={{ fontWeight: 600, color: "var(--soil)" }}>{msg}</span></div><button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>;
}
function DegradedBanner({ msg }) {
  return <div className="calendar-banner" style={{ background: "#FBF4E6", borderColor: "var(--amber)", color: "var(--soil)" }}><AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />{msg || "Couldn't refresh — showing the last saved data."}</div>;
}
function CapNote({ n }) { return n >= 200 ? <div style={{ fontSize: 11, color: "var(--muted)", margin: "6px 2px 0" }}>Showing the latest 200 records.</div> : null; }

function EquipCard({ e, cph, onOpen, onMaint, onFault, onResolve, onEdit }) {
  const st = effStatus(e); const Icon = TYPE_ICON[e.equipment_type] || Package;
  const sub = [e.brand, e.model, yearOf(e.purchase_date)].filter(Boolean).join(" ");
  const hrs = num(e.current_hours);
  return (
    <div className={`equip-card ${st}`}>
      <div className="equip-card-head" onClick={onOpen} style={{ cursor: "pointer" }}>
        <div className={`equip-avatar ${(e.equipment_type || "").toLowerCase()}`}><Icon size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="equip-card-name">{e.equipment_name}</div>
          <div style={{ margin: "3px 0" }}>
            <span className={`equip-cat-pill ${(e.equipment_type || "").toLowerCase()}`}>{TYPE_LABEL[e.equipment_type] || e.equipment_type}</span>{" "}
            <span className={`equip-status-pill ${st}`}><span className={`equip-status-dot ${st}`} />{STATUS_LABEL[st]}</span>
          </div>
          <div className="equip-card-sub">{sub || "—"}{e.serial_number ? ` · ${e.serial_number}` : ""}</div>
        </div>
        <button className="btn btn-secondary btn-sm" title="Edit" aria-label="Edit" onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}><Pencil size={12} /></button>
      </div>
      {st === "down" ? <div className="down-banner"><AlertTriangle size={14} /><div><strong>DOWN · fault reported</strong>{e.notes ? <><br />{e.notes}</> : null}</div></div>
        : st === "retired" ? <div className="service-countdown" style={{ background: "var(--cream-2,#efe7d6)", color: "var(--muted)" }}>RETIRED · decommissioned</div>
        : <div className={`service-countdown ${st === "ok" ? "ok" : st}`}>{serviceLabel(e)}</div>}
      <div className="equip-card-meta">
        <div className="equip-meta-tile"><div className="equip-meta-label">{e.hours_unit === "km" ? "Distance" : "Hours"}</div><div className="equip-meta-value">{hrs > 0 ? `${hrs.toLocaleString()}${e.hours_unit === "km" ? "km" : "h"}` : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Op. cost/hr</div><div className="equip-meta-value">{cph != null ? fjd2(cph) : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Book value</div><div className="equip-meta-value">{e.current_value_fjd ? fjd0(e.current_value_fjd) : "—"}</div></div>
      </div>
      {st === "retired"
        ? <div className="equip-card-actions"><button className="btn btn-secondary" onClick={() => onMaint(e)}>Maintenance</button></div>
        : <div className="equip-card-actions">
          <button className="btn btn-secondary" onClick={() => onMaint(e)}>Maintenance</button>
          {st === "down" ? <button className="btn btn-primary" onClick={() => onResolve(e)}>Mark resolved</button> : <button className="btn btn-secondary" onClick={() => onFault(e)}>Report fault</button>}
        </div>}
    </div>
  );
}

function EquipmentInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("fleet");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [costsMode, setCostsMode] = useState("per-hour");
  const [form, setForm] = useState(null);
  const [maint, setMaint] = useState(null);
  const [fault, setFault] = useState(null);
  const [resolve, setResolve] = useState(null);
  const [usageFor, setUsageFor] = useState(undefined);
  const [partOpen, setPartOpen] = useState(false);
  const [partAdjust, setPartAdjust] = useState(null);
  const [detail, setDetail] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem("tfos_eq_hint") === "1");

  const equipQ = useQuery({ queryKey: ["equipment", farmId], queryFn: () => getEquipment(farmId), enabled: !!farmId });
  const usageQ = useQuery({ queryKey: ["equip-usage", farmId], queryFn: () => getUsage(farmId), enabled: !!farmId });
  const maintQ = useQuery({ queryKey: ["equip-maint", farmId], queryFn: () => getMaint(farmId), enabled: !!farmId });
  const partsQ = useQuery({ queryKey: ["equip-parts", farmId], queryFn: () => getParts(farmId), enabled: !!farmId && view === "parts" });
  const equip = equipQ.data ?? [];
  const usage = usageQ.data ?? [];
  const maintLog = maintQ.data ?? [];
  const parts = partsQ.data ?? [];

  const cphMap = useMemo(() => { const m = {}; equip.forEach((e) => { m[e.equipment_id] = costPerHour(e, usage, maintLog); }); return m; }, [equip, usage, maintLog]);
  const active = equip.filter((e) => effStatus(e) !== "retired");
  const bookValue = active.reduce((s, e) => s + num(e.current_value_fjd), 0); // EQ14: exclude retired
  const serviceDue = equip.filter((e) => ["due-soon", "overdue"].includes(effStatus(e))).length;
  const down = equip.filter((e) => effStatus(e) === "down").length;
  const retired = equip.filter((e) => effStatus(e) === "retired").length;
  const typesPresent = useMemo(() => { const m = {}; equip.forEach((e) => { m[e.equipment_type] = (m[e.equipment_type] || 0) + 1; }); return m; }, [equip]);

  let rows = equip.slice();
  if (type !== "all") rows = rows.filter((e) => e.equipment_type === type);
  if (status !== "all") rows = rows.filter((e) => effStatus(e) === status);
  if (q.trim()) { const qq = q.toLowerCase(); rows = rows.filter((e) => `${e.equipment_name} ${e.brand || ""} ${e.model || ""} ${e.serial_number || ""}`.toLowerCase().includes(qq)); }

  const refetch = () => { qc.invalidateQueries({ queryKey: ["equipment", farmId] }); qc.invalidateQueries({ queryKey: ["equip-usage", farmId] }); qc.invalidateQueries({ queryKey: ["equip-maint", farmId] }); };
  async function patch(id, body, okMsg) {
    try { await send("PATCH", `/api/v1/equipment/${encodeURIComponent(id)}`, body); emitToast(okMsg); refetch(); }
    catch (e) { emitToast(e?.userMessage || "Could not update"); }
  }
  const dismissHint = () => { localStorage.setItem("tfos_eq_hint", "1"); setHintDismissed(true); };

  const overdue = equip.filter((e) => effStatus(e) === "overdue" || effStatus(e) === "down");
  const dueSoon = equip.filter((e) => effStatus(e) === "due-soon");
  const maintCost = maintLog.reduce((s, m) => s + num(m.total_cost_fjd), 0);
  const totalHours = usage.reduce((s, u) => s + num(u.hours_run), 0);
  const totalFuel = usage.reduce((s, u) => s + num(u.fuel_litres), 0);
  const totalFuelCost = usage.reduce((s, u) => s + num(u.fuel_cost_fjd), 0);
  const allocated = usage.filter((u) => u.cycle_id).reduce((s, u) => s + num(u.hours_run), 0);

  const askAi = () => window.location.assign("/tis?q=" + encodeURIComponent(AI_PROMPTS[view] || AI_PROMPTS.fleet));
  const onTabKey = (e, id) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = VIEWS.findIndex((v) => v[0] === id);
    const ni = e.key === "ArrowRight" ? (i + 1) % VIEWS.length : (i - 1 + VIEWS.length) % VIEWS.length;
    setView(VIEWS[ni][0]);
  };
  const dataDegraded = equipQ.isError && equip.length > 0;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div className="subtitle">Crops + animals · {equip.length} asset{equip.length === 1 ? "" : "s"}{down > 0 ? ` · ${down} down` : ""}{retired > 0 ? ` · ${retired} retired` : ""}</div>
            <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}><FarmSelector /><button className="btn btn-secondary" onClick={askAi}><Sparkles size={13} />Ask AI</button><button className="btn btn-primary" onClick={() => setForm({ mode: "add" })}><Plus size={13} />Add equipment</button></div>
          </div>

          <div className="cycle-view-tabs" role="tablist" aria-label="Equipment views">
            {VIEWS.map(([id, l, s]) => <button key={id} role="tab" aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={`task-tab ${view === id ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setView(id)} onKeyDown={(e) => onTabKey(e, id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></button>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its assets.</div>
            : equipQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : equipQ.isError && equip.length === 0 ? <ErrorCard msg="Couldn't load your fleet." onRetry={() => equipQ.refetch()} />
            : (
            <>
              {dataDegraded && <DegradedBanner />}
              {view === "fleet" ? (
              <>
                {!hintDismissed && <div className="card" style={{ marginBottom: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.6 }}>Machines and tools aren't tied to one crop — log each asset once and work it across every enterprise (the pump waters beds and fills troughs; the ute hauls produce and stock). Animal-specific gear registers here the same way.</div>
                  <button className="btn btn-secondary btn-sm" onClick={dismissHint} aria-label="Dismiss">Got it</button>
                </div>}
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  <div className="capital-tile"><div className="capital-tile-label">Total assets</div><div className="capital-tile-value">{equip.length}</div><div className="capital-tile-sub">{active.length} active{retired ? ` · ${retired} retired` : ""}</div></div>
                  <div className="capital-tile" onClick={() => setView("costs")} style={{ cursor: "pointer" }}><div className="capital-tile-label">Book value</div><div className="capital-tile-value">{fjd0(bookValue)}</div><div className="capital-tile-sub">active assets</div></div>
                  <div className="capital-tile" onClick={() => setView("maintenance")} style={{ cursor: "pointer" }}><div className="capital-tile-label">Service due</div><div className="capital-tile-value" style={{ color: serviceDue > 0 ? "var(--amber)" : null }}>{serviceDue}</div><div className="capital-tile-sub">due soon + overdue</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Down / at-risk</div><div className="capital-tile-value" style={{ color: down > 0 ? "var(--red)" : null }}>{down}</div><div className="capital-tile-sub">{down > 0 ? "needs attention" : "all running"}</div></div>
                </div>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Type:</span>
                  <button className={`filter-pill ${type === "all" ? "active" : ""}`} onClick={() => setType("all")}>All<span className="filter-pill-count">{equip.length}</span></button>
                  {Object.entries(typesPresent).map(([t, n]) => <button key={t} className={`filter-pill ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{TYPE_LABEL[t] || t}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Status:</span>
                  {[["all", "All"], ["ok", "OK"], ["due-soon", "Due soon"], ["overdue", "Overdue"], ["down", "Down"], ["retired", "Retired"]].map(([id, l]) => <button key={id} className={`filter-pill ${status === id ? "active" : ""}`} onClick={() => setStatus(id)}>{l}</button>)}
                </div>
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search equipment by name, make, serial..." aria-label="Search equipment" style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                </div>
                {equip.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>No equipment yet — add your tractors, pumps, sprayers, tools and vehicles to put them on the books.</div>
                  : rows.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No equipment matches these filters.</div>
                  : <div className="equip-fleet-grid">{rows.map((e) => <EquipCard key={e.equipment_id} e={e} cph={cphMap[e.equipment_id]} onOpen={() => setDetail(e)} onEdit={(x) => setForm({ mode: "edit", equip: x })} onMaint={setMaint} onFault={setFault} onResolve={setResolve} />)}</div>}
              </>
            ) : view === "maintenance" ? (
              <>
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  <div className="capital-tile"><div className="capital-tile-label">Due soon</div><div className="capital-tile-value" style={{ color: dueSoon.length ? "var(--amber)" : null }}>{dueSoon.length}</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Overdue</div><div className="capital-tile-value" style={{ color: overdue.length ? "var(--red)" : null }}>{overdue.filter((e) => effStatus(e) === "overdue").length}</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Down</div><div className="capital-tile-value" style={{ color: down ? "var(--red)" : null }}>{down}</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Maintenance cost</div><div className="capital-tile-value">{fjd0(maintCost)}</div><div className="capital-tile-sub">logged</div></div>
                </div>
                {overdue.length === 0 && dueSoon.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--green-dk)", margin: "12px 0" }}>All equipment serviced and current.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>{overdue.concat(dueSoon.filter((e) => !overdue.includes(e))).map((e) => { const st = effStatus(e); return (
                    <div key={e.equipment_id} className="card" style={{ padding: "9px 13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 6 }}>
                      <div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{e.equipment_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{st === "down" ? "DOWN" : serviceLabel(e)}{e.next_service_date ? ` · next ${String(e.next_service_date).slice(0, 10)}` : ""}</div></div>
                      <div style={{ display: "flex", gap: 6 }}>{st === "down" ? <button className="btn btn-primary btn-sm" onClick={() => setResolve(e)}>Mark resolved</button> : null}<button className="btn btn-secondary btn-sm" onClick={() => setMaint(e)}>Log service</button></div>
                    </div>
                  ); })}</div>}
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", margin: "16px 0 8px" }}>Maintenance log</div>
                {maintQ.isError && maintLog.length === 0 ? <ErrorCard msg="Couldn't load the maintenance log." onRetry={() => maintQ.refetch()} />
                  : maintLog.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No maintenance logged yet — use “Log service” on a card or here.</div>
                  : <><div className="inventory-table-wrap"><table className="equip-table"><thead><tr><th>Date</th><th>Equipment</th><th>Type</th><th>Description</th><th>Parts</th><th>Labor</th><th>Total</th><th>Downtime</th></tr></thead>
                    <tbody>{maintLog.map((m) => (
                      <tr key={m.maint_id}>
                        <td style={{ fontSize: 11 }}>{String(m.maint_date).slice(0, 10)}</td><td>{m.equipment_name}</td>
                        <td><span className={`equip-status-pill ${m.maint_type === "repair" ? "down" : "ok"}`} style={{ textTransform: "capitalize" }}>{m.maint_type}</span></td>
                        <td style={{ fontSize: 11.5 }}>{m.description || "—"}</td>
                        <td style={{ fontFamily: "Menlo,monospace" }}>{fjd0(m.parts_cost_fjd)}</td><td style={{ fontFamily: "Menlo,monospace" }}>{fjd0(m.labor_cost_fjd)}</td>
                        <td style={{ fontFamily: "Menlo,monospace", fontWeight: 600 }}>{fjd0(m.total_cost_fjd)}</td><td style={{ fontSize: 11 }}>{num(m.downtime_hours)}h</td>
                      </tr>
                    ))}</tbody></table></div><CapNote n={maintLog.length} /></>}
              </>
            ) : view === "usage" ? (
              <>
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  <div className="capital-tile"><div className="capital-tile-label">Total hours</div><div className="capital-tile-value">{totalHours.toFixed(1)}h</div><div className="capital-tile-sub">logged</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Fuel used</div><div className="capital-tile-value">{totalFuel.toFixed(1)}L</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Fuel cost</div><div className="capital-tile-value">{fjd0(totalFuelCost)}</div></div>
                  <div className="capital-tile"><div className="capital-tile-label">Allocated to cycles</div><div className="capital-tile-value">{allocated.toFixed(1)}h</div></div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}><button className="btn btn-primary" onClick={() => setUsageFor(null)}><Plus size={14} />Log usage</button></div>
                {usageQ.isError && usage.length === 0 ? <ErrorCard msg="Couldn't load usage." onRetry={() => usageQ.refetch()} />
                  : usage.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No usage logged yet — log running hours + fuel to drive cost-per-hour and cycle allocation.</div>
                  : <><div className="inventory-table-wrap"><table className="equip-table"><thead><tr><th>Date</th><th>Equipment</th><th>Hours</th><th>Cycle</th><th>Task</th><th>Fuel</th><th>By</th></tr></thead>
                    <tbody>{usage.map((u) => (
                      <tr key={u.usage_id}>
                        <td style={{ fontSize: 11 }}>{String(u.usage_date).slice(0, 10)}</td><td>{u.equipment_name}</td>
                        <td style={{ fontFamily: "Menlo,monospace" }}>{u.km_run ? `${num(u.km_run)}km` : `${num(u.hours_run)}h`}</td>
                        <td>{u.cycle_id ? <span className="event-anchor-chip">{String(u.cycle_id).replace("CYC-", "")}</span> : <span style={{ color: "var(--muted)", fontSize: 11 }}>overhead</span>}</td>
                        <td style={{ fontSize: 11.5 }}>{u.task || "—"}</td>
                        <td style={{ fontFamily: "Menlo,monospace", fontSize: 11 }}>{num(u.fuel_litres) ? `${num(u.fuel_litres)}L · ${fjd0(u.fuel_cost_fjd)}` : "—"}</td>
                        <td style={{ fontSize: 11 }}>{u.operator || "—"}</td>
                      </tr>
                    ))}</tbody></table></div><CapNote n={usage.length} /></>}
              </>
            ) : view === "costs" ? (
              <CostsView equip={active} usage={usage} maint={maintLog} cphMap={cphMap} mode={costsMode} setMode={setCostsMode} />
            ) : (
              <PartsView parts={parts} loading={partsQ.isLoading} isError={partsQ.isError} onRetry={() => partsQ.refetch()} onAdd={() => setPartOpen(true)} onAdjust={setPartAdjust} />
            )}
            </>
          )}
        </div>
      </main>

      {form && <EquipForm farmId={farmId} mode={form.mode} equip={form.equip} onClose={() => setForm(null)} onSaved={() => { refetch(); setForm(null); }} />}
      {maint && <MaintModal equip={maint} onClose={() => setMaint(null)} farmId={farmId} onSaved={() => { refetch(); setMaint(null); }} />}
      {fault && <FaultModal equip={fault} onClose={() => setFault(null)} onSave={(notes) => { patch(fault.equipment_id, { condition: "POOR", notes }, "Fault reported · marked down"); setFault(null); }} />}
      {resolve && <ResolveModal equip={resolve} onClose={() => setResolve(null)} onSave={(condition) => { patch(resolve.equipment_id, { condition }, "Marked resolved"); setResolve(null); }} />}
      {usageFor !== undefined && <UsageModal farmId={farmId} equip={active} onClose={() => setUsageFor(undefined)} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["equip-usage", farmId] }); setUsageFor(undefined); }} />}
      {partOpen && <PartModal farmId={farmId} equip={equip} onClose={() => setPartOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["equip-parts", farmId] }); setPartOpen(false); }} />}
      {partAdjust && <PartAdjustModal part={partAdjust} onClose={() => setPartAdjust(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["equip-parts", farmId] }); setPartAdjust(null); }} />}
      {detail && <DetailModal e={detail} usage={usage.filter((u) => u.equipment_id === detail.equipment_id)} maint={maintLog.filter((m) => m.equipment_id === detail.equipment_id)} cph={cphMap[detail.equipment_id]} onClose={() => setDetail(null)} onEdit={() => { setForm({ mode: "edit", equip: detail }); setDetail(null); }} onLogUsage={() => { setUsageFor(detail); setDetail(null); }} onLogMaint={() => { setMaint(detail); setDetail(null); }} />}
    </TfpShell>
  );
}

function CostsView({ equip, usage, maint, cphMap, mode, setMode }) {
  const hourable = equip.filter((e) => cphMap[e.equipment_id] != null);
  const avg = hourable.length ? hourable.reduce((s, e) => s + cphMap[e.equipment_id], 0) / hourable.length : 0;
  const writtenDown = equip.reduce((s, e) => s + Math.max(0, num(e.purchase_cost_fjd) - num(e.current_value_fjd)), 0);
  const book = equip.reduce((s, e) => s + num(e.current_value_fjd), 0);
  return (
    <>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Avg op. cost/hour</div><div className="capital-tile-value">{hourable.length ? fjd2(avg) : "—"}</div><div className="capital-tile-sub">excl. depreciation</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Value written down</div><div className="capital-tile-value">{fjd0(writtenDown)}</div><div className="capital-tile-sub">from book value set</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Fleet book value</div><div className="capital-tile-value">{fjd0(book)}</div></div>
      </div>
      <div className="gallery-filter-row" style={{ margin: "12px 0" }}>
        {[["per-hour", "Per-hour"], ["depreciation", "Value written down"]].map(([id, l]) => <button key={id} className={`filter-pill ${mode === id ? "active" : ""}`} onClick={() => setMode(id)}>{l}</button>)}
      </div>
      {mode === "per-hour" ? (
        hourable.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Cost/hour appears once you log running hours + fuel/maintenance.</div>
          : <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>operating cost/hour = (lifetime fuel + lifetime maintenance) ÷ hours run. Excludes depreciation.</div>
            {hourable.slice().sort((a, b) => cphMap[b.equipment_id] - cphMap[a.equipment_id]).map((e) => { const c = cphMap[e.equipment_id]; const max = Math.max(...hourable.map((x) => cphMap[x.equipment_id]), 1); return (
              <div key={e.equipment_id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 120, fontSize: 12, color: "var(--soil)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.equipment_name}</div>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 8, borderRadius: 999, width: `${(c / max) * 100}%`, background: "var(--green-dk)" }} /></div>
                <div style={{ fontFamily: "Menlo,monospace", fontSize: 12 }}>{fjd2(c)}</div>
              </div>
            ); })}
          </div>
      ) : (
        <><div style={{ fontSize: 11, color: "var(--muted)", margin: "0 2px 8px" }}>“Written down” = purchase cost − the book value you’ve set. TFOS doesn’t auto-depreciate yet — keep book value current.</div>
        <div className="inventory-table-wrap"><table className="equip-table"><thead><tr><th>Asset</th><th>Purchase</th><th>Book value</th><th>Written down</th><th>% down</th></tr></thead>
          <tbody>{equip.map((e) => { const pc = num(e.purchase_cost_fjd); const dep = Math.max(0, pc - num(e.current_value_fjd)); const pct = pc > 0 ? Math.round((dep / pc) * 100) : 0; return (
            <tr key={e.equipment_id}><td>{e.equipment_name}</td><td style={{ fontFamily: "Menlo,monospace" }}>{pc ? fjd0(pc) : "—"}</td><td style={{ fontFamily: "Menlo,monospace" }}>{e.current_value_fjd ? fjd0(e.current_value_fjd) : "—"}</td><td style={{ fontFamily: "Menlo,monospace" }}>{pc ? fjd0(dep) : "—"}</td><td>{pc ? `${pct}%` : "—"}</td></tr>
          ); })}</tbody></table></div></>
      )}
    </>
  );
}

function PartsView({ parts, loading, isError, onRetry, onAdd, onAdjust }) {
  const critical = parts.filter((p) => num(p.on_hand) <= 0).length;
  const value = parts.reduce((s, p) => s + num(p.on_hand) * num(p.unit_cost_fjd), 0);
  const ferry = parts.filter((p) => p.ferry_dependent).length;
  return (
    <>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Out of stock</div><div className="capital-tile-value" style={{ color: critical ? "var(--red)" : null }}>{critical}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">On-hand value</div><div className="capital-tile-value">{fjd0(value)}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Ferry-dependent</div><div className="capital-tile-value">{ferry}</div><div className="capital-tile-sub">14-day lead</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Spares</div><div className="capital-tile-value">{parts.length}</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}><button className="btn btn-primary" onClick={onAdd}><Plus size={14} />Add part</button></div>
      {loading ? <div className="card" style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
        : isError && parts.length === 0 ? <ErrorCard msg="Couldn't load spare parts." onRetry={onRetry} />
        : parts.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No spare parts tracked yet — add the parts you keep on hand and their lead time.</div>
        : <div className="inventory-table-wrap"><table className="equip-table"><thead><tr><th>Part</th><th>On hand</th><th>Reorder</th><th>Unit cost</th><th>Lead</th><th>Ferry</th><th>Adjust</th></tr></thead>
          <tbody>{parts.map((p) => (
            <tr key={p.part_id}>
              <td style={{ fontWeight: 600, color: "var(--soil)" }}>{p.part_name}</td>
              <td style={{ color: num(p.on_hand) <= 0 ? "var(--red)" : "var(--soil)", fontWeight: 600 }}>{num(p.on_hand)}</td>
              <td>{p.reorder_point != null ? num(p.reorder_point) : "—"}</td>
              <td style={{ fontFamily: "Menlo,monospace" }}>{p.unit_cost_fjd ? fjd2(p.unit_cost_fjd) : "—"}</td>
              <td>{p.lead_time_days != null ? `${p.lead_time_days}d` : "—"}</td>
              <td>{p.ferry_dependent ? "ferry" : "—"}</td>
              <td><button className="btn btn-secondary btn-sm" onClick={() => onAdjust(p)}>Adjust</button></td>
            </tr>
          ))}</tbody></table></div>}
    </>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function EquipForm({ farmId, mode, equip, onClose, onSaved }) {
  const isEdit = mode === "edit"; const e = equip || {};
  const [f, setF] = useState({
    equipment_name: e.equipment_name || "", equipment_type: e.equipment_type || "TRACTOR", condition: e.condition || "GOOD",
    brand: e.brand || "", model: e.model || "", serial_number: e.serial_number || "",
    purchase_date: e.purchase_date ? String(e.purchase_date).slice(0, 10) : "", purchase_cost_fjd: e.purchase_cost_fjd || "",
    current_value_fjd: e.current_value_fjd || "", next_service_date: e.next_service_date ? String(e.next_service_date).slice(0, 10) : "", notes: e.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.equipment_name.trim()) { emitToast("Name is required"); return; }
    lock.current = true; setBusy(true);
    const payload = {
      equipment_name: f.equipment_name.trim(), equipment_type: f.equipment_type, condition: f.condition,
      brand: f.brand.trim() || null, model: f.model.trim() || null, serial_number: f.serial_number.trim() || null,
      purchase_date: f.purchase_date || null, purchase_cost_fjd: f.purchase_cost_fjd ? Number(f.purchase_cost_fjd) : null,
      current_value_fjd: f.current_value_fjd ? Number(f.current_value_fjd) : null, next_service_date: f.next_service_date || null, notes: f.notes.trim() || null,
    };
    try {
      if (isEdit) await send("PATCH", `/api/v1/equipment/${encodeURIComponent(e.equipment_id)}`, payload);
      else await send("POST", "/api/v1/equipment", { farm_id: farmId, ...payload });
      emitToast(isEdit ? "Equipment updated" : "Equipment added"); onSaved?.();
    } catch (err) { emitToast(err?.userMessage || "Could not save"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={isEdit ? "Edit equipment" : "Add equipment"} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Add equipment"}</button></>}>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div><label>Name</label><input value={f.equipment_name} onChange={set("equipment_name")} placeholder="e.g. Honda 4x4 tractor" /></div>
        <div><label>Type</label><select value={f.equipment_type} onChange={set("equipment_type")}>{TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Make</label><input value={f.brand} onChange={set("brand")} /></div>
        <div><label>Model</label><input value={f.model} onChange={set("model")} /></div>
        <div><label>Serial</label><input value={f.serial_number} onChange={set("serial_number")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Purchase date</label><input type="date" value={f.purchase_date} onChange={set("purchase_date")} /></div>
        <div><label>Purchase cost</label><input type="number" min="0" value={f.purchase_cost_fjd} onChange={set("purchase_cost_fjd")} /></div>
        <div><label>Book value</label><input type="number" min="0" value={f.current_value_fjd} onChange={set("current_value_fjd")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Condition</label><select value={f.condition} onChange={set("condition")}>{CONDITIONS.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</select></div>
        <div><label>Next service date</label><input type="date" value={f.next_service_date} onChange={set("next_service_date")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes</label><textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

function MaintModal({ equip, farmId, onClose, onSaved }) {
  const [f, setF] = useState({ maint_date: todayISO(), maint_type: "service", description: "", parts_cost_fjd: "", labor_cost_fjd: "", downtime_hours: "", next_service_date: plusDaysISO(90), performed_by: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const total = (Number(f.parts_cost_fjd || 0) + Number(f.labor_cost_fjd || 0)) || 0;
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/equipment-maintenance", {
        equipment_id: equip.equipment_id, farm_id: farmId, maint_date: f.maint_date, maint_type: f.maint_type, description: f.description.trim() || null,
        parts_cost_fjd: Number(f.parts_cost_fjd) || 0, labor_cost_fjd: Number(f.labor_cost_fjd) || 0, downtime_hours: Number(f.downtime_hours) || 0,
        next_service_date: f.next_service_date || null, performed_by: f.performed_by.trim() || null, clear_down: effStatus(equip) === "down" });
      emitToast(`Maintenance logged · ${fjd2(total)}`); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not log maintenance"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={`Log maintenance — ${equip.equipment_name}`} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Logging…" : `Log · ${fjd2(total)}`}</button></>}>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Date</label><input type="date" value={f.maint_date} onChange={set("maint_date")} /></div>
        <div><label>Type</label><select value={f.maint_type} onChange={set("maint_type")}><option value="service">Service</option><option value="repair">Repair</option></select></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Description</label><input value={f.description} onChange={set("description")} placeholder="e.g. Oil + filter change" /></div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Parts cost</label><input type="number" min="0" value={f.parts_cost_fjd} onChange={set("parts_cost_fjd")} /></div>
        <div><label>Labor cost</label><input type="number" min="0" value={f.labor_cost_fjd} onChange={set("labor_cost_fjd")} /></div>
        <div><label>Downtime (h)</label><input type="number" min="0" value={f.downtime_hours} onChange={set("downtime_hours")} /></div>
      </div>
      <Field label="Next service date"><input type="date" value={f.next_service_date} onChange={set("next_service_date")} /></Field>
    </Modal>
  );
}

function UsageModal({ farmId, equip, onClose, onSaved }) {
  const [f, setF] = useState({ equipment_id: equip[0]?.equipment_id || "", usage_date: todayISO(), hours_run: "", fuel_litres: "", fuel_cost_fjd: "", cycle_id: "", task: "", operator: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cyclesQ = useQuery({ queryKey: ["cycles-eq"], queryFn: getCycles });
  const cycles = cyclesQ.data ?? [];
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.equipment_id) { emitToast("Pick equipment"); return; }
    if (!Number(f.hours_run)) { emitToast("Enter hours run"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/equipment-usage", {
        equipment_id: f.equipment_id, farm_id: farmId, usage_date: f.usage_date, hours_run: Number(f.hours_run),
        fuel_litres: f.fuel_litres ? Number(f.fuel_litres) : null, fuel_cost_fjd: f.fuel_cost_fjd ? Number(f.fuel_cost_fjd) : null,
        cycle_id: f.cycle_id || null, task: f.task.trim() || null, operator: f.operator.trim() || null });
      emitToast("Usage logged"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not log usage"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Log equipment usage" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Logging…" : "Log usage"}</button></>}>
      <Field label="Equipment"><select value={f.equipment_id} onChange={set("equipment_id")}>{equip.map((e) => <option key={e.equipment_id} value={e.equipment_id}>{e.equipment_name}</option>)}</select></Field>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Date</label><input type="date" value={f.usage_date} onChange={set("usage_date")} /></div>
        <div><label>Hours run</label><input type="number" min="0" step="0.1" value={f.hours_run} onChange={set("hours_run")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Fuel litres</label><input type="number" min="0" step="0.1" value={f.fuel_litres} onChange={set("fuel_litres")} /></div>
        <div><label>Fuel cost (FJD)</label><input type="number" min="0" step="0.01" value={f.fuel_cost_fjd} onChange={set("fuel_cost_fjd")} /></div>
      </div>
      <Field label="Cycle (optional — allocates cost)"><select value={f.cycle_id} onChange={set("cycle_id")}><option value="">Whole-farm / overhead</option>{cycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>{cycleLabel(c, cycles)}</option>)}</select></Field>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Task</label><input value={f.task} onChange={set("task")} placeholder="e.g. Land prep" /></div>
        <div><label>Operator</label><input value={f.operator} onChange={set("operator")} /></div>
      </div>
    </Modal>
  );
}

function PartModal({ farmId, equip, onClose, onSaved }) {
  const [f, setF] = useState({ part_name: "", equipment_id: "", on_hand: "0", reorder_point: "", unit_cost_fjd: "", lead_time_days: "", ferry_dependent: false });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.part_name.trim()) { emitToast("Part name is required"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/equipment-parts", {
        part_name: f.part_name.trim(), farm_id: farmId, equipment_id: f.equipment_id || null, on_hand: Number(f.on_hand) || 0,
        reorder_point: f.reorder_point ? Number(f.reorder_point) : null, unit_cost_fjd: f.unit_cost_fjd ? Number(f.unit_cost_fjd) : null,
        lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null, ferry_dependent: !!f.ferry_dependent });
      emitToast("Part added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not add part"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Add spare part" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add part"}</button></>}>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div><label>Part name</label><input value={f.part_name} onChange={set("part_name")} placeholder="e.g. Pump impeller" /></div>
        <div><label>On hand</label><input type="number" min="0" value={f.on_hand} onChange={set("on_hand")} /></div>
      </div>
      <Field label="For equipment (optional)"><select value={f.equipment_id} onChange={set("equipment_id")}><option value="">Any</option>{equip.map((e) => <option key={e.equipment_id} value={e.equipment_id}>{e.equipment_name}</option>)}</select></Field>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Reorder point</label><input type="number" min="0" value={f.reorder_point} onChange={set("reorder_point")} /></div>
        <div><label>Unit cost</label><input type="number" min="0" value={f.unit_cost_fjd} onChange={set("unit_cost_fjd")} /></div>
        <div><label>Lead time (d)</label><input type="number" min="0" value={f.lead_time_days} onChange={set("lead_time_days")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><input type="checkbox" checked={f.ferry_dependent} onChange={(e) => setF((s) => ({ ...s, ferry_dependent: e.target.checked }))} />Ferry-dependent (14-day lead)</label></div>
    </Modal>
  );
}

function PartAdjustModal({ part, onClose, onSaved }) { // EQ11: replaces window.prompt
  const [oh, setOh] = useState(String(num(part.on_hand)));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (oh === "" || isNaN(Number(oh)) || Number(oh) < 0) { emitToast("Enter a valid quantity"); return; }
    lock.current = true; setBusy(true);
    try { await send("PATCH", `/api/v1/equipment-parts/${encodeURIComponent(part.part_id)}`, { on_hand: Number(oh) }); emitToast("Stock updated"); onSaved?.(); }
    catch (e) { emitToast(e?.userMessage || "Could not update"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={`Adjust stock — ${part.part_name}`} onClose={onClose} maxWidth={420} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
      <Field label="On-hand quantity"><input type="number" min="0" step="1" value={oh} onChange={(e) => setOh(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function FaultModal({ equip, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  return (
    <Modal title={`Report fault — ${equip.equipment_name}`} onClose={onClose} maxWidth={460} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={() => { if (!desc.trim()) { emitToast("Describe the fault"); return; } onSave(`DOWN: ${desc.trim()}`); }}>Report fault</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Marks the asset <strong style={{ color: "var(--red)" }}>down</strong> until you mark it resolved (or log a repair).</div>
      <Field label="What's wrong?"><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Impeller failure · won't prime" /></Field>
    </Modal>
  );
}

function ResolveModal({ equip, onClose, onSave }) { // EQ13: pick condition instead of forcing GOOD
  const [condition, setCondition] = useState("GOOD");
  return (
    <Modal title={`Mark resolved — ${equip.equipment_name}`} onClose={onClose} maxWidth={420} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(condition)}>Mark resolved</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Clears the down status. Set its condition now that it's working again.</div>
      <Field label="Condition"><select value={condition} onChange={(e) => setCondition(e.target.value)}>{RESOLVE_CONDITIONS.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</select></Field>
    </Modal>
  );
}

function DetailModal({ e, usage, maint, cph, onClose, onEdit, onLogUsage, onLogMaint }) {
  const st = effStatus(e);
  return (
    <Modal title={e.equipment_name} onClose={onClose} maxWidth={640} foot={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap", rowGap: 8 }}>
        <span className={`equip-cat-pill ${(e.equipment_type || "").toLowerCase()}`}>{TYPE_LABEL[e.equipment_type] || e.equipment_type}</span>
        <span className={`equip-status-pill ${st}`}><span className={`equip-status-dot ${st}`} />{STATUS_LABEL[st]}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={onEdit}><Pencil size={12} />Edit</button>
        <button className="btn btn-secondary btn-sm" onClick={onLogUsage}>Log usage</button>
        <button className="btn btn-primary btn-sm" onClick={onLogMaint}>Log service</button>
      </div>
      <div className="equip-card-meta" style={{ marginBottom: 14 }}>
        <div className="equip-meta-tile"><div className="equip-meta-label">{e.hours_unit === "km" ? "Distance" : "Hours"}</div><div className="equip-meta-value">{num(e.current_hours) ? `${num(e.current_hours).toLocaleString()}${e.hours_unit === "km" ? "km" : "h"}` : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Op. cost/hr</div><div className="equip-meta-value">{cph != null ? fjd2(cph) : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Book value</div><div className="equip-meta-value">{e.current_value_fjd ? fjd0(e.current_value_fjd) : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Next service</div><div className="equip-meta-value" style={{ fontSize: 10.5 }}>{e.next_service_date ? String(e.next_service_date).slice(0, 10) : "—"}</div></div>
      </div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Maintenance history</div>
      {maint.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>No maintenance logged.</div>
        : <div style={{ marginBottom: 14 }}>{maint.slice(0, 8).map((m) => <div key={m.maint_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}><span style={{ color: "var(--soil)" }}>{String(m.maint_date).slice(0, 10)} · {m.maint_type} · {m.description || "—"}</span><span style={{ fontWeight: 600 }}>{fjd0(m.total_cost_fjd)}</span></div>)}</div>}
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Usage history</div>
      {usage.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No usage logged.</div>
        : usage.slice(0, 8).map((u) => <div key={u.usage_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}><span style={{ color: "var(--soil)" }}>{String(u.usage_date).slice(0, 10)} · {num(u.hours_run)}h · {u.task || "—"}</span><span style={{ color: "var(--muted)" }}>{num(u.fuel_litres) ? `${num(u.fuel_litres)}L` : ""}</span></div>)}
    </Modal>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function Equipment() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <EquipmentInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

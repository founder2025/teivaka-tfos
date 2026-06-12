/**
 * Equipment.jsx — /farm/equipment — PIXEL-EXACT rebuild of the prototype's Assets & Equipment.
 *
 * Reproduces coreEquipmentView (Fleet) pixel-for-pixel — the "Shared across your farm" card,
 * capital-strip, type + status filter pills, search, and the equip-card fleet grid (avatar,
 * type/status pills, down-banner, service-countdown, meta tiles, actions) under <TfpShell> —
 * replacing the Team-design page + stale ModeDropdown. Wired to real /api/v1/equipment:
 *   Add → POST   Edit / Maintenance / Report fault / Mark resolved → PATCH /equipment/{id}
 * Status derived from condition + next_service_date. Usage/Costs/Parts/Analytics = honest Building.
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Pencil, Tractor, Droplets, Wrench, Truck, Factory, Warehouse, Package, AlertTriangle } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function plusDaysISO(n) { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function num(v) { return Number(v ?? 0); }
function fjd0(v) { const n = Number(v ?? 0); return `FJD ${Math.round(n).toLocaleString("en-FJ")}`; }

const TYPE_LABEL = { TRACTOR: "Tractor", IRRIGATION: "Irrigation", VEHICLE: "Vehicle", PROCESSING: "Processing", STORAGE: "Storage", TOOL: "Tool", OTHER: "Other" };
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
const TYPE_ICON = { TRACTOR: Tractor, IRRIGATION: Droplets, VEHICLE: Truck, PROCESSING: Factory, STORAGE: Warehouse, TOOL: Wrench, OTHER: Package };
const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DECOMMISSIONED"];
const VIEWS = [["fleet", "Fleet", "Assets"], ["maintenance", "Maintenance", "Service"], ["usage", "Usage", "Hours & fuel"], ["costs", "Costs", "Per-hour & P&L"], ["parts", "Parts", "Spares"], ["analytics", "Analytics", "Utilization"]];
const STATUS_LABEL = { ok: "OK", "due-soon": "Due soon", overdue: "Overdue", down: "Down" };

function effStatus(e) {
  if (e.condition === "POOR" || e.condition === "DECOMMISSIONED") return "down";
  if (e.next_service_date) { const d = Date.parse(e.next_service_date); if (Number.isFinite(d)) { const days = Math.floor((d - Date.now()) / 864e5); if (days < 0) return "overdue"; if (days <= 30) return "due-soon"; } }
  return "ok";
}
function serviceLabel(e) {
  if (!e.next_service_date) return "Calendar-tracked";
  const d = Date.parse(e.next_service_date); if (!Number.isFinite(d)) return "Calendar-tracked";
  const days = Math.floor((d - Date.now()) / 864e5);
  return days < 0 ? `OVERDUE ${Math.abs(days)}d` : `${days}d to service`;
}
function yearOf(d) { if (!d) return ""; const y = new Date(d).getFullYear(); return Number.isFinite(y) ? y : ""; }

async function getEquipment(farmId) { const r = await fetch(`/api/v1/equipment?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? []; }

function EquipCard({ e, onOpen, onMaint, onFault, onResolve, onEdit }) {
  const st = effStatus(e); const Icon = TYPE_ICON[e.equipment_type] || Package;
  const sub = [e.brand, e.model, yearOf(e.purchase_date)].filter(Boolean).join(" ");
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
        <button className="btn btn-secondary btn-sm" title="Edit" onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}><Pencil size={12} /></button>
      </div>
      {st === "down"
        ? <div className="down-banner"><AlertTriangle size={14} /><div><strong>DOWN{e.condition === "DECOMMISSIONED" ? " · decommissioned" : " · fault reported"}</strong>{e.notes ? <><br />{e.notes}</> : null}</div></div>
        : <div className={`service-countdown ${st === "ok" ? "ok" : st}`}>{serviceLabel(e)}</div>}
      <div className="equip-card-meta">
        <div className="equip-meta-tile"><div className="equip-meta-label">Condition</div><div className="equip-meta-value" style={{ fontSize: 11 }}>{e.condition ? e.condition[0] + e.condition.slice(1).toLowerCase() : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Book value</div><div className="equip-meta-value">{e.current_value_fjd ? fjd0(e.current_value_fjd) : "—"}</div></div>
        <div className="equip-meta-tile"><div className="equip-meta-label">Next service</div><div className="equip-meta-value" style={{ fontSize: 10.5 }}>{e.next_service_date ? String(e.next_service_date).slice(0, 10) : "—"}</div></div>
      </div>
      <div className="equip-card-actions">
        <button className="btn btn-secondary" onClick={() => onMaint(e)}>Maintenance</button>
        {st === "down" ? <button className="btn btn-primary" onClick={() => onResolve(e)}>Mark resolved</button> : <button className="btn btn-secondary" onClick={() => onFault(e)}>Report fault</button>}
      </div>
    </div>
  );
}

function Building({ title, body }) {
  return <div className="card" style={{ padding: "16px 18px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</span><span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Building</span></div><div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{body}</div></div>;
}

function EquipmentInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("fleet");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // {mode:'add'|'edit', equip?}
  const [maint, setMaint] = useState(null);
  const [fault, setFault] = useState(null);

  const equipQ = useQuery({ queryKey: ["equipment", farmId], queryFn: () => getEquipment(farmId), enabled: !!farmId });
  const equip = equipQ.data ?? [];

  const bookValue = equip.reduce((s, e) => s + num(e.current_value_fjd), 0);
  const serviceDue = equip.filter((e) => ["due-soon", "overdue"].includes(effStatus(e))).length;
  const down = equip.filter((e) => effStatus(e) === "down").length;
  const typesPresent = useMemo(() => { const m = {}; equip.forEach((e) => { m[e.equipment_type] = (m[e.equipment_type] || 0) + 1; }); return m; }, [equip]);

  let rows = equip.slice();
  if (type !== "all") rows = rows.filter((e) => e.equipment_type === type);
  if (status !== "all") rows = rows.filter((e) => effStatus(e) === status);
  if (q.trim()) { const qq = q.toLowerCase(); rows = rows.filter((e) => `${e.equipment_name} ${e.brand || ""} ${e.model || ""} ${e.serial_number || ""}`.toLowerCase().includes(qq)); }

  const refetch = () => qc.invalidateQueries({ queryKey: ["equipment", farmId] });
  async function patch(id, body, okMsg) {
    try { const r = await fetch(`/api/v1/equipment/${encodeURIComponent(id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(); emitToast(okMsg); refetch(); }
    catch { emitToast("Could not update"); }
  }

  const maintList = useMemo(() => equip.slice().sort((a, b) => String(a.next_service_date || "9999").localeCompare(String(b.next_service_date || "9999"))), [equip]);

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Assets &amp; Equipment</h1><div className="subtitle">Crops + animals · {equip.length} asset{equip.length === 1 ? "" : "s"}{down > 0 ? ` · ${down} down` : ""}</div></div>
            <div className="page-actions"><FarmSelector /><button className="btn btn-primary" onClick={() => setForm({ mode: "add" })}><Plus size={13} />Add equipment</button></div>
          </div>

          <div className="cycle-view-tabs">
            {VIEWS.map(([id, l, s]) => <div key={id} className={`task-tab ${view === id ? "active" : ""}`} onClick={() => setView(id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></div>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its assets.</div>
            : equipQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : view === "fleet" ? (
              <>
                <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
                  <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 6 }}>Shared across your farm</div>
                  <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.6 }}>Your machines and tools aren't tied to one crop — the pump waters beds and fills troughs, the ute hauls produce and stock, hand tools serve every job. Each asset is logged once and worked across every enterprise. Animal-specific gear (feeders, coops, fencing, milking, incubators) registers here the same way.</div>
                </div>

                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  <div className="capital-tile"><div className="capital-tile-label">Total assets</div><div className="capital-tile-value">{equip.length}</div><div className="capital-tile-sub">{farmId} fleet</div></div>
                  <div className="capital-tile" onClick={() => setView("costs")} style={{ cursor: "pointer" }}><div className="capital-tile-label">Book value</div><div className="capital-tile-value">FJD {(bookValue / 1000).toFixed(1)}k</div><div className="capital-tile-sub">balance sheet</div></div>
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
                  {[["all", "All"], ["ok", "OK"], ["due-soon", "Due soon"], ["overdue", "Overdue"], ["down", "Down"]].map(([id, l]) => <button key={id} className={`filter-pill ${status === id ? "active" : ""}`} onClick={() => setStatus(id)}>{l}</button>)}
                </div>
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search equipment by name, make, serial..." style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                </div>

                {equip.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>No equipment yet — add your tractors, pumps, sprayers, tools and vehicles to put them on the books.</div>
                  : rows.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No equipment matches these filters.</div>
                  : <div className="equip-fleet-grid">{rows.map((e) => <EquipCard key={e.equipment_id} e={e} onOpen={() => setForm({ mode: "edit", equip: e })} onEdit={(x) => setForm({ mode: "edit", equip: x })} onMaint={setMaint} onFault={setFault} onResolve={(x) => patch(x.equipment_id, { condition: "GOOD" }, "Marked resolved")} />)}</div>}
              </>
            ) : view === "maintenance" ? (
              maintList.length === 0 ? <Building title="Maintenance schedule" body="Service dates appear here as you add equipment and log maintenance." />
                : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{maintList.map((e) => { const st = effStatus(e); return (
                  <div key={e.equipment_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{e.equipment_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{TYPE_LABEL[e.equipment_type] || e.equipment_type} · {e.next_service_date ? `next ${String(e.next_service_date).slice(0, 10)}` : "no service date"} · {serviceLabel(e)}</div></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className={`equip-status-pill ${st}`}><span className={`equip-status-dot ${st}`} />{STATUS_LABEL[st]}</span><button className="btn btn-secondary btn-sm" onClick={() => setMaint(e)}>Log service</button></div>
                  </div>
                ); })}</div>
            ) : view === "usage" ? <Building title="Usage — hours & fuel" body="Log running hours and fuel per machine to drive cost-per-hour and service-by-hours. Needs a usage-log table — ships next; nothing fabricated until then." />
            : view === "costs" ? <Building title="Costs — per-hour & P&L" body="Cost per hour and asset P&L roll up from purchase cost, maintenance spend (Cash · category EQUIPMENT) and logged hours. Turns on once usage + maintenance costs are logged." />
            : view === "parts" ? <Building title="Parts & spares" body="Track spare parts, their suppliers and ferry lead time. Needs a parts inventory — on the roadmap." />
            : <Building title="Utilization analytics" body="Which assets earn their keep — utilization and downtime trends. Builds from usage + fault history." />}
        </div>
      </main>

      {form && <EquipForm farmId={farmId} mode={form.mode} equip={form.equip} onClose={() => setForm(null)} onSaved={() => { refetch(); setForm(null); }} />}
      {maint && <MaintModal equip={maint} onClose={() => setMaint(null)} onSave={(body) => { patch(maint.equipment_id, body, "Service logged"); setMaint(null); }} />}
      {fault && <FaultModal equip={fault} onClose={() => setFault(null)} onSave={(notes) => { patch(fault.equipment_id, { condition: "POOR", notes }, "Fault reported · marked down"); setFault(null); }} />}
    </TfpShell>
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
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }));
  async function submit() {
    if (!f.equipment_name.trim()) { emitToast("Name is required"); return; }
    setBusy(true);
    const payload = {
      equipment_name: f.equipment_name.trim(), equipment_type: f.equipment_type, condition: f.condition,
      brand: f.brand.trim() || null, model: f.model.trim() || null, serial_number: f.serial_number.trim() || null,
      purchase_date: f.purchase_date || null, purchase_cost_fjd: f.purchase_cost_fjd ? Number(f.purchase_cost_fjd) : null,
      current_value_fjd: f.current_value_fjd ? Number(f.current_value_fjd) : null, next_service_date: f.next_service_date || null, notes: f.notes.trim() || null,
    };
    try {
      const r = isEdit
        ? await fetch(`/api/v1/equipment/${encodeURIComponent(e.equipment_id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) })
        : await fetch("/api/v1/equipment", { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, ...payload }) });
      if (!r.ok) { let m = "Could not save"; try { const b = await r.json(); m = b?.detail || m; } catch {} emitToast(typeof m === "string" ? m : "Could not save"); return; }
      emitToast(isEdit ? "Equipment updated" : "Equipment added"); onSaved?.();
    } catch { emitToast("Could not save"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{isEdit ? "Edit equipment" : "Add equipment"}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
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
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Add equipment"}</button></div>
      </div>
    </div>
  );
}

function MaintModal({ equip, onClose, onSave }) {
  const [last, setLast] = useState(todayISO());
  const [next, setNext] = useState(plusDaysISO(90));
  const [note, setNote] = useState("");
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Log service — {equip.equipment_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label>Serviced on</label><input type="date" value={last} onChange={(e) => setLast(e.target.value)} /></div>
            <div><label>Next service</label><input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}><label>What was done (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. oil + filter change" /></div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave({ last_service_date: last, next_service_date: next, ...(note.trim() ? { notes: `Serviced ${last}: ${note.trim()}` } : {}) })}>Log service</button></div>
      </div>
    </div>
  );
}

function FaultModal({ equip, onClose, onSave }) {
  const [desc, setDesc] = useState("");
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Report fault — {equip.equipment_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Marks the asset <strong style={{ color: "var(--red)" }}>down</strong> until you mark it resolved.</div>
          <Field label="What's wrong?"><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Impeller failure · won't prime" /></Field>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={() => { if (!desc.trim()) { emitToast("Describe the fault"); return; } onSave(`DOWN: ${desc.trim()}`); }}>Report fault</button></div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Equipment() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <EquipmentInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

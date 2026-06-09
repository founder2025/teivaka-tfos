/**
 * Equipment.jsx — /farm/equipment
 *
 * Team design system + v262 Equipment surface, all 6 prototype tabs.
 *   Live: GET/POST /api/v1/equipment (Fleet register + add + service-due).
 *   Empty (named backend needed): Maintenance, Usage, Costs, Parts, Analytics.
 */
import { useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { Plus, AlertTriangle } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";
import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E",
};
const EQUIP_TYPES = [
  { value: "TRACTOR", label: "Tractor" },
  { value: "IRRIGATION", label: "Irrigation" },
  { value: "TOOL", label: "Tool" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "PROCESSING", label: "Processing" },
  { value: "STORAGE", label: "Storage" },
  { value: "OTHER", label: "Other" },
];
const TABS = [
  { id: "fleet", label: "Fleet", hint: "Assets" },
  { id: "maintenance", label: "Maintenance", hint: "Service schedule" },
  { id: "usage", label: "Usage", hint: "Hours & fuel", needs: "an equipment-usage log (no hours/fuel column yet)" },
  { id: "costs", label: "Costs", hint: "Value & depreciation" },
  { id: "parts", label: "Parts", hint: "Spares", needs: "a spare-parts inventory" },
  { id: "analytics", label: "Analytics", hint: "Condition & value" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function formatFJD(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function typeLabel(v) { return EQUIP_TYPES.find((t) => t.value === v)?.label || v || "—"; }
function serviceDue(next) {
  if (!next) return null;
  const days = Math.ceil((new Date(String(next).slice(0, 10)) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, color: C.red };
  if (days <= 14) return { label: `Service in ${days}d`, color: C.amber };
  return { label: `Service in ${days}d`, color: C.green };
}

async function fetchEquipment(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/equipment?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}

function AddEquipmentModal({ farmId, isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("TRACTOR");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [value, setValue] = useState("");
  const [nextService, setNextService] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) { emitToast("Equipment name is required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/equipment", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ farm_id: farmId, equipment_name: name.trim(), equipment_type: type, brand: make.trim() || null, model: model.trim() || null, current_value_fjd: value ? Number(value) : null, next_service_date: nextService || null }),
      });
      if (!res.ok) throw new Error();
      emitToast("Equipment added"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not add equipment"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add equipment"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add equipment</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kubota L3408" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Type
          <ThemedSelect value={type} onChange={setType} options={EQUIP_TYPES} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Make (optional)
            <input value={make} onChange={(e) => setMake(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Model (optional)
            <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Current value (FJD)
            <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Next service due
            <input type="date" value={nextService} onChange={(e) => setNextService(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        </div>
      </div>
    </Modal>
  );
}

function NeedsBlock({ tab }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{tab.label}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>
        This tab is ready and will populate from {tab.needs}. No numbers shown until that data is real — by design, so nothing here is fabricated.
      </div>
    </div>
  );
}

function EquipmentInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("fleet");
  const [addOpen, setAddOpen] = useState(false);

  const equipQuery = useQuery({ queryKey: ["equipment", farmId], queryFn: () => fetchEquipment(farmId), enabled: !!farmId });
  const items = equipQuery.data ?? [];
  const dueCount = items.filter((e) => { const s = serviceDue(e.next_service_date); return s && s.color !== C.green; }).length;
  const fleetValue = items.reduce((s, e) => s + Number(e.current_value_fjd ?? 0), 0);
  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Equipment</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Asset register · maintenance · utilization</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FarmSelector />
        <ModeDropdown />
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Assets" value={String(items.length)} sub="in fleet" loading={equipQuery.isLoading} />
        <MetricCard label="Service due" value={String(dueCount)} sub="due / overdue" loading={equipQuery.isLoading} />
        <MetricCard label="Fleet value" value={formatFJD(fleetValue)} sub="current" loading={equipQuery.isLoading} />
        <MetricCard label="Usage hours" phase="Phase 6.5" />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-4 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>{activeTab.label}</div>
          {tab === "fleet" && <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={15} /> Add equipment</button>}
        </div>

        {tab === "fleet" && (
          <div className="space-y-2">
            {equipQuery.isLoading && <p style={{ color: C.muted }}>Loading fleet…</p>}
            {!equipQuery.isLoading && items.length === 0 && <p style={{ color: C.muted }}>No equipment yet. Add your first asset.</p>}
            {items.map((e) => {
              const due = serviceDue(e.next_service_date);
              return (
                <div key={e.equipment_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.soil }}>{e.equipment_name}</div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {typeLabel(e.equipment_type)}{(e.brand || e.model) ? ` · ${[e.brand, e.model].filter(Boolean).join(" ")}` : ""}{e.current_value_fjd != null ? ` · ${formatFJD(e.current_value_fjd)}` : ""}
                    </div>
                  </div>
                  {due && (
                    <span className="text-xs font-semibold flex items-center gap-1 rounded-full px-2 py-1" style={{ color: due.color, background: "white", border: `1px solid ${C.border}` }}>
                      {due.color === C.red && <AlertTriangle size={12} />} {due.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "maintenance" && (() => {
          // Real service schedule from the fleet's last/next_service_date + condition.
          const sorted = [...items].sort((a, b) => String(a.next_service_date || "9999").localeCompare(String(b.next_service_date || "9999")));
          if (!items.length) return <p style={{ color: C.muted }}>No equipment yet — service schedule appears as you add assets with service dates.</p>;
          return (
            <div className="space-y-2">
              {sorted.map((e) => { const d = serviceDue(e.next_service_date); return (
                <div key={e.equipment_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.soil }}>{e.equipment_name}</div>
                    <div className="text-xs" style={{ color: C.muted }}>{e.condition ? `${e.condition} · ` : ""}last service {e.last_service_date ? String(e.last_service_date).slice(0, 10) : "—"}</div>
                  </div>
                  {d ? <span className="text-xs font-semibold rounded-full px-2 py-1" style={{ color: d.color, background: "white", border: `1px solid ${C.border}` }}>{d.label}</span>
                     : <span className="text-xs" style={{ color: C.muted }}>no service date</span>}
                </div>
              ); })}
            </div>
          );
        })()}

        {tab === "costs" && (() => {
          // Real value/depreciation by type from purchase_cost_fjd vs current_value_fjd.
          if (!items.length) return <p style={{ color: C.muted }}>Add equipment to see fleet value and depreciation.</p>;
          const by = {};
          items.forEach((e) => { const k = typeLabel(e.equipment_type); (by[k] = by[k] || { cur: 0, buy: 0, n: 0 }); by[k].cur += Number(e.current_value_fjd) || 0; by[k].buy += Number(e.purchase_cost_fjd) || 0; by[k].n += 1; });
          const totalCur = items.reduce((a, e) => a + (Number(e.current_value_fjd) || 0), 0);
          const totalBuy = items.reduce((a, e) => a + (Number(e.purchase_cost_fjd) || 0), 0);
          return (
            <div className="space-y-2">
              <div className="text-sm font-semibold" style={{ color: C.soil }}>Fleet value {formatFJD(totalCur)} · purchased {formatFJD(totalBuy)} · depreciation {formatFJD(totalBuy - totalCur)}</div>
              {Object.entries(by).sort((a, b) => b[1].cur - a[1].cur).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-xl p-2.5 text-sm" style={{ background: C.cream }}>
                  <span style={{ color: C.soil }}>{k} <span style={{ color: C.muted }}>· {v.n}</span></span>
                  <span style={{ color: C.soil }}>{formatFJD(v.cur)}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {tab === "analytics" && (() => {
          // Real condition + value-by-type breakdown.
          if (!items.length) return <p style={{ color: C.muted }}>Fleet analytics appear once you add equipment.</p>;
          const cond = {};
          items.forEach((e) => { const k = e.condition || "UNKNOWN"; cond[k] = (cond[k] || 0) + 1; });
          const byType = {};
          items.forEach((e) => { const k = typeLabel(e.equipment_type); byType[k] = (byType[k] || 0) + (Number(e.current_value_fjd) || 0); });
          const maxV = Math.max(1, ...Object.values(byType));
          return (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.muted }}>Condition</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(cond).map(([k, n]) => <span key={k} className="text-xs rounded-full px-2 py-1" style={{ background: C.cream, color: C.soil }}>{k}: {n}</span>)}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.muted }}>Value by type</div>
                {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="mb-1.5">
                    <div className="flex justify-between text-xs mb-0.5" style={{ color: C.soil }}><span>{k}</span><span>{formatFJD(v)}</span></div>
                    <div className="h-2 rounded-full" style={{ background: C.cream }}><div className="h-2 rounded-full" style={{ width: `${Math.round((v / maxV) * 100)}%`, background: C.greenDk }} /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {activeTab.needs && <NeedsBlock tab={activeTab} />}
      </section>

      <AddEquipmentModal farmId={farmId} isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["equipment", farmId] })} />
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

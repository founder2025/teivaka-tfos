/**
 * Equipment.jsx — /farm/equipment
 *
 * Replaces the ComingSoon stub. Parity target: prototype v262 Equipment.
 * SCOPE (bounded by live API): register + add + service-due indicator.
 *   GET/POST /api/v1/equipment
 * NOT yet backed (absent, no mock data): usage hours log, maintenance log,
 * cost-per-hour, parts, downtime — need backend endpoints.
 *
 * Conventions mirror CashLedger/Labor/Buyers.
 */
import { useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { Wrench, Plus, AlertTriangle } from "lucide-react";

import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", bgPage: "#F5EFE0", border: "#E6DED0",
  muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E",
};
const EQUIP_TYPES = [
  { value: "TRACTOR", label: "Tractor" },
  { value: "IRRIGATION", label: "Irrigation" },
  { value: "SPRAYER", label: "Sprayer" },
  { value: "HAND_TOOL", label: "Hand tool" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "OTHER", label: "Other" },
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

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? b?.farms ?? [];
}
async function fetchEquipment(farmId) {
  const qs = farmId ? `?farm_id=${encodeURIComponent(farmId)}` : "";
  const res = await fetch(`/api/v1/equipment${qs}`, { headers: authHeaders() });
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
        body: JSON.stringify({
          farm_id: farmId, equipment_name: name.trim(), equipment_type: type,
          make: make.trim() || null, model: model.trim() || null,
          current_value_fjd: value ? Number(value) : null,
          next_service_due: nextService || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Equipment added"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not add equipment"); } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add equipment"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add equipment</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kubota L3408" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Type
          <ThemedSelect value={type} onChange={setType} options={EQUIP_TYPES} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Make (optional)
            <input value={make} onChange={(e) => setMake(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
          <label className="block text-sm" style={{ color: C.soil }}>Model (optional)
            <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Current value (FJD)
            <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
          <label className="block text-sm" style={{ color: C.soil }}>Next service due
            <input type="date" value={nextService} onChange={(e) => setNextService(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function EquipmentInner() {
  const qc = useQueryClient();
  const [farmId, setFarmId] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const farmsQuery = useQuery({ queryKey: ["farms"], queryFn: fetchFarms });
  const farms = farmsQuery.data ?? [];
  const activeFarm = farmId || farms[0]?.farm_id || "";
  const equipQuery = useQuery({ queryKey: ["equipment", activeFarm], queryFn: () => fetchEquipment(activeFarm), enabled: !!activeFarm });
  const items = equipQuery.data ?? [];
  const dueCount = items.filter((e) => { const s = serviceDue(e.next_service_due); return s && s.color !== C.green; }).length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" style={{ background: C.bgPage, minHeight: "100%" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Wrench size={22} color={C.soil} />
          <h1 className="text-xl font-semibold" style={{ color: C.soil }}>Equipment</h1>
        </div>
        <div className="flex items-center gap-2">
          {farms.length > 1 && (
            <ThemedSelect value={activeFarm} onChange={setFarmId} options={farms.map((f) => ({ value: f.farm_id, label: f.farm_name || f.farm_id }))} />
          )}
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={16} /> Add equipment</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Assets</div>
          <div className="text-2xl font-semibold" style={{ color: C.soil }}>{items.length}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Service due / overdue</div>
          <div className="text-2xl font-semibold" style={{ color: dueCount ? C.red : C.greenDk }}>{dueCount}</div>
        </div>
      </div>

      <div className="space-y-2">
        {equipQuery.isLoading && <p style={{ color: C.muted }}>Loading equipment…</p>}
        {!equipQuery.isLoading && items.length === 0 && <p style={{ color: C.muted }}>No equipment yet. Add your first asset.</p>}
        {items.map((e) => {
          const due = serviceDue(e.next_service_due);
          return (
            <div key={e.equipment_id} className="flex items-center justify-between rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
              <div>
                <div className="font-medium" style={{ color: C.soil }}>{e.equipment_name}</div>
                <div className="text-xs" style={{ color: C.muted }}>
                  {typeLabel(e.equipment_type)}
                  {(e.make || e.model) ? ` · ${[e.make, e.model].filter(Boolean).join(" ")}` : ""}
                  {e.current_value_fjd != null ? ` · ${formatFJD(e.current_value_fjd)}` : ""}
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

      <AddEquipmentModal farmId={activeFarm} isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["equipment", activeFarm] })} />
    </div>
  );
}

const _client = new QueryClient();
export default function Equipment() {
  return (
    <QueryClientProvider client={_client}>
      <EquipmentInner />
    </QueryClientProvider>
  );
}

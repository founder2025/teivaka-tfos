/**
 * Labor.jsx — /farm/labor
 *
 * Rebuilt to match the team design system (FarmDashboard pattern) + the v262
 * prototype Labor surface. Layout: title + subtitle, FarmSelector/ModeDropdown
 * header row, MetricCard snapshot grid (live where the API serves it, dimmed
 * phase-stubs where it doesn't — the established parity convention), prototype
 * view tabs, white section cards.
 *
 * Live API: GET/POST /api/v1/workers, PATCH /workers/{id}/rate,
 *           GET/POST /api/v1/labor.
 * Phase-stub (no backend yet, shown dimmed, no mock data): On-site/Expected
 * live status, Payroll (WAGE_PAID/batch pay), Tasks, Costing, Productivity.
 */
import { useMemo, useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { Plus, Pencil, Clock, Phone } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";
import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E",
  greenTint: "#E9F2DD",
};

const WORKER_TYPES = [
  { value: "CASUAL", label: "Casual" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "SEASONAL", label: "Seasonal" },
  { value: "CONTRACTOR", label: "Contractor" },
];

// Prototype view tabs. `phase` set = dimmed stub (no backend yet).
const TABS = [
  { id: "roster", label: "Roster", hint: "Workers" },
  { id: "timesheets", label: "Timesheets", hint: "Hours & days" },
  { id: "payroll", label: "Payroll", hint: "Owed & paid", phase: "Phase 4.2" },
  { id: "tasks", label: "Tasks", hint: "Assignments", phase: "Phase 4.2" },
  { id: "costing", label: "Costing", hint: "Labour cost", phase: "Phase 6" },
  { id: "productivity", label: "Productivity", hint: "Trends", phase: "Phase 6" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatFJD(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function typeLabel(v) { return WORKER_TYPES.find((t) => t.value === v)?.label || v || "—"; }
function initials(name) {
  return String(name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

async function fetchWorkers(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}
async function fetchLabor(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}

// ── Modals (functional, API-backed) ──────────────────────────────────
function AddWorkerModal({ farmId, isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("CASUAL");
  const [rate, setRate] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || !rate) { emitToast("Name and daily rate are required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/workers", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ farm_id: farmId, full_name: name.trim(), worker_type: type, daily_rate_fjd: Number(rate), contact_number: phone.trim() || null }),
      });
      if (res.status === 403) { emitToast("You don't have permission to add workers"); return; }
      if (!res.ok) throw new Error();
      emitToast("Worker added"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not add worker"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add worker"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add worker</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laisenia Waqa" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Worker type
          <ThemedSelect value={type} onChange={setType} options={WORKER_TYPES} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Daily rate (FJD)
          <input type="number" min="0" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="30.00" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+679 …" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <p className="text-xs" style={{ color: C.muted }}>Fiji minimum wage is FJD 4.00/hr. Adding a worker writes an audit record.</p>
      </div>
    </Modal>
  );
}

function EditRateModal({ worker, isOpen, onClose, onSaved }) {
  const [rate, setRate] = useState(worker ? String(worker.daily_rate_fjd ?? "") : "");
  const [busy, setBusy] = useState(false);
  if (!worker) return null;
  async function submit() {
    if (!rate) { emitToast("Enter a rate"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/workers/${encodeURIComponent(worker.worker_id)}/rate?daily_rate_fjd=${encodeURIComponent(Number(rate))}`, { method: "PATCH", headers: authHeaders() });
      if (res.status === 403) { emitToast("Only FOUNDER or MANAGER can change rates"); return; }
      if (!res.ok) throw new Error();
      emitToast("Rate updated"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not update rate"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit rate — ${worker.full_name}`} size="sm"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk }}>Save</button>
      </div>}>
      <label className="block text-sm" style={{ color: C.soil }}>Daily rate (FJD)
        <input type="number" min="0" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
    </Modal>
  );
}

function LogAttendanceModal({ farmId, workers, isOpen, onClose, onSaved }) {
  const [workerId, setWorkerId] = useState("");
  const [hours, setHours] = useState("8");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = workers.find((w) => w.worker_id === workerId);
  const dailyRate = Number(worker?.daily_rate_fjd ?? 0);
  const totalPay = useMemo(() => Math.round(dailyRate * (Number(hours || 0) / 8) * 100) / 100, [dailyRate, hours]);
  async function submit() {
    if (!workerId) { emitToast("Pick a worker"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/labor", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ worker_id: workerId, farm_id: farmId, work_date: todayISO(), hours_worked: Number(hours), daily_rate_fjd: dailyRate, total_pay_fjd: totalPay, task_description: task.trim() || null }),
      });
      if (!res.ok) throw new Error();
      emitToast("Attendance logged"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not log attendance"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark attendance"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy || !workerId} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy || !workerId ? 0.6 : 1 }}>Log · {formatFJD(totalPay)}</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Worker
          <ThemedSelect value={workerId} onChange={setWorkerId} placeholder="Pick a worker…"
            options={workers.map((w) => ({ value: w.worker_id, label: `${w.full_name} · ${formatFJD(w.daily_rate_fjd)}/day` }))} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Hours worked
          <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Task (optional)
          <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Weeding Bed 3" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <div className="text-sm rounded-lg p-3" style={{ background: C.greenTint, color: C.greenDk }}>
          Pay for this entry: <strong>{formatFJD(totalPay)}</strong> ({hours}h @ {formatFJD(dailyRate)}/day)</div>
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
function LaborInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("roster");
  const [addOpen, setAddOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [rateWorker, setRateWorker] = useState(null);

  const workersQuery = useQuery({ queryKey: ["workers", farmId], queryFn: () => fetchWorkers(farmId), enabled: !!farmId });
  const laborQuery = useQuery({ queryKey: ["labor", farmId], queryFn: () => fetchLabor(farmId), enabled: !!farmId });
  const workers = workersQuery.data ?? [];
  const attendance = laborQuery.data ?? [];
  const wagesRecorded = useMemo(() => attendance.reduce((s, r) => s + Number(r.total_pay_fjd ?? 0), 0), [attendance]);
  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Labor</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Your team · payday surface · Fiji wage compliance</div>
      </div>

      {/* Header row — shared components */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FarmSelector />
        <ModeDropdown />
      </div>

      {/* Snapshot grid — live + dimmed phase stubs (prototype parity) */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        <MetricCard label="Active workers" value={String(workers.length)} sub="on roster" loading={workersQuery.isLoading} />
        <MetricCard label="Wages recorded" value={formatFJD(wagesRecorded)} sub="recent timesheets" loading={laborQuery.isLoading} />
        <MetricCard label="On-site now" phase="Phase 4.2" />
        <MetricCard label="Expected today" phase="Phase 4.2" />
        <MetricCard label="Next payday" phase="Phase 4.2" />
      </div>

      {/* View tabs */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.phase ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>

      {/* Section card */}
      <section className="bg-white rounded-2xl px-4 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>{activeTab.label}</div>
          {tab === "roster" && (
            <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={15} /> Add worker</button>
          )}
          {tab === "timesheets" && (
            <button onClick={() => setLogOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Clock size={15} /> Mark attendance</button>
          )}
        </div>

        {/* Roster */}
        {tab === "roster" && (
          <div className="space-y-2">
            {workersQuery.isLoading && <p style={{ color: C.muted }}>Loading workers…</p>}
            {!workersQuery.isLoading && workers.length === 0 && <p style={{ color: C.muted }}>No workers yet. Add your first worker.</p>}
            {workers.map((w) => (
              <div key={w.worker_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ background: C.green }}>{initials(w.full_name)}</div>
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.soil }}>{w.full_name}</div>
                    <div className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                      <span>{typeLabel(w.worker_type)}</span>
                      {w.contact_number && <span className="flex items-center gap-1"><Phone size={10} />{w.contact_number}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right"><div className="font-semibold text-sm" style={{ color: C.soil }}>{formatFJD(w.daily_rate_fjd)}</div><div className="text-[10px]" style={{ color: C.muted }}>per day</div></div>
                  <button onClick={() => setRateWorker(w)} className="p-2 rounded-lg" style={{ color: C.muted }} title="Edit rate"><Pencil size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timesheets */}
        {tab === "timesheets" && (
          <div className="space-y-2">
            {laborQuery.isLoading && <p style={{ color: C.muted }}>Loading timesheets…</p>}
            {!laborQuery.isLoading && attendance.length === 0 && <p style={{ color: C.muted }}>No attendance logged yet.</p>}
            {attendance.map((r) => (
              <div key={r.attendance_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                <div>
                  <div className="font-medium text-sm" style={{ color: C.soil }}>{r.worker_name}</div>
                  <div className="text-xs" style={{ color: C.muted }}>{String(r.work_date).slice(0, 10)} · {Number(r.hours_worked)}h{r.task_description ? ` · ${r.task_description}` : ""}</div>
                </div>
                <div className="font-semibold text-sm" style={{ color: C.greenDk }}>{formatFJD(r.total_pay_fjd)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Phase-stub tabs */}
        {activeTab.phase && (
          <div className="py-10 text-center">
            <div className="text-sm font-medium" style={{ color: C.soil }}>{activeTab.label} — coming in {activeTab.phase}</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>This surface needs a backend endpoint before it shows real data. No mock numbers here on purpose.</div>
          </div>
        )}
      </section>

      <AddWorkerModal farmId={farmId} isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["workers", farmId] })} />
      <LogAttendanceModal farmId={farmId} workers={workers} isOpen={logOpen} onClose={() => setLogOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["labor", farmId] })} />
      <EditRateModal worker={rateWorker} isOpen={!!rateWorker} onClose={() => setRateWorker(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["workers", farmId] })} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Labor() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <LaborInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

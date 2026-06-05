/**
 * Labor.jsx — /farm/labor
 *
 * Replaces the ComingSoon stub. Parity target: prototype v262 Labor surface.
 * SCOPE (v1, bounded by the live API): Workers directory + Attendance log.
 *   - GET/POST  /api/v1/workers      (list, add)
 *   - PATCH     /api/v1/workers/{id}/rate?daily_rate_fjd=
 *   - GET/POST  /api/v1/labor         (attendance list, log)
 * NOT yet built on the backend (so intentionally absent here — flagged to
 * extend later): WAGE_PAID / batch pay, GPS check-in, attendance analytics,
 * Fiji-compliance computation, task assignment. The prototype shows those;
 * they need backend endpoints before a UI can be real (no mock data).
 *
 * Conventions mirror CashLedger.jsx: localStorage JWT, react-query, the
 * shared Modal + ThemedSelect, warm farmer palette, window toast events.
 */
import { useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Users, Plus, Pencil, Clock, Phone } from "lucide-react";

import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

// --- Palette (warm farmer dialect) -----------------------------------
const C = {
  soil: "#5C4033", cream: "#F8F3E9", bgPage: "#F5EFE0", border: "#E6DED0",
  muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000",
  red: "#D4442E", greenTint: "#E9F2DD", amberTint: "#FAF1D5",
};

const WORKER_TYPES = [
  { value: "CASUAL", label: "Casual" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "SEASONAL", label: "Seasonal" },
  { value: "CONTRACTOR", label: "Contractor" },
];

// --- helpers (mirrors CashLedger) ------------------------------------
function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}
function emitToast(message) {
  window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message } }));
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatFJD(value) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function typeLabel(v) {
  return WORKER_TYPES.find((t) => t.value === v)?.label || v || "—";
}

// --- fetchers --------------------------------------------------------
async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? body?.farms ?? [];
}
async function fetchWorkers(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? [];
}
async function fetchLabor(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? [];
}

// --- Add worker modal ------------------------------------------------
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
        body: JSON.stringify({
          farm_id: farmId, full_name: name.trim(), worker_type: type,
          daily_rate_fjd: Number(rate), contact_number: phone.trim() || null,
        }),
      });
      if (res.status === 403) { emitToast("You don't have permission to add workers"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Worker added");
      onSaved?.();
      onClose?.();
    } catch (e) {
      emitToast("Could not add worker");
    } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add worker"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white"
            style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Add worker"}</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laisenia Waqa"
            className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Worker type
          <ThemedSelect value={type} onChange={setType} options={WORKER_TYPES} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Daily rate (FJD)
          <input type="number" min="0" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 30.00" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+679 …"
            className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <p className="text-xs" style={{ color: C.muted }}>Fiji minimum wage is FJD 4.00/hr. Adding a worker writes an audit record.</p>
      </div>
    </Modal>
  );
}

// --- Edit rate modal -------------------------------------------------
function EditRateModal({ worker, isOpen, onClose, onSaved }) {
  const [rate, setRate] = useState(worker ? String(worker.daily_rate_fjd ?? "") : "");
  const [busy, setBusy] = useState(false);
  if (!worker) return null;

  async function submit() {
    if (!rate) { emitToast("Enter a rate"); return; }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/workers/${encodeURIComponent(worker.worker_id)}/rate?daily_rate_fjd=${encodeURIComponent(Number(rate))}`,
        { method: "PATCH", headers: authHeaders() },
      );
      if (res.status === 403) { emitToast("Only FOUNDER or MANAGER can change rates"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Rate updated");
      onSaved?.();
      onClose?.();
    } catch (e) {
      emitToast("Could not update rate");
    } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit rate — ${worker.full_name}`} size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk }}>Save</button>
        </div>
      }>
      <label className="block text-sm" style={{ color: C.soil }}>Daily rate (FJD)
        <input type="number" min="0" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
      </label>
    </Modal>
  );
}

// --- Log attendance modal --------------------------------------------
function LogAttendanceModal({ farmId, workers, isOpen, onClose, onSaved }) {
  const [workerId, setWorkerId] = useState("");
  const [hours, setHours] = useState("8");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);

  const worker = workers.find((w) => w.worker_id === workerId);
  const dailyRate = Number(worker?.daily_rate_fjd ?? 0);
  const totalPay = useMemo(() => {
    const h = Number(hours || 0);
    return Math.round(dailyRate * (h / 8) * 100) / 100;
  }, [dailyRate, hours]);

  async function submit() {
    if (!workerId) { emitToast("Pick a worker"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/labor", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          worker_id: workerId, farm_id: farmId, work_date: todayISO(),
          hours_worked: Number(hours), daily_rate_fjd: dailyRate, total_pay_fjd: totalPay,
          task_description: task.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Attendance logged");
      onSaved?.();
      onClose?.();
    } catch (e) {
      emitToast("Could not log attendance");
    } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log attendance"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy || !workerId} className="px-4 py-2 rounded-lg text-white"
            style={{ background: C.greenDk, opacity: busy || !workerId ? 0.6 : 1 }}>Log · {formatFJD(totalPay)}</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Worker
          <ThemedSelect value={workerId} onChange={setWorkerId} placeholder="Pick a worker…"
            options={workers.map((w) => ({ value: w.worker_id, label: `${w.full_name} · ${formatFJD(w.daily_rate_fjd)}/day` }))} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Hours worked
          <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Task (optional)
          <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Weeding Bed 3"
            className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <div className="text-sm rounded-lg p-3" style={{ background: C.greenTint, color: C.greenDk }}>
          Pay for this entry: <strong>{formatFJD(totalPay)}</strong> ({hours}h @ {formatFJD(dailyRate)}/day)
        </div>
      </div>
    </Modal>
  );
}

// --- Inner page ------------------------------------------------------
function LaborInner() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("workers"); // workers | attendance
  const [farmId, setFarmId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [rateWorker, setRateWorker] = useState(null);

  const farmsQuery = useQuery({ queryKey: ["farms"], queryFn: fetchFarms });
  const farms = farmsQuery.data ?? [];
  const activeFarm = farmId || farms[0]?.farm_id || "";

  const workersQuery = useQuery({
    queryKey: ["workers", activeFarm], queryFn: () => fetchWorkers(activeFarm), enabled: !!activeFarm,
  });
  const laborQuery = useQuery({
    queryKey: ["labor", activeFarm], queryFn: () => fetchLabor(activeFarm), enabled: !!activeFarm,
  });
  const workers = workersQuery.data ?? [];
  const attendance = laborQuery.data ?? [];

  const wagesRecorded = useMemo(
    () => attendance.reduce((s, r) => s + Number(r.total_pay_fjd ?? 0), 0), [attendance],
  );

  function refreshWorkers() { qc.invalidateQueries({ queryKey: ["workers", activeFarm] }); }
  function refreshLabor() { qc.invalidateQueries({ queryKey: ["labor", activeFarm] }); }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" style={{ background: C.bgPage, minHeight: "100%" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users size={22} color={C.soil} />
          <h1 className="text-xl font-semibold" style={{ color: C.soil }}>Labor</h1>
        </div>
        <div className="flex items-center gap-2">
          {farms.length > 1 && (
            <ThemedSelect value={activeFarm} onChange={setFarmId}
              options={farms.map((f) => ({ value: f.farm_id, label: f.farm_name || f.farm_id }))} />
          )}
          {tab === "workers" ? (
            <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm" style={{ background: C.greenDk }}>
              <Plus size={16} /> Add worker
            </button>
          ) : (
            <button onClick={() => setLogOpen(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm" style={{ background: C.greenDk }}>
              <Clock size={16} /> Log attendance
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Active workers</div>
          <div className="text-2xl font-semibold" style={{ color: C.soil }}>{workers.length}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Wages recorded (recent)</div>
          <div className="text-2xl font-semibold" style={{ color: C.greenDk }}>{formatFJD(wagesRecorded)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: C.border }}>
        {[["workers", "Workers"], ["attendance", "Attendance"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-sm font-medium"
            style={{ color: tab === k ? C.greenDk : C.muted, borderBottom: tab === k ? `2px solid ${C.green}` : "2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Workers list */}
      {tab === "workers" && (
        <div className="space-y-2">
          {workersQuery.isLoading && <p style={{ color: C.muted }}>Loading workers…</p>}
          {!workersQuery.isLoading && workers.length === 0 && (
            <p style={{ color: C.muted }}>No workers yet. Add your first worker.</p>
          )}
          {workers.map((w) => (
            <div key={w.worker_id} className="flex items-center justify-between rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
              <div>
                <div className="font-medium" style={{ color: C.soil }}>{w.full_name}</div>
                <div className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                  <span>{typeLabel(w.worker_type)}</span>
                  {w.contact_number && <span className="flex items-center gap-1"><Phone size={11} />{w.contact_number}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold" style={{ color: C.soil }}>{formatFJD(w.daily_rate_fjd)}</div>
                  <div className="text-xs" style={{ color: C.muted }}>per day</div>
                </div>
                <button onClick={() => setRateWorker(w)} className="p-2 rounded-lg" style={{ color: C.muted }} title="Edit rate">
                  <Pencil size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attendance list */}
      {tab === "attendance" && (
        <div className="space-y-2">
          {laborQuery.isLoading && <p style={{ color: C.muted }}>Loading attendance…</p>}
          {!laborQuery.isLoading && attendance.length === 0 && (
            <p style={{ color: C.muted }}>No attendance logged yet.</p>
          )}
          {attendance.map((r) => (
            <div key={r.attendance_id} className="flex items-center justify-between rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
              <div>
                <div className="font-medium" style={{ color: C.soil }}>{r.worker_name}</div>
                <div className="text-xs" style={{ color: C.muted }}>
                  {String(r.work_date).slice(0, 10)} · {Number(r.hours_worked)}h
                  {r.task_description ? ` · ${r.task_description}` : ""}
                </div>
              </div>
              <div className="font-semibold" style={{ color: C.greenDk }}>{formatFJD(r.total_pay_fjd)}</div>
            </div>
          ))}
        </div>
      )}

      <AddWorkerModal farmId={activeFarm} isOpen={addOpen} onClose={() => setAddOpen(false)} onSaved={refreshWorkers} />
      <LogAttendanceModal farmId={activeFarm} workers={workers} isOpen={logOpen} onClose={() => setLogOpen(false)} onSaved={refreshLabor} />
      <EditRateModal worker={rateWorker} isOpen={!!rateWorker} onClose={() => setRateWorker(null)} onSaved={refreshWorkers} />
    </div>
  );
}

// --- Export (self-provides a query client, mirrors CashLedger) -------
const _client = new QueryClient();
export default function Labor() {
  return (
    <QueryClientProvider client={_client}>
      <LaborInner />
    </QueryClientProvider>
  );
}

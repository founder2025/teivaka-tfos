/**
 * FarmTasks.jsx — /farm/tasks
 *
 * Prototype-format Tasks pillar, rendered in the live theme + flat-icon doctrine
 * (lucide only, no emoji), wired to the EXISTING backend — no parallel model:
 *   - KPI row (Today's Focus / Todo Today / This Week / Overdue / Done): real
 *     counts from /api/v1/tasks.
 *   - Next steps from your crop plan: /api/v1/crop-plan/farm-steps (honest; empty
 *     when there's nothing).
 *   - Task board (High Priority · Today · Tomorrow · This Week · Upcoming): the real
 *     task_queue, bucketed by task_rank + due_date. Done/Skip + per-task target
 *     route (Log work) all hit real endpoints; complete/skip emit audit.
 *   - Quick Add chips + Add Task → /api/v1/tasks/manual.
 * Honest gap: no AI task-suggestion endpoint exists yet, so there is no fake
 * "AI Suggest" button.
 */
import { useMemo, useState, useEffect } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Plus, Sprout, ListChecks, Leaf, Droplet, FlaskConical, Bug,
  Wheat, Bird, Stethoscope, Wrench, DollarSign, Calendar, MoreVertical, ClipboardList,
} from "lucide-react";
import { useFormModal } from "../../context/FormModalContext";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import Modal from "../../components/ui/Modal.jsx";
import { taskTarget } from "../../utils/taskBridge";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", paper: "var(--paper)", greenTint: "var(--green-tint)" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]";
const PURPLE = "#7c5cff";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const todayISO = () => new Date().toISOString().slice(0, 10);

function whenOf(due) {
  if (!due) return "Upcoming";
  const t = todayISO();
  if (due < t) return "Overdue";
  if (due === t) return "Today";
  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (due === tmr) return "Tomorrow";
  const wk = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (due <= wk) return "This week";
  return "Upcoming";
}
function timing(due) {
  if (!due) return "No date";
  const w = whenOf(due);
  if (w === "Overdue") return "Overdue";
  if (w === "Today") return "Today";
  if (w === "Tomorrow") return "Tomorrow";
  const days = Math.ceil((new Date(due) - Date.now()) / 86400000);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}
// flat lucide icon per task, inferred from the imperative (no emoji — doctrine)
function taskIcon(t) {
  const s = (t.imperative || "").toLowerCase();
  if (/irrigat|water|moist/.test(s)) return Droplet;
  if (/fertil|top.?dress|npk|nutri|manure/.test(s)) return FlaskConical;
  if (/weed/.test(s)) return Sprout;
  if (/pest|spray|aphid|moth|disease|scout|inspect|control/.test(s)) return Bug;
  if (/harvest|pick/.test(s)) return Wheat;
  if (/feed|refill|water trough/.test(s)) return Bird;
  if (/vaccin|health|mortal|treat|check/.test(s)) return Stethoscope;
  if (/clean|repair|maintain|fix|sprayer|tool|equip/.test(s)) return Wrench;
  if (/record|expense|cash|pay|invoice|sell|sale|money|order/.test(s)) return DollarSign;
  if (/review|plan|seed/.test(s)) return Calendar;
  return ClipboardList;
}
// crop-plan row icon by category (flat)
function cropIcon(cat) { return cat === "HARVEST" ? Wheat : Leaf; }

// ── Quick Add chips → prefill a manual task ─────────────────────────────────
const QUICK = [
  ["Irrigation", Droplet], ["Fertilizer", FlaskConical], ["Weeding", Sprout],
  ["Pest control", Bug], ["Harvest", Wheat], ["Feeding", Bird],
  ["Maintenance", Wrench], ["Record keeping", DollarSign], ["Custom task", Plus],
];

// task_rank < 300 = urgent (CRITICAL/HIGH) → the High Priority column
const isHighPriority = (t) => (t.task_rank ?? 1000) < 300;
function bucketOf(t) {
  if (isHighPriority(t)) return "HIGH";
  const w = whenOf(t.due_date);
  if (w === "Overdue" || w === "Today") return "TODAY";
  if (w === "Tomorrow") return "TOMORROW";
  if (w === "This week") return "WEEK";
  return "UPCOMING";
}
const COLS = [
  { key: "HIGH", label: "High Priority", accent: C.red },
  { key: "TODAY", label: "Today", accent: C.amber },
  { key: "TOMORROW", label: "Tomorrow", accent: C.green },
  { key: "WEEK", label: "This Week", accent: PURPLE },
  { key: "UPCOMING", label: "Upcoming", accent: C.muted },
];

// ── Crop-plan next steps ────────────────────────────────────────────────────
function CropPlan({ farmId, navigate }) {
  const { openFormModal } = useFormModal();
  const { data } = useQuery({ queryKey: ["crop-plan", farmId], queryFn: () => getJSON(`/api/v1/crop-plan/farm-steps?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const steps = Array.isArray(data?.data) ? data.data : [];
  if (!steps.length) return null;
  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Next steps from your crop plan</span>
      </div>
      <div>
        {steps.map((s) => {
          const Icon = cropIcon(s.category);
          return (
            <div key={s.cycle_id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: `1px solid rgba(31,41,55,0.06)` }}>
              <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: C.greenTint }}><Icon size={18} style={{ color: C.greenDk }} /></div>
              <div className="shrink-0" style={{ width: 96 }}>
                <div className="text-sm font-semibold truncate" style={{ color: C.soil }}>{s.crop}</div>
                <div className="text-[11px] truncate" style={{ color: C.muted }}>{s.stage || s.block || ""}</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={s.do_now ? { background: C.greenTint, color: C.greenDk } : { color: C.muted, border: `1px solid ${C.border}` }}>{s.do_now ? "Do now" : s.when}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: C.soil }}>{s.text}</div>
                {s.ongoing && <div className="text-[11px] truncate" style={{ color: C.muted }}>Ongoing: {s.ongoing}</div>}
              </div>
              <div className="text-right shrink-0 hidden sm:block" style={{ width: 96 }}>
                <div className="text-[11px] font-semibold" style={{ color: C.soil }}>{s.when}</div>
                {s.stage && <div className="text-[10px]" style={{ color: C.muted }}>{s.stage}</div>}
              </div>
              <button onClick={() => (s.category === "HARVEST" ? openFormModal("harvest_new") : navigate("/farm/cycles"))} className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold shrink-0 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Log work</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent, focus }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: focus ? C.green : C.border, background: focus ? C.greenTint : "white" }}>
      <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: accent || C.muted }}>{label}</div>
      <div className="text-3xl font-extrabold leading-tight mt-1" style={{ color: C.soil }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{sub}</div>
    </div>
  );
}

// ── Task card ───────────────────────────────────────────────────────────────
function TaskCard({ t, accent, busy, openMenu, setOpenMenu, onDone, onSkip, navigate }) {
  const Icon = taskIcon(t);
  const tgt = taskTarget(t);
  const menu = openMenu === t.task_id;
  return (
    <div className="rounded-xl border p-2.5 relative" style={{ borderColor: C.border, background: "white", borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-start gap-2.5">
        <div className="grid place-items-center rounded-lg shrink-0 mt-0.5" style={{ width: 30, height: 30, background: C.greenTint }}><Icon size={15} style={{ color: C.greenDk }} /></div>
        <button onClick={() => (tgt ? navigate(tgt.route) : setOpenMenu(menu ? null : t.task_id))} className="flex-1 min-w-0 text-left">
          <div className="text-[13px] font-semibold leading-snug" style={{ color: C.soil }}>{t.imperative}</div>
          <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{timing(t.due_date)}</div>
        </button>
        <button onClick={() => setOpenMenu(menu ? null : t.task_id)} className={`shrink-0 p-1 rounded ${FOCUS}`} style={{ color: C.muted }} aria-label="Task actions"><MoreVertical size={15} /></button>
      </div>
      {menu && (
        <div className="flex gap-1.5 mt-2">
          {tgt
            ? <button onClick={() => navigate(tgt.route)} className="flex-1 text-[11px] px-2 py-1.5 rounded-lg text-white font-semibold" style={{ background: C.greenDk }}>{tgt.label}</button>
            : <button disabled={busy} onClick={() => onDone(t)} className="flex-1 text-[11px] px-2 py-1.5 rounded-lg text-white font-semibold flex items-center justify-center gap-1" style={{ background: C.greenDk }}><CheckCircle2 size={12} />Done</button>}
          <button disabled={busy} onClick={() => onSkip(t)} className="text-[11px] px-2 py-1.5 rounded-lg font-semibold" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Skip</button>
        </div>
      )}
    </div>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────
function Board({ farmId, navigate }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [mImp, setMImp] = useState(""); const [mDue, setMDue] = useState("");

  const open = useQuery({ queryKey: ["tasks", "OPEN", farmId], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=200`), retry: 0 });
  const done = useQuery({ queryKey: ["tasks", "COMPLETED", farmId], queryFn: () => getJSON(`/api/v1/tasks?status=COMPLETED&limit=200`), retry: 0 });
  const openTasks = Array.isArray(open.data?.data?.tasks) ? open.data.data.tasks : [];
  const doneTasks = Array.isArray(done.data?.data?.tasks) ? done.data.data.tasks : [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const kpi = useMemo(() => {
    const overdue = openTasks.filter((t) => whenOf(t.due_date) === "Overdue");
    const today = openTasks.filter((t) => ["Overdue", "Today"].includes(whenOf(t.due_date)));
    const week = openTasks.filter((t) => whenOf(t.due_date) !== "Upcoming");
    const high = today.filter(isHighPriority).length;
    return { focus: today.length, high, todo: today.length, week: week.length, overdue: overdue.length, done: doneTasks.length };
  }, [openTasks, doneTasks]);

  const cols = useMemo(() => {
    const m = { HIGH: [], TODAY: [], TOMORROW: [], WEEK: [], UPCOMING: [] };
    for (const t of openTasks) m[bucketOf(t)].push(t);
    return m;
  }, [openTasks]);

  async function onDone(t) {
    setBusy(t.task_id);
    try {
      const body = { input_value: (t.input_hint && t.input_hint !== "none") ? "" : null };
      const r = await fetch(`/api/v1/tasks/${t.task_id}/complete`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      emitToast("Done ✓"); setOpenMenu(null); refresh();
    } catch { emitToast("Couldn't complete (needs input?)"); } finally { setBusy(null); }
  }
  async function onSkip(t) {
    setBusy(t.task_id);
    try {
      const r = await fetch(`/api/v1/tasks/${t.task_id}/skip`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "will_do_later" }) });
      if (!r.ok) throw new Error();
      emitToast("Skipped"); setOpenMenu(null); refresh();
    } catch { emitToast("Couldn't skip"); } finally { setBusy(null); }
  }
  async function addManual() {
    if (!mImp.trim()) { emitToast("Enter a task"); return; }
    try {
      const r = await fetch(`/api/v1/tasks/manual`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, imperative: mImp.trim(), due_date: mDue || null }) });
      if (!r.ok) throw new Error();
      emitToast("Task added"); setAddOpen(false); setMImp(""); setMDue(""); refresh();
    } catch { emitToast("Couldn't add task"); }
  }
  const openAdd = (prefill = "") => { setMImp(prefill === "Custom task" ? "" : prefill); setMDue(""); setAddOpen(true); };

  // page header "Add Task" + quick chips funnel here
  useEffect(() => {
    const h = () => openAdd("");
    window.addEventListener("tfos:manual-task", h);
    return () => window.removeEventListener("tfos:manual-task", h);
  }, []);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Today's Focus" value={kpi.focus} sub={`${kpi.high} high priority`} accent={C.greenDk} focus />
        <Kpi label="Todo Today" value={kpi.todo} sub="Get these done today" accent={C.greenDk} />
        <Kpi label="This Week" value={kpi.week} sub="Next 7 days" accent={C.soil} />
        <Kpi label="Overdue" value={kpi.overdue} sub="Need attention" accent={C.red} />
        <Kpi label="Done" value={kpi.done} sub="Completed this session" accent={C.green} />
      </div>

      {/* Task board */}
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
        <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: C.soil }}>Task board</div>
        {open.isLoading ? (
          <div className="py-10 text-center text-sm" style={{ color: C.muted }}>Loading tasks…</div>
        ) : openTasks.length === 0 ? (
          <div className="py-12 text-center">
            <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
            <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>Nothing to do — you're on top of it</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>New tasks appear as cycles, compliance and rotations need action.</div>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {COLS.map((col) => (
              <div key={col.key} className="rounded-xl p-2.5 flex flex-col gap-2.5" style={{ background: C.paper, minHeight: 80 }}>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: col.accent }}>{col.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "white", color: col.accent, border: `1px solid ${C.border}` }}>{cols[col.key].length}</span>
                </div>
                {cols[col.key].map((t) => (
                  <TaskCard key={t.task_id} t={t} accent={col.accent} busy={busy === t.task_id} openMenu={openMenu} setOpenMenu={setOpenMenu} onDone={onDone} onSkip={onSkip} navigate={navigate} />
                ))}
                <button onClick={() => openAdd("")} className={`text-[11px] px-2 py-1.5 rounded-lg font-semibold text-left ${FOCUS}`} style={{ color: C.greenDk }}>+ Add task</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick add chips */}
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
        <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: C.soil }}>Quick add task</div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map(([label, Icon]) => (
            <button key={label} onClick={() => openAdd(label)} className={`text-xs px-3 py-2 rounded-full font-semibold flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.soil, background: "var(--paper)", border: `1px solid ${C.border}` }}>
              <Icon size={13} style={{ color: C.greenDk }} />{label}
            </button>
          ))}
        </div>
        <div className="text-[11px] mt-3" style={{ color: C.muted }}>Tap any task to log your work, add photos, notes and see recommendations.</div>
      </div>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add task" size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setAddOpen(false)} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={addManual} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk }}>Add task</button>
        </div>}>
        <div className="space-y-3">
          <label className="block text-sm" style={{ color: C.soil }}>Task
            <input autoFocus value={mImp} onChange={(e) => setMImp(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} placeholder="e.g. Fix the east fence" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Due date (optional)
            <input type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        </div>
      </Modal>
    </div>
  );
}

function TasksInner() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Tasks</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Your daily plan for a productive farm.</div>
        </div>
        <div className="flex items-center gap-2">
          <FarmSelector />
          <button onClick={() => window.dispatchEvent(new CustomEvent("tfos:manual-task"))} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Add Task</button>
        </div>
      </div>
      <CropPlan farmId={farmId} navigate={navigate} />
      <Board farmId={farmId} navigate={navigate} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });
export default function FarmTasks() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <TasksInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

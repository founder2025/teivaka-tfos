/**
 * FarmTasks.jsx — /farm/tasks  (prototype-parity)
 *
 * Two surfaces:
 *  1. Next steps from your crop plan — per active cycle: block · crop · day N ·
 *     an operational milestone (prepare bed / growing / harvest soon / ready).
 *     Honest only — crop-specific agronomy (spacing, side-dress timing, pruning)
 *     needs a seeded growth-plan KB (Inviolable #1), so it's NOT invented here.
 *  2. Task board — the real task_queue: Pending/Completed, enterprise + when +
 *     type filters, stat cards, table, Done/Skip, Manual task. Wires to the
 *     existing tasks API.
 */
import { useMemo, useState, useEffect } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, SkipForward, Plus, Sprout, ListChecks } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import Modal from "../../components/ui/Modal.jsx";
import { taskTarget } from "../../utils/taskBridge";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863", green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", paper: "#FCFAF5", greenTint: "#E9F2DD" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const todayISO = () => new Date().toISOString().slice(0, 10);
const dayN = (planting) => { if (!planting) return null; const d = Math.floor((Date.now() - new Date(planting).getTime()) / 86400000); return d >= 0 ? d : 0; };

// task_rank -> severity
function sev(rank) {
  if (rank == null) return { k: "NORMAL", c: C.muted, bg: C.cream };
  if (rank < 100) return { k: "CRITICAL", c: "var(--paper)", bg: C.red };
  if (rank < 300) return { k: "HIGH", c: "var(--paper)", bg: C.amber };
  if (rank < 600) return { k: "MED", c: C.greenDk, bg: C.greenTint };
  return { k: "NORMAL", c: C.muted, bg: C.cream };
}
// source_module -> coarse Type
function typeOf(t) {
  const s = t.source_module;
  if (s === "compliance") return "Compliance";
  if (s === "cash" || s === "market") return "Financial";
  if (s === "weather") return "Production";
  return "Production";
}
// when bucket from due_date
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
function fmtDue(due) {
  const w = whenOf(due);
  if (!due) return { text: "—", w, over: false };
  try { return { text: new Date(due).toLocaleDateString(undefined, { day: "numeric", month: "short" }), w, over: w === "Overdue" }; }
  catch { return { text: due, w, over: w === "Overdue" }; }
}

const WHENS = ["Overdue", "Today", "Tomorrow", "This week", "Upcoming"];
const TYPES = ["Production", "Feeding", "Health", "Harvest", "Maintenance", "Compliance", "Financial"];

// ── Section 1: crop-plan next steps (honest, from real cycles) ──────────
function cropStep(c) {
  const st = c.cycle_status, d = dayN(c.planting_date), eh = c.expected_harvest_date, t = todayISO();
  if (st === "PLANNED") return { now: true, text: "Prepare the bed for planting", when: "to start" };
  if (st === "HARVESTING" || st === "CLOSING") return { now: true, text: "Harvesting — log your picks", when: `day ${d ?? "—"}` };
  if (eh && eh <= t) return { now: true, text: "Ready to harvest — log when you pick", when: `day ${d ?? "—"}` };
  if (eh) {
    const days = Math.ceil((new Date(eh) - Date.now()) / 86400000);
    if (days <= 14) return { now: false, text: `Harvest in ~${days} day${days === 1 ? "" : "s"}`, when: `day ${d ?? "—"}` };
  }
  return { now: false, text: "Growing — log field activity (water, spray, scout)", when: `day ${d ?? "—"}` };
}

function CropPlan({ farmId, navigate }) {
  const { data } = useQuery({ queryKey: ["crop-plan", farmId], queryFn: () => getJSON(`/api/v1/crop-plan/farm-steps?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const steps = data?.data ?? [];
  if (!steps.length) return null;
  const anyUnverified = steps.some((s) => s.verification === "SEED_UNVERIFIED");
  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2"><Sprout size={15} style={{ color: C.greenDk }} /><span className="text-sm font-bold uppercase tracking-wide" style={{ color: C.soil }}>Next steps from your crop plan</span></div>
        <span className="text-[11px]" style={{ color: C.muted }}>Worked out from each crop's stage + days in the ground. Tap to log.</span>
      </div>
      <div>
        {steps.map((s) => (
          <div key={s.cycle_id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: `1px solid rgba(92,64,51,0.06)` }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: C.soil }}><span className="font-semibold">{s.block}</span>{s.block ? " · " : ""}{s.crop}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={s.do_now ? { background: C.greenTint, color: C.greenDk } : { color: C.muted, border: `1px solid ${C.border}` }}>{s.do_now ? "Do now" : s.when}</span>
                <span className="text-xs" style={{ color: s.do_now ? C.soil : C.muted }}>{s.text}</span>
                {s.stage && <span className="text-[10px]" style={{ color: C.muted }}>· {s.stage}</span>}
              </div>
              {s.ongoing && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>Ongoing: {s.ongoing}</div>}
            </div>
            <span className="text-[11px] shrink-0" style={{ color: C.muted }}>{s.when}</span>
            <button onClick={() => navigate(s.category === "HARVEST" ? "/farm/harvest/new" : "/farm/cycles")} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold shrink-0 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>+ Log</button>
          </div>
        ))}
      </div>
      {anyUnverified && (
        <div className="px-4 py-2 text-[10px]" style={{ color: C.muted }}>Indicative guidance from the crop-plan library (FAO/SPC) — confirm timing with your extension officer. NPK amounts come from the cited nutrition KB.</div>
      )}
    </div>
  );
}

// ── Section 2: the task board ───────────────────────────────────────────
function Board({ farmId, navigate }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("OPEN");
  const [whenF, setWhenF] = useState(null);
  const [typeF, setTypeF] = useState(null);
  const [ent, setEnt] = useState("all"); // all|crops|animals
  const [busy, setBusy] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [mImp, setMImp] = useState(""); const [mDue, setMDue] = useState("");

  const open = useQuery({ queryKey: ["tasks", "OPEN", farmId], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=200`), retry: 0 });
  const done = useQuery({ queryKey: ["tasks", "COMPLETED", farmId], queryFn: () => getJSON(`/api/v1/tasks?status=COMPLETED&limit=200`), retry: 0 });
  const puStatus = useQuery({ queryKey: ["tasks-pus", farmId], queryFn: () => getJSON(`/api/v1/production-units/status?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const puMap = useMemo(() => Object.fromEntries((puStatus.data?.data ?? []).map((s) => [s.pu_id, s])), [puStatus.data]);

  const openTasks = open.data?.data?.tasks ?? [];
  const doneTasks = done.data?.data?.tasks ?? [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["tasks"] }); };

  function enterprise(t) {
    if (t.entity_type === "production_unit" && t.entity_id) return puMap[t.entity_id]?.crop || puMap[t.entity_id]?.last_crop || t.entity_id;
    const s = (t.imperative || "").toLowerCase();
    if (/hen|broiler|layer|chick|poultry|goat|cattle|cow|pig|flock/.test(s)) return "Animals";
    return "—";
  }
  function entGroup(t) {
    if (t.entity_type === "production_unit") return "crops";
    const s = (t.imperative || "").toLowerCase();
    if (/hen|broiler|layer|chick|poultry|goat|cattle|cow|pig|flock/.test(s)) return "animals";
    return "other";
  }

  const base = tab === "OPEN" ? openTasks : doneTasks;
  const rows = base.filter((t) => {
    if (ent !== "all" && entGroup(t) !== ent) return false;
    if (whenF && whenOf(t.due_date) !== whenF) return false;
    if (typeF && typeOf(t) !== typeF) return false;
    return true;
  });

  // stats from OPEN
  const stats = useMemo(() => {
    const today = openTasks.filter((t) => ["Overdue", "Today"].includes(whenOf(t.due_date))).length;
    const week = openTasks.filter((t) => whenOf(t.due_date) !== "Upcoming").length;
    const urgent = openTasks.filter((t) => (t.task_rank ?? 1000) < 300).length;
    return { today, week, urgent, done: doneTasks.length };
  }, [openTasks, doneTasks]);

  async function act(t, kind) {
    setBusy(t.task_id);
    try {
      const url = `/api/v1/tasks/${t.task_id}/${kind === "done" ? "complete" : "skip"}`;
      const body = kind === "done" ? { input_value: (t.input_hint && t.input_hint !== "none") ? "" : null } : { reason: "will_do_later" };
      const r = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      emitToast(kind === "done" ? "Done" : "Skipped"); refresh();
    } catch { emitToast(kind === "done" ? "Couldn't complete (needs input?)" : "Couldn't skip"); } finally { setBusy(null); }
  }
  async function addManual() {
    if (!mImp.trim()) { emitToast("Enter a task"); return; }
    try {
      const r = await fetch(`/api/v1/tasks/manual`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, imperative: mImp.trim(), due_date: mDue || null }) });
      if (!r.ok) throw new Error();
      emitToast("Task added"); setAddOpen(false); setMImp(""); setMDue(""); refresh();
    } catch { emitToast("Couldn't add task"); }
  }

  const Pill = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full font-semibold shrink-0 whitespace-nowrap ${FOCUS}`} style={active ? { background: C.greenDk, color: "#fff" } : { color: C.soil, background: "var(--paper)", border: `1px solid ${C.border}` }}>{children}</button>
  );

  return (
    <div className="space-y-3">
      {/* summary strip */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {[["To do today", stats.today, "due in the next day", C.red], ["This week", stats.week, "next 7 days", C.greenDk], ["Urgent", stats.urgent, "do these first", C.amber], ["Done", stats.done, "this session", C.green]].map(([l, v, s, col]) => (
          <div key={l} className="rounded-xl border p-3" style={{ borderColor: C.border, background: "var(--paper)" }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{l}</div>
            <div className="text-2xl font-bold leading-tight" style={{ color: col }}>{v}</div>
            <div className="text-[10px]" style={{ color: C.muted }}>{s}</div>
          </div>
        ))}
      </div>

      {/* one board card: tabs · filters · list */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: C.border }}>
        {/* tabs */}
        <div className="flex items-center gap-5 px-4 pt-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          {[["OPEN", "Pending", openTasks.length], ["COMPLETED", "Completed", doneTasks.length]].map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} className="text-sm font-semibold pb-2.5 flex items-center gap-1.5" style={{ color: tab === k ? C.greenDk : C.muted, borderBottom: tab === k ? `2px solid ${C.green}` : "2px solid transparent", marginBottom: -1 }}>
              {l}<span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: tab === k ? C.greenTint : C.cream, color: tab === k ? C.greenDk : C.muted }}>{n}</span>
            </button>
          ))}
        </div>

        {/* filters — each group is one tidy, horizontally scrollable line */}
        <div className="px-3 py-2.5 space-y-2" style={{ borderBottom: `1px solid ${C.border}`, background: C.paper }}>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <Pill active={ent === "all"} onClick={() => setEnt("all")}>All</Pill>
            <Pill active={ent === "crops"} onClick={() => setEnt("crops")}>Crops</Pill>
            <Pill active={ent === "animals"} onClick={() => setEnt("animals")}>Animals</Pill>
            <span className="mx-1 shrink-0 self-stretch w-px" style={{ background: C.border }} />
            {WHENS.map((w) => <Pill key={w} active={whenF === w} onClick={() => setWhenF(whenF === w ? null : w)}>{w}</Pill>)}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-bold uppercase shrink-0 pr-0.5" style={{ color: C.muted }}>Type</span>
            <Pill active={!typeF} onClick={() => setTypeF(null)}>All</Pill>
            {TYPES.map((ty) => <Pill key={ty} active={typeF === ty} onClick={() => setTypeF(typeF === ty ? null : ty)}>{ty}</Pill>)}
          </div>
        </div>

        {/* column header — desktop only */}
        <div className="hidden md:grid items-center px-4 py-2 text-[10px] font-bold uppercase" style={{ color: C.muted, gridTemplateColumns: "1fr 120px 96px 96px 76px 156px", borderBottom: `1px solid ${C.border}` }}>
          <span>Task</span><span>Enterprise</span><span>When</span><span>Type</span><span>Sev</span><span className="text-right">Action</span>
        </div>

        {/* rows — stacked cards on mobile, grid on desktop */}
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
            <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>{tab === "OPEN" ? "Nothing matches — you're on top of it" : "No completed tasks yet"}</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>{tab === "OPEN" ? "New tasks appear as cycles, compliance and rotations need action." : "Completed tasks will show up here."}</div>
          </div>
        ) : rows.map((t) => {
          const sv = sev(t.task_rank); const du = fmtDue(t.due_date); const ents = enterprise(t);
          const tgt = tab === "OPEN" ? taskTarget(t) : null;
          return (
            <div key={t.task_id} className="flex md:grid md:items-center gap-3 px-4 py-3" style={{ gridTemplateColumns: "1fr 120px 96px 96px 76px 156px", borderTop: `1px solid rgba(92,64,51,0.06)`, borderLeft: `3px solid ${sv.k === "NORMAL" ? "transparent" : sv.bg}` }}>
              {/* task + mobile meta line */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium md:truncate md:pr-2" style={{ color: C.soil }}>{t.imperative}</div>
                <div className="md:hidden flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: C.muted }}>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: sv.bg, color: sv.c }}>{sv.k}</span>
                  <span className="font-semibold" style={{ color: du.over ? C.red : C.muted }}>{du.w}</span>
                  <span>· {typeOf(t)}</span>
                  {ents !== "—" && <span>· {ents}</span>}
                </div>
              </div>
              {/* desktop cells */}
              <span className="hidden md:block text-[11px] truncate pr-1" style={{ color: C.muted }}>{ents}</span>
              <span className="hidden md:block text-[11px]" style={{ color: du.over ? C.red : C.muted }}>{du.w}</span>
              <span className="hidden md:block text-[11px]" style={{ color: C.muted }}>{typeOf(t)}</span>
              <span className="hidden md:block"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: sv.bg, color: sv.c }}>{sv.k}</span></span>
              {/* actions */}
              <span className="flex items-center justify-end gap-1.5 shrink-0">
                {tab === "OPEN" ? (
                  <>
                    {tgt
                      ? <button onClick={() => navigate(tgt.route)} className={`text-[11px] px-2.5 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 ${FOCUS}`} style={{ background: C.greenDk }} title="Log the real record and complete">{tgt.label}</button>
                      : <button onClick={() => act(t, "done")} disabled={busy === t.task_id} className={`text-[11px] px-2.5 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 ${FOCUS}`} style={{ background: C.greenDk }}><CheckCircle2 size={12} />Done</button>}
                    <button onClick={() => act(t, "skip")} disabled={busy === t.task_id} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-semibold ${FOCUS}`} style={{ color: C.muted, border: `1px solid ${C.border}` }}>Skip</button>
                  </>
                ) : <span className="text-[11px] font-semibold flex items-center gap-1" style={{ color: C.green }}><CheckCircle2 size={12} />Done</span>}
              </span>
            </div>
          );
        })}
      </div>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Manual task" size="sm"
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

      {/* expose Manual via a floating ref through window event from header button */}
      <ManualBridge onOpen={() => setAddOpen(true)} />
    </div>
  );
}

// lets the page header's "Manual task" button open the board's modal
function ManualBridge({ onOpen }) {
  useEffect(() => {
    const h = () => onOpen();
    window.addEventListener("tfos:manual-task", h);
    return () => window.removeEventListener("tfos:manual-task", h);
  }, [onOpen]);
  return null;
}

function TasksInner() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Tasks</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Ranked for what to do next · across your active enterprises</div>
        </div>
        <div className="flex items-center gap-2">
          <FarmSelector />
          <button onClick={() => window.dispatchEvent(new CustomEvent("tfos:manual-task"))} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Manual task</button>
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

/**
 * FarmTasks.jsx — /farm/tasks
 *
 * Redesigned 2026-06-26 (audit-approved). One decision first (Do this next), one
 * reliable completion, progressive disclosure, honest under failure. Real
 * task_queue data; complete/skip emit audit. Routed tasks open their prefilled
 * form (which closes the task via completeLinkedTask — verified). Input-required
 * non-routed tasks now collect the value inline instead of posting "" (was T2's
 * 422). Crop-plan is a clearly-labelled secondary "coming up", not a competing
 * action list (N2).
 *
 * Fixed: T1 (api.js token-refresh + real error state, no false "all caught up");
 * T2 (inline input completion); T3 (Fiji-time bucketing); T5/T7 (session "done"
 * count, dropped the 200-row COMPLETED fetch); T6 (hero first); N3 (removed dup
 * KPIs; orphan Tasks.jsx deleted); N5 (icon from task.icon_key); N7 (refetch on
 * reconnect/focus); a11y (aria-live, reduced-motion, keyboard rows, menu Esc).
 * Filed: farm_id on /tasks (T4, today tenant-wide); worker assignment; AI suggest.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Plus, Sprout, ListChecks, Leaf, Droplet, FlaskConical, Bug,
  Wheat, Bird, Stethoscope, Wrench, DollarSign, Calendar, ClipboardList,
  ChevronDown, Sparkles, WifiOff,
} from "lucide-react";
import { useFormModal } from "../../context/FormModalContext";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import Modal from "../../components/ui/Modal.jsx";
import { taskTarget } from "../../utils/taskBridge";
import { getJSON, send } from "../../utils/api";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", paper: "var(--paper)", greenTint: "var(--green-tint)" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] motion-reduce:transition-none";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function fijiToday() { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } catch { return new Date().toISOString().slice(0, 10); } }
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); try { return d.toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } catch { return d.toISOString().slice(0, 10); } };

function whenOf(due) {
  if (!due) return "Later";
  const t = fijiToday();
  if (due < t) return "Overdue";
  if (due === t) return "Today";
  if (due === addDays(1)) return "Tomorrow";
  if (due <= addDays(7)) return "This week";
  return "Later";
}
function timing(due) {
  const w = whenOf(due);
  if (!due) return "No date";
  if (["Overdue", "Today", "Tomorrow"].includes(w)) return w;
  const days = Math.ceil((new Date(due) - new Date(fijiToday())) / 864e5);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

// Icon: prefer the backend-provided icon_key, then a guarded keyword match, then
// a neutral default (N5 — no more "check the pump" → Stethoscope).
const ICON_KEY = { water: Droplet, irrigation: Droplet, droplet: Droplet, fertilizer: FlaskConical, flask: FlaskConical, nutrient: FlaskConical, weed: Sprout, sprout: Sprout, pest: Bug, bug: Bug, spray: Bug, scout: Bug, harvest: Wheat, wheat: Wheat, feed: Bird, bird: Bird, poultry: Bird, health: Stethoscope, vaccine: Stethoscope, mortality: Stethoscope, maintenance: Wrench, wrench: Wrench, repair: Wrench, money: DollarSign, cash: DollarSign, sale: DollarSign, plan: Calendar, calendar: Calendar, seed: Calendar };
function iconFor(t) {
  if (t.icon_key && ICON_KEY[String(t.icon_key).toLowerCase()]) return ICON_KEY[String(t.icon_key).toLowerCase()];
  const s = (t.imperative || "").toLowerCase();
  if (/irrigat|water|moist/.test(s)) return Droplet;
  if (/fertil|top.?dress|npk|nutri|manure/.test(s)) return FlaskConical;
  if (/weed/.test(s)) return Sprout;
  if (/pest|spray|aphid|moth|disease|scout/.test(s)) return Bug;
  if (/harvest|pick/.test(s)) return Wheat;
  if (/feed|trough/.test(s)) return Bird;
  if (/vaccin|health|mortal|treat/.test(s)) return Stethoscope;
  if (/clean|repair|maintain|fix|sprayer|tool|equip/.test(s)) return Wrench;
  if (/expense|cash|pay|invoice|sell|sale|money|order/.test(s)) return DollarSign;
  if (/review|plan|seed/.test(s)) return Calendar;
  return ClipboardList;
}
const needsInput = (t) => t.input_hint && t.input_hint !== "none";
const QUICK = [["Irrigation", Droplet], ["Fertilizer", FlaskConical], ["Weeding", Sprout], ["Pest control", Bug], ["Harvest", Wheat], ["Feeding", Bird], ["Maintenance", Wrench], ["Record keeping", DollarSign], ["Custom task", Plus]];

// Inline completion control: route → form; input-required → inline field; else one-tap.
function CompleteControl({ t, busy, big, inputFor, inputVal, setInputVal, onComplete, navigate }) {
  const tgt = taskTarget(t);
  const asking = inputFor === t.task_id;
  const base = big ? "px-3 py-2.5 rounded-xl text-sm font-bold" : "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold";
  if (tgt) return <button onClick={() => navigate(tgt.route)} className={`${base} text-white ${FOCUS} ${big ? "flex-1" : ""}`} style={{ background: C.greenDk }}>{tgt.label}</button>;
  if (asking) {
    const hint = t.input_hint === "decimal" ? "Enter a number" : t.input_hint === "photo" ? "Photo URL" : "Enter a value";
    return (
      <span className="flex items-center gap-1.5 flex-1">
        <input autoFocus value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onComplete(t, inputVal); }}
          inputMode={t.input_hint === "decimal" ? "decimal" : "text"} placeholder={hint} aria-label={hint}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-[13px]" style={{ borderColor: C.border }} />
        <button disabled={busy} onClick={() => onComplete(t, inputVal)} className={`${base} text-white ${FOCUS}`} style={{ background: C.greenDk }}><CheckCircle2 size={big ? 16 : 13} /></button>
      </span>
    );
  }
  return (
    <button disabled={busy} onClick={() => onComplete(t)} aria-label={`Mark "${t.imperative}" done`}
      className={`${base} text-white ${FOCUS} flex items-center justify-center gap-1.5 ${big ? "flex-1" : ""}`} style={{ background: C.greenDk }}>
      <CheckCircle2 size={big ? 16 : 14} />{big ? "Mark done" : ""}
    </button>
  );
}

function Hero({ t, ctl, onSkip, askAi, navigate }) {
  if (!t) {
    return (
      <div className="rounded-2xl border p-5 text-center" style={{ borderColor: C.border, background: C.greenTint }} role="status" aria-live="polite">
        <CheckCircle2 size={26} style={{ color: C.greenDk, margin: "0 auto" }} aria-hidden="true" />
        <div className="text-sm font-bold mt-2" style={{ color: C.soil }}>You're all caught up</div>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>No open tasks right now — well done.</div>
      </div>
    );
  }
  const Icon = iconFor(t);
  const why = t.body_md || ((t.task_rank ?? 999) < 300 ? "High priority — best done first." : `Due ${timing(t.due_date).toLowerCase()}.`);
  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--green-dk)", background: `linear-gradient(135deg, ${C.greenTint}, #fff 75%)` }} role="status" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.greenDk }}>Do this next</div>
        <button onClick={() => askAi(t)} className={`text-[11px] font-semibold flex items-center gap-1 ${FOCUS}`} style={{ color: C.greenDk }}><Sparkles size={12} aria-hidden="true" />Ask AI</button>
      </div>
      <div className="flex items-start gap-3 mt-1.5">
        <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 44, height: 44, background: "#fff" }}><Icon size={22} style={{ color: C.greenDk }} aria-hidden="true" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-extrabold leading-snug" style={{ color: C.soil }}>{t.imperative}</div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>{why}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 items-center">
        {ctl(t, true)}
        <button onClick={() => onSkip(t)} className={`px-4 py-2.5 rounded-xl font-semibold text-sm ${FOCUS}`} style={{ color: C.muted, border: `1px solid ${C.border}` }}>Skip</button>
      </div>
    </div>
  );
}

function TaskRow({ t, ctl, onSkip, openMenu, setOpenMenu }) {
  const Icon = iconFor(t);
  const w = whenOf(t.due_date);
  const accent = w === "Overdue" ? C.red : w === "Today" ? C.amber : C.green;
  const menu = openMenu === t.task_id;
  return (
    <div className="rounded-xl border p-2.5 flex items-center gap-2.5" style={{ borderColor: C.border, background: "white", borderLeft: `3px solid ${accent}` }}>
      <div className="grid place-items-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: C.greenTint }}><Icon size={15} style={{ color: C.greenDk }} aria-hidden="true" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-snug truncate" style={{ color: C.soil }}>{t.imperative}</div>
        <div className="text-[11px]" style={{ color: w === "Overdue" ? C.red : C.muted }}>{timing(t.due_date)}</div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">{ctl(t, false)}
        <div className="relative">
          <button onClick={() => setOpenMenu(menu ? null : t.task_id)} className={`p-1 rounded ${FOCUS}`} style={{ color: C.muted }} aria-label="More actions" aria-expanded={menu}>⋯</button>
          {menu && <button onClick={() => { onSkip(t); setOpenMenu(null); }} className="absolute right-0 top-7 z-10 text-[11px] px-3 py-1.5 rounded-lg font-semibold bg-white" style={{ border: `1px solid ${C.border}`, color: C.soil }}>Skip</button>}
        </div>
      </div>
    </div>
  );
}

// ── Crop-plan: secondary, clearly labelled "coming up" (NOT a competing list) ──
function CropPlanSecondary({ farmId, navigate }) {
  const { openFormModal } = useFormModal();
  const { data } = useQuery({ queryKey: ["crop-plan", farmId], queryFn: () => getJSON(`/api/v1/crop-plan/farm-steps?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const steps = Array.isArray(data?.data) ? data.data : [];
  if (!steps.length) return null;
  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Coming up on your crop plan</span>
      </div>
      {steps.slice(0, 6).map((s) => (
        <div key={s.cycle_id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: `1px solid rgba(31,41,55,0.05)` }}>
          <div className="grid place-items-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: C.greenTint }}>{(s.category === "HARVEST" ? <Wheat size={15} style={{ color: C.greenDk }} /> : <Leaf size={15} style={{ color: C.greenDk }} />)}</div>
          <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate" style={{ color: C.soil }}>{s.crop} · {s.text}</div><div className="text-[11px] truncate" style={{ color: C.muted }}>{[s.stage, s.when].filter(Boolean).join(" · ")}</div></div>
          <button onClick={() => (s.category === "HARVEST" ? openFormModal("harvest_new") : navigate("/farm/cycles"))} className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold shrink-0 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{s.category === "HARVEST" ? "Log harvest" : "View cycle"}</button>
        </div>
      ))}
    </div>
  );
}

function Group({ title, count, accent, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <button onClick={() => setOpen((v) => !v)} className={`w-full flex items-center justify-between px-4 py-3 ${FOCUS}`} aria-expanded={open}>
        <span className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: C.soil }}>{title}<span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.greenTint, color: accent || C.greenDk }}>{count}</span></span>
        <ChevronDown size={16} className="motion-reduce:!transition-none" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }} aria-hidden="true" />
      </button>
      {open && <div className="px-3 pb-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function TasksInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [busy, setBusy] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [doneIds, setDoneIds] = useState(() => new Set());
  const [session, setSession] = useState(0);
  const [inputFor, setInputFor] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [mImp, setMImp] = useState(""); const [mDue, setMDue] = useState("");

  const open = useQuery({ queryKey: ["tasks-open"], queryFn: () => getJSON(`/api/v1/tasks?status=OPEN&limit=200`) });
  const allTasks = Array.isArray(open.data?.data?.tasks) ? open.data.data.tasks : [];
  const tasks = useMemo(() => allTasks.filter((t) => !doneIds.has(t.task_id)), [allTasks, doneIds]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks-open"] });

  // close menu on outside click / Esc
  useEffect(() => {
    if (!openMenu) return undefined;
    const off = () => setOpenMenu(null);
    const key = (e) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("click", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", off); document.removeEventListener("keydown", key); };
  }, [openMenu]);

  const groups = useMemo(() => {
    const g = { Overdue: [], Today: [], Tomorrow: [], "This week": [], Later: [] };
    for (const t of tasks) g[whenOf(t.due_date)].push(t);
    const rank = (a, b) => (a.task_rank ?? 999) - (b.task_rank ?? 999);
    Object.values(g).forEach((a) => a.sort(rank));
    return g;
  }, [tasks]);
  const todayList = [...groups.Overdue, ...groups.Today];
  const laterCount = groups.Tomorrow.length + groups["This week"].length + groups.Later.length;

  const nextTask = useMemo(() => {
    const w = (t) => (["Overdue", "Today"].includes(whenOf(t.due_date)) ? 0 : 1);
    return [...tasks].sort((a, b) => (w(a) - w(b)) || ((a.task_rank ?? 999) - (b.task_rank ?? 999)))[0] || null;
  }, [tasks]);

  async function onComplete(t, value) {
    const tgt = taskTarget(t);
    if (tgt) { navigate(tgt.route); return; }                          // form closes the task
    if (needsInput(t) && value == null) { setInputFor(t.task_id); setInputVal(""); return; }  // ask inline
    let input_value = null;
    if (needsInput(t)) {
      input_value = String(value ?? "").trim();
      if (!input_value) { emitToast("Enter a value"); return; }
      if (t.input_hint === "decimal" && !/^\d+(\.\d+)?$/.test(input_value)) { emitToast("Enter a number"); return; }
      if (t.input_hint === "photo" && !/^https?:\/\//.test(input_value)) { emitToast("Enter a photo URL"); return; }
      if (t.input_hint === "text_short" && input_value.length > 200) { emitToast("Keep it under 200 characters"); return; }
    }
    setBusy(t.task_id); setDoneIds((s) => new Set(s).add(t.task_id));
    try { await send("POST", `/api/v1/tasks/${t.task_id}/complete`, { input_value }); setSession((n) => n + 1); setInputFor(null); emitToast("Done"); refresh(); }
    catch (e) { setDoneIds((s) => { const n = new Set(s); n.delete(t.task_id); return n; }); emitToast(e?.userMessage || "Couldn't complete — try again"); }
    finally { setBusy(null); }
  }
  async function onSkip(t) {
    setBusy(t.task_id); setDoneIds((s) => new Set(s).add(t.task_id));
    try { await send("POST", `/api/v1/tasks/${t.task_id}/skip`, { reason: "will_do_later" }); emitToast("Skipped — it'll come back later"); refresh(); }
    catch (e) { setDoneIds((s) => { const n = new Set(s); n.delete(t.task_id); return n; }); emitToast(e?.userMessage || "Couldn't skip"); }
    finally { setBusy(null); }
  }
  async function addManual() {
    if (!farmId) { emitToast("Select a farm first"); return; }
    if (!mImp.trim()) { emitToast("Enter a task"); return; }
    try { await send("POST", `/api/v1/tasks/manual`, { farm_id: farmId, imperative: mImp.trim(), due_date: mDue || null }); emitToast("Task added"); setAddOpen(false); setMImp(""); setMDue(""); refresh(); }
    catch (e) { emitToast(e?.userMessage || "Couldn't add task"); }
  }
  const openAdd = (prefill = "") => { setMImp(prefill === "Custom task" ? "" : prefill); setMDue(""); setAddOpen(true); };
  const askAi = (t) => navigate(`/tis?q=${encodeURIComponent(`How do I: ${t.imperative}?`)}`);

  const ctl = (t, big) => <CompleteControl t={t} big={big} busy={busy === t.task_id} inputFor={inputFor} inputVal={inputVal} setInputVal={setInputVal} onComplete={onComplete} navigate={navigate} />;

  const todayTotal = todayList.length + session;
  const pct = todayTotal > 0 ? Math.round((session / todayTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Tasks</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Your plan for today.</div>
        </div>
        <div className="flex items-center gap-2">
          <FarmSelector />
          <button onClick={() => openAdd("")} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} aria-hidden="true" />Add</button>
        </div>
      </div>

      {open.isError && (
        <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: "#FEF6E6", borderColor: C.border }}>
          <span className="text-[12px] flex items-center gap-1.5" style={{ color: C.amber }}><WifiOff size={13} aria-hidden="true" />Couldn't load your tasks.</span>
          <button onClick={refresh} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}>Retry</button>
        </div>
      )}

      {open.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl animate-pulse motion-reduce:animate-none" style={{ background: C.paper }} />)}</div>
      ) : open.isError ? null : (
        <>
          <Hero t={nextTask} ctl={ctl} onSkip={onSkip} askAi={askAi} navigate={navigate} />

          {(todayTotal > 0) && (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: C.muted }}>
                <span>Today's progress</span><span>{session} of {todayTotal} done</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#EEF2F6" }} role="progressbar" aria-valuenow={session} aria-valuemin={0} aria-valuemax={todayTotal}>
                <div style={{ width: `${pct}%`, height: "100%", background: C.green }} />
              </div>
            </div>
          )}

          {todayList.length > 0 && (
            <div className="rounded-2xl border bg-white p-3" style={{ borderColor: C.border }}>
              <div className="text-sm font-bold uppercase tracking-wide mb-2 px-1" style={{ color: C.soil }}>Today &amp; overdue</div>
              <div className="flex flex-col gap-2">
                {todayList.map((t) => <TaskRow key={t.task_id} t={t} ctl={ctl} onSkip={onSkip} openMenu={openMenu} setOpenMenu={setOpenMenu} />)}
              </div>
            </div>
          )}

          {laterCount > 0 && (
            <Group title="Coming up" count={laterCount} defaultOpen={todayList.length === 0}>
              {["Tomorrow", "This week", "Later"].map((k) => groups[k].length > 0 && (
                <div key={k}>
                  <div className="text-[10px] font-bold uppercase tracking-wide px-1 mb-1 mt-1" style={{ color: C.muted }}>{k}</div>
                  <div className="flex flex-col gap-2">{groups[k].map((t) => <TaskRow key={t.task_id} t={t} ctl={ctl} onSkip={onSkip} openMenu={openMenu} setOpenMenu={setOpenMenu} />)}</div>
                </div>
              ))}
            </Group>
          )}

          {tasks.length === 0 && !nextTask && (
            <div className="rounded-2xl border bg-white p-10 text-center" style={{ borderColor: C.border }}>
              <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} aria-hidden="true" />
              <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>Nothing to do — you're on top of it</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>New tasks appear as cycles, compliance and rotations need action.</div>
            </div>
          )}

          <CropPlanSecondary farmId={farmId} navigate={navigate} />

          <div className="rounded-2xl border bg-white p-4" style={{ borderColor: C.border }}>
            <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: C.soil }}>Quick add</div>
            <div className="flex flex-wrap gap-2">
              {QUICK.map(([label, Icon]) => (
                <button key={label} onClick={() => openAdd(label)} className={`text-xs px-3 py-2 rounded-full font-semibold flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.soil, background: "var(--paper)", border: `1px solid ${C.border}` }}>
                  <Icon size={13} style={{ color: C.greenDk }} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, refetchOnReconnect: true, staleTime: 30_000 } } });
export default function FarmTasks() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <TasksInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

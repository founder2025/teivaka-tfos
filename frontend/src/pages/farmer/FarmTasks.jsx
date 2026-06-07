/**
 * FarmTasks.jsx — /farm/tasks
 *
 * The worklist for Growth/Commercial mode: every open task in the tenant's
 * task_queue — rotation & transplant suggestions (Locations), automation,
 * compliance, decision-engine, weather, manual. Complete / Skip wire to the
 * existing tasks API (GET /tasks, POST /{id}/complete, /{id}/skip). Tasks are
 * tenant-wide (the API isn't farm-scoped), so this shows all of them.
 */
import { useState } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, SkipForward, MapPin, Sprout, ShieldCheck, CloudSun, Cpu, Coins, Hand, ListChecks } from "lucide-react";

const C = { soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", paper: "#FCFAF5", greenTint: "#E9F2DD" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F]";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

const SRC = {
  rotation:   { label: "Rotation",   Icon: Sprout,      c: C.greenDk },
  automation: { label: "Automation", Icon: Cpu,         c: C.soil },
  compliance: { label: "Compliance", Icon: ShieldCheck, c: C.amber },
  weather:    { label: "Weather",    Icon: CloudSun,    c: "#2D6CDF" },
  decision:   { label: "Decision",   Icon: Cpu,         c: C.soil },
  cash:       { label: "Cash",       Icon: Coins,       c: C.greenDk },
  market:     { label: "Market",     Icon: Coins,       c: C.amber },
  tis:        { label: "TIS",        Icon: Cpu,         c: C.greenDk },
  manual:     { label: "Manual",     Icon: Hand,        c: C.muted },
};
function band(rank) {
  if (rank == null) return { label: "", c: C.muted };
  if (rank < 100) return { label: "Critical", c: C.red };
  if (rank < 300) return { label: "High", c: C.amber };
  if (rank < 600) return { label: "Medium", c: C.soil };
  if (rank < 900) return { label: "Low", c: C.muted };
  return { label: "", c: C.muted };
}
const todayISO = () => new Date().toISOString().slice(0, 10);
function fmtDue(d) {
  if (!d) return null;
  const over = d < todayISO();
  try { return { text: new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }), over }; }
  catch { return { text: d, over }; }
}

async function fetchTasks(status) {
  const r = await fetch(`/api/v1/tasks?status=${status}&limit=200`, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  const b = await r.json();
  return b?.data?.tasks ?? [];
}

function TaskRow({ t, onChanged }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const src = SRC[t.source_module] || SRC.manual;
  const b = band(t.task_rank);
  const due = fmtDue(t.due_date);
  const hint = t.input_hint || "none";
  const needsInput = hint === "numeric_kg" || hint === "numeric_fjd" || hint === "text_short" || hint === "photo";

  function inputValueForHint() {
    if (hint === "none") return null;
    if (hint === "confirm_yn") return true;
    if (hint === "checklist") return [];
    return val; // numeric/text/photo → string
  }
  async function complete() {
    if (needsInput && !val.trim()) { emitToast("Enter a value to complete"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/tasks/${t.task_id}/complete`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ input_value: inputValueForHint() }) });
      if (!r.ok) throw new Error();
      emitToast("Task completed"); onChanged?.();
    } catch { emitToast("Couldn't complete the task"); } finally { setBusy(false); }
  }
  async function skip() {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/tasks/${t.task_id}/skip`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "will_do_later" }) });
      if (!r.ok) throw new Error();
      emitToast("Task skipped"); onChanged?.();
    } catch { emitToast("Couldn't skip"); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border p-3.5 flex items-start gap-3" style={{ borderColor: C.border, background: "white" }}>
      <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.cream }}>
        <src.Icon size={17} style={{ color: src.c }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: C.soil }}>{t.imperative}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: C.cream, color: src.c }}>{src.label}</span>
          {b.label && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: b.c, border: `1px solid ${C.border}` }}>{b.label}</span>}
          {t.entity_type === "production_unit" && t.entity_id && <span className="text-[10px] flex items-center gap-0.5" style={{ color: C.muted }}><MapPin size={10} />{t.entity_id}</span>}
          {due && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: due.over ? C.red : C.muted, border: `1px solid ${C.border}` }}>{due.over ? "overdue " : "due "}{due.text}</span>}
        </div>
        {needsInput && (
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={hint === "photo" ? "Photo URL" : hint === "text_short" ? "Note" : "Value"}
            type={hint.startsWith("numeric") ? "number" : "text"}
            className={`mt-2 w-full max-w-xs px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
        )}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={complete} disabled={busy} className={`text-xs px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1.5 hover:brightness-95 disabled:opacity-60 ${FOCUS}`} style={{ background: C.greenDk }}>
          <CheckCircle2 size={14} />Done
        </button>
        <button onClick={skip} disabled={busy} className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.muted, border: `1px solid ${C.border}` }}>
          <SkipForward size={14} />Skip
        </button>
      </div>
    </div>
  );
}

function TasksInner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("OPEN");
  const { data: tasks = [], isLoading, isError } = useQuery({ queryKey: ["farm-tasks", tab], queryFn: () => fetchTasks(tab), retry: 0 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["farm-tasks"] });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Tasks</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>What the farm needs now · rotation, transplant, compliance, automation</div>
        </div>
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {[["OPEN", "Open"], ["COMPLETED", "Done"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="text-xs px-3 py-1.5 font-semibold" style={tab === k ? { background: C.greenDk, color: "white" } : { color: C.soil }}>{l}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: C.border, background: "white", color: C.muted }}>Loading tasks…</div>
      ) : isError ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: C.border, background: "white", color: C.muted }}>Couldn't load tasks. Try again shortly.</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: C.border, background: "white" }}>
          <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
          <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>{tab === "OPEN" ? "Nothing due — you're on top of it" : "No completed tasks yet"}</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>{tab === "OPEN" ? "Rotation, transplant-prep and compliance tasks appear here as the farm needs them." : "Completed tasks will show here."}</div>
          {tab === "OPEN" && <button onClick={() => navigate("/farm/locations")} className={`mt-3 text-xs px-3 py-1.5 rounded-lg ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open Locations →</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskRow key={t.task_id} t={t} onChanged={refresh} />)}
        </div>
      )}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });
export default function FarmTasks() {
  return (
    <QueryClientProvider client={queryClient}>
      <TasksInner />
    </QueryClientProvider>
  );
}

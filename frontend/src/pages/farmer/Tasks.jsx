/**
 * Tasks.jsx — /farm/tasks. Replaces the ComingSoon stub.
 *
 * Converges the prototype's coreTasksView: filterable task table with
 * Pending / Completed / All tabs and Done / Skip actions.
 *
 * Wired to real endpoints (tenant.task_queue):
 *   GET  /api/v1/tasks?status=OPEN|COMPLETED|SKIPPED&limit=
 *   POST /api/v1/tasks/{id}/complete   (JSON body; emits audit.events TASK_COMPLETED)
 *   POST /api/v1/tasks/{id}/skip
 *
 * Completing a task continues the audit hash chain server-side, so the action
 * here is genuinely audit-anchored.
 *
 * Field mapping (prototype -> production): title=imperative,
 * severity=banded(task_rank), when=due_date, source=source_module,
 * cycle=entity_id. The prototype's cropType has no production field, so that
 * column is omitted rather than fabricated.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, SkipForward, AlertTriangle } from "lucide-react";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#4F8138", amber: "#BF9000",
  red: "#B00020", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};

const TABS = [
  { key: "OPEN", label: "Pending" },
  { key: "COMPLETED", label: "Completed" },
  { key: "ALL", label: "All" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function sevFromRank(rank) {
  if (rank == null) return { label: "—", bg: C.cream, fg: C.muted };
  if (rank <= 20) return { label: "URGENT", bg: C.red, fg: "#fff" };
  if (rank <= 50) return { label: "MED", bg: C.amber, fg: "#fff" };
  return { label: "LOW", bg: "#E9F2DD", fg: C.greenDk };
}

function dueLabel(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date(); today.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const diff = Math.round((dd - today) / 86400000);
  if (diff < 0) return { text: d.toLocaleDateString(undefined,{day:"numeric",month:"short"}), overdue: true };
  if (diff === 0) return { text: "Today" };
  if (diff === 1) return { text: "Tomorrow" };
  return { text: d.toLocaleDateString(undefined,{day:"numeric",month:"short"}) };
}

async function fetchTasks(tab) {
  const qs = tab === "ALL" ? "limit=100&include_future=true"
                           : `status=${tab}&limit=100&include_future=true`;
  const res = await fetch(`/api/v1/tasks?${qs}`, { headers: authHeaders() });
  if (!res.ok) return [];
  const body = await res.json();
  return body?.data?.tasks ?? body?.tasks ?? body?.data ?? [];
}

export default function Tasks() {
  const [tab, setTab] = useState("OPEN");
  const qc = useQueryClient();

  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ["tasks", tab],
    queryFn: () => fetchTasks(tab),
  });

  const complete = useMutation({
    mutationFn: async (t) => {
      const res = await fetch(`/api/v1/tasks/${t.task_id}/complete`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ input_value: t.default_outcome ?? "done" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail?.message || b?.detail || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const skip = useMutation({
    mutationFn: async (t) => {
      const res = await fetch(`/api/v1/tasks/${t.task_id}/skip`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ reason: "skipped from task list" }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <div className="mb-5">
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Tasks</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            What to do next — ranked by what matters most
          </p>
        </div>

        <div className="flex gap-1 mb-4">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={tab === t.key
                ? { background: C.green, color: "#fff" }
                : { background: C.panel, color: C.soil, border: `1px solid ${C.border}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {complete.isError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-sm"
            style={{ background: "#FCEBEB", color: C.red, border: `1px solid ${C.red}` }}>
            {String(complete.error?.message || "Could not complete task")}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.panel }}>
          {isLoading ? (
            <div className="text-center py-16 text-sm" style={{ color: C.muted }}>Loading tasks…</div>
          ) : isError ? (
            <div className="text-center py-16 text-sm" style={{ color: C.red }}>Could not load tasks.</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: C.muted }}>
              {tab === "OPEN" ? "All caught up — no pending tasks." : "Nothing here yet."}
            </div>
          ) : (
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.cream, color: C.soil }}>
                  <th className="text-left px-4 py-2 font-semibold">Task</th>
                  <th className="text-left px-4 py-2 font-semibold">When</th>
                  <th className="text-left px-4 py-2 font-semibold">Source</th>
                  <th className="text-left px-4 py-2 font-semibold">Priority</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const sev = sevFromRank(t.task_rank);
                  const due = dueLabel(t.due_date);
                  const isDone = (t.status || "").toUpperCase() === "COMPLETED";
                  const isSkipped = (t.status || "").toUpperCase() === "SKIPPED";
                  return (
                    <tr key={t.task_id} style={{ borderTop: `1px solid ${C.border}`, opacity: isDone || isSkipped ? 0.6 : 1 }}>
                      <td className="px-4 py-2.5" style={{ color: C.soil, fontWeight: 600 }}>
                        {t.imperative || t.title || "Task"}
                        {t.entity_id ? <span style={{ fontFamily: "monospace", fontSize: 10.5, color: C.muted, marginLeft: 6 }}>{t.entity_id}</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {due.overdue
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.red, fontWeight: 600 }}><AlertTriangle size={12} />{due.text}</span>
                          : <span style={{ color: C.muted }}>{due.text}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="pill" style={{ background: C.cream, color: C.muted, fontSize: 11, borderRadius: 6, padding: "2px 8px" }}>
                          {t.source_module || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span style={{ background: sev.bg, color: sev.fg, fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>{sev.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isDone ? (
                          <span style={{ color: C.muted, fontSize: 12 }}>Done</span>
                        ) : isSkipped ? (
                          <span style={{ color: C.muted, fontSize: 12 }}>Skipped</span>
                        ) : (
                          <div className="flex gap-1.5">
                            <button onClick={() => complete.mutate(t)} disabled={complete.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                              style={{ background: C.green }}>
                              <CheckCircle2 size={13} /> Done
                            </button>
                            <button onClick={() => skip.mutate(t)} disabled={skip.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium"
                              style={{ background: C.panel, color: C.soil, border: `1px solid ${C.border}` }}>
                              <SkipForward size={13} /> Skip
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

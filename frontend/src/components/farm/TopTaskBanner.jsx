/**
 * TopTaskBanner — pulls /api/v1/tasks/next and renders the highest-rank OPEN
 * task as a prominent green-gradient banner above the metric grid.
 *
 * Day 4 Phase 1: Done + Skip buttons now fire the real
 * POST /complete and POST /skip endpoints, with React Query cache
 * invalidation on success so the banner advances to the next task.
 * Help button stays a toast stub — wiring lands in Day 4 Phase 2
 * (WhatsApp escalation).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplet } from "lucide-react";

const C = {
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

async function fetchNextTask() {
  const res = await fetch("/api/v1/tasks/next", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? null;
}

export default function TopTaskBanner() {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(null); // null | "DONE" | "SKIP"

  const { data: task, isLoading, error } = useQuery({
    queryKey: ["tasks-next"],
    queryFn: fetchNextTask,
  });

  const isBusy = submitting !== null;

  async function refreshTaskQueries() {
    await queryClient.invalidateQueries({ queryKey: ["tasks-next"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks-open-count"] });
  }

  const handleDone = async () => {
    if (!task?.task_id || isBusy) return;
    setSubmitting("DONE");
    try {
      const res = await fetch(`/api/v1/tasks/${task.task_id}/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshTaskQueries();
      emitToast("Task marked done");
    } catch (err) {
      console.error("Task complete failed:", err);
      emitToast(`Couldn't complete task: ${err.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSkip = async () => {
    if (!task?.task_id || isBusy) return;
    setSubmitting("SKIP");
    try {
      // SkipReason is required by the backend (TaskSkipIn schema). Default
      // to "other" until Day 4 Phase 2 introduces a skip-reason picker.
      const res = await fetch(`/api/v1/tasks/${task.task_id}/skip`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason: "other" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshTaskQueries();
      emitToast("Task skipped");
    } catch (err) {
      console.error("Task skip failed:", err);
      emitToast(`Couldn't skip task: ${err.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  // TODO Day 4 Phase 2: wire to /api/v1/tasks/{id}/help (WhatsApp escalation)
  const handleHelp = () => emitToast("Task help wires up Day 4 Phase 2");

  let label = "Top task";
  let title = "—";
  let meta = "";

  if (isLoading) {
    label = "Loading…";
    title = "Fetching your next task";
  } else if (error) {
    label = "Top task";
    title = "Couldn't load tasks";
    meta = error.message;
  } else if (!task) {
    label = "Top task";
    title = "You're all caught up. Bula!";
    meta = "No open tasks right now";
  } else {
    title = task.imperative || "Untitled task";
    if (task.body_md) meta = task.body_md.slice(0, 140);
    else if (task.source_module) meta = `Source: ${task.source_module}`;
  }

  const busyClass = isBusy ? "opacity-50 cursor-not-allowed" : "";

  return (
    <div
      className="rounded-2xl px-4 py-4 flex items-center gap-3 flex-wrap"
      style={{
        background: `linear-gradient(135deg, ${C.green}, ${C.greenDk})`,
        color: "white",
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: 44,
          height: 44,
          background: "rgba(255,255,255,0.18)",
        }}
      >
        <Droplet size={20} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ opacity: 0.85 }}
        >
          {label}
        </div>
        <div className="text-sm font-semibold mt-0.5">{title}</div>
        {meta && (
          <div className="text-xs mt-1 truncate" style={{ opacity: 0.85 }}>
            {meta}
          </div>
        )}
      </div>
      {task && (
        <div className="flex-shrink-0 flex gap-2">
          <button
            type="button"
            onClick={handleDone}
            disabled={isBusy}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${busyClass}`}
            style={{ background: "white", color: C.greenDk }}
          >
            {submitting === "DONE" ? "Done…" : "Done"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={isBusy}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${busyClass}`}
            style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
          >
            {submitting === "SKIP" ? "Skip…" : "Skip"}
          </button>
          <button
            type="button"
            onClick={handleHelp}
            disabled={isBusy}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${busyClass}`}
            style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
          >
            Help
          </button>
        </div>
      )}
    </div>
  );
}

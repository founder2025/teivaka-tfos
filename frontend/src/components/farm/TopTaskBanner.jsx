/**
 * TopTaskBanner — pulls /api/v1/tasks/next and renders the highest-rank OPEN
 * task as a prominent green-gradient banner above the metric grid.
 *
 * Action buttons (Done / Skip / Help) are STUBBED in this commit — they emit a
 * toast only. Day 3b-Farm scope is read-only; write endpoints
 * (POST /tasks/{id}/complete|skip|help) wire up Day 4+.
 */
import { useQuery } from "@tanstack/react-query";
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

function StubButton({ children, primary }) {
  return (
    <button
      type="button"
      onClick={() => emitToast("Task actions wire up Day 4+")}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
      style={
        primary
          ? { background: "white", color: C.greenDk }
          : { background: "rgba(255,255,255,0.18)", color: "white" }
      }
    >
      {children}
    </button>
  );
}

export default function TopTaskBanner() {
  const { data: task, isLoading, error } = useQuery({
    queryKey: ["tasks-next"],
    queryFn: fetchNextTask,
  });

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
          <StubButton primary>Done</StubButton>
          <StubButton>Skip</StubButton>
          <StubButton>Help</StubButton>
        </div>
      )}
    </div>
  );
}

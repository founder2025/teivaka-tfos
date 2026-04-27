/**
 * SoloTaskCard — single full-screen task card for Solo mode (MBI Part 19).
 *
 * Reading load under 5 words per action. Three buttons only:
 * DONE / SKIP / HELP. No mic, no camera (A2+).
 *
 * Data flow mirrors the desktop TopTaskBanner: GET /api/v1/tasks/next,
 * unwrap body.data, then POST /complete or /skip with cache invalidation
 * to advance to the next task. /help returns task body_md which we open
 * in a Modal.
 */
import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  HelpCircle,
  Sprout,
  Droplet,
  Tractor,
  AlertTriangle,
  X,
} from "lucide-react";

import Modal from "../../components/ui/Modal";

const C = {
  cream:    "#F8F3E9",
  soil:     "#5C4033",
  muted:    "#8A7863",
  border:   "#E6DED0",
  green:    "#6AA84F",
  greenDk:  "#3E7B1F",
  warn:     "#BF9000",
};

// Tiny lucide-name → component mapper. Solo card defaults to Sprout when
// the task's icon_key is unknown; the rest of the app uses these names too.
const ICON_MAP = {
  Sprout,
  Droplet,
  Tractor,
  AlertTriangle,
};

function TaskIcon({ iconKey, size = 64 }) {
  const Cmp = ICON_MAP[iconKey] || Sprout;
  return <Cmp size={size} strokeWidth={1.5} />;
}

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

async function fetchNextTask() {
  const res = await fetch("/api/v1/tasks/next", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? null;
}

function formatDueLabel(dueDate) {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate === today) return "Today";
  const d = new Date(`${dueDate}T00:00:00`);
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function SoloCardInner() {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(null); // null | "DONE" | "SKIP"
  const [helpState, setHelpState] = useState({ open: false, body: null, loading: false });

  const { data: task, isLoading, error } = useQuery({
    queryKey: ["solo-task-next"],
    queryFn: fetchNextTask,
  });

  const isBusy = submitting !== null;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["solo-task-next"] });
  }

  async function handleDone() {
    if (!task?.task_id || isBusy) return;
    setSubmitting("DONE");
    try {
      const res = await fetch(`/api/v1/tasks/${task.task_id}/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      console.error("Solo done failed:", err);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSkip() {
    if (!task?.task_id || isBusy) return;
    setSubmitting("SKIP");
    try {
      const res = await fetch(`/api/v1/tasks/${task.task_id}/skip`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason: "other" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      console.error("Solo skip failed:", err);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleHelp() {
    if (!task?.task_id || isBusy) return;
    setHelpState({ open: true, body: null, loading: true });
    try {
      const res = await fetch(`/api/v1/tasks/${task.task_id}/help`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setHelpState({
        open: true,
        body: body?.data?.body_md ?? null,
        loading: false,
      });
    } catch (err) {
      console.error("Solo help failed:", err);
      setHelpState({ open: true, body: null, loading: false });
    }
  }

  // Loading
  if (isLoading) {
    return (
      <div style={{ color: C.muted, fontSize: 14 }}>Loading…</div>
    );
  }

  // Empty / no task today
  if (!task || error) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center px-6"
        style={{ color: C.soil, maxWidth: 520 }}
      >
        <Sprout size={56} strokeWidth={1.5} style={{ color: C.green, marginBottom: 24 }} />
        <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>
          Nothing more today.
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, marginTop: 4 }}>
          Rest well.
        </div>
      </div>
    );
  }

  const dueLabel = formatDueLabel(task.due_date);

  return (
    <div
      className="flex flex-col"
      style={{
        height: "100%",
        width: "100%",
        maxWidth: 720,
        padding: "24px 24px",
      }}
    >
      {/* Top — icon + small TODAY chip */}
      <div className="flex flex-col items-center" style={{ flex: 1, justifyContent: "center" }}>
        <div style={{ color: C.green, marginBottom: 12 }}>
          <TaskIcon iconKey={task.icon_key} size={64} />
        </div>
        {dueLabel && (
          <div
            className="uppercase"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: C.muted,
            }}
          >
            {dueLabel}
          </div>
        )}
      </div>

      {/* Middle — imperative */}
      <div className="flex flex-col items-center text-center px-2" style={{ flex: 1, justifyContent: "center" }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: C.soil,
            lineHeight: 1.25,
            maxWidth: 600,
          }}
        >
          {task.imperative}
        </div>
      </div>

      {/* Bottom — three buttons */}
      <div
        className="flex items-stretch"
        style={{ flex: 1, gap: 12, alignItems: "flex-end" }}
      >
        <button
          type="button"
          onClick={handleDone}
          disabled={isBusy}
          aria-label="Done"
          className="flex-1 flex items-center justify-center"
          style={{
            minHeight: 72,
            borderRadius: 14,
            background: C.green,
            color: "#FFFFFF",
            fontSize: 18,
            fontWeight: 700,
            gap: 10,
            border: "none",
            opacity: submitting && submitting !== "DONE" ? 0.5 : 1,
            cursor: isBusy ? "wait" : "pointer",
            transition: "opacity 150ms ease",
          }}
        >
          <Check size={22} strokeWidth={2.25} />
          <span>{submitting === "DONE" ? "Done…" : "Done"}</span>
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={isBusy}
          aria-label="Skip"
          className="flex-1 flex items-center justify-center"
          style={{
            minHeight: 72,
            borderRadius: 14,
            background: "transparent",
            color: C.soil,
            fontSize: 16,
            fontWeight: 600,
            gap: 10,
            border: `1.5px solid ${C.soil}`,
            opacity: submitting && submitting !== "SKIP" ? 0.5 : 1,
            cursor: isBusy ? "wait" : "pointer",
            transition: "opacity 150ms ease",
          }}
        >
          <X size={20} strokeWidth={2} />
          <span>{submitting === "SKIP" ? "Skip…" : "Skip"}</span>
        </button>

        <button
          type="button"
          onClick={handleHelp}
          disabled={isBusy}
          aria-label="Help"
          className="flex-1 flex items-center justify-center"
          style={{
            minHeight: 72,
            borderRadius: 14,
            background: "transparent",
            color: C.warn,
            fontSize: 16,
            fontWeight: 600,
            gap: 10,
            border: `1.5px solid ${C.warn}`,
            opacity: isBusy ? 0.5 : 1,
            cursor: isBusy ? "wait" : "pointer",
            transition: "opacity 150ms ease",
          }}
        >
          <HelpCircle size={20} strokeWidth={2} />
          <span>Help</span>
        </button>
      </div>

      <Modal
        isOpen={helpState.open}
        onClose={() => setHelpState({ open: false, body: null, loading: false })}
        title="Help"
        size="md"
      >
        {helpState.loading ? (
          <div style={{ color: C.muted, fontSize: 14 }}>Loading help…</div>
        ) : helpState.body ? (
          <div
            style={{
              color: C.soil,
              fontSize: 15,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {helpState.body}
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 14 }}>
            No extra help for this task. Tap Done when complete or Skip if it
            does not apply today.
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function SoloTaskCard() {
  return (
    <QueryClientProvider client={queryClient}>
      <SoloCardInner />
    </QueryClientProvider>
  );
}

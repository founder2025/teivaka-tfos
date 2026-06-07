/**
 * taskBridge.js — close the loop between a task and the real record.
 *
 * taskTarget(task): if a task represents a real action, returns the log form to
 * open (prefilled) + a button label; else null (mark done directly).
 * completeLinkedTask(): a log form calls this on successful save — if it was
 * opened from a task (?task=<id>), the task is auto-completed. For health/WHD
 * tasks, logging the CLEARED event already clears the compliance gate server-side.
 */
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

export function taskTarget(t) {
  if (!t) return null;
  const src = t.source_module, ent = t.entity_type, eid = t.entity_id, imp = (t.imperative || "").toLowerCase();
  if (ent === "production_unit" && eid) {
    if (imp.includes("harvest") || imp.includes("pick") || imp.includes("dig up"))
      return { route: `/farm/harvest/new?pu=${encodeURIComponent(eid)}&task=${t.task_id}`, label: "Log harvest" };
    if (src === "rotation" || imp.includes("rotation") || imp.includes("transplant") || imp.includes("prepare") || imp.includes("plant"))
      return { route: `/farm/cycles/new?pu=${encodeURIComponent(eid)}&task=${t.task_id}`, label: "Start crop" };
  }
  if (ent === "flock" && eid)
    return { route: `/farm/poultry/health/new?flock_id=${encodeURIComponent(eid)}&task=${t.task_id}`, label: "Log health" };
  if (src === "compliance" && ent && eid)
    return { route: `/farm/poultry/health/new?flock_id=${encodeURIComponent(eid)}&task=${t.task_id}`, label: "Log health" };
  return null;
}

/** Complete the task this form was opened from (?task=<id>), if any. Best-effort. */
export async function completeLinkedTask() {
  let id = null;
  try { id = new URLSearchParams(window.location.search).get("task"); } catch { /* noop */ }
  if (!id) return;
  try {
    await fetch(`/api/v1/tasks/${id}/complete`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ input_value: null }),
    });
  } catch { /* the real record is logged regardless */ }
}

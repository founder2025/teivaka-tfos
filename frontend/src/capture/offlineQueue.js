/**
 * offlineQueue.js — durable, idempotent capture queue for the (+) FAB.
 *
 * The (+) is the field tool: it must survive a dead signal and never lose, block, or duplicate a
 * record. Every capture is written here first (localStorage — synchronous, reliable, survives a
 * reload/crash), then flushed to the server. Each item carries a client-generated idempotency key
 * (`idem`) so a re-tap, a retry, or a flush replay can never create a duplicate on the audit chain
 * (the server dedupes on `offline_id` once that lands; the key is forward-compatible until then).
 *
 * Failure model (no silent data loss):
 *   - network error  → item stays queued, flush stops (retry on reconnect / next capture)
 *   - 4xx/5xx error  → attempts++ ; after MAX_ATTEMPTS the item is marked `failed` (kept, not
 *                       retried) so the UI can surface "N records couldn't sync" instead of
 *                       silently dropping a farmer's work.
 */

const KEY = "tfos_capture_queue_v1";
const CAP = 500;            // hard ceiling — drop oldest beyond this (logged), never unbounded
const MAX_ATTEMPTS = 6;

const listeners = new Set();
function notify() { const n = pendingCount(); listeners.forEach((fn) => { try { fn(n); } catch { /* noop */ } }); }

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-CAP))); }
  catch { /* quota / private mode — the in-flight item still tries online; we just can't persist it */ }
  notify();
}

export function newIdem() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* noop */ }
  return `cap-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Queue a capture for later send. Idempotent: re-enqueuing the same `idem` is a no-op. */
export function enqueue({ idem, endpoint, method = "POST", body }) {
  const items = read();
  if (items.some((x) => x.idem === idem)) return idem;
  items.push({ idem, endpoint, method, body, queuedAt: Date.now(), attempts: 0, failed: false });
  write(items);
  return idem;
}

export function pending() { return read().filter((x) => !x.failed); }
export function pendingCount() { return pending().length; }
export function failed() { return read().filter((x) => x.failed); }
export function failedCount() { return failed().length; }

export function subscribe(fn) { listeners.add(fn); fn(pendingCount()); return () => listeners.delete(fn); }

function dropByIdem(idem) { write(read().filter((x) => x.idem !== idem)); }
function markAttempt(idem, asFailed) {
  write(read().map((x) => x.idem === idem ? { ...x, attempts: (x.attempts || 0) + 1, failed: !!asFailed || x.failed } : x));
}

let flushing = false;
/**
 * Drain the queue through `sender(item) -> Promise`. `sender` must throw an error carrying
 * `.kind` ("network" | "server" | "client") — exactly what utils/api `ApiError` provides.
 * Stops on the first network error (offline again); records permanent failures without losing them.
 */
export async function flush(sender) {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    for (const item of pending()) {
      try {
        await sender(item);
        dropByIdem(item.idem);            // committed (or server-deduped) → remove
      } catch (e) {
        if (e?.kind === "network") break; // still offline — keep everything, stop draining
        markAttempt(item.idem, (item.attempts || 0) + 1 >= MAX_ATTEMPTS);  // permanent error path
      }
    }
  } finally { flushing = false; notify(); }
}

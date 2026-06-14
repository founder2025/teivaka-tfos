/**
 * outbox.js — offline-first write queue for TFOS event submissions.
 *
 * When POST /events fails because the device is offline, the request is stored
 * in IndexedDB and replayed automatically when connectivity returns. Every
 * submission carries a client idempotency_key, so a replay never double-inserts
 * (the backend dedupes on that key — migration 143). Dispatches
 * 'tfos-outbox-changed' {pending} so the UI can show a sync indicator.
 *
 * Scope (Slice 1): the universal /events submission path (useEventMutation).
 * It captures the "app open, signal drops mid-session" case. App-shell offline
 * load (service worker) is a separate slice.
 */
import { apiClient } from "./apiClient";

const DB_NAME = "tfos_offline";
const STORE = "outbox";
const VERSION = 1;

const uuid = () => (window.crypto?.randomUUID
  ? window.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}
const put = (rec) => tx("readwrite").then((s) => new Promise((res, rej) => { const r = s.put(rec); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
const all = () => tx("readonly").then((s) => new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }));
const del = (id) => tx("readwrite").then((s) => new Promise((res, rej) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
const count = () => tx("readonly").then((s) => new Promise((res, rej) => { const r = s.count(); r.onsuccess = () => res(r.result || 0); r.onerror = () => rej(r.error); }));

function announce() {
  count().then((n) => window.dispatchEvent(new CustomEvent("tfos-outbox-changed", { detail: { pending: n } }))).catch(() => {});
}

// Ask the service worker to replay the outbox in the background — fires even
// after the tab is closed (Background Sync). No-op where unsupported; the
// page-side flushOutbox still covers those browsers while the app is open.
function requestBackgroundSync() {
  try {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then((reg) => reg.sync.register("tfos-outbox")).catch(() => {});
    }
  } catch { /* ignore */ }
}

export async function pendingCount() { try { return await count(); } catch { return 0; } }

// A failure is "network" (queue it) when we're offline or the fetch itself
// threw (no HTTP status). A real HTTP error (4xx/5xx) carries err.status and
// must surface to the user — we never silently queue a rejected/invalid event.
function isNetworkError(err) {
  return !navigator.onLine || err == null || err.status === undefined;
}

/**
 * Submit a /events body, offline-aware. Returns the server result, or an
 * optimistic {_queued:true} when stored for later sync.
 */
export async function submitEvent(body) {
  const payload = { ...body };
  if (!payload.idempotency_key) payload.idempotency_key = uuid();
  // token stored with the record so the SW can replay it tab-closed (it has no
  // access to localStorage). Best-effort: the page flush always uses a fresh one.
  const token = localStorage.getItem("tfos_access_token");
  const enqueue = async () => {
    await put({ id: payload.idempotency_key, url: "/api/v1/events", method: "POST", body: payload, token, created_at: Date.now() });
    announce();
    requestBackgroundSync();
    return { data: { queued: true }, _queued: true };
  };
  if (!navigator.onLine) return enqueue();
  try {
    return await apiClient.post("/events", payload);
  } catch (err) {
    if (isNetworkError(err)) return enqueue();
    throw err;
  }
}

let flushing = false;
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const recs = await all();
    for (const rec of recs) {
      try {
        const token = localStorage.getItem("tfos_access_token");
        const res = await fetch(rec.url, {
          method: rec.method,
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(rec.body),
        });
        if (res.ok) {
          await del(rec.id);
        } else if (res.status >= 400 && res.status < 500) {
          // permanent client error — replaying won't help; drop + tell the user
          await del(rec.id);
          window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "A queued entry couldn't be saved and was discarded.", type: "error" } }));
        } else {
          break; // 5xx — server hiccup; keep it and retry later
        }
      } catch {
        break; // network dropped again — stop, retry on next online
      }
    }
  } finally {
    flushing = false;
    announce();
  }
}

let started = false;
export function initOutbox() {
  if (started) return;
  started = true;
  window.addEventListener("online", flushOutbox);
  setInterval(flushOutbox, 30000);
  flushOutbox();
  announce();
}

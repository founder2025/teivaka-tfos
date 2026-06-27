/**
 * evidenceStore.js — durable, offline blob storage for (+) FAB evidence.
 *
 * Photos/voice captured in the field must survive going offline (and an app reload) so they can be
 * uploaded when signal returns — the event queue (offlineQueue) holds the JSON record, this holds
 * the binary it references. IndexedDB (the right store for blobs; localStorage can't hold MBs).
 *
 * Graceful by construction: if IndexedDB is unavailable or any op fails, every function resolves to
 * a safe no-op/null, so the caller falls back to today's online-only evidence behaviour — never a
 * crash, never worse than before.
 */
const DB_NAME = "tfos_capture";
const STORE = "evidence";
const VERSION = 1;

function hasIDB() { try { return typeof indexedDB !== "undefined"; } catch { return false; } }

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

function run(mode, fn) {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const rq = fn(store);
      tx.oncomplete = () => resolve(rq ? rq.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).catch(reject);
  });
}

/** Persist a blob under `id`. Returns true on success, false if storage is unavailable. */
export async function putEvidence(id, blob, meta = {}) {
  if (!hasIDB() || !blob) return false;
  try { await run("readwrite", (s) => s.put({ blob, meta, savedAt: Date.now() }, id)); return true; }
  catch { return false; }
}

/** Get a stored blob record `{ blob, meta }` or null. */
export async function getEvidence(id) {
  if (!hasIDB()) return null;
  try { return (await run("readonly", (s) => s.get(id))) || null; }
  catch { return null; }
}

export async function delEvidence(id) {
  if (!hasIDB()) return;
  try { await run("readwrite", (s) => s.delete(id)); } catch { /* noop */ }
}

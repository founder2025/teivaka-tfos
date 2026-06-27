/**
 * submitCapture.js — the single write path for the (+) FAB.
 *
 *   - routes the event through utils/api `send` → silent token refresh + farmer-readable errors;
 *   - stamps an idempotency key (`offline_id`) so a re-tap / retry / queue-replay can't duplicate;
 *   - optimistic + offline-first: offline OR a network error → queued locally, never lost; a real
 *     4xx/5xx is thrown so the form can show it (we don't queue a request the server rejected);
 *   - EVIDENCE DURABILITY: photos/voice captured offline are stashed in IndexedDB and re-uploaded
 *     when the queue flushes, then attached to the event — so field evidence is never lost.
 *
 * `ensureCaptureSync()` wires the reconnect flush once; call it where the (+) lives.
 */
import { send } from "../utils/api";
import { enqueue, flush, newIdem } from "./offlineQueue";
import { putEvidence, getEvidence, delEvidence } from "./evidenceStore";

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Multipart upload (stays raw — utils/api `send` is JSON-only). Tags network errors for the queue. */
async function uploadEvidence(fileOrBlob, filename) {
  const fd = new FormData(); fd.append("file", fileOrBlob, filename || "evidence");
  const tok = localStorage.getItem("tfos_access_token");
  let res;
  try { res = await fetch("/api/v1/community/uploads", { method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd }); }
  catch { throw Object.assign(new Error("upload network error"), { kind: "network" }); }
  if (!res.ok) throw Object.assign(new Error(`upload ${res.status}`), { kind: res.status >= 500 ? "server" : "client" });
  const b = await res.json().catch(() => null);
  const url = b?.data?.url || b?.url;
  if (!url) throw Object.assign(new Error("upload returned no url"), { kind: "server" });
  return url;
}

const filename = (key) => key === "voice_url" ? "voice.webm" : "photo.jpg";

/**
 * @param evidenceFiles  { photo_url?: File, voice_url?: Blob } — only the items NOT already uploaded.
 * @returns {Promise<{queued:boolean, idem:string, data?:any}>}  resolves on success OR queued;
 *          throws an ApiError only on a genuine server/validation rejection of the EVENT.
 */
export async function submitCapture({ endpoint, method = "POST", body, idem, evidenceFiles = {} }) {
  const idemKey = idem || newIdem();
  const fileEntries = Object.entries(evidenceFiles).filter(([, f]) => f);

  // Helper to queue the event + stash any pending evidence blobs (offline / network failure path).
  async function queueIt(payload) {
    const pendingEvidence = [];
    for (const [key, file] of fileEntries) {
      const id = `${idemKey}-${key}`;
      const ok = await putEvidence(id, file, { key });
      if (ok) pendingEvidence.push({ id, key });   // if storage failed, the record still queues without it
    }
    enqueue({ idem: idemKey, endpoint, method, body: payload, pendingEvidence });
    return { queued: true, idem: idemKey };
  }

  // `idempotency_key` is what POST /events dedupes on (events.py); `offline_id` covers the
  // cash-ledger path. Sending both makes replays/double-taps return the original on every endpoint.
  const payload = { ...body, idempotency_key: idemKey, offline_id: idemKey };
  if (isOffline()) return queueIt(payload);

  // Online: upload evidence inline, then send the event.
  try {
    if (fileEntries.length) {
      const evidence = { ...(payload.evidence || {}) };
      for (const [key, file] of fileEntries) evidence[key] = await uploadEvidence(file, filename(key));
      payload.evidence = evidence;
    }
  } catch (e) {
    if (e?.kind === "network") return queueIt(payload);  // lost signal mid-upload
    // a non-network upload failure (4xx/5xx) — proceed without that evidence rather than block the log
  }

  try {
    const data = await send(method, endpoint, payload);
    flush(sender);                       // opportunistically drain anything queued earlier
    return { queued: false, idem: idemKey, data };
  } catch (e) {
    if (e?.kind === "network") return queueIt(payload);  // event send lost signal → queue (evidence already inlined)
    throw e;                             // 4xx/5xx — surface to the form (humanised via e.userMessage)
  }
}

/** Queue drainer: re-upload any stashed evidence into the body, then send the event. */
async function sender(item) {
  const body = { ...item.body };
  for (const { id, key } of (item.pendingEvidence || [])) {
    const rec = await getEvidence(id);
    if (rec?.blob) {
      const url = await uploadEvidence(rec.blob, filename(key));   // throws kind:network → flush keeps item
      body.evidence = { ...(body.evidence || {}), [key]: url };
    }
  }
  await send(item.method || "POST", item.endpoint, body);
  for (const { id } of (item.pendingEvidence || [])) delEvidence(id);   // committed → free the blob
}

let wired = false;
/** Idempotent: drain anything left from a previous session + flush on every reconnect. */
export function ensureCaptureSync() {
  flush(sender);
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => flush(sender));
}

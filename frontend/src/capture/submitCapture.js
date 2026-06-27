/**
 * submitCapture.js — the single write path for the (+) FAB.
 *
 * One function for every capture (POST /events, POST /cash-ledger, …):
 *   - routes through utils/api `send` → silent token refresh (a stale 401 never blocks a log) +
 *     farmer-readable errors;
 *   - stamps an idempotency key (`offline_id`) on the body so a re-tap / retry / queue-replay can
 *     never duplicate an immutable record;
 *   - optimistic + offline-first: if the device is offline, or the request fails with a NETWORK
 *     error, the capture is queued locally and reported as saved-pending — never lost;
 *   - a real validation/server error (4xx/5xx) is thrown so the form can show it (we do NOT queue
 *     a request the server already rejected).
 *
 * `ensureCaptureSync()` wires the reconnect flush once; call it where the (+) lives.
 */
import { send } from "../utils/api";
import { enqueue, flush, newIdem } from "./offlineQueue";

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const sender = (item) => send(item.method || "POST", item.endpoint, item.body);

/**
 * @returns {Promise<{queued:boolean, idem:string, data?:any}>}  resolves on success OR queued;
 *          throws an ApiError only on a genuine server/validation rejection.
 */
export async function submitCapture({ endpoint, method = "POST", body, idem }) {
  const idemKey = idem || newIdem();
  const payload = { ...body, offline_id: idemKey };

  if (isOffline()) { enqueue({ idem: idemKey, endpoint, method, body: payload }); return { queued: true, idem: idemKey }; }

  try {
    const data = await send(method, endpoint, payload);
    flush(sender);                       // opportunistically drain anything queued earlier
    return { queued: false, idem: idemKey, data };
  } catch (e) {
    if (e?.kind === "network") { enqueue({ idem: idemKey, endpoint, method, body: payload }); return { queued: true, idem: idemKey }; }
    throw e;                              // 4xx/5xx — surface to the form (humanised via e.userMessage)
  }
}

let wired = false;
/** Idempotent: attaches the online→flush listener once and attempts an initial drain. */
export function ensureCaptureSync() {
  flush(sender);                         // drain anything left from a previous session
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => flush(sender));
}

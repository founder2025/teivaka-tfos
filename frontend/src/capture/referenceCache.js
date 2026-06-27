/**
 * referenceCache.js — cache-with-offline-fallback for (+) reference data.
 *
 * The capture form needs reference lists to let a farmer pick: active cycles/flocks (the anchor),
 * the chemical library (spray), farm libraries (feed/vaccine). Online we fetch fresh and cache;
 * offline (or on a network failure) we serve the last cached copy so the farmer can still complete
 * a log in the field. Per-key in localStorage; small JSON only (never blobs — those live in
 * evidenceStore). Throws `{offline:true}` only when offline AND nothing is cached.
 */
const PFX = "tfos_ref_";

function readCache(key) {
  try { const c = JSON.parse(localStorage.getItem(PFX + key) || "null"); return c && "body" in c ? c.body : null; }
  catch { return null; }
}
function writeCache(key, body) {
  try { localStorage.setItem(PFX + key, JSON.stringify({ body, ts: Date.now() })); } catch { /* quota — fine, just don't cache */ }
}

export async function cachedJSON(key, url, headers) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const c = readCache(key);
    if (c !== null) return c;
    throw Object.assign(new Error("offline and nothing cached"), { offline: true });
  }
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    writeCache(key, body);
    return body;
  } catch (e) {
    const c = readCache(key);
    if (c !== null) return c;   // network hiccup but we have a usable cache
    throw e;
  }
}

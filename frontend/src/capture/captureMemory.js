/**
 * captureMemory.js — on-device, privacy-safe learning for the (+) FAB.
 *
 * The farmer logs the same handful of things in a daily rhythm. Instead of a static, config-ordered
 * essentials list, we learn each farmer's *own* most-logged events (frequency + recency) and the
 * last value they entered — so Quick-log surfaces what THEY actually do, and routine fields come
 * pre-filled. All local (localStorage) — no network, no AI dependency, works offline, nothing
 * leaves the device. This is the "reduce taps / reduce typing / it knows me" layer.
 */
const KEY = "tfos_capture_memory_v1";
const MAX_EVENTS = 60;

function read() { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* quota / private mode — degrade silently to static essentials */ } }

// Only remember simple scalar answers worth pre-filling (a feed quantity, a choice) — never FK ids,
// evidence, or free-text notes (those are per-event and shouldn't carry over).
const isPrefillable = (v) => (typeof v === "number" || (typeof v === "string" && v.length <= 40));

/** Record a successful capture: bump frequency, stamp recency, remember its scalar values. */
export function recordCapture({ eventType, values = {} }) {
  if (!eventType) return;
  const o = read();
  const e = o[eventType] || { count: 0, lastTs: 0, lastValues: {} };
  e.count += 1;
  e.lastTs = Date.now();
  const lv = {};
  for (const [k, val] of Object.entries(values)) { if (k !== "notes" && val !== "" && isPrefillable(val)) lv[k] = val; }
  e.lastValues = lv;
  o[eventType] = e;
  const keys = Object.keys(o);
  if (keys.length > MAX_EVENTS) {
    keys.sort((a, b) => o[a].lastTs - o[b].lastTs).slice(0, keys.length - MAX_EVENTS).forEach((k) => delete o[k]);
  }
  write(o);
}

// Blended score: how often + how recently. Recency bonus decays over a month.
function score(e) {
  const days = (Date.now() - (e.lastTs || 0)) / 86_400_000;
  const recency = days < 2 ? 6 : days < 7 ? 3 : days < 30 ? 1 : 0;
  return (e.count || 0) + recency;
}

/** The farmer's most-used events, frequency+recency ranked. [] when there's no history yet. */
export function topActions(limit = 8) {
  const o = read();
  return Object.entries(o)
    .map(([eventType, e]) => ({ eventType, count: e.count || 0, lastTs: e.lastTs || 0, _s: score(e) }))
    .sort((a, b) => b._s - a._s || b.lastTs - a.lastTs)
    .slice(0, limit);
}

/** Most-recently-logged events (for "Do again"). */
export function recents(limit = 4) {
  const o = read();
  return Object.entries(o)
    .map(([eventType, e]) => ({ eventType, lastTs: e.lastTs || 0 }))
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, limit);
}

/** Last scalar values entered for an event type (for pre-fill). */
export function lastValues(eventType) { return read()[eventType]?.lastValues || {}; }

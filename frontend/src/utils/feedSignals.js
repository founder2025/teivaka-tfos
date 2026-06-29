/**
 * feedSignals.js — Feed v2 Slice 1.1: best-effort engagement signal producers.
 *
 * Emits IMPRESSION (a post actually entered the viewport) and CLICK (the reader
 * engaged with a post) to the signals store shipped in Slice 1
 * (POST /api/v1/community/feed/signals). These accrue the data the relevance
 * ranking + outcome models run on — the flywheel foundation.
 *
 * Design rules: never throw, never block the UI, never retry aggressively. A
 * lost signal costs nothing; signals are valuable in aggregate, not singly.
 * Batched + flushed on an interval and on tab-hide / navigation.
 */
import { send } from "./api";

const ENDPOINT = "/api/v1/community/feed/signals";
const FLUSH_MS = 5000;   // batch window — keeps request count low
const MAX_BATCH = 100;   // server caps the batch at 100 anyway

let queue = [];
let timer = null;
const seenImpression = new Set(); // dedupe IMPRESSION per post for this session

function schedule() {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_MS);
}

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  try { await send("POST", ENDPOINT, { signals: batch }); } catch { /* best-effort — drop */ }
  if (queue.length) schedule();
}

function signal(postId, type) {
  if (!postId || !type) return;
  if (type === "IMPRESSION") {
    if (seenImpression.has(postId)) return; // count a post's impression once per session
    seenImpression.add(postId);
  }
  queue.push({ post_id: postId, type });
  if (queue.length >= MAX_BATCH) flush();
  else schedule();
}

export const impression = (postId) => signal(postId, "IMPRESSION");
export const click = (postId) => signal(postId, "CLICK");

// Flush on tab-hide / navigation so a session's signals aren't lost on exit.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/* Teivaka service worker — Web Push (chat notifications) + app-shell caching
 * for cold offline load.
 *
 * Caching strategy (deploy-safe — never serves stale app code):
 *   - navigations  → NETWORK-FIRST, fall back to the cached shell when offline.
 *     A fresh deploy is always picked up online; offline still opens the app.
 *   - hashed assets (/assets/*, images, fonts, css/js) → CACHE-FIRST. Vite
 *     fingerprints these filenames, so a cached copy is immutable & safe.
 *   - /api/*  → never cached (writes go through the IndexedDB outbox; reads
 *     just fail gracefully offline).
 */
const CACHE = "tfos-shell-v1";
const SHELL = ["/", "/teivaka_logo.png", "/teivaka-lockup.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).catch(() => {}),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("tfos-shell-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;     // 3rd-party: let the browser handle
  if (url.pathname.startsWith("/api/")) return;        // never cache the API

  // Navigations → network-first, cached shell as offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match("/"))),
    );
    return;
  }

  // Hashed/immutable assets → cache-first, runtime-cache new ones.
  if (url.pathname.startsWith("/assets/") || /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|css|js)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      })),
    );
    return;
  }

  // Everything else → network, fall back to any cached copy.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

/* ------------------------------------------------- Background Sync (outbox)
 * Replays queued /events submissions even after the tab is closed. Reads the
 * SAME IndexedDB the page writes (tfos_offline/outbox). The SW can't read
 * localStorage, so each record carries its own auth token. Backend dedupes on
 * idempotency_key, so replays never duplicate.
 */
const OUTBOX_DB = "tfos_offline";
const OUTBOX_STORE = "outbox";

function _obOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(OUTBOX_DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(OUTBOX_STORE)) d.createObjectStore(OUTBOX_STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function _obAll() { return _obOpen().then((db) => new Promise((res, rej) => { const r = db.transaction(OUTBOX_STORE, "readonly").objectStore(OUTBOX_STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); })); }
function _obDel(id) { return _obOpen().then((db) => new Promise((res, rej) => { const r = db.transaction(OUTBOX_STORE, "readwrite").objectStore(OUTBOX_STORE).delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); })); }

async function replayOutbox() {
  const recs = await _obAll();
  for (const rec of recs) {
    const headers = { "Content-Type": "application/json" };
    if (rec.token) headers.Authorization = `Bearer ${rec.token}`;
    let res;
    try {
      res = await fetch(rec.url, { method: rec.method, headers, body: JSON.stringify(rec.body) });
    } catch (_) {
      throw new Error("offline");                 // still no network → reject so the browser retries the sync
    }
    if (res.ok) {
      await _obDel(rec.id);
    } else if (res.status === 401 || res.status === 403) {
      // stale token — leave it; the app will replay with a fresh token next open
      continue;
    } else if (res.status >= 400 && res.status < 500) {
      await _obDel(rec.id);                        // permanent bad request — drop
    } else {
      throw new Error("server " + res.status);     // 5xx → retry later
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "tfos-outbox") event.waitUntil(replayOutbox());
});

/* ----------------------------------------------------------------- Web Push */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data && event.data.text() }; }
  const title = d.title || "Teivaka";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/teivaka_logo.png",
    badge: "/teivaka_logo.png",
    tag: d.tag || "tfos-chat",
    data: { url: d.url || "/home" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { if (c.navigate) c.navigate(url); return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

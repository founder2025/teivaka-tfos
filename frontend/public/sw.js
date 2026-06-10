/* Teivaka service worker — Web Push for chat notifications. */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

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

/**
 * push.js — enable Web Push: ask permission, register the service worker, subscribe
 * with the server's VAPID public key, and POST the subscription. Returns {ok, reason}.
 * No-op-safe when unsupported or VAPID isn't configured server-side.
 */
const tok = () => localStorage.getItem("tfos_access_token");

function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enablePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
      return { ok: false, reason: "unsupported" };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: perm };

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const r = await fetch("/api/v1/community/push/vapid-public", { headers: { Authorization: `Bearer ${tok()}` } });
    const pub = (await r.json())?.data?.public_key;
    if (!pub) return { ok: false, reason: "vapid_not_configured" };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(pub) });

    const j = sub.toJSON();
    await fetch("/api/v1/community/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
      body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, user_agent: navigator.userAgent }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

import { useEffect, useRef } from "react";
import { getJSON } from "../../utils/api";

/**
 * NotificationWatcher — the real-time "pop" (audit Slice 1).
 *
 * Polls the unread-count on mount + tab-focus + a gentle 60s interval WHILE VISIBLE
 * (no aggressive fixed poll — connection-friendly). When unread rises, it toasts the
 * newest notification's text via the existing global tfos:toast host, and broadcasts
 * tfos:notif-count for any bell badge. First tick only sets the baseline (no toast for
 * notifications that were already unread on load). Mounted once in FarmerShell.
 */
export default function NotificationWatcher() {
  const last = useRef(null);

  useEffect(() => {
    let timer = null;
    async function tick() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const r = await getJSON("/api/v1/community/notifications/count");
        const unread = r?.data?.unread ?? 0;
        if (last.current != null && unread > last.current) {
          let message = "You have a new notification";
          try {
            const l = await getJSON("/api/v1/community/notifications?limit=1");
            if (l?.data?.[0]?.body) message = l.data[0].body;
          } catch { /* fall back to the generic message */ }
          window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message } }));
        }
        last.current = unread;
        window.dispatchEvent(new CustomEvent("tfos:notif-count", { detail: { unread } }));
      } catch { /* offline / transient — ignore, try again next tick */ }
    }
    tick();
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    timer = setInterval(tick, 60000);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return null;
}

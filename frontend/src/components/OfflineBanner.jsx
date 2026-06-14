/**
 * OfflineBanner — slim global indicator for offline-first capture.
 * Shows "You're offline — entries are saved and will sync" when offline, and
 * "Syncing N saved…" while a queued backlog drains. Hidden when online + empty.
 * Also boots the outbox (flush-on-reconnect + interval) once, app-wide.
 */
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { initOutbox, pendingCount, flushOutbox } from "../utils/outbox";

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    initOutbox();
    pendingCount().then(setPending);
    const onUp = () => { setOnline(true); flushOutbox(); };
    const onDown = () => setOnline(false);
    const onChange = (e) => setPending(e?.detail?.pending ?? 0);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    window.addEventListener("tfos-outbox-changed", onChange);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      window.removeEventListener("tfos-outbox-changed", onChange);
    };
  }, []);

  if (online && pending === 0) return null;

  const offline = !online;
  const bg = offline ? "var(--soil)" : "var(--green-dk)";
  const text = offline
    ? (pending > 0 ? `You're offline — ${pending} entr${pending === 1 ? "y" : "ies"} saved, will sync` : "You're offline — your entries are saved and will sync")
    : `Syncing ${pending} saved entr${pending === 1 ? "y" : "ies"}…`;

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2500,
      background: bg, color: "#fff", fontSize: 13, fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "8px 14px", boxShadow: "0 -2px 10px rgba(0,0,0,0.18)",
    }}>
      {offline ? <CloudOff size={15} /> : <RefreshCw size={15} />}
      <span>{text}</span>
    </div>
  );
}

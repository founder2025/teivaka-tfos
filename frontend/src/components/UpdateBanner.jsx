/**
 * UpdateBanner — "a new version is available, refresh" prompt.
 *
 * No service worker: each build bakes __BUILD_ID__ (vite define) and emits
 * /version.json with the same id. A long-open tab polls version.json (every 60s
 * + on tab focus); if the deployed build differs from the running one, it shows a
 * one-tap Refresh so users pick up deploys without the manual cache dance.
 */
import { useEffect, useState } from "react";

const CURRENT = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : null;

export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!CURRENT) return;
    let alive = true;
    async function check() {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d?.build && d.build !== CURRENT) setStale(true);
      } catch { /* offline / not deployed — ignore */ }
    }
    check();
    const id = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!stale) return null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 4000, display: "flex", justifyContent: "center", padding: 10, pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", background: "var(--green-dk)", color: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", boxShadow: "0 6px 18px rgba(58,46,38,.28)" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>A new version of TFOS is available.</span>
        <button onClick={() => window.location.reload(true)}
          style={{ background: "var(--paper)", color: "var(--green-dk)", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "6px 12px", border: "none", cursor: "pointer" }}>
          Refresh
        </button>
      </div>
    </div>
  );
}

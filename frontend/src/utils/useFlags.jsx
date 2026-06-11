/** useFlags — public feature flags (admin kill switches). Defaults to
 *  everything ON when unreachable, so a flags outage can never dark the app. */
import { useEffect, useState } from "react";

let _cache = null;
export function useFlags() {
  const [flags, setFlags] = useState(_cache || {});
  useEffect(() => {
    if (_cache) return;
    fetch("/api/v1/platform/flags").then((r) => r.json())
      .then((j) => { _cache = j?.data || {}; setFlags(_cache); })
      .catch(() => { _cache = {}; setFlags({}); });
  }, []);
  return (flag) => flags[flag] !== false; // missing/unreachable = enabled
}

export function DisabledNotice({ what }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6E1D6", borderRadius: 12, padding: 28, textAlign: "center", color: "#8A8678", margin: "20px auto", maxWidth: 520 }}>
      <div style={{ fontWeight: 800, color: "#5C4033", fontSize: 16, marginBottom: 6 }}>{what} is temporarily unavailable</div>
      <div style={{ fontSize: 13.5 }}>The Teivaka team has paused this area for maintenance. Your data is safe — check back shortly.</div>
    </div>
  );
}


/** Fire-and-forget growth pings: one visit per browser session (anonymous),
 *  one daily-active ping per session when signed in, and PWA installs. */
export function firePings() {
  try {
    if (!sessionStorage.getItem("tfos_visit_pinged")) {
      sessionStorage.setItem("tfos_visit_pinged", "1");
      fetch("/api/v1/platform/metric", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "visit" }) }).catch(() => {});
    }
    const t = localStorage.getItem("tfos_access_token");
    if (t && !sessionStorage.getItem("tfos_activity_pinged")) {
      sessionStorage.setItem("tfos_activity_pinged", "1");
      fetch("/api/v1/me/activity", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    }
    if (!window.__tfosPwaListener) {
      window.__tfosPwaListener = true;
      window.addEventListener("appinstalled", () => {
        fetch("/api/v1/platform/metric", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "pwa_install" }) }).catch(() => {});
      });
    }
  } catch { /* never break the app for metrics */ }
}

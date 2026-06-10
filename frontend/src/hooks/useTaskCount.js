/**
 * useTaskCount — polls /api/v1/tasks/count for the open/overdue badge shown on
 * the Tasks nav entry. 60s interval + refetch on tab focus. Non-critical: any
 * failure leaves the badge at zero. Shared by LeftRail (desktop) and
 * PillarSubNavStrip (mobile/tablet) so there is one source of truth.
 */
import { useEffect, useState } from "react";

export function useTaskCount() {
  const [c, setC] = useState({ open: 0, overdue: 0 });
  useEffect(() => {
    let alive = true;
    const tok = localStorage.getItem("tfos_access_token");
    if (!tok) return undefined;
    async function load() {
      try {
        const r = await fetch("/api/v1/tasks/count", { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d?.data) setC({ open: d.data.open || 0, overdue: d.data.overdue || 0 });
      } catch { /* nav badge is non-critical */ }
    }
    load();
    const id = setInterval(load, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return c;
}

export default useTaskCount;

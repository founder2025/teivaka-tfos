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

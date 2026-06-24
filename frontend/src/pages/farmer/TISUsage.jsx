/**
 * TISUsage.jsx — TIS daily usage + limit (real data).
 *
 * Reads GET /api/v1/tis/rate-status. Replaces the old ComingSoon stub at /tis/usage.
 */
import { useEffect, useState } from "react";
import { Activity, Zap } from "lucide-react";

const C = {
  cream: "var(--cream)", paper: "var(--paper)", soil: "var(--soil)", soilDk: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)",
  greenTint: "var(--green-tint)", amber: "var(--amber)",
};

function tok() { try { return localStorage.getItem("tfos_access_token") || ""; } catch { return ""; } }

export default function TISUsage() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [d, setD] = useState({ calls_today: 0, limit: 0, calls_remaining: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/tis/rate-status", { headers: { Authorization: `Bearer ${tok()}` } });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!alive) return;
        setD(body?.data || { calls_today: 0, limit: 0, calls_remaining: 0 });
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, []);

  const limit = Number(d.limit) || 0;
  const used = Number(d.calls_today) || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const low = limit > 0 && d.calls_remaining <= Math.max(1, Math.round(limit * 0.1));

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.soilDk, margin: 0 }}>TIS Usage</h1>
        <p style={{ fontSize: 13, color: C.soil, margin: "4px 0 0" }}>Your TIS questions today, against your plan's daily limit.</p>
      </div>

      {state === "loading" && <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>}
      {state === "error" && <p style={{ color: C.muted, fontSize: 14 }}>Couldn't load your usage right now. Please try again in a moment.</p>}

      {state === "ready" && (
        <>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: C.soil, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Activity size={15} color={C.green} /> Today's questions
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.soilDk }}>{used} / {limit || "—"}</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: C.cream, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: low ? C.amber : C.green, transition: "width .3s ease" }} />
            </div>
            <p style={{ fontSize: 12.5, color: low ? C.amber : C.muted, marginTop: 10 }}>
              {limit > 0 ? `${d.calls_remaining} question${d.calls_remaining === 1 ? "" : "s"} left today` : "Unlimited on your current plan"}
            </p>
          </div>

          <div style={{ background: C.greenTint, border: `1px solid ${C.green}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Zap size={18} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: C.soil, lineHeight: 1.5, margin: 0 }}>
              Your daily limit resets each day. Need more? Upgrade your plan for a higher TIS allowance.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

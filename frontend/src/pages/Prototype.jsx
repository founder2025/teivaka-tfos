/**
 * Prototype.jsx — /prototype
 *
 * Founder/admin-only viewer for the canonical design prototype (the sacred
 * v263 HTML, MBI Part 36). It is a DESIGN REFERENCE with mock data — not the
 * live platform. We fetch it from GET /api/v1/prototype with the bearer token
 * (the endpoint is gated by require_admin, so there is no public static path)
 * and render it as a real blob: document.
 *
 * Why blob: (not srcDoc): srcDoc iframes ignore the inner viewport meta on iOS
 * Safari, so the responsive prototype fell back to 980px desktop width on
 * phones; a 4.2 MB srcDoc string is also heavy on mobile. A blob: document is
 * a real navigation that honors the prototype's own
 * `<meta name=viewport width=device-width>` → true mobile layout. The CSP
 * allows blob: in frame-src; the blob doc inherits the parent CSP
 * ('unsafe-inline'), so the prototype's inline scripts/styles run.
 *
 * A persistent amber banner makes clear this is the prototype, not prod.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authHeader } from "../utils/auth";

const BANNER_H = 30;

export default function Prototype() {
  const navigate = useNavigate();
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let url;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/v1/prototype", { headers: { ...authHeader() } });
        if (!r.ok) {
          throw new Error(
            r.status === 403
              ? "This reference is founder/admin only."
              : r.status === 404
              ? "Prototype isn't bundled in this build yet."
              : `Couldn't load the prototype (${r.status}).`
          );
        }
        const blob = await r.blob();
        url = URL.createObjectURL(new Blob([blob], { type: "text/html" }));
        if (alive) setSrc(url);
      } catch (e) {
        if (alive) setErr(e.message || "Couldn't load the prototype.");
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []);

  if (err) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#3A2E26" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Prototype reference</h1>
        <p style={{ color: "var(--muted)" }}>{err}</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--cream)" }}>
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: BANNER_H,
          display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
          background: "var(--amber)", color: "#fff", fontSize: 12, fontWeight: 700,
          fontFamily: "system-ui", zIndex: 10, justifyContent: "space-between",
        }}
      >
        <span>PROTOTYPE — design reference (mock data, not live). Founder/admin only.</span>
        <button
          onClick={() => navigate("/home")}
          title="Leave the prototype and use the live app (real data, real login)"
          style={{
            background: "var(--paper)", color: "var(--soil)", border: 0, borderRadius: 6,
            padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Switch to live app →
        </button>
      </div>
      {src == null ? (
        <div style={{ position: "absolute", top: BANNER_H, left: 0, right: 0,
          padding: 24, color: "var(--muted)", fontFamily: "system-ui" }}>
          Loading prototype…
        </div>
      ) : (
        <iframe
          title="TFOS Prototype v263"
          src={src}
          allow="fullscreen"
          style={{
            position: "absolute", top: BANNER_H, left: 0,
            width: "100%", height: `calc(100% - ${BANNER_H}px)`, border: 0,
          }}
        />
      )}
    </div>
  );
}

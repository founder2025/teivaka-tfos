/**
 * Prototype.jsx — /prototype
 *
 * Founder/admin-only viewer for the canonical design prototype (the sacred
 * v263 HTML, MBI Part 36). It is a DESIGN REFERENCE with mock data — not the
 * live platform. We fetch it from GET /api/v1/prototype with the bearer token
 * (the endpoint is gated by require_admin, so there is no public static path)
 * and render it via an iframe `srcDoc`.
 *
 * Why srcDoc (not a blob: URL): the production CSP has no frame-src, so it
 * falls back to default-src 'self' and blocks blob: frames. srcDoc has no URL
 * to fetch, so frame-src doesn't apply; the inlined document inherits the
 * parent CSP, which already allows 'unsafe-inline' scripts/styles — exactly
 * what the self-contained prototype uses.
 *
 * A persistent amber banner makes clear this is the prototype, not prod.
 */
import { useEffect, useState } from "react";
import { authHeader } from "../utils/auth";

const BANNER_H = 30;

export default function Prototype() {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
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
        const text = await r.text();
        if (alive) setHtml(text);
      } catch (e) {
        if (alive) setErr(e.message || "Couldn't load the prototype.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#3A2E26" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Prototype reference</h1>
        <p style={{ color: "#8A7863" }}>{err}</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#F8F3E9" }}>
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: BANNER_H,
          display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
          background: "#BF9000", color: "#fff", fontSize: 12, fontWeight: 700,
          fontFamily: "system-ui", zIndex: 10,
        }}
      >
        PROTOTYPE — design reference (mock data, not live). Founder/admin only.
      </div>
      {html == null ? (
        <div style={{ position: "absolute", top: BANNER_H, left: 0, right: 0,
          padding: 24, color: "#8A7863", fontFamily: "system-ui" }}>
          Loading prototype…
        </div>
      ) : (
        <iframe
          title="TFOS Prototype v263"
          srcDoc={html}
          style={{
            position: "absolute", top: BANNER_H, left: 0,
            width: "100%", height: `calc(100% - ${BANNER_H}px)`, border: 0,
          }}
        />
      )}
    </div>
  );
}

/**
 * Landing.jsx — Teivaka public landing page
 *
 * The visual surface is the approved L3 design, embedded verbatim so it is
 * pixel-exact (zero translation risk). All production wiring below
 * (auth redirect, UTM/referral capture, LANDING_VIEW attribution) is
 * preserved EXACTLY from the prior Landing.jsx — do not alter it.
 *
 * Login/registration are NOT in this file. The embedded page posts a
 * nav message; React Router performs the navigation to /login or /register.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated } from "../utils/auth";
import L3_HTML from "./Landing.l3.html?raw";

export default function Landing() {
  const navigate = useNavigate();
  const frameRef = useRef(null);

  // ── PRESERVED: authed users skip the landing ──────────────────────────
  useEffect(() => {
    if (isAuthenticated()) navigate("/home", { replace: true });
  }, [navigate]);

  // ── PRESERVED: UTM / referral capture into sessionStorage ─────────────
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const keys = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "campaign"];
      keys.forEach((k) => {
        const v = params.get(k);
        if (v) sessionStorage.setItem(`teivaka_${k}`, v);
      });
    } catch (e) {}
  }, []);

  // ── PRESERVED: LANDING_VIEW attribution (fire-and-forget) ─────────────
  useEffect(() => {
    try {
      let anon = localStorage.getItem("teivaka_anon_id");
      if (!anon) {
        anon = (crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("teivaka_anon_id", anon);
      }
      const params = new URLSearchParams(window.location.search);
      const body = {
        anonymous_id: anon,
        source: params.get("ref") ? "REFERRAL" : (params.get("utm_source") ? "SOCIAL" : null),
        campaign: params.get("campaign"),
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        utm_content: params.get("utm_content"),
        referral_code: params.get("ref"),
        metadata: { url: window.location.href, referrer: document.referrer },
      };
      fetch("/api/v1/attribution/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch (e) {}
  }, []);

  // ── Embedded L3 page asks the app to navigate (keeps routing in React) ─
  useEffect(() => {
    function onMsg(e) {
      const d = e && e.data;
      if (d && d.tv === "nav" && typeof d.to === "string") {
        const ALLOWED = ["/login","/register","/","/about","/what-we-do","/team","/partner","/contact","/tis-public","/tfos","/our-farms","/farms"];
        if (ALLOWED.includes(d.to)) navigate(d.to);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate]);

  return (
    <iframe
      ref={frameRef}
      title="Teivaka"
      srcDoc={L3_HTML}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        margin: 0,
        padding: 0,
        display: "block",
      }}
    />
  );
}

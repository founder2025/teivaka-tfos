/**
 * Landing.jsx — Teivaka public landing page (compact ship-ready version)
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAuthenticated } from "../utils/auth";

const C = {
  soil: "#2C1A0E",
  soilDeep: "#1A0F08",
  green: "#3D8C40",
  greenDeep: "#2E6B30",
  cream: "#F5EFE0",
  creamWarm: "#EFE6D0",
  gold: "#D4A017",
  ink: "#1A1410",
};

const FEATURES = [
  { glyph: "◐", title: "Know what to plant, when, and where.", body: "Plan your planting cycles, track every growth stage, and log harvests against the land — before the season decides for you." },
  { glyph: "✦", title: "An AI agronomist in your pocket.", body: "Ask Teivaka Intelligence anything — pest, disease, fertiliser, timing. Answers trained on Pacific crops." },
  { glyph: "◈", title: "Run your farm from WhatsApp.", body: "Log field data, get alerts, and talk to your advisor without leaving the app you already use every day." },
  { glyph: "❂", title: "See exactly what every crop earns.", body: "Income, expenses, and profit share per crop, per block, per season. Stop guessing whether you made money — know." },
  { glyph: "⬡", title: "Manage your team without the chaos.", body: "Assign tasks, track worker hours, and keep your whole team on one page. From the garden, from town, from anywhere." },
  { glyph: "✧", title: "A community of Pacific farmers.", body: "Share what works, learn from farmers in your region, and reach buyers through the Teivaka marketplace." },
];

const STEPS = [
  { n: "01", title: "Create your account", body: "30 seconds. Your email — that's it. No forms, no paperwork." },
  { n: "02", title: "Add your farm & crops", body: "Tell Teivaka what you grow, how much land you work, and where you plant." },
  { n: "03", title: "Start managing", body: "Log tasks, track harvests, ask your AI advisor — from your phone, in the field." },
];

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) navigate("/home", { replace: true });
  }, [navigate]);

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

  // Fire attribution LANDING_VIEW (fire-and-forget; never blocks render).
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

  return (
    <div className="tv-landing">
      <nav className="tv-nav">
        <Link to="/" className="tv-wordmark">Teivaka<span className="tv-dot">.</span></Link>
        <div className="tv-nav-links">
          <a href="#platform">Platform</a>
          <a href="#how">How it works</a>
          <a href="#story">Our story</a>
          <Link to="/login" className="tv-nav-cta">Sign In</Link>
        </div>
      </nav>

      <section className="tv-hero">
        <div className="tv-hero-bg" aria-hidden="true" />
        <div className="tv-hero-grid">
          <div className="tv-hero-copy">
            <div className="tv-eyebrow"><span className="tv-rule" /> GENERATE WEALTH FROM IDLE LANDS</div>
            <h1 className="tv-h1">The operating system for <em>Pacific Island</em> farming.</h1>
            <p className="tv-lead">Plan your crops, run your team, track every dollar, and talk to an AI agronomist trained on Pacific soils — all from one platform, built in Fiji, for the Pacific.</p>
            <div className="tv-cta-row">
              <Link to="/register" className="tv-btn-primary">Start for Free →</Link>
              <Link to="/login" className="tv-btn-ghost">Sign In</Link>
            </div>
            <p className="tv-reassure">Free forever for your first farm. No credit card. 14-day BASIC trial when you sign up.</p>
          </div>
          <div className="tv-hero-art" aria-hidden="true">
            <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F7DE97" />
                  <stop offset="100%" stopColor="#F5EFE0" />
                </linearGradient>
                <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3D8C40" />
                  <stop offset="100%" stopColor="#2E6B30" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="400" height="320" fill="url(#sky)" />
              <circle cx="310" cy="90" r="34" fill="#F3C44A" opacity="0.85" />
              <path d="M 0 200 Q 100 140 200 180 T 400 170 L 400 320 L 0 320 Z" fill="#5A8B5D" opacity="0.85" />
              <path d="M 0 240 Q 80 200 180 225 Q 280 250 400 220 L 400 320 L 0 320 Z" fill="url(#hill)" />
              <g transform="translate(70 180)">
                <rect x="-4" y="0" width="8" height="100" rx="2" fill="#5C3A1F" />
                <g stroke="#2E6B30" strokeWidth="4" strokeLinecap="round" fill="none">
                  <path d="M 0 0 q -30 -12 -55 -28" />
                  <path d="M 0 0 q -22 -30 -32 -60" />
                  <path d="M 0 0 q 18 -30 30 -60" />
                  <path d="M 0 0 q 30 -12 55 -24" />
                </g>
              </g>
            </svg>
            <aside className="tv-stat-card">
              <p className="tv-stat-label">THIS SEASON</p>
              <p className="tv-stat-value">FJD 12,480</p>
              <p className="tv-stat-sub">↑ Taro, Block F-003</p>
            </aside>
          </div>
        </div>
      </section>

      <section className="tv-proof">
        <p className="tv-proof-intro">Built and battle-tested on working Teivaka farms —</p>
        <ul className="tv-proof-stats">
          <li><span className="tv-proof-num">117</span><span>acres under management</span></li>
          <li><span className="tv-proof-num">2</span><span>active sites: Serua &amp; Kadavu</span></li>
          <li><span className="tv-proof-num">100%</span><span>Pacific-built, Pacific-owned</span></li>
        </ul>
      </section>

      <section className="tv-features" id="platform">
        <div className="tv-features-head">
          <p className="tv-eyebrow tv-eyebrow-dark"><span className="tv-rule" /> THE PLATFORM</p>
          <h2 className="tv-h2">Everything your farm needs.<br /><em>Nothing it doesn't.</em></h2>
          <p className="tv-section-lead">Most farm software is built for industrial operations in temperate climates, then translated. Teivaka was built the other way around — from the ground up, on Pacific soil.</p>
        </div>
        <div className="tv-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="tv-feature">
              <div className="tv-feature-glyph">{f.glyph}</div>
              <h3 className="tv-feature-title">{f.title}</h3>
              <p className="tv-feature-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tv-how" id="how">
        <div className="tv-how-inner">
          <p className="tv-eyebrow tv-eyebrow-gold"><span className="tv-rule tv-rule-gold" /> GETTING STARTED</p>
          <h2 className="tv-h2 tv-h2-light">From first login<br />to <em>first harvest logged</em> — in minutes.</h2>
          <div className="tv-steps-grid">
            {STEPS.map((s) => (
              <div key={s.n} className="tv-step">
                <div className="tv-step-num">{s.n}</div>
                <h3 className="tv-step-title">{s.title}</h3>
                <p className="tv-step-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tv-note" id="story">
        <div className="tv-note-inner">
          <div className="tv-note-portrait"><span>PHOTO</span></div>
          <blockquote className="tv-note-quote">
            <span className="tv-quote-mark">&ldquo;</span>
            <p>I left a physics degree to come back to Kadavu and farm. What I found was that the tools we needed didn't exist — so I built them. Teivaka is the operating system I wished I had on day one, now running on my own two farms before it runs on yours.</p>
            <cite><strong>Uraia Koroi Kama (Cody)</strong><span>Founder, Teivaka — Kadavu, Fiji</span></cite>
          </blockquote>
        </div>
      </section>

      <section className="tv-final">
        <div className="tv-final-inner">
          <h2 className="tv-h2 tv-h2-light tv-final-h2">Ready to transform<br /><em>your farm?</em></h2>
          <p className="tv-final-body">Join farmers across the Pacific building a more profitable, more connected future — one season at a time.</p>
          <Link to="/register" className="tv-btn-primary tv-btn-large">Create Your Free Account →</Link>
          <p className="tv-final-reassure">No credit card required. 14-day BASIC trial when you sign up.</p>
          <div className="tv-partner">
            <p className="tv-partner-label"><span className="tv-rule tv-rule-gold" /> FOR INVESTORS, NGOS, AND PARTNERS</p>
            <p className="tv-partner-body">Building Pacific agriculture takes more than software. If you want to help us bring Teivaka to farmers across the region, we'd like to talk.</p>
            <a href="mailto:partners@teivaka.com" className="tv-partner-mail">partners@teivaka.com</a>
          </div>
        </div>
      </section>

      <footer className="tv-footer">
        <div className="tv-footer-inner">
          <div className="tv-footer-left">
            <p className="tv-footer-wordmark">Teivaka<span>.</span></p>
            <p className="tv-footer-tagline">Built for the Pacific, by the Pacific.</p>
          </div>
          <div className="tv-footer-right">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:hello@teivaka.com">Contact</a>
          </div>
        </div>
        <p className="tv-footer-bottom">© 2026 Teivaka PTE LTD (Reg. 2025RC001894). Suva, Fiji.</p>
      </footer>

      <style>{LANDING_CSS}</style>
    </div>
  );
}

const LANDING_CSS = `
.tv-landing { font-family: 'Lora', Georgia, serif; color: ${C.ink}; background: ${C.cream}; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.tv-landing *, .tv-landing *::before, .tv-landing *::after { box-sizing: border-box; }
.tv-landing a { color: inherit; text-decoration: none; }
.tv-landing ul { list-style: none; margin: 0; padding: 0; }
.tv-nav { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: 28px 48px; }
.tv-wordmark { font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 600; color: ${C.soil}; letter-spacing: -0.02em; }
.tv-dot { color: ${C.green}; }
.tv-nav-links { display: flex; align-items: center; gap: 28px; }
.tv-nav-links a { font-size: 15px; color: ${C.soil}; }
.tv-nav-cta { border: 1.5px solid ${C.soil}; padding: 8px 18px; border-radius: 999px; font-size: 14px; transition: background 180ms, color 180ms; }
.tv-nav-cta:hover { background: ${C.soil}; color: ${C.cream}; }
.tv-hero { position: relative; min-height: 100vh; padding: 120px 48px 80px; overflow: hidden; }
.tv-hero-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 50% at 80% 30%, rgba(212,160,23,0.06), transparent 70%), radial-gradient(ellipse 65% 55% at 20% 70%, rgba(61,140,64,0.08), transparent 70%), ${C.cream}; }
.tv-hero-grid { position: relative; display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: center; max-width: 1280px; margin: 0 auto; }
.tv-hero-copy { padding-top: 20px; }
.tv-eyebrow { display: flex; align-items: center; gap: 12px; font-size: 12px; letter-spacing: 0.25em; font-weight: 600; text-transform: uppercase; color: ${C.greenDeep}; margin-bottom: 24px; }
.tv-eyebrow-dark { color: ${C.soil}; }
.tv-eyebrow-gold { color: ${C.gold}; }
.tv-rule { display: inline-block; width: 32px; height: 1.5px; background: currentColor; }
.tv-h1 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(40px, 6vw, 68px); line-height: 1.05; margin: 0 0 24px; color: ${C.soil}; font-weight: 600; }
.tv-h1 em { font-style: italic; color: ${C.green}; }
.tv-lead { font-size: 18px; color: ${C.ink}; opacity: 0.82; max-width: 520px; margin: 0 0 28px; }
.tv-cta-row { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.tv-btn-primary { background: ${C.green}; color: ${C.cream}; padding: 14px 28px; border-radius: 999px; font-size: 16px; font-weight: 600; font-family: 'Lora', serif; transition: background 180ms, transform 180ms; }
.tv-btn-primary:hover { background: ${C.greenDeep}; transform: translateY(-1px); }
.tv-btn-large { padding: 18px 36px; font-size: 17px; }
.tv-btn-ghost { color: ${C.soil}; padding: 14px 24px; font-size: 15px; border-bottom: 1.5px solid transparent; transition: border-color 180ms; }
.tv-btn-ghost:hover { border-color: ${C.soil}; }
.tv-reassure { font-size: 13px; color: ${C.ink}; opacity: 0.55; margin: 0; }
.tv-hero-art { position: relative; }
.tv-hero-art svg { width: 100%; height: auto; border-radius: 12px; box-shadow: 0 40px 80px rgba(44,26,14,0.18); }
.tv-stat-card { position: absolute; bottom: -20px; left: -20px; background: white; padding: 18px 22px; border-radius: 10px; box-shadow: 0 12px 32px rgba(44,26,14,0.14); border-left: 3px solid ${C.gold}; }
.tv-stat-label { font-size: 11px; letter-spacing: 0.2em; color: ${C.ink}; opacity: 0.55; margin: 0 0 4px; font-weight: 600; }
.tv-stat-value { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; margin: 0 0 4px; color: ${C.soil}; }
.tv-stat-sub { font-size: 13px; color: ${C.green}; margin: 0; }
.tv-proof { background: ${C.creamWarm}; padding: 56px 48px; border-top: 1px solid rgba(44,26,14,0.08); border-bottom: 1px solid rgba(44,26,14,0.08); }
.tv-proof-intro { text-align: center; font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; color: ${C.soil}; opacity: 0.7; margin: 0 0 28px; }
.tv-proof-stats { display: flex; justify-content: center; gap: 72px; flex-wrap: wrap; }
.tv-proof-stats li { text-align: center; }
.tv-proof-num { display: block; font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 700; color: ${C.green}; }
.tv-proof-stats li span:last-child { font-size: 14px; color: ${C.soil}; opacity: 0.75; }
.tv-features { padding: 120px 48px; max-width: 1280px; margin: 0 auto; }
.tv-features-head { max-width: 720px; margin: 0 auto 72px; text-align: center; }
.tv-features-head .tv-eyebrow { justify-content: center; }
.tv-h2 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(32px, 4vw, 52px); line-height: 1.1; margin: 0 0 24px; color: ${C.soil}; font-weight: 600; }
.tv-h2 em { font-style: italic; color: ${C.green}; }
.tv-h2-light { color: ${C.cream}; }
.tv-section-lead { font-size: 17px; color: ${C.ink}; opacity: 0.78; }
.tv-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 36px; }
.tv-feature { padding: 32px; background: white; border-radius: 12px; border-top: 2px solid ${C.green}; box-shadow: 0 4px 20px rgba(44,26,14,0.04); }
.tv-feature-glyph { font-size: 28px; color: ${C.gold}; margin-bottom: 14px; }
.tv-feature-title { font-family: 'Playfair Display', serif; font-size: 22px; margin: 0 0 12px; color: ${C.soil}; line-height: 1.25; font-weight: 600; }
.tv-feature-body { font-size: 15px; color: ${C.ink}; opacity: 0.78; margin: 0; }
.tv-how { position: relative; padding: 120px 48px; background: ${C.soil}; color: ${C.cream}; overflow: hidden; }
.tv-how::before { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse 40% 35% at 80% 20%, rgba(212,160,23,0.08), transparent 70%); }
.tv-how-inner { position: relative; max-width: 1280px; margin: 0 auto; text-align: center; }
.tv-how-inner .tv-eyebrow { justify-content: center; }
.tv-steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 48px; margin-top: 56px; text-align: left; }
.tv-step { padding: 24px; border-left: 3px solid ${C.gold}; }
.tv-step-num { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 700; color: ${C.gold}; opacity: 0.9; line-height: 1; margin-bottom: 16px; }
.tv-step-title { font-family: 'Playfair Display', serif; font-size: 22px; margin: 0 0 12px; color: ${C.cream}; font-weight: 600; }
.tv-step-body { font-size: 15px; color: ${C.cream}; opacity: 0.78; margin: 0; }
.tv-note { padding: 120px 48px; background: ${C.creamWarm}; }
.tv-note-inner { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 200px 1fr; gap: 56px; align-items: center; }
.tv-note-portrait { aspect-ratio: 1; background: linear-gradient(135deg, ${C.green}, ${C.soil}); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${C.cream}; font-size: 12px; letter-spacing: 0.2em; font-weight: 600; }
.tv-note-quote { margin: 0; position: relative; }
.tv-quote-mark { position: absolute; top: -32px; left: -12px; font-family: 'Playfair Display', serif; font-size: 90px; color: ${C.gold}; opacity: 0.4; line-height: 1; }
.tv-note-quote p { font-family: 'Playfair Display', serif; font-size: 22px; line-height: 1.5; color: ${C.soil}; margin: 0 0 20px; font-style: italic; }
.tv-note-quote cite { font-style: normal; display: flex; flex-direction: column; gap: 4px; }
.tv-note-quote cite strong { font-size: 16px; color: ${C.soil}; }
.tv-note-quote cite span { font-size: 13px; color: ${C.ink}; opacity: 0.65; }
.tv-final { padding: 140px 48px; background: ${C.soil}; color: ${C.cream}; text-align: center; position: relative; overflow: hidden; }
.tv-final::before { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse 50% 40% at 50% 50%, rgba(61,140,64,0.15), transparent 70%); }
.tv-final-inner { position: relative; max-width: 760px; margin: 0 auto; }
.tv-final-h2 { margin-bottom: 28px; }
.tv-final-body { font-size: 18px; color: ${C.cream}; opacity: 0.82; margin: 0 0 40px; }
.tv-final-reassure { font-size: 13px; color: ${C.cream}; opacity: 0.55; margin: 20px 0 0; }
.tv-partner { margin-top: 80px; padding-top: 56px; border-top: 1px solid rgba(245,239,224,0.12); }
.tv-partner-label { justify-content: center; display: flex; align-items: center; gap: 12px; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: ${C.gold}; margin: 0 0 20px; }
.tv-partner-body { font-size: 15px; color: ${C.cream}; opacity: 0.7; margin: 0 auto 16px; max-width: 540px; }
.tv-partner-mail { color: ${C.gold}; font-size: 16px; border-bottom: 1px solid ${C.gold}; padding-bottom: 2px; }
.tv-footer { background: ${C.soilDeep}; color: ${C.cream}; padding: 56px 48px 32px; }
.tv-footer-inner { display: flex; justify-content: space-between; align-items: center; max-width: 1280px; margin: 0 auto 40px; flex-wrap: wrap; gap: 24px; }
.tv-footer-wordmark { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 600; margin: 0 0 4px; }
.tv-footer-wordmark span { color: ${C.green}; }
.tv-footer-tagline { font-size: 13px; opacity: 0.6; margin: 0; }
.tv-footer-right { display: flex; gap: 28px; font-size: 14px; }
.tv-footer-right a { opacity: 0.75; transition: opacity 180ms; }
.tv-footer-right a:hover { opacity: 1; }
.tv-footer-bottom { text-align: center; font-size: 12px; opacity: 0.4; margin: 0; }
@media (max-width: 900px) {
  .tv-nav { padding: 20px 24px; }
  .tv-nav-links { gap: 16px; }
  .tv-nav-links a:not(.tv-nav-cta) { display: none; }
  .tv-hero { padding: 100px 24px 60px; }
  .tv-hero-grid { grid-template-columns: 1fr; }
  .tv-hero-art { order: -1; }
  .tv-features, .tv-how, .tv-note, .tv-final { padding: 80px 24px; }
  .tv-note-inner { grid-template-columns: 1fr; text-align: center; }
  .tv-note-portrait { width: 160px; margin: 0 auto; }
  .tv-quote-mark { display: none; }
  .tv-proof-stats { gap: 32px; }
}
`;

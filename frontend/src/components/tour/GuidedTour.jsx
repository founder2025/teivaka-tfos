/**
 * GuidedTour — reusable first-visit tour engine (built once, used by every
 * Farm-pillar destination).
 *
 * - Auto-runs once on first visit (per user, per tour, server-side via
 *   GET /me/tours → POST /me/tours/{key}/seen), follows the farmer across
 *   devices. Skippable; never repeats once seen.
 * - Low-literacy: big icon, one short sentence per card, progress dots,
 *   Back / Next / Skip. Optional spotlight ring around a real element
 *   (data-tour="<id>") — gracefully centers if the element isn't found.
 * - The final step can fire an action (e.g. open the +) via step.action.
 * - <TourReplayButton tourKey> re-runs it any time.
 *
 * Usage:
 *   const tour = useTour("farm.overview");
 *   <GuidedTour tour={tour} steps={STEPS} />
 *   {tour.ready && <TourReplayButton onReplay={tour.replay} />}
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X, Check, RotateCcw } from "lucide-react";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }

export function useTour(tourKey) {
  const [seen, setSeen] = useState(null); // null = unknown
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/v1/me/tours", { headers: authHeaders() });
        const b = r.ok ? await r.json() : { data: { seen: [] } };
        const list = b?.data?.seen || [];
        if (!alive) return;
        const hasSeen = list.includes(tourKey);
        setSeen(hasSeen);
        if (!hasSeen) setOpen(true); // auto-run on first visit
      } catch { if (alive) setSeen(true); /* fail closed: don't nag on error */ }
    })();
    return () => { alive = false; };
  }, [tourKey]);

  const markSeen = useCallback(async () => {
    setOpen(false); setSeen(true);
    try { await fetch(`/api/v1/me/tours/${encodeURIComponent(tourKey)}/seen`, { method: "POST", headers: authHeaders() }); } catch { /* best-effort */ }
  }, [tourKey]);

  const replay = useCallback(() => { setOpen(true); }, []);

  return { tourKey, open, ready: seen !== null, markSeen, replay, setOpen };
}

function Spotlight({ selector }) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${selector}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [selector]);
  if (!rect) return null;
  return (
    <div style={{ position: "fixed", ...rect, border: "3px solid var(--green)", borderRadius: 12,
      boxShadow: "0 0 0 9999px rgba(44,26,14,0.55)", zIndex: 10000, pointerEvents: "none", transition: "all .25s" }} />
  );
}

export function GuidedTour({ tour, steps }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (tour.open) setI(0); }, [tour.open]);
  if (!tour.open || !steps?.length) return null;
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863" };
  const Icon = step.Icon;

  const finish = () => { const act = step.action; tour.markSeen(); if (act) setTimeout(act, 250); };

  return (
    <>
      {step.spotlight ? <Spotlight selector={step.spotlight} />
        : <div style={{ position: "fixed", inset: 0, background: "rgba(44,26,14,0.55)", zIndex: 9999 }} />}
      <div role="dialog" aria-modal="true" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", width: "min(420px, calc(100vw - 28px))", zIndex: 10001 }}>
        <div style={{ background: "var(--paper)", border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: "0 12px 40px rgba(44,26,14,0.28)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: C.cream, color: C.greenDk, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {Icon ? <Icon size={24} strokeWidth={1.7} /> : <Check size={24} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.soil }}>{step.title}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{step.body}</div>
            </div>
            <button onClick={tour.markSeen} aria-label="Skip" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 4, alignSelf: "flex-start" }}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {steps.map((_, n) => <span key={n} style={{ width: n === i ? 18 : 7, height: 7, borderRadius: 4, background: n === i ? C.green : C.border, transition: "all .2s" }} />)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {i > 0 && <button onClick={() => setI(i - 1)} style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} />Back</button>}
              {last
                ? <button onClick={finish} style={{ background: C.green, border: "none", color: "#fff", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{step.actionLabel || "Done"}<ArrowRight size={14} /></button>
                : <button onClick={() => setI(i + 1)} style={{ background: C.green, border: "none", color: "#fff", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>Next<ArrowRight size={14} /></button>}
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button onClick={tour.markSeen} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>Skip the tour</button>
          </div>
        </div>
      </div>
    </>
  );
}

export function TourReplayButton({ onReplay, label = "Replay tour" }) {
  return (
    <button onClick={onReplay} title={label}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #E6DED0", color: "#8A7863", borderRadius: 9, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
      <RotateCcw size={13} />{label}
    </button>
  );
}

/**
 * FarmerShell.jsx — Nav v2.1 + v2.2 structural shell.
 *
 * v2.2 overrides (2026-04-25):
 *   - LeftRail is hidden by default; opens via hamburger in TopAppBar.
 *   - Main content margin-left tracks rail state on desktop only.
 *     On mobile the rail overlays content (margin stays 0).
 *
 * Day 3b-TIS commit #2 (2026-04-25):
 *   - Global TIS FAB toggles a bottom-right side-panel chat widget
 *     (TisChatPanel). FAB no longer navigates. Panel state (open flag,
 *     messages, in-flight fetch) lives here so it survives route changes
 *     within the authenticated shell. Panel + FAB both hide on /tis*.
 *
 * Dispensation: Nav v2.1 Addendum §8 + §280 supersedes Part 23 Rule 28 for
 * shell structural edits. Filename preserved; internals rewritten in place.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Plus, Sparkles, HelpCircle } from "lucide-react";
import { useMe } from "../hooks/useMe";
import { navPillarKeys } from "../utils/personas";

import TopAppBar from "../components/nav/TopAppBar";
import BottomNav from "../components/nav/BottomNav";
import LeftRail from "../components/nav/LeftRail";
import PillarSubNavStrip from "../components/nav/PillarSubNavStrip";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { useUniversalLogShortcut } from "../components/nav/UniversalLogButton";
import TisChatPanel from "../components/tis/TisChatPanel";
import Toast from "../components/ui/Toast";
import ChatWidget from "../components/chat/ChatWidget";
import { ChatProvider } from "../context/ChatContext";
import { firePings, AnnouncementBanner } from "../utils/useFlags.jsx";
import LogSheet from "../components/launcher/LogSheet";
import { LeftRailProvider, useLeftRail } from "../context/LeftRailContext";
import { LauncherProvider, useLauncher } from "../context/LauncherContext";
import { GuidedTour, useTour } from "../components/tour/GuidedTour";
import { FARM_TOURS } from "../config/farmTours";

const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
  red:     "#D4442E",
};

import { tisIdentityBody } from "../utils/tisIdentity";
const TIS_ENDPOINT = import.meta.env.VITE_TIS_ENDPOINT || "/tis/chat";
const TIS_TOKEN = import.meta.env.VITE_TIS_BRIDGE_TOKEN || "";

// Default-wide shell. NARROW is the exception list — for routes whose
// content really needs a form-column width (number/text inputs that look
// silly at 1500px). Everything else inherits the wide content layout that
// matches the locked prototype.
const NARROW_ROUTE_PREFIXES = [
  "/farm/harvest",   // HarvestNew form
  "/onboarding",     // Legacy onboarding wizard + future sub-routes
];
const NARROW_ROUTES_EXACT = new Set([]);



const LAYER_LABEL = {
  1: "Validated KB",
  2: "Fiji Intelligence",
  3: "General agronomy",
};

const TIS_OPENER = {
  role: "assistant",
  isOpener: true,
  content: "Bula Boss. How can I help with the farm today?",
};

function parseReply(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return String(data ?? "");
  return (
    data.text ||
    data.response?.text ||
    data.response?.result?.payloads?.[0]?.text ||
    JSON.stringify(data.response || data)
  );
}

function parseLayer(data) {
  const raw = data?.layer ?? data?.response?.layer;
  if (typeof raw === "number" && LAYER_LABEL[raw]) return LAYER_LABEL[raw];
  if (typeof raw === "string" && raw.trim()) return raw;
  return LAYER_LABEL[2];
}

function useIsDesktop() {
  const get = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1025px)").matches;
  const [desktop, setDesktop] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1025px)");
    const on = () => setDesktop(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

// Farm-pillar-only floating (+) — desktop only. Stacks above the TIS FAB
// (which sits at bottom 24px) so the two don't collide. Larger than TIS FAB
// (64×64 vs 56×56) per spec — signals "primary action on this pillar".
// All triggers (mobile center +, desktop pill (removed Day 4-Phase 2),
// Cmd/Ctrl+L, this Farm-pillar FAB) converge on the same LogSheet via
// LauncherContext. No catalog filtering by trigger — full mode-aware grid.
function FarmPillarLogFab() {
  const location = useLocation();
  const { open: openLauncher } = useLauncher();
  if (!location.pathname.startsWith("/farm")) return null;
  return (
    <button
      type="button"
      onClick={openLauncher}
      aria-label="Log farm activity"
      className="hidden md:flex fixed items-center justify-center transition-transform"
      style={{
        right: 24,
        bottom: 96,
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: C.green,
        color: "#FFFFFF",
        border: "3px solid #F8F3E9",
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        cursor: "pointer",
        zIndex: 40,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.transitionDuration = "150ms";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <Plus size={32} strokeWidth={2.5} />
    </button>
  );
}

function TisFab({ unread, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Close TIS chat" : "Open TIS chat"}
      aria-expanded={active}
      className="hidden md:flex fixed items-center justify-center transition-transform"
      style={{
        right: 24,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: C.green,
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        cursor: "pointer",
        zIndex: 50,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.transitionDuration = "150ms";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <Sparkles size={24} strokeWidth={1.75} />
      {unread && !active && (
        <span
          aria-hidden
          className="absolute"
          style={{
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: C.red,
            border: "2px solid #FFFFFF",
          }}
        />
      )}
    </button>
  );
}

function ShellContent() {
  const location = useLocation();
  const me = useMe();

  // Persona pillar gating: a persona without the Farm pillar (e.g. a banker) that
  // lands on /farm is bounced home — no dead-end (the Farm tab is hidden for them).
  const allowed = me ? navPillarKeys(me.profession || me.account_type) : null;
  if (allowed && location.pathname.startsWith("/farm") && !allowed.includes("farm")) {
    return <Navigate to="/home" replace />;
  }

  const onTisRoute = location.pathname.startsWith("/tis");
  const showFab = !onTisRoute;

  // Per-route shell width. Default WIDE (matches prototype's edge-to-edge
  // content); the NARROW list above is the exception for form-heavy routes.
  const isNarrow =
    NARROW_ROUTES_EXACT.has(location.pathname) ||
    NARROW_ROUTE_PREFIXES.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );
  const widthClass = isNarrow
    ? "max-w-screen-md mx-auto px-4"
    : "max-w-screen-2xl mx-auto px-6 md:px-8";

  // Cmd/Ctrl+L — universal log shortcut (Day 3a: toast; Day 3b: open LogSheet).
  useUniversalLogShortcut();

  const { open: railOpen, width: railWidth, setOpen: setRailOpen } = useLeftRail();
  const desktop = useIsDesktop();
  // <=1024px (phones + tablets): the overlay LeftRail drawer is replaced by an
  // inline horizontal PillarSubNavStrip at the top of the content. Margin only
  // tracks the rail on true desktop, where the rail can actually show.
  const narrow = useIsNarrow(1024);
  const mainMarginLeft = desktop && railOpen ? railWidth : 0;

  // Auto-open the LeftRail on pillar switch (desktop only). Mobile keeps
  // the existing v2.2 auto-CLOSE-on-pathname-change behavior in
  // LeftRailProvider — we no-op here so the two effects don't fight.
  // First mount also triggers because lastPillarRef starts null.
  const lastPillarRef = useRef(null);
  useEffect(() => {
    if (!desktop) return;
    const pillar = location.pathname.split("/")[1] || "home";
    if (lastPillarRef.current !== pillar) {
      lastPillarRef.current = pillar;
      setRailOpen(true);
    }
  }, [desktop, location.pathname, setRailOpen]);

  // TIS side-panel state — lifted so the conversation survives route changes.
  const [tisPanelOpen, setTisPanelOpen] = useState(false);
  const [tisMessages, setTisMessages] = useState([TIS_OPENER]);
  const [tisSending, setTisSending] = useState(false);
  const sendingRef = useRef(false);

  // Placeholder unread flag per Day 3b-TIS spec — hard-coded until Day 4
  // wires it to real advisory / message state.
  const tisUnread = true;

  const handleClose = useCallback(() => setTisPanelOpen(false), []);
  const handleToggle = useCallback(() => setTisPanelOpen((o) => !o), []);
  const handleClear  = useCallback(() => setTisMessages([TIS_OPENER]), []);

  const handleSend = useCallback(async (text) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setTisMessages((m) => [...m, { role: "user", content: text }]);
    setTisSending(true);
    const start = performance.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (TIS_TOKEN) headers.Authorization = `Bearer ${TIS_TOKEN}`;
      const res = await fetch(TIS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          ...tisIdentityBody(),
        }),
      });
      if (!res.ok) throw new Error(`TIS ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const ms = Math.max(1, Math.round(performance.now() - start));
      setTisMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: parseReply(data),
          layer: parseLayer(data),
          responseTimeMs: ms,
        },
      ]);
    } catch (err) {
      const ms = Math.max(1, Math.round(performance.now() - start));
      setTisMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Something broke: ${err.message}`,
          layer: LAYER_LABEL[2],
          responseTimeMs: ms,
        },
      ]);
    } finally {
      setTisSending(false);
      sendingRef.current = false;
    }
  }, []);

  // Auto-close panel when user navigates onto a /tis* route — the full page
  // already serves the chat experience, no need to keep the side-panel up.
  useEffect(() => {
    if (onTisRoute) setTisPanelOpen(false);
  }, [onTisRoute]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: C.cream,
        color: C.soil,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <TopAppBar />
      <LeftRail />
      <div
        className="flex flex-col min-h-[calc(100vh-56px)]"
        style={{
          marginLeft: mainMarginLeft,
          transition: "margin-left 180ms ease",
        }}
      >
        <main className="flex-1 pb-24 md:pb-8">
          <div className={`${widthClass} py-5`}>
            {narrow && <PillarSubNavStrip />}
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      {showFab && (
        <TisFab
          unread={tisUnread}
          active={tisPanelOpen}
          onClick={handleToggle}
        />
      )}
      {!onTisRoute && (
        <TisChatPanel
          open={tisPanelOpen}
          onClose={handleClose}
          onClear={handleClear}
          messages={tisMessages}
          sending={tisSending}
          onSend={handleSend}
        />
      )}
      <FarmPillarLogFab />
      <ChatWidget />
      <LauncherSheet />
      <FarmTourHost />
      <Toast />
    </div>
  );
}

// Route-keyed first-visit tour host — one mount drives every Farm-pillar
// destination's guided tour (config in farmTours.js). ActiveTour only mounts
// when the current route has a tour, so the hooks run only when needed; the
// `key` remounts it per destination so each tour evaluates its own seen-state.
function FarmTourHost() {
  const location = useLocation();
  const cfg = FARM_TOURS[location.pathname];
  if (!cfg) return null;
  return <ActiveTour key={cfg.key} cfg={cfg} />;
}
function ActiveTour({ cfg }) {
  const { open: openLauncher } = useLauncher();
  const tour = useTour(cfg.key);
  const steps = cfg.steps.map((s) => (s.openLauncher ? { ...s, action: () => openLauncher() } : s));
  return (
    <>
      <GuidedTour tour={tour} steps={steps} />
      {/* Global "Show me around" — replays THIS page's tour. One affordance for
          every destination; hidden while the tour is open. */}
      {tour.ready && !tour.open && (
        <button
          type="button"
          onClick={tour.replay}
          aria-label="Show me around this page"
          className="fixed flex items-center gap-1.5"
          style={{
            left: 16, bottom: 84, zIndex: 45,
            background: "#FFFFFF", color: "#5C4033",
            border: "1px solid #E6DED0", borderRadius: 999,
            padding: "7px 12px", fontSize: 12.5, fontWeight: 600,
            boxShadow: "0 3px 10px rgba(44,26,14,0.12)", cursor: "pointer",
          }}
        >
          <HelpCircle size={15} style={{ color: "#3E7B1F" }} />
          Show me around
        </button>
      )}
    </>
  );
}

// LogSheet host — reads launcher state from context. Lives at the shell
// level so the (+) button on every page (mobile center + desktop pill +
// Cmd/Ctrl+L) converges on one sheet instance.
function LauncherSheet() {
  const { sheetOpen, close, mode } = useLauncher();
  return <LogSheet isOpen={sheetOpen} onClose={close} mode={mode} />;
}

export default function FarmerShell() {
  useEffect(() => { firePings(); }, []);
  return (
    <LeftRailProvider>
      <LauncherProvider>
        <ChatProvider>
          <AnnouncementBanner />
          <ShellContent />
        </ChatProvider>
      </LauncherProvider>
    </LeftRailProvider>
  );
}

/**
 * FarmerShell.jsx — Nav v2.1 + v2.2 structural shell.
 *
 * v2.2 overrides (2026-04-25):
 *   - LeftRail is hidden by default; opens via hamburger in TopAppBar.
 *   - Main content margin-left tracks rail state on desktop only.
 *     On mobile the rail overlays content (margin stays 0).
 *
 * Day 3b-TIS (2026-04-25):
 *   - Global TIS FAB inlined here, replacing the modal-based TisFab + TisModal.
 *     FAB navigates to the /tis route (flag: spec said /tis/chat, which is not
 *     a registered route; see report). Hidden on any /tis* path to avoid
 *     duplicating the entry already present there.
 *
 * Dispensation: Nav v2.1 Addendum §8 + §280 supersedes Part 23 Rule 28 for
 * shell structural edits. Filename preserved; internals rewritten in place.
 */
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import TopAppBar from "../components/nav/TopAppBar";
import BottomNav from "../components/nav/BottomNav";
import LeftRail from "../components/nav/LeftRail";
import { useUniversalLogShortcut } from "../components/nav/UniversalLogButton";
import Toast from "../components/ui/Toast";
import { LeftRailProvider, useLeftRail } from "../context/LeftRailContext";

const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
  red:     "#D4442E",
};

function useIsDesktop() {
  const get = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 901px)").matches;
  const [desktop, setDesktop] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 901px)");
    const on = () => setDesktop(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

function TisFab({ unread }) {
  const navigate = useNavigate();
  // Spec: navigate('/tis/chat'). That route is not registered in App.jsx;
  // /tis is the chat page. See Day 3b-TIS report.
  const onClick = () => navigate("/tis");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask TIS"
      className="fixed flex items-center justify-center transition-transform"
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
      {unread && (
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
  const showFab = !location.pathname.startsWith("/tis");

  // Cmd/Ctrl+L — universal log shortcut (Day 3a: toast; Day 3b: open LogSheet).
  // Cmd/Ctrl+K is owned by SearchBar focus per Nav v2.1; TIS opens via the FAB
  // or the /tis route.
  useUniversalLogShortcut();

  const { open: railOpen, width: railWidth } = useLeftRail();
  const desktop = useIsDesktop();
  const mainMarginLeft = desktop && railOpen ? railWidth : 0;

  // Placeholder unread flag per Day 3b-TIS spec — hard-coded true until Day 4
  // wires it to real advisory / message state.
  const tisUnread = true;

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
          <div className="max-w-screen-md mx-auto px-4 py-5">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      {showFab && <TisFab unread={tisUnread} />}
      <Toast />
    </div>
  );
}

export default function FarmerShell() {
  return (
    <LeftRailProvider>
      <ShellContent />
    </LeftRailProvider>
  );
}

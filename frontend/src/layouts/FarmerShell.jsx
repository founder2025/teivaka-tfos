/**
 * FarmerShell.jsx — Nav v2.1 + v2.2 structural shell.
 *
 * v2.2 overrides (2026-04-25):
 *   - LeftRail is hidden by default; opens via hamburger in TopAppBar.
 *   - Main content margin-left tracks rail state on desktop only.
 *     On mobile the rail overlays content (margin stays 0).
 *
 * Dispensation: Nav v2.1 Addendum §8 + §280 supersedes Part 23 Rule 28 for
 * shell structural edits. Filename preserved; internals rewritten in place.
 */
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import TopAppBar from "../components/nav/TopAppBar";
import BottomNav from "../components/nav/BottomNav";
import LeftRail from "../components/nav/LeftRail";
import { useUniversalLogShortcut } from "../components/nav/UniversalLogButton";
import TisFab from "../components/tis/TisFab";
import TisModal from "../components/tis/TisModal";
import Toast from "../components/ui/Toast";
import { LeftRailProvider, useLeftRail } from "../context/LeftRailContext";

const C = {
  soil:  "#5C4033",
  cream: "#F8F3E9",
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

function ShellContent() {
  const [tisOpen, setTisOpen] = useState(false);
  const location = useLocation();
  const hideFab =
    location.pathname === "/tis" || location.pathname.startsWith("/tis/");

  // Cmd/Ctrl+L — universal log shortcut (Day 3a: toast; Day 3b: open LogSheet).
  // Cmd/Ctrl+K is owned by SearchBar focus per Nav v2.1; TIS modal opens via
  // the floating FAB or /tis route.
  useUniversalLogShortcut();

  const { open: railOpen, width: railWidth } = useLeftRail();
  const desktop = useIsDesktop();
  const mainMarginLeft = desktop && railOpen ? railWidth : 0;

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
      {!hideFab && <TisFab onClick={() => setTisOpen(true)} />}
      <TisModal open={tisOpen} onClose={() => setTisOpen(false)} />
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

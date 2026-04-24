/**
 * FarmerShell.jsx — Nav v2.1 structural shell (Day 3a).
 *
 * Layout:
 *   Mobile  (< md):  <TopAppBar /> + <LeftRail /> (breadcrumb + drawer) + <main> + <BottomNav />
 *   Tablet  (md):    <TopAppBar /> + fixed 168px LeftRail + <main>
 *   Desktop (lg+):   <TopAppBar /> + fixed 200px LeftRail + <main>
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

const C = {
  soil:  "#5C4033",
  cream: "#F8F3E9",
};

export default function FarmerShell() {
  const [tisOpen, setTisOpen] = useState(false);
  const location = useLocation();
  const hideFab =
    location.pathname === "/tis" || location.pathname.startsWith("/tis/");

  // Cmd/Ctrl+L — universal log shortcut (Day 3a: toast; Day 3b: open LogSheet).
  useUniversalLogShortcut();

  // Cmd/Ctrl+K — TIS modal (desktop only).
  useEffect(() => {
    function onKey(e) {
      if (typeof window !== "undefined" && window.innerWidth < 768) return;
      const isToggle = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isToggle) return;
      e.preventDefault();
      setTisOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <div className="md:ml-[168px] lg:ml-[200px] flex flex-col min-h-[calc(100vh-56px)]">
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

/**
 * FarmerShell.jsx — new 5-tab responsive shell (MVP Week 1).
 *
 * Mobile  (< md):  <TopAppBar /> + <main> + <BottomNav />
 * Desktop (≥ md):  left sidebar (5 tabs, vertical) + <TopAppBar /> + <main>
 *
 * Used only for new /farm + /farm/harvest/new routes for now. Other farmer pages
 * continue to render through the legacy FarmerLayout until they're migrated.
 *
 * Sub-components MUST stay at module scope (see the SidebarItem below) — defining
 * them inside the parent component function causes focus loss on every keystroke
 * in child <input> elements because React treats each render as a new type.
 */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import TopAppBar from "../components/nav/TopAppBar";
import BottomNav, { FARMER_TABS } from "../components/nav/BottomNav";
import TisFab from "../components/tis/TisFab";
import TisModal from "../components/tis/TisModal";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  cream:  "#F8F3E9",
  border: "#E6DED0",
};

function SidebarItem({ tab }) {
  const { Icon, center } = tab;
  return (
    <NavLink
      to={tab.path}
      end={tab.end}
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
      style={({ isActive }) => ({
        color: isActive ? "#FFFFFF" : C.soil,
        background: isActive ? C.green : "transparent",
      })}
    >
      <Icon size={center ? 22 : 20} />
      <span>{tab.label}</span>
    </NavLink>
  );
}

function Sidebar() {
  return (
    <aside
      className="hidden md:flex fixed top-0 left-0 bottom-0 w-56 flex-col py-4 px-3 z-30"
      style={{
        background: C.cream,
        borderRight: `1px solid ${C.border}`,
      }}
      aria-label="Primary"
    >
      <div className="px-3 pb-4 mb-2 border-b" style={{ borderColor: C.border }}>
        <span
          className="font-bold text-lg tracking-tight"
          style={{ color: C.soil, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
        >
          Teivaka
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {FARMER_TABS.map((t) => <SidebarItem key={t.path} tab={t} />)}
      </nav>
    </aside>
  );
}

export default function FarmerShell() {
  const [tisOpen, setTisOpen] = useState(false);
  const location = useLocation();
  const hideFab = location.pathname === "/tis";

  // Cmd/Ctrl+K toggles the TIS modal — desktop only.
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
      <Sidebar />
      <div className="md:ml-56 flex flex-col min-h-screen">
        <TopAppBar />
        <main className="flex-1 pb-24 md:pb-8">
          <div className="max-w-screen-md mx-auto px-4 py-5">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      {!hideFab && <TisFab onClick={() => setTisOpen(true)} />}
      <TisModal open={tisOpen} onClose={() => setTisOpen(false)} />
    </div>
  );
}

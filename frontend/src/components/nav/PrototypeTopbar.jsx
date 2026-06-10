/**
 * PrototypeTopbar.jsx — the ONE top bar shared by every pillar (Home, Classroom,
 * Farm, TIS), so the app stops looking like "two different places".
 *
 * Renders the sacred prototype's exact <header class="topbar"> chrome (teivaka
 * wordmark + search pill + labelled pillar nav, styled by .tfp/prototype.css) and
 * pairs it with the real RightCluster wiring (auth/me avatar, notifications panel,
 * Me menu, TIS unread). Active pillar is derived from the route so the same
 * component works everywhere.
 *
 * `onMenu` (optional) renders the rail hamburger — passed only by FarmerShell,
 * whose left rail is a collapsible overlay. Home/Classroom have a persistent rail
 * and omit it.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Home, BookOpen, Tractor, Sparkles, Search, Menu } from "lucide-react";
import RightCluster from "./RightCluster";
import "../../styles/prototype.css";

const PILLARS = [
  { id: "home", label: "Home", to: "/home", Icon: Home },
  { id: "classroom", label: "Classroom", to: "/classroom", Icon: BookOpen },
  { id: "farm", label: "Farm", to: "/farm", Icon: Tractor },
  { id: "tis", label: "TIS", to: "/tis", Icon: Sparkles },
];

function activePillar(pathname) {
  if (pathname.startsWith("/classroom")) return "classroom";
  if (pathname.startsWith("/farm") || pathname.startsWith("/solo")) return "farm";
  if (pathname.startsWith("/tis")) return "tis";
  return "home";
}

function emitSearchToast() {
  window.dispatchEvent(new CustomEvent("tfos:toast", {
    detail: { message: "Global search launches in Phase 8. For now, navigate via pillars." },
  }));
}

export default function PrototypeTopbar({ onMenu }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activePillar(pathname);

  return (
    <header className="topbar">
      {onMenu && (
        <button className="icon-btn" aria-label="Toggle navigation" onClick={onMenu}
          style={{ marginRight: 4 }}>
          <Menu size={20} />
        </button>
      )}
      <div className="brand" onClick={() => navigate("/home")} style={{ cursor: "pointer" }}>
        <div className="brand-logo"><img src="/teivaka_logo.png" alt="" style={{ height: 24 }} /></div>
        <div className="brand-text">teivaka</div>
      </div>
      <div className="topbar-search" onClick={emitSearchToast} style={{ cursor: "pointer" }}>
        <Search size={14} /><span>Search farm, tasks, people…</span><span className="search-kbd">⌘K</span>
      </div>
      <div className="topbar-pillars">
        {PILLARS.map((p) => (
          <button key={p.id} className={`pillar-btn ${p.id === active ? "active" : ""}`} onClick={() => navigate(p.to)}>
            <p.Icon size={15} />{p.label}
          </button>
        ))}
      </div>
      <div className="topbar-right">
        <RightCluster />
      </div>
    </header>
  );
}

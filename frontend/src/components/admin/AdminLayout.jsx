/**
 * AdminLayout.jsx — ADMIN COMMAND CENTER shell for all admin pages.
 *
 * Themed to the platform (cream/soil/green, flat lucide icons — no emoji).
 * Nav is organised into the six command sections: Overview · People ·
 * Content · Commerce · Intelligence · Platform. Renders only for
 * FOUNDER/ADMIN; the backend enforces require_admin() on every endpoint —
 * this shell is a UX gate, not the security boundary.
 */

import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Shield, Users, BadgeCheck, CreditCard,
  Flag, GraduationCap, Store, BarChart3, LineChart,
  Settings, Cog, Map as MapIcon, ArrowLeft, Award, Crosshair, Globe, Bug,
  CloudRain, Coins,
} from "lucide-react";
const C = { soil: "#5C4033", cream: "#F8F3E9", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E5DCC9", muted: "#8A8678", gold: "#BF9000" };

/* The six command sections — every admin surface lands in exactly one. */
const SECTIONS = [
  { label: "Overview", items: [
    { path: "/admin", label: "Dashboard", Icon: LayoutDashboard, end: true },
    { path: "/admin/control-room", label: "System Health", Icon: Shield },
  ]},
  { label: "People", items: [
    { path: "/admin/users", label: "Users", Icon: Users },
    { path: "/admin/verifications", label: "Verifications", Icon: BadgeCheck },
    { path: "/admin/requests", label: "Tier requests", Icon: CreditCard },
  ]},
  { label: "Content", items: [
    { path: "/admin/moderation", label: "Moderation", Icon: Flag },
    { path: "/admin/classroom", label: "Classroom", Icon: GraduationCap },
    { path: "/admin/content", label: "Content", Icon: Store },
  ]},
  { label: "Commerce", items: [
    { path: "/me/affiliate/console", label: "Affiliate console", Icon: Award },
  ]},
  { label: "Intelligence", items: [
    { path: "/admin/intelligence", label: "Intelligence", Icon: LineChart },
    { path: "/admin/intelligence/geo", label: "Geographic", Icon: Globe },
    { path: "/admin/intelligence/pests", label: "Pest & Disease", Icon: Bug },
    { path: "/admin/intelligence/weather", label: "Weather", Icon: CloudRain },
    { path: "/admin/intelligence/market", label: "Market", Icon: Coins },
    { path: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
    { path: "/admin/map", label: "Farm Map", Icon: MapIcon },
  ]},
  { label: "Platform", items: [
    { path: "/admin/platform", label: "Platform controls", Icon: Cog },
    { path: "/admin/task-engine", label: "Task Engine", Icon: Settings },
    { path: "/admin/settings", label: "Settings", Icon: Settings },
  ]},
  { label: "Founder", items: [
    { path: "/admin/warroom", label: "War Room", Icon: Crosshair },
  ]},
];

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header style={{ background: C.cream, borderBottom: `1px solid ${C.line}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 48, width: "auto", display: "block" }} />
          <span style={{ fontSize: 11, background: C.gold, color: "#fff", fontWeight: 800, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Admin Command Center
          </span>
        </div>
        <button onClick={() => navigate("/home")}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 700, color: "#fff", border: "none", background: C.green, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>
          <ArrowLeft size={14} /> Back to platform
        </button>
      </header>

      {/* ── Sectioned command nav ───────────────────────────────────────── */}
      <nav style={{ background: C.cream, borderBottom: `1px solid ${C.line}`, padding: "0 16px" }}>
        <div style={{ display: "flex", gap: 18, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {SECTIONS.map((sec) => (
            <div key={sec.label} style={{ display: "flex", flexDirection: "column", paddingTop: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 4px" }}>{sec.label}</span>
              <div style={{ display: "flex", gap: 2 }}>
                {sec.items.map((tab) => (
                  <NavLink key={tab.path} to={tab.path} end={tab.end}
                    style={({ isActive }) => ({
                      display: "flex", alignItems: "center", gap: 6, padding: "10px 10px 12px",
                      fontSize: 13, fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap",
                      color: isActive ? C.greenDk : C.soil, textDecoration: "none",
                      borderBottom: `2px solid ${isActive ? C.green : "transparent"}`,
                    })}>
                    <tab.Icon size={15} strokeWidth={1.75} />
                    {tab.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="p-4 md:p-6 max-w-screen-2xl mx-auto">
        {children}
      </main>
    </div>
  );
}

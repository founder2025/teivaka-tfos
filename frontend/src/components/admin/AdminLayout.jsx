/**
 * AdminLayout.jsx — Shell for all admin pages
 *
 * Contains:
 *   - Top nav with gold "A" admin badge
 *   - Secondary nav with 5 admin-only tabs
 *   - Page content area
 *
 * This component only renders when role = "ADMIN".
 * It is never imported or rendered in farmer sessions.
 */

import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearStoredTokens, getCurrentUser } from "../../utils/auth";

const ADMIN_TABS = [
  { path: "/admin",           label: "Dashboard",        icon: "📊" },
  { path: "/admin/control-room", label: "Control Room",  icon: "🛡️" },
  { path: "/admin/users",     label: "Users",            icon: "👥" },
  { path: "/admin/content",   label: "Content",          icon: "📋" },
  { path: "/admin/analytics", label: "Analytics",        icon: "📈" },
  { path: "/admin/map",       label: "Farm Map",         icon: "🗺️" },
  { path: "/admin/task-engine", label: "Task Engine",    icon: "⚙︎" },
  { path: "/admin/moderation", label: "Moderation",      icon: "🚩" },
  { path: "/admin/verifications", label: "Verifications", icon: "✅" },
  { path: "/admin/classroom", label: "Classroom",     icon: "🎓" },
  { path: "/admin/settings",  label: "Platform Settings", icon: "⚙️"  },
];

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    clearStoredTokens();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[#F8F3E9] text-[#5C4033]">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="bg-[#F8F3E9] border-b border-[#E5DCC9] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 52, width: "auto", display: "block" }} />
          {/* Platform badge */}
          <span className="text-xs bg-amber-500 text-amber-950 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Platform Admin
          </span>
        </div>

        {/* User info + gold A badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-amber-950 font-bold text-sm">
              A
            </div>
            <span className="text-sm text-[#5C4033] hidden sm:block">
              {user?.sub?.slice(0, 8)}…
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-[#5C4033]/70 hover:text-red-400 transition-colors px-2 py-1 rounded border border-[#E5DCC9] hover:border-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Secondary nav (admin tabs) ──────────────────────────────────── */}
      <nav className="bg-[#F8F3E9] border-b border-[#E5DCC9] px-4">
        <div className="flex gap-1 overflow-x-auto">
          {ADMIN_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === "/admin"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-[#5C4033]/70 hover:text-[#5C4033] hover:border-[#E5DCC9]"
                }`
              }
            >
              <span>{tab.icon}</span>
              {tab.label}
            </NavLink>
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

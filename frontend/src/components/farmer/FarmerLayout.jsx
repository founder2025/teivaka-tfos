/**
 * FarmerLayout.jsx — Shell for all farmer-facing pages
 *
 * Contains:
 *   - Fixed top nav (logo, search, messages, notifications, user dropdown)
 *   - Sticky secondary tab nav (9 tabs with green active indicator)
 *   - Page content slot
 *
 * Design system:
 *   Primary dark:    var(--soil)  (deep soil brown)
 *   Primary accent:  var(--green)  (Teivaka green)
 *   Background:      var(--cream)  (warm cream)
 *   Gold:            var(--amber)
 *   Fonts:           Playfair Display / Lora (loaded via index.html Google Fonts link)
 */

import { useState, useRef, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { logout, getCurrentUser } from "../../utils/auth";
import TISWidget from "../TISWidget";

const TABS = [
  { path: "/home",            label: "Community"      },
  { path: "/kb",                   label: "Knowledge Base" },
  { path: "/classroom",            label: "Classroom"      },
  { path: "/farm",                 label: "Farm Manager"   },
  { path: "/harvest",              label: "Log Harvest"    },
  { path: "/tis",                  label: "AI Assistant"   },
  { path: "/calendar",             label: "Calendar"       },
  { path: "/members",              label: "Members"        },
  { path: "/farm/locations",       label: "Map"            },
  { path: "/leaderboard",          label: "Leaderboard"    },
];

// Brand colours as CSS custom properties (Tailwind base doesn't have these)
const C = {
  soil:   "var(--soil)",
  green:  "var(--green)",
  cream:  "var(--cream)",
  gold:   "var(--amber)",
  border: "var(--line)",
};

function NotificationBell({ count }) {
  return (
    <button className="relative p-2 rounded-full hover:bg-black/10 transition-colors">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
          style={{ background: "#E53E3E", fontSize: "10px" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function MessagesIcon({ count }) {
  return (
    <button className="relative p-2 rounded-full hover:bg-black/10 transition-colors">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
          style={{ background: C.green, fontSize: "10px" }}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function UserDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user
    ? (user.display_name || user.sub || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-black/10 transition-colors">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ background: C.green }}>
          {initials}
        </div>
        <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border rounded-xl shadow-xl z-50 py-1 overflow-hidden"
          style={{ borderColor: C.border }}>
          <Link to="/me" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            style={{ color: C.soil }}>
            👤 My Profile
          </Link>
          <Link to="/farm" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            style={{ color: C.soil }}>
            🌾 My Farm
          </Link>
          <Link to="/me/settings" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
            style={{ color: C.soil }}>
            ⚙️ Settings
          </Link>
          <div className="border-t my-1" style={{ borderColor: C.border }} />
          <button onClick={() => { setOpen(false); onLogout(); }}
            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
            🚪 Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function FarmerLayout({ children }) {
  const user = getCurrentUser();

  function handleLogout() {
    // D1: clear all auth state (incl. farm selection) + hard-reload so no
    // in-memory cache carries to the next user on a shared device.
    logout();
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>

      {/* ── Fixed Top Nav ──────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 shadow-sm"
        style={{ background: "var(--topbar-bg)", borderBottom: `2px solid ${C.green}` }}>
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">

          {/* Logo + wordmark + farm dropdown */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/home" className="flex items-center gap-2">
              <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 48, width: "auto", display: "block" }} />
            </Link>
            <div className="hidden sm:flex items-center gap-1 text-[var(--soil)]/60 text-sm border-l pl-3"
              style={{ borderColor: "rgba(92,64,51,0.2)" }}>
              <span className="truncate max-w-32">My Farm</span>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-xl mx-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--soil)]/40"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text"
                placeholder="Search knowledge, posts, crops, farmers..."
                className="w-full pl-9 pr-4 py-2 rounded-full text-sm text-[var(--soil)] placeholder-[var(--soil)]/40 focus:outline-none focus:ring-2"
                style={{ background: "rgba(92,64,51,0.06)", focusRingColor: C.green }}
              />
            </div>
          </div>

          {/* Right icons */}
          <div className="flex items-center gap-1 shrink-0 text-[var(--soil)]">
            <MessagesIcon count={3} />
            <NotificationBell count={7} />
            <UserDropdown user={user} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      {/* ── Sticky Secondary Tab Nav ────────────────────────────────────── */}
      <nav className="sticky z-40 shadow-sm overflow-x-auto scrollbar-hide"
        style={{ top: "56px", background: "var(--paper)", borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-screen-xl mx-auto px-4 flex gap-0 min-w-max">
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === "/home"}
              className={({ isActive }) =>
                `px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`
              }
              style={({ isActive }) => ({
                fontFamily: "'Lora', Georgia, serif",
                borderBottomColor: isActive ? C.green : "transparent",
                color: isActive ? C.green : undefined,
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ── Page Content ────────────────────────────────────────────────── */}
      <main className="pt-[56px]">
        <div className="max-w-screen-xl mx-auto px-4 py-5">
          {children}
        </div>
      </main>

      {/* Floating Tei chat — available on every farmer page */}
      {user && <TISWidget />}
    </div>
  );
}

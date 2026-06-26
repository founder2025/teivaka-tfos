import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, LogOut, Shield, Sun, Moon } from "lucide-react";
import { ME_MENU_ITEMS } from "./pillarSubNavMap";
import { getCurrentUser, logout } from "../../utils/auth";
import { hasRole } from "../../utils/roles";
import { getTheme, toggleTheme } from "../../utils/theme";
import Avatar from "../ui/Avatar";

const C = {
  soil:    "var(--soil)",
  cream:   "var(--cream)",
  border:  "var(--line)",
  hoverBg: "rgba(92, 64, 51, 0.04)",
  amber:   "var(--amber)",
  green:   "var(--green)",
  greenDk: "var(--green-dk)",
  muted:   "var(--muted)",
};

function initialsFrom(name, fallback = "UK") {
  if (!name) return fallback;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] || "";
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || fallback;
}

function tierBadgeColor(tier) {
  const t = (tier || "").toUpperCase();
  if (t === "PREMIUM") return C.green;
  if (t === "CUSTOM") return C.greenDk;
  // TRIAL, BASIC, FREE, PROFESSIONAL → amber default
  return C.amber;
}

function tierLabel(tier, trialEndsAt) {
  const t = (tier || "").toUpperCase();
  if (!t) return "TRIAL";
  if (t === "BASIC" && trialEndsAt) {
    const ends = new Date(trialEndsAt);
    if (!Number.isNaN(ends.getTime()) && ends > new Date()) return "TRIAL";
  }
  return t;
}

export default function MeMenu({ onClose }) {
  const [me, setMe] = useState(null);
  const [theme, setThemeState] = useState(getTheme());
  const rootRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return;
    let cancelled = false;
    fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const data = body?.data ?? body;
        if (data) setMe(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) onClose?.();
    }
    function onKey(e) { if (e.key === "Escape") onClose?.(); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function handleSignOut() {
    const token = localStorage.getItem("tfos_access_token");
    // Best-effort: drop the Web Push subscription so a signed-out device stops receiving pushes.
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && (await reg.pushManager.getSubscription());
        if (sub) {
          await fetch("/api/v1/community/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ endpoint: sub.endpoint, keys: {} }),
          }).catch(() => {});
          await sub.unsubscribe().catch(() => {});
        }
      }
    } catch { /* non-critical */ }
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      /* stateless — proceed regardless */
    }
    // Clear ALL auth state (incl. farm selection) + hard-reload so no in-memory
    // cache carries to the next user on a shared device (D1).
    logout();
  }

  const displayName = me?.display_name || me?.full_name || me?.email || "User";
  const email = me?.email || "";
  const initials = initialsFrom(displayName, "UK");
  const tier = tierLabel(me?.subscription_tier, me?.trial_ends_at);
  const badgeBg = tierBadgeColor(me?.subscription_tier);
  // Read role from JWT (instant, no fetch dependency). Backend still
  // enforces require_admin() — this is a UX gate only.
  const userRole = getCurrentUser()?.role;
  const showAdminLink = hasRole(userRole, "ADMIN");

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl overflow-hidden"
      style={{
        width: 280,
        background: "var(--paper)",
        border: `1px solid ${C.border}`,
        color: C.soil,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-3 border-b"
        style={{ borderColor: C.border, background: C.cream }}
      >
        <Avatar src={me?.avatar_url} name={displayName} size={40} fontScale={0.35} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate" style={{ color: C.soil }}>
              {displayName}
            </span>
            <span
              aria-label={`Subscription tier ${tier}`}
              style={{
                background: badgeBg,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 4,
                letterSpacing: "0.03em",
                flexShrink: 0,
              }}
            >
              {tier}
            </span>
          </div>
          {email && (
            <div
              className="text-[11px] truncate mt-0.5"
              style={{ color: C.muted }}
            >
              {email}
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <ul className="py-1">
        {ME_MENU_ITEMS.filter((it) => !it.gate || (it.gate === "admin" && showAdminLink)).map((item) => {
          const Icon = item.icon;
          const rowStyle = { height: 36, padding: "8px 12px", color: C.soil, background: "transparent" };
          const hov = {
            onMouseEnter: (e) => { e.currentTarget.style.background = C.hoverBg; },
            onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; },
          };
          return (
            <li key={item.path} role="none">
              {item.external ? (
                <a href={item.path} role="menuitem" onClick={onClose} className="flex items-center gap-3 text-sm" style={rowStyle} {...hov}>
                  <Icon size={16} strokeWidth={1.75} /><span className="flex-1">{item.label}</span>
                </a>
              ) : (
                <Link to={item.path} role="menuitem" onClick={onClose} className="flex items-center gap-3 text-sm" style={rowStyle} {...hov}>
                  <Icon size={16} strokeWidth={1.75} /><span className="flex-1">{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t" style={{ borderColor: C.border }}>
        <button
          type="button"
          role="menuitem"
          onClick={() => setThemeState(toggleTheme())}
          className="w-full flex items-center gap-3 text-sm text-left"
          style={{ height: 36, padding: "8px 12px", background: "transparent", color: C.soil }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          <span className="flex-1">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>

      <div className="border-t" style={{ borderColor: C.border }}>
        <button
          type="button"
          role="menuitem"
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 text-sm text-left"
          style={{ height: 36, padding: "8px 12px", background: "transparent", color: C.soil }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <LogOut size={16} strokeWidth={1.75} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

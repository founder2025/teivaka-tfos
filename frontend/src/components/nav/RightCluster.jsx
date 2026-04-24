import { useEffect, useState } from "react";
import { Bell, MessageSquare, ChevronDown } from "lucide-react";
import UniversalLogButton from "./UniversalLogButton";
import NotificationsPanel from "./NotificationsPanel";
import MeMenu from "./MeMenu";
import { useTisSse } from "../../hooks/useTisSse";

const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  border:  "#D4CFC3",
  green:   "#6AA84F",
  amber:   "#BF9000",
  hoverBg: "rgba(92, 64, 51, 0.06)",
};

function initialsFrom(name, fallback = "UK") {
  if (!name) return fallback;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] || "";
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || fallback;
}

function StatusDot() {
  return (
    <span
      aria-hidden
      title="All systems synced"
      className="inline-block rounded-full"
      style={{
        width: 10,
        height: 10,
        background: C.green,
        boxShadow: "0 0 0 4px rgba(106, 168, 79, 0.25)",
        margin: "0 12px",
      }}
    />
  );
}

function IconButton({ icon: Icon, label, onClick, disabled, title, badgeCount }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title || label}
      className="relative rounded-lg flex items-center justify-center transition-colors"
      style={{
        width: 36,
        height: 36,
        color: disabled ? "#9A8F7A" : C.soil,
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
        borderRadius: 8,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = C.hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={20} strokeWidth={1.75} />
      {badgeCount > 0 && (
        <span
          aria-hidden
          className="absolute flex items-center justify-center"
          style={{
            top: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: C.amber,
            color: "white",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </button>
  );
}

function AvatarPill({ initials, onClick, expanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Account menu"
      aria-expanded={expanded}
      className="flex items-center transition-colors"
      style={{
        height: 36,
        padding: "4px 10px 4px 4px",
        borderRadius: 18,
        background: C.cream,
        border: `1px solid ${C.border}`,
        gap: 6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#F2ECDD"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.cream; }}
    >
      <span
        aria-hidden
        className="rounded-full flex items-center justify-center text-white"
        style={{
          width: 28,
          height: 28,
          background: C.green,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {initials}
      </span>
      <ChevronDown size={14} style={{ color: C.soil }} />
    </button>
  );
}

export default function RightCluster() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [me, setMe] = useState(null);
  const { unreadCount } = useTisSse();

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

  const displayName = me?.display_name || me?.full_name || me?.email || "";
  const initials = initialsFrom(displayName, "UK");
  // Placeholder counts per Day 3a spec; SSE-driven count preferred when present.
  const messagesCount = 2;
  const notifCount = unreadCount > 0 ? unreadCount : 4;

  return (
    <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
      <div className="hidden md:block">
        <UniversalLogButton variant="pill" />
      </div>

      <StatusDot />

      <IconButton
        icon={MessageSquare}
        label="Messages"
        disabled
        title="In-app chat launches in Phase 8"
        badgeCount={messagesCount}
      />

      <div className="relative">
        <IconButton
          icon={Bell}
          label="Notifications"
          onClick={() => { setMeOpen(false); setNotifOpen((v) => !v); }}
          badgeCount={notifCount}
        />
        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      </div>

      <div className="relative">
        <AvatarPill
          initials={initials}
          expanded={meOpen}
          onClick={() => { setNotifOpen(false); setMeOpen((v) => !v); }}
        />
        {meOpen && <MeMenu onClose={() => setMeOpen(false)} />}
      </div>
    </div>
  );
}

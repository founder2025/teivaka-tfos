import { useEffect, useState } from "react";
import { Bell, MessageSquare, ChevronDown } from "lucide-react";
import UniversalLogButton from "./UniversalLogButton";
import NotificationsPanel from "./NotificationsPanel";
import MeMenu from "./MeMenu";
import { useTisSse } from "../../hooks/useTisSse";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  tint:   "#EAF3DE",
  border: "#E6DED0",
  green:  "#6AA84F",
  red:    "#C0392B",
};

function initialsFrom(name, fallback = "T") {
  if (!name) return fallback;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] || "";
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || fallback;
}

function Avatar({ avatarUrl, displayName }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="rounded-full object-cover"
        style={{ width: 28, height: 28, border: `1px solid ${C.border}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
      style={{ width: 28, height: 28, background: C.green }}
    >
      {initialsFrom(displayName)}
    </span>
  );
}

function IconButton({ icon: Icon, label, onClick, disabled, title, badge, pulse }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title || label}
      className="relative rounded-md flex items-center justify-center transition-colors"
      style={{
        width: 36,
        height: 36,
        color: disabled ? "#9A8F7A" : C.soil,
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = C.tint; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={20} strokeWidth={1.75} />
      {badge && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: 6, right: 6, width: 8, height: 8,
            background: C.red, boxShadow: `0 0 0 2px ${C.cream}`,
          }}
        />
      )}
      {pulse && (
        <span
          aria-hidden
          className="absolute rounded-full animate-ping"
          style={{
            top: 4, right: 4, width: 12, height: 12,
            background: "#D47040", opacity: 0.6,
          }}
        />
      )}
    </button>
  );
}

export default function RightCluster() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [me, setMe] = useState(null);
  const { unreadCount, hasCritical } = useTisSse();

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

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div className="hidden md:block mr-1">
        <UniversalLogButton variant="pill" />
      </div>

      <div className="relative">
        <IconButton
          icon={Bell}
          label="Notifications"
          onClick={() => { setMeOpen(false); setNotifOpen((v) => !v); }}
          badge={unreadCount > 0}
          pulse={hasCritical}
        />
        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      </div>

      <IconButton
        icon={MessageSquare}
        label="Messages"
        disabled
        title="In-app chat launches in Phase 8"
      />

      <div className="relative">
        <button
          type="button"
          onClick={() => { setNotifOpen(false); setMeOpen((v) => !v); }}
          aria-label="Account menu"
          aria-expanded={meOpen}
          className="flex items-center gap-1 px-1 py-1 rounded-md transition-colors"
          onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Avatar avatarUrl={me?.avatar_url} displayName={displayName} />
          <ChevronDown size={14} style={{ color: C.soil }} />
        </button>
        {meOpen && <MeMenu onClose={() => setMeOpen(false)} />}
      </div>
    </div>
  );
}

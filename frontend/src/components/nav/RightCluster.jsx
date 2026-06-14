import { useEffect, useState } from "react";
import { Bell, MessageSquare, ChevronDown, Sun, Moon } from "lucide-react";
import NotificationsPanel from "./NotificationsPanel";
import MeMenu from "./MeMenu";
import { useTisSse } from "../../hooks/useTisSse";
import { useChat } from "../../context/ChatContext";
import ChatDropdown from "../chat/ChatDropdown";
import Avatar from "../ui/Avatar";
import { resolvedMode, setThemePref } from "../../utils/theme";

const C = {
  soil:    "var(--soil)",
  cream:   "var(--cream)",
  border:  "#D4CFC3",
  green:   "var(--green)",
  amber:   "var(--amber)",
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

function IconButton({ icon: Icon, label, onClick, disabled, title, badgeCount, active }) {
  const activeBg = "rgba(106, 168, 79, 0.14)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={title || label}
      className="relative rounded-lg flex items-center justify-center transition-colors"
      style={{
        width: 36,
        height: 36,
        color: disabled ? "#9A8F7A" : (active ? "var(--green-dk)" : C.soil),
        cursor: disabled ? "not-allowed" : "pointer",
        background: active ? activeBg : "transparent",
        borderRadius: 8,
      }}
      onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.background = C.hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? activeBg : "transparent"; }}
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
            color: "#fff",
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

/* Quick Light/Dark toggle in the top bar (full System/Light/Dark lives in Settings). */
function ThemeToggleButton() {
  const [mode, setMode] = useState(() => resolvedMode());
  useEffect(() => {
    const on = (e) => setMode(e?.detail?.mode || resolvedMode());
    window.addEventListener("tfos-theme-changed", on);
    return () => window.removeEventListener("tfos-theme-changed", on);
  }, []);
  const dark = mode === "dark";
  return (
    <IconButton
      icon={dark ? Sun : Moon}
      label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setThemePref(dark ? "light" : "dark")}
    />
  );
}

function AvatarPill({ initials, avatarUrl, name, onClick, expanded }) {
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
      <Avatar src={avatarUrl} name={name} size={28} fontScale={0.39} style={{ pointerEvents: "none" }} />
      <ChevronDown size={14} style={{ color: C.soil }} />
    </button>
  );
}

export default function RightCluster() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [communityUnread, setCommunityUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const { unreadCount } = useTisSse();
  const chat = useChat();

  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return undefined;
    let cancelled = false;
    const loadCount = () => fetch("/api/v1/community/notifications/count", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b?.data) setCommunityUnread(b.data.unread || 0); })
      .catch(() => {});
    loadCount();
    const id = setInterval(loadCount, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Message badge: poll the dedicated unread-count directly so the indicator is
  // correct even when the floating ChatWidget isn't actively polling. Merged
  // with chat.unread (ChatWidget's source) so neither can under-report.
  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return undefined;
    let cancelled = false;
    const loadChat = () => fetch("/api/v1/community/chat/unread-count", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b?.data) setChatUnread(b.data.unread || 0); })
      .catch(() => {});
    loadChat();
    const id = setInterval(loadChat, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

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
  // Real unread = community activity + TIS advisories.
  const messagesCount = 0;
  const notifCount = communityUnread + (unreadCount > 0 ? unreadCount : 0);

  return (
    <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>

      <ThemeToggleButton />

      <div className="relative" data-chat-toggle>
        <IconButton
          icon={MessageSquare}
          label="Messages"
          title="Messages"
          onClick={chat.toggleDropdown}
          active={chat.dropdownOpen}
          badgeCount={Math.max(chat.unread || 0, chatUnread)}
        />
        {chat.dropdownOpen && <ChatDropdown />}
      </div>

      <div className="relative">
        <IconButton
          icon={Bell}
          label="Notifications"
          onClick={() => { setMeOpen(false); setNotifOpen((v) => !v); }}
          badgeCount={notifCount}
        />
        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} onMarkedRead={() => setCommunityUnread(0)} />}
      </div>

      <div className="relative">
        <AvatarPill
          initials={initials}
          avatarUrl={me?.avatar_url}
          name={displayName}
          expanded={meOpen}
          onClick={() => { setNotifOpen(false); setMeOpen((v) => !v); }}
        />
        {meOpen && <MeMenu onClose={() => setMeOpen(false)} />}
      </div>
    </div>
  );
}

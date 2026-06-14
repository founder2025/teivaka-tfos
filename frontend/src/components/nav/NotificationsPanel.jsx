import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Bell, ListChecks } from "lucide-react";
import { useTisSse } from "../../hooks/useTisSse";
import { useIsNarrow } from "../../hooks/useIsNarrow";

const C = {
  soil:    "var(--soil)",
  cream:   "var(--cream)",
  border:  "var(--line)",
  tint:    "rgba(106, 168, 79, 0.06)",
  muted:   "var(--muted)",
  greenDk: "var(--green-dk)",
};

const SEV = {
  CRITICAL: { bar: "var(--red)", badgeBg: "var(--red)", label: "CRITICAL" },
  HIGH:     { bar: "var(--amber)", badgeBg: "var(--amber)", label: "HIGH" },
  MED:      { bar: "var(--green)", badgeBg: "var(--green)", label: "MED" },
};

function sevFor(priority) {
  const p = (priority || "").toUpperCase();
  if (p === "CRITICAL") return SEV.CRITICAL;
  if (p === "HIGH") return SEV.HIGH;
  // MEDIUM | MED | LOW | anything else → MED styling
  return SEV.MED;
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function NotificationsPanel({ onClose, onMarkedRead }) {
  const { advisories, markRead } = useTisSse();
  const narrow = useIsNarrow(640);
  const rootRef = useRef(null);
  const [taskN, setTaskN] = useState({ open: 0, overdue: 0 });
  const [community, setCommunity] = useState([]);

  useEffect(() => {
    const tok = localStorage.getItem("tfos_access_token");
    if (!tok) return;
    (async () => {
      try {
        const r = await fetch("/api/v1/tasks/count", { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); if (d?.data) setTaskN({ open: d.data.open || 0, overdue: d.data.overdue || 0 }); }
      } catch { /* non-critical */ }
    })();
  }, []);

  // Community notifications: load, then mark all read (opening the panel = seen).
  useEffect(() => {
    const tok = localStorage.getItem("tfos_access_token");
    if (!tok) return;
    (async () => {
      try {
        const r = await fetch("/api/v1/community/notifications?limit=30", { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) {
          const d = await r.json();
          setCommunity(d?.data || []);
          if ((d?.unread || 0) > 0) {
            await fetch("/api/v1/community/notifications/read", { method: "POST", headers: { Authorization: `Bearer ${tok}` } });
            onMarkedRead?.();
          }
        }
      } catch { /* non-critical */ }
    })();
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

  function handleMarkAllRead() {
    // Day 3a stub no-op. Real bulk-mark endpoint wires up later.
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Notifications"
      className={`z-50 rounded-lg shadow-xl ${narrow ? "fixed" : "absolute right-0 top-full mt-2"}`}
      style={{
        ...(narrow
          ? { left: 8, right: 8, top: 60, width: "auto", maxHeight: "75vh" }
          : { width: 360, maxHeight: 480 }),
        background: "var(--paper)",
        border: `1px solid ${C.border}`,
        color: C.soil,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Notifications</span>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="hover:underline"
          style={{
            background: "transparent",
            border: "none",
            color: C.greenDk,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Mark all read
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: 388 }}>
        {(taskN.overdue > 0 || taskN.open > 0) && (
          <NavLink to="/farm/tasks" onClick={onClose} className="w-full text-left flex gap-3 items-stretch"
            style={{ borderBottom: `1px solid ${C.border}`, background: taskN.overdue > 0 ? "rgba(212,68,46,0.06)" : C.tint, textDecoration: "none", color: "inherit" }}>
            <span aria-hidden className="flex-shrink-0" style={{ width: 6, background: taskN.overdue > 0 ? "var(--red)" : "var(--green-dk)" }} />
            <div className="flex-1 min-w-0 flex items-center gap-2" style={{ padding: "10px 12px" }}>
              <ListChecks size={16} style={{ color: taskN.overdue > 0 ? "var(--red)" : C.greenDk, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: C.soil }}>
                {taskN.overdue > 0
                  ? <><strong>{taskN.overdue}</strong> task{taskN.overdue === 1 ? "" : "s"} overdue</>
                  : <><strong>{taskN.open}</strong> open task{taskN.open === 1 ? "" : "s"}</>} — tap to review
              </span>
            </div>
          </NavLink>
        )}
        {community.map((n) => (
          <NavLink key={n.notification_id}
            to={n.type === "FOLLOW" && n.actor_user_id ? `/u/${n.actor_user_id}` : n.post_id ? `/home?post=${n.post_id}` : "/home"}
            onClick={onClose}
            className="w-full text-left flex gap-3 items-stretch"
            style={{ borderBottom: `1px solid ${C.border}`, background: n.read_at ? "transparent" : C.tint, textDecoration: "none", color: "inherit" }}>
            <span aria-hidden className="flex-shrink-0" style={{ width: 6, background: "var(--green)" }} />
            <div className="flex-1 min-w-0" style={{ padding: "10px 12px" }}>
              <p style={{ fontSize: 13, color: C.soil, margin: 0, lineHeight: 1.35 }}>{n.body || `${n.actor_name || "Someone"} ${(n.type || "").toLowerCase()}`}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0 0" }}>{relativeTime(n.created_at)}</p>
            </div>
          </NavLink>
        ))}
        {advisories.length === 0 && community.length === 0 && taskN.open === 0 && taskN.overdue === 0 ? (
          <div className="py-10 px-6 flex flex-col items-center text-center gap-2">
            <Bell size={48} strokeWidth={1.5} style={{ color: C.soil, opacity: 0.45 }} />
            <p className="text-sm" style={{ opacity: 0.75 }}>
              All caught up. TIS will ping you here when something needs attention.
            </p>
          </div>
        ) : advisories.length === 0 ? null : (
          <ul>
            {advisories.map((a) => {
              const unread = !a.read_at;
              const sev = sevFor(a.priority);
              return (
                <li key={a.advisory_id}>
                  <button
                    type="button"
                    onClick={() => unread && markRead(a.advisory_id)}
                    className="w-full text-left flex gap-3 items-stretch transition-colors"
                    style={{
                      padding: 0,
                      borderBottom: `1px solid ${C.border}`,
                      background: unread ? C.tint : "transparent",
                    }}
                  >
                    {/* 6px priority bar */}
                    <span
                      aria-hidden
                      className="flex-shrink-0"
                      style={{ width: 6, background: sev.bar }}
                    />
                    <div className="flex-1 min-w-0" style={{ padding: "10px 12px" }}>
                      <div className="flex items-start gap-2">
                        <p
                          className="flex-1"
                          style={{
                            fontSize: 13,
                            lineHeight: 1.35,
                            color: C.soil,
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {a.title || a.preview}
                        </p>
                        <span
                          className="sev-badge flex-shrink-0"
                          style={{
                            background: sev.badgeBg,
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 3,
                            letterSpacing: "0.03em",
                            lineHeight: 1.2,
                          }}
                        >
                          {sev.label}
                        </span>
                      </div>
                      {a.body && a.title && (
                        <p
                          style={{
                            fontSize: 12,
                            color: C.soil,
                            margin: "4px 0 0 0",
                            opacity: 0.85,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {a.body}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0 0" }}>
                        {relativeTime(a.created_at || a.read_at)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex justify-end"
        style={{
          padding: "8px 12px",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <NavLink
          to="/notifications"
          onClick={onClose}
          style={{
            color: C.greenDk,
            fontSize: 12,
            fontWeight: 500,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
        >
          View all
        </NavLink>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Bell } from "lucide-react";
import { useTisSse } from "../../hooks/useTisSse";

const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  border:  "#E8E2D4",
  tint:    "rgba(106, 168, 79, 0.06)",
  muted:   "#8A7B6F",
  greenDk: "#3E7B1F",
};

const SEV = {
  CRITICAL: { bar: "#D4442E", badgeBg: "#D4442E", label: "CRITICAL" },
  HIGH:     { bar: "#BF9000", badgeBg: "#BF9000", label: "HIGH" },
  MED:      { bar: "#6AA84F", badgeBg: "#6AA84F", label: "MED" },
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

export default function NotificationsPanel({ onClose }) {
  const { advisories, markRead } = useTisSse();
  const rootRef = useRef(null);

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
      className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl"
      style={{
        width: 360,
        maxHeight: 480,
        background: "#FFFFFF",
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
        {advisories.length === 0 ? (
          <div className="py-10 px-6 flex flex-col items-center text-center gap-2">
            <Bell size={48} strokeWidth={1.5} style={{ color: C.soil, opacity: 0.45 }} />
            <p className="text-sm" style={{ opacity: 0.75 }}>
              All caught up. TIS will ping you here when something needs attention.
            </p>
          </div>
        ) : (
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
                            color: "#FFFFFF",
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
          to="/farm/compliance"
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

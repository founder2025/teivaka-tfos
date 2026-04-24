import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { useTisSse } from "../../hooks/useTisSse";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  tint:   "#EAF3DE",
};

const PRIORITY_BAR = {
  LOW:      "#9A8F7A",
  MEDIUM:   "#D9A441",
  HIGH:     "#D47040",
  CRITICAL: "#C0392B",
};

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60)       return `${sec}s ago`;
  if (sec < 3600)     return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)    return `${Math.floor(sec / 3600)}h ago`;
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

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl"
      style={{
        width: 360,
        maxHeight: 480,
        background: C.cream,
        border: `1px solid ${C.border}`,
        color: C.soil,
      }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: C.border }}
      >
        <span className="text-sm font-semibold">Notifications</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 432 }}>
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
              const bar = PRIORITY_BAR[a.priority] || PRIORITY_BAR.LOW;
              return (
                <li key={a.advisory_id}>
                  <button
                    type="button"
                    onClick={() => unread && markRead(a.advisory_id)}
                    className="w-full text-left px-4 py-3 border-b flex gap-3 items-start transition-colors"
                    style={{
                      borderColor: C.border,
                      background: unread ? C.tint : "transparent",
                    }}
                  >
                    <span
                      aria-hidden
                      className="rounded-full flex-shrink-0 mt-1"
                      style={{ width: 4, height: 36, background: bar }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm leading-snug"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {a.preview}
                      </p>
                      <p className="text-[11px] mt-1" style={{ opacity: 0.6 }}>
                        {a.priority} · {relativeTime(a.created_at || a.read_at)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

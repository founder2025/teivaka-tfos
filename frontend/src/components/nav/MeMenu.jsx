import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, LogOut } from "lucide-react";
import { ME_MENU_ITEMS } from "./pillarSubNavMap";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  tint:   "#EAF3DE",
  amber:  "#BF9000",
  green:  "#6AA84F",
};

function trialCopy(tier, endsAtIso) {
  if ((tier || "").toUpperCase() !== "BASIC" || !endsAtIso) return null;
  const ends = new Date(endsAtIso);
  if (Number.isNaN(ends.getTime())) return null;
  const now = new Date();
  if (now >= ends) return null;
  const days = Math.max(1, Math.ceil((ends - now) / 86400000));
  return { days, critical: days <= 3 };
}

export default function MeMenu({ onClose }) {
  const [me, setMe] = useState(null);
  const rootRef = useRef(null);
  const navigate = useNavigate();

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
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      /* stateless — proceed regardless */
    }
    localStorage.removeItem("tfos_access_token");
    localStorage.removeItem("tfos_refresh_token");
    navigate("/login", { replace: true });
  }

  const trial = trialCopy(me?.subscription_tier, me?.trial_ends_at);

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl overflow-hidden"
      style={{
        width: 240,
        background: C.cream,
        border: `1px solid ${C.border}`,
        color: C.soil,
      }}
    >
      <ul className="py-1">
        {ME_MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = item.phase ? `/stub/phase-${item.phase}` : item.path;
          const subtitle =
            item.path === "/me/subscription" && trial
              ? `Trial: ${trial.days}d left`
              : null;
          return (
            <li key={item.path} role="none">
              <Link
                to={href}
                role="menuitem"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:brightness-95"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className="flex-1">
                  <span className="block">{item.label}</span>
                  {subtitle && (
                    <span
                      className="block text-[11px]"
                      style={{ color: trial?.critical ? C.amber : C.green, fontWeight: 600 }}
                    >
                      {subtitle}
                    </span>
                  )}
                </span>
                {item.phase && <Lock size={12} style={{ opacity: 0.6 }} />}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t" style={{ borderColor: C.border }}>
        <button
          type="button"
          role="menuitem"
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left"
          onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <LogOut size={16} strokeWidth={1.75} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

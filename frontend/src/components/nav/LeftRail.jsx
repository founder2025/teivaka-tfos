import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, X } from "lucide-react";
import { PILLAR_SUB_NAV } from "./pillarSubNavMap";
import { useLeftRail } from "../../context/LeftRailContext";

const C = {
  soil:     "#5C4033",
  greenDk:  "#3E7B1F",
  border:   "#E8E2D4",
  activeBg: "rgba(106, 168, 79, 0.08)",
  hoverBg:  "rgba(92, 64, 51, 0.04)",
  hoverBg2: "rgba(92, 64, 51, 0.06)",
};

function useIsMobile() {
  const get = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 900px)").matches;
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 900px)");
    const on = () => setMobile(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return mobile;
}

function resolveHref(item) {
  return item.phase ? `/stub/phase-${item.phase}` : item.path;
}

function currentPillarKey(pathname) {
  return Object.keys(PILLAR_SUB_NAV).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function RailItem({ item, onNavigate }) {
  const Icon = item.icon;
  const href = resolveHref(item);
  const isPhase = Boolean(item.phase);
  const endMatch =
    item.path === "/home" || item.path === "/farm" || item.path === "/tis" || item.path === "/classroom";

  return (
    <NavLink
      to={href}
      end={endMatch}
      onClick={onNavigate}
      className="flex items-center"
      style={({ isActive }) => ({
        height: 36,
        padding: "8px 12px",
        gap: 12,
        borderRadius: 6,
        color: isActive && !isPhase ? C.greenDk : C.soil,
        background: isActive && !isPhase ? C.activeBg : "transparent",
        fontSize: 14,
        transition: "background 120ms ease, color 120ms ease",
      })}
      onMouseEnter={(e) => {
        if (e.currentTarget.getAttribute("aria-current") !== "page") {
          e.currentTarget.style.background = C.hoverBg;
        }
      }}
      onMouseLeave={(e) => {
        if (e.currentTarget.getAttribute("aria-current") !== "page") {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon size={18} strokeWidth={1.75} style={{ color: "inherit" }} />
      <span className="flex-1 truncate">{item.label}</span>
      {isPhase && <Lock size={12} style={{ opacity: 0.6 }} aria-label="Coming soon" />}
    </NavLink>
  );
}

export default function LeftRail() {
  const { pathname } = useLocation();
  const pillarKey = currentPillarKey(pathname);
  const pillar = pillarKey ? PILLAR_SUB_NAV[pillarKey] : null;
  const { open, close, width } = useLeftRail();
  const mobile = useIsMobile();
  const panelRef = useRef(null);

  // Click-outside close on mobile only — on desktop the rail stays put while
  // open and is dismissed via the close button or the hamburger toggle.
  useEffect(() => {
    if (!open || !mobile) return undefined;
    function onDocClick(e) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      // Ignore clicks on the toggle button itself (aria-controls path is
      // cleaner but hamburger lives in TopAppBar; treat any aria-label match
      // as the toggle).
      const tgt = e.target.closest?.("button[aria-label^='Open navigation']");
      if (tgt) return;
      close();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile, close]);

  if (!pillar || !open) return null;

  const onNavigate = mobile ? close : undefined;

  return (
    <>
      {mobile && (
        <div
          aria-hidden
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            top: 56,
            background: "rgba(0,0,0,0.35)",
            zIndex: 30,
          }}
        />
      )}
      <aside
        ref={panelRef}
        className="fixed left-0 flex flex-col overflow-y-auto"
        style={{
          top: 56,
          bottom: 0,
          width,
          background: "#FFFFFF",
          borderRight: `1px solid ${C.border}`,
          padding: "12px 8px",
          zIndex: mobile ? 40 : 30,
          boxShadow: mobile ? "0 8px 24px rgba(0,0,0,0.15)" : "none",
        }}
        aria-label={`${pillar.label} navigation`}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "2px 8px 6px 12px" }}
        >
          <span
            className="text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: "#8A7B6F", letterSpacing: "0.04em" }}
          >
            {pillar.label}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation rail"
            className="flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              color: C.soil,
              background: "transparent",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg2; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <nav
          className="flex flex-col gap-0.5"
          aria-label={`${pillar.label} sub-navigation`}
        >
          {pillar.items.map((item) => (
            <RailItem key={item.path} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </aside>
    </>
  );
}

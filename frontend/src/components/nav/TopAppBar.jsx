import { Link } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import { useEffect } from "react";
import PillarTabs from "./PillarTabs";
import RightCluster from "./RightCluster";
import { useLeftRail } from "../../context/LeftRailContext";

const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  border:  "#E8E2D4",
  tint:    "#EAF3DE",
  greenDk: "#3E7B1F",
  hoverBg: "rgba(92, 64, 51, 0.06)",
};

function TeivakaLogo() {
  return (
    <span
      className="tracking-tight"
      style={{
        color: C.greenDk,
        fontSize: 18,
        fontWeight: 700,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        lineHeight: 1,
      }}
    >
      teivaka
    </span>
  );
}

function RailToggle() {
  const { toggle, open } = useLeftRail();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "Close navigation rail" : "Open navigation rail"}
      aria-expanded={open}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        color: C.soil,
        background: "transparent",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Menu size={20} strokeWidth={1.75} />
    </button>
  );
}

// Phase 3d (2026-04-26): SearchIconButton renders at all viewports.
// Phase 8 will swap the click handler from a toast stub to a real
// search-overlay open. Until then, click + Cmd/Ctrl+K both fire the
// same toast.
function emitSearchToast() {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", {
      detail: { message: "Global search launches in Phase 8. For now, navigate via pillars." },
    }),
  );
}

function SearchIconButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      title="Search farm, tasks, people…"
      className="rounded-md flex items-center justify-center"
      style={{ width: 36, height: 36, color: C.soil }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Search size={20} strokeWidth={1.75} />
    </button>
  );
}

export default function TopAppBar() {
  // Cmd/Ctrl+K — opens search (Phase 3d: same toast as the icon click;
  // Phase 8 swap to real overlay open).
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        emitSearchToast();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "#FFFFFF",
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
      }}
    >
      <div
        className="relative flex items-center"
        style={{ height: 56, padding: "0 16px", gap: 12 }}
      >
        {/* Left: hamburger + brand + search-icon (universal). */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 12 }}>
          <RailToggle />
          <Link to="/home" className="flex items-center flex-shrink-0" aria-label="teivaka home">
            <TeivakaLogo />
          </Link>
          <SearchIconButton onClick={emitSearchToast} />
        </div>

        {/* Spacer — consumes remaining space so right cluster sits at the edge */}
        <div className="flex-1" />

        {/* Center: pillar tabs absolutely centered so they hold position
            regardless of left/right cluster widths */}
        <div
          className="hidden md:flex absolute pointer-events-none"
          style={{
            left: "50%",
            top: 0,
            bottom: 0,
            transform: "translateX(-50%)",
            alignItems: "center",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <PillarTabs />
          </div>
        </div>

        {/* Right: cluster */}
        <RightCluster />
      </div>
    </header>
  );
}

import { Link } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import { useEffect, useState } from "react";
import PillarTabs from "./PillarTabs";
import RightCluster from "./RightCluster";
import { useLeftRail } from "../../context/LeftRailContext";
import SearchPalette from "../search/SearchPalette";
import { useIsNarrow } from "../../hooks/useIsNarrow";

const C = {
  soil:    "var(--soil)",
  cream:   "var(--cream)",
  border:  "var(--line)",
  tint:    "#EAF3DE",
  greenDk: "var(--green-dk)",
  hoverBg: "rgba(92, 64, 51, 0.06)",
  // Prototype .topbar-search palette (pixel-exact)
  cream2:      "var(--line)", // --cream-2
  cream2hover: "#E7DFCC",
  line2:       "var(--line)", // --line
  muted:       "var(--muted)", // --muted
};

function TeivakaLogo() {
  return (
    <img
      src="/teivaka_logo.png"
      alt="Teivaka"
      style={{ height: 48, width: "auto", display: "block" }}
    />
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

// Prototype-exact full search bar (.topbar-search): fixed 280px pill with the
// magnifying-glass icon, "Search farm, tasks, people…" placeholder and a ⌘K
// hint chip. Desktop-only (>=1025px); collapses to SearchIconButton below that.
// Both triggers open the same SearchPalette.
function SearchBarFull({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search farm, tasks, people"
      style={{
        flex: "0 0 280px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: C.cream2,
        border: `1px solid ${C.line2}`,
        borderRadius: 20,
        padding: "7px 14px",
        color: C.muted,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.cream2hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.cream2; }}
    >
      <Search size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Search farm, tasks, people…
      </span>
      <span style={{
        marginLeft: "auto", fontSize: 11, color: C.muted, background: "var(--paper)",
        padding: "2px 6px", borderRadius: 3, border: `1px solid ${C.line2}`, flexShrink: 0,
      }}>⌘K</span>
    </button>
  );
}

export default function TopAppBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  // <=1024px the LeftRail drawer is replaced by the inline PillarSubNavStrip,
  // so the rail-toggle hamburger has nothing to open — hide it there.
  const narrow = useIsNarrow(1024);
  // Cmd/Ctrl+K — open the global search palette.
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "var(--paper)",
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
          {!narrow && <RailToggle />}
          <Link to="/home" className="flex items-center flex-shrink-0" aria-label="teivaka home">
            <TeivakaLogo />
          </Link>
          {narrow
            ? <SearchIconButton onClick={() => setSearchOpen(true)} />
            : <SearchBarFull onClick={() => setSearchOpen(true)} />}
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
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

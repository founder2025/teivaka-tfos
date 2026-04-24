import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useState } from "react";
import PillarTabs from "./PillarTabs";
import SearchBar from "./SearchBar";
import RightCluster from "./RightCluster";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  tint:   "#EAF3DE",
};

function TeivakaLogo() {
  return (
    <span
      className="font-bold tracking-tight text-base md:text-lg"
      style={{ color: C.soil, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
    >
      Teivaka
    </span>
  );
}

function SearchIconButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      className="rounded-md flex items-center justify-center"
      style={{ width: 36, height: 36, color: C.soil }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Search size={18} strokeWidth={1.75} />
    </button>
  );
}

export default function TopAppBar() {
  const [, setSearchOverlayOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: C.cream,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div className="h-12 md:h-14 px-3 md:px-4 flex items-center gap-3 md:gap-6">
        {/* Left cluster */}
        <Link to="/home" className="flex items-center gap-2 flex-shrink-0" aria-label="Teivaka home">
          <TeivakaLogo />
        </Link>
        <div className="hidden md:block flex-shrink-0">
          <SearchBar />
        </div>
        <div className="md:hidden flex-shrink-0">
          <SearchIconButton
            onClick={() => {
              setSearchOverlayOpen(true);
              window.dispatchEvent(
                new CustomEvent("tfos:toast", {
                  detail: { message: "Global search launches in Phase 8. For now, navigate via pillars." },
                }),
              );
            }}
          />
        </div>

        {/* Center cluster — desktop only */}
        <div className="hidden md:flex flex-1 justify-center">
          <PillarTabs />
        </div>
        <div className="md:hidden flex-1" />

        {/* Right cluster */}
        <RightCluster />
      </div>
    </header>
  );
}

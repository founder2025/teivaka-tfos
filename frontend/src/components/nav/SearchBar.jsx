import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
};

export default function SearchBar() {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === ref.current) {
        ref.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent("tfos:toast", {
        detail: { message: "Global search launches in Phase 8. For now, navigate via pillars." },
      }),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative" role="search">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: C.soil }}
      />
      <input
        ref={ref}
        type="search"
        aria-label="Search"
        placeholder="Search  (/)"
        className="pl-9 pr-3 py-2 text-sm rounded-md border w-64 focus:outline-none focus:ring-2"
        style={{ background: "#FFFFFF", borderColor: C.border, color: C.soil }}
      />
    </form>
  );
}

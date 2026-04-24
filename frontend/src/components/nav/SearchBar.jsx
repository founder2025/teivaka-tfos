import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

const C = {
  soil:   "#5C4033",
  border: "#D4CFC3",
  cream:  "#F8F3E9",
};

function isMac() {
  if (typeof navigator === "undefined") return false;
  return navigator.platform?.includes("Mac") || /Mac/i.test(navigator.userAgent || "");
}

export default function SearchBar() {
  const inputRef = useRef(null);
  const [mac, setMac] = useState(true);

  useEffect(() => { setMac(isMac()); }, []);

  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
    <form onSubmit={handleSubmit} className="relative w-full" role="search" style={{ maxWidth: 360 }}>
      <div
        className="relative flex items-center"
        style={{
          height: 36,
          background: "#FFFFFF",
          border: `1px solid ${C.border}`,
          borderRadius: 18,
        }}
      >
        <Search
          size={16}
          className="absolute pointer-events-none"
          style={{ left: 10, color: C.soil }}
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search"
          placeholder="Search farm, tasks, people…"
          className="w-full bg-transparent focus:outline-none"
          style={{
            paddingLeft: 32,
            paddingRight: 56,
            height: 34,
            fontSize: 13,
            color: C.soil,
            border: "none",
          }}
        />
        <kbd
          aria-hidden
          className="absolute pointer-events-none select-none"
          style={{
            right: 8,
            fontSize: 11,
            padding: "2px 6px",
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            background: C.cream,
            color: C.soil,
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}
        >
          {mac ? "⌘K" : "Ctrl+K"}
        </kbd>
      </div>
    </form>
  );
}

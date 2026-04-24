import { useEffect } from "react";
import { Plus } from "lucide-react";

const C = {
  green:     "#6AA84F",
  greenDark: "#568A3F",
};

function fire() {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", {
      detail: { message: "Log sheet launches tomorrow (Day 3b)." },
    }),
  );
}

/**
 * Day 3a stub — Cmd/Ctrl+L triggers the same toast. Day 3b swaps to open
 * <LogSheet /> without changing any callers.
 */
export function useUniversalLogShortcut() {
  useEffect(() => {
    function onKey(e) {
      const isL = (e.metaKey || e.ctrlKey) && (e.key === "l" || e.key === "L");
      if (!isL) return;
      e.preventDefault();
      fire();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function UniversalLogButton({ variant = "pill" }) {
  if (variant === "center") {
    return (
      <button
        type="button"
        onClick={fire}
        aria-label="Log action"
        className="rounded-full flex items-center justify-center text-white"
        style={{
          width: 56,
          height: 56,
          background: C.green,
          boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
          border: "3px solid #F8F3E9",
        }}
      >
        <Plus size={28} strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={fire}
      aria-label="Log action"
      className="inline-flex items-center gap-1 px-3 rounded-full text-sm font-semibold text-white"
      style={{
        height: 32,
        background: C.green,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.greenDark; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.green; }}
    >
      <Plus size={16} strokeWidth={2.25} />
      <span>Log</span>
    </button>
  );
}

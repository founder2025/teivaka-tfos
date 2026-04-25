import { useEffect } from "react";
import { Plus } from "lucide-react";

import { useLauncher } from "../../context/LauncherContext";

const C = {
  green:     "#6AA84F",
  greenDark: "#568A3F",
};

/**
 * Cmd/Ctrl+L opens the LogSheet (mounted in FarmerShell). The hook must
 * be used inside LauncherProvider — that's why FarmerShell wraps the
 * shell content with the provider before mounting this hook.
 */
export function useUniversalLogShortcut() {
  const { open } = useLauncher();
  useEffect(() => {
    function onKey(e) {
      const isL = (e.metaKey || e.ctrlKey) && (e.key === "l" || e.key === "L");
      if (!isL) return;
      e.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export default function UniversalLogButton({ variant = "pill" }) {
  const { open } = useLauncher();

  if (variant === "center") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Open log sheet"
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
      onClick={open}
      aria-label="Open log sheet"
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

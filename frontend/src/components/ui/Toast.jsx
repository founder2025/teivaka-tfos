import { useEffect, useState } from "react";

/**
 * Toast — minimal dispatcher-driven toast. Mounted once by FarmerShell.
 *
 * Fire anywhere:
 *   window.dispatchEvent(new CustomEvent("tfos:toast", {
 *     detail: { message: "..." }                                           // legacy
 *   }));
 *   window.dispatchEvent(new CustomEvent("tfos:toast", {
 *     detail: { message: "Logged ✓", type: "success", hash: "cdae483d" }   // Phase 6.2-4
 *   }));
 *
 * Phase 6.2-4 extension (backward-compatible):
 *   - type: 'success' | 'error' | undefined (default: neutral cream)
 *   - hash: optional 8-char audit hash badge rendered monospace muted
 *
 * Existing dispatches with only {message} continue to work unchanged.
 * Auto-dismiss after 4s. Bottom-anchored on mobile + desktop (warm cream pill).
 */
const C = {
  soil:    "#5C4033",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  green:   "#3F7427",
  greenBg: "#EAF3E0",
  red:     "#A32D2D",
  redBg:   "#FDECEA",
  muted:   "#8A8678",
};

export default function Toast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timer;
    function onToast(e) {
      const detail = e.detail || {};
      setToast({
        message: detail.message || "",
        type: detail.type || "neutral",
        hash: detail.hash || null,
      });
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 4000);
    }
    window.addEventListener("tfos:toast", onToast);
    return () => {
      window.removeEventListener("tfos:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!toast || !toast.message) return null;

  // Tone: success = green tint, error = red tint, neutral = cream (existing default)
  const tone = toast.type === "success"
    ? { background: C.greenBg, color: C.green,  border: `1px solid ${C.green}` }
    : toast.type === "error"
    ? { background: C.redBg,   color: C.red,    border: `1px solid ${C.red}` }
    : { background: C.cream,   color: C.soil,   border: `1px solid ${C.border}` };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm text-center flex items-center justify-center gap-2"
      style={tone}
    >
      <span>{toast.message}</span>
      {toast.hash && (
        <span
          className="text-xs font-mono ml-1"
          style={{ color: C.muted }}
        >
          #{toast.hash}
        </span>
      )}
    </div>
  );
}

/**
 * Modal — shared modal shell.
 *
 * Renders centered on desktop (md+); slides up from the bottom on mobile
 * (a soft bottom-sheet feel via items-end + rounded top corners). Closes
 * on ESC, backdrop tap, and an optional X button in the header.
 *
 * Props:
 *   isOpen           boolean — visibility gate
 *   onClose          () => void
 *   title?           string — header text; omit to render headerless
 *   children         body content
 *   footer?          ReactNode — renders pinned at the bottom on a cream strip
 *   size?            "sm" | "md" | "lg"  (default "md")
 *   closeOnBackdrop? boolean (default true)
 *   showCloseButton? boolean (default true) — header X
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  showCloseButton = true,
}) {
  const dialogRef = useRef(null);

  // ESC closes; lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog after mount.
    const tid = setTimeout(() => {
      const focusable = dialogRef.current?.querySelector(
        "[autofocus], input, select, textarea, button:not([aria-label='Close'])",
      );
      focusable?.focus?.();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(tid);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeMaxW = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:px-3"
      style={{ background: "rgba(0,0,0,0.4)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`w-full ${sizeMaxW} bg-white rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col`}
        style={{
          border: `1px solid ${C.border}`,
          maxHeight: "92vh",
        }}
      >
        {(title || showCloseButton) && (
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            {title ? (
              <h2 id="modal-title" className="text-base font-bold" style={{ color: C.soil }}>
                {title}
              </h2>
            ) : <span aria-hidden />}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1"
                style={{ color: C.muted }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto" style={{ flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: `1px solid ${C.border}`, background: C.cream }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

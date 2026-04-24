import { useEffect, useState } from "react";

/**
 * Toast — minimal dispatcher-driven toast. Mounted once by FarmerShell.
 * Fire anywhere:
 *   window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "..." } }));
 * Auto-dismiss after 4s.
 */
const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
};

export default function Toast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let timer;
    function onToast(e) {
      setMessage(e.detail?.message || "");
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 4000);
    }
    window.addEventListener("tfos:toast", onToast);
    return () => {
      window.removeEventListener("tfos:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm text-center"
      style={{
        background: C.cream,
        color: C.soil,
        border: `1px solid ${C.border}`,
      }}
    >
      {message}
    </div>
  );
}

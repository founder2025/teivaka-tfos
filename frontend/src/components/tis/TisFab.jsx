/**
 * TisFab — Floating "Ask TIS" button.
 *
 * Mobile: bottom-24 right-6 (clears the 64px BottomNav with breathing room).
 * Desktop: bottom-6 right-6 (no BottomNav at md+).
 *
 * Sub-components stay at module scope (focus-stability rule).
 */

const C = {
  green: "#6AA84F",
};

function SparklesIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
      <path d="M5 14l.7 1.6L7.3 16l-1.6.7L5 18l-.7-1.3L2.7 16l1.6-.4L5 14z" />
    </svg>
  );
}

export default function TisFab({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask TIS"
      className="fixed bottom-24 right-6 md:bottom-6 md:right-6 w-14 h-14 rounded-full text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      style={{
        background: C.green,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        zIndex: 1000,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#5a9140";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = C.green;
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.18)";
      }}
    >
      <SparklesIcon />
    </button>
  );
}

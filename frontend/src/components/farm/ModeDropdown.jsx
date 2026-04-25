/**
 * ModeDropdown — Growth | Commercial | Solo selector.
 *
 * Day 4+ wires this up to the actual farmer-mode override (which adjusts the
 * task surface, density, and copy across the shell). Today it's decorative —
 * onChange emits a toast and updates local state only.
 */
import { useState } from "react";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
  muted:  "#8A7863",
};

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

export default function ModeDropdown() {
  const [mode, setMode] = useState("Growth");
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
      style={{ background: "white", border: `1px solid ${C.border}` }}
    >
      <span
        className="text-[11px] uppercase tracking-wider font-medium"
        style={{ color: C.muted }}
      >
        Mode
      </span>
      <select
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          emitToast("Mode switching coming Day 4+");
        }}
        className="bg-transparent text-sm font-medium border-0 focus:outline-none cursor-pointer"
        style={{ color: C.soil }}
        aria-label="Farm view mode"
      >
        <option>Growth</option>
        <option>Commercial</option>
        <option>Solo</option>
      </select>
    </span>
  );
}

/**
 * ModeDropdown — Growth | Commercial | Solo selector.
 *
 * Day 4+ wires this up to the actual farmer-mode override (which adjusts the
 * task surface, density, and copy across the shell). Today it's decorative —
 * onChange emits a toast and updates local state only.
 */
import { useState } from "react";
import ThemedSelect from "../inputs/ThemedSelect.jsx";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
  muted:  "#8A7863",
};

const MODE_OPTIONS = [
  { value: "Growth",     label: "Growth" },
  { value: "Commercial", label: "Commercial" },
  { value: "Solo",       label: "Solo" },
];

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

export default function ModeDropdown() {
  const [mode, setMode] = useState("Growth");
  return (
    <div className="inline-block" style={{ minWidth: 140 }}>
      <ThemedSelect
        value={mode}
        onChange={(v) => {
          setMode(v);
          emitToast("Mode switching coming Day 4+");
        }}
        options={MODE_OPTIONS}
        placeholder="Mode"
      />
    </div>
  );
}

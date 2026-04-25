/**
 * NewCycleButton — placeholder for cycle creation.
 *
 * Day 3b-Farm: toast-only. Day 4+ swaps the click handler to either route to
 * /farm/cycles/new or open an inline modal.
 */
import { Plus } from "lucide-react";

const C = {
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
};

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

export default function NewCycleButton() {
  return (
    <button
      type="button"
      onClick={() => emitToast("Cycle creation lands Day 4+")}
      className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg text-white transition-colors"
      style={{ background: C.green }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.greenDk)}
      onMouseLeave={(e) => (e.currentTarget.style.background = C.green)}
    >
      <Plus size={14} strokeWidth={2.5} />
      New cycle
    </button>
  );
}

/**
 * NewCycleButton — opens the cycle-creation flow.
 *
 * Stateless button. Modal lifecycle is owned by the parent (FarmDashboard)
 * so the LogSheet's "Start cycle" tile can also drive it via
 * /farm?action=new-cycle.
 */
import { Plus } from "lucide-react";

const C = {
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
};

export default function NewCycleButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-40"
      style={{ background: C.green }}
      onMouseEnter={(e) => {
        if (!e.currentTarget.disabled) e.currentTarget.style.background = C.greenDk;
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.disabled) e.currentTarget.style.background = C.green;
      }}
    >
      <Plus size={14} strokeWidth={2.5} />
      New cycle
    </button>
  );
}

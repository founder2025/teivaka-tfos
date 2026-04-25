/**
 * NewCycleButton — opens the cycle-creation modal.
 *
 * Day 3.5: replaces the toast-only stub. Modal handles the full create
 * flow (block + crop + date + rotation + override). On success, the
 * onCreated callback bubbles up to FarmDashboard so it can invalidate
 * its cycles + farm queries.
 */
import { useState } from "react";
import { Plus } from "lucide-react";

import NewCycleModal from "./NewCycleModal";

const C = {
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
};

export default function NewCycleButton({ farmId, onCreated }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!farmId}
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
      <NewCycleModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreated={onCreated}
        farmId={farmId}
      />
    </>
  );
}

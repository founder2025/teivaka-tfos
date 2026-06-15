/**
 * ActionSheet — the (+) sheet for non-farm pillars (Community, Classroom).
 * Renders only that pillar's create-actions as tap targets; each navigates to
 * the surface that opens the matching create UI. Farm keeps its richer LogSheet.
 */
import { useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";

export default function ActionSheet({ isOpen, onClose, title = "Create", actions = [] }) {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const run = (a) => {
    onClose?.();
    if (a.to) navigate(a.to);
    else if (typeof a.onClick === "function") a.onClick();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="grid grid-cols-2 gap-3 p-1">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => run(a)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                minHeight: 104,       // >=44px touch target, comfortable on mobile
                padding: "18px 12px",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 46, height: 46, borderRadius: 13,
                  background: "var(--green-tint)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {Icon && <Icon size={22} color="var(--green-dk)" strokeWidth={2} />}
              </span>
              <span style={{ color: "var(--soil)", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>
                {a.label}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

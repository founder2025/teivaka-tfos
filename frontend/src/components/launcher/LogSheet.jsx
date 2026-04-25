/**
 * LogSheet — Universal (+) tile grid, the action launcher for Nav v2.1 §12.
 *
 * Tile catalog: 9 LIVE actions wired to existing routes / forms, plus
 * 6 locked tiles (Add Block, Add Zone, New birth, Death, New field,
 * Nursery) that emit a "Coming soon" toast when tapped. Hybrid scope
 * per Boss's Day 3c Phase 2 decision — Add Block / Add Zone are
 * deferred until the matching POST endpoints ship.
 *
 * Mode-aware filter (auth.tenants.mode):
 *   SOLO       → first 3 LIVE tiles (Harvest, Paid, Pest seen)
 *   GROWTH     → first 8 LIVE tiles (Solo 3 + Plant + Start cycle +
 *                Input applied + Sale + New buyer)
 *   COMMERCIAL → all 9 LIVE tiles
 * Locked tiles render at every mode so farmers see what's coming.
 *
 * Tap behaviour:
 *   route   — close sheet + react-router navigate(route)
 *   action  — close sheet + emit named action ('open-cycle-modal')
 *             via search-param navigate (FarmDashboard reads ?action=
 *             on mount and opens NewCycleModal). Decoupled so we don't
 *             have to lift QueryClientProvider out of FarmDashboard.
 *   locked  — toast "Coming soon — {label}"
 *
 * Spec routes vs reality: per recon the canonical Nav v2.1 spec uses
 * names like /cash-ledger, /labor-attendance, /buyers, /sales-orders.
 * The deployed routes are /farm/cash, /farm/labor, /farm/buyers,
 * /farm/cash. The mapping below uses deployed names. Several of those
 * routes are still ComingSoon stubs (Phase 4.2/4.3) — the tile lands
 * the user there honestly rather than faking success.
 */
import { useNavigate } from "react-router-dom";
import {
  Leaf,
  Banknote,
  Bug,
  Sprout,
  CalendarPlus,
  FlaskConical,
  ShoppingCart,
  UserPlus,
  UserCheck,
  Square,
  Layers,
  Baby,
  AlertTriangle,
  Map as MapIcon,
  Lock,
} from "lucide-react";

import Modal from "../ui/Modal";

const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
};

function emitToast(message) {
  window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message } }));
}

const TILES = [
  { id: "harvest",    label: "Log harvest",   Icon: Leaf,          live: true,  route: "/farm/harvest/new" },
  { id: "paid",       label: "Paid",          Icon: Banknote,      live: true,  route: "/farm/cash" },
  { id: "pest",       label: "Pest seen",     Icon: Bug,           live: true,  route: "/farm/field-events" },
  { id: "plant",      label: "Plant",         Icon: Sprout,        live: true,  route: "/farm/field-events" },
  { id: "cycle",      label: "Start cycle",   Icon: CalendarPlus,  live: true,  action: "new-cycle" },
  { id: "input",      label: "Input applied", Icon: FlaskConical,  live: true,  route: "/farm/field-events" },
  { id: "sale",       label: "Sale",          Icon: ShoppingCart,  live: true,  route: "/farm/cash" },
  { id: "buyer",      label: "New buyer",     Icon: UserPlus,      live: true,  route: "/farm/buyers" },
  { id: "attendance", label: "Attendance",    Icon: UserCheck,     live: true,  route: "/farm/labor" },
  { id: "add-block",  label: "Add block",     Icon: Square,        live: false, phase: "Coming soon" },
  { id: "add-zone",   label: "Add zone",      Icon: Layers,        live: false, phase: "Coming soon" },
  { id: "birth",      label: "New birth",     Icon: Baby,          live: false, phase: "Phase 6.5" },
  { id: "death",      label: "Death",         Icon: AlertTriangle, live: false, phase: "Phase 6.5" },
  { id: "new-field",  label: "New field",     Icon: MapIcon,       live: false, phase: "Phase 4.3" },
  { id: "nursery",    label: "Nursery",       Icon: Sprout,        live: false, phase: "Phase 5.5" },
];

const LIVE_BY_MODE = {
  SOLO:       3,
  GROWTH:     8,
  COMMERCIAL: 9,
};

function Tile({ tile, onClick }) {
  const { Icon, live, label, phase } = tile;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex flex-col items-center justify-center rounded-2xl px-2 py-4 transition-transform"
      style={{
        background: live ? "white" : C.cream,
        border: `1px solid ${C.border}`,
        color: C.soil,
        opacity: live ? 1 : 0.75,
        minHeight: 96,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.98)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {!live && (
        <Lock
          size={12}
          aria-hidden
          style={{ position: "absolute", top: 8, right: 8, color: C.muted }}
        />
      )}
      <Icon size={28} strokeWidth={1.6} style={{ color: live ? C.green : C.muted }} />
      <span className="text-xs font-semibold mt-2 text-center" style={{ color: live ? C.soil : C.muted }}>
        {label}
      </span>
      {!live && phase && (
        <span className="text-[10px] mt-0.5" style={{ color: C.muted }}>
          {phase}
        </span>
      )}
    </button>
  );
}

export default function LogSheet({ isOpen, onClose, mode = "GROWTH" }) {
  const navigate = useNavigate();

  const liveLimit = LIVE_BY_MODE[mode] ?? LIVE_BY_MODE.GROWTH;
  const liveTiles = TILES.filter((t) => t.live).slice(0, liveLimit);
  const lockTiles = TILES.filter((t) => !t.live);
  const visible = [...liveTiles, ...lockTiles];

  function handleTile(t) {
    if (!t.live) {
      emitToast(`Coming soon — ${t.label}`);
      return;
    }
    onClose?.();
    if (t.action === "new-cycle") {
      navigate("/farm?action=new-cycle");
      return;
    }
    if (t.route) navigate(t.route);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="What do you want to log?"
      size="lg"
    >
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {visible.map((t) => (
          <Tile key={t.id} tile={t} onClick={() => handleTile(t)} />
        ))}
      </div>
      <div
        className="mt-4 text-[11px] text-center"
        style={{ color: C.muted }}
      >
        Tip — press <kbd style={{ background: C.cream, padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}` }}>Cmd</kbd>{" "}
        +{" "}
        <kbd style={{ background: C.cream, padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}` }}>L</kbd>{" "}
        to open this from anywhere.
      </div>
    </Modal>
  );
}

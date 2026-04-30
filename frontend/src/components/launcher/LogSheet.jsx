/**
 * LogSheet — Universal (+) tile grid, now data-driven from /api/v1/event-catalog.
 *
 * Replaces the prior hardcoded 15-tile array. All event types and their
 * farmer-English labels come from the backend catalog (Sprint 2/3 of
 * Catalog Redesign — naming_dictionary table per MBI Section 4 doctrine).
 *
 * The endpoint already filters by user role, tenant mode, and has_livestock,
 * so the client renders whatever it receives. The legacy `mode` prop is
 * accepted for backwards-compat but no longer drives client-side slicing.
 *
 * Tile activation:
 *   EVENT_ROUTES[event_type]  — live tile, navigates to route or fires action
 *   otherwise                  — locked tile, toasts "Coming soon — <label>"
 *
 * Locked tiles still render so farmers see what's coming. Phase 4.3's
 * generic event form will activate the remaining types.
 *
 * Data fetch: plain useState + useEffect + fetch, mirroring the pattern in
 * LauncherContext.jsx. The React Query hook is deliberately NOT used here
 * because LogSheet is mounted in FarmerShell, OUTSIDE any QueryClientProvider
 * scope (page-level providers like FarmDashboard's are not in scope here).
 * Calling that hook at this level would crash the React tree (white-screen
 * incident, 2026-04-30).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  // CROPS
  Sprout,
  Leaf,
  Droplets,
  SprayCan,
  Sparkles,
  Scissors,
  TreeDeciduous,
  Replace,
  Shovel,
  // ANIMALS
  Baby,
  HeartCrack,
  Syringe,
  Scale,
  Hexagon,
  PlusCircle,
  HandCoins,
  // MONEY
  Wallet,
  ShoppingCart,
  Tractor,
  PackageOpen,
  Users,
  Send,
  PackageCheck,
  // NOTES
  Bug,
  Stethoscope,
  CloudSun,
  CloudLightning,
  Eye,
  AlertTriangle,
  // OTHER
  UserCheck,
  PencilLine,
  PackageX,
  ListChecks,
  CalendarPlus,
  CalendarCheck,
  // Tile chrome
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

// Event types that have a live form/page today.
// Value: route string OR { action, route } for non-route handlers.
const EVENT_ROUTES = {
  HARVEST_LOGGED:    "/farm/harvest/new",
  CHEMICAL_APPLIED:  "/farm/field-events",
  FERTILIZER_APPLIED:"/farm/field-events",
  WEED_MANAGEMENT:   "/farm/field-events",
  PRUNING_TRAINING:  "/farm/field-events",
  PEST_SCOUTING:     "/farm/field-events",
  DISEASE_SCOUTING:  "/farm/field-events",
  FIELD_OBSERVATION: "/farm/field-events",
  PLANTING:          "/farm/field-events",
  CASH_OUT:          "/farm/cash",
  SELL_CROPS:        "/farm/cash",
  WAGES_PAID:        "/farm/cash",
  BUY_SUPPLIES:      "/farm/cash",
  WORKER_CHECKIN:    "/farm/labor",
  CYCLE_CREATED:     { action: "new-cycle", route: "/farm?action=new-cycle" },
};

// Lucide icon per event_type. Fallback to Sparkles for unmapped events.
// Visually-distinct icons selected per Phase 4.1-redux-v3 doctrine.
// NURSERY_BATCH_CREATED falls back to Sprout (Seedling not in installed lucide-react).
const EVENT_ICONS = {
  // CROPS
  PLANTING:              Sprout,
  HARVEST_LOGGED:        Leaf,
  IRRIGATION:            Droplets,
  CHEMICAL_APPLIED:      SprayCan,
  FERTILIZER_APPLIED:    Sparkles,
  WEED_MANAGEMENT:       Scissors,
  PRUNING_TRAINING:      TreeDeciduous,
  TRANSPLANT_LOGGED:     Replace,
  LAND_PREP:             Shovel,
  // ANIMALS
  LIVESTOCK_BIRTH:       Baby,
  LIVESTOCK_MORTALITY:   HeartCrack,
  VACCINATION:           Syringe,
  WEIGHT_CHECK:          Scale,
  HIVE_INSPECTION:       Hexagon,
  LIVESTOCK_ACQUIRED:    PlusCircle,
  LIVESTOCK_SALE:        HandCoins,
  // MONEY
  SELL_CROPS:            HandCoins,
  CASH_OUT:              Wallet,
  CASH_IN:               HandCoins,
  BUY_SUPPLIES:          ShoppingCart,
  HIRE_MACHINE:          Tractor,
  INPUT_RECEIVED:        PackageOpen,
  WAGES_PAID:            Users,
  DELIVERY_DISPATCHED:   Send,
  DELIVERY_CONFIRMED:    PackageCheck,
  // NOTES
  PEST_SCOUTING:         Bug,
  DISEASE_SCOUTING:      Stethoscope,
  WEATHER_OBSERVED:      CloudSun,
  WEATHER_IMPACT:        CloudLightning,
  FIELD_OBSERVATION:     Eye,
  INCIDENT_REPORT:       AlertTriangle,
  // OTHER
  NURSERY_BATCH_CREATED: Sprout,
  NURSERY_READY:         Sprout,
  GERMINATION_LOGGED:    Sparkles,
  WORKER_CHECKIN:        UserCheck,
  INPUT_USED_ADJUSTMENT: PencilLine,
  POST_HARVEST_LOSS:     PackageX,
  GRADING:               ListChecks,
  CYCLE_CREATED:         CalendarPlus,
  CYCLE_CLOSED:          CalendarCheck,
};

function Tile({ event, onClick }) {
  const evtType = event.event_type;
  const label = event.translated?.label || evtType;
  const isLive = !!EVENT_ROUTES[evtType];
  const Icon = EVENT_ICONS[evtType] || Sparkles;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-disabled={!isLive}
      className="relative flex flex-col items-center justify-center rounded-2xl px-2 py-4 transition-transform"
      style={{
        background: isLive ? "white" : C.cream,
        border: `1px solid ${C.border}`,
        color: C.soil,
        opacity: isLive ? 1 : 0.7,
        minHeight: 96,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {!isLive && (
        <Lock
          size={12}
          aria-hidden
          style={{ position: "absolute", top: 8, right: 8, color: C.muted }}
        />
      )}
      <Icon size={28} strokeWidth={1.6} style={{ color: isLive ? C.green : C.muted }} />
      <span
        className="text-xs font-semibold mt-2 text-center"
        style={{ color: isLive ? C.soil : C.muted }}
      >
        {label}
      </span>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{
        minHeight: 96,
        background: C.cream,
        border: `1px solid ${C.border}`,
      }}
    />
  );
}

export default function LogSheet({ isOpen, onClose, mode = "GROWTH" }) {
  void mode; // Server-side filtering now; legacy prop kept for compat.
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const token =
      localStorage.getItem("tfos_access_token") ||
      sessionStorage.getItem("tfos_access_token");

    fetch("/api/v1/event-catalog", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen]);

  const events = data?.data?.events || [];

  // Live first (sorted by sort_order), then locked (sorted by sort_order).
  const liveEvents = events
    .filter((e) => EVENT_ROUTES[e.event_type])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const lockedEvents = events
    .filter((e) => !EVENT_ROUTES[e.event_type])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const orderedEvents = [...liveEvents, ...lockedEvents];

  function handleTile(event) {
    const evtType = event.event_type;
    const label = event.translated?.label || evtType;
    const route = EVENT_ROUTES[evtType];

    if (!route) {
      emitToast(`Coming soon — ${label}`);
      return;
    }

    onClose?.();
    if (typeof route === "string") {
      navigate(route);
    } else if (route?.route) {
      navigate(route.route);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="What do you want to log?"
      size="lg"
    >
      {isLoading && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonTile key={i} />)}
        </div>
      )}

      {error && !isLoading && (
        <div className="text-center py-8 text-sm" style={{ color: C.muted }}>
          Couldn't load. Try again in a moment.
        </div>
      )}

      {!isLoading && !error && orderedEvents.length === 0 && (
        <div className="text-center py-8 text-sm" style={{ color: C.muted }}>
          No events available right now.
        </div>
      )}

      {!isLoading && !error && orderedEvents.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {orderedEvents.map((evt) => (
            <Tile
              key={evt.event_type}
              event={evt}
              onClick={() => handleTile(evt)}
            />
          ))}
        </div>
      )}

      <div className="mt-4 text-[11px] text-center" style={{ color: C.muted }}>
        Tip — press{" "}
        <kbd
          style={{
            background: C.cream,
            padding: "1px 5px",
            borderRadius: 4,
            border: `1px solid ${C.border}`,
          }}
        >
          Cmd
        </kbd>{" "}
        +{" "}
        <kbd
          style={{
            background: C.cream,
            padding: "1px 5px",
            borderRadius: 4,
            border: `1px solid ${C.border}`,
          }}
        >
          L
        </kbd>{" "}
        to open this from anywhere.
      </div>
    </Modal>
  );
}

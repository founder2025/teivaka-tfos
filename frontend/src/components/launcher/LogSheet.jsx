import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  // Level 1 group icons
  Sprout,
  PawPrint,
  Banknote,
  BookOpen,
  Boxes,
  Mic,
  // Level 2 event icons (CROPS)
  Leaf,
  Droplets,
  SprayCan,
  Sparkles,
  Scissors,
  TreeDeciduous,
  Replace,
  Shovel,
  // Level 2 event icons (ANIMALS)
  Baby,
  HeartCrack,
  Syringe,
  Scale,
  Hexagon,
  PlusCircle,
  HandCoins,
  // Level 2 event icons (MONEY)
  Wallet,
  ShoppingCart,
  Tractor,
  PackageOpen,
  Users,
  Send,
  PackageCheck,
  // Level 2 event icons (NOTES)
  Bug,
  Stethoscope,
  CloudSun,
  CloudLightning,
  Eye,
  AlertTriangle,
  // Level 2 event icons (OTHER)
  UserCheck,
  PencilLine,
  PackageX,
  ListChecks,
  CalendarPlus,
  CalendarCheck,
  // Tile chrome
  Lock,
  ArrowLeft,
} from "lucide-react";
import Modal from "../ui/Modal";

/**
 * LogSheet — two-level (+) catalog modal per Catalog Redesign Doctrine 2026-04-30.
 *
 * Level 1: 5 group tiles + voice mic slot (placeholder, Phase 4.6).
 * Level 2: events filtered to selected group, drill-down to forms.
 *
 * Doctrine Decision 4: two-level hierarchy prevents cognitive overload.
 * Doctrine Decision 3: Level 1 primary view = 5 group tiles + voice mic.
 *
 * Data: /api/v1/event-catalog (translated, role/mode/livestock-filtered server-side).
 * Plain useState/useEffect/fetch — QueryClientProvider out of scope at this mount
 * point (white-screen incident 2026-04-30; the React Query hook crashed the tree).
 *
 * Operator-locked Level-1 group icons:
 *   CROPS=Sprout, ANIMALS=PawPrint, MONEY=Banknote, NOTES=BookOpen, OTHER=Boxes
 *
 * Modal does not accept a headerLeft prop, so the back button renders as the
 * first element inside the body when on Level 2.
 */

const C = {
  green: "var(--green, #6AA84F)",
  cream: "var(--cream, #F8F3E9)",
  soil:  "var(--soil, #5C4033)",
};

const GROUP_ORDER = ["CROPS", "ANIMALS", "MONEY", "NOTES", "OTHER"];

const GROUP_ICONS = {
  CROPS:   Sprout,
  ANIMALS: PawPrint,
  MONEY:   Banknote,
  NOTES:   BookOpen,
  OTHER:   Boxes,
};

const EVENT_ROUTES = {
  HARVEST_LOGGED:    "/farm/harvest/new",
  CHEMICAL_APPLIED:  "/farm/field-events",
  CASH_OUT:          "/farm/cash",
  CASH_IN:           "/farm/cash",
  WORKER_CHECKIN:    "/farm/labor",
  CYCLE_CREATED:     { action: "new-cycle", route: "/farm?action=new-cycle" },
};

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

function GroupTile({ groupKey, label, count, onClick, disabled }) {
  const Icon = GROUP_ICONS[groupKey] || Boxes;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onClick(groupKey)}
      className={`
        flex flex-col items-center justify-center
        p-5 h-32 rounded-xl border transition-all
        ${
          disabled
            ? "bg-gray-50 border-gray-100 cursor-not-allowed opacity-60"
            : "bg-white border-gray-200 hover:border-[var(--green,#6AA84F)] hover:shadow-md active:scale-95"
        }
      `}
    >
      <Icon
        className="w-8 h-8 mb-2"
        style={{ color: disabled ? "#9CA3AF" : C.green }}
        strokeWidth={1.75}
      />
      <span
        className={`text-base font-medium ${
          disabled ? "text-gray-500" : "text-gray-900"
        }`}
      >
        {label}
      </span>
      {count !== undefined && (
        <span className="text-xs text-gray-500 mt-0.5">
          {count} {count === 1 ? "thing" : "things"}
        </span>
      )}
    </button>
  );
}

function VoiceTile() {
  return (
    <button
      type="button"
      disabled
      className="
        flex flex-col items-center justify-center
        p-5 h-32 rounded-xl border bg-gray-50 border-gray-100
        cursor-not-allowed opacity-60 relative
      "
    >
      <span className="absolute top-2 right-2">
        <Lock className="w-3.5 h-3.5 text-gray-400" />
      </span>
      <Mic className="w-8 h-8 mb-2 text-gray-400" strokeWidth={1.75} />
      <span className="text-base font-medium text-gray-500">Voice</span>
      <span className="text-xs text-gray-500 mt-0.5">Coming soon</span>
    </button>
  );
}

function EventTile({ event, onClick }) {
  const evtType = event.event_type;
  const label = event.translated?.label || evtType;
  const isLive = !!EVENT_ROUTES[evtType];
  const Icon = EVENT_ICONS[evtType] || Sparkles;

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={`
        relative flex flex-col items-center justify-center
        p-4 h-24 rounded-xl border transition-all
        ${
          isLive
            ? "bg-white border-gray-200 hover:border-[var(--green,#6AA84F)] hover:shadow-md active:scale-95 cursor-pointer"
            : "bg-gray-50 border-gray-100 cursor-default opacity-60"
        }
      `}
    >
      {!isLive && (
        <span className="absolute top-2 right-2">
          <Lock className="w-3 h-3 text-gray-400" />
        </span>
      )}
      <Icon
        className="w-6 h-6 mb-1"
        style={{ color: isLive ? C.green : "#9CA3AF" }}
        strokeWidth={1.75}
      />
      <span
        className={`text-sm text-center ${
          isLive ? "text-gray-900 font-medium" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export default function LogSheet({ isOpen, onClose, mode }) {
  void mode;
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedGroup(null);
      return;
    }

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

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const events = data?.data?.events || [];
  const groupLabels = data?.meta?.group_labels || {};

  const groupCounts = events.reduce((acc, e) => {
    acc[e.catalog_group] = (acc[e.catalog_group] || 0) + 1;
    return acc;
  }, {});

  const visibleGroups = GROUP_ORDER.filter((g) => groupCounts[g] > 0);

  const groupEvents = selectedGroup
    ? events
        .filter((e) => e.catalog_group === selectedGroup)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const isLevel2 = selectedGroup !== null;
  const headerTitle = isLevel2
    ? groupLabels[selectedGroup] || selectedGroup
    : "What do you want to log?";

  const handleEventClick = (event) => {
    const evtType = event.event_type;
    const label = event.translated?.label || evtType;
    const route = EVENT_ROUTES[evtType];

    if (!route) {
      window.dispatchEvent(
        new CustomEvent("tfos:toast", {
          detail: { message: `Coming soon — ${label}` },
        })
      );
      return;
    }

    onClose();
    if (typeof route === "string") {
      navigate(route);
    } else if (route.route) {
      navigate(route.route);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={headerTitle}
      size="lg"
    >
      {isLevel2 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setSelectedGroup(null)}
            aria-label="Back"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          Couldn't load. Try again in a moment.
        </div>
      )}

      {!isLoading && !error && !isLevel2 && visibleGroups.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No events available right now.
        </div>
      )}

      {!isLoading && !error && !isLevel2 && visibleGroups.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {visibleGroups.map((groupKey) => (
            <GroupTile
              key={groupKey}
              groupKey={groupKey}
              label={groupLabels[groupKey] || groupKey}
              count={groupCounts[groupKey]}
              onClick={setSelectedGroup}
            />
          ))}
          <VoiceTile />
        </div>
      )}

      {!isLoading && !error && isLevel2 && groupEvents.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No events here yet.
        </div>
      )}

      {!isLoading && !error && isLevel2 && groupEvents.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {groupEvents.map((evt) => (
            <EventTile
              key={evt.event_type}
              event={evt}
              onClick={handleEventClick}
            />
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 text-center text-xs text-gray-500">
        Tip — press{" "}
        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">
          Cmd
        </kbd>{" "}
        +{" "}
        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">
          L
        </kbd>{" "}
        to open this from anywhere.
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  // Level 1 group icons
  Sprout,
  PawPrint,
  Bird,
  Fish,
  Trees,
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
  Settings,
} from "lucide-react";
import Modal from "../ui/Modal";
import GroupCatalogSection from "../settings/GroupCatalogSection";

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

// Phase 5.10d: 11-group taxonomy per Catalog Redesign Doctrine Amendment v2.
// Order matches MeSettings/GroupCatalogSection: production groups first, then
// universal (MONEY/NOTES/OTHER). VOICE is appended in JSX as a Phase 4.6
// placeholder, not in this list.
const GROUP_ORDER = [
  "CROPS", "PERENNIALS", "LIVESTOCK", "POULTRY",
  "APICULTURE", "AQUACULTURE", "FORESTRY", "SPECIALTY",
  "MONEY", "NOTES", "OTHER",
];

const GROUP_ICONS = {
  CROPS:       Sprout,
  PERENNIALS:  TreeDeciduous,
  LIVESTOCK:   PawPrint,
  POULTRY:     Bird,
  APICULTURE:  Hexagon,
  AQUACULTURE: Fish,
  FORESTRY:    Trees,
  SPECIALTY:   Sparkles,
  MONEY:       Banknote,
  NOTES:       BookOpen,
  OTHER:       Boxes,
};

const EVENT_ROUTES = {
  HARVEST_LOGGED:    "/farm/harvest/new",
  CHEMICAL_APPLIED:  "/farm/field-events?new=1",
  // Strike #97 — CROPS B2 polymorphic forms (Strike #96 backend)
  PLANTING:           "/farm/field-events?type=PLANTING",
  IRRIGATION:         "/farm/field-events?type=IRRIGATION",
  FERTILIZER_APPLIED: "/farm/field-events?type=FERTILIZER_APPLIED",
  WEED_MANAGEMENT:    "/farm/field-events?type=WEED_MANAGEMENT",
  PRUNING_TRAINING:   "/farm/field-events?type=PRUNING_TRAINING",
  TRANSPLANT_LOGGED:  "/farm/field-events?type=TRANSPLANT_LOGGED",
  LAND_PREP:          "/farm/field-events?type=LAND_PREP",
  // Phase I5 — scouting / observations (unlock padlocked catalog tiles)
  PEST_SCOUTING:      "/farm/field-events?type=PEST_SCOUTING",
  DISEASE_SCOUTING:   "/farm/field-events?type=DISEASE_SCOUTING",
  FIELD_OBSERVATION:  "/farm/field-events?type=FIELD_OBSERVATION",
  CASH_OUT:          "/farm/cash",
  CASH_IN:           "/farm/cash",
  WORKER_CHECKIN:    "/farm/labor",
  CYCLE_CREATED:     "/farm/cycles/new",
  EGGS_COLLECTED:     "/farm/poultry/eggs/new",
  FLOCK_PLACED:       "/farm/poultry/flocks/new",
  MORTALITY_LOGGED:   "/farm/poultry/mortality/new",
  VACCINATION_GIVEN:  "/farm/poultry/vaccination/new",
  FEED_RECEIVED:      "/farm/poultry/feed/new",
  WEIGHT_CHECK:       "/farm/poultry/weight/new",
  BIRD_REPLACEMENT:   "/farm/poultry/birds/add",
  EGGS_SOLD:          "/farm/poultry/eggs/sell",
  BIRDS_SOLD:         "/farm/poultry/birds/sell",
  HEALTH_OBSERVATION: "/farm/poultry/health/new",
  FEED_USED:          "/farm/poultry/feed/used",
  LITTER_CHANGED:     "/farm/poultry/litter/changed",
  COOP_CLEANED:       "/farm/poultry/coop/cleaned",
  FEED_PURCHASED:     "/farm/poultry/feed/purchased",
  WATER_CONSUMED:     "/farm/poultry/water/consumed",
  MORTALITY_INVESTIGATED: "/farm/poultry/mortality/investigated",
  CULL_LOGGED:        "/farm/poultry/cull/logged",
  VISITOR_LOGGED:        "/farm/poultry/visitor/logged",
  PEST_CONTROL_APPLIED:  "/farm/poultry/pest-control/applied",
  TEMPERATURE_RECORDED:  "/farm/poultry/temperature/recorded",
  EGGS_GRADED:           "/farm/poultry/eggs/graded",
  FLOCK_MOVED:           "/farm/poultry/flock/moved",
  EQUIPMENT_MAINTAINED:  "/farm/poultry/equipment/maintained",
  INCIDENT_REPORTED:     "/farm/poultry/incident/reported",
  SUPPLIES_RECEIVED:     "/farm/poultry/supplies/received",
  // 129 catalog forensic — medication + livestock pack (Operator-ratified)
  MEDICATION_GIVEN:      "/farm/poultry/medication/new",
  LIVESTOCK_BIRTH:       "/farm/livestock/log?type=LIVESTOCK_BIRTH",
  LIVESTOCK_MORTALITY:   "/farm/livestock/log?type=LIVESTOCK_MORTALITY",
  LIVESTOCK_ACQUIRED:    "/farm/livestock/log?type=LIVESTOCK_ACQUIRED",
  LIVESTOCK_SALE:        "/farm/livestock/log?type=LIVESTOCK_SALE",
  VACCINATION:           "/farm/livestock/log?type=VACCINATION",
  MILK_COLLECTED:        "/farm/livestock/log?type=MILK_COLLECTED",
  ANIMAL_MOVED:          "/farm/livestock/log?type=ANIMAL_MOVED",
  BREEDING_LOGGED:       "/farm/livestock/log?type=BREEDING_LOGGED",
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
  MEDICATION_GIVEN:      Syringe,
  MILK_COLLECTED:        Droplets,
  ANIMAL_MOVED:          Replace,
  BREEDING_LOGGED:       Baby,
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
  // Phase 5.10c: Level 3 manage-panel state.
  // viewMode: 'grid' (Level 1+2) or 'manage' (Level 3 inline toggle panel)
  // activeFarmId: lifted from fetch closure so the manage panel can use it
  // localActiveGroups: optimistic override for shouldShowManageLink, set by
  // GroupCatalogSection's onStateChange callback while in manage panel
  const [viewMode, setViewMode] = useState("grid");
  const [activeFarmId, setActiveFarmId] = useState(null);
  const [localActiveGroups, setLocalActiveGroups] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedGroup(null);
      setViewMode("grid");
      setLocalActiveGroups(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const token =
      localStorage.getItem("tfos_access_token") ||
      sessionStorage.getItem("tfos_access_token");
    const authHdrs = { Authorization: `Bearer ${token}` };

    // Phase 5.9: fetch first farm so we can pass farm_id to event-catalog.
    // With farm_id, response carries meta.active_groups so we can show the
    // "Manage groups" link when fewer than 11 groups are active.
    // Falls back to no-farm-id (current behavior) if /api/v1/farms fails or
    // returns empty — graceful degradation per Phase 5.9 spec.
    (async () => {
      let firstFarmId = null;
      try {
        const fr = await fetch("/api/v1/farms", { headers: authHdrs });
        if (fr.ok) {
          const fb = await fr.json();
          const farms = fb?.data?.farms || fb?.data || fb?.farms || [];
          if (Array.isArray(farms) && farms.length > 0) {
            firstFarmId = farms[0].farm_id;
          }
        }
      } catch { /* fall through with firstFarmId = null */ }

      if (cancelled) return;

      // Lift farmId into component state so the manage panel (Phase 5.10c)
      // can use it.
      setActiveFarmId(firstFarmId);

      const url = firstFarmId
        ? `/api/v1/event-catalog?farm_id=${encodeURIComponent(firstFarmId)}`
        : "/api/v1/event-catalog";

      try {
        const res = await fetch(url, { headers: authHdrs });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setData(body);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const events = data?.data?.events || [];
  const groupLabels = data?.meta?.group_labels || {};
  // Phase 5.9: meta.active_groups present only when farm_id was passed to the
  // endpoint. When absent (older response shape, fetch failed, or no farm),
  // shouldShowManageLink stays false — graceful degradation.
  // Phase 5.10c: localActiveGroups overrides the server value while the user
  // is toggling in the inline manage panel — instant Level 1 link sync.
  const activeGroups = localActiveGroups ?? data?.meta?.active_groups ?? null;
  const shouldShowManageLink =
    Array.isArray(activeGroups) && activeGroups.length < 11;

  const groupCounts = events.reduce((acc, e) => {
    acc[e.catalog_group] = (acc[e.catalog_group] || 0) + 1;
    return acc;
  }, {});

  // Phase 5.10e: active_groups is the source of truth when present.
  // - If activeGroups is an array (farm has per-farm config from API meta or
  //   optimistic local override), tile visible iff group is in activeGroups.
  //   This honors BOTH doctrines: empty active groups still render (5.10d
  //   "no farmer left behind"), AND non-empty inactive groups now hide
  //   (5.10e "user controls their own (+)"). 5.10d shipped OR which made
  //   every populated group permanently visible regardless of toggle —
  //   defeating the user-controlled groups feature for livestock-only
  //   farmers wanting to hide Crops, etc.
  // - If activeGroups is null (no farm_id, fetch failed, older response
  //   shape), fall back to event-count check.
  // - VOICE special-cased: it's a Phase 4.1-redux-v4 placeholder, not a
  //   real catalog group, so always visible.
  const visibleGroups = GROUP_ORDER.filter((g) => {
    if (g === "VOICE") return true;
    if (Array.isArray(activeGroups)) return activeGroups.includes(g);
    return groupCounts[g] > 0;
  });

  const groupEvents = selectedGroup
    ? events
        .filter((e) => e.catalog_group === selectedGroup)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const isLevel2 = selectedGroup !== null;
  const isManage = viewMode === "manage";
  const headerTitle = isManage
    ? "Manage groups"
    : isLevel2
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
      {!isManage && !isLevel2 && (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setViewMode("manage")}
            aria-label="Manage groups"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition"
            style={{
              background: "transparent",
              border: "none",
              padding: 6,
              cursor: "pointer",
            }}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      )}

      {!isManage && isLevel2 && (
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

      {!isManage && isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isManage && error && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          Couldn't load. Try again in a moment.
        </div>
      )}

      {!isManage && !isLoading && !error && !isLevel2 && visibleGroups.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No events available right now.
        </div>
      )}

      {!isManage && !isLoading && !error && !isLevel2 && visibleGroups.length > 0 && (
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

      {!isManage && !isLoading && !error && isLevel2 && groupEvents.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No events here yet.
        </div>
      )}

      {!isManage && !isLoading && !error && isLevel2 && groupEvents.length > 0 && (
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

      {!isManage && !isLevel2 && shouldShowManageLink && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => setViewMode("manage")}
            className="text-sm underline"
            style={{
              color: C.soil,
              background: "transparent",
              border: "none",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            Manage groups →
          </button>
        </div>
      )}

      {/* Phase 5.10c: Level 3 inline manage panel */}
      {isManage && (
        <div className="flex flex-col" style={{ minHeight: 320 }}>
          <div
            className="overflow-y-auto"
            style={{ flex: 1, maxHeight: "60vh" }}
          >
            <GroupCatalogSection
              farmId={activeFarmId}
              inlineMode
              groupLabels={groupLabels}
              onStateChange={(newMap) => {
                const newActive = Object.entries(newMap)
                  .filter(([, v]) => v)
                  .map(([k]) => k);
                setLocalActiveGroups(newActive);
              }}
            />
          </div>
          <div
            className="mt-4 pt-3"
            style={{ borderTop: `1px solid ${C.border || "#E6E1D6"}` }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              style={{
                width: "100%",
                padding: 14,
                background: C.green || "#6AA84F",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {!isManage && (
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
      )}
    </Modal>
  );
}

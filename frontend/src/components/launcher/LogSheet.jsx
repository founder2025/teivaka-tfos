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
} from "lucide-react";
import Modal from "../ui/Modal";
import CaptureEngine from "../../capture/CaptureEngine";
import cropsConfig from "../../capture/config/crops";
import poultryConfig from "../../capture/config/animal-poultry";
import livestockConfig from "../../capture/config/animal-livestock";
import moneyConfig from "../../capture/config/whole-money";

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
  green: "var(--green, var(--green))",
  cream: "var(--cream, var(--cream))",
  soil:  "var(--soil, var(--soil))",
};


// Two-vertical model (Operator-ratified 2026-06-22): the farm has exactly two
// production verticals — plant-based and animal-based — plus whole-farm records.
// This replaces the 11-pillar tile wall at level-1 (the (+) bloat). Each vertical
// maps to its member catalog_groups; level-2 only surfaces events that reach a
// working route (no dead/padlocked tiles). PLANT drills into the Capture Engine.
const VERTICALS = [
  { key: "PLANT",  label: "Plant-based",  sub: "Crops · trees · nursery",        Icon: Sprout,   groups: ["CROPS", "PERENNIALS", "FORESTRY", "SPECIALTY"] },
  { key: "ANIMAL", label: "Animal-based", sub: "Poultry · livestock · bees · fish", Icon: PawPrint, groups: ["LIVESTOCK", "POULTRY", "APICULTURE", "AQUACULTURE"] },
  { key: "WHOLE",  label: "Whole-farm",   sub: "Money · notes · records",        Icon: Banknote, groups: ["MONEY", "NOTES", "OTHER"] },
];

function VerticalTile({ vertical, count, onClick }) {
  const { Icon, label, sub, key } = vertical;
  return (
    <button
      type="button"
      onClick={() => onClick(key)}
      className="flex flex-col items-center justify-center p-5 h-32 rounded-xl border transition-all bg-white border-gray-200 hover:border-[var(--green,var(--green))] hover:shadow-md active:scale-95"
    >
      <Icon className="w-8 h-8 mb-2" style={{ color: C.green }} strokeWidth={1.75} />
      <span className="text-base font-medium text-gray-900">{label}</span>
      <span className="text-xs text-gray-500 mt-0.5">{sub}</span>
    </button>
  );
}

// ── Slice F — align the (+): universal cross-cutting actions that work for
// EVERY enterprise (crops, poultry, aqua, forestry, livestock, bees…),
// independent of the catalog. Always shown at level-1 so a fish/forestry
// farmer has real capture the moment they open (+), not just Money/Notes/Other.
const UNIVERSAL_ACTIONS = [
  { key: "establish", label: "Add a production unit", sub: "Pond · paddock · woodlot · hive · bed", Icon: PlusCircle, route: "/farm/unit/new", accent: "var(--green-dk)" },
  { key: "sale",      label: "Record a sale",         sub: "Money in — any enterprise",          Icon: HandCoins,  route: "/farm/cash?type=in", accent: "var(--green)" },
  { key: "purchase",  label: "Record a purchase",     sub: "Money out — supplies, feed, fuel",   Icon: ShoppingCart, route: "/farm/cash?type=out", accent: "var(--amber)" },
];

function UniversalSection({ navigate, onClose }) {
  const go = (route) => { onClose(); navigate(route); };
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>Start here · works for any farm</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {UNIVERSAL_ACTIONS.map(({ key, label, sub, Icon, route, accent }) => (
          <button key={key} type="button" onClick={() => go(route)}
            className="flex items-center gap-3 text-left rounded-xl p-3 transition hover:brightness-95"
            style={{ background: "var(--paper)", border: "1px solid #E6DED0" }}>
            <span className="shrink-0 flex items-center justify-center rounded-lg" style={{ width: 38, height: 38, background: "var(--cream)", color: accent }}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate" style={{ color: "var(--soil)" }}>{label}</span>
              <span className="block text-[11px] truncate" style={{ color: "var(--muted)" }}>{sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LogSheet({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVertical, setSelectedVertical] = useState(null);
  // activeFarmId: lifted from fetch closure so the catalog fetch can use it.
  // ('Manage groups' was removed from the (+) — enterprises live in Me Settings
  // + onboarding; the (+) is logging-only.)
  const [activeFarmId, setActiveFarmId] = useState(null);
  // Animal vertical splits into two sub-flows (different anchor models): POULTRY
  // (flock-anchored, verb engine) and LIVESTOCK (species/paddock, existing tiles).
  const [animalSub, setAnimalSub] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedVertical(null);
      setAnimalSub(null);
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
  // meta.active_groups present only when farm_id was passed to the endpoint (else
  // null → fail-open: the (+) shows all verticals).
  const activeGroups = data?.meta?.active_groups ?? null;

  // Every vertical now drills into the config-driven Capture Engine — there is no
  // tile wall left (the (+) de-bloat is complete).
  const activeVertical = VERTICALS.find((v) => v.key === selectedVertical) || null;

  // Enterprise-scoped (+): show only the verticals/sub-flows this farm actually
  // runs (from farm_active_groups). WHOLE-farm (money/notes) is universal. Fail
  // OPEN when groups are unknown (no farm / not yet configured) so nothing is ever
  // hidden by accident.
  const hasGroups = Array.isArray(activeGroups) && activeGroups.length > 0;
  const visibleVerticals = hasGroups
    ? VERTICALS.filter((v) => v.key === "WHOLE" || v.groups.some((g) => activeGroups.includes(g)))
    : VERTICALS;
  const showPoultry = !hasGroups || activeGroups.includes("POULTRY");
  const showLivestock = !hasGroups || activeGroups.includes("LIVESTOCK");

  // If a farm runs only ONE animal sub-flow, skip the Poultry/Livestock chooser.
  useEffect(() => {
    if (selectedVertical === "ANIMAL" && !animalSub) {
      if (showPoultry && !showLivestock) setAnimalSub("POULTRY");
      else if (showLivestock && !showPoultry) setAnimalSub("LIVESTOCK");
    }
  }, [selectedVertical, animalSub, showPoultry, showLivestock]);

  const isLevel2 = selectedVertical !== null;
  const isManage = false; // 'Manage groups' moved out of the (+) → Me Settings + onboarding
  const headerTitle = isManage
    ? "Manage groups"
    : isLevel2
      ? (selectedVertical === "ANIMAL" && animalSub === "POULTRY" ? "Poultry"
        : selectedVertical === "ANIMAL" && animalSub === "LIVESTOCK" ? "Other livestock"
        : activeVertical?.label || selectedVertical)
      : "What do you want to log?";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={headerTitle}
      size="lg"
    >
      {!isManage && isLevel2 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => { if (selectedVertical === "ANIMAL" && animalSub && showPoultry && showLivestock) { setAnimalSub(null); } else { setAnimalSub(null); setSelectedVertical(null); } }}
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

      {/* Slice F — universal actions, always at level-1 for every enterprise */}
      {!isManage && !isLoading && !error && !isLevel2 && (
        <UniversalSection navigate={navigate} onClose={onClose} />
      )}

      {/* Level 1 — two production verticals + whole-farm (replaces the 11-pillar tile wall). */}
      {!isManage && !isLoading && !error && !isLevel2 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {visibleVerticals.map((v) => (
            <VerticalTile key={v.key} vertical={v} onClick={setSelectedVertical} />
          ))}
        </div>
      )}

      {/* PLANT drills into the Universal Capture Engine (verb-first). */}
      {!isManage && !isLoading && !error && isLevel2 && selectedVertical === "PLANT" && (
        <CaptureEngine config={cropsConfig} onDone={onClose} />
      )}

      {/* ANIMAL splits: pick the sub-flow (different anchor models). */}
      {!isManage && !isLoading && !error && isLevel2 && selectedVertical === "ANIMAL" && !animalSub && (
        (showPoultry || showLivestock) ? (
          <div className="grid grid-cols-2 gap-3">
            {showPoultry && (
              <button type="button" onClick={() => setAnimalSub("POULTRY")}
                className="flex flex-col items-center justify-center p-5 h-32 rounded-xl border bg-white border-gray-200 hover:border-[var(--green,var(--green))] hover:shadow-md active:scale-95 transition-all">
                <Bird className="w-8 h-8 mb-2" style={{ color: C.green }} strokeWidth={1.75} />
                <span className="text-base font-medium text-gray-900">Poultry</span>
                <span className="text-xs text-gray-500 mt-0.5">Chickens · ducks · eggs</span>
              </button>
            )}
            {showLivestock && (
              <button type="button" onClick={() => setAnimalSub("LIVESTOCK")}
                className="flex flex-col items-center justify-center p-5 h-32 rounded-xl border bg-white border-gray-200 hover:border-[var(--green,var(--green))] hover:shadow-md active:scale-95 transition-all">
                <PawPrint className="w-8 h-8 mb-2" style={{ color: C.green }} strokeWidth={1.75} />
                <span className="text-base font-medium text-gray-900">Other livestock</span>
                <span className="text-xs text-gray-500 mt-0.5">Cattle · goats · pigs · bees</span>
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">These animal types aren't available yet — they're on the roadmap.</div>
        )
      )}

      {/* POULTRY + LIVESTOCK each drill into the Capture Engine (different anchor models). */}
      {!isManage && !isLoading && !error && isLevel2 && selectedVertical === "ANIMAL" && animalSub === "POULTRY" && (
        <CaptureEngine config={poultryConfig} onDone={onClose} />
      )}
      {!isManage && !isLoading && !error && isLevel2 && selectedVertical === "ANIMAL" && animalSub === "LIVESTOCK" && (
        <CaptureEngine config={livestockConfig} onDone={onClose} />
      )}

      {/* WHOLE-farm drills into the Money engine (cash-ledger) — no tile wall. */}
      {!isManage && !isLoading && !error && isLevel2 && selectedVertical === "WHOLE" && (
        <CaptureEngine config={moneyConfig} onDone={onClose} />
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

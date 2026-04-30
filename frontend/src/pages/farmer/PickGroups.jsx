/**
 * PickGroups.jsx — pillar-side group picker, used inside the farm pillar
 * when a serious user wants to customize which groups appear in (+).
 *
 * Originally authored as /onboarding/what-you-farm wizard step (Phase 5.7);
 * relocated and renamed at Phase 5.10 doctrinal cleanup (2026-04-30) to
 * encode The Onboarding Doctrine: pillar decisions belong inside pillars,
 * not at signup.
 *
 * NOT currently wired into any route. Phase 5.10c will use this component
 * (or its tile-grid pattern) for the in-modal toggle panel inside (+).
 *
 * Implementation notes (preserved from original wizard authoring):
 * - 8 multi-select tiles in a mobile-first 2-col grid (4-col on tablet+).
 * - Tap toggles selection. Continue submits PUT to the Phase 5.5b endpoint;
 *   Skip with 0 selections triggers a confirmation.
 * - Plain fetch + token from localStorage (auth helper). No useQuery —
 *   QueryClientProvider not in scope at FarmerShell mount (per LogSheet recon).
 * - farm_id consumed from OnboardingContext when wizard was active; pillar-
 *   side use will source farm_id from pillar context or props (Phase 5.10c).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sprout,
  TreeDeciduous,
  PawPrint,
  Bird,
  Hexagon,
  Fish,
  Trees,
  Sparkles,
} from "lucide-react";

import {
  OnboardingProvider,
  useOnboarding,
} from "../../context/OnboardingContext";
import { authHeader } from "../../utils/auth";

const C = {
  soil:    "#2C1A0E",
  green:   "#3D8C40",
  greenDk: "#2C6A2E",
  cream:   "#F5EFE0",
  border:  "#E0D5C0",
  muted:   "#8A7863",
  red:     "#B23A2A",
};

function emitToast(message) {
  window.dispatchEvent(
    new CustomEvent("tfos:toast", { detail: { message } }),
  );
}

const PRODUCTION_GROUPS = [
  { key: "CROPS",       label: "Crops",         Icon: Sprout },
  { key: "PERENNIALS",  label: "Trees & vines", Icon: TreeDeciduous },
  { key: "LIVESTOCK",   label: "Livestock",     Icon: PawPrint },
  { key: "POULTRY",     label: "Poultry",       Icon: Bird },
  { key: "APICULTURE",  label: "Bees",          Icon: Hexagon },
  { key: "AQUACULTURE", label: "Fish & sea",    Icon: Fish },
  { key: "FORESTRY",    label: "Forestry",      Icon: Trees },
  { key: "SPECIALTY",   label: "Specialty",     Icon: Sparkles },
];

function PickGroupsInner() {
  const { state } = useOnboarding();
  const navigate = useNavigate();

  const farmId = state.farmId || null;
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (key) => {
    setSelections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function submit({ allowEmpty = false } = {}) {
    if (!farmId) {
      setError("Couldn't find your farm. Please go back and complete farm basics first.");
      return;
    }

    const selectedCount = Object.values(selections).filter(Boolean).length;
    if (!allowEmpty && selectedCount === 0) {
      const confirmed = window.confirm(
        "Continue with no production groups? You'll only see Money, Notes, and Other in your (+) menu. You can change this anytime in settings.",
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const groups = PRODUCTION_GROUPS.map((g) => ({
        catalog_group: g.key,
        is_active: !!selections[g.key],
      }));

      const res = await fetch(`/api/v1/farms/${farmId}/active-groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ groups }),
      });

      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try {
          const j = await res.json();
          msg = j?.detail?.error?.message || j?.detail?.message || j?.detail || j?.message || msg;
          if (typeof msg !== "string") msg = JSON.stringify(msg);
        } catch { /* noop */ }
        setError(`Couldn't save: ${msg}`);
        setSubmitting(false);
        return;
      }

      emitToast("Saved. Welcome to your farm.");
      navigate("/home");
    } catch (e) {
      setError(`Network error: ${e.message}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream }}>
      <div className="max-w-md mx-auto p-4 py-8">
        <div
          className="bg-white rounded-3xl p-6 space-y-6"
          style={{ border: `1px solid ${C.border}` }}
        >
          <header>
            <div
              className="text-xs uppercase tracking-wider font-medium"
              style={{ color: C.muted }}
            >
              Onboarding · Step 2 of 4
            </div>
            <h1 className="text-xl font-bold mt-1" style={{ color: C.soil }}>
              What do you farm?
            </h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Pick everything that applies. You can change this anytime in settings.
            </p>
          </header>

          {/* Tile grid: 2-col mobile, 4-col tablet+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRODUCTION_GROUPS.map(({ key, label, Icon }) => {
              const isSelected = !!selections[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={isSelected}
                  className="rounded-2xl p-4 flex flex-col items-center justify-center transition-all"
                  style={{
                    background: isSelected ? C.green : C.cream,
                    color: isSelected ? "white" : C.soil,
                    border: `1px solid ${isSelected ? C.greenDk : C.border}`,
                    minHeight: 96,
                    transform: isSelected ? "scale(1.02)" : "scale(1)",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={28} strokeWidth={1.6} />
                  <span
                    className="text-xs font-semibold mt-2 text-center"
                    style={{ color: isSelected ? "white" : C.soil }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Error inline */}
          {error && (
            <div
              className="text-sm rounded-xl px-3 py-2"
              style={{ background: "#FBE8E4", color: C.red, border: `1px solid #F1B8AC` }}
            >
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => submit({ allowEmpty: false })}
              disabled={submitting || !farmId}
              className="w-full px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-40"
              style={{ background: C.green, cursor: submitting ? "wait" : "pointer" }}
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => submit({ allowEmpty: true })}
              disabled={submitting}
              className="w-full text-xs underline"
              style={{ color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}
            >
              Skip — only Money / Notes / Other for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PickGroups() {
  return (
    <OnboardingProvider>
      <PickGroupsInner />
    </OnboardingProvider>
  );
}

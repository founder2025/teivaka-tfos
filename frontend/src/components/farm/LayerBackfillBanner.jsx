/**
 * LayerBackfillBanner — Strike #104a.
 *
 * Persistent dashboard banner shown when current tenant has cycles with
 * layer IS NULL. Per Strike #101 Rule 1 + Amendment 3 (Strike #104a):
 * the banner is NOT dismissable. No X button, no skip. Only disappears
 * when the needing-classification query returns 0 rows.
 *
 * Allowing dismissal would silently violate Rule 1 — farmer in fatigue
 * dismisses, never classifies, Bank Evidence PDF generated with NULL
 * layers, credit-narrative broken.
 *
 * The MODAL the banner opens can be closed (operator may classify in
 * batches); banner re-fires on next dashboard render until count = 0.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const C = {
  soil:    "var(--soil)",
  green:   "var(--green)",
  greenDk: "var(--green-dk)",
  amber:   "var(--amber)",
  red:     "var(--red)",
  cream:   "var(--cream)",
  border:  "var(--line)",
  muted:   "var(--muted)",
  bannerBg:     "#FFF5D6",
  bannerBorder: "#E8C77A",
};

const LAYER_OPTIONS = [
  {
    value: "CASH_FLOW",
    label: "Cash Flow Engine",
    desc:  "Weekly/biweekly income — eggplant, cabbage, broiler, tilapia",
  },
  {
    value: "FOOD_SECURITY",
    label: "Food Security Layer",
    desc:  "Reduces food cost — cassava, dalo, sweet potato, goat",
  },
  {
    value: "LONG_TERM_ASSET",
    label: "Long-Term Asset Crops",
    desc:  "Wealth building — kava, coconut, mango, cocoa",
  },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

async function fetchNeedingClassification() {
  const res = await fetch("/api/v1/cycles/needing-classification", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.cycles ?? [];
}

async function classifyCycle(cycleId, layer) {
  const res = await fetch(`/api/v1/cycles/${encodeURIComponent(cycleId)}/classify-layer`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ layer }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.detail?.error?.message || body?.detail?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

function ClassifyRow({ cycle, onSaved }) {
  // Pre-select suggested_layer when not borderline; force explicit pick when borderline.
  const initialLayer = cycle.requires_classification_at_creation
    ? ""
    : (cycle.suggested_layer || "");
  const [layer, setLayer] = useState(initialLayer);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!layer) {
      setError("Select a layer first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await classifyCycle(cycle.cycle_id, layer);
      onSaved(cycle.cycle_id);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
      setSubmitting(false);
    }
  }

  const cropLabel = cycle.production_name || cycle.production_id || "—";
  const blockLabel = cycle.pu_farmer_label || cycle.pu_id || "—";

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ border: `1px solid ${C.border}`, background: C.cream }}
    >
      <div>
        <div className="font-bold text-sm" style={{ color: C.soil }}>
          {cropLabel}
        </div>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>
          Cycle {cycle.block_sequence ?? cycle.cycle_id} · {blockLabel}
        </div>
      </div>

      {cycle.requires_classification_at_creation && (
        <div
          className="rounded p-2 text-xs"
          style={{ background: "#FFF7DD", color: C.amber, border: `1px solid ${C.border}` }}
        >
          This crop is <strong>layer-ambiguous</strong>; please classify based on your operation.
        </div>
      )}

      {cycle.layer_rationale && (
        <div className="text-xs italic" style={{ color: C.muted }}>
          {cycle.layer_rationale}
        </div>
      )}

      <div className="space-y-1.5">
        {LAYER_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-start gap-2 cursor-pointer rounded p-1.5 hover:bg-white"
          >
            <input
              type="radio"
              name={`layer-${cycle.cycle_id}`}
              value={opt.value}
              checked={layer === opt.value}
              onChange={() => setLayer(opt.value)}
              disabled={submitting}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium" style={{ color: C.soil }}>
                {opt.label}
              </div>
              <div className="text-xs" style={{ color: C.muted }}>
                {opt.desc}
              </div>
            </div>
          </label>
        ))}
      </div>

      {error && (
        <div className="text-xs" style={{ color: C.red }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={submitting || !layer}
        className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
        style={{ background: C.green }}
      >
        {submitting ? "Saving…" : "Save classification"}
      </button>
    </div>
  );
}

export default function LayerBackfillBanner() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ["cycles", "needing-classification"],
    queryFn: fetchNeedingClassification,
    staleTime: 0,
  });

  // Auto-close modal when all cycles have been classified.
  useEffect(() => {
    if (modalOpen && cycles.length === 0) {
      setModalOpen(false);
    }
  }, [modalOpen, cycles.length]);

  if (isLoading) return null;
  if (cycles.length === 0) return null;

  const count = cycles.length;

  return (
    <>
      {/* Banner — NO dismiss button per Strike #104a Amendment 3. */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: C.bannerBg,
          border: `1px solid ${C.bannerBorder}`,
          color: C.soil,
        }}
        role="alert"
        aria-live="polite"
      >
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">
            {count} {count === 1 ? "cycle needs" : "cycles need"} layer classification
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>
            Your farm is using the new 3-Layer system. Take 30 seconds to classify each cycle.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white shrink-0"
          style={{ background: C.green }}
        >
          Classify cycles
        </button>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-8 pb-8 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.5)" }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 space-y-4"
            style={{ background: "var(--paper)", border: `1px solid ${C.border}` }}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold" style={{ color: C.soil }}>
                  Classify cycles ({count} remaining)
                </h2>
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  Each cycle needs a strategic layer. Defaults are pre-selected based on the crop;
                  override if your operation differs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
                style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.muted }}
                aria-label="Close modal (banner stays until all cycles classified)"
              >
                Close
              </button>
            </header>

            <div className="space-y-3">
              {cycles.map((c) => (
                <ClassifyRow
                  key={c.cycle_id}
                  cycle={c}
                  onSaved={() => {
                    qc.invalidateQueries({ queryKey: ["cycles", "needing-classification"] });
                    qc.invalidateQueries({ queryKey: ["cycles"] });
                  }}
                />
              ))}
            </div>

            <div className="text-xs italic" style={{ color: C.muted }}>
              The banner disappears once every cycle is classified.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

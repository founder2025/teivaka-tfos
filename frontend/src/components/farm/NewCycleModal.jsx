/**
 * NewCycleModal — modal for creating a production cycle.
 *
 * Form: block (PU) + crop + start date + (optional) override-reason.
 * Live debounced rotation pre-flight via POST /cycles/rotation-check.
 * Submit: POST /cycles. On 409 keeps modal open + renders alternatives
 * inline so the farmer can swap crop or fill override-reason without
 * re-entering the rest.
 *
 * Cache invalidation on success is left to the parent (onCreated callback)
 * so the FarmDashboard can refetch its own queries via React Query's
 * invalidateQueries.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import Modal from "../ui/Modal";
import ThemedCombobox from "../inputs/ThemedCombobox.jsx";

const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
  amber:   "#BF9000",
  red:     "#D4442E",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
  blue:    "#2E6BB8",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function emitToast(message) {
  window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message } }));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchProductionUnits(farmId) {
  if (!farmId) return [];
  const url = `/api/v1/production-units?farm_id=${encodeURIComponent(farmId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? [];
}

async function fetchProductions() {
  const res = await fetch("/api/v1/productions?is_active=true", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.productions ?? [];
}

async function fetchRotationCheck({ pu_id, production_id, planting_date }) {
  const res = await fetch("/api/v1/cycles/rotation-check", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ pu_id, production_id, planting_date }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data ?? null;
}

function CategoryGroupedOptions({ productions }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of productions) {
      const cat = p.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(p);
    }
    // Sort each group by name; group order = key sort.
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, list]) => ({
        category: cat,
        list: list.slice().sort((a, b) =>
          (a.production_name || "").localeCompare(b.production_name || ""),
        ),
      }));
  }, [productions]);

  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.list.map((p) => (
            <option key={p.production_id} value={p.production_id}>
              {p.production_name}
              {p.local_name && p.local_name.toLowerCase() !== (p.production_name || "").toLowerCase()
                ? ` · ${p.local_name}`
                : ""}
              {" "}({p.production_id})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

const VERDICT_STYLE = {
  PREF:    { bg: "#E8F5E0", color: C.greenDk, label: "Preferred rotation" },
  OK:      { bg: "#E8F5E0", color: C.greenDk, label: "Good rotation" },
  COND:    { bg: "#FFF7DD", color: C.amber,   label: "Conditional — override required" },
  OVERLAY: { bg: "#E5EEF8", color: C.blue,    label: "Companion planting" },
  AVOID:   { bg: "#FFF7DD", color: C.amber,   label: "Avoid — override required" },
  BLOCK:   { bg: "#FDECEE", color: C.red,     label: "Blocked" },
  "N/A":   { bg: C.cream,   color: C.muted,   label: "First cycle on this block" },
};

const REQUIRES_OVERRIDE = new Set(["AVOID", "COND"]);
const HARD_BLOCK = new Set(["BLOCK"]);

function VerdictBadge({ verdict, message }) {
  if (!verdict) return null;
  const s = VERDICT_STYLE[verdict] || VERDICT_STYLE["N/A"];
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm"
      style={{ background: s.bg, color: s.color, border: `1px solid ${C.border}` }}
    >
      <div className="font-semibold">{s.label}</div>
      {message && <div className="text-xs mt-0.5" style={{ opacity: 0.85 }}>{message}</div>}
    </div>
  );
}

function AlternativesList({ alternatives, onPick }) {
  if (!alternatives || !alternatives.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.muted }}>
        Suggested alternatives
      </div>
      <div className="flex flex-wrap gap-1.5">
        {alternatives.slice(0, 6).map((a) => (
          <button
            key={a.production_id}
            type="button"
            onClick={() => onPick(a.production_id)}
            className="text-xs font-medium px-2 py-1 rounded"
            style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
          >
            {a.production_name || a.production_id}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewCycleModal({ isOpen, onClose, onCreated, farmId }) {
  const [puId, setPuId] = useState("");
  const [productionId, setProductionId] = useState("");
  const [plantingDate, setPlantingDate] = useState(todayISO());
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const debounceRef = useRef(null);

  const pusQuery = useQuery({
    queryKey: ["production-units", farmId],
    queryFn: () => fetchProductionUnits(farmId),
    enabled: !!isOpen && !!farmId,
    staleTime: 60_000,
  });
  const productionsQuery = useQuery({
    queryKey: ["productions"],
    queryFn: fetchProductions,
    enabled: !!isOpen,
    staleTime: 5 * 60_000,
  });

  // Reset on open.
  useEffect(() => {
    if (!isOpen) return;
    setProductionId("");
    setPlantingDate(todayISO());
    setOverrideReason("");
    setSubmitError("");
    setVerdict(null);
  }, [isOpen]);

  // Default PU once the list resolves.
  useEffect(() => {
    if (!puId && pusQuery.data && pusQuery.data.length > 0) {
      setPuId(pusQuery.data[0].pu_id);
    }
  }, [puId, pusQuery.data]);

  // Debounced rotation pre-flight on field change.
  useEffect(() => {
    if (!isOpen) return;
    if (!puId || !productionId || !plantingDate) {
      setVerdict(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setVerdictLoading(true);
      try {
        const r = await fetchRotationCheck({
          pu_id: puId,
          production_id: productionId,
          planting_date: plantingDate,
        });
        setVerdict(r);
      } catch (e) {
        setVerdict({ rotation_status: null, message: `Rotation check failed: ${e.message}`, alternatives: [] });
      } finally {
        setVerdictLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, puId, productionId, plantingDate]);

  const status = verdict?.rotation_status || verdict?.rule_status || null;
  const needsOverride = status && REQUIRES_OVERRIDE.has(status);
  const blocked = status && HARD_BLOCK.has(status);
  const overrideOk = !needsOverride || overrideReason.trim().length > 0;
  const submitDisabled =
    submitting ||
    verdictLoading ||
    !puId ||
    !productionId ||
    !plantingDate ||
    blocked ||
    !overrideOk;

  async function submit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const body = {
        pu_id: puId,
        production_id: productionId,
        planting_date: plantingDate,
      };
      if (needsOverride && overrideReason.trim()) {
        body.override_reason = overrideReason.trim();
      }
      const res = await fetch("/api/v1/cycles", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 201 || res.ok) {
        emitToast("Cycle started. Active cycles updated.");
        onCreated?.();
        onClose?.();
        return;
      }
      // Non-OK — try to parse for rotation 409 / validation 422 / other.
      let parsed = null;
      try { parsed = await res.json(); } catch { /* noop */ }
      if (res.status === 409) {
        const data = parsed?.detail?.error?.data || parsed?.detail?.data || null;
        const message = parsed?.detail?.error?.message || parsed?.detail?.message || `${res.status} ${res.statusText}`;
        if (data) {
          // Refresh inline verdict with the server's view.
          setVerdict({
            rotation_status: data.rotation_status || data.rule_status,
            rule_status:     data.rule_status || data.rotation_status,
            message:         data.message || message,
            min_rest_days:   data.min_rest_days,
            days_short:      data.days_short,
            previous_production_id: data.previous_production_id,
            alternatives:    data.alternatives || [],
          });
        }
        setSubmitError(message);
        return;
      }
      if (res.status === 422) {
        const detail = parsed?.detail;
        let msg;
        if (Array.isArray(detail)) {
          msg = detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
        } else {
          msg = typeof detail === "string" ? detail : JSON.stringify(detail);
        }
        setSubmitError(`Validation: ${msg}`);
        return;
      }
      const generic =
        parsed?.detail?.error?.message ||
        parsed?.detail?.message ||
        parsed?.detail ||
        `${res.status} ${res.statusText}`;
      setSubmitError(typeof generic === "string" ? generic : JSON.stringify(generic));
    } catch (e) {
      setSubmitError(`Network error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const pus = pusQuery.data || [];
  const productions = productionsQuery.data || [];

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
        style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={submit}
        disabled={submitDisabled}
        className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
        style={{ background: C.green }}
      >
        {submitting ? "Creating…" : "Create cycle"}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start a new cycle" footer={footer}>
      <div className="space-y-4">
          {/* Block selector */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Block
            </label>
            <ThemedCombobox
              id="pu_id"
              name="pu_id"
              value={puId}
              onChange={setPuId}
              options={pus.map((pu) => ({
                value: pu.pu_id,
                label: pu.farmer_label || pu.pu_id,
                sublabel: pu.area_ha ? `${pu.area_ha} ha` : undefined,
              }))}
              placeholder="Select block..."
              required
              loading={pusQuery.isLoading}
              emptyMessage="No blocks available"
            />
          </div>

          {/* Crop selector */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Crop / production
            </label>
            <select
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
              disabled={productionsQuery.isLoading}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            >
              <option value="">
                {productionsQuery.isLoading ? "Loading catalog…" : "Pick a crop…"}
              </option>
              <CategoryGroupedOptions productions={productions} />
            </select>
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Start date
            </label>
            <input
              type="date"
              value={plantingDate}
              min={todayISO()}
              onChange={(e) => setPlantingDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {/* Verdict + alternatives */}
          {(verdictLoading || verdict) && (
            <div className="space-y-2">
              {verdictLoading && (
                <div className="text-xs" style={{ color: C.muted }}>
                  Checking rotation…
                </div>
              )}
              {!verdictLoading && verdict && (
                <>
                  <VerdictBadge verdict={status} message={verdict.message} />
                  {(blocked || needsOverride) && (
                    <AlternativesList
                      alternatives={verdict.alternatives}
                      onPick={(pid) => setProductionId(pid)}
                    />
                  )}
                  {blocked && verdict.days_short != null && (
                    <div className="text-xs" style={{ color: C.muted }}>
                      Short by {verdict.days_short} day{verdict.days_short === 1 ? "" : "s"} of the
                      {verdict.min_rest_days != null ? ` ${verdict.min_rest_days}-day` : ""} rest period.
                      {verdict.previous_production_id ? ` Previous crop: ${verdict.previous_production_id}.` : ""}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Override reason */}
          {needsOverride && (
            <div>
              <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                Override reason (required)
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value.slice(0, 280))}
                rows={3}
                placeholder="Why are you proceeding despite the rotation warning?"
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
              />
              <div className="text-[11px] mt-0.5 text-right" style={{ color: C.muted }}>
                {overrideReason.length}/280
              </div>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div
              className="rounded-lg p-2 text-xs"
              style={{ background: "#FDECEE", color: C.red, border: `1px solid ${C.border}` }}
            >
              {submitError}
            </div>
          )}
      </div>
    </Modal>
  );
}

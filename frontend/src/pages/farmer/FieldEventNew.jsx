/**
 * FieldEventNew.jsx — /farm/field-events
 *
 * Phase 4.x: log a field activity (planting, fertilize, irrigate, spray,
 * pest/disease observation, partial/final harvest, etc) against an active
 * production cycle. Form is mobile-first, single-screen, conditional
 * fields per event type.
 *
 * Backend contract (POST /api/v1/field-events, FieldEventCreate):
 *   - farm_id, pu_id, cycle_id, event_type, event_date — required
 *   - SPRAY events ALSO require chemical_application (chem_name string),
 *     quantity, quantity_unit. Server resolves chem_name against
 *     shared.chemical_library and returns 422 UNKNOWN_CHEMICAL if not
 *     found. (Free-text input — no /api/v1/chemicals endpoint exists yet.)
 *   - notes — optional free text
 *
 * On 201 success, server emits an audit.events row (FIELD_EVENT_LOGGED)
 * via the v4.1 Bank Evidence spine. Idempotency-Key header supported but
 * not used here.
 *
 * Gate: user must have at least one ACTIVE cycle. Empty-state CTA routes
 * to /farm to start one if not.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";

const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
  red:     "#D4442E",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
};

// Canonical EVENT_TYPES — must match field_events.py:43-47 frozenset.
// Drift = silent 422 on submit. Ordered by farmer mental model
// (planting first, then routine activities, then observations, then harvest).
const EVENT_TYPES = [
  { value: "PLANTING",        label: "Planting" },
  { value: "TRANSPLANT",      label: "Transplant" },
  { value: "FERTILIZE",       label: "Fertilize" },
  { value: "IRRIGATE",        label: "Irrigate" },
  { value: "SPRAY",           label: "Spray (chemical)" },
  { value: "PRUNE",           label: "Prune" },
  { value: "PEST_OBSERVE",    label: "Pest sighting" },
  { value: "DISEASE_OBSERVE", label: "Disease sighting" },
  { value: "HARVEST_PARTIAL", label: "Partial harvest" },
  { value: "HARVEST_FINAL",   label: "Final harvest" },
  { value: "INSPECTION",      label: "Inspection" },
  { value: "SOIL_TEST",       label: "Soil test" },
  { value: "PHOTO",           label: "Photo / record" },
  { value: "OTHER",           label: "Other" },
];

const QTY_UNITS = ["L", "ml", "kg", "g", "L/ha", "kg/ha", "doses"];

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchActiveCycles() {
  const res = await fetch("/api/v1/cycles?cycle_status=ACTIVE", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  // Part 13 envelope: { status, data: { cycles: [...] }, meta }
  return body?.data?.cycles ?? body?.cycles ?? [];
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

function FieldEventForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [cycleId, setCycleId]       = useState("");
  const [eventType, setEventType]   = useState("");
  const [eventDate, setEventDate]   = useState(todayISO());
  const [chemName, setChemName]     = useState("");
  const [quantity, setQuantity]     = useState("");
  const [quantityUnit, setQuantityUnit] = useState("L");
  const [notes, setNotes]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  // Combobox state for the chemical name field.
  const [chemOpen, setChemOpen]               = useState(false);
  const [chemHighlightIdx, setChemHighlightIdx] = useState(0);
  const chemInputRef    = useRef(null);
  const chemDropdownRef = useRef(null);

  const cyclesQuery = useQuery({
    queryKey: ["cycles", "active"],
    queryFn: fetchActiveCycles,
  });

  // Default to first cycle once loaded.
  useEffect(() => {
    if (!cycleId && cyclesQuery.data && cyclesQuery.data.length > 0) {
      setCycleId(cyclesQuery.data[0].cycle_id);
    }
  }, [cycleId, cyclesQuery.data]);

  // Look up the selected cycle to grab farm_id / pu_id (required by backend).
  const selectedCycle = useMemo(
    () => (cyclesQuery.data || []).find((c) => c.cycle_id === cycleId),
    [cyclesQuery.data, cycleId],
  );

  const isSpray = eventType === "SPRAY";

  // Chemicals catalog — fetched only when SPRAY is selected and we have a cycle.
  // Scoped to the cycle's production_id so the datalist is crop-relevant.
  const cropFilter = selectedCycle?.production_id || null;
  const chemicalsQuery = useQuery({
    queryKey: ["chemicals", cropFilter ?? "_all"],
    queryFn: async () => {
      const url = cropFilter
        ? `/api/v1/chemicals?registered_for=${encodeURIComponent(cropFilter)}`
        : "/api/v1/chemicals";
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: isSpray && !!selectedCycle,
    staleTime: 5 * 60_000,
  });

  // Resolve free-text input against the loaded catalog (case-insensitive exact).
  const matchedChem = useMemo(() => {
    if (!chemName.trim()) return null;
    const list = chemicalsQuery.data?.data ?? [];
    const target = chemName.trim().toLowerCase();
    return list.find((c) => c.chem_name.toLowerCase() === target) || null;
  }, [chemName, chemicalsQuery.data]);

  // Combobox: substring filter for the dropdown list.
  const allChems = chemicalsQuery.data?.data ?? [];
  const filteredChems = useMemo(() => {
    if (!chemName.trim()) return allChems;
    const target = chemName.toLowerCase();
    return allChems.filter((c) => c.chem_name.toLowerCase().includes(target));
  }, [chemName, allChems]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!chemOpen) return;
    function onMouseDown(e) {
      const inInput    = chemInputRef.current?.contains(e.target);
      const inDropdown = chemDropdownRef.current?.contains(e.target);
      if (!inInput && !inDropdown) setChemOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [chemOpen]);

  function handleChemKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setChemOpen(true);
      setChemHighlightIdx((i) => Math.min(i + 1, Math.max(filteredChems.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setChemHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (chemOpen && filteredChems.length > 0) {
        e.preventDefault();
        const pick = filteredChems[chemHighlightIdx] || filteredChems[0];
        if (pick) {
          setChemName(pick.chem_name);
          setChemOpen(false);
        }
      }
    } else if (e.key === "Escape") {
      setChemOpen(false);
    } else if (e.key === "Tab") {
      setChemOpen(false);
    }
  }

  const sprayValid = !isSpray || (chemName.trim() && quantity && quantityUnit);

  const submitDisabled =
    submitting ||
    !cycleId ||
    !selectedCycle ||
    !eventType ||
    !eventDate ||
    !sprayValid;

  async function submit(e) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError("");

    const body = {
      farm_id:    selectedCycle.farm_id,
      pu_id:      selectedCycle.pu_id,
      cycle_id:   cycleId,
      event_type: eventType,
      event_date: eventDate,
    };
    if (notes.trim()) body.notes = notes.trim();
    if (isSpray) {
      body.chemical_application = chemName.trim();
      body.quantity = Number(quantity);
      body.quantity_unit = quantityUnit;
    }

    try {
      const res = await fetch("/api/v1/field-events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 201 || res.ok) {
        emitToast("Activity logged.");
        qc.invalidateQueries({ queryKey: ["field-events"] });
        qc.invalidateQueries({ queryKey: ["cycles", "active"] });
        qc.invalidateQueries({ queryKey: ["tasks-next"] });
        navigate("/farm");
        return;
      }
      // Try to surface useful detail (envelope or FastAPI default).
      let parsed = null;
      try { parsed = await res.json(); } catch { /* noop */ }
      const msg =
        parsed?.detail?.error?.message ||
        parsed?.detail?.message ||
        (typeof parsed?.detail === "string" ? parsed.detail : null) ||
        `${res.status} ${res.statusText}`;
      setError(msg);
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Empty state: no active cycle.
  if (!cyclesQuery.isLoading && (!cyclesQuery.data || cyclesQuery.data.length === 0)) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <h1 className="text-xl font-bold mb-2" style={{ color: C.soil }}>
          No active cycle
        </h1>
        <p className="text-sm mb-6" style={{ color: C.muted }}>
          Field activities must be logged against an active production cycle.
          Start a cycle first, then come back here to log activity.
        </p>
        <button
          type="button"
          onClick={() => navigate("/farm")}
          className="text-sm font-semibold px-5 py-2 rounded-lg text-white"
          style={{ background: C.green }}
        >
          Go to Farm Overview
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <div
        className="bg-white rounded-2xl px-5 py-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <header className="mb-4">
          <div
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: C.muted }}
          >
            Farm activity log
          </div>
          <h1 className="text-xl font-bold mt-1" style={{ color: C.soil }}>
            Log field activity
          </h1>
        </header>

        <form onSubmit={submit} className="space-y-4">
          {/* Cycle */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Cycle *
            </label>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              disabled={cyclesQuery.isLoading}
              required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            >
              {cyclesQuery.isLoading && <option>Loading cycles…</option>}
              {(cyclesQuery.data || []).map((c) => {
                const crop = c.production_name || c.production_id || "—";
                const block = c.pu_farmer_label || c.pu_id;
                return (
                  <option key={c.cycle_id} value={c.cycle_id}>
                    {crop} on {block}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Event type */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Activity type *
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            >
              <option value="">Pick an activity…</option>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Event date */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Date *
            </label>
            <input
              type="date"
              value={eventDate}
              max={todayISO()}
              onChange={(e) => setEventDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {/* SPRAY-only fields */}
          {isSpray && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                  Chemical name *
                </label>
                <div className="relative">
                  <input
                    ref={chemInputRef}
                    type="text"
                    value={chemName}
                    onChange={(e) => {
                      setChemName(e.target.value);
                      setChemOpen(true);
                      setChemHighlightIdx(0);
                    }}
                    onFocus={() => setChemOpen(true)}
                    onKeyDown={handleChemKeyDown}
                    placeholder="e.g. Dimethoate 40% EC"
                    autoComplete="off"
                    required
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
                  />
                  {chemOpen && filteredChems.length > 0 && (
                    <ul
                      ref={chemDropdownRef}
                      className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg shadow-lg"
                      style={{ background: C.cream, border: `1px solid ${C.border}` }}
                    >
                      {filteredChems.map((c, idx) => (
                        <li
                          key={c.chem_name}
                          onClick={() => { setChemName(c.chem_name); setChemOpen(false); }}
                          onMouseEnter={() => setChemHighlightIdx(idx)}
                          className="px-3 py-2 cursor-pointer"
                          style={{
                            background: idx === chemHighlightIdx ? "#E9F2DD" : "transparent",
                            borderBottom: idx === filteredChems.length - 1 ? "none" : `1px solid ${C.border}`,
                          }}
                        >
                          <div className="font-medium text-sm" style={{ color: C.soil }}>{c.chem_name}</div>
                          <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                            WHD {c.withholding_period_days}d · {c.active_ingredient}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {chemOpen && filteredChems.length === 0 && chemName && (
                    <div
                      className="absolute z-50 mt-1 w-full px-3 py-2 rounded-lg shadow-lg text-xs"
                      style={{ background: C.cream, border: `1px solid ${C.border}`, color: C.muted }}
                    >
                      No chemicals match &ldquo;{chemName}&rdquo; for this crop
                    </div>
                  )}
                </div>
                {matchedChem && (
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    WHD {matchedChem.withholding_period_days} days · active: {matchedChem.active_ingredient}
                  </p>
                )}
                <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                  Must match a chemical in the system. WHD clearance auto-computed.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                    Quantity *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 5"
                    required
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                    Unit *
                  </label>
                  <select
                    value={quantityUnit}
                    onChange={(e) => setQuantityUnit(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
                  >
                    {QTY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional details about this activity"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {error && (
            <div
              className="rounded-lg p-2 text-xs"
              style={{ background: "#FDECEE", color: C.red, border: `1px solid ${C.border}` }}
            >
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate("/farm")}
              disabled={submitting}
              className="text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: "white", border: `1px solid ${C.border}`, color: C.soil }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
              style={{ background: C.green }}
            >
              {submitting ? "Logging…" : "Log activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FieldEventNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <FieldEventForm />
    </QueryClientProvider>
  );
}

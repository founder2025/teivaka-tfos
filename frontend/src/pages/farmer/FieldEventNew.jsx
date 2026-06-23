/**
 * FieldEventNew.jsx — /farm/field-events
 *
 * Phase 4.x: log a field activity (planting, fertilize, irrigate, spray,
 * pest/disease observation, partial/final harvest, etc) against an active
 * production cycle. Form is mobile-first, single-screen, conditional
 * fields per event type.
 *
 * Backend contract (POST /api/v1/field-events, FieldEventCreate):
 *   - farm_id, pu_id, cycle_id, production_id, event_type, event_date — required
 *     (Strike #100 added production_id as user-explicit field)
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
 * Strike #100: every Crops form uses the shared CropAndCycleFields
 * component (CROP -> CYCLE dropdown pair, CYCLE filtered by selected
 * crop, ordinal labels). PLANTING + TRANSPLANT_LOGGED additionally have
 * a VARIETY dropdown after CYCLE.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Plus, ListChecks } from "lucide-react";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";
import ThemedCombobox from "../../components/inputs/ThemedCombobox.jsx";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

const C = {
  soil:    "var(--soil)",
  green:   "var(--green)",
  greenDk: "var(--green-dk)",
  red:     "var(--red)",
  cream:   "var(--cream)",
  border:  "#E6DED0",
  muted:   "var(--muted)",
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

async function fetchCropProductions() {
  const res = await fetch("/api/v1/productions?is_active=true&crop_only=true", {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.productions ?? body?.productions ?? [];
}

async function fetchCropVarieties(productionId) {
  if (!productionId) return [];
  const res = await fetch(
    `/api/v1/crop-varieties?production_id=${encodeURIComponent(productionId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.varieties ?? body?.varieties ?? [];
}

// ============================================================================
// Strike #100 — shared CROP + CYCLE selector hook + render component
// ============================================================================
// Used by every Crops event form (PLANTING, TRANSPLANT_LOGGED, IRRIGATION,
// FERTILIZER_APPLIED, WEED_MANAGEMENT, PRUNING_TRAINING, LAND_PREP,
// legacy SPRAY). CYCLE dropdown is filtered to the selected crop and
// renders ordinals ("Cycle 1", "Cycle 2") instead of crop-name labels.

function useCropAndCycle() {
  const [cropId, setCropId] = useState("");
  const [cycleId, setCycleId] = useState("");

  const productionsQuery = useQuery({
    queryKey: ["productions", "crops"],
    queryFn: fetchCropProductions,
  });
  const cyclesQuery = useQuery({
    queryKey: ["cycles", "active"],
    queryFn: fetchActiveCycles,
  });

  const filteredCycles = useMemo(() => {
    const all = cyclesQuery.data ?? [];
    if (!cropId) return [];
    return all.filter((c) => c.production_id === cropId);
  }, [cyclesQuery.data, cropId]);

  useEffect(() => {
    setCycleId("");
  }, [cropId]);

  useEffect(() => {
    if (!cycleId && filteredCycles.length > 0) {
      setCycleId(filteredCycles[0].cycle_id);
    }
  }, [cycleId, filteredCycles]);

  const selectedCycle = useMemo(
    () => filteredCycles.find((c) => c.cycle_id === cycleId),
    [filteredCycles, cycleId],
  );

  return {
    cropId, setCropId,
    cycleId, setCycleId,
    productionsQuery,
    cyclesQuery,
    filteredCycles,
    selectedCycle,
  };
}

function CropAndCycleFields({
  cropId, setCropId, cycleId, setCycleId,
  productionsQuery, cyclesQuery, filteredCycles,
}) {
  const cyclePlaceholder = !cropId
    ? "Pick a crop first"
    : filteredCycles.length === 0
      ? "No active cycles for this crop"
      : "Select cycle...";

  return (
    <>
      <div>
        <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
          Crop *
        </label>
        <ThemedSelect
          id="crop"
          name="production_id"
          value={cropId}
          onChange={setCropId}
          options={(productionsQuery.data ?? []).map((p) => ({
            value: p.production_id,
            label: p.production_name,
          }))}
          placeholder="Select crop..."
          required
          disabled={productionsQuery.isLoading}
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
          Cycle *
        </label>
        <ThemedSelect
          id="cycle"
          name="cycle_id"
          value={cycleId}
          onChange={setCycleId}
          options={filteredCycles.map((c) => ({
            value: c.cycle_id,
            label: `Cycle ${c.block_sequence ?? c.cycle_id}`,
          }))}
          placeholder={cyclePlaceholder}
          required
          disabled={!cropId || cyclesQuery.isLoading}
        />
      </div>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

// ============================================================================
// Strike #97 — CROPS B2 polymorphic forms (new codepath)
// ============================================================================
// 7 event types unlocked by Strike #97. Catalog vocab; submits to /api/v1/events
// with nested anchors per Strike #96. CHEMICAL_APPLIED stays on legacy form.
const STRIKE_96_FIELDS = {
  PLANTING: {
    label: "Planting",
    fields: [
      { name: "variety",      type: "text",   label: "Variety",      maxLength: 120 },
      { name: "plant_count",  type: "int",    label: "Plant count",  min: 0 },
      { name: "spacing_cm",   type: "int",    label: "Spacing (cm)", min: 0 },
    ],
  },
  IRRIGATION: {
    label: "Irrigation",
    fields: [
      { name: "duration_minutes", type: "int",    label: "Duration (min)", min: 0 },
      { name: "method",           type: "select", label: "Method",         options: ["DRIP","OVERHEAD","FLOOD","HAND","OTHER"] },
      { name: "water_source",     type: "text",   label: "Water source",   maxLength: 120 },
    ],
  },
  FERTILIZER_APPLIED: {
    label: "Fertilizer applied",
    fields: [
      { name: "product_name",       type: "text",   label: "Product name",  maxLength: 120 },
      { name: "rate_kg_per_ha",     type: "number", label: "Rate (kg/ha)",  min: 0 },
      { name: "application_method", type: "select", label: "Method",        options: ["BROADCAST","BAND","FOLIAR","FERTIGATION","OTHER"] },
    ],
  },
  WEED_MANAGEMENT: {
    label: "Weed management",
    fields: [
      { name: "method",           type: "select", label: "Method",            options: ["MANUAL","MECHANICAL","CHEMICAL","MULCH","COVER_CROP","OTHER"], required: true },
      { name: "area_treated_ha",  type: "number", label: "Area treated (ha)", min: 0 },
      { name: "labor_hours",      type: "number", label: "Labor hours",       min: 0 },
    ],
  },
  PRUNING_TRAINING: {
    label: "Pruning / training",
    fields: [
      { name: "activity",     type: "select", label: "Activity",     options: ["PRUNE","TRAIN","STAKE","TIE","TOPPING","OTHER"], required: true },
      { name: "plants_count", type: "int",    label: "Plants count", min: 0 },
      { name: "labor_hours",  type: "number", label: "Labor hours",  min: 0 },
    ],
  },
  TRANSPLANT_LOGGED: {
    label: "Transplant",
    fields: [
      { name: "plants_transplanted", type: "int", label: "Plants transplanted", min: 0, required: true },
      { name: "spacing_cm",          type: "int", label: "Spacing (cm)",        min: 0 },
    ],
  },
  LAND_PREP: {
    label: "Land preparation",
    fields: [
      { name: "activity",         type: "select", label: "Activity",          options: ["PLOUGH","HARROW","BED_FORM","CLEAR","AMEND_SOIL","OTHER"], required: true },
      { name: "area_prepared_ha", type: "number", label: "Area prepared (ha)", min: 0 },
      { name: "labor_hours",      type: "number", label: "Labor hours",        min: 0 },
      { name: "equipment_used",   type: "text",   label: "Equipment used",     maxLength: 120 },
    ],
  },
  // Phase I5 — scouting / observations (prototype PEST_SCOUTING / DISEASE_SCOUTING / FIELD_OBSERVATION)
  PEST_SCOUTING: {
    label: "Pest scouting",
    fields: [
      { name: "pest_type",     type: "select", label: "Pest type",     options: ["Whitefly","Aphid","Cutworm","Fruit fly","Caterpillar","Other"], required: true },
      { name: "density",       type: "select", label: "Density",       options: ["none","low","med","high"], required: true },
      { name: "affected_area", type: "text",   label: "Affected area", maxLength: 200 },
    ],
  },
  DISEASE_SCOUTING: {
    label: "Disease scouting",
    fields: [
      { name: "disease_type",    type: "select", label: "Disease type",          options: ["Early blight","Late blight","Powdery mildew","Bacterial wilt","Mosaic virus","Other"], required: true },
      { name: "severity",        type: "select", label: "Severity",              options: ["low","med","high","critical"], required: true },
      { name: "affected_plants", type: "int",    label: "Affected plants count", min: 0 },
    ],
  },
  FIELD_OBSERVATION: {
    label: "Field observation",
    fields: [
      { name: "observation_type", type: "select", label: "Observation type", required: true, options: [
        { value: "GROWTH_NOTE",     label: "Growth note" },
        { value: "SOIL_CONDITION",  label: "Soil condition" },
        { value: "EQUIPMENT_ISSUE", label: "Equipment issue" },
        { value: "VISITOR",         label: "Visitor/visit" },
        { value: "GENERAL",         label: "General" },
      ] },
    ],
  },
  // CROPS G3 (134) — the 15 unlocked crop forms
  MULCHING: { label: "Mulching", fields: [
    { name: "material", type: "select", label: "Material", options: ["STRAW","GRASS","PLASTIC","LEAVES","OTHER"], required: true },
    { name: "area_treated_ha", type: "number", label: "Area (ha)", min: 0 },
    { name: "labor_hours", type: "number", label: "Labour hours", min: 0 },
  ] },
  THINNING: { label: "Thinning", fields: [
    { name: "plants_removed", type: "int", label: "Plants removed", min: 0 },
    { name: "labor_hours", type: "number", label: "Labour hours", min: 0 },
  ] },
  COVER_CROP_PLANTED: { label: "Cover crop planted", fields: [
    { name: "cover_crop", type: "text", label: "Cover crop", maxLength: 120, required: true },
    { name: "area_ha", type: "number", label: "Area (ha)", min: 0 },
  ] },
  SEED_SAVED: { label: "Seed saved", fields: [
    { name: "crop", type: "text", label: "Crop / variety", maxLength: 120, required: true },
    { name: "qty_kg", type: "number", label: "Quantity (kg)", min: 0 },
  ] },
  BIOLOGICAL_CONTROL_APPLIED: { label: "Biological control", fields: [
    { name: "agent", type: "text", label: "Agent / product", maxLength: 120, required: true },
    { name: "target_pest", type: "text", label: "Target pest", maxLength: 120 },
    { name: "area_ha", type: "number", label: "Area (ha)", min: 0 },
  ] },
  CROP_HEALTH_OBSERVATION: { label: "Crop health", fields: [
    { name: "status", type: "select", label: "How does it look?", options: ["HEALTHY","STRESSED","POOR"], required: true },
    { name: "issue", type: "text", label: "What you noticed", maxLength: 200 },
  ] },
  PEST_CONFIRMED: { label: "Pest confirmed", fields: [
    { name: "pest_type", type: "select", label: "Pest", options: ["Whitefly","Aphid","Cutworm","Fruit fly","Caterpillar","Other"], required: true },
    { name: "severity", type: "select", label: "Severity", options: ["low","med","high","critical"], required: true },
  ] },
  DISEASE_CONFIRMED: { label: "Disease confirmed", fields: [
    { name: "disease_type", type: "select", label: "Disease", options: ["Early blight","Late blight","Powdery mildew","Bacterial wilt","Mosaic virus","Other"], required: true },
    { name: "severity", type: "select", label: "Severity", options: ["low","med","high","critical"], required: true },
  ] },
  STORAGE_CHECK: { label: "Storage check", fields: [
    { name: "produce", type: "text", label: "Produce", maxLength: 120, required: true },
    { name: "condition", type: "select", label: "Condition", options: ["GOOD","FAIR","SPOILING"], required: true },
    { name: "qty_kg", type: "number", label: "Quantity (kg)", min: 0 },
  ] },
  STORAGE_LOGGED: { label: "Put into storage", fields: [
    { name: "produce", type: "text", label: "Produce", maxLength: 120, required: true },
    { name: "qty_kg", type: "number", label: "Quantity (kg)", min: 0, required: true },
    { name: "location", type: "text", label: "Where", maxLength: 120 },
  ] },
  INPUT_INVENTORY_CHECK: { label: "Stock check", fields: [
    { name: "item", type: "text", label: "What you counted", maxLength: 120 },
    { name: "qty_on_hand", type: "number", label: "Amount on hand", min: 0 },
  ] },
  NURSERY_LOSS: { label: "Nursery loss", fields: [
    { name: "seedlings_lost", type: "int", label: "Seedlings lost", min: 0, required: true },
    { name: "cause", type: "select", label: "Cause", options: ["DAMPING_OFF","PEST","WEATHER","OTHER"], required: true },
  ] },
  CYCLE_ABANDONED: { label: "Cycle abandoned", fields: [
    { name: "reason", type: "select", label: "Why", options: ["FAILURE","WEATHER","PEST","DECISION","OTHER"], required: true },
  ] },
  CROP_SOLD: { label: "Crop sold", fields: [
    { name: "qty_kg", type: "number", label: "Quantity (kg)", min: 0, required: true },
    { name: "total_revenue_fjd", type: "number", label: "Money received (FJD)", min: 0, required: true },
    { name: "buyer", type: "text", label: "Buyer", maxLength: 120 },
  ] },
  CROP_GIVEN: { label: "Crop given away", fields: [
    { name: "qty_kg", type: "number", label: "Quantity (kg)", min: 0, required: true },
    { name: "recipient", type: "text", label: "Given to", maxLength: 120 },
  ] },
};

// Options may be plain strings or {value,label} objects (FIELD_OBSERVATION uses
// friendly labels mapped to enum values the backend payload expects).
function asOption(o) {
  return typeof o === "string" ? { value: o, label: o } : o;
}

// ============================================================================
// Strike #100 — CROPS PLANTING + TRANSPLANT_LOGGED three-dropdown form
// ============================================================================
// CROP -> CYCLE -> VARIETY (with "Other (specify)" free-text fallback).
// Strike #98 Rule 6 satisfaction for plant-identity events.

function CropSelectionForm({ eventType, schema }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const cc = useCropAndCycle();
  const [varietyId, setVarietyId]       = useState("");
  const [varietyOther, setVarietyOther] = useState("");
  const [eventDate, setEventDate]       = useState(todayISO());
  const [values, setValues]             = useState({});
  const [notes, setNotes]               = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");

  const varietiesQuery = useQuery({
    queryKey: ["varieties", cc.cropId],
    queryFn: () => fetchCropVarieties(cc.cropId),
    enabled: !!cc.cropId,
  });

  // Reset variety state when crop changes (cycle reset is handled by useCropAndCycle).
  useEffect(() => {
    setVarietyId("");
    setVarietyOther("");
  }, [cc.cropId]);

  function setField(name, val) {
    setValues((v) => ({ ...v, [name]: val }));
  }

  // For PLANTING, the legacy `variety` text field is superseded by the VARIETY dropdown.
  const renderableSchemaFields = (schema?.fields || []).filter(
    (f) => f.name !== "variety",
  );

  const requiredOK = renderableSchemaFields.every(
    (f) => !f.required || (values[f.name] !== undefined && values[f.name] !== ""),
  );

  const varietySelected =
    !!varietyId && (varietyId !== "OTHER" || !!varietyOther.trim());

  const submitDisabled =
    submitting ||
    !cc.cropId ||
    !cc.cycleId ||
    !cc.selectedCycle ||
    !varietySelected ||
    !requiredOK;

  async function submit(e) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError("");

    const payload = { production_id: cc.cropId };
    if (varietyId && varietyId !== "OTHER") {
      payload.variety_id = varietyId;
    } else if (varietyId === "OTHER" && varietyOther.trim()) {
      payload.variety_other = varietyOther.trim();
    }
    for (const f of renderableSchemaFields) {
      const v = values[f.name];
      if (v === undefined || v === "" || v === null) continue;
      if (f.type === "int")          payload[f.name] = parseInt(v, 10);
      else if (f.type === "number")  payload[f.name] = Number(v);
      else                           payload[f.name] = v;
    }
    if (notes.trim()) payload.notes = notes.trim();

    const occurredAt = `${eventDate}T12:00:00+12:00`;

    const body = {
      event_type: eventType,
      occurred_at: occurredAt,
      anchors: {
        farm_id:  cc.selectedCycle.farm_id,
        pu_id:    cc.selectedCycle.pu_id,
        cycle_id: cc.cycleId,
      },
      payload,
    };

    try {
      const res = await fetch("/api/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const parsed = await res.json().catch(() => null);
      if (res.status === 201 && parsed?.status === "success") {
        const eventId = parsed.data?.event_id || "";
        const hash    = parsed.data?.audit_hash || "";
        emitToast(`Logged · ${eventId}${hash ? ` · ${hash}` : ""}`);
        qc.invalidateQueries({ queryKey: ["field-events"] });
        qc.invalidateQueries({ queryKey: ["cycles", "active"] });
        qc.invalidateQueries({ queryKey: ["tasks-next"] });
        navigate("/farm");
        return;
      }
      const msg =
        parsed?.error?.message ||
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

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl px-5 py-5" style={{ border: `1px solid ${C.border}` }}>
        <header className="mb-4">
          <div className="text-xs uppercase tracking-wider font-medium" style={{ color: C.muted }}>
            CROPS event
          </div>
          <h1 className="text-xl font-bold mt-1" style={{ color: C.soil }}>
            {schema?.label || eventType}
          </h1>
        </header>

        <form onSubmit={submit} className="space-y-4">
          <CropAndCycleFields
            cropId={cc.cropId} setCropId={cc.setCropId}
            cycleId={cc.cycleId} setCycleId={cc.setCycleId}
            productionsQuery={cc.productionsQuery}
            cyclesQuery={cc.cyclesQuery}
            filteredCycles={cc.filteredCycles}
          />

          {/* Variety */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Variety *
            </label>
            <ThemedSelect
              id="variety"
              name="variety_id"
              value={varietyId}
              onChange={setVarietyId}
              options={(varietiesQuery.data ?? []).map((v) => ({
                value: v.variety_id,
                label: v.variety_name,
              }))}
              placeholder={cc.cropId ? "Select variety..." : "Pick a crop first"}
              required
              disabled={!cc.cropId || varietiesQuery.isLoading}
            />
            {varietyId === "OTHER" && (
              <input
                type="text"
                value={varietyOther}
                onChange={(e) => setVarietyOther(e.target.value)}
                placeholder="Specify variety"
                required
                maxLength={120}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none mt-2"
                style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
              />
            )}
          </div>

          {/* Date */}
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {/* Schema-driven event-specific fields (variety filtered out for PLANTING) */}
          {renderableSchemaFields.map((f) => (
            <div key={f.name}>
              <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                {f.label}{f.required ? " *" : ""}
              </label>
              {f.type === "select" ? (
                <ThemedSelect
                  id={f.name}
                  name={f.name}
                  value={values[f.name] || ""}
                  onChange={(v) => setField(f.name, v)}
                  options={f.options.map(asOption)}
                  placeholder="Select..."
                  required={!!f.required}
                />
              ) : (
                <input
                  type={f.type === "text" ? "text" : "number"}
                  inputMode={f.type === "int" ? "numeric" : f.type === "number" ? "decimal" : undefined}
                  step={f.type === "int" ? "1" : f.type === "number" ? "0.01" : undefined}
                  min={f.min}
                  maxLength={f.maxLength}
                  value={values[f.name] || ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  required={!!f.required}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
                />
              )}
            </div>
          ))}

          {/* Notes */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Optional details about this activity"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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

function Strike96CropsForm({ eventType }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const schema = STRIKE_96_FIELDS[eventType];

  const cc = useCropAndCycle();
  const [eventDate, setEventDate]   = useState(todayISO());
  const [values, setValues]         = useState({});
  const [notes, setNotes]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  function setField(name, val) {
    setValues((v) => ({ ...v, [name]: val }));
  }

  const requiredOK = schema.fields.every(
    (f) => !f.required || (values[f.name] !== undefined && values[f.name] !== ""),
  );
  const submitDisabled =
    submitting ||
    !cc.cropId ||
    !cc.cycleId ||
    !cc.selectedCycle ||
    !requiredOK;

  async function submit(e) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError("");

    const payload = { production_id: cc.cropId };
    for (const f of schema.fields) {
      const v = values[f.name];
      if (v === undefined || v === "" || v === null) continue;
      if (f.type === "int")          payload[f.name] = parseInt(v, 10);
      else if (f.type === "number")  payload[f.name] = Number(v);
      else                           payload[f.name] = v;
    }
    if (notes.trim()) payload.notes = notes.trim();

    const occurredAt = `${eventDate}T12:00:00+12:00`;

    const body = {
      event_type: eventType,
      occurred_at: occurredAt,
      anchors: {
        farm_id:  cc.selectedCycle.farm_id,
        pu_id:    cc.selectedCycle.pu_id,
        cycle_id: cc.cycleId,
      },
      payload,
    };

    try {
      const res = await fetch("/api/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const parsed = await res.json().catch(() => null);
      if (res.status === 201 && parsed?.status === "success") {
        const eventId = parsed.data?.event_id || "";
        const hash    = parsed.data?.audit_hash || "";
        emitToast(`Logged · ${eventId}${hash ? ` · ${hash}` : ""}`);
        qc.invalidateQueries({ queryKey: ["field-events"] });
        qc.invalidateQueries({ queryKey: ["cycles", "active"] });
        qc.invalidateQueries({ queryKey: ["tasks-next"] });
        navigate("/farm");
        return;
      }
      const msg =
        parsed?.error?.message ||
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

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-2xl px-5 py-5" style={{ border: `1px solid ${C.border}` }}>
        <header className="mb-4">
          <div className="text-xs uppercase tracking-wider font-medium" style={{ color: C.muted }}>
            CROPS event
          </div>
          <h1 className="text-xl font-bold mt-1" style={{ color: C.soil }}>
            {schema.label}
          </h1>
        </header>

        <form onSubmit={submit} className="space-y-4">
          <CropAndCycleFields
            cropId={cc.cropId} setCropId={cc.setCropId}
            cycleId={cc.cycleId} setCycleId={cc.setCycleId}
            productionsQuery={cc.productionsQuery}
            cyclesQuery={cc.cyclesQuery}
            filteredCycles={cc.filteredCycles}
          />

          {/* Date */}
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {/* Dynamic event-type fields */}
          {schema.fields.map((f) => (
            <div key={f.name}>
              <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                {f.label}{f.required ? " *" : ""}
              </label>
              {f.type === "select" ? (
                <ThemedSelect
                  id={f.name}
                  name={f.name}
                  value={values[f.name] || ""}
                  onChange={(v) => setField(f.name, v)}
                  options={f.options.map(asOption)}
                  placeholder="Select..."
                  required={!!f.required}
                />
              ) : (
                <input
                  type={f.type === "text" ? "text" : "number"}
                  inputMode={f.type === "int" ? "numeric" : f.type === "number" ? "decimal" : undefined}
                  step={f.type === "int" ? "1" : f.type === "number" ? "0.01" : undefined}
                  min={f.min}
                  maxLength={f.maxLength}
                  value={values[f.name] || ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  required={!!f.required}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
                />
              )}
            </div>
          ))}

          {/* Notes */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Optional details about this activity"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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

function FieldEventForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const cc = useCropAndCycle();
  const [searchParams] = useSearchParams();
  // Preselect the activity from ?type= so Compliance "Log chemical" (type=CHEMICAL_APPLIED)
  // and any legacy-valued deep link don't drop the farmer into a blank dropdown.
  const _initialType = (() => {
    const t = searchParams.get("type");
    if (!t) return "";
    if (EVENT_TYPES.some((o) => o.value === t)) return t;       // already a legacy value
    return ({ CHEMICAL_APPLIED: "SPRAY" })[t] || "";            // catalog → legacy
  })();
  const [eventType, setEventType]       = useState(_initialType);
  const [eventDate, setEventDate]       = useState(todayISO());
  const [chemName, setChemName]         = useState("");
  const [quantity, setQuantity]         = useState("");
  const [quantityUnit, setQuantityUnit] = useState("L");
  const [notes, setNotes]               = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");

  const isSpray = eventType === "SPRAY";

  // Chemicals catalog — fetched only when SPRAY is selected and we have a cycle.
  // Scoped to the selected crop so the datalist is crop-relevant.
  const cropFilter = cc.cropId || null;
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
    enabled: isSpray && !!cc.selectedCycle,
    staleTime: 5 * 60_000,
  });

  // Resolve free-text input against the loaded catalog (case-insensitive exact).
  const matchedChem = useMemo(() => {
    if (!chemName.trim()) return null;
    const list = chemicalsQuery.data?.data ?? [];
    const target = chemName.trim().toLowerCase();
    return list.find((c) => c.chem_name.toLowerCase() === target) || null;
  }, [chemName, chemicalsQuery.data]);

  const sprayValid = !isSpray || (chemName.trim() && quantity && quantityUnit);

  const submitDisabled =
    submitting ||
    !cc.cropId ||
    !cc.cycleId ||
    !cc.selectedCycle ||
    !eventType ||
    !eventDate ||
    !sprayValid;

  async function submit(e) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError("");

    const body = {
      farm_id:        cc.selectedCycle.farm_id,
      pu_id:          cc.selectedCycle.pu_id,
      cycle_id:       cc.cycleId,
      production_id:  cc.cropId,
      event_type:     eventType,
      event_date:     eventDate,
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
          <CropAndCycleFields
            cropId={cc.cropId} setCropId={cc.setCropId}
            cycleId={cc.cycleId} setCycleId={cc.setCycleId}
            productionsQuery={cc.productionsQuery}
            cyclesQuery={cc.cyclesQuery}
            filteredCycles={cc.filteredCycles}
          />

          {/* Event type */}
          <div>
            <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
              Activity type *
            </label>
            <ThemedSelect
              id="event_type"
              name="event_type"
              value={eventType}
              onChange={setEventType}
              options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              placeholder="Select activity type..."
              required
            />
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
            />
          </div>

          {/* SPRAY-only fields */}
          {isSpray && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                  Chemical name *
                </label>
                <ThemedCombobox
                  id="chemical"
                  name="chemical_name"
                  value={chemName}
                  onChange={setChemName}
                  options={(chemicalsQuery.data?.data ?? []).map((c) => ({
                    value: c.chem_name,
                    label: c.chem_name,
                    sublabel: `WHD ${c.withholding_period_days}d · ${c.active_ingredient}`,
                  }))}
                  placeholder="e.g. Dimethoate 40% EC"
                  required
                  loading={chemicalsQuery.isLoading}
                  emptyMessage="No chemicals match"
                  noResultsHint="for this crop"
                />
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
                    style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-1" style={{ color: C.muted }}>
                    Unit *
                  </label>
                  <ThemedSelect
                    id="qty_unit"
                    name="qty_unit"
                    value={quantityUnit}
                    onChange={setQuantityUnit}
                    options={QTY_UNITS.map((u) => ({ value: u, label: u }))}
                    placeholder="Unit..."
                    required
                  />
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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
              style={{ background: "var(--paper)", border: `1px solid ${C.border}`, color: C.soil }}
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

// ── Field events LOG (prototype: Farm > Field events) ───────────────────────
// The /farm/field-events route lands here (the log). The (+) catalog tiles,
// QuickActions, and dashboard open the FORM via ?type= or ?new=1.
function feAuthHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const FE_HUMAN = {
  PLANTING: "Planting", TRANSPLANT: "Transplant", TRANSPLANT_LOGGED: "Transplant",
  FERTILIZE: "Fertilize", FERTILIZER_APPLIED: "Fertilize", IRRIGATE: "Irrigate",
  IRRIGATION: "Irrigate", SPRAY: "Spray", CHEMICAL_APPLIED: "Spray", PRUNE: "Prune",
  PRUNING_TRAINING: "Prune/train", PEST_OBSERVE: "Pest sighting", DISEASE_OBSERVE: "Disease sighting",
  HARVEST_PARTIAL: "Partial harvest", HARVEST_FINAL: "Final harvest", INSPECTION: "Inspection",
  SOIL_TEST: "Soil test", PHOTO: "Photo", OTHER: "Other", WEED_MANAGEMENT: "Weed mgmt", LAND_PREP: "Land prep",
};
function feShort(s) { return s ? String(s).split("-").slice(-1)[0].slice(0, 6) : "—"; }
function feDate(s) { if (!s) return "—"; try { return new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } }
function feDetail(e) {
  if (e.chemical_application) return `${e.chemical_application}${e.quantity != null ? ` · ${e.quantity}${e.quantity_unit || ""}` : ""}`;
  if (e.notes) return e.notes;
  const p = e.payload_jsonb;
  if (p && typeof p === "object") {
    const ks = Object.keys(p).filter((k) => p[k] != null && p[k] !== "" && !["production_id", "cycle_id", "variety_id"].includes(k));
    if (ks.length) return ks.slice(0, 2).map((k) => `${k.replace(/_/g, " ")}: ${p[k]}`).join(" · ");
  }
  return "—";
}

// 48h correction window (mirrors backend app/core/edit_window.py — created_at, not occurred_at).
function feWithin48h(createdAt) {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return !isNaN(t) && (Date.now() - t) <= 48 * 3600 * 1000;
}

const FE_EDIT_PROTECTED = new Set(["production_id", "cycle_id", "variety_id", "notes",
  "photo_url", "photo_sha256", "photo_byte_size", "gps_lat", "gps_lng", "_recorded_at"]);
const feLabel = (k) => k.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());

function FieldEventEditModal({ evt, onClose, onSaved }) {
  const isChemical = !!evt.chemical_application;
  const [note, setNote] = useState(evt.observation_text || "");
  const [photo, setPhoto] = useState(evt.photo_url || null);
  const [fields, setFields] = useState(() => {
    const p = evt.payload_jsonb || {}; const o = {};
    Object.keys(p).forEach((k) => { if (!FE_EDIT_PROTECTED.has(k) && p[k] != null && p[k] !== "") o[k] = p[k]; });
    return o;
  });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setField = (k, raw, isNum) => setFields((f) => ({ ...f, [k]: isNum ? (raw === "" ? "" : Number(raw)) : raw }));
  async function upload(file) {
    if (!file) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("tfos_access_token");
      const b = await (await fetch("/api/v1/community/uploads", { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd })).json().catch(() => null);
      const url = b?.data?.url || b?.url; if (url) setPhoto(url); else setErr("Photo upload failed");
    } finally { setUploading(false); }
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      const payload = { notes: note, photo_url: photo };
      if (!isChemical) payload.fields = fields;
      const r = await fetch(`/api/v1/field-events/${encodeURIComponent(evt.event_id)}`, {
        method: "PATCH", headers: { ...feAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json().catch(() => null);
      if (r.ok && b?.status === "success") onSaved();
      else setErr(b?.detail?.message || (typeof b?.detail === "string" ? b.detail : `Couldn't save (${r.status})`));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const fieldKeys = Object.keys(fields);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold" style={{ color: C.soil }}>Correct this entry</h2>
          <button onClick={onClose} style={{ color: C.muted }}>✕</button>
        </div>
        <div className="text-[11px] mb-3" style={{ color: C.muted }}>You can fix this for 48 hours of logging — every change is logged.</div>

        {isChemical ? (
          <div className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: "#fff7e6", color: "#7a5b14", border: "1px solid #f0d9a0" }}>
            This is a chemical record — its values drive the harvest-withholding window, so they can't be corrected here. Fix the note/photo, or delete and re-log.
          </div>
        ) : fieldKeys.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={{ color: C.soil }}>What you logged</div>
            <div className="space-y-2 mb-3">
              {fieldKeys.map((k) => {
                const v = fields[k]; const isNum = typeof v === "number";
                return (
                  <div key={k}>
                    <label className="text-[11px]" style={{ color: C.muted }}>{feLabel(k)}</label>
                    <input value={v} type={isNum ? "number" : "text"} onChange={(e) => setField(k, e.target.value, isNum)}
                      className="w-full mt-0.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <label className="text-xs font-semibold" style={{ color: C.soil }}>Note</label>
        <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)}
          className="w-full mt-1 mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
        <label className="text-xs font-semibold" style={{ color: C.soil }}>Photo</label>
        <div className="mt-1 mb-3">
          {photo ? (
            <div className="flex items-center gap-3">
              <img src={photo} alt="" className="w-14 h-14 rounded object-cover" />
              <button onClick={() => setPhoto(null)} className="text-xs" style={{ color: "#9a3b3b" }}>Remove photo</button>
            </div>
          ) : (
            <label className="inline-block text-xs px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: C.border, color: C.greenDk }}>
              {uploading ? "Uploading…" : "Add / change photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {err && <div className="text-xs mb-2" style={{ color: "#9a3b3b" }}>{err}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: C.border }}>Cancel</button>
          <button onClick={save} disabled={busy || uploading} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: C.greenDk }}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

function FieldEventsLog() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["field-events", farmId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/field-events?farm_id=${encodeURIComponent(farmId)}&limit=100`, { headers: feAuthHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: !!farmId, retry: 0,
  });
  const events = data?.data?.events ?? [];
  const [editEvt, setEditEvt] = useState(null);

  return (
    <div className="tfp max-w-5xl mx-auto p-4 space-y-4">
      <div className="page-header">
        <div><h1>Field events</h1><div className="subtitle">Spray, irrigation, fertilizer, scouting and more — logged against your blocks</div></div>
        <div className="page-actions">
          <FarmSelector />
          <button className="btn btn-primary" onClick={() => navigate("/farm/field-events?new=1")}><Plus size={14} />Log event</button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: C.border }}>
        <div className="hidden md:grid items-center px-4 py-2 text-[10px] font-bold uppercase"
          style={{ color: C.muted, gridTemplateColumns: "96px 120px 1fr 90px 80px 56px", borderBottom: `1px solid ${C.border}` }}>
          <span>Date</span><span>Type</span><span>Detail</span><span>Block</span><span>By</span><span></span>
        </div>
        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: C.muted }}>Loading…</div>
        ) : isError ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load field events</div>
            <button onClick={() => refetch()} className="mt-2 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: C.greenDk }}>Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
            <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>No field events yet</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>Tap “Log event” to record a spray, irrigation, fertilizer or scouting activity.</div>
          </div>
        ) : events.map((e) => (
          <div key={e.event_id} className="flex md:grid md:items-center gap-3 px-4 py-3"
            style={{ gridTemplateColumns: "96px 120px 1fr 90px 80px 56px", borderTop: `1px solid rgba(92,64,51,0.06)` }}>
            <span className="text-[11px] shrink-0" style={{ color: C.muted }}>{feDate(e.event_date)}</span>
            <span className="text-sm font-medium md:font-normal" style={{ color: C.soil }}>{FE_HUMAN[e.event_type] || e.event_type}</span>
            <span className="flex-1 min-w-0 text-[13px] md:truncate" style={{ color: C.soil }}>{feDetail(e)}</span>
            <span className="text-[11px]" style={{ color: C.muted }}>{feShort(e.pu_id)}</span>
            <span className="text-[11px]" style={{ color: C.muted }}>{feShort(e.created_by)}</span>
            {feWithin48h(e.created_at)
              ? <button onClick={() => setEditEvt(e)} className="text-[11px] font-semibold text-left" style={{ color: C.greenDk }}>Edit</button>
              : <span className="text-[11px]" style={{ color: C.muted }} title="Locked after 48h">🔒</span>}
          </div>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: C.muted }}>Showing the most recent {events.length} event{events.length === 1 ? "" : "s"} for this farm. Entries can be corrected for 48 hours, then lock 🔒.</p>
      {editEvt && <FieldEventEditModal evt={editEvt} onClose={() => setEditEvt(null)} onSaved={() => { refetch(); setEditEvt(null); }} />}
    </div>
  );
}

function FieldEventDispatcher() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const isNew = searchParams.get("new");
  if (typeParam === "PLANTING" || typeParam === "TRANSPLANT_LOGGED") {
    return <CropSelectionForm eventType={typeParam} schema={STRIKE_96_FIELDS[typeParam]} />;
  }
  if (typeParam && STRIKE_96_FIELDS[typeParam]) {
    return <Strike96CropsForm eventType={typeParam} />;
  }
  // ?new=1 (or a legacy ?type like CHEMICAL_APPLIED) opens the form; bare route shows the log.
  if (isNew || typeParam) {
    return <FieldEventForm />;
  }
  return <FieldEventsLog />;
}

export default function FieldEventNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <FieldEventDispatcher />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

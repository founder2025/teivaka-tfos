/**
 * CycleNew.jsx — Strike #C2b
 *
 * Universal Event Form Contract-conforming form for CYCLE_CREATED.
 * Submits to POST /api/v1/events with event_type='CYCLE_CREATED'.
 *
 * Flow:
 *  - User selects Block (filtered to PUs without active cycle)
 *  - Crop dropdown auto-pre-fills from PU's current_production_id (overridable)
 *  - Layer dropdown auto-pre-fills from production's suggested_layer (overridable)
 *  - Required: planting_date (default today)
 *  - Optional: expected_harvest_date, planned_area_sqm, planned_yield_kg,
 *              farmer_label, cycle_notes
 *  - On 201 → toast with audit hash, navigate /farm/cycles after 800ms
 *  - On 409 ACTIVE_CYCLE_EXISTS → inline error on Block field
 *  - On 4xx → inline form error
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";
import CapacityCalc from "../../components/farm/CapacityCalc.jsx";

// ── Helpers ──────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("tfos_access_token");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

function extractList(body, ...keys) {
  if (Array.isArray(body)) return body;
  if (body?.data && Array.isArray(body.data)) return body.data;
  for (const k of keys) {
    if (Array.isArray(body?.[k])) return body[k];
    if (Array.isArray(body?.data?.[k])) return body.data[k];
  }
  return [];
}

const TODAY = () => new Date().toISOString().slice(0, 10);

// ── Sub-components (module scope to prevent focus-loss) ──────────────
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        background: "var(--green, #6AA84F)",
        color: "white",
        padding: "12px 18px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxWidth: 420,
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      {message}
      <button
        onClick={onClose}
        style={{
          marginLeft: 12,
          background: "transparent",
          color: "white",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Label({ children, required }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--soil, #5C4033)",
        marginBottom: 6,
      }}
    >
      {children}
      {required && <span style={{ color: "var(--red, #A32D2D)", marginLeft: 3 }}>*</span>}
    </label>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label required={required}>{label}</Label>
      {children}
      {error && (
        <div style={{ color: "var(--red, #A32D2D)", fontSize: 12, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Input({ value, onChange, type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        border: "1px solid var(--line, #E0D5C0)",
        borderRadius: 6,
        fontSize: 14,
        background: "white",
        color: "var(--soil, #5C4033)",
        boxSizing: "border-box",
      }}
      {...rest}
    />
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function CycleNew() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState("");
  const [productionId, setProductionId] = useState("");

  // Reference data
  const [productionUnits, setProductionUnits] = useState([]);
  const [activeCycles, setActiveCycles] = useState([]);
  const [productions, setProductions] = useState([]);

  // Form fields
  const [plantingDate, setPlantingDate] = useState(TODAY());
  const [expectedHarvestDate, setExpectedHarvestDate] = useState("");
  const [plannedAreaSqm, setPlannedAreaSqm] = useState("");
  const [plannedYieldKg, setPlannedYieldKg] = useState("");
  const [layer, setLayer] = useState("");
  const [farmerLabel, setFarmerLabel] = useState("");
  const [cycleNotes, setCycleNotes] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Load farm + reference data ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [farmsRes, prodsRes, cyclesRes] = await Promise.all([
          fetch("/api/v1/farms", { headers: authHeaders() }),
          fetch("/api/v1/productions?is_active=true&crop_only=true", { headers: authHeaders() }),
          fetch("/api/v1/cycles?limit=200", { headers: authHeaders() }),
        ]);

        const farms = extractList(await farmsRes.json(), "farms");
        const prods = extractList(await prodsRes.json(), "productions");
        const cycles = extractList(await cyclesRes.json(), "cycles");

        if (cancelled) return;

        const firstFarm = farms[0];
        if (!firstFarm) {
          setFormError("No farm available. Contact support.");
          setLoading(false);
          return;
        }
        setFarmId(firstFarm.farm_id);
        setProductions(prods);
        setActiveCycles(cycles.filter((c) => ["ACTIVE", "HARVESTING", "CLOSING"].includes(c.cycle_status)));

        const puRes = await fetch(
          `/api/v1/production-units?farm_id=${firstFarm.farm_id}&is_active=true`,
          { headers: authHeaders() }
        );
        const pus = extractList(await puRes.json(), "production_units");
        if (!cancelled) setProductionUnits(pus);
      } catch (err) {
        if (!cancelled) setFormError("Could not load farm data. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── PUs without active cycle ──────────────────────────────────────
  const availablePUs = useMemo(() => {
    const blockedPuIds = new Set(activeCycles.map((c) => c.pu_id));
    return productionUnits.filter((pu) => !blockedPuIds.has(pu.pu_id));
  }, [productionUnits, activeCycles]);

  // ── Auto-fill crop + layer when PU changes ────────────────────────
  useEffect(() => {
    if (!puId) return;
    const pu = productionUnits.find((p) => p.pu_id === puId);
    if (pu?.current_production_id && !productionId) {
      setProductionId(pu.current_production_id);
    }
  }, [puId, productionUnits, productionId]);

  useEffect(() => {
    if (!productionId || layer) return;
    const prod = productions.find((p) => p.production_id === productionId);
    if (prod?.suggested_layer) setLayer(prod.suggested_layer);
  }, [productionId, productions, layer]);

  // ── Submit ────────────────────────────────────────────────────────
  async function handleSubmit() {
    setFieldErrors({});
    setFormError(null);

    const errs = {};
    if (!puId) errs.puId = "Block is required.";
    if (!productionId) errs.productionId = "Crop is required.";
    if (!plantingDate) errs.plantingDate = "Planting date is required.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    const payload = {
      production_id: productionId,
      planting_date: plantingDate,
      expected_harvest_date: expectedHarvestDate || null,
      planned_area_sqm: plannedAreaSqm ? parseFloat(plannedAreaSqm) : null,
      planned_yield_kg: plannedYieldKg ? parseFloat(plannedYieldKg) : null,
      layer: layer || null,
      farmer_label: farmerLabel || null,
      cycle_notes: cycleNotes || null,
    };

    const body = {
      event_type: "CYCLE_CREATED",
      anchors: {
        farm_id: farmId,
        pu_id: puId,
        production_id: productionId,
      },
      payload,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/events", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201 || res.status === 200) {
        const eventData = data?.data || data;
        const cycleId = eventData.event_id || eventData.cycle_id || "(unknown)";
        const hashShort = (eventData.audit_hash || "").slice(0, 8);
        setToast(`Crop run started · ${cycleId} · audit ${hashShort}`);
        setTimeout(() => navigate("/farm/cycles"), 800);
        return;
      }

      if (res.status === 409 && data?.detail?.error?.code === "ACTIVE_CYCLE_EXISTS") {
        setFieldErrors({
          puId: data.detail.error.message || "This block already has an active cycle.",
        });
        return;
      }

      const message =
        data?.detail?.error?.message ||
        data?.detail?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        `Submission failed (HTTP ${res.status}).`;
      setFormError(typeof message === "string" ? message : JSON.stringify(message));
    } catch (err) {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 32, color: "var(--soil, #5C4033)" }}>Loading…</div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 20px 40px",
        color: "var(--soil, #5C4033)",
      }}
    >
      <Toast message={toast} onClose={() => setToast(null)} />

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
        Start a crop run
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted, #8A7A66)", marginBottom: 24 }}>
        Begin a new production cycle on a block.
      </p>

      {formError && (
        <div
          role="alert"
          style={{
            background: "#FBE5E5",
            border: "1px solid var(--red, #A32D2D)",
            color: "var(--red, #A32D2D)",
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {formError}
        </div>
      )}

      <Field label="Farm" required>
        <Input value={farmId || ""} disabled />
      </Field>

      <Field label="Block" required error={fieldErrors.puId}>
        <ThemedSelect
          value={puId}
          onChange={(v) => setPuId(v)}
          options={[
            { value: "", label: "Select a block…" },
            ...availablePUs.map((pu) => ({
              value: pu.pu_id,
              label: pu.farmer_label || pu.pu_name || pu.pu_id,
            })),
          ]}
        />
        {availablePUs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted, #8A7A66)", marginTop: 4 }}>
            All blocks have active cycles. Close one first.
          </div>
        )}
      </Field>

      <Field label="Crop" required error={fieldErrors.productionId}>
        <ThemedSelect
          value={productionId}
          onChange={(v) => setProductionId(v)}
          options={[
            { value: "", label: "Select a crop…" },
            ...productions.map((p) => ({
              value: p.production_id,
              label: p.production_name,
            })),
          ]}
        />
      </Field>

      <Field label="Planting date" required error={fieldErrors.plantingDate}>
        <Input type="date" value={plantingDate} onChange={setPlantingDate} />
      </Field>

      <Field label="Expected harvest date">
        <Input type="date" value={expectedHarvestDate} onChange={setExpectedHarvestDate} />
      </Field>

      <Field label="Planned area (m²)">
        <Input type="number" value={plannedAreaSqm} onChange={setPlannedAreaSqm} min="0" step="0.01" />
      </Field>

      {(() => {
        const selPu = productionUnits.find((p) => p.pu_id === puId);
        const aha = plannedAreaSqm ? parseFloat(plannedAreaSqm) / 10000
          : (selPu?.area_sqm ? Number(selPu.area_sqm) / 10000 : null);
        if (!aha) return null;
        return (
          <div style={{ margin: "4px 0 8px", border: "1px solid #E6DED0", borderRadius: 12, padding: 12, background: "#FCFAF5" }}>
            <CapacityCalc areaHa={aha} unit="acres" compact />
          </div>
        );
      })()}

      <Field label="Planned yield (kg)">
        <Input type="number" value={plannedYieldKg} onChange={setPlannedYieldKg} min="0" step="0.01" />
      </Field>

      <Field label="3-Layer">
        <ThemedSelect
          value={layer}
          onChange={(v) => setLayer(v)}
          options={[
            { value: "", label: "(none — set later)" },
            { value: "CASH_FLOW", label: "Cash Flow (sell to market)" },
            { value: "FOOD_SECURITY", label: "Food Security (feed family)" },
            { value: "LONG_TERM_ASSET", label: "Long-Term Asset (perennial / grow value)" },
          ]}
        />
      </Field>

      <Field label="Cycle label (your name for this crop run)">
        <Input
          value={farmerLabel}
          onChange={setFarmerLabel}
          placeholder="e.g., Bed 3 eggplant — May start"
          maxLength={64}
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={cycleNotes}
          onChange={(e) => setCycleNotes(e.target.value)}
          maxLength={500}
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--line, #E0D5C0)",
            borderRadius: 6,
            fontSize: 14,
            background: "white",
            color: "var(--soil, #5C4033)",
            boxSizing: "border-box",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </Field>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            background: "var(--green, #6AA84F)",
            color: "white",
            border: "none",
            padding: "12px 24px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Starting…" : "Start crop run"}
        </button>
        <button
          onClick={() => navigate("/farm/cycles")}
          disabled={submitting}
          style={{
            background: "transparent",
            color: "var(--soil, #5C4033)",
            border: "1px solid var(--line, #E0D5C0)",
            padding: "12px 24px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

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
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ShieldCheck, Check, Loader2, User } from "lucide-react";
import CapacityCalc from "../../components/farm/CapacityCalc.jsx";
import { completeLinkedTask } from "../../utils/taskBridge";
import { useFarmName } from "../../utils/farmName";

// Match the (+) capture engine's date phrasing in the "About to record" preview.
function prettyDate(ymd) {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d)) return ymd;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

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

// ── Toast (module scope to prevent focus-loss) ──────────────────────
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
        background: "var(--green, var(--green))",
        color: "#fff",
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
          color: "#fff",
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

// ── Main component ──────────────────────────────────────────────────
export default function CycleNew() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const farmName = useFarmName(farmId);
  const [searchParams] = useSearchParams();
  const [puId, setPuId] = useState(searchParams.get("pu") || "");
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
        await completeLinkedTask();  // if opened from a rotation/transplant task, close it
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

  // ── Engine card style language (mirrors capture/CaptureEngine.jsx) ──
  const wrap = { maxWidth: 460, margin: "0 auto", padding: 16, color: "var(--soil)" };
  const card = { border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 16, background: "var(--cream-2)" };
  const cardHead = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 };
  const fieldLabel = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--soil)" };
  const inputBox = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, boxSizing: "border-box", background: "var(--paper)" };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", marginBottom: 12 };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ ...wrap, padding: 32, color: "var(--muted)" }}>Loading…</div>;
  }

  const cropName = productions.find((p) => p.production_id === productionId)?.production_name;
  const selPu = productionUnits.find((p) => p.pu_id === puId);
  const blockLabel = selPu ? (selPu.farmer_label || selPu.pu_name || selPu.pu_id) : "—";
  const areaHa = plannedAreaSqm ? parseFloat(plannedAreaSqm) / 10000
    : (selPu?.area_sqm ? Number(selPu.area_sqm) / 10000 : null);
  const ready = puId && productionId && plantingDate;

  return (
    <div style={wrap}>
      <Toast message={toast} onClose={() => setToast(null)} />

      <button onClick={() => navigate("/farm/cycles")} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Start a crop run</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Begin a new production cycle on a block.</p>

      {formError && (
        <div role="alert" style={{ background: "#fbe5e5", border: "1px solid #c98b8b", color: "#9a3b3b", padding: "10px 12px", borderRadius: 12, marginBottom: 14, fontSize: 13 }}>
          {formError}
        </div>
      )}

      {/* Anchors — Farm · Block · Crop · Operator (the 4-anchor identity on every record) */}
      <div style={card}>
        <div style={cardHead}>Anchors · farm · block · crop · operator</div>
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 10, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "var(--muted)" }}>Farm</span>
          <span style={{ fontWeight: 600 }}>{farmName || farmId || "—"}</span>

          <span style={{ color: "var(--muted)" }}>Block</span>
          <div>
            <select value={puId} onChange={(e) => setPuId(e.target.value)} style={inputBox}>
              <option value="">Select a block…</option>
              {availablePUs.map((pu) => (
                <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>
              ))}
            </select>
            {fieldErrors.puId && <div style={{ color: "#9a3b3b", fontSize: 12, marginTop: 4 }}>{fieldErrors.puId}</div>}
            {availablePUs.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>All blocks have active cycles. Close one first.</div>
            )}
          </div>

          <span style={{ color: "var(--muted)" }}>Crop</span>
          <div>
            <select value={productionId} onChange={(e) => setProductionId(e.target.value)} style={inputBox}>
              <option value="">Select a crop…</option>
              {productions.map((p) => (
                <option key={p.production_id} value={p.production_id}>{p.production_name}</option>
              ))}
            </select>
            {fieldErrors.productionId && <div style={{ color: "#9a3b3b", fontSize: 12, marginTop: 4 }}>{fieldErrors.productionId}</div>}
          </div>

          <span style={{ color: "var(--muted)" }}>Operator</span>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><User size={14} />You</span>
        </div>
      </div>

      {/* When */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Planting date</label>
          <input type="date" value={plantingDate} onChange={(e) => setPlantingDate(e.target.value)} style={inputBox} />
          {fieldErrors.plantingDate && <div style={{ color: "#9a3b3b", fontSize: 12, marginTop: 4 }}>{fieldErrors.plantingDate}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Expected harvest</label>
          <input type="date" value={expectedHarvestDate} onChange={(e) => setExpectedHarvestDate(e.target.value)} style={inputBox} />
        </div>
      </div>

      {/* Plan */}
      <div style={card}>
        <div style={cardHead}>Plan</div>
        <label style={fieldLabel}>Planned area (m²)</label>
        <input type="number" value={plannedAreaSqm} onChange={(e) => setPlannedAreaSqm(e.target.value)} min="0" step="0.01" style={{ ...inputBox, marginBottom: areaHa ? 8 : 14 }} />
        {areaHa && (
          <div style={{ margin: "0 0 14px", border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--cream-2)" }}>
            <CapacityCalc areaHa={areaHa} unit="acres" compact />
          </div>
        )}
        <label style={fieldLabel}>Planned yield (kg)</label>
        <input type="number" value={plannedYieldKg} onChange={(e) => setPlannedYieldKg(e.target.value)} min="0" step="0.01" style={{ ...inputBox, marginBottom: 14 }} />
        <label style={fieldLabel}>3-Layer</label>
        <select value={layer} onChange={(e) => setLayer(e.target.value)} style={{ ...inputBox, marginBottom: 14 }}>
          <option value="">(none — set later)</option>
          <option value="CASH_FLOW">Cash Flow (sell to market)</option>
          <option value="FOOD_SECURITY">Food Security (feed family)</option>
          <option value="LONG_TERM_ASSET">Long-Term Asset (perennial / grow value)</option>
        </select>
        <label style={fieldLabel}>Cycle label (your name for this crop run)</label>
        <input value={farmerLabel} onChange={(e) => setFarmerLabel(e.target.value)} placeholder="e.g., Bed 3 eggplant — May start" maxLength={64} style={{ ...inputBox, marginBottom: 14 }} />
        <label style={fieldLabel}>Notes</label>
        <textarea value={cycleNotes} onChange={(e) => setCycleNotes(e.target.value)} maxLength={500} rows={3} style={{ ...inputBox, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {/* About to record — the audit preview */}
      <div style={{ border: "1px solid #cfe0cf", background: "#f0f6f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "var(--green-dk)" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> About to record</div>
        CYCLE_CREATED · {cropName || "—"} · {blockLabel} · {prettyDate(plantingDate)} · You
      </div>

      <button onClick={handleSubmit} disabled={submitting || !ready}
        style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
          background: (!ready) ? "#b8b8b8" : "var(--green)", cursor: submitting || !ready ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Starting…" : "Start crop run"}
      </button>
    </div>
  );
}

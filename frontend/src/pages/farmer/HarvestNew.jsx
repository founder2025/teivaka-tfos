/**
 * HarvestNew.jsx — /farm/harvest/new (Phase 4b MVP Week 1).
 *
 * Farmer-friendly harvest form. Strike #100 redesigned the cycle picker
 * into a CROP -> CYCLE two-dropdown flow: pick crop first, then cycle
 * ordinal ("Cycle 1") filtered to that crop. Cycle selection sets
 * cycle_id, pu_id, and production_id on the request body.
 *
 * Backend contract (app/routers/harvests.py): POST /api/v1/harvests
 *   { cycle_id, pu_id, production_id, harvest_date, qty_kg, grade,
 *     destination, notes? }
 *   (Strike #100 added production_id as user-explicit field.)
 *
 *   NOTE: backend grade validator accepts only "A" | "B" | "C". The brief
 *   mentioned "reject" — not supported by backend; surfaced to Cody in the
 *   final report. We ship A/B/C now.
 *
 * 409 CHEMICAL_COMPLIANCE_VIOLATION: blocking modal. No auto-retry. User must
 * change the harvest date or email Cody for override.
 *
 * All sub-components are at module scope so re-rendering the parent does not
 * re-mount inputs (focus-loss bug the brief flagged).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ShieldCheck, Check, Loader2, User } from "lucide-react";
import { completeLinkedTask } from "../../utils/taskBridge";

// Match the (+) capture engine's date phrasing in the "About to record" preview.
function prettyDate(ymd) {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d)) return ymd;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const C = {
  soil:    "var(--soil)",
  green:   "var(--green)",
  amber:   "var(--amber)",
  red:     "#B00020",
  cream:   "var(--cream)",
  border:  "#E6DED0",
  muted:   "var(--muted)",
  panel:   "var(--paper)",
};

const GRADES       = ["A", "B", "C"];
const DESTINATIONS = ["MARKET", "NAYANS", "WASTE", "OTHER"];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Sub-components (module scope; never redefined inside parent) ─────────────

function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-lg"
      style={{ background: C.green }}
      role="status"
    >
      {message}
    </div>
  );
}

function ComplianceModal({ open, detail, onClose }) {
  if (!open) return null;
  const blocking = Array.isArray(detail?.blocking_chemicals) ? detail.blocking_chemicals : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: C.panel, border: `1px solid ${C.border}` }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="compliance-modal-title"
      >
        <div className="px-5 py-4" style={{ background: "#FDECEE", borderBottom: `1px solid ${C.border}` }}>
          <h2 id="compliance-modal-title" className="text-lg font-bold" style={{ color: C.red }}>
            Cannot harvest yet
          </h2>
          <p className="text-xs mt-1" style={{ color: C.soil }}>
            Chemical withholding period hasn't passed on this production unit.
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {detail?.days_remaining != null && (
            <div className="text-sm" style={{ color: C.soil }}>
              <strong>{detail.days_remaining}</strong> day{detail.days_remaining === 1 ? "" : "s"} remaining.
              {detail?.clearance_date && (
                <>  Clears on <strong>{detail.clearance_date}</strong>.</>
              )}
            </div>
          )}

          {blocking.length > 0 && (
            <ul className="text-xs space-y-1 list-disc list-inside" style={{ color: C.soil }}>
              {blocking.map((c, i) => (
                <li key={i}>
                  <strong>{c.chem_name || c.product_name || "Chemical"}</strong>
                  {c.event_date ? ` applied ${c.event_date}` : ""}
                  {c.whd_days != null ? ` · WHD ${c.whd_days}d` : ""}
                  {c.clearance_date ? ` · clears ${c.clearance_date}` : ""}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs" style={{ color: C.muted }}>
            Change the harvest date to after the clearance date, or contact Cody
            for a formal override. Do not submit again without fixing the date.
          </p>
        </div>

        <div className="px-5 py-3 flex gap-2 justify-end" style={{ borderTop: `1px solid ${C.border}` }}>
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=founder@teivaka.com&su=Harvest%20compliance%20override%20request" target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ border: `1px solid ${C.border}`, color: C.soil, background: "var(--paper)" }}
          >
            Contact Cody for override
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: C.green }}
          >
            Change date
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HarvestNew() {
  const navigate = useNavigate();

  const [cycles, setCycles]               = useState([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [cyclesError, setCyclesError]     = useState("");

  const [productions, setProductions]               = useState([]);
  const [productionsLoading, setProductionsLoading] = useState(true);
  const [productionsError, setProductionsError]     = useState("");

  const [cropId, setCropId]             = useState("");
  const [cycleId, setCycleId]           = useState("");
  const [harvestDate, setHarvestDate]   = useState(todayISO());
  const [qtyKg, setQtyKg]               = useState("");
  const [grade, setGrade]               = useState("A");
  const [destination, setDestination]   = useState("MARKET");
  const [destinationOther, setDestinationOther] = useState("");
  const [notes, setNotes]               = useState("");

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toast, setToast]             = useState("");
  const [modal, setModal]             = useState(null);     // compliance-violation payload

  // Load active cycles on mount.
  useEffect(() => {
    let cancelled = false;
    setCyclesLoading(true);
    fetch("/api/v1/cycles?cycle_status=ACTIVE&limit=100", { headers: authHeaders() })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `HTTP ${r.status}`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const payload = body?.data ?? body;
        const list = Array.isArray(payload?.cycles) ? payload.cycles : [];
        setCycles(list);
      })
      .catch((e) => { if (!cancelled) setCyclesError(e.message || "Could not load cycles"); })
      .finally(() => { if (!cancelled) setCyclesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load crop productions catalog on mount.
  useEffect(() => {
    let cancelled = false;
    setProductionsLoading(true);
    fetch("/api/v1/productions?is_active=true&crop_only=true", { headers: authHeaders() })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `HTTP ${r.status}`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const payload = body?.data ?? body;
        const list = Array.isArray(payload?.productions) ? payload.productions : [];
        setProductions(list);
      })
      .catch((e) => { if (!cancelled) setProductionsError(e.message || "Could not load crops"); })
      .finally(() => { if (!cancelled) setProductionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Cycles filtered to selected crop.
  const filteredCycles = useMemo(() => {
    if (!cropId) return [];
    return cycles.filter((c) => c.production_id === cropId);
  }, [cycles, cropId]);

  // Reset cycleId when crop changes.
  useEffect(() => {
    setCycleId("");
  }, [cropId]);

  // Auto-select first cycle when filtered list resolves to a single option.
  useEffect(() => {
    if (!cycleId && filteredCycles.length > 0) {
      setCycleId(filteredCycles[0].cycle_id);
    }
  }, [cycleId, filteredCycles]);

  const selectedCycle = useMemo(
    () => filteredCycles.find((c) => c.cycle_id === cycleId) || null,
    [filteredCycles, cycleId],
  );

  const finalDestination =
    destination === "OTHER" ? destinationOther.trim() : destination;

  const canSubmit =
    !submitting &&
    !!cropId &&
    !!selectedCycle &&
    !!harvestDate &&
    Number(qtyKg) > 0 &&
    GRADES.includes(grade) &&
    finalDestination.length > 0;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const body = {
        cycle_id:       selectedCycle.cycle_id,
        pu_id:          selectedCycle.pu_id,
        production_id:  cropId,
        harvest_date:   harvestDate,
        qty_kg:         Number(qtyKg),
        grade,
        destination:    finalDestination,
      };
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch("/api/v1/harvests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        setToast("Harvest logged");
        await completeLinkedTask();  // if opened from a harvest task, close it
        setTimeout(() => navigate("/farm"), 700);
        return;
      }

      if (res.status === 409) {
        const payload = data?.detail?.error?.data || data?.detail?.data || data?.detail || data;
        setModal(payload || { days_remaining: null, blocking_chemicals: [] });
        return;
      }

      const msg =
        typeof data?.detail === "string" ? data.detail :
        data?.detail?.message                      ? data.detail.message :
        `HTTP ${res.status}`;
      setSubmitError(msg);
    } catch (err) {
      setSubmitError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const cyclePlaceholder = !cropId
    ? "Pick a crop first"
    : filteredCycles.length === 0
      ? "No active cycles for this crop"
      : "Select a cycle…";

  // ── Engine card style language (mirrors capture/CaptureEngine.jsx) ──
  const wrap = { maxWidth: 460, margin: "0 auto", padding: 16, color: "#3a3527" };
  const card = { border: "1px solid #e6ded0", borderRadius: 14, padding: 14, marginBottom: 16, background: "#faf8f3" };
  const cardHead = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a917c", marginBottom: 10 };
  const fieldLabel = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#5a5a4a" };
  const inputBox = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14, boxSizing: "border-box", background: "#fff" };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", marginBottom: 12 };

  const cropName = productions.find((p) => p.production_id === cropId)?.production_name;

  return (
    <div style={wrap}>
      <Toast message={toast} />

      <button onClick={() => navigate("/farm")} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Record harvest</h1>
      <p style={{ color: "#6b6b6b", fontSize: 13, marginBottom: 18 }}>Chemical withholding is enforced at submit. No override here.</p>

      {/* Anchors — Crop · Cycle · Block · Operator */}
      <div style={card}>
        <div style={cardHead}>Anchors · crop · cycle · operator</div>
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 10, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "#9a917c" }}>Crop</span>
          {productionsLoading
            ? <span style={{ color: "#9a917c" }}>Loading crops…</span>
            : productionsError
              ? <span style={{ color: "#9a3b3b", fontSize: 12 }}>Could not load crops: {productionsError}</span>
              : <select value={cropId} onChange={(e) => setCropId(e.target.value)} style={inputBox}>
                  <option value="">Select a crop…</option>
                  {productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name}</option>)}
                </select>}

          <span style={{ color: "#9a917c" }}>Cycle</span>
          {cyclesLoading
            ? <span style={{ color: "#9a917c" }}>Loading cycles…</span>
            : cyclesError
              ? <span style={{ color: "#9a3b3b", fontSize: 12 }}>Could not load cycles: {cyclesError}</span>
              : <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} disabled={!cropId} style={inputBox}>
                  <option value="">{cyclePlaceholder}</option>
                  {filteredCycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>Cycle {c.block_sequence ?? c.cycle_id}</option>)}
                </select>}

          {selectedCycle?.pu_id && <><span style={{ color: "#9a917c" }}>Block</span><span style={{ fontWeight: 600 }}>{selectedCycle.pu_id}</span></>}

          <span style={{ color: "#9a917c" }}>Operator</span>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><User size={14} />You</span>
        </div>
      </div>

      {/* When + how much */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Harvest date</label>
          <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} style={inputBox} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Quantity (kg)</label>
          <input type="number" inputMode="decimal" min="0.1" step="0.1" value={qtyKg} onChange={(e) => setQtyKg(e.target.value)} placeholder="e.g. 50" style={inputBox} />
        </div>
      </div>

      {/* Detail */}
      <div style={card}>
        <div style={cardHead}>Detail</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Grade</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputBox}>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Destination</label>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={inputBox}>
              {DESTINATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        {destination === "OTHER" && (
          <input type="text" value={destinationOther} onChange={(e) => setDestinationOther(e.target.value)} placeholder="Buyer name or description" style={{ ...inputBox, marginBottom: 14 }} />
        )}
        <label style={fieldLabel}>Notes</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this harvest" style={{ ...inputBox, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {submitError && (
        <div style={{ background: "#fbe5e5", border: "1px solid #c98b8b", color: "#9a3b3b", padding: "10px 12px", borderRadius: 12, marginBottom: 14, fontSize: 13 }}>{submitError}</div>
      )}

      {/* About to record — the audit preview */}
      <div style={{ border: "1px solid #cfe0cf", background: "#f0f6f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#3c5a3c" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> About to record</div>
        HARVEST_LOGGED · {cropName || "—"} · {qtyKg || "0"} kg · Grade {grade} · {prettyDate(harvestDate)} · You
      </div>

      <button onClick={onSubmit} disabled={!canSubmit}
        style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
          background: canSubmit ? "#2e7d32" : "#b8b8b8", cursor: canSubmit ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Logging harvest…" : "Log harvest"}
      </button>

      <ComplianceModal open={!!modal} detail={modal} onClose={() => setModal(null)} />
    </div>
  );
}

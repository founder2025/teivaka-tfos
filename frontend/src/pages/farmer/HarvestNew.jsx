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
import { Link, useNavigate } from "react-router-dom";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";
import { completeLinkedTask } from "../../utils/taskBridge";

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

const inputCls =
  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--green)]";

// ── Sub-components (module scope; never redefined inside parent) ─────────────

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1" style={{ color: C.soil }}>
      {children}
    </label>
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: C.muted }}>{hint}</p>}
    </div>
  );
}

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

  return (
    <div className="space-y-4">
      <Toast message={toast} />

      <div className="pt-1">
        <div className="text-xs font-medium" style={{ color: C.muted }}>
          <Link to="/farm" style={{ color: C.muted }}>← Farm</Link>
        </div>
        <h1 className="text-2xl font-bold mt-0.5" style={{ color: C.soil }}>Record harvest</h1>
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          Chemical withholding is enforced at submit. No override here.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-white rounded-2xl px-4 py-5 space-y-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        <Field label="Crop" htmlFor="crop_id">
          {productionsLoading ? (
            <div className="text-sm" style={{ color: C.muted }}>Loading crops…</div>
          ) : productionsError ? (
            <div className="text-sm" style={{ color: C.red }}>Could not load crops: {productionsError}</div>
          ) : (
            <ThemedSelect
              id="crop_id"
              name="production_id"
              value={cropId}
              onChange={setCropId}
              options={productions.map((p) => ({
                value: p.production_id,
                label: p.production_name,
              }))}
              placeholder="Select a crop…"
            />
          )}
        </Field>

        <Field label="Cycle" htmlFor="cycle_id" hint="Filtered to active cycles for the selected crop.">
          {cyclesLoading ? (
            <div className="text-sm" style={{ color: C.muted }}>Loading cycles…</div>
          ) : cyclesError ? (
            <div className="text-sm" style={{ color: C.red }}>Could not load cycles: {cyclesError}</div>
          ) : (
            <ThemedSelect
              id="cycle_id"
              name="cycle_id"
              value={cycleId}
              onChange={setCycleId}
              options={filteredCycles.map((c) => ({
                value: c.cycle_id,
                label: `Cycle ${c.block_sequence ?? c.cycle_id}`,
              }))}
              placeholder={cyclePlaceholder}
              disabled={!cropId}
            />
          )}
        </Field>

        <Field label="Harvest date" htmlFor="harvest_date">
          <input
            id="harvest_date"
            type="date"
            className={inputCls}
            style={{ borderColor: C.border }}
            value={harvestDate}
            onChange={(e) => setHarvestDate(e.target.value)}
          />
        </Field>

        <Field label="Quantity (kg)" htmlFor="qty_kg">
          <input
            id="qty_kg"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            className={inputCls}
            style={{ borderColor: C.border }}
            value={qtyKg}
            onChange={(e) => setQtyKg(e.target.value)}
            placeholder="e.g. 50"
          />
        </Field>

        <Field label="Grade" htmlFor="grade">
          <ThemedSelect
            id="grade"
            name="grade"
            value={grade}
            onChange={setGrade}
            options={GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))}
            placeholder="Select grade…"
          />
        </Field>

        <Field label="Destination" htmlFor="destination">
          <ThemedSelect
            id="destination"
            name="destination"
            value={destination}
            onChange={setDestination}
            options={DESTINATIONS.map((d) => ({ value: d, label: d }))}
            placeholder="Select destination…"
          />
          {destination === "OTHER" && (
            <input
              type="text"
              className={`${inputCls} mt-2`}
              style={{ borderColor: C.border }}
              value={destinationOther}
              onChange={(e) => setDestinationOther(e.target.value)}
              placeholder="Buyer name or description"
            />
          )}
        </Field>

        <Field label="Notes" htmlFor="notes" hint="Optional. Anything worth remembering about this harvest.">
          <textarea
            id="notes"
            rows={3}
            className={inputCls}
            style={{ borderColor: C.border }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {submitError && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ background: "#FDECEE", border: `1px solid ${C.border}`, color: C.red }}
          >
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl font-semibold text-white transition-colors"
          style={{
            background: canSubmit ? C.green : "#B8AE9B",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Logging harvest…" : "Log harvest"}
        </button>
      </form>

      <ComplianceModal open={!!modal} detail={modal} onClose={() => setModal(null)} />
    </div>
  );
}

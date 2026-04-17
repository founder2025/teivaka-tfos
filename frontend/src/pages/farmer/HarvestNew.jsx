/**
 * HarvestNew.jsx — /farm/harvest/new (Phase 4b MVP Week 1).
 *
 * Farmer-friendly harvest form. Replaces the raw cycle_id/pu_id text inputs of
 * HarvestLog.jsx with an active-cycle dropdown. Cycle selection sets both
 * cycle_id and pu_id on the request body.
 *
 * Backend contract (app/routers/harvests.py): POST /api/v1/harvests
 *   { cycle_id, pu_id, harvest_date, qty_kg, grade, destination, notes? }
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
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  amber:   "#BF9000",
  red:     "#B00020",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
  panel:   "#FFFFFF",
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
  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6AA84F]";

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
            href="mailto:founder@teivaka.com?subject=Harvest%20compliance%20override%20request"
            className="px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ border: `1px solid ${C.border}`, color: C.soil, background: "white" }}
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

  const [cycles, setCycles]             = useState([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [cyclesError, setCyclesError]   = useState("");

  const [cycleId, setCycleId]           = useState("");
  const [harvestDate, setHarvestDate]   = useState(todayISO());
  const [qtyKg, setQtyKg]               = useState("");
  const [grade, setGrade]               = useState("A");
  const [destination, setDestination]   = useState("MARKET");
  const [destinationOther, setDestinationOther] = useState("");
  const [notes, setNotes]               = useState("");

  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState("");
  const [toast, setToast]               = useState("");
  const [modal, setModal]               = useState(null);     // compliance-violation payload

  // Load user's active cycles on mount.
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
        const list = Array.isArray(body?.cycles) ? body.cycles : [];
        setCycles(list);
        if (list.length === 1) setCycleId(list[0].cycle_id);
      })
      .catch((e) => { if (!cancelled) setCyclesError(e.message || "Could not load cycles"); })
      .finally(() => { if (!cancelled) setCyclesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedCycle = cycles.find((c) => c.cycle_id === cycleId) || null;

  const finalDestination =
    destination === "OTHER" ? destinationOther.trim() : destination;

  const canSubmit =
    !submitting &&
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
        cycle_id:     selectedCycle.cycle_id,
        pu_id:        selectedCycle.pu_id,
        harvest_date: harvestDate,
        qty_kg:       Number(qtyKg),
        grade,
        destination:  finalDestination,
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
        setTimeout(() => navigate("/farm"), 700);
        return;
      }

      if (res.status === 409) {
        // Compliance violation — extract detail payload (standard shape from harvest_service)
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
        <Field label="Production cycle" htmlFor="cycle_id" hint="Only active cycles are shown.">
          {cyclesLoading ? (
            <div className="text-sm" style={{ color: C.muted }}>Loading cycles…</div>
          ) : cyclesError ? (
            <div className="text-sm" style={{ color: C.red }}>Could not load cycles: {cyclesError}</div>
          ) : cycles.length === 0 ? (
            <div className="text-sm" style={{ color: C.muted }}>
              No active cycles. Plant one before logging a harvest.
            </div>
          ) : (
            <select
              id="cycle_id"
              className={inputCls}
              style={{ borderColor: C.border }}
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
            >
              <option value="">Select a cycle…</option>
              {cycles.map((c) => (
                <option key={c.cycle_id} value={c.cycle_id}>
                  {c.pu_id} · {c.production_name || c.production_id}
                  {c.planting_date ? ` · planted ${c.planting_date}` : ""}
                </option>
              ))}
            </select>
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
          <select
            id="grade"
            className={inputCls}
            style={{ borderColor: C.border }}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
        </Field>

        <Field label="Destination" htmlFor="destination">
          <select
            id="destination"
            className={inputCls}
            style={{ borderColor: C.border }}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            {DESTINATIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
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

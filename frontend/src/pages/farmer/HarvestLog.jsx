/**
 * HarvestLog.jsx — Phase 4a-6 farmer harvest logging form.
 *
 * Flow:
 *   1. User fills cycle_id + pu_id + harvest_date + qty + grade + destination
 *   2. Click "Check compliance" → calls /harvests/compliance-check
 *   3. Green panel → submit enabled
 *   4. Red panel → shows blocking_chemicals + days_remaining + override textarea
 *      → submit enabled once override_reason >= 6 chars
 *   5. Submit POSTs /harvests; on 201 → /farm with success toast in URL hash
 *
 * Hard rule (inviolable #2): override_reason MUST be non-empty when override=true.
 * UI also blocks submit until either compliance is green OR override_reason set.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", gold: "#D4A017", border: "#E0D5C0", red: "#B91C1C" };

const GRADES = ["A", "B", "C"];
const DESTINATIONS = ["NAYANS", "MARKET", "WASTE", "OTHER"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

// Module-scope sub-components — never re-created across renders (no focus loss)

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1" style={{ color: C.soil }}>
      {children}
    </label>
  );
}

function Field({ label, htmlFor, children, hint }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs mt-1 text-gray-500">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400";

function CompliancePanel({ result }) {
  if (!result) return null;
  if (result.compliant) {
    return (
      <div className="rounded-lg p-3 border" style={{ background: "#ECFDF5", borderColor: C.green, color: "#065F46" }}>
        ✅ <strong>Compliance check passed.</strong> No chemical applications block this harvest date.
      </div>
    );
  }
  return (
    <div className="rounded-lg p-3 border" style={{ background: "#FEF2F2", borderColor: C.red, color: "#7F1D1D" }}>
      <div className="font-semibold mb-1">⛔ Cannot harvest yet — {result.days_remaining} day(s) remaining</div>
      <div className="text-xs mb-2">Clearance date: <strong>{result.clearance_date}</strong> · last application: {result.last_chemical_date}</div>
      {Array.isArray(result.blocking_chemicals) && result.blocking_chemicals.length > 0 && (
        <ul className="list-disc list-inside text-xs space-y-0.5">
          {result.blocking_chemicals.map((c, i) => (
            <li key={i}>
              <strong>{c.chem_name}</strong> applied {c.event_date} (WHD {c.whd_days}d → clears {c.clearance_date})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HarvestLog() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    cycle_id: "",
    pu_id: "",
    harvest_date: todayISO(),
    qty_kg: "",
    grade: "A",
    destination: "MARKET",
  });
  const [override, setOverride] = useState("");
  const [compliance, setCompliance] = useState(null);   // last compliance-check result
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setCompliance(null); // invalidate compliance result on any field change
    setError("");
  }

  async function checkCompliance() {
    setError("");
    setCompliance(null);
    if (!form.cycle_id.trim() || !form.pu_id.trim() || !form.harvest_date) {
      setError("Cycle ID, PU ID, and harvest date are required to check compliance.");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/v1/harvests/compliance-check", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          cycle_id: form.cycle_id.trim(),
          pu_id: form.pu_id.trim(),
          harvest_date: form.harvest_date,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail || `Check failed (HTTP ${res.status})`);
      } else {
        // Tolerate both raw body (legacy) and Part 13 envelope.
        setCompliance(data?.data ?? data);
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setChecking(false);
    }
  }

  const isCompliant = compliance && compliance.compliant === true;
  const hasOverrideReason = override.trim().length >= 6;
  const canSubmit =
    !submitting &&
    form.cycle_id.trim() && form.pu_id.trim() &&
    form.harvest_date && Number(form.qty_kg) > 0 &&
    (isCompliant || hasOverrideReason);

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const body = {
        cycle_id: form.cycle_id.trim(),
        pu_id: form.pu_id.trim(),
        harvest_date: form.harvest_date,
        qty_kg: Number(form.qty_kg),
        grade: form.grade,
        destination: form.destination,
      };
      if (!isCompliant && hasOverrideReason) {
        body.compliance_override = true;
        body.override_reason = override.trim();
      }
      const res = await fetch("/api/v1/harvests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 201) {
        const payload = data?.data ?? data;
        navigate(`/farm#harvest-logged=${encodeURIComponent(payload.harvest_id)}`);
        return;
      }
      if (res.status === 409 && data?.detail?.error?.code === "CHEMICAL_COMPLIANCE_VIOLATION") {
        // Re-show compliance block; user can add override reason and retry.
        setCompliance(data.detail.error.data);
        setError("Server blocked harvest on compliance check. See details below.");
      } else {
        setError(typeof data?.detail === "string" ? data.detail : `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4" style={{ fontFamily: "'Lora', Georgia, serif" }}>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-5 py-4" style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
          <h1 className="text-xl font-bold" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Log a harvest
          </h1>
          <p className="text-xs text-gray-600 mt-0.5">Chemical compliance is enforced — check before you record.</p>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Cycle ID" htmlFor="cycle_id" hint="e.g. F001-PU002-EGG-2026-001">
            <input id="cycle_id" className={inputCls} style={{ borderColor: C.border }}
                   value={form.cycle_id} onChange={(e) => update("cycle_id", e.target.value)}
                   placeholder="F001-PU002-EGG-2026-001" autoComplete="off" />
          </Field>

          <Field label="Production Unit (PU)" htmlFor="pu_id" hint="e.g. F001-PU002">
            <input id="pu_id" className={inputCls} style={{ borderColor: C.border }}
                   value={form.pu_id} onChange={(e) => update("pu_id", e.target.value)}
                   placeholder="F001-PU002" autoComplete="off" />
          </Field>

          <Field label="Harvest date" htmlFor="harvest_date">
            <input id="harvest_date" type="date" className={inputCls} style={{ borderColor: C.border }}
                   value={form.harvest_date} onChange={(e) => update("harvest_date", e.target.value)} />
          </Field>

          <Field label="Quantity (kg)" htmlFor="qty_kg">
            <input id="qty_kg" type="number" min="0.1" step="0.1" className={inputCls} style={{ borderColor: C.border }}
                   value={form.qty_kg} onChange={(e) => update("qty_kg", e.target.value)} placeholder="e.g. 50" />
          </Field>

          <Field label="Grade" htmlFor="grade">
            <ThemedSelect
              id="grade"
              name="grade"
              value={form.grade}
              onChange={(v) => update("grade", v)}
              options={GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))}
              placeholder="Select grade…"
            />
          </Field>

          <Field label="Destination" htmlFor="destination">
            <ThemedSelect
              id="destination"
              name="destination"
              value={form.destination}
              onChange={(v) => update("destination", v)}
              options={DESTINATIONS.map((d) => ({ value: d, label: d }))}
              placeholder="Select destination…"
            />
          </Field>

          <div className="flex items-center gap-2">
            <button type="button" onClick={checkCompliance} disabled={checking}
                    className="px-3 py-2 rounded-lg text-sm font-semibold border"
                    style={{ borderColor: C.green, color: C.green, background: "white" }}>
              {checking ? "Checking…" : "Check compliance"}
            </button>
            {compliance && (compliance.compliant
              ? <span className="text-xs" style={{ color: C.green }}>✓ cleared</span>
              : <span className="text-xs" style={{ color: C.red }}>✗ blocked</span>)}
          </div>

          <CompliancePanel result={compliance} />

          {compliance && !compliance.compliant && (
            <Field label="Override reason (required to bypass)" htmlFor="override_reason"
                   hint="Min 6 chars. Logged with the harvest record. Use only when justified.">
              <textarea id="override_reason" rows={3} className={inputCls} style={{ borderColor: C.border }}
                        value={override} onChange={(e) => setOverride(e.target.value)}
                        placeholder="e.g. emergency harvest authorized by manager — Cody verbal" />
            </Field>
          )}

          {error && (
            <div className="rounded-lg p-3 text-sm border" style={{ background: "#FEF2F2", borderColor: C.red, color: "#7F1D1D" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={!canSubmit}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                  style={{ background: canSubmit ? C.green : "#9CA3AF", cursor: canSubmit ? "pointer" : "not-allowed" }}>
            {submitting ? "Logging harvest…" : "Log harvest"}
          </button>
        </form>
      </div>
    </div>
  );
}

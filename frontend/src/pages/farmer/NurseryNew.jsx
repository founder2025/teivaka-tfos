/**
 * NurseryNew.jsx — /farm/nursery/new
 *
 * Create a nursery (propagation) batch. Submits to POST /api/v1/nursery,
 * which inserts tenant.nursery_batches. Crop list from GET /api/v1/productions
 * (crop_only), farm from /api/v1/farms (or the current-farm cache).
 *
 * Required by the API: farm_id, production_id, sowing_date, total_seeds_sown.
 * Everything else is optional and only sent when filled — no fabricated values.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const C = {
  soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)",
  red: "#B00020", cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863",
  ink: "#3A2E26", panel: "var(--paper)",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
           : { "Content-Type": "application/json" };
}
async function getJSON(u) {
  const r = await fetch(u, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const TODAY = () => new Date().toISOString().slice(0, 10);

const MEDIA = [
  { value: "", label: "—" },
  { value: "COCOPEAT", label: "Cocopeat" },
  { value: "SOIL_MIX", label: "Soil mix" },
  { value: "SAND_LOAM", label: "Sand / loam" },
];

const labelCls = "block text-xs font-bold uppercase tracking-wider mb-1";
const inputCls = "w-full rounded-lg border px-3 py-2 text-sm";
const inputStyle = { borderColor: C.border, background: C.panel, color: C.ink };

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className={labelCls} style={{ color: C.muted }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </span>
      {children}
    </label>
  );
}

export default function NurseryNew() {
  const navigate = useNavigate();
  const [farms, setFarms] = useState([]);
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [farmId, setFarmId] = useState(
    (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || ""
  );
  const [productionId, setProductionId] = useState("");
  const [variety, setVariety] = useState("");
  const [seedSource, setSeedSource] = useState("");
  const [sowingDate, setSowingDate] = useState(TODAY());
  const [medium, setMedium] = useState("");
  const [trayCount, setTrayCount] = useState("");
  const [seedsPerTray, setSeedsPerTray] = useState("");
  const [totalSeeds, setTotalSeeds] = useState("");
  const [expectedTransplant, setExpectedTransplant] = useState("");
  const [seedCost, setSeedCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [fRes, pRes] = await Promise.all([
          getJSON("/api/v1/farms"),
          getJSON("/api/v1/productions?is_active=true&crop_only=true"),
        ]);
        const fl = fRes?.data?.farms || fRes?.data || [];
        const pl = pRes?.data?.productions || pRes?.data || [];
        setFarms(Array.isArray(fl) ? fl : []);
        setProductions(Array.isArray(pl) ? pl : []);
        if (!farmId && Array.isArray(fl) && fl[0]?.farm_id) setFarmId(fl[0].farm_id);
      } catch {
        setError("Couldn't load crops/farm. Try again shortly.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!farmId || !productionId || !sowingDate || !totalSeeds) {
      setError("Crop, farm, sowing date and total seeds sown are required.");
      return;
    }
    const body = {
      farm_id: farmId,
      production_id: productionId,
      sowing_date: `${sowingDate}T08:00:00`,
      total_seeds_sown: Number(totalSeeds),
    };
    if (variety.trim()) body.variety = variety.trim();
    if (seedSource.trim()) body.seed_source = seedSource.trim();
    if (medium) body.germination_medium = medium;
    if (trayCount) body.tray_count = Number(trayCount);
    if (seedsPerTray) body.seeds_per_tray = Number(seedsPerTray);
    if (expectedTransplant) body.expected_transplant_date = `${expectedTransplant}T08:00:00`;
    if (seedCost) body.seed_cost_fjd = Number(seedCost);
    if (notes.trim()) body.notes = notes.trim();

    setSubmitting(true);
    try {
      const r = await fetch("/api/v1/nursery", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.detail?.message || j?.detail || `Couldn't save (${r.status}).`);
      }
      window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Nursery batch logged" } }));
      navigate("/farm/cycles");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <button onClick={() => navigate("/farm/cycles")} className="text-xs underline mb-3" style={{ color: C.greenDk }}>← Back to Production</button>
        <h1 className="text-2xl font-bold mb-1" style={{ color: C.soil }}>New nursery batch</h1>
        <p className="text-xs mb-4" style={{ color: C.muted }}>Propagation batch — seedlings before they become a field cycle.</p>

        {loading ? (
          <div className="rounded-2xl animate-pulse" style={{ height: 240, background: "var(--paper)" }} />
        ) : (
          <form onSubmit={submit} className="rounded-2xl border p-4 space-y-4" style={{ borderColor: C.border, background: "var(--paper)" }}>
            {error && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.red, background: "#FBEAE6", color: C.red }}>{error}</div>
            )}

            {farms.length > 1 && (
              <Field label="Farm" required>
                <select className={inputCls} style={inputStyle} value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                  {farms.map((f) => <option key={f.farm_id} value={f.farm_id}>{f.farm_name || f.farm_id}</option>)}
                </select>
              </Field>
            )}

            <Field label="Crop" required>
              <select className={inputCls} style={inputStyle} value={productionId} onChange={(e) => setProductionId(e.target.value)}>
                <option value="">Select a crop…</option>
                {productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sowing date" required>
                <input type="date" className={inputCls} style={inputStyle} value={sowingDate} onChange={(e) => setSowingDate(e.target.value)} />
              </Field>
              <Field label="Total seeds sown" required>
                <input type="number" min="0" className={inputCls} style={inputStyle} value={totalSeeds} onChange={(e) => setTotalSeeds(e.target.value)} placeholder="e.g. 500" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Variety">
                <input className={inputCls} style={inputStyle} value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Seed source">
                <input className={inputCls} style={inputStyle} value={seedSource} onChange={(e) => setSeedSource(e.target.value)} placeholder="e.g. SPC, own saved" />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Medium">
                <select className={inputCls} style={inputStyle} value={medium} onChange={(e) => setMedium(e.target.value)}>
                  {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Trays">
                <input type="number" min="0" className={inputCls} style={inputStyle} value={trayCount} onChange={(e) => setTrayCount(e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Seeds / tray">
                <input type="number" min="0" className={inputCls} style={inputStyle} value={seedsPerTray} onChange={(e) => setSeedsPerTray(e.target.value)} placeholder="optional" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected transplant date">
                <input type="date" className={inputCls} style={inputStyle} value={expectedTransplant} onChange={(e) => setExpectedTransplant(e.target.value)} />
              </Field>
              <Field label="Seed cost (FJD)">
                <input type="number" min="0" step="0.01" className={inputCls} style={inputStyle} value={seedCost} onChange={(e) => setSeedCost(e.target.value)} placeholder="optional" />
              </Field>
            </div>

            <Field label="Notes">
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
            </Field>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: C.green }}>
                {submitting ? "Saving…" : "Log nursery batch"}
              </button>
              <button type="button" onClick={() => navigate("/farm/cycles")}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ border: `1px solid ${C.border}`, color: C.soil, background: "var(--paper)" }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

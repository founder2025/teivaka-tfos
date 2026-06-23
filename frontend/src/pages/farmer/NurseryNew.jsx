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
import { ChevronLeft, ShieldCheck, Check, Loader2, User } from "lucide-react";

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
// Match the (+) capture engine's date phrasing in the "About to record" preview.
function prettyDate(ymd) {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d)) return ymd;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const MEDIA = [
  { value: "", label: "—" },
  { value: "COCOPEAT", label: "Cocopeat" },
  { value: "SOIL_MIX", label: "Soil mix" },
  { value: "SAND_LOAM", label: "Sand / loam" },
];

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

  // ── Engine card style language (mirrors capture/CaptureEngine.jsx) ──
  const wrap = { maxWidth: 460, margin: "0 auto", padding: 16, color: "#3a3527" };
  const card = { border: "1px solid #e6ded0", borderRadius: 14, padding: 14, marginBottom: 16, background: "#faf8f3" };
  const cardHead = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a917c", marginBottom: 10 };
  const fieldLabel = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#5a5a4a" };
  const inputBox = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14, boxSizing: "border-box", background: "#fff" };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", marginBottom: 12 };

  if (loading) return <div style={{ ...wrap, padding: 32, color: "#6b6b6b" }}>Loading…</div>;

  const cropName = productions.find((p) => p.production_id === productionId)?.production_name;
  const ready = farmId && productionId && sowingDate && totalSeeds;

  return (
    <div style={wrap}>
      <button onClick={() => navigate("/farm/cycles")} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>New nursery batch</h1>
      <p style={{ color: "#6b6b6b", fontSize: 13, marginBottom: 18 }}>Propagation batch — seedlings before they become a field cycle.</p>

      {error && (
        <div role="alert" style={{ background: "#fbe5e5", border: "1px solid #c98b8b", color: "#9a3b3b", padding: "10px 12px", borderRadius: 12, marginBottom: 14, fontSize: 13 }}>{error}</div>
      )}

      {/* Anchors — Farm · Crop · Operator */}
      <div style={card}>
        <div style={cardHead}>Anchors · farm · crop · operator</div>
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 10, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "#9a917c" }}>Farm</span>
          {farms.length > 1
            ? <select value={farmId} onChange={(e) => setFarmId(e.target.value)} style={inputBox}>
                {farms.map((f) => <option key={f.farm_id} value={f.farm_id}>{f.farm_name || f.farm_id}</option>)}
              </select>
            : <span style={{ fontWeight: 600 }}>{farmId || "—"}</span>}
          <span style={{ color: "#9a917c" }}>Crop</span>
          <select value={productionId} onChange={(e) => setProductionId(e.target.value)} style={inputBox}>
            <option value="">Select a crop…</option>
            {productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name}</option>)}
          </select>
          <span style={{ color: "#9a917c" }}>Operator</span>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><User size={14} />You</span>
        </div>
      </div>

      {/* When + how many */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Sowing date</label>
          <input type="date" value={sowingDate} onChange={(e) => setSowingDate(e.target.value)} style={inputBox} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Total seeds sown</label>
          <input type="number" min="0" value={totalSeeds} onChange={(e) => setTotalSeeds(e.target.value)} placeholder="e.g. 500" style={inputBox} />
        </div>
      </div>

      {/* Batch detail */}
      <div style={card}>
        <div style={cardHead}>Batch</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Variety</label>
            <input value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="optional" style={inputBox} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Seed source</label>
            <input value={seedSource} onChange={(e) => setSeedSource(e.target.value)} placeholder="e.g. SPC, own saved" style={inputBox} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Medium</label>
            <select value={medium} onChange={(e) => setMedium(e.target.value)} style={inputBox}>
              {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Trays</label>
            <input type="number" min="0" value={trayCount} onChange={(e) => setTrayCount(e.target.value)} placeholder="optional" style={inputBox} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Seeds / tray</label>
            <input type="number" min="0" value={seedsPerTray} onChange={(e) => setSeedsPerTray(e.target.value)} placeholder="optional" style={inputBox} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Expected transplant date</label>
            <input type="date" value={expectedTransplant} onChange={(e) => setExpectedTransplant(e.target.value)} style={inputBox} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Seed cost (FJD)</label>
            <input type="number" min="0" step="0.01" value={seedCost} onChange={(e) => setSeedCost(e.target.value)} placeholder="optional" style={inputBox} />
          </div>
        </div>
        <label style={fieldLabel}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" rows={3} style={{ ...inputBox, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {/* About to record — the audit preview */}
      <div style={{ border: "1px solid #cfe0cf", background: "#f0f6f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#3c5a3c" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> About to record</div>
        NURSERY_BATCH_CREATED · {cropName || "—"} · {totalSeeds || "0"} seeds · {prettyDate(sowingDate)} · You
      </div>

      <button onClick={submit} disabled={submitting || !ready}
        style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
          background: (!ready) ? "#b8b8b8" : "#2e7d32", cursor: submitting || !ready ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Saving…" : "Log nursery batch"}
      </button>
    </div>
  );
}

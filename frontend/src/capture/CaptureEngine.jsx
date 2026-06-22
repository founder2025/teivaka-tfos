/**
 * CaptureEngine — the Universal Capture Engine.
 *
 * Reads a per-vertical config (Gate 1 schema) and renders the verb-first,
 * inference-driven, bounded capture flow ON TOP of POST /events. No per-vertical
 * UI lives here — adding verbs/verticals is a config edit. This version implements
 * the full Resolution model: `primary` (zero-extra-tap default) and `branch`
 * (one mutually-exclusive choice screen). Depth dial = Field.tier (quick shown /
 * detail behind "Add detail"), uniform for everyone (no farmer mode — purged).
 *
 * Bounded by construction: verb -> (branch pick, only if present) -> capture.
 * Max 2-3 screens; inference auto-attaches the active cycle.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins,
  ChevronLeft, Check, Loader2, Plus,
} from "lucide-react";
import cropsConfig from "./config/crops";

const ICONS = { Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins };

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}
function todayOccurredAt() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}T12:00:00+12:00`;
}
const ALLOWED_UNITS = ["ML_PER_L", "G_PER_L", "L_PER_HA", "KG_PER_HA"];
function whdClearDate(days) {
  if (days == null) return "?";
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function CaptureEngine({ config = cropsConfig, onDone }) {
  const [cycles, setCycles] = useState([]);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [verb, setVerb] = useState(null);
  const [spec, setSpec] = useState(null);          // chosen EventSpec (primary or a branch option)
  const [cycleId, setCycleId] = useState("");
  const [values, setValues] = useState({});
  const [showDetail, setShowDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [chemicals, setChemicals] = useState([]);
  const [loadingChems, setLoadingChems] = useState(false);
  const [chemQuery, setChemQuery] = useState("");

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/cycles?cycle_status=ACTIVE", { headers: authHeaders() });
        const body = await res.json().catch(() => null);
        let list = body?.data ?? body;
        if (list && !Array.isArray(list)) list = list.cycles || list.items || [];
        if (!off) {
          setCycles(list || []);
          if ((list || []).length === 1) setCycleId(list[0].cycle_id);
        }
      } finally { if (!off) setLoadingCycles(false); }
    })();
    return () => { off = true; };
  }, []);

  const selectedCycle = useMemo(
    () => cycles.find((c) => c.cycle_id === cycleId) || null, [cycles, cycleId],
  );

  // Chemical picker: load shared.chemical_library only when a spec needs it (Inviolable #2 —
  // chemical_id is the WHD trigger anchor; the farmer must pick a real catalog row, never free-text).
  const needsChem = useMemo(() => !!spec?.capture?.some((f) => f.input === "chemical"), [spec]);
  useEffect(() => {
    if (!needsChem || !selectedCycle?.production_id) { setChemicals([]); return; }
    let off = false;
    (async () => {
      setLoadingChems(true);
      try {
        const pid = encodeURIComponent(selectedCycle.production_id);
        let body = await (await fetch(`/api/v1/chemicals?registered_for=${pid}`, { headers: authHeaders() })).json().catch(() => null);
        let list = body?.data ?? [];
        if (!Array.isArray(list) || list.length === 0) {           // fallback: no crop-registered rows -> full catalog
          body = await (await fetch(`/api/v1/chemicals`, { headers: authHeaders() })).json().catch(() => null);
          list = body?.data ?? [];
        }
        if (!off) setChemicals(Array.isArray(list) ? list : []);
      } finally { if (!off) setLoadingChems(false); }
    })();
    return () => { off = true; };
  }, [needsChem, selectedCycle?.production_id]);

  function pickVerb(v) {
    setVerb(v); setValues({}); setShowDetail(false); setError("");
    if (v.resolve.primary) setSpec(v.resolve.primary);   // straight to capture
    else setSpec(null);                                   // branch: show choices
  }
  function reset() {
    setVerb(null); setSpec(null); setValues({}); setShowDetail(false); setResult(null); setError("");
  }

  async function submit() {
    if (!spec || !selectedCycle) return;
    setSubmitting(true); setError("");
    const payload = {};
    for (const f of spec.capture) {
      const v = values[f.name];
      if (v !== undefined && v !== "" && v !== null) payload[f.name] = v;
    }
    // Inference: every CROPS payload requires production_id — inject the cycle's
    // crop so the farmer never types it (safe: schemas require it or allow extras).
    if (selectedCycle.production_id) payload.production_id = selectedCycle.production_id;
    const envelope = {
      event_type: spec.event_type, occurred_at: todayOccurredAt(),
      anchors: { farm_id: selectedCycle.farm_id, pu_id: selectedCycle.pu_id, cycle_id: selectedCycle.cycle_id },
      payload,
    };
    try {
      const res = await fetch("/api/v1/events", { method: "POST", headers: authHeaders(), body: JSON.stringify(envelope) });
      const parsed = await res.json().catch(() => null);
      if (res.status === 201 && parsed?.status === "success") {
        setResult({ event_id: parsed.data?.event_id || "", audit_hash: parsed.data?.audit_hash || "" });
      } else {
        setError(parsed?.error?.message || parsed?.detail?.message ||
          (typeof parsed?.detail === "string" ? parsed.detail : `${res.status} ${res.statusText}`));
      }
    } catch (e) { setError(`Network error: ${e.message}`); }
    finally { setSubmitting(false); }
  }

  const wrap = { maxWidth: 460, margin: "0 auto", padding: 16 };
  const tile = { display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 18,
    borderRadius: 16, border: "1px solid #e5e1d8", background: "#fff", cursor: "pointer", textAlign: "left", marginBottom: 12 };
  const iconBox = { width: 44, height: 44, borderRadius: 12, background: "#f1efe8", display: "grid", placeItems: "center", flexShrink: 0 };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", marginBottom: 12 };

  // --- success ---
  if (result) return (
    <div style={wrap}><div style={{ textAlign: "center", padding: "32px 0" }}>
      <Check size={56} style={{ color: "#2e7d32" }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>Saved</h2>
      <p style={{ color: "#6b6b6b", fontSize: 13, marginTop: 6 }}>
        Recorded {result.event_id}{result.audit_hash ? ` · ${result.audit_hash.slice(0, 12)}…` : ""}</p>
      <button onClick={reset} style={{ ...tile, justifyContent: "center", marginTop: 24 }}><Plus size={18} /> Log something else</button>
      {onDone && (
        <button onClick={onDone} style={{ ...tile, justifyContent: "center", marginTop: 0, background: "#2e7d32", color: "#fff", border: "none" }}>
          <Check size={18} /> Done
        </button>
      )}
    </div></div>
  );

  // --- verb grid ---
  if (!verb) return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>What did you do?</h1>
      <p style={{ color: "#6b6b6b", fontSize: 13, marginBottom: 18 }}>Tap one.</p>
      {config.verbs.map((v) => { const I = ICONS[v.icon] || Eye; return (
        <button key={v.id} style={tile} onClick={() => pickVerb(v)}>
          <span style={iconBox}><I size={22} style={{ color: "#3c5a3c" }} /></span>
          <span><span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{v.label}</span>
            <span style={{ display: "block", color: "#8a8a8a", fontSize: 12.5 }}>{v.descriptor}</span></span>
        </button>); })}
    </div>
  );

  // --- branch choice (verb has no primary) ---
  if (!spec) return (
    <div style={wrap}>
      <button onClick={reset} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{verb.resolve.branch?.prompt || verb.label}</h1>
      {(verb.resolve.branch?.options || []).map((o) => (
        <button key={o.event_type} style={tile} onClick={() => { setSpec(o); setValues({}); setShowDetail(false); }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{o.choiceLabel}</span>
        </button>
      ))}
    </div>
  );

  // --- capture ---
  const quick = spec.capture.filter((f) => f.tier === "quick");
  const detail = spec.capture.filter((f) => f.tier === "detail");
  function setVal(n, v) { setValues((s) => ({ ...s, [n]: v })); }
  function pickChemical(name, c) {
    setValues((s) => {
      const next = { ...s, [name]: c.chemical_id };
      // Auto-fill the rate unit from the catalog default, but only if it's a valid enum value.
      if (c.default_unit && ALLOWED_UNITS.includes(c.default_unit) && spec.capture.some((f) => f.name === "unit")) {
        next.unit = c.default_unit;
      }
      return next;
    });
  }

  function fieldInput(f) {
    const v = values[f.name] ?? "";
    if (f.input === "chemical") {
      const selected = chemicals.find((c) => c.chemical_id === v) || null;
      const filtered = chemQuery
        ? chemicals.filter((c) => (c.chem_name || "").toLowerCase().includes(chemQuery.toLowerCase()))
        : chemicals;
      return (
        <div>
          {loadingChems ? <p style={{ color: "#6b6b6b", fontSize: 13 }}>Loading chemicals…</p>
            : chemicals.length === 0 ? <p style={{ color: "#9a3b3b", fontSize: 13 }}>No chemicals in the library yet.</p>
            : (<>
              <input placeholder="Search chemical…" value={chemQuery} onChange={(e) => setChemQuery(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14, marginBottom: 8 }} />
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((c) => (
                  <button key={c.chemical_id} onClick={() => pickChemical(f.name, c)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      border: v === c.chemical_id ? "2px solid #2e7d32" : "1px solid #d8d4c8",
                      background: v === c.chemical_id ? "#eaf3ea" : "#fff", cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, display: "block" }}>{c.chem_name}</span>
                    <span style={{ fontSize: 12, color: "#8a8a8a" }}>
                      {c.active_ingredient ? `${c.active_ingredient} · ` : ""}WHD {c.withholding_period_days ?? "?"}d</span>
                  </button>
                ))}
              </div>
            </>)}
          {selected && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#fff7e6", border: "1px solid #f0d9a0", fontSize: 13, color: "#7a5b14" }}>
              ⚠ Harvest blocked {selected.withholding_period_days ?? "?"} days — clears {whdClearDate(selected.withholding_period_days)}
            </div>
          )}
        </div>
      );
    }
    if (f.input === "choice") return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {f.options.map((o) => (
          <button key={o.value} onClick={() => setVal(f.name, o.value)}
            style={{ padding: "12px 18px", borderRadius: 12, fontSize: 15, fontWeight: 600,
              border: v === o.value ? "2px solid #2e7d32" : "1px solid #d8d4c8",
              background: v === o.value ? "#eaf3ea" : "#fff", cursor: "pointer" }}>{o.label}</button>
        ))}
      </div>
    );
    if (f.input === "number") { const n = Number(v) || 0; return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setVal(f.name, Math.max(0, n - 1))} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid #d8d4c8", background: "#fff", fontSize: 22, cursor: "pointer" }}>−</button>
        <input type="number" value={v} onChange={(e) => setVal(f.name, e.target.value)} inputMode="numeric"
          style={{ width: 90, textAlign: "center", padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", fontSize: 18, fontWeight: 700 }} />
        <button onClick={() => setVal(f.name, n + 1)} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid #d8d4c8", background: "#fff", fontSize: 22, cursor: "pointer" }}>+</button>
      </div>
    ); }
    return <input value={v} onChange={(e) => setVal(f.name, e.target.value)}
      style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", fontSize: 15 }} />;
  }

  return (
    <div style={wrap}>
      <button onClick={reset} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{spec.choiceLabel || verb.label}</h1>
      {loadingCycles ? <p style={{ color: "#6b6b6b" }}>Loading your crops…</p>
        : cycles.length === 0 ? <p style={{ color: "#9a3b3b" }}>No active crop cycle yet — start a crop first.</p>
        : (<>
          {cycles.length === 1
            ? <p style={{ fontSize: 14, marginBottom: 16 }}>For <strong>{selectedCycle?.production_name || selectedCycle?.cycle_id}</strong></p>
            : <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", marginBottom: 16 }}>
                <option value="">Which crop?</option>
                {cycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>{c.production_name || c.cycle_id}{c.pu_farmer_label ? ` · ${c.pu_farmer_label}` : ""}</option>)}
              </select>}
          {quick.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{f.ask}</label>{fieldInput(f)}</div>)}
          {detail.length > 0 && !showDetail && <button onClick={() => setShowDetail(true)} style={{ background: "none", border: "none", color: "#3c5a3c", fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>+ Add detail</button>}
          {showDetail && detail.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{f.ask}</label>{fieldInput(f)}</div>)}
          {error && <p style={{ color: "#9a3b3b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button onClick={submit} disabled={submitting || !selectedCycle}
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
              background: !selectedCycle ? "#b8b8b8" : "#2e7d32", cursor: submitting || !selectedCycle ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Saving…" : "Save"}</button>
        </>)}
    </div>
  );
}

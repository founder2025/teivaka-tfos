/**
 * PlanMyFarm — /tis/plan — the prototype's TIS "planning door", honest edition.
 *
 * The prototype shows a projected crop plan (timeline + economics) and an "Add to my
 * farm" that instantiates a cycle. The illustrative growth-model numbers can't be
 * shipped (Inviolable #1 — no invented agronomy). So this real version: pick a crop →
 * see the CITED per-stage nutrition guidance that genuinely exists
 * (GET /agronomy/nutrition/{crop}/stages, FAO/SPC-sourced), then act for real —
 * "Start a crop run" (real cycle creation) or "Ask TIS" (real chat). Where the KB
 * has no rows for a crop yet, it says so honestly rather than faking a plan.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, MessageSquare, CalendarPlus, FlaskConical, BookOpen } from "lucide-react";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function getJSON(url) {
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// Local synonyms → the agronomy KB crop_key (only what's seeded is resolvable; the
// rest fall through to an honest empty state, never a fabricated plan).
const KEY_SYNONYM = { dalo: "taro", taro: "taro", talo: "taro" };
function cropKey(p) {
  const base = String(p.production_name || p.local_name || p.production_id || "").toLowerCase().trim();
  const first = base.split(/[\s/]+/)[0];
  return KEY_SYNONYM[first] || first;
}

export default function PlanMyFarm() {
  const navigate = useNavigate();
  const [crops, setCrops] = useState(null);
  const [sel, setSel] = useState("");
  const [stages, setStages] = useState(undefined); // undefined=idle, null=loading, []=none, [...]=data

  useEffect(() => {
    getJSON("/api/v1/productions?is_active=true&crop_only=true")
      .then((r) => setCrops(r?.data?.productions || r?.data || []))
      .catch(() => setCrops([]));
  }, []);

  const selected = useMemo(() => (crops || []).find((c) => c.production_id === sel) || null, [crops, sel]);

  useEffect(() => {
    if (!selected) { setStages(undefined); return; }
    setStages(null);
    const key = cropKey(selected);
    getJSON(`/api/v1/agronomy/nutrition/${encodeURIComponent(key)}/stages?country=FJI`)
      .then((r) => { const d = r?.data ?? r; setStages(Array.isArray(d) ? d : (d?.stages || [])); })
      .catch(() => setStages([]));
  }, [selected]);

  const card = { border: "1px solid var(--line)", borderRadius: 14, padding: 16, background: "var(--paper)", marginBottom: 14 };
  const C = { soil: "var(--soil)", muted: "var(--muted)", green: "var(--green)", greenDk: "var(--green-dk)" };

  return (
    <div className="tfp">
      <main className="main-content"><div className="main-inner" style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="page-header">
          <div>
            <h1>Plan my farm</h1>
            <div className="subtitle">Pick a crop → see cited nutrition guidance → start the crop run. TIS plans from what's known, never invented.</div>
          </div>
        </div>

        {/* crop picker */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Sprout size={16} style={{ color: C.greenDk }} /><strong style={{ color: C.soil }}>What do you want to grow?</strong>
          </div>
          {crops == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading crops…</div>
            : crops.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No crops in the catalog yet.</div>
            : (
              <select value={sel} onChange={(e) => setSel(e.target.value)}
                style={{ width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, background: "var(--paper)", color: C.soil }}>
                <option value="">Select a crop…</option>
                {crops.map((c) => <option key={c.production_id} value={c.production_id}>{c.production_name}{c.local_name && c.local_name.toLowerCase() !== (c.production_name || "").toLowerCase() ? ` · ${c.local_name}` : ""}</option>)}
              </select>
            )}
        </div>

        {selected && (
          <>
            {/* real actions */}
            <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/farm/cycles/new")}
                style={{ flex: 1, minWidth: 200, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderRadius: 12, border: "none", background: C.green, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                <CalendarPlus size={16} /> Start a crop run
              </button>
              <button onClick={() => navigate("/tis")}
                style={{ flex: 1, minWidth: 200, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", color: C.soil, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                <MessageSquare size={16} /> Ask TIS about {selected.production_name}
              </button>
            </div>

            {/* cited nutrition plan (real KB) */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <FlaskConical size={16} style={{ color: C.greenDk }} /><strong style={{ color: C.soil }}>Nutrition guidance by stage</strong>
                <span style={{ fontSize: 11.5, color: C.muted }}>· cited (FAO/SPC), not invented</span>
              </div>
              {stages == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
                : !stages.length ? (
                  <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                    No cited nutrition plan for {selected.production_name} yet — the KB is being built crop by crop.
                    Ask TIS for guidance, or start the crop run and log as you go.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stages.map((s, i) => (
                      <div key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                        <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{s.stage || s.bbch_stage || s.stage_label || `Stage ${i + 1}`}</div>
                        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                          {[s.n_g_per_plant != null && `N ${s.n_g_per_plant}g`, s.p_g_per_plant != null && `P ${s.p_g_per_plant}g`, s.k_g_per_plant != null && `K ${s.k_g_per_plant}g`].filter(Boolean).join(" · ") || (s.guidance || s.notes || "")}
                          {s.citation ? ` · ${s.citation}` : ""}{s.verification_status ? ` · ${s.verification_status}` : ""}
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic", marginTop: 4 }}>
                      <BookOpen size={11} style={{ verticalAlign: -1 }} /> Indicative — confirm timing with your extension officer.
                    </div>
                  </div>
                )}
            </div>
          </>
        )}
      </div></main>
    </div>
  );
}

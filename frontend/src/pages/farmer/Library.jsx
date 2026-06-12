/**
 * Library.jsx — /farm/library — the prototype's knowledge reference.
 *
 * "Knowledge for your farm" — distinct from /me/library (which manages the
 * farm's own reusable lists). All real or honest-empty, cited where it matters:
 *   Chemicals  — GET /api/v1/chemicals (chem_name, active ingredient, WHD,
 *                registered crops) — the same library the WHD moat enforces.
 *   Crops      — GET /api/v1/productions?crop_only=true
 *   Knowledge  — GET /api/v1/kb (validated KB articles)
 *   Nutrition  — GET /api/v1/agronomy/nutrition/{crop}/stages (cited NPK +
 *                verification_status; Inviolable #1 — never invented). Honest
 *                404 when a crop has no extension-reviewed protocol yet.
 *   Pests & diseases — honest-empty (no pest/disease reference table yet).
 */
import { useEffect, useMemo, useState } from "react";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD",
  amber: "#BF9000", red: "#B00020", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

const TABS = [
  ["crops", "Crops", "Catalog"],
  ["chemicals", "Chemicals", "Cited withholding"],
  ["pests", "Pests", "Reference"],
  ["diseases", "Diseases", "Reference"],
  ["fertilizers", "Fertilizers", "Reference"],
  ["livestock", "Livestock diseases", "Reference"],
  ["vet", "Vet & vaccines", "Reference"],
  ["nutrition", "Nutrition", "Cited NPK"],
  ["kb", "Knowledge base", "Articles"],
];

// Generic card for the shared.reference_library corpus (pests/diseases/fertilizers/
// livestock-diseases/vet) — fields vary per category, shown from `attributes`.
function ReferenceCard({ row }) {
  const a = row.attributes || {};
  const pills = [];
  if (a.severity) pills.push(["severity", a.severity]);
  if (a.whd != null) pills.push(["WHD", `${a.whd}d`]);
  if (a.whd_meat) pills.push(["meat WHD", a.whd_meat]);
  if (a.npk) pills.push(["NPK", a.npk]);
  const sub = a.sci || a.pathogen || a.species || a.npk || a.cat || "";
  const desc = a.symptoms || a.control || a.indication || a.notes || a.usage || a.dosage || a.prevention || "";
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-semibold" style={{ color: C.soil }}>{row.name}</div>
        <div className="flex gap-1 flex-wrap">{pills.map(([k, v]) => <Pill key={k} bg={C.greenTint} fg={C.greenDk}>{k} {v}</Pill>)}</div>
      </div>
      {sub && <div className="text-[11px] italic mt-0.5" style={{ color: C.muted }}>{sub}</div>}
      {desc && <div className="text-xs mt-1" style={{ color: C.muted }}>{desc}</div>}
    </div>
  );
}

function ReferenceTab({ category, search }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(null); setError(false);
    getJSON(`/api/v1/reference-library?category=${category}`)
      .then((r) => { if (alive) setRows(r.data || []); })
      .catch(() => { if (alive) { setRows([]); setError(true); } });
    return () => { alive = false; };
  }, [category]);
  const q = (search || "").trim().toLowerCase();
  const filtered = (rows || []).filter((r) => !q || `${r.name} ${JSON.stringify(r.attributes || {})}`.toLowerCase().includes(q));
  if (rows == null) return <Empty text="Loading…" />;
  if (error) return <Empty text="Couldn't load this reference right now — check your connection and try again." />;
  if (filtered.length === 0) return <Empty text="No matches." />;
  return <div className="space-y-2">{filtered.map((r) => <ReferenceCard key={r.ref_id} row={r} />)}</div>;
}

function Pill({ children, bg, fg }) { return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color: fg }}>{children}</span>; }
function Empty({ text }) { return <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>{text}</div>; }

export default function Library() {
  const [tab, setTab] = useState("chemicals");
  const [search, setSearch] = useState("");
  const [chems, setChems] = useState(null);
  const [crops, setCrops] = useState(null);
  const [kb, setKb] = useState(null);

  useEffect(() => {
    (async () => {
      const [c, p, k] = await Promise.allSettled([
        getJSON("/api/v1/chemicals"),
        getJSON("/api/v1/productions?crop_only=true&is_active=true"),
        getJSON("/api/v1/kb"),
      ]);
      setChems(c.status === "fulfilled" ? (c.value?.data || []) : []);
      const pl = p.status === "fulfilled" ? (p.value?.data?.productions || p.value?.data || []) : [];
      setCrops(Array.isArray(pl) ? pl : []);
      setKb(k.status === "fulfilled" ? (k.value?.data || []) : []);
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const chemRows = useMemo(() => (chems || []).filter((c) => !q || `${c.chem_name} ${c.active_ingredient}`.toLowerCase().includes(q)), [chems, q]);
  const cropRows = useMemo(() => (crops || []).filter((c) => !q || `${c.production_name} ${c.local_name || ""} ${c.category || ""} ${c.plant_family || ""}`.toLowerCase().includes(q)), [crops, q]);
  const kbRows = useMemo(() => (kb || []).filter((a) => !q || `${a.title} ${a.category || ""}`.toLowerCase().includes(q)), [kb, q]);

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Library</h1>
        <div className="text-xs mt-0.5 mb-3" style={{ color: C.muted }}>Knowledge for your farm — cited, never invented</div>

        {tab !== "nutrition" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="w-full mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border, background: C.panel, color: C.soil }} />
        )}

        <div className="flex gap-2 overflow-x-auto mb-3">
          {TABS.map(([v, label, sub]) => (
            <button key={v} onClick={() => setTab(v)} className="px-3 py-2 rounded-lg text-sm font-semibold border text-left shrink-0"
              style={{ borderColor: tab === v ? C.green : C.border, background: tab === v ? C.greenTint : "#fff", color: C.soil }}>
              {label}<span className="block text-[10px] font-normal" style={{ color: C.muted }}>{sub}</span>
            </button>
          ))}
        </div>

        {tab === "chemicals" && (chems == null ? <Empty text="Loading…" /> : chemRows.length === 0 ? <Empty text="No chemicals match." /> : (
          <div className="space-y-2">
            {chemRows.map((c, i) => (
              <div key={c.chemical_id || c.chem_name || i} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold" style={{ color: C.soil }}>{c.chem_name}</div>
                  {c.withholding_period_days != null && <Pill bg={C.amber} fg="#fff">WHD {c.withholding_period_days}d</Pill>}
                </div>
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>{c.active_ingredient || "—"}{Array.isArray(c.registered_crops) && c.registered_crops.length ? ` · registered for ${c.registered_crops.length} crop${c.registered_crops.length === 1 ? "" : "s"}` : ""}</div>
              </div>
            ))}
          </div>
        ))}

        {tab === "crops" && (crops == null ? <Empty text="Loading…" /> : cropRows.length === 0 ? <Empty text="No crops match." /> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cropRows.map((c) => (
              <div key={c.production_id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold" style={{ color: C.soil }}>{c.production_name}{c.local_name ? <span className="font-normal text-[11px]" style={{ color: C.muted }}> · {c.local_name}</span> : null}</div>
                  {c.category && <Pill bg={C.greenTint} fg={C.greenDk}>{c.category}</Pill>}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{[c.plant_family, c.lifecycle].filter(Boolean).join(" · ") || c.production_id}</div>
              </div>
            ))}
          </div>
        ))}

        {tab === "nutrition" && <NutritionTab crops={crops || []} />}

        {tab === "kb" && (kb == null ? <Empty text="Loading…" /> : kbRows.length === 0
          ? <Empty text="No knowledge-base articles published yet — validated articles appear here as they're added." />
          : (
            <div className="space-y-2">
              {kbRows.map((a) => (
                <div key={a.kb_entry_id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
                  <div className="font-semibold" style={{ color: C.soil }}>{a.title}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{a.category || "—"}</div>
                </div>
              ))}
            </div>
          ))}

        {tab === "pests" && <ReferenceTab category="PEST" search={search} />}
        {tab === "diseases" && <ReferenceTab category="DISEASE" search={search} />}
        {tab === "fertilizers" && <ReferenceTab category="FERTILIZER" search={search} />}
        {tab === "livestock" && <ReferenceTab category="LIVESTOCK_DISEASE" search={search} />}
        {tab === "vet" && <ReferenceTab category="VET" search={search} />}
      </div>
    </div>
  );
}

function NutritionTab({ crops }) {
  const [crop, setCrop] = useState("");
  const [stages, setStages] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!crop) { setStages(null); setErr(""); return; }
    let alive = true;
    (async () => {
      setStages(null); setErr("");
      try {
        const r = await fetch(`/api/v1/agronomy/nutrition/${encodeURIComponent(crop)}/stages?country=FJI`, { headers: authHeaders() });
        if (r.status === 404) { if (alive) setErr("No extension-reviewed nutrition protocol seeded for this crop yet."); return; }
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.json();
        if (alive) setStages(b?.data?.stages || b?.stages || b?.data || []);
      } catch { if (alive) setErr("Couldn't load nutrition data."); }
    })();
    return () => { alive = false; };
  }, [crop]);

  return (
    <div>
      <div className="text-xs mb-2" style={{ color: C.muted }}>Cited N-P-K guidance per growth stage (FJI) — sourced, with a verification status. Only crops with extension-reviewed data appear.</div>
      <select value={crop} onChange={(e) => setCrop(e.target.value)} className="rounded-lg border px-3 py-2 text-sm mb-3" style={{ borderColor: C.border, background: C.panel, color: C.soil }}>
        <option value="">Select a crop…</option>
        {crops.map((c) => <option key={c.production_id} value={c.production_id}>{c.production_name}</option>)}
      </select>
      {!crop ? null
        : err ? <Empty text={err} />
        : stages == null ? <Empty text="Loading…" />
        : stages.length === 0 ? <Empty text="No stages found." />
        : (
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold" style={{ color: C.soil }}>{s.stage}{s.stage_window_text ? ` · ${s.stage_window_text}` : ""}</div>
                  {s.verification_status && <Pill bg={C.greenTint} fg={C.greenDk}>{s.verification_status}</Pill>}
                </div>
                <div className="text-xs mt-1" style={{ color: C.soil }}>N {s.n_g_per_plant ?? "—"} · P {s.p_g_per_plant ?? "—"} · K {s.k_g_per_plant ?? "—"} g/plant{s.application_method ? ` · ${s.application_method}` : ""}</div>
                {s.source_citation && <div className="text-[10px] mt-1 italic" style={{ color: C.muted }}>Source: {s.source_citation}</div>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/**
 * Library.jsx — /farm/library — PIXEL-EXACT rebuild of the prototype's Farm Library.
 *
 * Reproduces the sacred v263 prototype's Library surface (producerLibrary) pixel-for-
 * pixel — its exact DOM + classes rendered under <TfpShell> (styles/prototype.css,
 * scoped .tfp) — wired to real backend data, honest-empty where no data exists.
 *
 *   Crops       → GET /api/v1/reference-library?category=CROP   (prototype LIB_CROPS,
 *                 94 rows seeded verbatim — varieties, iTaukei name, yields, tier, …)
 *   Chemicals   → GET /api/v1/chemicals  (the REAL WHD-enforcing shared.chemical_library
 *                 — single source of truth per Inviolable #2; never a parallel copy)
 *   Pests/Diseases/Fertilizers/Livestock/Vet → GET /api/v1/reference-library?category=…
 *                 (prototype's verbatim Fiji corpus — Inviolable #1, never invented)
 *   Nutrition   → GET /api/v1/agronomy/nutrition/{crop}/stages  (cited NPK + status)
 *   Knowledge   → GET /api/v1/kb  (validated KB articles)
 *
 * "Request library update" → POST /api/v1/library/request-update (kb_article_candidates).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Search, MessageSquare, Shield, Check, User, Plus, ChevronDown, BookOpen,
  Leaf, Droplet, Cloud, X,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { getJSON } from "../../utils/api";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

/* ---- prototype bucketing helpers (verbatim logic from the prototype) ---- */
function cropLifecycle(a) {
  const lc = (a.lifecycle || "").toLowerCase();
  if (lc.includes("annual")) return "annual";
  if (lc.includes("perennial")) return "perennial";
  return "other";
}
function cropCategory(a) {
  const c = (a.cat || "").toLowerCase();
  if (["livestock", "poultry", "apiculture", "aquaculture"].includes(c)) return "livestock";
  if (c === "crop" || c === "cash crop" || c === "vegetable") return "crop";
  if (c === "fruit") return "fruit";
  if (c === "forestry") return "forestry";
  return "other";
}
function diseaseBucket(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("fungal") || s.includes("oomycete")) return "fungal";
  if (s.includes("bacterial")) return "bacterial";
  if (s.includes("viral") || s.includes("virus")) return "viral";
  return "other";
}
function fertBucket(a) {
  const cat = (a.cat || "").toLowerCase();
  const name = (a.name || "").toLowerCase();
  if (cat.includes("foliar")) return "foliar";
  if (cat.includes("organic") || name.includes("manure") || name.includes("compost")) return "organic";
  if (cat.includes("nitrogen") || name.includes("urea")) return "nitrogen";
  if (cat.includes("compound") || /^npk/i.test(a.npk || "")) return "compound";
  if (cat.includes("soil") || cat.includes("amendment") || cat.includes("media")) return "soil";
  return "other";
}
function livSpecies(s) {
  const t = (s || "").toLowerCase();
  if (t.includes("cattle") && !t.includes("goat") && !t.includes("sheep") && !t.includes("pig")) return "cattle";
  if (t.includes("goat") || t.includes("sheep")) return "goatsheep";
  if (t.includes("pig")) return "pig";
  if (t.includes("chicken") || t.includes("poultry") || t.includes("duck") || t.includes("layer")) return "poultry";
  if (t.includes("bee")) return "bees";
  if (t.includes("tilapia") || t.includes("prawn") || t.includes("fish") || t.includes("shrimp")) return "aqua";
  if (t.includes("cattle")) return "cattle";
  return "other";
}
function sevClass(s) {
  return s === "Critical" ? "sev-crit" : s === "High" ? "sev-high" : s === "Medium" ? "sev-mid" : "sev-low";
}
function clip(v, n) { const s = (v ?? "").toString(); return s.length > n ? s.slice(0, n) + "…" : s; }

const SysBadge = () => <span className="lib-badge lib-badge-sys"><Check size={10} />verified · agronomist-reviewed</span>;
const MyBadge = () => <span className="lib-badge lib-badge-my"><User size={10} />your farm</span>;

/* ---- pagination: first 30 per tab + show-all toggle (prototype libPagedRender) ---- */
function Paged({ rows, tab, bypass, showAll, setShowAll, renderOne }) {
  const total = rows.length;
  const open = showAll[tab] || bypass;
  const visible = open ? rows : rows.slice(0, 30);
  return (
    <>
      <div className="lib-card-grid">{visible.map(renderOne)}</div>
      {!bypass && total > 30 && (
        <div className="lib-page-foot">
          {showAll[tab] ? (
            <>
              <button className="btn btn-secondary" onClick={() => setShowAll((s) => ({ ...s, [tab]: false }))}>Show fewer</button>
              <span className="lib-page-count">Showing all {total} rows</span>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setShowAll((s) => ({ ...s, [tab]: true }))}>Show all {total} <ChevronDown size={12} /></button>
              <span className="lib-page-count">Showing 30 of {total}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ---- filter pills (prototype libFilterPills) ---- */
function FilterPills({ tab, options, active, setActive }) {
  return (
    <div className="lib-filter-pills">
      <button className={`lib-fp ${active == null ? "active" : ""}`} onClick={() => setActive(tab, null)}>All</button>
      {options.map((o) => (
        <button key={o.id} className={`lib-fp ${active === o.id ? "active" : ""}`} onClick={() => setActive(tab, o.id)}>
          {o.label}<span className="lib-fp-c">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyCard({ children }) {
  return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>{children}</div>;
}

export default function Library() {
  const [tab, setTab] = useState("crops");
  const [search, setSearch] = useState("");
  const [affectsMine, setAffectsMine] = useState(false);
  const [hideVet, setHideVet] = useState(false);
  const [activeFilter, setActiveFilterState] = useState({});
  const [showAll, setShowAll] = useState({});
  const [detail, setDetail] = useState(null); // {kind, row}
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPrefill, setReqPrefill] = useState(null); // {kind?, details?}
  const [lessonOpen, setLessonOpen] = useState(false);

  const [crops, setCrops] = useState(null);
  const [chems, setChems] = useState(null);
  const [pests, setPests] = useState(null);
  const [dis, setDis] = useState(null);
  const [fert, setFert] = useState(null);
  const [livdis, setLivdis] = useState(null);
  const [vet, setVet] = useState(null);
  const [kb, setKb] = useState(null);
  const [myCrops, setMyCrops] = useState([]);

  const setActive = (t, id) => setActiveFilterState((s) => ({ ...s, [t]: id }));

  useEffect(() => {
    (async () => {
      const cat = (c) => getJSON(`/api/v1/reference-library?category=${c}`).then((r) => r.data || []).catch(() => []);
      const [cr, ch, pe, di, fe, ld, vt, k, cyc] = await Promise.allSettled([
        cat("CROP"),
        getJSON("/api/v1/chemicals").then((r) => r.data || []).catch(() => []),
        cat("PEST"), cat("DISEASE"), cat("FERTILIZER"), cat("LIVESTOCK_DISEASE"), cat("VET"),
        getJSON("/api/v1/kb").then((r) => r.data || []).catch(() => []),
        getJSON("/api/v1/cycles").then((r) => r.data?.cycles || r.data || []).catch(() => []),
      ]);
      const v = (p) => (p.status === "fulfilled" ? p.value : []);
      setCrops(v(cr)); setChems(v(ch)); setPests(v(pe)); setDis(v(di));
      setFert(v(fe)); setLivdis(v(ld)); setVet(v(vt)); setKb(v(k));
      const names = {};
      (v(cyc) || []).forEach((c) => {
        const n = (c.crop_name || c.production_name || c.cropType || "").toLowerCase();
        if (n) names[n] = true;
      });
      setMyCrops(Object.keys(names));
    })();
  }, []);

  // "What affects my crops" — match against a row's affects/crops/families text.
  const affectsMyCrops = (a) => {
    if (!affectsMine || myCrops.length === 0) return true;
    const hay = `${a.affects || ""} ${a.crops || ""} ${a.families || ""}`.toLowerCase();
    if (!hay.trim()) return false;
    return myCrops.some((n) => hay.includes(n));
  };

  const q = search.trim().toLowerCase();
  const searchRow = (name, a) => !q || `${name} ${JSON.stringify(a || {})}`.toLowerCase().includes(q);

  // Cross-library search results (prototype renderLibSearch)
  const searchHits = useMemo(() => {
    if (q.length < 2) return null;
    const pick = (rows, fields, kind) => (rows || []).filter((r) => (r.name || "").toLowerCase().includes(q) || fields.some((f) => ((r.attributes?.[f] ?? "").toString().toLowerCase()).includes(q))).map((r) => ({ id: r.ref_id, label: r.name, kind, row: r }));
    const groups = {
      crops: pick(crops, ["local", "varieties", "family"], "crop"),
      chemicals: (chems || []).filter((c) => `${c.chem_name} ${c.active_ingredient || ""}`.toLowerCase().includes(q)).map((c) => ({ id: c.chemical_id, label: c.chem_name, kind: "chem", row: c })),
      pests: pick(pests, ["sci", "damage", "affects", "symptoms"], "pest"),
      diseases: pick(dis, ["pathogen", "symptoms", "affects"], "dis"),
      fertilizers: pick(fert, ["brand", "cat", "npk"], "fert"),
    };
    const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
    return { groups, total };
  }, [q, crops, chems, pests, dis, fert]);

  const openRow = (kind, row) => setDetail({ kind, row });
  const openRequest = (prefill) => { setReqPrefill(prefill || null); setReqOpen(true); };

  // First-run: show the "How to use the Library" lesson once.
  useEffect(() => {
    try {
      if (!localStorage.getItem("tfos_lib_lesson_seen")) {
        setLessonOpen(true);
        localStorage.setItem("tfos_lib_lesson_seen", "1");
      }
    } catch { /* private mode — skip */ }
  }, []);

  // Tabs (prototype order; nutrition + kb kept as cited extras per Operator)
  const tabs = [
    ["crops", "Crops & Varieties", crops?.length ?? 0],
    ["chemicals", "Chemicals", chems?.length ?? 0],
    ["pests", "Pests", pests?.length ?? 0],
    ["diseases", "Diseases", dis?.length ?? 0],
    ["fertilizers", "Fertilizers", fert?.length ?? 0],
  ];
  if (!hideVet) tabs.push(["livestock", "Livestock & Vet", (livdis?.length ?? 0) + (vet?.length ?? 0)]);
  tabs.push(["nutrition", "Nutrition", null]);
  tabs.push(["kb", "Knowledge base", kb?.length ?? 0]);
  const af = activeFilter[tab] ?? null;
  const bypass = affectsMine || af != null;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Library</h1><div className="subtitle">Knowledge for your farm · crops, chemicals, pests, diseases, fertilizers, livestock</div></div>
            <div className="page-actions">
              <button className="btn btn-secondary" onClick={() => setLessonOpen(true)}><BookOpen size={13} />How to use</button>
              <button className="btn btn-secondary" onClick={() => openRequest(null)}><MessageSquare size={13} />Request library update</button>
            </div>
          </div>

          {/* Search bar */}
          <div className="lib-search-bar">
            <Search size={14} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all libraries — chemical, pest, disease, crop, fertilizer..." />
            <label className="lib-filter-toggle">
              <input type="checkbox" checked={affectsMine} onChange={(e) => setAffectsMine(e.target.checked)} />What affects my crops
            </label>
          </div>

          {/* Cross-library search results */}
          {searchHits && (
            searchHits.total === 0 ? (
              <div className="lib-search-empty">
                No results for "{search}". If it should be in the library, tell Teivaka —
                your search becomes signal the agronomists review.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => openRequest({ kind: "Other", details: `Searched for "${search.trim()}" — not found in the library.` })}>
                    <Plus size={12} />Request "{clip(search.trim(), 40)}" for the library
                  </button>
                </div>
              </div>
            ) : (
              <div className="lib-search-results">
                <div className="lib-search-h">{searchHits.total} results across libraries</div>
                {["crops", "chemicals", "pests", "diseases", "fertilizers"].map((g) => (
                  searchHits.groups[g].length === 0 ? null : (
                    <div className="lib-search-group" key={g}>
                      <div className="lib-search-group-h">{g} · {searchHits.groups[g].length}</div>
                      {searchHits.groups[g].slice(0, 5).map((h) => (
                        <a className="lib-search-hit" key={h.id} onClick={() => { setSearch(""); openRow(h.kind, h.row); }}>
                          <strong>{h.label}</strong> <span>{h.id}</span>
                        </a>
                      ))}
                    </div>
                  )
                ))}
              </div>
            )
          )}

          {/* Tabs */}
          <div className="lib-tabs">
            {tabs.map((t) => (
              <button key={t[0]} className={`lib-tab ${tab === t[0] ? "active" : ""}`} onClick={() => setTab(t[0])}>
                {t[1]}{t[2] != null && <span className="lib-tab-count">{t[2]}</span>}
              </button>
            ))}
          </div>

          {/* Settings strip */}
          <div className="lib-settings">
            <label><input type="checkbox" checked={hideVet} onChange={(e) => { setHideVet(e.target.checked); if (e.target.checked && tab === "livestock") setTab("crops"); }} />Hide Livestock & Vet (crop-only farm)</label>
          </div>

          {/* Active tab */}
          {tab === "crops" && (
            crops == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              let rows = crops.filter((r) => searchRow(r.name, r.attributes));
              if (af === "annual") rows = rows.filter((r) => cropLifecycle(r.attributes || {}) === "annual");
              if (af === "perennial") rows = rows.filter((r) => cropLifecycle(r.attributes || {}) === "perennial");
              if (af === "livestock") rows = rows.filter((r) => cropCategory(r.attributes || {}) === "livestock");
              if (affectsMine) rows = rows.filter((r) => affectsMyCrops(r.attributes || {}));
              const count = (fn) => crops.filter((r) => fn(r.attributes || {})).length;
              return (
                <>
                  <FilterPills tab="crops" active={af} setActive={setActive} options={[
                    { id: "annual", label: "Annual", count: count((a) => cropLifecycle(a) === "annual") },
                    { id: "perennial", label: "Perennial", count: count((a) => cropLifecycle(a) === "perennial") },
                    { id: "livestock", label: "Livestock", count: count((a) => cropCategory(a) === "livestock") },
                  ]} />
                  {rows.length === 0 ? <EmptyCard>No crops match.</EmptyCard> : (
                    <Paged rows={rows} tab="crops" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(r) => {
                      const a = r.attributes || {};
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("crop", r)}>
                          <div className="lib-card-h">{r.name}{a.local ? <> · <span className="lib-local">{a.local}</span></> : null}<SysBadge /></div>
                          <div className="lib-card-meta">{[a.family, a.lifecycle].filter(Boolean).join(" · ")}{a.best ? ` · best: ${a.best}` : ""}</div>
                          {a.varieties ? <div className="lib-card-body">Varieties: {clip(a.varieties, 90)}</div> : null}
                          <div className="lib-card-id">{r.ref_id}{a.tier ? ` · ${a.tier}` : ""}</div>
                        </div>
                      );
                    }} />
                  )}
                </>
              );
            })()
          )}

          {tab === "chemicals" && (
            chems == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              const rows = chems.filter((c) => !q || `${c.chem_name} ${c.active_ingredient || ""}`.toLowerCase().includes(q));
              return rows.length === 0 ? <EmptyCard>No chemicals match.</EmptyCard> : (
                <Paged rows={rows} tab="chemicals" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(c) => (
                  <div className="lib-card" key={c.chemical_id} onClick={() => openRow("chem", c)}>
                    <div className="lib-card-h">{c.chem_name}<SysBadge /></div>
                    <div className="lib-card-meta">{c.withholding_period_days != null ? <strong>{c.withholding_period_days}d WHD</strong> : null}{c.active_ingredient ? ` · ${clip(c.active_ingredient, 60)}` : ""}</div>
                    <div className="lib-card-body">{Array.isArray(c.registered_crops) && c.registered_crops.length ? `Registered for ${c.registered_crops.length} crop${c.registered_crops.length === 1 ? "" : "s"}` : "—"}</div>
                    <div className="lib-card-id">{c.chemical_id}</div>
                  </div>
                )} />
              );
            })()
          )}

          {tab === "pests" && (
            pests == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              let rows = pests.filter((r) => searchRow(r.name, r.attributes));
              if (af) rows = rows.filter((r) => (r.attributes || {}).severity === af);
              if (affectsMine) rows = rows.filter((r) => affectsMyCrops(r.attributes || {}));
              const count = (sev) => pests.filter((r) => (r.attributes || {}).severity === sev).length;
              return (
                <>
                  <FilterPills tab="pests" active={af} setActive={setActive} options={[
                    { id: "Critical", label: "Critical", count: count("Critical") },
                    { id: "High", label: "High", count: count("High") },
                    { id: "Medium", label: "Medium", count: count("Medium") },
                  ]} />
                  {rows.length === 0 ? <EmptyCard>No pests match.</EmptyCard> : (
                    <Paged rows={rows} tab="pests" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(r) => {
                      const a = r.attributes || {};
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("pest", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta">{a.sci ? <em>{a.sci}</em> : null} · <span className={`lib-sev ${sevClass(a.severity)}`}>{a.severity || "-"}</span>{a.season ? ` · ${a.season}` : ""}</div>
                          <div className="lib-card-body">Damage: {a.damage || "-"} · affects {clip(a.affects || "-", 100)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </div>
                      );
                    }} />
                  )}
                </>
              );
            })()
          )}

          {tab === "diseases" && (
            dis == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              let rows = dis.filter((r) => searchRow(r.name, r.attributes));
              if (af) rows = rows.filter((r) => diseaseBucket((r.attributes || {}).type) === af);
              if (affectsMine) rows = rows.filter((r) => affectsMyCrops(r.attributes || {}));
              const count = (b) => dis.filter((r) => diseaseBucket((r.attributes || {}).type) === b).length;
              return (
                <>
                  <FilterPills tab="diseases" active={af} setActive={setActive} options={[
                    { id: "fungal", label: "Fungal", count: count("fungal") },
                    { id: "bacterial", label: "Bacterial", count: count("bacterial") },
                    { id: "viral", label: "Viral", count: count("viral") },
                    { id: "other", label: "Other", count: count("other") },
                  ]} />
                  {rows.length === 0 ? <EmptyCard>No diseases match.</EmptyCard> : (
                    <Paged rows={rows} tab="diseases" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(r) => {
                      const a = r.attributes || {};
                      const bucket = diseaseBucket(a.type);
                      const tc = bucket === "fungal" ? "lib-type-fung" : bucket === "bacterial" ? "lib-type-bac" : bucket === "viral" ? "lib-type-viral" : "lib-type-other";
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("dis", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta"><span className={`lib-type-chip ${tc}`}>{a.type || "-"}</span> · {clip(a.pathogen || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.symptoms || "-", 140)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </div>
                      );
                    }} />
                  )}
                </>
              );
            })()
          )}

          {tab === "fertilizers" && (
            fert == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              let rows = fert.filter((r) => searchRow(r.name, r.attributes));
              if (af) rows = rows.filter((r) => fertBucket({ ...(r.attributes || {}), name: r.name }) === af);
              const count = (b) => fert.filter((r) => fertBucket({ ...(r.attributes || {}), name: r.name }) === b).length;
              return (
                <>
                  <FilterPills tab="fertilizers" active={af} setActive={setActive} options={[
                    { id: "nitrogen", label: "Nitrogen", count: count("nitrogen") },
                    { id: "compound", label: "Compound", count: count("compound") },
                    { id: "organic", label: "Organic", count: count("organic") },
                    { id: "foliar", label: "Foliar", count: count("foliar") },
                    { id: "soil", label: "Soil", count: count("soil") },
                  ]} />
                  {rows.length === 0 ? <EmptyCard>No fertilizers match.</EmptyCard> : (
                    <Paged rows={rows} tab="fertilizers" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(r) => {
                      const a = r.attributes || {};
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("fert", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta">{a.cat || "-"}{a.npk ? ` · NPK ${a.npk}` : ""}{a.pack ? ` · ${a.pack}` : ""}</div>
                          <div className="lib-card-body">{a.price ? `Price: ${clip(a.price, 60)}` : clip(a.dosage || "-", 100)}</div>
                          <div className="lib-card-id">{r.ref_id}{a.brand ? ` · ${a.brand}` : ""}</div>
                        </div>
                      );
                    }} />
                  )}
                </>
              );
            })()
          )}

          {tab === "livestock" && (
            livdis == null || vet == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              let lr = livdis.filter((r) => searchRow(r.name, r.attributes));
              let vr = vet.filter((r) => searchRow(r.name, r.attributes));
              if (af) {
                lr = lr.filter((r) => livSpecies((r.attributes || {}).species) === af);
                vr = vr.filter((r) => livSpecies((r.attributes || {}).species) === af);
              }
              const lc = (sp) => livdis.filter((r) => livSpecies((r.attributes || {}).species) === sp).length + vet.filter((r) => livSpecies((r.attributes || {}).species) === sp).length;
              return (
                <>
                  <FilterPills tab="livestock" active={af} setActive={setActive} options={[
                    { id: "cattle", label: "Cattle", count: lc("cattle") },
                    { id: "goatsheep", label: "Goat/Sheep", count: lc("goatsheep") },
                    { id: "pig", label: "Pig", count: lc("pig") },
                    { id: "poultry", label: "Poultry", count: lc("poultry") },
                    { id: "bees", label: "Bees", count: lc("bees") },
                    { id: "aqua", label: "Aquaculture", count: lc("aqua") },
                  ]} />
                  <div className="lib-section-h">Livestock diseases <span className="lib-section-c">{lr.length}</span></div>
                  <div className="lib-card-grid">
                    {lr.map((r) => {
                      const a = r.attributes || {};
                      const notif = (a.notifiable || "").toString().toLowerCase().includes("notifiable");
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("livdis", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge />{notif ? <span className="lib-notif">NOTIFIABLE</span> : null}</div>
                          <div className="lib-card-meta"><span className={`lib-sev ${sevClass(a.severity)}`}>{a.severity || "-"}</span> · {clip(a.species || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.symptoms || "-", 140)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="lib-section-h">Veterinary chemicals <span className="lib-section-c">{vr.length}</span></div>
                  <div className="lib-card-grid">
                    {vr.map((r) => {
                      const a = r.attributes || {};
                      const rx = (a.rx || "").toString().toLowerCase().includes("yes") || (a.rx || "").toString().toLowerCase().includes("prescript");
                      return (
                        <div className="lib-card" key={r.ref_id} onClick={() => openRow("vet", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge />{rx ? <span className="lib-rx">Rx</span> : null}</div>
                          <div className="lib-card-meta">{a.cat || "-"} · {clip(a.species || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.indication || "-", 120)}</div>
                          <div className="lib-card-id">{r.ref_id}{a.whd_meat ? ` · meat WHD: ${a.whd_meat}` : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()
          )}

          {tab === "nutrition" && <NutritionTab crops={crops || []} />}

          {tab === "kb" && (
            kb == null ? <EmptyCard>Loading…</EmptyCard> : (() => {
              const rows = kb.filter((a) => !q || `${a.title} ${a.category || ""}`.toLowerCase().includes(q));
              return rows.length === 0
                ? <EmptyCard>No knowledge-base articles published yet — validated articles appear here as they're added.</EmptyCard>
                : (
                  <div className="lib-card-grid">
                    {rows.map((a) => (
                      <div className="lib-card" key={a.kb_entry_id || a.article_id || a.title}>
                        <div className="lib-card-h">{a.title}<SysBadge /></div>
                        <div className="lib-card-meta">{a.category || "—"}</div>
                      </div>
                    ))}
                  </div>
                );
            })()
          )}

          {/* Footer note */}
          <div className="lib-foot">
            <Shield size={11} />System libraries are updated centrally by Teivaka as regulations and best-practice evolve. To suggest an addition or correction, use the Request library update button above. Your own entries are private to your farm.
          </div>
        </div>
      </main>

      {detail && <RowDetail detail={detail} onClose={() => setDetail(null)} />}
      {reqOpen && <RequestUpdate prefill={reqPrefill} onClose={() => { setReqOpen(false); setReqPrefill(null); }} />}
      {lessonOpen && <LibraryLesson onClose={() => setLessonOpen(false)} onOpenCrops={() => { setLessonOpen(false); setTab("crops"); }} />}
    </TfpShell>
  );
}

/* ---- row detail overlay (prototype openLibraryRow) ---- */
function RowDetail({ detail, onClose }) {
  const { kind } = detail;
  const a = detail.row.attributes || detail.row;
  const id = detail.row.ref_id || detail.row.chemical_id;
  const Tile = ({ label, val }) => (val == null || val === "" ? null : <div><span>{label}</span><strong>{val}</strong></div>);
  const Field = ({ label, val }) => (!val ? null : <div className="row-detail-section"><div className="row-detail-l">{label}</div><div>{val}</div></div>);

  let title, grid, fields;
  if (kind === "crop") {
    title = <>{detail.row.name}{a.local ? ` · ${a.local}` : ""}<SysBadge /></>;
    grid = <><Tile label="Category" val={a.cat} /><Tile label="Family" val={a.family} /><Tile label="Lifecycle" val={a.lifecycle} /><Tile label="Unit" val={a.unit} /><Tile label="Best months" val={a.best} /><Tile label="Cycle days" val={a.cycledays} /><Tile label="Tier" val={a.tier} /><Tile label="Demand" val={a.demand} /></>;
    fields = <>{a.yieldAvg ? <Field label="Yield (Low / Avg / High)" val={`${a.yieldLow || "-"} / ${a.yieldAvg} / ${a.yieldHigh || "-"}${a.yieldUnit ? " " + a.yieldUnit : ""}`} /> : null}<Field label="Varieties" val={a.varieties} /><Field label="System role" val={a.role} /><Field label="Price (fresh, FJD)" val={a.price} /><Field label="Risk level" val={a.risk} /><Field label="Notes" val={a.notes} /></>;
  } else if (kind === "chem") {
    title = <>{detail.row.chem_name}<SysBadge /></>;
    grid = <><Tile label="Active ingredient" val={detail.row.active_ingredient} /><Tile label="WHD (days)" val={detail.row.withholding_period_days} /><Tile label="Unit" val={detail.row.default_unit} /></>;
    fields = <Field label="Registered crops" val={Array.isArray(detail.row.registered_crops) ? detail.row.registered_crops.join(", ") : null} />;
  } else if (kind === "pest") {
    title = <>{detail.row.name}<SysBadge /></>;
    grid = <><Tile label="Scientific" val={a.sci ? <em>{a.sci}</em> : null} /><Tile label="Damage type" val={a.damage} /><Tile label="Severity" val={a.severity} /><Tile label="Seasonal risk" val={a.season} /></>;
    fields = <><Field label="Primary symptoms" val={a.symptoms} /><Field label="Affects crops" val={a.affects} /><Field label="Crop families" val={a.families} /><Field label="Control method" val={a.control} /></>;
  } else if (kind === "dis") {
    title = <>{detail.row.name}<SysBadge /></>;
    grid = <><Tile label="Type" val={a.type} /><Tile label="Pathogen" val={a.pathogen} /><Tile label="Severity" val={a.severity} /></>;
    fields = <><Field label="Primary symptoms" val={a.symptoms} /><Field label="Favourable conditions" val={a.conditions} /><Field label="Affects crops" val={a.affects} /><Field label="Crop families" val={a.families} /><Field label="Control method" val={a.control} /></>;
  } else if (kind === "fert") {
    title = <>{detail.row.name}<SysBadge /></>;
    grid = <><Tile label="Category" val={a.cat} /><Tile label="Brand" val={a.brand} /><Tile label="NPK" val={a.npk} /><Tile label="Pack" val={a.pack} /><Tile label="Price (FJD)" val={a.price} /><Tile label="Price status" val={a.status} /></>;
    fields = <><Field label="Additional nutrients" val={a.addnut} /><Field label="Application method" val={a.apprate} /><Field label="Dosage guide" val={a.dosage} /><Field label="Compatible crops" val={a.crops} /><Field label="Safety notes" val={a.safety} /><Field label="Notes" val={a.notes} /></>;
  } else if (kind === "livdis") {
    const notif = (a.notifiable || "").toString().toLowerCase().includes("notifiable");
    title = <>{detail.row.name}<SysBadge />{notif ? <span className="lib-notif">NOTIFIABLE</span> : null}</>;
    grid = <><Tile label="Pathogen" val={a.pathogen} /><Tile label="Type" val={a.type} /><Tile label="Severity" val={a.severity} /><Tile label="Notifiable" val={a.notifiable} /></>;
    fields = <><Field label="Species affected" val={a.species} /><Field label="Symptoms" val={a.symptoms} /><Field label="Transmission" val={a.transmission} /><Field label="Prevention" val={a.prevention} /><Field label="Treatment" val={a.treatment} /><Field label="Economic impact" val={a.economic} /></>;
  } else { // vet
    const rx = (a.rx || "").toString().toLowerCase().includes("yes") || (a.rx || "").toString().toLowerCase().includes("prescript");
    title = <>{detail.row.name}<SysBadge />{rx ? <span className="lib-rx">Rx required</span> : null}</>;
    grid = <><Tile label="Active ingredient" val={a.ai} /><Tile label="Category" val={a.cat} /><Tile label="Sub-category" val={a.subcat} /><Tile label="Route" val={a.route} /><Tile label="WHD meat" val={a.whd_meat} /><Tile label="WHD milk" val={a.whd_milk} /><Tile label="Pack" val={a.pack} /><Tile label="Price (FJD)" val={a.price} /></>;
    fields = <><Field label="Target species" val={a.species} /><Field label="Indication" val={a.indication} /><Field label="Dosage" val={a.dosage} /><Field label="Supplier (Fiji)" val={a.supplier} /></>;
  }

  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Library row</h2><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          <div className="row-detail-h">{title}</div>
          <div className="row-detail-grid">{grid}</div>
          {fields}
          <div className="lib-prov"><Shield size={11} />Source: agronomist-reviewed · system library</div>
          <div className="row-detail-foot"><strong>Row ID:</strong> {id} · system library</div>
        </div>
        <div className="overlay-foot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/* ---- "How to use the Farm Library" lesson (prototype openLibraryLesson) ---- */
function LibraryLesson({ onClose, onOpenCrops }) {
  const STEPS = [
    ["The System Library is curated.", "Teivaka agronomists review every chemical, pest, disease, variety, and fertilizer entry. Each row has a version, a source, and a last-reviewed date. That is what makes it trustworthy."],
    ["My Library is yours.", "Custom varieties you trial, sightings you log, notes you keep — these live in My Library, private to your farm, fully yours to edit."],
    ["You cannot edit System rows — and that is the point.", "If every farmer could change the chemical library, the withholding periods would no longer be trustworthy, and the compliance gate would fail. Curation is the moat."],
    ["Citations make it auditable.", "When TIS answers a chemical or pest question, it cites the library row by ID (CHEM-003, PEST-001). Tap the citation to see the source. No black-box answers."],
    ["Found something wrong or missing?", "Use the Request library update button on the Library page. Teivaka reviews every signal from farmers. You contribute signal; the library stays curated."],
  ];
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>How to use the Farm Library</h2><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.65, marginBottom: 14 }}>
            A short lesson on how the Farm Library is built, why it is trustworthy, and how you can contribute to it without breaking it.
          </div>
          {STEPS.map(([h, b], i) => (
            <div className="lib-lesson-step" key={i}>
              <span className="lib-lesson-n">{i + 1}</span>
              <div><strong>{h}</strong> {b}</div>
            </div>
          ))}
          <div className="lib-lesson-cta"><button className="btn btn-primary" onClick={onOpenCrops}><BookOpen size={13} />Open the Library now</button></div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/* ---- Request library update (prototype openLibRequestUpdate → real endpoint) ---- */
function RequestUpdate({ onClose, prefill }) {
  const KINDS = ["New chemical", "Chemical correction (WHD, dosage)", "New pest sighting in Fiji", "Disease symptom or treatment correction", "New variety", "Other"];
  const [kind, setKind] = useState(prefill?.kind || KINDS[0]);
  const [details, setDetails] = useState(prefill?.details || "");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!details.trim()) { setErr("Tell us what should be added or corrected."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/v1/library/request-update", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ kind, details: details.trim(), source: source.trim() }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setDone(true);
    } catch {
      setErr("Couldn't submit right now — check your connection and try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Request library update</h2><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          {done ? (
            <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}>
              Thank you — Teivaka will review your update. Farmers contribute signal; the library stays curated.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6, marginBottom: 14 }}>
                Tell Teivaka what should be added, changed, or corrected in the system library. Your suggestion goes into a review queue — farmers contribute signal; the library stays curated.
              </div>
              <div className="form-row"><label>What kind?</label>
                <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </div>
              <div className="form-row"><label>Details</label>
                <textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)}
                  placeholder="e.g. Karate Zeon WHD on eggplant is 7 days per the label, not 5 as listed" />
              </div>
              <div className="form-row"><label>Source (optional)</label>
                <input type="text" value={source} onChange={(e) => setSource(e.target.value)}
                  placeholder="Product label, ministry guideline, agronomist name..." />
              </div>
              {err && <div style={{ color: "var(--red, #B00020)", fontSize: 12.5 }}>{err}</div>}
            </>
          )}
        </div>
        <div className="overlay-foot">
          {done ? <button className="btn btn-primary" onClick={onClose}>Close</button> : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Nutrition (cited NPK — kept as an extra tab; honest 404 per crop) ---- */
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
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 2px 12px" }}>Cited N-P-K guidance per growth stage (FJI) — sourced, with a verification status. Only crops with extension-reviewed data appear.</div>
      <div className="form-row" style={{ maxWidth: 360 }}>
        <select value={crop} onChange={(e) => setCrop(e.target.value)}>
          <option value="">Select a crop…</option>
          {crops.map((c) => <option key={c.ref_id} value={c.ref_id}>{c.name}</option>)}
        </select>
      </div>
      {!crop ? null
        : err ? <EmptyCard>{err}</EmptyCard>
        : stages == null ? <EmptyCard>Loading…</EmptyCard>
        : stages.length === 0 ? <EmptyCard>No stages found.</EmptyCard>
        : (
          <div className="lib-card-grid">
            {stages.map((s, i) => (
              <div className="lib-card" key={i} style={{ cursor: "default" }}>
                <div className="lib-card-h">{s.stage}{s.stage_window_text ? ` · ${s.stage_window_text}` : ""}{s.verification_status ? <span className="lib-badge lib-badge-sys">{s.verification_status}</span> : null}</div>
                <div className="lib-card-body">N {s.n_g_per_plant ?? "—"} · P {s.p_g_per_plant ?? "—"} · K {s.k_g_per_plant ?? "—"} g/plant{s.application_method ? ` · ${s.application_method}` : ""}</div>
                {s.source_citation ? <div className="lib-card-id">Source: {s.source_citation}</div> : null}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

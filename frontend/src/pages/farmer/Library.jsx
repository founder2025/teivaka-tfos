/**
 * Library.jsx — /farm/library — the Farm Library (prototype producerLibrary, pixel-exact).
 *
 * System-curated reference corpora wired to real backend data, honest-empty / honest-error.
 *   Crops/Pests/Diseases/Fertilizers/Livestock/Vet → GET /reference-library?category=…
 *   Chemicals → GET /chemicals (the REAL WHD-enforcing shared.chemical_library, Inviolable #2)
 *   Nutrition → GET /agronomy/nutrition/crops (picker) + /{crop_key}/stages (cited NPK, Inviolable #1)
 *   Knowledge → GET /kb (+ GET /kb/{id} for the article body)
 *   "Request library update" → POST /library/request-update (kb_article_candidates, Inviolable #7)
 *
 * Redesign (audit-approved 2026-06-27):
 *  LB1  real per-tab error states (react-query) — a failed load no longer reads as "none match"
 *  LB2  Nutrition picker fed by /agronomy/nutrition/crops → passes the real crop_key (not ref_id),
 *       so it resolves instead of 404-ing for every crop
 *  LB3  KB articles are now readable (GET /kb/{id})
 *  LB4  corpora are react-query (cached + deduped) and lazy per active tab (no 9-request eager load)
 *  +    Chemicals now FILTERABLE (WHD bands) + honours "what affects my crops" (registered_crops);
 *       cross-search spans livestock/vet + KB; getJSON writes (token refresh); a11y cards + modals
 *       (role/keyboard/Esc); ?tab= URL state (citation landing); modal titled by the row.
 *  Honest: the tables carry no per-row version/date, so the lesson no longer promises one.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Search, MessageSquare, Shield, Check, Plus, ChevronDown, BookOpen, AlertTriangle, RefreshCw, X,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { getJSON, send } from "../../utils/api";

/* ---- prototype bucketing helpers (verbatim logic) ---- */
function cropLifecycle(a) { const lc = (a.lifecycle || "").toLowerCase(); if (lc.includes("annual")) return "annual"; if (lc.includes("perennial")) return "perennial"; return "other"; }
function cropCategory(a) { const c = (a.cat || "").toLowerCase(); if (["livestock", "poultry", "apiculture", "aquaculture"].includes(c)) return "livestock"; if (c === "crop" || c === "cash crop" || c === "vegetable") return "crop"; if (c === "fruit") return "fruit"; if (c === "forestry") return "forestry"; return "other"; }
function diseaseBucket(t) { const s = (t || "").toLowerCase(); if (s.includes("fungal") || s.includes("oomycete")) return "fungal"; if (s.includes("bacterial")) return "bacterial"; if (s.includes("viral") || s.includes("virus")) return "viral"; return "other"; }
function fertBucket(a) { const cat = (a.cat || "").toLowerCase(); const name = (a.name || "").toLowerCase(); if (cat.includes("foliar")) return "foliar"; if (cat.includes("organic") || name.includes("manure") || name.includes("compost")) return "organic"; if (cat.includes("nitrogen") || name.includes("urea")) return "nitrogen"; if (cat.includes("compound") || /^npk/i.test(a.npk || "")) return "compound"; if (cat.includes("soil") || cat.includes("amendment") || cat.includes("media")) return "soil"; return "other"; }
function livSpecies(s) { const t = (s || "").toLowerCase(); if (t.includes("cattle") && !t.includes("goat") && !t.includes("sheep") && !t.includes("pig")) return "cattle"; if (t.includes("goat") || t.includes("sheep")) return "goatsheep"; if (t.includes("pig")) return "pig"; if (t.includes("chicken") || t.includes("poultry") || t.includes("duck") || t.includes("layer")) return "poultry"; if (t.includes("bee")) return "bees"; if (t.includes("tilapia") || t.includes("prawn") || t.includes("fish") || t.includes("shrimp")) return "aqua"; if (t.includes("cattle")) return "cattle"; return "other"; }
function whdBand(d) { if (d == null) return "whdnone"; if (d <= 7) return "whd07"; if (d <= 14) return "whd814"; return "whd15"; }
function sevClass(s) { return s === "Critical" ? "sev-crit" : s === "High" ? "sev-high" : s === "Medium" ? "sev-mid" : "sev-low"; }
function clip(v, n) { const s = (v ?? "").toString(); return s.length > n ? s.slice(0, n) + "…" : s; }
function useEsc(onClose) { useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]); }

const SysBadge = () => <span className="lib-badge lib-badge-sys"><Check size={10} />verified · agronomist-reviewed</span>;

/* ---- query helpers ---- */
const refCat = (cat) => getJSON(`/api/v1/reference-library?category=${cat}`).then((r) => r.data || []);

/* ---- shared state-aware tab body ---- */
function TabBody({ q, emptyText = "Nothing here yet.", children }) {
  if (q.isError) return <ErrorCard onRetry={() => q.refetch()} />;
  if (q.isLoading && !q.data) return <SkeletonGrid />;
  const rows = q.data || [];
  return children(rows, emptyText);
}
function ErrorCard({ onRetry }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertTriangle size={17} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 700, color: "var(--soil)" }}>Couldn't load this library</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>This is a loading problem, not missing data. Try again.</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onRetry}><RefreshCw size={13} aria-hidden />Retry</button>
        </div>
      </div>
    </div>
  );
}
function SkeletonGrid() {
  return <div className="lib-card-grid" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="lib-card" style={{ height: 96, background: "var(--paper)" }} />)}</div>;
}
function EmptyCard({ children }) { return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>{children}</div>; }

/* ---- pagination (prototype libPagedRender) ---- */
function Paged({ rows, tab, bypass, showAll, setShowAll, renderOne }) {
  const total = rows.length;
  const open = showAll[tab] || bypass;
  const visible = open ? rows : rows.slice(0, 30);
  return (
    <>
      <div className="lib-card-grid">{visible.map(renderOne)}</div>
      {!bypass && total > 30 && (
        <div className="lib-page-foot">
          {showAll[tab]
            ? <><button className="btn btn-secondary" onClick={() => setShowAll((s) => ({ ...s, [tab]: false }))}>Show fewer</button><span className="lib-page-count">Showing all {total} rows</span></>
            : <><button className="btn btn-secondary" onClick={() => setShowAll((s) => ({ ...s, [tab]: true }))}>Show all {total} <ChevronDown size={12} /></button><span className="lib-page-count">Showing 30 of {total}</span></>}
        </div>
      )}
    </>
  );
}
function FilterPills({ tab, options, active, setActive }) {
  return (
    <div className="lib-filter-pills" role="group" aria-label="Filters">
      <button className={`lib-fp ${active == null ? "active" : ""}`} aria-pressed={active == null} onClick={() => setActive(tab, null)}>All</button>
      {options.map((o) => (
        <button key={o.id} className={`lib-fp ${active === o.id ? "active" : ""}`} aria-pressed={active === o.id} onClick={() => setActive(tab, o.id)}>
          {o.label}<span className="lib-fp-c">{o.count}</span>
        </button>
      ))}
    </div>
  );
}
/* keyboard-operable card */
function LibCard({ onOpen, children }) {
  return <div className="lib-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>{children}</div>;
}

function LibraryInner() {
  const [sp, setSp] = useSearchParams();
  const VALID = ["crops", "chemicals", "pests", "diseases", "fertilizers", "livestock", "nutrition", "kb"];
  const tab = VALID.includes(sp.get("tab")) ? sp.get("tab") : "crops";
  const setTab = (t) => { const n = new URLSearchParams(sp); n.set("tab", t); setSp(n, { replace: true }); };

  const [search, setSearch] = useState(sp.get("q") || "");
  const [affectsMine, setAffectsMine] = useState(false);
  const [hideVet, setHideVet] = useState(false);
  const [activeFilter, setActiveFilterState] = useState({});
  const [showAll, setShowAll] = useState({});
  const [detail, setDetail] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPrefill, setReqPrefill] = useState(null);
  const [lessonOpen, setLessonOpen] = useState(false);
  const setActive = (t, id) => setActiveFilterState((s) => ({ ...s, [t]: id }));

  const q = search.trim().toLowerCase();
  const searching = q.length >= 2;

  // ── lazy, cached corpora (react-query): the active tab + (when searching) all search corpora ──
  const opt = (key, on, fn) => useQuery({ queryKey: ["lib", key], enabled: on, staleTime: 5 * 60_000, retry: 1, queryFn: fn });
  const cropsQ = opt("crops", tab === "crops" || searching, () => refCat("CROP"));
  const chemsQ = opt("chems", tab === "chemicals" || searching, () => getJSON("/api/v1/chemicals").then((r) => r.data || []));
  const pestsQ = opt("pests", tab === "pests" || searching, () => refCat("PEST"));
  const disQ = opt("dis", tab === "diseases" || searching, () => refCat("DISEASE"));
  const fertQ = opt("fert", tab === "fertilizers" || searching, () => refCat("FERTILIZER"));
  const livdisQ = opt("livdis", tab === "livestock" || searching, () => refCat("LIVESTOCK_DISEASE"));
  const vetQ = opt("vet", tab === "livestock" || searching, () => refCat("VET"));
  const kbQ = opt("kb", tab === "kb" || searching, () => getJSON("/api/v1/kb").then((r) => r.data || []));
  const cyclesQ = opt("cycles", affectsMine, () => getJSON("/api/v1/cycles").then((r) => r.data?.cycles || r.data || []));

  // crops the farmer actually grows — names (text match) + production_id codes (registered_crops match)
  const { myNames, myIds } = useMemo(() => {
    const names = new Set(), ids = new Set();
    (cyclesQ.data || []).forEach((c) => {
      const n = (c.crop_name || c.production_name || "").toLowerCase(); if (n) names.add(n);
      const id = (c.production_id || "").toUpperCase(); if (id) ids.add(id);
    });
    return { myNames: [...names], myIds: ids };
  }, [cyclesQ.data]);

  const affectsMyText = (a) => { if (!affectsMine || myNames.length === 0) return true; const hay = `${a.affects || ""} ${a.crops || ""} ${a.families || ""}`.toLowerCase(); return hay.trim() ? myNames.some((n) => hay.includes(n)) : false; };
  const searchRow = (name, a) => !q || `${name} ${JSON.stringify(a || {})}`.toLowerCase().includes(q);

  // cross-library search across ALL corpora (LB6 — now incl. livestock/vet + KB)
  const searchHits = useMemo(() => {
    if (!searching) return null;
    const pick = (rows, kind) => (rows || []).filter((r) => `${r.name || ""} ${JSON.stringify(r.attributes || {})}`.toLowerCase().includes(q)).map((r) => ({ id: r.ref_id, label: r.name, kind, row: r }));
    const groups = {
      crops: pick(cropsQ.data, "crop"),
      chemicals: (chemsQ.data || []).filter((c) => `${c.chem_name} ${c.active_ingredient || ""} ${c.chemical_id}`.toLowerCase().includes(q)).map((c) => ({ id: c.chemical_id, label: c.chem_name, kind: "chem", row: c })),
      pests: pick(pestsQ.data, "pest"),
      diseases: pick(disQ.data, "dis"),
      fertilizers: pick(fertQ.data, "fert"),
      livestock: [...pick(livdisQ.data, "livdis"), ...pick(vetQ.data, "vet")],
      knowledge: (kbQ.data || []).filter((a) => `${a.title} ${a.category || ""}`.toLowerCase().includes(q)).map((a) => ({ id: a.kb_entry_id || a.title, label: a.title, kind: "kb", row: a })),
    };
    return { groups, total: Object.values(groups).reduce((n, g) => n + g.length, 0) };
  }, [q, searching, cropsQ.data, chemsQ.data, pestsQ.data, disQ.data, fertQ.data, livdisQ.data, vetQ.data, kbQ.data]);

  const openRow = (kind, row) => setDetail({ kind, row });
  const openRequest = (prefill) => { setReqPrefill(prefill || null); setReqOpen(true); };

  useEffect(() => { try { if (!localStorage.getItem("tfos_lib_lesson_seen")) setLessonOpen(true); } catch { /* private mode */ } }, []);
  // sync search to ?q (shareable / citation landing)
  useEffect(() => { const n = new URLSearchParams(sp); if (search.trim()) n.set("q", search.trim()); else n.delete("q"); setSp(n, { replace: true }); /* eslint-disable-next-line */ }, [search]);

  const tabs = [
    ["crops", "Crops & Varieties", cropsQ.data?.length],
    ["chemicals", "Chemicals", chemsQ.data?.length],
    ["pests", "Pests", pestsQ.data?.length],
    ["diseases", "Diseases", disQ.data?.length],
    ["fertilizers", "Fertilizers", fertQ.data?.length],
  ];
  if (!hideVet) tabs.push(["livestock", "Livestock & Vet", (livdisQ.data?.length || 0) + (vetQ.data?.length || 0) || null]);
  tabs.push(["nutrition", "Nutrition", null]);
  tabs.push(["kb", "Knowledge base", kbQ.data?.length]);
  const af = activeFilter[tab] ?? null;
  const bypass = affectsMine || af != null;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Library</h1><div className="subtitle">Knowledge for your farm · crops, chemicals, pests, diseases, fertilizers, livestock</div></div>
            <div className="page-actions">
              <button className="btn btn-secondary" onClick={() => setLessonOpen(true)}><BookOpen size={13} aria-hidden />How to use</button>
              <button className="btn btn-secondary" onClick={() => openRequest(null)}><MessageSquare size={13} aria-hidden />Request library update</button>
            </div>
          </div>

          <div className="lib-search-bar">
            <Search size={14} aria-hidden />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search all libraries"
              placeholder="Search all libraries — chemical, pest, disease, crop, fertilizer..." />
            <label className="lib-filter-toggle">
              <input type="checkbox" checked={affectsMine} onChange={(e) => setAffectsMine(e.target.checked)} />What affects my crops
            </label>
          </div>

          {searchHits && (
            searchHits.total === 0 ? (
              <div className="lib-search-empty">
                No results for "{search}". If it should be in the library, tell Teivaka — your search becomes signal the agronomists review.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => openRequest({ kind: "Other", details: `Searched for "${search.trim()}" — not found in the library.` })}>
                    <Plus size={12} aria-hidden />Request "{clip(search.trim(), 40)}" for the library
                  </button>
                </div>
              </div>
            ) : (
              <div className="lib-search-results">
                <div className="lib-search-h">{searchHits.total} results across libraries</div>
                {["crops", "chemicals", "pests", "diseases", "fertilizers", "livestock", "knowledge"].map((g) => (
                  searchHits.groups[g].length === 0 ? null : (
                    <div className="lib-search-group" key={g}>
                      <div className="lib-search-group-h">{g} · {searchHits.groups[g].length}</div>
                      {searchHits.groups[g].slice(0, 5).map((h) => (
                        <button className="lib-search-hit" key={h.id} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} onClick={() => { setSearch(""); openRow(h.kind, h.row); }}>
                          <strong>{h.label}</strong> <span>{h.id}</span>
                        </button>
                      ))}
                    </div>
                  )
                ))}
              </div>
            )
          )}

          <div className="lib-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t[0]} role="tab" aria-selected={tab === t[0]} className={`lib-tab ${tab === t[0] ? "active" : ""}`} onClick={() => setTab(t[0])}>
                {t[1]}{t[2] != null && <span className="lib-tab-count">{t[2]}</span>}
              </button>
            ))}
          </div>

          <div className="lib-settings">
            <label><input type="checkbox" checked={hideVet} onChange={(e) => { setHideVet(e.target.checked); if (e.target.checked && tab === "livestock") setTab("crops"); }} />Hide Livestock & Vet (crop-only farm)</label>
          </div>

          {/* CROPS */}
          {tab === "crops" && (
            <TabBody q={cropsQ}>{(crops) => {
              let rows = crops.filter((r) => searchRow(r.name, r.attributes));
              if (af === "annual" || af === "perennial") rows = rows.filter((r) => cropLifecycle(r.attributes || {}) === af);
              if (af === "livestock") rows = rows.filter((r) => cropCategory(r.attributes || {}) === "livestock");
              if (affectsMine) rows = rows.filter((r) => affectsMyText(r.attributes || {}));
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
                        <LibCard key={r.ref_id} onOpen={() => openRow("crop", r)}>
                          <div className="lib-card-h">{r.name}{a.local ? <> · <span className="lib-local">{a.local}</span></> : null}<SysBadge /></div>
                          <div className="lib-card-meta">{[a.family, a.lifecycle].filter(Boolean).join(" · ")}{a.best ? ` · best: ${a.best}` : ""}</div>
                          {a.varieties ? <div className="lib-card-body">Varieties: {clip(a.varieties, 90)}</div> : null}
                          <div className="lib-card-id">{r.ref_id}{a.tier ? ` · ${a.tier}` : ""}</div>
                        </LibCard>
                      );
                    }} />
                  )}
                </>
              );
            }}</TabBody>
          )}

          {/* CHEMICALS — now filterable + honours "what affects my crops" */}
          {tab === "chemicals" && (
            <TabBody q={chemsQ}>{(chems) => {
              let rows = chems.filter((c) => !q || `${c.chem_name} ${c.active_ingredient || ""} ${c.chemical_id}`.toLowerCase().includes(q));
              if (af) rows = rows.filter((c) => whdBand(c.withholding_period_days) === af);
              if (affectsMine && myIds.size) rows = rows.filter((c) => Array.isArray(c.registered_crops) && c.registered_crops.some((rc) => myIds.has((rc || "").toUpperCase())));
              const wc = (band) => chems.filter((c) => whdBand(c.withholding_period_days) === band).length;
              return (
                <>
                  <FilterPills tab="chemicals" active={af} setActive={setActive} options={[
                    { id: "whd07", label: "≤7d WHD", count: wc("whd07") },
                    { id: "whd814", label: "8–14d", count: wc("whd814") },
                    { id: "whd15", label: ">14d", count: wc("whd15") },
                    { id: "whdnone", label: "No WHD set", count: wc("whdnone") },
                  ]} />
                  {affectsMine && myIds.size === 0 && <div className="lib-card-id" style={{ margin: "2px 2px 8px" }}>Log a crop cycle to filter chemicals to your crops.</div>}
                  {rows.length === 0 ? <EmptyCard>No chemicals match.</EmptyCard> : (
                    <Paged rows={rows} tab="chemicals" bypass={bypass} showAll={showAll} setShowAll={setShowAll} renderOne={(c) => (
                      <LibCard key={c.chemical_id} onOpen={() => openRow("chem", c)}>
                        <div className="lib-card-h">{c.chem_name}<SysBadge /></div>
                        <div className="lib-card-meta">{c.withholding_period_days != null ? <strong>{c.withholding_period_days}d WHD</strong> : "WHD not set"}{c.active_ingredient ? ` · ${clip(c.active_ingredient, 60)}` : ""}</div>
                        <div className="lib-card-body">{Array.isArray(c.registered_crops) && c.registered_crops.length ? `Registered for ${c.registered_crops.length} crop${c.registered_crops.length === 1 ? "" : "s"}` : "—"}</div>
                        <div className="lib-card-id">{c.chemical_id}</div>
                      </LibCard>
                    )} />
                  )}
                </>
              );
            }}</TabBody>
          )}

          {/* PESTS */}
          {tab === "pests" && (
            <TabBody q={pestsQ}>{(pests) => {
              let rows = pests.filter((r) => searchRow(r.name, r.attributes));
              if (af) rows = rows.filter((r) => (r.attributes || {}).severity === af);
              if (affectsMine) rows = rows.filter((r) => affectsMyText(r.attributes || {}));
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
                        <LibCard key={r.ref_id} onOpen={() => openRow("pest", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta">{a.sci ? <em>{a.sci}</em> : null} · <span className={`lib-sev ${sevClass(a.severity)}`}>{a.severity || "-"}</span>{a.season ? ` · ${a.season}` : ""}</div>
                          <div className="lib-card-body">Damage: {a.damage || "-"} · affects {clip(a.affects || "-", 100)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </LibCard>
                      );
                    }} />
                  )}
                </>
              );
            }}</TabBody>
          )}

          {/* DISEASES */}
          {tab === "diseases" && (
            <TabBody q={disQ}>{(dis) => {
              let rows = dis.filter((r) => searchRow(r.name, r.attributes));
              if (af) rows = rows.filter((r) => diseaseBucket((r.attributes || {}).type) === af);
              if (affectsMine) rows = rows.filter((r) => affectsMyText(r.attributes || {}));
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
                        <LibCard key={r.ref_id} onOpen={() => openRow("dis", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta"><span className={`lib-type-chip ${tc}`}>{a.type || "-"}</span> · {clip(a.pathogen || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.symptoms || "-", 140)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </LibCard>
                      );
                    }} />
                  )}
                </>
              );
            }}</TabBody>
          )}

          {/* FERTILIZERS */}
          {tab === "fertilizers" && (
            <TabBody q={fertQ}>{(fert) => {
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
                        <LibCard key={r.ref_id} onOpen={() => openRow("fert", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge /></div>
                          <div className="lib-card-meta">{a.cat || "-"}{a.npk ? ` · NPK ${a.npk}` : ""}{a.pack ? ` · ${a.pack}` : ""}</div>
                          <div className="lib-card-body">{a.price ? `Price: ${clip(a.price, 60)}` : clip(a.dosage || "-", 100)}</div>
                          <div className="lib-card-id">{r.ref_id}{a.brand ? ` · ${a.brand}` : ""}</div>
                        </LibCard>
                      );
                    }} />
                  )}
                </>
              );
            }}</TabBody>
          )}

          {/* LIVESTOCK & VET */}
          {tab === "livestock" && (
            (livdisQ.isError || vetQ.isError) ? <ErrorCard onRetry={() => { livdisQ.refetch(); vetQ.refetch(); }} />
              : (livdisQ.isLoading && !livdisQ.data) || (vetQ.isLoading && !vetQ.data) ? <SkeletonGrid />
              : (() => {
                const livdis = livdisQ.data || [], vet = vetQ.data || [];
                let lr = livdis.filter((r) => searchRow(r.name, r.attributes));
                let vr = vet.filter((r) => searchRow(r.name, r.attributes));
                if (af) { lr = lr.filter((r) => livSpecies((r.attributes || {}).species) === af); vr = vr.filter((r) => livSpecies((r.attributes || {}).species) === af); }
                const lc = (sp2) => livdis.filter((r) => livSpecies((r.attributes || {}).species) === sp2).length + vet.filter((r) => livSpecies((r.attributes || {}).species) === sp2).length;
                return (
                  <>
                    <FilterPills tab="livestock" active={af} setActive={setActive} options={[
                      { id: "cattle", label: "Cattle", count: lc("cattle") }, { id: "goatsheep", label: "Goat/Sheep", count: lc("goatsheep") },
                      { id: "pig", label: "Pig", count: lc("pig") }, { id: "poultry", label: "Poultry", count: lc("poultry") },
                      { id: "bees", label: "Bees", count: lc("bees") }, { id: "aqua", label: "Aquaculture", count: lc("aqua") },
                    ]} />
                    <div className="lib-section-h">Livestock diseases <span className="lib-section-c">{lr.length}</span></div>
                    <div className="lib-card-grid">
                      {lr.map((r) => { const a = r.attributes || {}; const notif = (a.notifiable || "").toString().toLowerCase().includes("notifiable"); return (
                        <LibCard key={r.ref_id} onOpen={() => openRow("livdis", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge />{notif ? <span className="lib-notif">NOTIFIABLE</span> : null}</div>
                          <div className="lib-card-meta"><span className={`lib-sev ${sevClass(a.severity)}`}>{a.severity || "-"}</span> · {clip(a.species || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.symptoms || "-", 140)}</div>
                          <div className="lib-card-id">{r.ref_id}</div>
                        </LibCard>
                      ); })}
                    </div>
                    <div className="lib-section-h">Veterinary chemicals <span className="lib-section-c">{vr.length}</span></div>
                    <div className="lib-card-grid">
                      {vr.map((r) => { const a = r.attributes || {}; const rx = (a.rx || "").toString().toLowerCase().includes("yes") || (a.rx || "").toString().toLowerCase().includes("prescript"); return (
                        <LibCard key={r.ref_id} onOpen={() => openRow("vet", r)}>
                          <div className="lib-card-h">{r.name}<SysBadge />{rx ? <span className="lib-rx">Rx</span> : null}</div>
                          <div className="lib-card-meta">{a.cat || "-"} · {clip(a.species || "-", 60)}</div>
                          <div className="lib-card-body">{clip(a.indication || "-", 120)}</div>
                          <div className="lib-card-id">{r.ref_id}{a.whd_meat ? ` · meat WHD: ${a.whd_meat}` : ""}</div>
                        </LibCard>
                      ); })}
                    </div>
                  </>
                );
              })()
          )}

          {tab === "nutrition" && <NutritionTab />}

          {/* KNOWLEDGE BASE — now readable */}
          {tab === "kb" && (
            <TabBody q={kbQ}>{(kb) => {
              const rows = kb.filter((a) => !q || `${a.title} ${a.category || ""}`.toLowerCase().includes(q));
              return rows.length === 0
                ? <EmptyCard>No knowledge-base articles published yet — validated articles appear here as they're added.</EmptyCard>
                : (
                  <div className="lib-card-grid">
                    {rows.map((a) => (
                      <LibCard key={a.kb_entry_id || a.article_id || a.title} onOpen={() => openRow("kb", a)}>
                        <div className="lib-card-h">{a.title}<SysBadge /></div>
                        <div className="lib-card-meta">{a.category || "—"}</div>
                        <div className="lib-card-id">Tap to read</div>
                      </LibCard>
                    ))}
                  </div>
                );
            }}</TabBody>
          )}

          <div className="lib-foot">
            <Shield size={11} aria-hidden />System libraries are curated centrally by Teivaka as regulations and best-practice evolve. To suggest an addition or correction, use the Request library update button above.
          </div>
        </div>
      </main>

      {detail && (detail.kind === "kb"
        ? <KbDetail row={detail.row} onClose={() => setDetail(null)} />
        : <RowDetail detail={detail} onClose={() => setDetail(null)} />)}
      {reqOpen && <RequestUpdate prefill={reqPrefill} onClose={() => { setReqOpen(false); setReqPrefill(null); }} />}
      {lessonOpen && <LibraryLesson onClose={() => { setLessonOpen(false); try { localStorage.setItem("tfos_lib_lesson_seen", "1"); } catch { /* */ } }} onOpenCrops={() => { setLessonOpen(false); try { localStorage.setItem("tfos_lib_lesson_seen", "1"); } catch { /* */ } setTab("crops"); }} />}
    </TfpShell>
  );
}

/* ---- row detail overlay ---- */
function RowDetail({ detail, onClose }) {
  useEsc(onClose);
  const { kind } = detail;
  const a = detail.row.attributes || detail.row;
  const id = detail.row.ref_id || detail.row.chemical_id;
  const name = detail.row.name || detail.row.chem_name;
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
      <div className="overlay-modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label={name || "Library row"} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{name || "Library row"}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          <div className="row-detail-h">{title}</div>
          <div className="row-detail-grid">{grid}</div>
          {fields}
          <div className="lib-prov"><Shield size={11} aria-hidden />Source: agronomist-reviewed · system library</div>
          <div className="row-detail-foot"><strong>Row ID:</strong> {id} · system library</div>
        </div>
        <div className="overlay-foot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/* ---- KB article reader (LB3 — fetches the body) ---- */
function KbDetail({ row, onClose }) {
  useEsc(onClose);
  const id = row.kb_entry_id || row.article_id;
  const [art, setArt] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const b = await getJSON(`/api/v1/kb/${encodeURIComponent(id)}`); if (alive) setArt(b?.data || b); }
      catch (e) { if (alive) setErr(e?.userMessage || "Couldn't load this article."); }
    })();
    return () => { alive = false; };
  }, [id]);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label={row.title} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{row.title}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          <div className="lib-card-meta" style={{ marginBottom: 10 }}>{row.category || "Knowledge base"}<SysBadge /></div>
          {err ? <EmptyCard>{err}</EmptyCard>
            : !art ? <EmptyCard>Loading…</EmptyCard>
            : <div style={{ fontSize: 13.5, color: "var(--soil)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{art.content_md || art.content || "No content for this article yet."}</div>}
        </div>
        <div className="overlay-foot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/* ---- How to use (honest — no per-row date/version promise; no faked My Library) ---- */
function LibraryLesson({ onClose, onOpenCrops }) {
  useEsc(onClose);
  const STEPS = [
    ["The System Library is curated.", "Teivaka agronomists review every chemical, pest, disease, variety and fertilizer entry against the product label and ministry guidance. That review is what makes it trustworthy."],
    ["You can't edit System rows — and that is the point.", "If every farmer could change the chemical library, the withholding periods would no longer be trustworthy and the compliance gate would fail. Curation is the moat."],
    ["Citations make it auditable.", "When TIS answers a chemical or pest question, it cites the library row by ID (CHEM-003, PEST-001). No black-box answers — you can open the source row."],
    ["Found something wrong or missing?", "Use the Request library update button. Teivaka reviews every signal from farmers — you contribute signal, the library stays curated."],
  ];
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 680 }} role="dialog" aria-modal="true" aria-label="How to use the Farm Library" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>How to use the Farm Library</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.65, marginBottom: 14 }}>How the Farm Library is built, why it is trustworthy, and how you can contribute without breaking it.</div>
          {STEPS.map(([h, b], i) => (<div className="lib-lesson-step" key={i}><span className="lib-lesson-n">{i + 1}</span><div><strong>{h}</strong> {b}</div></div>))}
          <div className="lib-lesson-cta"><button className="btn btn-primary" onClick={onOpenCrops}><BookOpen size={13} aria-hidden />Open the Library now</button></div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/* ---- Request library update (getJSON/send — token refresh) ---- */
function RequestUpdate({ onClose, prefill }) {
  useEsc(onClose);
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
    try { await send("POST", "/api/v1/library/request-update", { kind, details: details.trim(), source: source.trim() }); setDone(true); }
    catch (e) { setErr(e?.userMessage || "Couldn't submit right now — check your connection and try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 600 }} role="dialog" aria-modal="true" aria-label="Request library update" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Request library update</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">
          {done ? (
            <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}>Thank you — Teivaka will review your update. Farmers contribute signal; the library stays curated.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6, marginBottom: 14 }}>Tell Teivaka what should be added, changed, or corrected. Your suggestion goes into a review queue — farmers contribute signal; the library stays curated.</div>
              <div className="form-row"><label>What kind?</label><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div className="form-row"><label>Details</label><textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Karate Zeon WHD on eggplant is 7 days per the label, not 5 as listed" /></div>
              <div className="form-row"><label>Source (optional)</label><input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Product label, ministry guideline, agronomist name..." /></div>
              {err && <div style={{ color: "var(--red, #B00020)", fontSize: 12.5 }}>{err}</div>}
            </>
          )}
        </div>
        <div className="overlay-foot">
          {done ? <button className="btn btn-primary" onClick={onClose}>Close</button>
            : <><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</button></>}
        </div>
      </div>
    </div>
  );
}

/* ---- Nutrition (LB2 fixed: picker keyed by real crop_key from /agronomy/nutrition/crops) ---- */
function NutritionTab() {
  const cropsQ = useQuery({ queryKey: ["lib", "nutrition-crops"], staleTime: 5 * 60_000, retry: 1, queryFn: () => getJSON("/api/v1/agronomy/nutrition/crops").then((r) => r.data || []) });
  const [crop, setCrop] = useState("");
  const stagesQ = useQuery({
    queryKey: ["lib", "nutrition-stages", crop], enabled: !!crop, retry: 1, staleTime: 5 * 60_000,
    queryFn: () => getJSON(`/api/v1/agronomy/nutrition/${encodeURIComponent(crop)}/stages?country=FJI`).then((b) => b?.data?.stages || b?.stages || b?.data || []),
  });

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 2px 12px" }}>Cited N-P-K guidance per growth stage (FJI) — sourced, with a verification status. Only crops with extension-reviewed data appear.</div>
      {cropsQ.isError ? <ErrorCard onRetry={() => cropsQ.refetch()} />
        : cropsQ.isLoading && !cropsQ.data ? <EmptyCard>Loading…</EmptyCard>
        : (cropsQ.data || []).length === 0 ? <EmptyCard>No extension-reviewed nutrition protocols are seeded yet — they appear here as agronomists add them.</EmptyCard>
        : (
          <>
            <div className="form-row" style={{ maxWidth: 360 }}>
              <select value={crop} onChange={(e) => setCrop(e.target.value)} aria-label="Select a crop">
                <option value="">Select a crop…</option>
                {(cropsQ.data || []).map((c) => <option key={c.crop_key} value={c.crop_key}>{c.crop_display_name}</option>)}
              </select>
            </div>
            {!crop ? null
              : stagesQ.isError ? <ErrorCard onRetry={() => stagesQ.refetch()} />
              : stagesQ.isLoading ? <EmptyCard>Loading…</EmptyCard>
              : (stagesQ.data || []).length === 0 ? <EmptyCard>No stages found for this crop.</EmptyCard>
              : (
                <div className="lib-card-grid">
                  {(stagesQ.data || []).map((s, i) => (
                    <div className="lib-card" key={i} style={{ cursor: "default" }}>
                      <div className="lib-card-h">{s.stage}{s.stage_window_text ? ` · ${s.stage_window_text}` : ""}{s.verification_status ? <span className="lib-badge lib-badge-sys">{s.verification_status}</span> : null}</div>
                      <div className="lib-card-body">N {s.n_g_per_plant ?? "—"} · P {s.p_g_per_plant ?? "—"} · K {s.k_g_per_plant ?? "—"} g/plant{s.application_method ? ` · ${s.application_method}` : ""}</div>
                      {s.source_citation ? <div className="lib-card-id">Source: {s.source_citation}</div> : null}
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5 * 60_000 } } });
export default function Library() {
  return (
    <QueryClientProvider client={queryClient}>
      <LibraryInner />
    </QueryClientProvider>
  );
}

/**
 * LocationsPage.jsx — /farm/locations (Resources › Locations tab) — audit-approved redesign (2026-06-26).
 *
 * Where everything happens — the satellite map (hero), zones, blocks, block detail with
 * cited rotation advice, enterprises, capacity calc and facilities.
 *
 * Live: GET /zones · /production-units (+ /status) · /financials/crops · /flocks · /farm-map/{id};
 * per-block /advice + /whats-due. Draw on the map → PUT /farm-map mints canonical zones/PUs.
 * Manual create → POST /production-units (no-draw on-ramp). All hash-chained. No fabricated geometry.
 *
 * Redesign (audit LOC1–LOC34):
 *  · reads via utils/api getJSON (token refresh + humanized errors, LOC3); write failures toast (LOC4)
 *  · removed printed farm UUID (LOC1 ×2) + retired ModeDropdown (LOC5) + emoji (LOC6) + redundant h1 (LOC9)
 *  · map is the hero, full-width (LOC29); secondary tools collapsed (LOC12)
 *  · land summary: total area · zones · blocks · unmapped (LOC33 partial)
 *  · manual Add-block modal — name + type + area, no drawing required (LOC16/LOC31)
 *  · animals show honest "Not mapped yet", not a fake "Livestock area" (LOC14)
 *  · page-level Ask AI (LOC10); shared <Modal> Esc/focus for add-block
 * FILED (backend / FarmMap): colour map by block status (LOC23), feature-level edits + orphan
 *  reconcile (LOC24), PostGIS spatial index (LOC30), area-by-3-Layer (LOC33 full), soil/water per
 *  block (LOC27/28), tenure/lease + verifiable GPS (LOC20/34), multi-parcel/subdivision (LOC25/26).
 */
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Plus, Search, Layers, Map as MapIcon, Sprout, Bird, Warehouse, Home,
  Fence, Bird as Poultry, Waves, Box, AlertTriangle, RefreshCw, Compass, Sparkles, X, ChevronDown, PenLine,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";

const FarmMap = lazy(() => import("./FarmMap"));
import CapacityCalc from "../../components/farm/CapacityCalc";

const AREA_UNITS = { acres: "acres", ha: "ha", m2: "m²" };
// Manual-create enterprise→pu_type map (mirrors backend ENTERPRISE_UNIT_KINDS).
const ENTERPRISE_KINDS = {
  CROPS: ["BED", "PLOT"], PERENNIALS: ["STAND", "PLOT"], LIVESTOCK: ["PADDOCK"],
  AQUACULTURE: ["POND", "TANK", "CAGE"], FORESTRY: ["WOODLOT", "STAND"],
  APICULTURE: ["HIVE_STAND"], SPECIALTY: ["GREENHOUSE", "NURSERY_TRAY", "FLOWER_BED"],
};
const ENT_LABEL = { CROPS: "Crops", PERENNIALS: "Tree/perennial", LIVESTOCK: "Livestock", AQUACULTURE: "Aquaculture", FORESTRY: "Forestry", APICULTURE: "Bees", SPECIALTY: "Protected/specialty" };
const useFarmMapFeatures = (id) => useQuery({ queryKey: ["loc-map", id], queryFn: () => getJSON(`/api/v1/farm-map/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useBlockStatus = (id) => useQuery({ queryKey: ["loc-status", id], queryFn: () => getJSON(`/api/v1/production-units/status?farm_id=${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });

// Block state machine → pill colour
const STATE_STYLE = {
  EMPTY:      { bg: "#EFEAE0", fg: "var(--muted)", label: "Empty" },
  PREPARING:  { bg: "#EFE6D6", fg: "var(--soil)", label: "Preparing" },
  ACTIVE:     { bg: "var(--green-tint)", fg: "var(--green-dk)", label: "Growing" },
  HARVESTING: { bg: "#FBF0D8", fg: "var(--amber)", label: "Harvesting" },
  RESTING:    { bg: "#E6EEF6", fg: "#2D6CDF", label: "Resting" },
  IDLE:       { bg: "#FBEAE7", fg: "var(--red)", label: "Idle" },
};

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", ink: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 transition";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const useZones = (id) => useQuery({ queryKey: ["loc-zones", id], queryFn: () => getJSON(`/api/v1/zones?farm_id=${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const usePUs = (id) => useQuery({ queryKey: ["loc-pus", id], queryFn: () => getJSON(`/api/v1/production-units?farm_id=${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useCrops = (id) => useQuery({ queryKey: ["loc-crops", id], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useFlocks = (id) => useQuery({ queryKey: ["loc-flocks", id], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(id)}&is_active=true`), enabled: !!id, retry: 0 });

// defensive field access (zones/PUs are SELECT * — column names vary)
const zName = (z) => z.zone_name || z.name || z.zone_id || "Zone";
const zArea = (z) => z.area_ha ?? z.area ?? z.size_ha ?? null;
const zVertical = (z) => z.vertical || z.zone_type || z.type || "";
const puCode = (p) => p.pu_name || p.pu_code || p.pu_id || "Block";
const puArea = (p) => p.area_ha ?? p.area ?? p.size_ha ?? (p.area_sqm != null ? Number(p.area_sqm) / 10000 : null); // incl. manual area_sqm
const fmtArea = (a) => (a == null ? "—" : `${Number(a).toFixed(2)} ha`);

// ── shared modal (Esc-close, role=dialog, focus-on-open) ───────────────
function Modal({ title, onClose, children, foot }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button className="overlay-close" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, style, onClick }) {
  return <div onClick={onClick} className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...(onClick ? { cursor: "pointer" } : {}), ...style }}>{children}</div>;
}
function ColHead({ children, extra }) {
  return <div className="flex items-center justify-between gap-2 mb-2"><h3 className="text-sm font-semibold" style={{ color: C.soil }}>{children}</h3>{extra}</div>;
}
function SummaryTile({ label, value, sub, accent }) {
  return <div className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border }}><div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div><div className="text-xl font-bold" style={{ color: accent || C.soil }}>{value}</div>{sub ? <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{sub}</div> : null}</div>;
}
function FacilityCard({ icon: Icon, title, value, sub, building, onAdd }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.soil }}><Icon size={15} style={{ color: C.greenDk }} />{title}</div>
        {value != null ? <span className="text-lg font-bold" style={{ color: C.greenDk }}>{value}</span> : building ? <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>building</span> : null}
      </div>
      <div className="text-[11px] mt-1" style={{ color: C.muted }}>{sub}</div>
      {onAdd && <button onClick={onAdd} className={`mt-2 text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><Plus size={11} />Draw</button>}
    </div>
  );
}
function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: C.muted }}>
      {["ACTIVE", "HARVESTING", "RESTING", "IDLE", "EMPTY"].map((k) => (
        <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_STYLE[k].bg, border: `1px solid ${STATE_STYLE[k].fg}` }} />{STATE_STYLE[k].label}</span>
      ))}
    </div>
  );
}

function LocationsInner() {
  const { farmId } = useCurrentFarm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const go = (sub) => navigate(`/farm/${sub}`);
  const askAi = () => navigate("/tis?q=" + encodeURIComponent("How can I make the best use of my farm's land, zones and block layout?"));
  const refreshSpatial = () => {
    ["loc-pus", "loc-zones", "loc-map", "loc-status"].forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] }));
    qc.invalidateQueries({ queryKey: ["loc-due"] }); qc.invalidateQueries({ queryKey: ["loc-advice"] });
  };

  const zones = useZones(farmId);
  const pus = usePUs(farmId);
  const crops = useCrops(farmId);
  const flocks = useFlocks(farmId);
  const mapFeat = useFarmMapFeatures(farmId);
  const blockStatus = useBlockStatus(farmId);
  const statusByPu = useMemo(() => Object.fromEntries((blockStatus.data?.data ?? []).map((s) => [s.pu_id, s])), [blockStatus.data]);

  const [zoneFilter, setZoneFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [calcUnit, setCalcUnit] = useState(() => localStorage.getItem("tfos_area_unit") || "acres");
  const [calcShape, setCalcShape] = useState("");
  const [openReq, setOpenReq] = useState(null);
  const [renameVal, setRenameVal] = useState(null);
  const [teachVal, setTeachVal] = useState(null);
  const [addBlock, setAddBlock] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  async function saveTeach() {
    const selPu = puRows.find((p) => p.pu_id === selected);
    if (!selPu || !teachVal?.trim()) { setTeachVal(null); return; }
    try {
      await send("POST", "/api/v1/tis-context/teach", { farm_id: farmId, pu_id: selPu.pu_id, kind: "NOTE", summary: `${selPu.pu_name}: ${teachVal.trim()}` });
      emitToast("TIS noted it");
    } catch (e) { emitToast(e?.userMessage || "Couldn't save"); }
    setTeachVal(null);
  }
  const openMap = (kind, facilityType) => setOpenReq({ kind, facilityType, nonce: Date.now() });
  useEffect(() => { setSelected(null); setZoneFilter(null); setRenameVal(null); setTeachVal(null); }, [farmId]);
  async function saveRename() {
    const selPu = puRows.find((p) => p.pu_id === selected);
    if (!selPu || !renameVal?.trim()) { setRenameVal(null); return; }
    try {
      await send("PATCH", `/api/v1/production-units/${encodeURIComponent(selPu.pu_id)}`, { pu_name: renameVal.trim() });
      refreshSpatial(); emitToast("Block renamed");
    } catch (e) { emitToast(e?.userMessage || "Couldn't rename"); }
    setRenameVal(null);
  }
  const advice = useQuery({ queryKey: ["loc-advice", selected], queryFn: () => getJSON(`/api/v1/production-units/${encodeURIComponent(selected)}/advice`), enabled: !!selected, retry: 0 });
  const whatsDue = useQuery({ queryKey: ["loc-due", selected], queryFn: () => getJSON(`/api/v1/production-units/${encodeURIComponent(selected)}/whats-due`), enabled: !!selected, retry: 0 });
  async function addRotationTask() {
    try {
      const d = await send("POST", `/api/v1/production-units/${encodeURIComponent(selected)}/rotation-task`);
      emitToast(d.existing ? "Rotation task already in your list" : "Rotation task added");
      qc.invalidateQueries({ queryKey: ["loc-due", selected] });
    } catch (e) { emitToast(e?.userMessage || "Couldn't add task"); }
  }

  const mapShapes = (mapFeat.data?.features ?? [])
    .map((f) => ({ id: f.properties?.feature_id, label: f.properties?.label || f.properties?.kind, kind: f.properties?.kind, area_ha: f.properties?.area_ha, ref_id: f.properties?.ref_id }))
    .filter((s) => (s.kind === "ZONE" || s.kind === "BLOCK"));
  const calcShapes = mapShapes.filter((s) => s.area_ha != null);
  const calcArea = calcShapes.find((s) => s.id === calcShape)?.area_ha ?? calcShapes[0]?.area_ha ?? null;
  const mappedBlockIds = useMemo(() => new Set(mapShapes.filter((s) => s.kind === "BLOCK" && s.ref_id).map((s) => s.ref_id)), [mapFeat.data]);

  const zoneRows = zones.data?.data ?? [];
  const puRows = pus.data?.data ?? [];
  const cropRows = crops.data?.data ?? [];
  const flockRows = flocks.data?.data?.items ?? [];
  const zoneById = useMemo(() => Object.fromEntries(zoneRows.map((z) => [z.zone_id, z])), [zoneRows]);
  const blocksInZone = (zid) => puRows.filter((p) => p.zone_id === zid).length;

  const totalAreaHa = puRows.reduce((s, p) => s + (puArea(p) || 0), 0);
  const unmapped = puRows.filter((p) => !mappedBlockIds.has(p.pu_id)).length;

  const loading = zones.isLoading || pus.isLoading;
  const allErr = zones.isError && pus.isError;

  let blocks = puRows;
  if (zoneFilter) blocks = blocks.filter((p) => p.zone_id === zoneFilter);
  const q = search.trim().toLowerCase();
  if (q) blocks = blocks.filter((p) => `${puCode(p)} ${p.production_name || ""}`.toLowerCase().includes(q));

  const sel = selected ? puRows.find((p) => p.pu_id === selected) : null;

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div className="subtitle">Where everything happens · zones, blocks, the farm map</div>
        <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <FarmSelector />
          <button onClick={askAi} className="btn btn-secondary"><Sparkles size={14} />Ask AI</button>
          <button onClick={() => setAddBlock(true)} className="btn btn-primary"><Plus size={14} />Add block</button>
          <button onClick={() => openMap("BLOCK")} className="btn btn-secondary"><PenLine size={14} />Draw on map</button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <Card key={i} style={{ padding: 16 }}><div className="rounded animate-pulse" style={{ height: 120, background: C.cream }} /></Card>)}</div>
      ) : allErr ? (
        <Card style={{ padding: 24 }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load locations</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>Reads from /zones and /production-units. Check your connection and try again.</div>
              <button onClick={() => { zones.refetch(); pus.refetch(); }} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* land summary (LOC33 partial) */}
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
            <SummaryTile label="Total area" value={totalAreaHa > 0 ? `${totalAreaHa.toFixed(2)} ha` : "—"} sub="mapped + entered" />
            <SummaryTile label="Zones" value={zoneRows.length} sub="sections" />
            <SummaryTile label="Blocks" value={puRows.length} sub="growing areas" />
            <SummaryTile label="Unmapped" value={unmapped} sub={unmapped ? "draw to geo-locate" : "all on the map"} accent={unmapped ? C.amber : C.greenDk} />
          </div>

          {/* map hero (LOC29) */}
          <Card style={{ padding: 14 }}>
            <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>draw · auto-area · GPS</span>}>Farm map</ColHead>
            <div className="rounded-xl border p-2 mb-2 text-xs flex flex-wrap items-center justify-between gap-2" style={{ background: C.greenTint, borderColor: C.border, color: C.greenDk }}>
              <span><strong>Draw your farm on the satellite map.</strong> Pick Zone, Block or Boundary, draw it, area auto-calculates. Prefer no map? Use <strong>Add block</strong> above.</span>
              <MapLegend />
            </div>
            {farmId ? (
              <Suspense fallback={<div className="rounded-xl flex items-center justify-center" style={{ background: C.paper, height: 520 }}><MapIcon size={26} style={{ color: C.muted }} /></div>}>
                <FarmMap farmId={farmId} openRequest={openReq} onSaved={refreshSpatial} />
              </Suspense>
            ) : (
              <div className="rounded-xl flex items-center justify-center text-sm" style={{ background: C.paper, height: 520, color: C.muted }}>Pick a farm to map.</div>
            )}
          </Card>

          {/* zones + blocks */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card style={{ padding: 14 }}>
              <ColHead extra={<button onClick={() => openMap("ZONE")} className={`text-[11px] flex items-center gap-1 ${FOCUS}`} style={{ color: C.greenDk }}><Plus size={11} />Draw zone</button>}>Farm zones</ColHead>
              {zoneRows.length === 0 ? <div className="text-sm" style={{ color: C.muted }}>No zones yet. Zones group your blocks (e.g. "East fields", "Livestock area").</div> : (
                <div className="space-y-1.5">
                  {zoneRows.map((z) => (
                    <div key={z.zone_id} role="button" tabIndex={0} onClick={() => setZoneFilter(zoneFilter === z.zone_id ? null : z.zone_id)} onKeyDown={(e) => { if (e.key === "Enter") setZoneFilter(zoneFilter === z.zone_id ? null : z.zone_id); }}
                      className={`flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer hover:brightness-95 ${FOCUS}`} style={{ background: zoneFilter === z.zone_id ? C.greenTint : C.paper, border: `1px solid ${zoneFilter === z.zone_id ? C.green : C.border}` }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: C.green }} />
                      <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate" style={{ color: C.soil }}>{zName(z)}</div><div className="text-[11px]" style={{ color: C.muted }}>{fmtArea(zArea(z))} · {blocksInZone(z.zone_id)} block{blocksInZone(z.zone_id) === 1 ? "" : "s"}{zVertical(z) ? ` · ${zVertical(z)}` : ""}</div></div>
                    </div>
                  ))}
                </div>
              )}
              {zoneFilter && <button onClick={() => setZoneFilter(null)} className={`mt-2 text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Clear zone filter</button>}
            </Card>

            <Card style={{ padding: 14, gridColumn: "span 2" }}>
              <ColHead extra={<button onClick={() => setAddBlock(true)} className={`text-[11px] flex items-center gap-1 ${FOCUS}`} style={{ color: C.greenDk }}><Plus size={11} />Add block</button>}>Block list {zoneFilter ? <span className="text-[11px] font-normal" style={{ color: C.muted }}>· {zName(zoneById[zoneFilter] || {})}</span> : null}</ColHead>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blocks…" aria-label="Search blocks" className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
              </div>
              {blocks.length === 0 ? <div className="text-sm" style={{ color: C.muted }}>No blocks{zoneFilter || q ? " match" : " yet — add one above"}.</div> : (
                <div className="grid gap-1 sm:grid-cols-2 max-h-[440px] overflow-y-auto">
                  {blocks.map((p) => {
                    const st = statusByPu[p.pu_id];
                    const sty = st ? (STATE_STYLE[st.state] || STATE_STYLE.EMPTY) : null;
                    return (
                      <div key={p.pu_id} role="button" tabIndex={0} onClick={() => setSelected(p.pu_id)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(p.pu_id); }}
                        className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer hover:bg-[var(--cream-2)] ${FOCUS}`} style={{ border: `1px solid ${selected === p.pu_id ? C.green : "transparent"}` }}>
                        <span className="text-xs font-semibold shrink-0" style={{ color: C.soil }}>{puCode(p)}</span>
                        <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: C.muted }}>{st?.crop || p.production_name || zName(zoneById[p.zone_id] || {})}</span>
                        {!mappedBlockIds.has(p.pu_id) && <span className="text-[9px] px-1 rounded shrink-0" title="Not drawn on the map" style={{ color: C.amber, border: `1px solid ${C.border}` }}>no map</span>}
                        {sty && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold" style={{ color: sty.fg, background: sty.bg }}>{st.label}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* block detail */}
          {sel && (
            <Card style={{ padding: 16 }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  {renameVal === null ? (
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold" style={{ color: C.soil }}>{puCode(sel)}</div>
                      {sel.pu_id && <button onClick={() => setRenameVal(sel.pu_name || "")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Rename</button>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenameVal(null); }}
                        className={`px-2 py-1 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
                      <button onClick={saveRename} className={`text-[11px] px-2 py-1 rounded-lg text-white ${FOCUS}`} style={{ background: C.greenDk }}>Save</button>
                      <button onClick={() => setRenameVal(null)} className={`text-[11px] ${FOCUS}`} style={{ color: C.muted }}>Cancel</button>
                    </div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: C.muted }}>{zName(zoneById[sel.zone_id] || {})}{sel.production_name ? ` · ${sel.production_name}` : ""}</div>
                </div>
                <button onClick={() => { setSelected(null); setRenameVal(null); }} className={`text-xs ${FOCUS}`} style={{ color: C.greenDk }}>Close</button>
              </div>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
                {[["Zone", zName(zoneById[sel.zone_id] || {})],
                  ["Crop", statusByPu[sel.pu_id]?.crop || statusByPu[sel.pu_id]?.last_crop || sel.production_name || "—"],
                  ["State", statusByPu[sel.pu_id]?.label || "—"],
                  ["Area", fmtArea(puArea(sel))]].map(([l, v]) => {
                  const isState = l === "State";
                  const sty = isState && statusByPu[sel.pu_id] ? (STATE_STYLE[statusByPu[sel.pu_id].state] || STATE_STYLE.EMPTY) : null;
                  return (
                    <div key={l} className="rounded-lg p-2" style={{ background: sty ? sty.bg : C.paper }}>
                      <div className="text-[9px] uppercase" style={{ color: C.muted }}>{l}</div>
                      <div className="text-sm font-semibold truncate" style={{ color: sty ? sty.fg : C.soil }}>{v}</div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const d = whatsDue.data;
                if (!d || (!d.harvest && d.tasks.length === 0)) return null;
                const h = d.harvest;
                const hSty = h && (h.state === "DUE" || h.state === "HARVESTING") ? STATE_STYLE.HARVESTING
                  : h && h.state === "SOON" ? STATE_STYLE.PREPARING : null;
                return (
                  <div className="mt-3 rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.border}` }}>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: C.soil }}>What's due now</div>
                    {h && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={hSty ? { background: hSty.bg, color: hSty.fg } : { background: C.cream, color: C.muted }}>
                          {h.state === "HARVESTING" ? `Harvesting ${h.crop || ""}`
                            : h.state === "DUE" ? `Harvest ready — ${h.crop || ""}`
                            : h.state === "SOON" ? `Harvest in ${h.days_until}d`
                            : `Harvest ~${h.target || "—"}`}
                          {h.estimate && h.state !== "HARVESTING" ? " (est.)" : ""}
                        </span>
                        {(h.state === "DUE" || h.state === "HARVESTING") && <button onClick={() => go("harvests")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Log harvest →</button>}
                      </div>
                    )}
                    {d.tasks.length === 0 ? (
                      <div className="text-[11px]" style={{ color: C.muted }}>No open tasks for this block.</div>
                    ) : (
                      <div className="space-y-1">
                        {d.tasks.slice(0, 6).map((t) => (
                          <div key={t.task_id} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.due ? C.red : C.muted }} />
                            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: C.soil }}>{t.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ color: t.due ? C.red : C.muted, border: `1px solid ${C.border}` }}>{t.due ? "due" : (t.due_date || "scheduled")}</span>
                          </div>
                        ))}
                        {d.tasks.length > 6 && <button onClick={() => go("tasks")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>+{d.tasks.length - 6} more in Tasks →</button>}
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const a = advice.data;
                if (!a || !["REST", "READY"].includes(a.rotation_status)) return null;
                const ready = a.rotation_status === "READY";
                return (
                  <div className="mt-3 rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.soil }}>Rotation & rest</div>
                      <button onClick={addRotationTask} className={`text-[11px] px-2.5 py-1 rounded-lg text-white font-semibold hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}>+ Add rotation task</button>
                    </div>
                    <div className="text-xs rounded-lg px-2.5 py-1.5 mb-2" style={{ background: ready ? STATE_STYLE.ACTIVE.bg : STATE_STYLE.IDLE.bg, color: ready ? STATE_STYLE.ACTIVE.fg : STATE_STYLE.IDLE.fg }}>
                      {ready
                        ? `Rest period met${a.last_family ? ` for ${a.last_family}` : ""} — ready to replant.`
                        : `Rest ${a.rest_remaining_days} more day${a.rest_remaining_days === 1 ? "" : "s"} before replanting ${a.last_family || "the same family"} (was ${a.last_crop || "—"}).`}
                    </div>
                    {a.disease_risk && <div className="text-[11px] mb-2" style={{ color: C.muted }}><strong>Why:</strong> {a.disease_risk}.</div>}
                    {a.avoid_next?.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] uppercase font-bold mb-1" style={{ color: STATE_STYLE.IDLE.fg }}>Avoid now</div>
                        <div className="flex flex-wrap gap-1">{a.avoid_next.slice(0, 6).map((c) => <span key={c.production_id} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: STATE_STYLE.IDLE.bg, color: STATE_STYLE.IDLE.fg }}>{c.production_name}</span>)}</div>
                      </div>
                    )}
                    {a.suggested_next?.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase font-bold mb-1" style={{ color: C.greenDk }}>Good to plant next</div>
                        <div className="flex flex-wrap gap-1">{a.suggested_next.slice(0, 6).map((c) => <span key={c.production_id} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: STATE_STYLE.ACTIVE.bg, color: STATE_STYLE.ACTIVE.fg }}>{c.production_name}</span>)}</div>
                      </div>
                    )}
                    <div className="text-[10px] mt-2" style={{ color: C.muted }}>Guidance from the crop-family rotation policies — not invented.</div>
                  </div>
                );
              })()}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button onClick={() => go("cycles")} className={`text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open production →</button>
                {teachVal === null ? (
                  <button onClick={() => setTeachVal("")} className={`text-xs px-3 py-1.5 rounded-lg hover:brightness-95 flex items-center gap-1 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}><Sparkles size={12} />Teach TIS</button>
                ) : (
                  <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                    <input autoFocus value={teachVal} onChange={(e) => setTeachVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveTeach(); if (e.key === "Escape") setTeachVal(null); }}
                      placeholder="Tell TIS about this block…"
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
                    <button onClick={saveTeach} className={`text-[11px] px-2.5 py-1.5 rounded-lg text-white ${FOCUS}`} style={{ background: C.greenDk }}>Save</button>
                    <button onClick={() => setTeachVal(null)} className={`text-[11px] ${FOCUS}`} style={{ color: C.muted }}>Cancel</button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* every enterprise and where it is */}
          <Card style={{ padding: 16 }}>
            <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>crops + animals · {cropRows.length + flockRows.length} businesses</span>}>Every enterprise — and where it is</ColHead>
            {(crops.isError || flocks.isError) && <div className="text-[11px] mb-2" style={{ color: C.amber }}>Some enterprises couldn't load — list may be incomplete.</div>}
            {cropRows.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide mt-1 mb-1" style={{ color: C.muted }}>Crops · on the map</div>}
            {cropRows.map((c) => {
              const pu = puRows.find((p) => p.production_name === c.production_name);
              return (
                <div key={c.production_id || c.production_name} className="flex items-center gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                  <Sprout size={13} style={{ color: C.green }} />
                  <span className="text-sm font-semibold" style={{ color: C.soil }}>{c.production_name}</span>
                  <span className="text-xs flex-1 min-w-0 truncate" style={{ color: C.muted }}>{pu ? `${puCode(pu)} · ${zName(zoneById[pu.zone_id] || {})}` : "Not on the map yet"}</span>
                  {pu ? <button onClick={() => setSelected(pu.pu_id)} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Find →</button> : <button onClick={() => go("enterprises")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Open →</button>}
                </div>
              );
            })}
            {flockRows.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: C.muted }}>Animals</div>}
            {flockRows.map((f, i) => (
              <div key={f.flock_id || i} className="flex items-center gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                <Bird size={13} style={{ color: C.amber }} />
                <span className="text-sm font-semibold" style={{ color: C.soil }}>{f.flock_label || f.flock_type}</span>
                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: C.muted }}>Not mapped yet</span>
                <button onClick={() => go("poultry")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Open →</button>
              </div>
            ))}
            {cropRows.length === 0 && flockRows.length === 0 && <div className="text-sm" style={{ color: C.muted }}>No enterprises yet — <button onClick={() => go("enterprises")} className={`font-semibold ${FOCUS}`} style={{ color: C.greenDk }}>add one</button> and it appears here with its location.</div>}
            <div className="text-[11px] mt-2" style={{ color: C.muted }}>Tap a crop to find its block. Animal paddock mapping turns on with the interactive map.</div>
          </Card>

          {/* more tools (collapsed — reduces cognitive load, LOC12) */}
          <button onClick={() => setMoreOpen((v) => !v)} className={`w-full rounded-2xl border p-3 flex items-center justify-between ${FOCUS}`} style={{ borderColor: C.border, background: C.paper, color: C.soil }}>
            <span className="text-sm font-semibold">More tools — capacity calculator, facilities, worker attendance</span>
            <ChevronDown size={16} style={{ transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          {moreOpen && (
            <>
              <Card style={{ padding: 16 }}>
                <ColHead extra={
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                    {Object.entries(AREA_UNITS).map(([k, lbl]) => (
                      <button key={k} onClick={() => { setCalcUnit(k); localStorage.setItem("tfos_area_unit", k); }} className="text-[11px] px-2 py-1 font-semibold"
                        style={calcUnit === k ? { background: "var(--ink)", color: "var(--paper)" } : { color: C.soil }}>{lbl}</button>
                    ))}
                  </div>
                }>Capacity calculator</ColHead>
                {calcShapes.length === 0 ? (
                  <div className="text-sm" style={{ color: C.muted }}>Draw or walk a zone/block on the map first — then pick it here to estimate how many plants or animals it can hold.</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-[11px] block mb-1" style={{ color: C.muted }}>Pick a zone or block</label>
                      <select value={calcShape || calcShapes[0]?.id || ""} onChange={(e) => setCalcShape(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }}>
                        {calcShapes.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.kind.toLowerCase()})</option>)}
                      </select>
                      <p className="text-[11px] mt-2" style={{ color: C.muted }}>Area comes straight from what you mapped. Enter your own spacing — TFOS only does the maths, it won't invent agronomy.</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: C.paper }}>
                      <CapacityCalc areaHa={calcArea} unit={calcUnit} compact />
                    </div>
                  </div>
                )}
              </Card>

              <Card style={{ padding: 16 }} onClick={() => go("labor")}>
                <ColHead extra={<span className="text-[11px]" style={{ color: C.greenDk }}>Open Labor →</span>}>Worker attendance</ColHead>
                <div className="text-sm" style={{ color: C.muted }}>Workers clock in/out from <strong>Labor → Today</strong>, geo-locked to the <strong>Boundary</strong> you draw here. Draw your farm boundary on the map to switch on the location check.</div>
              </Card>

              <Card style={{ padding: 16 }}>
                <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>every place work happens — fields, housing, water, storage</span>}>Facilities on this farm</ColHead>
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  <FacilityCard icon={Layers} title="Fields & blocks" value={puRows.length} sub="open-ground growing areas" onAdd={() => openMap("BLOCK")} />
                  <FacilityCard icon={MapPin} title="Zones" value={zoneRows.length} sub="sections that group blocks" onAdd={() => openMap("ZONE")} />
                  <FacilityCard icon={Home} title="Greenhouses & shade houses" building sub="protected growing structures" onAdd={() => openMap("FACILITY", "Greenhouse")} />
                  <FacilityCard icon={Warehouse} title="Barns & sheds" building sub="animal housing & general shelter" onAdd={() => openMap("FACILITY", "Barn / shed")} />
                  <FacilityCard icon={Fence} title="Paddocks" building sub="fenced grazing for livestock" onAdd={() => openMap("FACILITY", "Paddock")} />
                  <FacilityCard icon={Poultry} title="Poultry houses" building sub="layer & broiler housing" onAdd={() => openMap("FACILITY", "Poultry house")} />
                  <FacilityCard icon={Waves} title="Ponds, tanks & cages" building sub="aquaculture water bodies" onAdd={() => openMap("FACILITY", "Pond / tank")} />
                  <FacilityCard icon={Box} title="Storage & cold rooms" building sub="warehouse, sheds & cold storage" onAdd={() => openMap("FACILITY", "Storage / cold room")} />
                </div>
              </Card>

              <div className="rounded-2xl border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: C.paper, borderColor: C.border, borderStyle: "dashed" }}>
                <div className="flex items-start gap-2.5">
                  <Compass size={18} style={{ color: C.greenDk, marginTop: 1 }} />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.soil }}>Map, boundaries & GPS</div>
                    <div className="text-xs mt-0.5 max-w-xl" style={{ color: C.muted }}>Your drawn zones, blocks and boundary are saved to your farm with auto-calculated area. Next: geo-lock worker attendance to your farm boundary and pin facility points (sheds, water, gates).</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {addBlock && <AddBlockModal farmId={farmId} onClose={() => setAddBlock(false)} onSaved={() => { refreshSpatial(); setAddBlock(false); }} />}
    </div>
  );
}

function AddBlockModal({ farmId, onClose, onSaved }) {
  const [f, setF] = useState({ pu_name: "", enterprise_type: "CROPS", pu_type: "BED", area_ha: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const kinds = ENTERPRISE_KINDS[f.enterprise_type] || ["BED"];
  function setEnterprise(e) { const ent = e.target.value; setF((s) => ({ ...s, enterprise_type: ent, pu_type: (ENTERPRISE_KINDS[ent] || ["BED"])[0] })); }
  async function submit() {
    if (lock.current) return;
    if (!f.pu_name.trim()) { emitToast("Give the block a name"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/production-units", {
        farm_id: farmId, enterprise_type: f.enterprise_type, pu_type: f.pu_type, pu_name: f.pu_name.trim(),
        area_sqm: f.area_ha ? Math.round(Number(f.area_ha) * 10000) : null, notes: f.notes.trim() || null });
      emitToast("Block added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not add block"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Add block" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add block"}</button></>}>
      <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>Add a block by name and area — no map needed. You can draw it on the satellite map later to geo-locate it.</div>
      <div className="form-row"><label>Block name</label><input value={f.pu_name} onChange={set("pu_name")} placeholder="e.g. Block A / Riverside bed" /></div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Used for</label><select value={f.enterprise_type} onChange={setEnterprise}>{Object.keys(ENTERPRISE_KINDS).map((k) => <option key={k} value={k}>{ENT_LABEL[k] || k}</option>)}</select></div>
        <div><label>Type</label><select value={f.pu_type} onChange={set("pu_type")}>{kinds.map((k) => <option key={k} value={k}>{k[0] + k.slice(1).toLowerCase().replace("_", " ")}</option>)}</select></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Area (hectares, optional)</label><input type="number" min="0" step="0.01" value={f.area_ha} onChange={set("area_ha")} placeholder="e.g. 0.50" /></div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes (optional)</label><input value={f.notes} onChange={set("notes")} placeholder="anything useful about this block" /></div>
    </Modal>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function LocationsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <LocationsInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

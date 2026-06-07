/**
 * LocationsPage.jsx — /farm/locations  (coreLocationsView, Gate-1 traced)  L1.
 *
 * Where everything happens — zones, blocks, the farm map. L1 ships the live page
 * (zones + production-units, block detail, enterprise-location, facilities);
 * the interactive draw-your-own satellite map (Leaflet + Geoman) is L2 and
 * replaces the map placeholder here.
 *
 * Live: GET /zones?farm_id= · GET /production-units?farm_id= (blocks + crop) ·
 * financials/crops + flocks (where each enterprise is). Honest: the map
 * (L2), facilities registry, add zone/block create forms. No fabricated geometry.
 */
import { useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Plus, Search, Layers, Map as MapIcon, Sprout, Bird, Warehouse, Home,
  Fence, Bird as Poultry, Waves, Box, AlertTriangle, RefreshCw, Compass,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

const FarmMap = lazy(() => import("./FarmMap"));
import CapacityCalc from "../../components/farm/CapacityCalc";
import AttendanceCard from "../../components/farm/AttendanceCard";

const AREA_UNITS = { acres: "acres", ha: "ha", m2: "m²" };
const useFarmMapFeatures = (id) => useQuery({ queryKey: ["loc-map", id], queryFn: () => getJSON(`/api/v1/farm-map/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useBlockStatus = (id) => useQuery({ queryKey: ["loc-status", id], queryFn: () => getJSON(`/api/v1/production-units/status?farm_id=${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });

// Block state machine → pill colour (Phase 2)
const STATE_STYLE = {
  EMPTY:      { bg: "#EFEAE0", fg: "#8A7863", label: "Empty" },
  PREPARING:  { bg: "#EFE6D6", fg: "#5C4033", label: "Preparing" },
  ACTIVE:     { bg: "#E9F2DD", fg: "#3E7B1F", label: "Growing" },
  HARVESTING: { bg: "#FBF0D8", fg: "#BF9000", label: "Harvesting" },
  RESTING:    { bg: "#E6EEF6", fg: "#2D6CDF", label: "Resting" },
  IDLE:       { bg: "#FBEAE7", fg: "#D4442E", label: "Idle" },
};

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD", paper: "#FCFAF5",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F] focus-visible:ring-offset-1 transition";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
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
const puArea = (p) => p.area_ha ?? p.area ?? p.size_ha ?? null;
const puStatus = (p) => String(p.status || p.pu_status || p.cycle_status || "").toUpperCase();
const fmtArea = (a) => (a == null ? "—" : `${Number(a).toFixed(2)} ha`);
function statusColor(s) { return s.includes("ACTIV") || s.includes("GROW") ? C.green : s.includes("HARVEST") ? C.amber : s.includes("CLOS") ? C.soil : C.muted; }

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, style, onClick }) {
  return <div onClick={onClick} className="rounded-2xl border bg-white" style={{ borderColor: C.border, ...(onClick ? { cursor: "pointer" } : {}), ...style }}>{children}</div>;
}
function ColHead({ children, extra }) {
  return <div className="flex items-center justify-between gap-2 mb-2"><h3 className="text-sm font-semibold" style={{ color: C.soil }}>{children}</h3>{extra}</div>;
}
function FacilityCard({ icon: Icon, title, value, sub, building, onAdd }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.soil }}><Icon size={15} style={{ color: C.greenDk }} />{title}</div>
        {value != null ? <span className="text-lg font-bold" style={{ color: C.greenDk }}>{value}</span> : building ? <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>building</span> : null}
      </div>
      <div className="text-[11px] mt-1" style={{ color: C.muted }}>{sub}</div>
      {onAdd && <button onClick={onAdd} className={`mt-2 text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><Plus size={11} />Add</button>}
    </div>
  );
}

function LocationsInner() {
  const { farmId } = useCurrentFarm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const go = (sub) => navigate(`/farm/${sub}`);
  const refreshSpatial = () => {
    qc.invalidateQueries({ queryKey: ["loc-pus", farmId] });
    qc.invalidateQueries({ queryKey: ["loc-zones", farmId] });
    qc.invalidateQueries({ queryKey: ["loc-map", farmId] });
    qc.invalidateQueries({ queryKey: ["loc-status", farmId] });
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
  const [renameVal, setRenameVal] = useState(null); // null = not renaming
  const openMap = (kind, facilityType) => setOpenReq({ kind, facilityType, nonce: Date.now() });
  async function saveRename() {
    const sel = puRows.find((p) => p.pu_id === selected);
    if (!sel || !renameVal?.trim()) { setRenameVal(null); return; }
    try {
      const r = await fetch(`/api/v1/production-units/${encodeURIComponent(sel.pu_id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ pu_name: renameVal.trim() }),
      });
      if (r.ok) { refreshSpatial(); emitToast("Block renamed"); }
    } catch { /* non-fatal */ }
    setRenameVal(null);
  }

  const mapShapes = (mapFeat.data?.features ?? [])
    .map((f) => ({ id: f.properties?.feature_id, label: f.properties?.label || f.properties?.kind, kind: f.properties?.kind, area_ha: f.properties?.area_ha }))
    .filter((s) => (s.kind === "ZONE" || s.kind === "BLOCK") && s.area_ha != null);
  const calcArea = mapShapes.find((s) => s.id === calcShape)?.area_ha ?? mapShapes[0]?.area_ha ?? null;

  const zoneRows = zones.data?.data ?? [];
  const puRows = pus.data?.data ?? [];
  const cropRows = crops.data?.data ?? [];
  const flockRows = flocks.data?.data?.items ?? [];
  const zoneById = useMemo(() => Object.fromEntries(zoneRows.map((z) => [z.zone_id, z])), [zoneRows]);
  const blocksInZone = (zid) => puRows.filter((p) => p.zone_id === zid).length;

  const loading = zones.isLoading || pus.isLoading;
  const allErr = zones.isError && pus.isError;

  let blocks = puRows;
  if (zoneFilter) blocks = blocks.filter((p) => p.zone_id === zoneFilter);
  const q = search.trim().toLowerCase();
  if (q) blocks = blocks.filter((p) => `${puCode(p)} ${p.production_name || ""}`.toLowerCase().includes(q));

  const sel = selected ? puRows.find((p) => p.pu_id === selected) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Locations</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Where everything happens · zones, blocks, the farm map · {farmId || "your farm"} · crops + animals</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FarmSelector /><ModeDropdown />
          <button onClick={() => openMap("ZONE")} className={`text-sm px-3 py-2 rounded-lg flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}><Plus size={14} />Add zone</button>
          <button onClick={() => openMap("BLOCK")} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Add block</button>
        </div>
      </div>

      <div className="rounded-xl border p-3 text-xs" style={{ background: C.greenTint, borderColor: C.border, color: C.greenDk }}>
        <strong>Draw your farm on the satellite map.</strong> Pick Zone, Block or Boundary, draw it on the live satellite image, and area auto-calculates. Use GPS to centre on where you're standing. Your existing zones and blocks are also listed below.
      </div>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <Card key={i} style={{ padding: 16 }}><div className="rounded animate-pulse" style={{ height: 120, background: C.cream }} /></Card>)}</div>
      ) : allErr ? (
        <Card style={{ padding: 24 }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load locations</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>Reads from /zones and /production-units. If the farm id is a code rather than a UUID these can 422.</div>
              <button onClick={() => { zones.refetch(); pus.refetch(); }} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* three-column layout */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* zones */}
            <Card style={{ padding: 14 }}>
              <ColHead>Farm zones</ColHead>
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

            {/* interactive satellite map (L2) */}
            <Card style={{ padding: 14 }}>
              <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>draw · auto-area · GPS</span>}>Farm map · {farmId}</ColHead>
              {farmId ? (
                <Suspense fallback={<div className="rounded-xl flex items-center justify-center" style={{ background: C.paper, height: 460 }}><MapIcon size={26} style={{ color: C.muted }} /></div>}>
                  <FarmMap farmId={farmId} openRequest={openReq} onSaved={refreshSpatial} />
                </Suspense>
              ) : (
                <div className="rounded-xl flex items-center justify-center text-sm" style={{ background: C.paper, height: 460, color: C.muted }}>Pick a farm to map.</div>
              )}
              <div className="text-[11px] mt-2" style={{ color: C.muted }}>Pick Zone/Block/Boundary, draw on the satellite image, name it. Area auto-calculates. Tap Save map to keep it.</div>
            </Card>

            {/* block list */}
            <Card style={{ padding: 14 }}>
              <ColHead>Block list {zoneFilter ? <span className="text-[11px] font-normal" style={{ color: C.muted }}>· {zName(zoneById[zoneFilter] || {})}</span> : null}</ColHead>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blocks…" className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
              </div>
              {blocks.length === 0 ? <div className="text-sm" style={{ color: C.muted }}>No blocks{zoneFilter || q ? " match" : " yet"}.</div> : (
                <div className="space-y-1 max-h-[420px] overflow-y-auto">
                  {blocks.map((p) => {
                    const st = statusByPu[p.pu_id];
                    const sty = st ? (STATE_STYLE[st.state] || STATE_STYLE.EMPTY) : null;
                    return (
                      <div key={p.pu_id} role="button" tabIndex={0} onClick={() => setSelected(p.pu_id)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(p.pu_id); }}
                        className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer hover:bg-[#FCFAF5] ${FOCUS}`} style={{ border: `1px solid ${selected === p.pu_id ? C.green : "transparent"}` }}>
                        <span className="text-xs font-semibold shrink-0" style={{ color: C.soil }}>{puCode(p)}</span>
                        <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: C.muted }}>{st?.crop || p.production_name || zName(zoneById[p.zone_id] || {})}</span>
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
              {statusByPu[sel.pu_id]?.state === "IDLE" && (
                <div className="mt-2 text-[11px] rounded-lg px-2.5 py-1.5" style={{ background: STATE_STYLE.IDLE.bg, color: STATE_STYLE.IDLE.fg }}>
                  This block has been idle {statusByPu[sel.pu_id].days_idle} days. Rotation suggestions arrive in Phase 3.
                </div>
              )}
              <button onClick={() => go("cycles")} className={`mt-3 text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open production →</button>
            </Card>
          )}

          {/* every enterprise and where it is */}
          <Card style={{ padding: 16 }}>
            <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>crops + animals · {cropRows.length + flockRows.length} businesses</span>}>Every enterprise — and where it is</ColHead>
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
            {flockRows.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: C.muted }}>Animals · by area</div>}
            {flockRows.map((f, i) => (
              <div key={f.flock_id || i} className="flex items-center gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                <Bird size={13} style={{ color: C.amber }} />
                <span className="text-sm font-semibold" style={{ color: C.soil }}>{f.flock_label || f.flock_type}</span>
                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: C.muted }}>Livestock area</span>
                <button onClick={() => go("poultry")} className={`text-[11px] ${FOCUS}`} style={{ color: C.greenDk }}>Open →</button>
              </div>
            ))}
            {cropRows.length === 0 && flockRows.length === 0 && <div className="text-sm" style={{ color: C.muted }}>No enterprises yet — <button onClick={() => go("enterprises")} className={`font-semibold ${FOCUS}`} style={{ color: C.greenDk }}>add one</button> and it appears here with its location.</div>}
            <div className="text-[11px] mt-2" style={{ color: C.muted }}>Tap a crop to find its block. Animal paddock mapping turns on with the interactive map (L2).</div>
          </Card>

          {/* capacity calculator */}
          <Card style={{ padding: 16 }}>
            <ColHead extra={
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                {Object.entries(AREA_UNITS).map(([k, lbl]) => (
                  <button key={k} onClick={() => { setCalcUnit(k); localStorage.setItem("tfos_area_unit", k); }} className="text-[11px] px-2 py-1 font-semibold"
                    style={calcUnit === k ? { background: C.soil, color: "white" } : { color: C.soil }}>{lbl}</button>
                ))}
              </div>
            }>Capacity calculator</ColHead>
            {mapShapes.length === 0 ? (
              <div className="text-sm" style={{ color: C.muted }}>Draw or walk a zone/block on the map first — then pick it here to estimate how many plants or animals it can hold.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-[11px] block mb-1" style={{ color: C.muted }}>Pick a zone or block</label>
                  <select value={calcShape || mapShapes[0]?.id || ""} onChange={(e) => setCalcShape(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }}>
                    {mapShapes.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.kind.toLowerCase()})</option>)}
                  </select>
                  <p className="text-[11px] mt-2" style={{ color: C.muted }}>Area comes straight from what you mapped. Enter your own spacing — TFOS only does the maths, it won't invent agronomy.</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: C.paper }}>
                  <CapacityCalc areaHa={calcArea} unit={calcUnit} compact />
                </div>
              </div>
            )}
          </Card>

          {/* geo-locked attendance */}
          <Card style={{ padding: 16 }}>
            <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>GPS checked against your boundary</span>}>Worker attendance</ColHead>
            <AttendanceCard farmId={farmId} />
          </Card>

          {/* facilities */}
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

          {/* map / boundaries / gps footer */}
          <div className="rounded-2xl border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: C.paper, borderColor: C.border, borderStyle: "dashed" }}>
            <div className="flex items-start gap-2.5">
              <Compass size={18} style={{ color: C.greenDk, marginTop: 1 }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: C.soil }}>Map, boundaries & GPS</div>
                <div className="text-xs mt-0.5 max-w-xl" style={{ color: C.muted }}>Your drawn zones, blocks and boundary are saved to your farm with auto-calculated area. Next (L3): geo-lock worker attendance to your farm boundary and pin facility points (sheds, water, gates).</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
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

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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  MapPin, Plus, Search, Layers, Map as MapIcon, Sprout, Bird, Warehouse, Home,
  Fence, Bird as Poultry, Waves, Box, AlertTriangle, RefreshCw, Compass,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

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
  const go = (sub) => navigate(`/farm/${sub}`);

  const zones = useZones(farmId);
  const pus = usePUs(farmId);
  const crops = useCrops(farmId);
  const flocks = useFlocks(farmId);

  const [zoneFilter, setZoneFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

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
          <button onClick={() => emitToast("Add zone — create flow ships with the interactive map (L2)")} className={`text-sm px-3 py-2 rounded-lg flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}><Plus size={14} />Add zone</button>
          <button onClick={() => emitToast("Add block — create flow ships with the interactive map (L2)")} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Add block</button>
        </div>
      </div>

      <div className="rounded-xl border p-3 text-xs" style={{ background: C.greenTint, borderColor: C.border, color: C.greenDk }}>
        <strong>Interactive satellite map ships next.</strong> You'll draw your own zones, blocks and farm boundary on a live satellite map, with labels and auto-calculated area + live GPS. For now, your zones and blocks are listed below.
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

            {/* map placeholder (L2) */}
            <Card style={{ padding: 14 }}>
              <ColHead>Farm map · {farmId}</ColHead>
              <div className="rounded-xl border flex flex-col items-center justify-center text-center p-6" style={{ borderColor: C.border, borderStyle: "dashed", background: C.paper, minHeight: 200 }}>
                <MapIcon size={28} style={{ color: C.muted }} />
                <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>Interactive satellite map — ships next</div>
                <div className="text-xs mt-1 max-w-xs" style={{ color: C.muted }}>Draw your zones, blocks and boundary on a live satellite map, with labels, auto-area and live GPS.</div>
                <div className="text-[11px] mt-3" style={{ color: C.muted }}>{zoneRows.length} zones · {puRows.length} blocks mapped as lists today</div>
              </div>
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
                    const s = puStatus(p);
                    return (
                      <div key={p.pu_id} role="button" tabIndex={0} onClick={() => setSelected(p.pu_id)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(p.pu_id); }}
                        className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer hover:bg-[#FCFAF5] ${FOCUS}`} style={{ border: `1px solid ${selected === p.pu_id ? C.green : "transparent"}` }}>
                        <span className="text-xs font-semibold shrink-0" style={{ color: C.soil }}>{puCode(p)}</span>
                        <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: C.muted }}>{p.production_name || zName(zoneById[p.zone_id] || {})}</span>
                        {s && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ color: statusColor(s), border: `1px solid ${C.border}` }}>{s.toLowerCase()}</span>}
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
                <div>
                  <div className="text-sm font-bold" style={{ color: C.soil }}>{puCode(sel)}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.muted }}>{zName(zoneById[sel.zone_id] || {})}{sel.production_name ? ` · ${sel.production_name}` : ""}</div>
                </div>
                <button onClick={() => setSelected(null)} className={`text-xs ${FOCUS}`} style={{ color: C.greenDk }}>Close</button>
              </div>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
                {[["Zone", zName(zoneById[sel.zone_id] || {})], ["Crop", sel.production_name || "—"], ["Status", puStatus(sel).toLowerCase() || "—"], ["Area", fmtArea(puArea(sel))]].map(([l, v]) => (
                  <div key={l} className="rounded-lg p-2" style={{ background: C.paper }}><div className="text-[9px] uppercase" style={{ color: C.muted }}>{l}</div><div className="text-sm font-semibold truncate" style={{ color: C.soil }}>{v}</div></div>
                ))}
              </div>
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
            {cropRows.length === 0 && flockRows.length === 0 && <div className="text-sm" style={{ color: C.muted }}>No enterprises yet — add one and it appears here with its location.</div>}
            <div className="text-[11px] mt-2" style={{ color: C.muted }}>Tap a crop to find its block. Animal paddock mapping turns on with the interactive map (L2).</div>
          </Card>

          {/* facilities */}
          <Card style={{ padding: 16 }}>
            <ColHead extra={<span className="text-[11px]" style={{ color: C.muted }}>every place work happens — fields, housing, water, storage</span>}>Facilities on this farm</ColHead>
            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              <FacilityCard icon={Layers} title="Fields & blocks" value={puRows.length} sub="open-ground growing areas" />
              <FacilityCard icon={MapPin} title="Zones" value={zoneRows.length} sub="sections that group blocks" />
              <FacilityCard icon={Home} title="Greenhouses & shade houses" building sub="protected growing structures" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
              <FacilityCard icon={Warehouse} title="Barns & sheds" building sub="animal housing & general shelter" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
              <FacilityCard icon={Fence} title="Paddocks" building sub="fenced grazing for livestock" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
              <FacilityCard icon={Poultry} title="Poultry houses" building sub="layer & broiler housing" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
              <FacilityCard icon={Waves} title="Ponds, tanks & cages" building sub="aquaculture water bodies" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
              <FacilityCard icon={Box} title="Storage & cold rooms" building sub="warehouse, sheds & cold storage" onAdd={() => emitToast("Facilities registry ships with the map (L2)")} />
            </div>
          </Card>

          {/* map / boundaries / gps footer */}
          <div className="rounded-2xl border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: C.paper, borderColor: C.border, borderStyle: "dashed" }}>
            <div className="flex items-start gap-2.5">
              <Compass size={18} style={{ color: C.greenDk, marginTop: 1 }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: C.soil }}>Map, boundaries & GPS</div>
                <div className="text-xs mt-0.5 max-w-xl" style={{ color: C.muted }}>Next: draw your zones and blocks on a live satellite map, set your farm boundary, and GPS + area auto-calculate as you walk and mark your edges. Worker attendance can then be geo-locked to your farm area.</div>
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

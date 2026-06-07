/**
 * FarmMap.jsx — Locations L2 interactive satellite map (Leaflet + Geoman).
 *
 * Draw your own zones, blocks, boundary and facility points on a live Esri
 * satellite image. Auto-area (geodesic shoelace -> hectares), live GPS "you are
 * here", label-on-create. Loads GET /farm-map/{farmId}, saves the whole set via
 * PUT /farm-map/{farmId} (replace-all). Lazy-loaded by LocationsPage so Leaflet
 * never touches the main bundle.
 *
 * Free stack, no API key: Esri World Imagery tiles + leaflet-geoman-free.
 */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import { Save, LocateFixed, Layers, Loader2, Check, AlertTriangle, Maximize2, Minimize2, MapPin, Footprints, Undo2, Flag, X, Ruler, Calculator } from "lucide-react";
import CapacityCalc from "../../components/farm/CapacityCalc";

L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl: icon, shadowUrl: shadow });

const C = { soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E" };
const FIJI = [-17.8, 178.0];
const KIND_STYLE = {
  BOUNDARY: { color: "#F8F3E9", weight: 3, fill: false, dashArray: "6 6" },
  ZONE: { color: "#6AA84F", weight: 2, fillColor: "#6AA84F", fillOpacity: 0.18 },
  BLOCK: { color: "#BF9000", weight: 2, fillColor: "#BF9000", fillOpacity: 0.22 },
};
const POLY_KINDS = ["ZONE", "BLOCK", "BOUNDARY"];
const SWATCHES = ["#6AA84F", "#BF9000", "#D4442E", "#3E7B1F", "#2D6CDF", "#8E44AD", "#E67E22", "#5C4033"];
const FACILITY_TYPES = ["Barn / shed", "Greenhouse", "Paddock", "Poultry house", "Pond / tank", "Storage / cold room", "Water point", "Gate", "Office", "Other"];

// Base layers — all on Esri's arcgisonline host (already CSP-allowed; no Caddy change).
const BASE_LAYERS = {
  sat:     { label: "Satellite",   url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri — World Imagery" },
  streets: { label: "Streets",     url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri — World Street Map" },
  topo:    { label: "Terrain",     url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri — World Topo Map" },
};
// Area units — canonical storage is hectares; display converts. Acres default.
const AREA_UNITS = { acres: { label: "acres", per_ha: 2.47105 }, ha: { label: "ha", per_ha: 1 }, m2: { label: "m²", per_ha: 10000 } };
function fmtAreaU(ha, unit) {
  if (ha == null) return "—";
  const u = AREA_UNITS[unit] || AREA_UNITS.acres;
  return `${(ha * u.per_ha).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u.label}`;
}
function fmtDist(m, ft) {
  if (ft) { const f = m * 3.28084; return f >= 5280 ? `${(f / 5280).toFixed(2)} mi` : `${Math.round(f)} ft`; }
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }

// geodesic polygon area (m²) — same spherical-excess formula Leaflet.draw uses.
function geodesicAreaHa(latlngs) {
  const r = 6378137, d2r = Math.PI / 180, n = latlngs.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p1 = latlngs[i], p2 = latlngs[(i + 1) % n];
    a += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
  }
  return Math.abs((a * r * r) / 2) / 10000;
}
function layerAreaHa(layer) {
  if (!layer.getLatLngs) return null;
  let ll = layer.getLatLngs();
  while (Array.isArray(ll) && ll.length && Array.isArray(ll[0])) ll = ll[0];
  return ll && ll.length >= 3 ? geodesicAreaHa(ll) : null;
}
function styleFor(kind, color) {
  const base = KIND_STYLE[kind] || KIND_STYLE.ZONE;
  if (!color) return base;
  return kind === "BOUNDARY" ? { ...base, color } : { ...base, color, fillColor: color };
}

const PM_CONTROLS = {
  position: "topright", drawCircle: false, drawCircleMarker: false,
  drawPolyline: false, drawRectangle: true, drawText: false, rotateMode: false,
};
// preview = static look; fullscreen = full interaction + draw tools
function setInteractive(map, on) {
  ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard", "touchZoom"]
    .forEach((f) => { if (map[f]) (on ? map[f].enable() : map[f].disable()); });
}

export default function FarmMap({ farmId, onCountsChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const fgRef = useRef(null);      // FeatureGroup of drawn shapes
  const meRef = useRef(null);      // "you are here" marker
  const pendingRef = useRef(null); // freshly-drawn layer awaiting a name
  const nameInputRef = useRef(null);
  const walkLayerRef = useRef(null); // L.layerGroup for walk vertices + preview
  const watchIdRef = useRef(null);   // geolocation.watchPosition id
  const lastPosRef = useRef(null);   // latest {lat,lng,acc} from the watch
  const baseLayersRef = useRef({});  // {sat,streets,topo} tile layers
  const measureLayerRef = useRef(null);
  const measurePtsRef = useRef([]);
  const measureClickRef = useRef(null);
  const areaUnitRef = useRef("acres");
  const lastAreaRef = useRef(null);  // area (ha) of the most recently created shape
  const [drawKind, setDrawKind] = useState("ZONE");
  const drawKindRef = useRef("ZONE");
  const [status, setStatus] = useState("loading"); // loading|ready
  const [loadWarn, setLoadWarn] = useState(false);  // saved features couldn't load
  const [saving, setSaving] = useState("idle");     // idle|saving|saved|error
  const [dirty, setDirty] = useState(false);
  const [total, setTotal] = useState({ zones: 0, blocks: 0, ha: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [nameModal, setNameModal] = useState({ open: false, kind: "ZONE", value: "", color: "", facilityType: "" });
  const [walking, setWalking] = useState(false);     // GPS walk-the-boundary mode
  const [walkPts, setWalkPts] = useState([]);        // captured corners [{lat,lng,acc}]
  const [liveAcc, setLiveAcc] = useState(null);      // current GPS accuracy (m)
  const [areaUnit, setAreaUnit] = useState(() => localStorage.getItem("tfos_area_unit") || "acres");
  const [baseLayer, setBaseLayer] = useState("sat");
  const [measuring, setMeasuring] = useState(false);
  const [measureDist, setMeasureDist] = useState(0);
  const [distFt, setDistFt] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  useEffect(() => { drawKindRef.current = drawKind; }, [drawKind]);
  useEffect(() => { areaUnitRef.current = areaUnit; localStorage.setItem("tfos_area_unit", areaUnit);
    fgRef.current?.eachLayer((l) => refreshLayer(l)); }, [areaUnit]);

  // Preview is read-only; fullscreen turns on draw tools + map interaction.
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (fullscreen) {
      if (!map.pm.controlsVisible?.()) map.pm.addControls(PM_CONTROLS);
      map.pm.setPathOptions(styleFor(drawKindRef.current));
      setInteractive(map, true);
    } else {
      try { map.pm.removeControls(); } catch { /* not added yet */ }
      map.pm.disableDraw?.();
      map.pm.disableGlobalEditMode?.();
      cleanupWalk();
      stopMeasure();
      setCalcOpen(false);
      setInteractive(map, false);
    }
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // ESC exits fullscreen; autofocus the themed name modal when it opens.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === "Escape" && !nameModal.open) setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, nameModal.open]);
  useEffect(() => { if (nameModal.open) setTimeout(() => nameInputRef.current?.focus(), 40); }, [nameModal.open]);

  // bind metadata + popup + live-area to a layer
  function decorate(layer, props = {}) {
    const kind = props.kind || drawKindRef.current;
    layer._kind = kind;
    layer._ref_id = props.ref_id ?? null;
    layer._label = props.label ?? "";
    layer._color = props.color || null;
    layer._facility_type = props.facility_type || null;
    if (layer.setStyle && KIND_STYLE[kind]) layer.setStyle(styleFor(kind, layer._color));
    refreshLayer(layer);
    layer.on("pm:edit", () => { refreshLayer(layer); markDirty(); });
    layer.on("pm:dragend", () => { refreshLayer(layer); markDirty(); });
  }
  function refreshLayer(layer) {
    const ha = layerAreaHa(layer);
    if (ha != null) layer._area_ha = ha;
    const name = layer._label || layer._kind;
    layer.bindTooltip(layer._area_ha != null ? `${name} · ${fmtAreaU(layer._area_ha, areaUnitRef.current)}` : name, { permanent: false, direction: "center" });
  }
  function markDirty() { setDirty(true); recount(); }
  function recount() {
    const fg = fgRef.current; if (!fg) return;
    let zones = 0, blocks = 0, ha = 0;
    fg.eachLayer((l) => {
      if (l._kind === "ZONE") { zones++; ha += l._area_ha || 0; }
      else if (l._kind === "BLOCK") { blocks++; ha += l._area_ha || 0; }
    });
    const t = { zones, blocks, ha };
    setTotal(t); onCountsChange?.(t);
  }

  // init map once
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { center: FIJI, zoom: 13, zoomControl: true, maxZoom: 22 });
    mapRef.current = map;
    // maxNativeZoom: Esri imagery for rural areas runs out ~z17-18; beyond that
    // Leaflet upscales the last real tile instead of showing "Map data not yet
    // available" — lets the farmer zoom right in to draw small blocks.
    Object.entries(BASE_LAYERS).forEach(([key, b]) => {
      baseLayersRef.current[key] = L.tileLayer(b.url, { maxZoom: 22, maxNativeZoom: 18, attribution: b.attribution });
    });
    baseLayersRef.current.sat.addTo(map); // default
    // Place labels over satellite only (streets/topo already carry their own).
    baseLayersRef.current.labels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 22, maxNativeZoom: 18, opacity: 0.9 }).addTo(map);

    const fg = L.featureGroup().addTo(map);
    fgRef.current = fg;
    walkLayerRef.current = L.layerGroup().addTo(map); // walk vertices + live preview
    measureLayerRef.current = L.layerGroup().addTo(map);

    // Draw tools added only in fullscreen (see fullscreen effect); preview is read-only.
    map.pm.setGlobalOptions({ layerGroup: fg });
    map.pm.setPathOptions(styleFor("ZONE"));
    setInteractive(map, false);

    map.on("pm:create", (e) => {
      const layer = e.layer;
      const isMarker = e.shape === "Marker";
      const kind = isMarker ? "FACILITY" : drawKindRef.current;
      layer._kind = kind;
      if (layer.setStyle && KIND_STYLE[kind]) layer.setStyle(styleFor(kind)); // colour immediately
      pendingRef.current = layer;                       // park it; themed modal names it
      setNameModal({ open: true, kind, value: "", color: "", facilityType: "" });
    });
    map.on("pm:remove", () => { setDirty(true); recount(); });

    // Map is usable the moment Leaflet is up — don't gate it on the API.
    setStatus("ready");
    // Container is sized late under lazy/Suspense; force tile repaint.
    setTimeout(() => map.invalidateSize(), 120);
    setTimeout(() => map.invalidateSize(), 450);
    loadFeatures(map, fg);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      map.remove(); mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFeatures(map, fg) {
    try {
      const r = await fetch(`/api/v1/farm-map/${encodeURIComponent(farmId)}`, { headers: authHeaders() });
      if (r.status === 404) { setLoadWarn(false); return; } // new farm, nothing saved yet
      if (!r.ok) throw new Error(String(r.status));
      const fc = await r.json();
      (fc.features || []).forEach((f) => {
        const p = f.properties || {};
        const isPoint = f.geometry?.type === "Point";
        let layer;
        if (isPoint) {
          const [lng, lat] = f.geometry.coordinates;
          layer = L.marker([lat, lng]);
        } else {
          layer = L.geoJSON(f).getLayers()[0];
        }
        if (!layer) return;
        fg.addLayer(layer);
        decorate(layer, { kind: p.kind, ref_id: p.ref_id, label: p.label, color: p.color, facility_type: p.facility_type });
      });
      if (fg.getLayers().length) map.fitBounds(fg.getBounds().pad(0.15));
      recount();
      setLoadWarn(false);
    } catch {
      // Saved features couldn't load (API/migration not live) — map still works.
      setLoadWarn(true);
    }
  }

  // themed name modal (replaces window.prompt)
  function confirmName() {
    const layer = pendingRef.current;
    if (layer) {
      decorate(layer, { kind: layer._kind, label: nameModal.value.trim(), color: nameModal.color || null, facility_type: nameModal.facilityType || null });
      layer.on("pm:remove", () => { setDirty(true); recount(); });
      lastAreaRef.current = layer._area_ha ?? lastAreaRef.current;
      markDirty();
    }
    pendingRef.current = null;
    setNameModal({ open: false, kind: "ZONE", value: "", color: "", facilityType: "" });
  }
  function cancelName() {
    const layer = pendingRef.current;
    if (layer && fgRef.current) fgRef.current.removeLayer(layer); // discard the shape
    pendingRef.current = null;
    setNameModal({ open: false, kind: "ZONE", value: "", color: "", facilityType: "" });
    recount();
  }

  // ── GPS walk-the-boundary capture ───────────────────────────────────
  // Farmer stands at each corner and taps "Drop corner"; we record the actual
  // GPS fix. No on-screen drawing — accurate for interior / sloped land.
  function accColor(a) { return a == null ? C.muted : a <= 10 ? C.green : a <= 25 ? C.amber : C.red; }

  function redrawWalk(pts) {
    const lg = walkLayerRef.current; if (!lg) return;
    lg.clearLayers();
    pts.forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: C.greenDk, fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: "center", className: "tfos-vtx" })
        .addTo(lg);
    });
    const latlngs = pts.map((p) => [p.lat, p.lng]);
    if (pts.length >= 3) L.polygon(latlngs, { ...styleFor(drawKindRef.current), dashArray: "5 5" }).addTo(lg);
    else if (pts.length === 2) L.polyline(latlngs, { color: C.greenDk, weight: 2, dashArray: "5 5" }).addTo(lg);
  }

  function startWalk() {
    if (!navigator.geolocation) {
      window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "This device has no GPS" } }));
      return;
    }
    setWalking(true); setWalkPts([]); redrawWalk([]);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        lastPosRef.current = { lat: latitude, lng: longitude, acc: accuracy };
        setLiveAcc(accuracy);
        const map = mapRef.current;
        if (meRef.current) meRef.current.setLatLng([latitude, longitude]);
        else meRef.current = L.circleMarker([latitude, longitude], { radius: 6, color: "#fff", weight: 2, fillColor: C.green, fillOpacity: 1 }).addTo(map).bindTooltip("You are here");
      },
      () => window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Allow location access to walk the boundary" } })),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );
    // jump to first fix
    navigator.geolocation.getCurrentPosition((pos) => mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 19), () => {}, { enableHighAccuracy: true });
  }

  function dropCorner() {
    const pos = lastPosRef.current;
    if (!pos) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Waiting for a GPS fix…" } })); return; }
    const next = [...walkPts, pos];
    setWalkPts(next); redrawWalk(next);
    mapRef.current?.panTo([pos.lat, pos.lng]);
  }
  function undoCorner() {
    const next = walkPts.slice(0, -1);
    setWalkPts(next); redrawWalk(next);
  }
  function stopWatch() {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }
  function finishWalk() {
    if (walkPts.length < 3) return;
    const kind = drawKindRef.current;
    const layer = L.polygon(walkPts.map((p) => [p.lat, p.lng]), styleFor(kind));
    layer._kind = kind;
    fgRef.current.addLayer(layer);
    layer._area_ha = layerAreaHa(layer);
    pendingRef.current = layer;
    cleanupWalk();
    setNameModal({ open: true, kind, value: "", color: "", facilityType: "" }); // themed name modal, then it's saved on the map
  }
  function cancelWalk() { cleanupWalk(); }
  function cleanupWalk() {
    stopWatch();
    walkLayerRef.current?.clearLayers();
    setWalking(false); setWalkPts([]); setLiveAcc(null);
  }

  // ── base layer (Satellite / Streets / Terrain) ──────────────────────
  function switchBase(key) {
    const map = mapRef.current, layers = baseLayersRef.current;
    ["sat", "streets", "topo"].forEach((k) => { if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]); });
    layers[key].addTo(map); layers[key].bringToBack();
    if (key === "sat") { if (!map.hasLayer(layers.labels)) layers.labels.addTo(map); }
    else if (map.hasLayer(layers.labels)) map.removeLayer(layers.labels);
    setBaseLayer(key);
  }

  // ── distance measure tool ───────────────────────────────────────────
  function startMeasure() {
    setCalcOpen(false);
    if (walking) cleanupWalk();
    mapRef.current?.pm.disableDraw?.();
    measurePtsRef.current = []; setMeasureDist(0); measureLayerRef.current.clearLayers();
    const handler = (e) => { measurePtsRef.current = [...measurePtsRef.current, e.latlng]; redrawMeasure(); };
    measureClickRef.current = handler; mapRef.current.on("click", handler);
    setMeasuring(true);
  }
  function redrawMeasure() {
    const lg = measureLayerRef.current, pts = measurePtsRef.current, map = mapRef.current;
    lg.clearLayers();
    pts.forEach((p) => L.circleMarker(p, { radius: 5, color: "#fff", weight: 2, fillColor: C.soil, fillOpacity: 1 }).addTo(lg));
    if (pts.length >= 2) L.polyline(pts, { color: C.soil, weight: 3, dashArray: "6 5" }).addTo(lg);
    let d = 0; for (let i = 1; i < pts.length; i++) d += map.distance(pts[i - 1], pts[i]);
    setMeasureDist(d);
  }
  function undoMeasure() { measurePtsRef.current = measurePtsRef.current.slice(0, -1); redrawMeasure(); }
  function stopMeasure() {
    if (measureClickRef.current) { mapRef.current?.off("click", measureClickRef.current); measureClickRef.current = null; }
    measurePtsRef.current = []; setMeasureDist(0); measureLayerRef.current?.clearLayers(); setMeasuring(false);
  }

  function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        map.setView([latitude, longitude], 17);
        if (meRef.current) meRef.current.remove();
        meRef.current = L.circleMarker([latitude, longitude], { radius: 7, color: "#fff", weight: 2, fillColor: C.green, fillOpacity: 1 })
          .addTo(map).bindTooltip("You are here").openTooltip();
      },
      () => window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: "Couldn't get your location — allow GPS access" } })),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function save() {
    const fg = fgRef.current; if (!fg) return;
    setSaving("saving");
    const features = [];
    fg.eachLayer((l) => {
      const gj = l.toGeoJSON();
      gj.properties = { kind: l._kind || "BLOCK", ref_id: l._ref_id ?? null, label: l._label || "", color: l._color || null, facility_type: l._facility_type || null, area_ha: l._area_ha ?? null };
      features.push(gj);
    });
    try {
      const r = await fetch(`/api/v1/farm-map/${encodeURIComponent(farmId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ type: "FeatureCollection", features }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSaving("saved"); setDirty(false);
      setTimeout(() => setSaving("idle"), 2000);
    } catch {
      setSaving("error");
      setTimeout(() => setSaving("idle"), 3000);
    }
  }

  const wrapStyle = fullscreen
    ? { position: "fixed", inset: 0, height: "100vh", width: "100vw", zIndex: 2000, borderRadius: 0 }
    : { height: 460 };

  return (
    <div className={`tfos-map relative overflow-hidden border ${fullscreen ? "" : "rounded-xl"}`} style={{ borderColor: C.border, ...wrapStyle }}>
      <style>{THEME_CSS}</style>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: C.cream }} />

      {/* PREVIEW: read-only; click anywhere to open the full editor */}
      {!fullscreen && (
        <button onClick={() => setFullscreen(true)} aria-label="Open full-screen map editor"
          className="absolute inset-0 z-[1000] flex items-end justify-center pb-10 group"
          style={{ background: "transparent" }}>
          <span className="text-xs px-3.5 py-2 rounded-full shadow flex items-center gap-1.5 font-semibold group-hover:brightness-95"
            style={{ background: "rgba(255,255,255,0.96)", color: C.soil, border: `1px solid ${C.border}` }}>
            <Maximize2 size={14} style={{ color: C.greenDk }} />Tap to open map & draw
          </span>
        </button>
      )}

      {/* FULLSCREEN editor chrome */}
      {fullscreen && (
        <>
          <div className="absolute z-[1000] top-3 left-3 flex items-center gap-1.5 rounded-xl p-1.5 shadow-lg" style={{ background: "rgba(255,255,255,0.97)", border: `1px solid ${C.border}` }}>
            <Layers size={18} style={{ color: C.muted, margin: "0 3px" }} />
            {POLY_KINDS.map((k) => (
              <button key={k} onClick={() => { setDrawKind(k); mapRef.current?.pm.setPathOptions(styleFor(k)); }}
                className="text-sm px-3.5 py-2 rounded-lg font-semibold transition"
                style={drawKind === k ? { background: (KIND_STYLE[k].color === "#F8F3E9" ? C.soil : KIND_STYLE[k].color), color: "white" } : { color: C.soil }}>
                {k === "BOUNDARY" ? "Boundary" : k === "ZONE" ? "Zone" : "Block"}
              </button>
            ))}
            <span className="text-xs px-1.5 hidden sm:inline" style={{ color: C.muted }}>then draw ▷</span>
          </div>

          <button onClick={() => setFullscreen(false)}
            className="absolute z-[1000] top-[68px] left-3 text-sm px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-lg font-semibold hover:brightness-95"
            style={{ background: "rgba(255,255,255,0.97)", color: C.soil, border: `1px solid ${C.border}` }}>
            <Minimize2 size={16} />Close map
          </button>

          {/* utility bar: base layer · units · measure · calculator */}
          <div className="absolute z-[1000] top-[116px] left-3 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-1.5rem)]">
            <div className="flex items-center rounded-xl shadow-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.97)" }}>
              {Object.entries(BASE_LAYERS).map(([k, b]) => (
                <button key={k} onClick={() => switchBase(k)} className="text-xs px-3 py-2 font-semibold" style={baseLayer === k ? { background: C.greenDk, color: "white" } : { color: C.soil }}>{b.label}</button>
              ))}
            </div>
            <div className="flex items-center rounded-xl shadow-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.97)" }}>
              {Object.entries(AREA_UNITS).map(([k, u]) => (
                <button key={k} onClick={() => setAreaUnit(k)} className="text-xs px-2.5 py-2 font-semibold" style={areaUnit === k ? { background: C.soil, color: "white" } : { color: C.soil }}>{u.label}</button>
              ))}
            </div>
            <button onClick={() => (measuring ? stopMeasure() : startMeasure())} className="text-xs px-3 py-2 rounded-xl shadow-lg font-semibold flex items-center gap-1.5"
              style={measuring ? { background: C.soil, color: "white" } : { background: "rgba(255,255,255,0.97)", color: C.soil, border: `1px solid ${C.border}` }}>
              <Ruler size={14} />Measure
            </button>
            <button onClick={() => { setCalcOpen((o) => !o); if (measuring) stopMeasure(); }} className="text-xs px-3 py-2 rounded-xl shadow-lg font-semibold flex items-center gap-1.5"
              style={calcOpen ? { background: C.greenDk, color: "white" } : { background: "rgba(255,255,255,0.97)", color: C.soil, border: `1px solid ${C.border}` }}>
              <Calculator size={14} />Calculator
            </button>
          </div>

          {!walking && !measuring && (
            <div className="absolute z-[1000] bottom-3 left-3 flex items-center gap-2 flex-wrap">
              <button onClick={startWalk} className="text-sm px-3.5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg font-semibold text-white hover:brightness-95" style={{ background: C.soil }}>
                <Footprints size={16} />Walk {drawKind === "BLOCK" ? "block" : drawKind === "BOUNDARY" ? "boundary" : "zone"}
              </button>
              <button onClick={locateMe} className="text-sm px-3.5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg font-semibold hover:brightness-95" style={{ background: "white", color: C.soil, border: `1px solid ${C.border}` }}>
                <LocateFixed size={16} />GPS
              </button>
              <button onClick={save} disabled={saving === "saving"} className="text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg text-white font-semibold hover:brightness-95 disabled:opacity-70"
                style={{ background: saving === "saved" ? C.green : saving === "error" ? C.red : C.greenDk }}>
                {saving === "saving" ? <Loader2 size={16} className="animate-spin" /> : saving === "saved" ? <Check size={16} /> : saving === "error" ? <AlertTriangle size={16} /> : <Save size={16} />}
                {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Failed" : dirty ? "Save map*" : "Save map"}
              </button>
            </div>
          )}

          {/* MEASURE panel */}
          {measuring && (
            <div className="absolute z-[1001] bottom-3 left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-1.5rem))] rounded-2xl shadow-xl p-3.5" style={{ background: "white", border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2"><Ruler size={16} style={{ color: C.soil }} /><span className="text-sm font-bold" style={{ color: C.soil }}>Measure distance</span></div>
                <button onClick={() => setDistFt((v) => !v)} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ color: C.soil, border: `1px solid ${C.border}` }}>{distFt ? "feet/mi" : "metres/km"}</button>
              </div>
              <div className="rounded-xl p-2.5 mb-2 flex items-baseline gap-2" style={{ background: "#E9F2DD" }}>
                <span className="text-2xl font-bold" style={{ color: C.greenDk }}>{fmtDist(measureDist, distFt)}</span>
                <span className="text-xs" style={{ color: C.muted }}>{measurePtsRef.current.length} point{measurePtsRef.current.length === 1 ? "" : "s"}</span>
              </div>
              <div className="text-xs mb-2.5" style={{ color: C.muted }}>Tap along the path on the map to measure its length.</div>
              <div className="flex items-center gap-2">
                <button onClick={undoMeasure} className="flex-1 text-sm px-3 py-2 rounded-xl font-semibold flex items-center justify-center gap-1.5 hover:brightness-95" style={{ color: C.soil, border: `1px solid ${C.border}` }}><Undo2 size={15} />Undo</button>
                <button onClick={stopMeasure} className="flex-1 text-sm px-3 py-2 rounded-xl font-semibold text-white flex items-center justify-center gap-1.5 hover:brightness-95" style={{ background: C.soil }}><Check size={15} />Done</button>
              </div>
            </div>
          )}

          {/* CALCULATOR panel */}
          {calcOpen && (
            <div className="absolute z-[1001] bottom-3 right-3 w-[min(360px,calc(100%-1.5rem))] rounded-2xl shadow-xl p-3.5" style={{ background: "white", border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-end mb-1">
                <button onClick={() => setCalcOpen(false)} className="text-xs font-semibold" style={{ color: C.muted }}><X size={15} /></button>
              </div>
              <CapacityCalc areaHa={lastAreaRef.current ?? total.ha ?? null} unit={areaUnit} compact />
              <p className="text-[11px] mt-2" style={{ color: C.muted }}>Using the last block you finished ({fmtAreaU(lastAreaRef.current ?? total.ha, areaUnit)}).</p>
            </div>
          )}

          {/* FIELD WALK panel — stand at each corner, tap Drop corner, walk to next */}
          {walking && (
            <div className="absolute z-[1001] bottom-3 left-1/2 -translate-x-1/2 w-[min(440px,calc(100%-1.5rem))] rounded-2xl shadow-xl p-3.5" style={{ background: "white", border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Footprints size={16} style={{ color: C.soil }} />
                  <span className="text-sm font-bold" style={{ color: C.soil }}>Walking the {drawKind === "BLOCK" ? "block" : drawKind === "BOUNDARY" ? "boundary" : "zone"}</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: accColor(liveAcc), border: `1px solid ${C.border}` }}>
                  {liveAcc == null ? "GPS…" : `GPS ±${Math.round(liveAcc)}m`}
                </span>
              </div>
              <div className="text-xs mb-2.5" style={{ color: C.muted }}>
                {walkPts.length === 0 ? "Stand at the first corner and tap Drop corner." : `${walkPts.length} corner${walkPts.length === 1 ? "" : "s"} captured — walk to the next and drop again.`}
                {liveAcc != null && liveAcc > 25 ? " · Move to open sky for better accuracy." : ""}
              </div>
              <button onClick={dropCorner} className="w-full text-base px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold hover:brightness-95 mb-2" style={{ background: C.greenDk }}>
                <MapPin size={18} />Drop corner here
              </button>
              <div className="flex items-center gap-2">
                <button onClick={undoCorner} disabled={!walkPts.length} className="flex-1 text-sm px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold hover:brightness-95 disabled:opacity-40" style={{ color: C.soil, border: `1px solid ${C.border}` }}>
                  <Undo2 size={15} />Undo
                </button>
                <button onClick={finishWalk} disabled={walkPts.length < 3} className="flex-[2] text-sm px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 text-white font-semibold hover:brightness-95 disabled:opacity-40" style={{ background: C.soil }}>
                  <Flag size={15} />Finish {walkPts.length >= 3 ? `(${walkPts.length} corners)` : `(need ${3 - walkPts.length} more)`}
                </button>
                <button onClick={cancelWalk} className="text-sm px-3 py-2 rounded-xl flex items-center justify-center font-semibold hover:brightness-95" style={{ color: C.red, border: `1px solid ${C.border}` }}>
                  <X size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* area readout (bottom-right) */}
      {!calcOpen && (
        <div className="absolute z-[1000] bottom-2 right-2 text-[11px] px-2.5 py-1.5 rounded-lg shadow" style={{ background: "rgba(255,255,255,0.95)", color: C.soil, border: `1px solid ${C.border}` }}>
          {total.zones} zones · {total.blocks} blocks · {fmtAreaU(total.ha, areaUnit)}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center" style={{ background: "rgba(248,243,233,0.7)" }}>
          <Loader2 size={22} className="animate-spin" style={{ color: C.greenDk }} />
        </div>
      )}
      {/* non-blocking: saved features didn't load, but the map still works */}
      {loadWarn && (
        <div className="absolute z-[1000] top-2 right-2 max-w-[200px] text-[10px] px-2 py-1.5 rounded-lg shadow flex items-start gap-1.5" style={{ background: "rgba(255,255,255,0.95)", color: C.amber, border: `1px solid ${C.border}` }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Saved map not loaded — draw works, Save needs migration 082 live.</span>
        </div>
      )}

      {/* themed name modal (replaces window.prompt) */}
      {nameModal.open && (
        <div className="absolute inset-0 z-[1002] flex items-center justify-center p-4" style={{ background: "rgba(58,46,38,0.45)" }}
          onKeyDown={(e) => { if (e.key === "Enter") confirmName(); if (e.key === "Escape") cancelName(); }}>
          <div className="rounded-2xl shadow-xl w-full max-w-sm p-5" style={{ background: "white", border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} style={{ color: nameModal.kind === "BLOCK" ? C.amber : nameModal.kind === "FACILITY" ? C.soil : C.greenDk }} />
              <h3 className="text-base font-bold" style={{ color: C.soil }}>Name this {nameModal.kind.toLowerCase()}</h3>
            </div>
            <p className="text-xs mb-3" style={{ color: C.muted }}>Give it a name you'll recognise — e.g. "East dalo field" or "Layer house".</p>
            <input ref={nameInputRef} value={nameModal.value}
              onChange={(e) => setNameModal((m) => ({ ...m, value: e.target.value }))}
              placeholder={`${nameModal.kind.charAt(0) + nameModal.kind.slice(1).toLowerCase()} name`}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F]"
              style={{ border: `1.5px solid ${C.border}`, background: C.cream, color: C.soil }} />
            {nameModal.kind === "FACILITY" && (
              <div className="mt-3">
                <span className="text-[11px] block mb-1.5" style={{ color: C.muted }}>Facility type</span>
                <select value={nameModal.facilityType} onChange={(e) => setNameModal((m) => ({ ...m, facilityType: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F]"
                  style={{ border: `1.5px solid ${C.border}`, background: C.cream, color: C.soil }}>
                  <option value="">Choose a type…</option>
                  {FACILITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div className="mt-3">
              <span className="text-[11px] block mb-1.5" style={{ color: C.muted }}>Colour</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {SWATCHES.map((sw) => (
                  <button key={sw} onClick={() => setNameModal((m) => ({ ...m, color: sw }))} aria-label={`colour ${sw}`}
                    className="w-7 h-7 rounded-full transition" style={{ background: sw, outline: nameModal.color === sw ? `2px solid ${C.soil}` : "none", outlineOffset: 2 }} />
                ))}
                <button onClick={() => setNameModal((m) => ({ ...m, color: "" }))} className="text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Default</button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={cancelName} className="text-sm px-3.5 py-2 rounded-lg font-semibold hover:brightness-95" style={{ color: C.soil, border: `1px solid ${C.border}` }}>Discard</button>
              <button onClick={confirmName} className="text-sm px-4 py-2 rounded-lg font-semibold text-white hover:brightness-95" style={{ background: C.greenDk }}>Save name</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Scoped overrides so Leaflet + Geoman controls match the cream/soil theme.
const THEME_CSS = `
.tfos-map .leaflet-bar, .tfos-map .leaflet-pm-toolbar .leaflet-buttons-control-button {
  border-color: #E6DED0 !important; border-radius: 10px !important;
}
/* Bigger, easier-to-tap zoom controls */
.tfos-map .leaflet-bar a {
  color: #5C4033 !important; background: #FCFAF5 !important;
  width: 42px !important; height: 42px !important; line-height: 42px !important; font-size: 22px !important;
}
.tfos-map .leaflet-bar a:hover { background: #F8F3E9 !important; }
/* Bigger Geoman draw toolbar + icons */
.tfos-map .leaflet-pm-toolbar .leaflet-buttons-control-button {
  background-color: #FCFAF5 !important; box-shadow: 0 1px 2px rgba(58,46,38,.12) !important;
  width: 44px !important; height: 44px !important; background-size: 24px 24px !important;
}
.tfos-map .leaflet-pm-toolbar .button-container { width: 44px !important; height: 44px !important; }
.tfos-map .leaflet-pm-actions-container .leaflet-pm-action { font-size: 13px !important; }
.tfos-map .leaflet-pm-toolbar .button-container.active .leaflet-buttons-control-button,
.tfos-map .leaflet-pm-toolbar .leaflet-buttons-control-button:hover { background-color: #E9F2DD !important; }
.tfos-map .leaflet-pm-actions-container .leaflet-pm-action {
  background: #5C4033 !important; color: #F8F3E9 !important; border: none !important;
  font-weight: 600 !important; padding: 4px 8px !important;
}
.tfos-map .leaflet-pm-actions-container .leaflet-pm-action:hover { background: #3A2E26 !important; }
.tfos-map .leaflet-pm-actions-container .leaflet-pm-action.action-cancel { background: #D4442E !important; }
.tfos-map .leaflet-tooltip {
  background: #F8F3E9 !important; border: 1px solid #E6DED0 !important; color: #3A2E26 !important;
  font-weight: 600 !important; border-radius: 8px !important; box-shadow: 0 1px 3px rgba(58,46,38,.15) !important;
}
.tfos-map .leaflet-tooltip-top:before, .tfos-map .leaflet-tooltip-bottom:before,
.tfos-map .leaflet-tooltip-left:before, .tfos-map .leaflet-tooltip-right:before { display: none; }
.tfos-map .leaflet-control-attribution { background: rgba(248,243,233,.85) !important; color: #8A7863 !important; border-radius: 6px 0 0 0; }
/* Walk-mode corner number badges */
.tfos-map .leaflet-tooltip.tfos-vtx {
  background: #3E7B1F !important; color: #fff !important; border: 2px solid #fff !important;
  border-radius: 999px !important; font-weight: 700 !important; font-size: 11px !important;
  padding: 0 !important; width: 18px; height: 18px; line-height: 14px; text-align: center; box-shadow: none !important;
}
`;

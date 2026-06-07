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
import { Save, LocateFixed, Layers, Trash2, Loader2, Check, AlertTriangle } from "lucide-react";

L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl: icon, shadowUrl: shadow });

const C = { soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E" };
const FIJI = [-17.8, 178.0];
const KIND_STYLE = {
  BOUNDARY: { color: "#F8F3E9", weight: 3, fill: false, dashArray: "6 6" },
  ZONE: { color: "#6AA84F", weight: 2, fillColor: "#6AA84F", fillOpacity: 0.18 },
  BLOCK: { color: "#BF9000", weight: 2, fillColor: "#BF9000", fillOpacity: 0.22 },
};
const POLY_KINDS = ["ZONE", "BLOCK", "BOUNDARY"];

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
function styleFor(kind) { return KIND_STYLE[kind] || KIND_STYLE.ZONE; }

export default function FarmMap({ farmId, onCountsChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const fgRef = useRef(null);      // FeatureGroup of drawn shapes
  const meRef = useRef(null);      // "you are here" marker
  const [drawKind, setDrawKind] = useState("ZONE");
  const drawKindRef = useRef("ZONE");
  const [status, setStatus] = useState("loading"); // loading|ready
  const [loadWarn, setLoadWarn] = useState(false);  // saved features couldn't load
  const [saving, setSaving] = useState("idle");     // idle|saving|saved|error
  const [dirty, setDirty] = useState(false);
  const [total, setTotal] = useState({ zones: 0, blocks: 0, ha: 0 });

  useEffect(() => { drawKindRef.current = drawKind; }, [drawKind]);

  // bind metadata + popup + live-area to a layer
  function decorate(layer, props = {}) {
    const kind = props.kind || drawKindRef.current;
    layer._kind = kind;
    layer._ref_id = props.ref_id ?? null;
    layer._label = props.label ?? "";
    if (layer.setStyle && KIND_STYLE[kind]) layer.setStyle(styleFor(kind));
    refreshLayer(layer);
    layer.on("pm:edit", () => { refreshLayer(layer); markDirty(); });
    layer.on("pm:dragend", () => { refreshLayer(layer); markDirty(); });
  }
  function refreshLayer(layer) {
    const ha = layerAreaHa(layer);
    layer._area_ha = ha;
    const name = layer._label || layer._kind;
    layer.bindTooltip(ha != null ? `${name} · ${ha.toFixed(2)} ha` : name, { permanent: false, direction: "center" });
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
    const map = L.map(elRef.current, { center: FIJI, zoom: 13, zoomControl: true });
    mapRef.current = map;
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles &copy; Esri — World Imagery",
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, opacity: 0.9,
    }).addTo(map);

    const fg = L.featureGroup().addTo(map);
    fgRef.current = fg;

    map.pm.addControls({
      position: "topright", drawCircle: false, drawCircleMarker: false,
      drawPolyline: false, drawRectangle: true, drawText: false, rotateMode: false,
    });
    map.pm.setGlobalOptions({ layerGroup: fg });
    map.pm.setPathOptions(styleFor("ZONE"));

    map.on("pm:create", (e) => {
      const layer = e.layer;
      const isMarker = e.shape === "Marker";
      const kind = isMarker ? "FACILITY" : drawKindRef.current;
      const label = window.prompt(`Name this ${kind.toLowerCase()}:`, "") || "";
      decorate(layer, { kind, label });
      layer.on("pm:remove", () => { setDirty(true); recount(); });
      markDirty();
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
    return () => { window.removeEventListener("resize", onResize); map.remove(); mapRef.current = null; };
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
        decorate(layer, { kind: p.kind, ref_id: p.ref_id, label: p.label });
      });
      if (fg.getLayers().length) map.fitBounds(fg.getBounds().pad(0.15));
      recount();
      setLoadWarn(false);
    } catch {
      // Saved features couldn't load (API/migration not live) — map still works.
      setLoadWarn(true);
    }
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
      gj.properties = { kind: l._kind || "BLOCK", ref_id: l._ref_id ?? null, label: l._label || "", area_ha: l._area_ha ?? null };
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

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: C.border, height: 460 }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: C.cream }} />

      {/* draw-kind toolbar (top-left) */}
      <div className="absolute z-[1000] top-2 left-2 flex items-center gap-1 rounded-lg p-1 shadow" style={{ background: "rgba(255,255,255,0.95)", border: `1px solid ${C.border}` }}>
        <Layers size={13} style={{ color: C.muted, margin: "0 2px" }} />
        {POLY_KINDS.map((k) => (
          <button key={k} onClick={() => { setDrawKind(k); mapRef.current?.pm.setPathOptions(styleFor(k)); }}
            className="text-[11px] px-2 py-1 rounded font-semibold transition"
            style={drawKind === k ? { background: (KIND_STYLE[k].color === "#F8F3E9" ? C.soil : KIND_STYLE[k].color), color: "white" } : { color: C.soil }}>
            {k === "BOUNDARY" ? "Boundary" : k === "ZONE" ? "Zone" : "Block"}
          </button>
        ))}
        <span className="text-[10px] px-1" style={{ color: C.muted }}>then draw ▷</span>
      </div>

      {/* actions (bottom-left) */}
      <div className="absolute z-[1000] bottom-2 left-2 flex items-center gap-1.5">
        <button onClick={locateMe} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow hover:brightness-95" style={{ background: "white", color: C.soil, border: `1px solid ${C.border}` }}>
          <LocateFixed size={13} />GPS
        </button>
        <button onClick={save} disabled={saving === "saving"} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow text-white hover:brightness-95 disabled:opacity-70"
          style={{ background: saving === "saved" ? C.green : saving === "error" ? C.red : C.greenDk }}>
          {saving === "saving" ? <Loader2 size={13} className="animate-spin" /> : saving === "saved" ? <Check size={13} /> : saving === "error" ? <AlertTriangle size={13} /> : <Save size={13} />}
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Failed" : dirty ? "Save map*" : "Save map"}
        </button>
      </div>

      {/* area readout (bottom-right) */}
      <div className="absolute z-[1000] bottom-2 right-2 text-[11px] px-2.5 py-1.5 rounded-lg shadow" style={{ background: "rgba(255,255,255,0.95)", color: C.soil, border: `1px solid ${C.border}` }}>
        {total.zones} zones · {total.blocks} blocks · {total.ha.toFixed(2)} ha
      </div>

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
    </div>
  );
}

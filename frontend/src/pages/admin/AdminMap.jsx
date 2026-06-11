/**
 * AdminMap.jsx — /admin/map
 *
 * Platform-wide farm locations. Plots every farm's auto-derived pin (centroid of
 * the boundary/blocks each farmer drew or walked) on a satellite map. Pins only —
 * farm_id + name + coords, per the operator brief. Reads GET /farm-map/global-pins
 * (PARTNER+; admins inherit). Dark admin chrome; lazy so Leaflet stays out of the
 * farmer + main bundles.
 */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

const FIJI = [-17.8, 178.0];

export default function AdminMap() {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [state, setState] = useState("loading"); // loading|ready|error
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { center: FIJI, zoom: 7, maxZoom: 22 });
    mapRef.current = map;
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 22, maxNativeZoom: 18, attribution: "Tiles &copy; Esri — World Imagery",
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 22, maxNativeZoom: 18, opacity: 0.9,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 120);
    load(map);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(map) {
    setState("loading");
    try {
      const r = await fetch("/api/v1/farm-map/global-pins", { headers: authHeader() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const pins = data.pins || [];
      const lg = layerRef.current; lg.clearLayers();
      const bounds = [];
      pins.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        const ll = [Number(p.lat), Number(p.lng)];
        bounds.push(ll);
        L.circleMarker(ll, { radius: 6, color: "#fff", weight: 1.5, fillColor: "#6AA84F", fillOpacity: 0.95 })
          .bindPopup(`<strong>${p.name || p.farm_id}</strong><br/><span style="color:#888">${p.farm_id}</span><br/>${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`)
          .addTo(lg);
      });
      setCount(pins.length);
      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[#5C4033]">Platform Farm Map</h1>
          <p className="text-xs text-[#8A8678] mt-0.5">Every farm's location across the platform · pins auto-derived from each farm's drawn/walked map</p>
        </div>
        <span className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white border border-[#E6E1D6] text-emerald-400">
          {state === "ready" ? `${count} farm${count === 1 ? "" : "s"} mapped` : state === "loading" ? "Loading…" : "—"}
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-[#E6E1D6]" style={{ height: 600 }}>
        <div ref={elRef} style={{ position: "absolute", inset: 0, background: "#FFFFFF" }} />
        {state === "loading" && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 text-[#8A8678] text-sm">Loading farm pins…</div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 text-center p-4">
            <p className="text-sm font-semibold text-[#5C4033]">Couldn't load farm pins</p>
            <p className="text-xs text-[#8A8678] mt-1">Reads /farm-map/global-pins (PARTNER+). Retry below.</p>
            <button onClick={() => load(mapRef.current)} className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-[#5C4033] hover:brightness-95">Retry</button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">Farms appear here once the farmer saves a map. Pins are coordinates only — no enterprise or financial detail.</p>
    </AdminLayout>
  );
}

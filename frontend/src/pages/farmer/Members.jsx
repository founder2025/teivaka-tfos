/**
 * Members.jsx — /members — the verified-member networking map.
 *
 * Replaces the old "Directory coming soon" stub with the real Slice 3 surface:
 * verified members who opted to share their location, plotted on a satellite map
 * with the EXACT distance from your farm but a ~1km-FUZZED pin (Operator posture
 * 2026-06-23: verified-viewers-only, exact km + fuzzed pin). Reads
 * GET /api/v1/farm-map/network. Honest states throughout — verification gate,
 * no-origin prompt, empty network — never mock pins.
 *
 * Consent banner: if you haven't yet chosen whether to share, a one-time notice
 * lets you Share (verified members can find you) or Stay hidden — the proactive
 * version of the Slice 2 toggle, so nobody appears on the map unknowingly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, ShieldCheck, Users, EyeOff } from "lucide-react";

const FIJI = [-17.8, 178.0];
const C = { soil: "#2C1A0E", green: "var(--green)", greenDk: "var(--green-dk)", cream: "var(--cream)", line: "var(--line)", muted: "var(--muted)" };
const TYPE_LABEL = {
  FARMER: "Farmer", BUYER: "Buyer", SUPPLIER: "Supplier", SERVICE_PROVIDER: "Service provider",
  BANKER: "Banker", BUSINESS: "Business", EXPORTER: "Exporter", IMPORTER: "Importer",
};

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

export default function Members() {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [state, setState] = useState("loading"); // loading|ready|forbidden|error
  const [data, setData] = useState({ members: [], count: 0, has_origin: false });
  const [prefs, setPrefs] = useState(null); // {share_location, location_share_ack}
  const [savingPref, setSavingPref] = useState(false);

  async function loadPrefs() {
    try {
      const r = await fetch("/api/v1/me/prefs", { headers: authHeaders() });
      setPrefs(r.ok ? (await r.json())?.data ?? {} : {});
    } catch { setPrefs({}); }
  }

  async function loadNetwork() {
    setState("loading");
    try {
      const r = await fetch("/api/v1/farm-map/network", { headers: authHeaders() });
      if (r.status === 403) { setState("forbidden"); return; }
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setState("ready");
    } catch { setState("error"); }
  }

  useEffect(() => { loadPrefs(); loadNetwork(); }, []);

  // Init the map once the ready state mounts the map element.
  useEffect(() => {
    if (state !== "ready" || mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { center: FIJI, zoom: 7, maxZoom: 19 });
    mapRef.current = map;
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, attribution: "Tiles &copy; Esri — World Imagery",
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, maxNativeZoom: 18, opacity: 0.9,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); map.remove(); mapRef.current = null; };
  }, [state]);

  // Plot members whenever data changes and the map exists.
  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !layerRef.current) return;
    const lg = layerRef.current; lg.clearLayers();
    const bounds = [];
    // "You are here" — the viewer's own farm, so a solo user still sees the map populate.
    if (data.you && data.you.lat != null && data.you.lng != null) {
      const yll = [Number(data.you.lat), Number(data.you.lng)];
      bounds.push(yll);
      L.circleMarker(yll, { radius: 8, color: "#fff", weight: 2, fillColor: "#2C1A0E", fillOpacity: 1 })
        .bindPopup(`<strong>You are here</strong><br/><span style="color:#888">${data.you.name || "Your farm"}</span>`)
        .addTo(lg);
    }
    (data.members || []).forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const ll = [Number(m.lat), Number(m.lng)];
      bounds.push(ll);
      const dist = m.distance_km != null ? `${m.distance_km} km away` : "distance: set your farm location";
      L.circleMarker(ll, {
        radius: 7, color: "#fff", weight: 1.5,
        fillColor: m.verified ? "var(--green)" : "#c79a3a", fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${m.name}</strong>${m.verified ? " &#10003;" : ""}<br/><span style="color:#888">${TYPE_LABEL[m.account_type] || m.account_type}</span><br/>${dist}<br/><span style="color:#888;font-size:11px">approx — within ~1 km</span>`)
        .addTo(lg);
    });
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [data, state]);

  const setSharing = async (share) => {
    setSavingPref(true);
    try {
      await fetch("/api/v1/me", { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ share_location: share }) });
      await loadPrefs();
      await loadNetwork();
    } catch { /* best effort */ } finally { setSavingPref(false); }
  };

  const needsConsent = prefs && prefs.location_share_ack !== true;
  const members = data.members || [];
  const nearest = useMemo(() => members.slice(0, 50), [members]);

  return (
      <div className="max-w-4xl mx-auto px-3 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} style={{ color: C.greenDk }} />
          <h1 className="text-xl font-bold" style={{ color: C.soil }}>Member network</h1>
        </div>
        <p className="text-sm mb-4" style={{ color: C.muted }}>
          Verified members near you — exact distance, approximate pin. Connect with farmers, buyers and service providers around you.
        </p>

        {/* One-time consent notice */}
        {needsConsent && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: C.cream, border: `1px solid ${C.line}` }}>
            <div className="flex items-start gap-3">
              <MapPin size={18} style={{ color: C.greenDk, flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: C.soil }}>Be found on the network</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                  Share your location so verified members can find you with the distance to you. We only ever show it to verified members, as an approximate pin — never your exact spot. You can change this any time in Settings.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button type="button" disabled={savingPref} onClick={() => setSharing(true)}
                    className="px-3 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: C.green }}>
                    {savingPref ? "Saving…" : "Share my location"}
                  </button>
                  <button type="button" disabled={savingPref} onClick={() => setSharing(false)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ color: C.muted, border: `1px solid ${C.line}` }}>
                    Stay hidden
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Verification gate */}
        {state === "forbidden" && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <ShieldCheck size={32} style={{ color: C.greenDk, margin: "0 auto 10px" }} />
            <p className="font-semibold" style={{ color: C.soil }}>Verification required</p>
            <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: C.muted }}>
              The member network is open to verified members only — it keeps everyone's location safe. Get verified in Settings → Verification to see who's around you.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="rounded-2xl p-6 text-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <p className="font-semibold" style={{ color: C.soil }}>Couldn't load the network</p>
            <button onClick={loadNetwork} className="mt-3 px-3 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ background: C.green }}>Retry</button>
          </div>
        )}

        {state === "ready" && (
          <>
            {!data.has_origin && (
              <div className="rounded-xl px-4 py-3 mb-3 text-xs flex items-center gap-2" style={{ background: C.cream, color: C.soil, border: `1px solid ${C.line}` }}>
                <MapPin size={14} style={{ color: C.greenDk }} />
                Set your farm location (Farm → Map) to see exact distances to each member.
              </div>
            )}

            <div className="relative rounded-2xl overflow-hidden" style={{ height: 420, border: `1px solid ${C.line}` }}>
              <div ref={elRef} style={{ position: "absolute", inset: 0, background: C.cream }} />
              {members.length === 0 && !data.you && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center text-center px-6" style={{ background: "rgba(255,255,255,0.82)" }}>
                  <div>
                    <Users size={28} style={{ color: C.muted, margin: "0 auto 8px" }} />
                    <p className="text-sm font-semibold" style={{ color: C.soil }}>No members sharing near you yet</p>
                    <p className="text-xs mt-1" style={{ color: C.muted }}>As verified members turn on location sharing, they'll appear here.</p>
                  </div>
                </div>
              )}
            </div>

            {members.length === 0 && data.you && (
              <p className="text-xs mt-3" style={{ color: C.muted }}>
                You're on the map. Other verified members appear here once they share their location.
              </p>
            )}

            {members.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                  {data.count} member{data.count === 1 ? "" : "s"} sharing · nearest first
                </p>
                <div className="grid gap-2">
                  {nearest.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                      <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 30, height: 30, background: C.cream }}>
                        <MapPin size={14} style={{ color: C.greenDk }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: C.soil }}>
                          {m.name}{m.verified && <ShieldCheck size={12} style={{ color: C.greenDk, display: "inline", marginLeft: 4, verticalAlign: "middle" }} />}
                        </div>
                        <div className="text-xs" style={{ color: C.muted }}>{TYPE_LABEL[m.account_type] || m.account_type}</div>
                      </div>
                      <div className="text-sm font-semibold shrink-0" style={{ color: C.greenDk }}>
                        {m.distance_km != null ? `${m.distance_km} km` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {prefs && prefs.location_share_ack === true && prefs.share_location === false && state !== "forbidden" && (
          <div className="mt-4 text-xs flex items-center gap-2" style={{ color: C.muted }}>
            <EyeOff size={13} /> Your location is hidden — others can't see you. Turn it on in Settings to be found.
          </div>
        )}
      </div>
  );
}

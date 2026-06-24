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
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, ShieldCheck, Users, EyeOff, Search, Crosshair, MessageCircle } from "lucide-react";
import { useChat } from "../../context/ChatContext";

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
  const [radius, setRadius] = useState(50); // km within; null = Any. Default bounded
                                            // so the common path is index-backed at scale.
  const [cats, setCats] = useState([]);        // selected account_type filters
  const [qInput, setQInput] = useState("");    // raw search box
  const [q, setQ] = useState("");              // debounced query sent to server
  const [locating, setLocating] = useState(false);
  const markersRef = useRef({});               // member id -> leaflet marker (row->pin focus)
  const { openWith } = useChat();

  // debounce the search box → q
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);

  async function loadPrefs() {
    try {
      const r = await fetch("/api/v1/me/prefs", { headers: authHeaders() });
      setPrefs(r.ok ? (await r.json())?.data ?? {} : {});
    } catch { setPrefs({}); }
  }

  // Radius + category + search are pushed to the server (?radius_km=&categories=&q=)
  // so the client only downloads matching members, not the whole platform.
  const loadNetwork = useCallback(async () => {
    setState("loading");
    try {
      const p = new URLSearchParams();
      if (radius) p.set("radius_km", String(radius));
      if (cats.length) p.set("categories", cats.join(","));
      if (q) p.set("q", q);
      const qs = p.toString();
      const r = await fetch(`/api/v1/farm-map/network${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
      if (r.status === 403) { setState("forbidden"); return; }
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setState("ready");
    } catch { setState("error"); }
  }, [radius, cats, q]);

  useEffect(() => { loadPrefs(); }, []);
  useEffect(() => { loadNetwork(); }, [loadNetwork]);

  // One-tap: capture device location → save it as the member's shared location.
  // (Farmers' accurate anchor is the farm they draw in Locations; this is the
  // quick path + the operating/home location for non-farm members.)
  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch("/api/v1/me", {
            method: "PATCH", headers: authHeaders(),
            body: JSON.stringify({
              share_location: true,
              gps_lat: Number(pos.coords.latitude.toFixed(6)),
              gps_lng: Number(pos.coords.longitude.toFixed(6)),
            }),
          });
          await loadPrefs();
          await loadNetwork();
        } finally { setLocating(false); }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Focus a member's pin from its list row.
  const focusMember = (id) => {
    const mk = markersRef.current[id];
    if (mk && mapRef.current) {
      mapRef.current.setView(mk.getLatLng(), Math.max(mapRef.current.getZoom(), 13), { animate: true });
      mk.openPopup();
      elRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

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
    markersRef.current = {};
    const bounds = [];
    // "You are here" — the viewer's own farm, so a solo user still sees the map populate.
    if (data.you && data.you.lat != null && data.you.lng != null) {
      const yll = [Number(data.you.lat), Number(data.you.lng)];
      bounds.push(yll);
      // Radius ring around you (Google-Maps "within X km" visual).
      if (radius) {
        const circle = L.circle(yll, {
          radius: radius * 1000, color: "var(--green)", weight: 1,
          fillColor: "var(--green)", fillOpacity: 0.06,
        }).addTo(lg);
        try { circle.getBounds().isValid() && bounds.push(circle.getBounds().getNorthEast(), circle.getBounds().getSouthWest()); } catch { /* ignore */ }
      }
      L.circleMarker(yll, { radius: 8, color: "#fff", weight: 2, fillColor: "#2C1A0E", fillOpacity: 1 })
        .bindPopup(`<strong>You are here</strong><br/><span style="color:#888">${data.you.name || "Your farm"}</span>`)
        .addTo(lg);
    }
    (data.members || []).forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const ll = [Number(m.lat), Number(m.lng)];
      bounds.push(ll);
      const dist = m.distance_km != null ? `${m.distance_km} km away` : "distance: set your location";
      const mk = L.circleMarker(ll, {
        radius: 7, color: "#fff", weight: 1.5,
        fillColor: m.verified ? "var(--green)" : "#c79a3a", fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${m.name}</strong>${m.verified ? " &#10003;" : ""}<br/><span style="color:#888">${TYPE_LABEL[m.account_type] || m.account_type}</span><br/>${dist}`)
        .addTo(lg);
      markersRef.current[m.id] = mk;
    });
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [data, state, radius]);

  const setSharing = async (share) => {
    setSavingPref(true);
    try {
      const body = { share_location: share };
      // On opt-in, capture the member's current device location so non-farm
      // members (no farm) still get a pin. Farmers still resolve via their farm;
      // denied/unavailable just shares without coords (no error).
      if (share && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
          body.gps_lat = Number(pos.coords.latitude.toFixed(6));
          body.gps_lng = Number(pos.coords.longitude.toFixed(6));
        } catch { /* permission denied / unavailable — share without coords */ }
      }
      await fetch("/api/v1/me", { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
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
          Verified members near you — exact distance &amp; location. Search and connect with farmers, buyers, service providers and institutions around you.
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
              <div className="rounded-xl px-4 py-3 mb-3 text-xs" style={{ background: C.cream, color: C.soil, border: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={14} style={{ color: C.greenDk }} />
                  Set your location to filter by distance and appear on the map.
                </div>
                <button type="button" onClick={useMyLocation} disabled={locating}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                  style={{ background: C.green }}>
                  <Crosshair size={13} /> {locating ? "Locating…" : "Use my current location"}
                </button>
                <span className="ml-2" style={{ color: C.muted }}>or draw your farm in Farm → Map</span>
              </div>
            )}

            {/* Text search + one-tap locate */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search by name or town…"
                  className="w-full rounded-lg pl-8 pr-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, color: C.soil, outline: "none" }} />
              </div>
              <button type="button" onClick={useMyLocation} disabled={locating}
                className="px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{ border: `1px solid ${C.line}`, color: C.greenDk, background: "#fff", whiteSpace: "nowrap" }}>
                <Crosshair size={13} /> {locating ? "Locating…" : "My location"}
              </button>
            </div>

            {/* Radius filter — within X km of you */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: C.muted }}>Within</span>
              {[5, 10, 25, 50, 100, null].map((km) => (
                <button key={km ?? "any"} type="button" onClick={() => setRadius(km)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={radius === km
                    ? { background: C.green, color: "#fff" }
                    : { background: "#fff", color: C.soil, border: `1px solid ${C.line}` }}>
                  {km ? `${km} km` : "Any"}
                </button>
              ))}
            </div>

            {/* Category filter — chips with per-category counts (within radius) */}
            {data.category_counts && Object.keys(data.category_counts).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button type="button" onClick={() => setCats([])}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={cats.length === 0
                    ? { background: C.greenDk, color: "#fff" }
                    : { background: "#fff", color: C.soil, border: `1px solid ${C.line}` }}>
                  All
                </button>
                {Object.entries(data.category_counts).sort((a, b) => b[1] - a[1]).map(([cat, n]) => {
                  const on = cats.includes(cat);
                  return (
                    <button key={cat} type="button"
                      onClick={() => setCats((s) => (on ? s.filter((x) => x !== cat) : [...s, cat]))}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={on
                        ? { background: C.greenDk, color: "#fff" }
                        : { background: "#fff", color: C.soil, border: `1px solid ${C.line}` }}>
                      {(TYPE_LABEL[cat] || cat)} · {n}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="relative rounded-2xl overflow-hidden" style={{ height: 420, border: `1px solid ${C.line}`, isolation: "isolate", zIndex: 0 }}>
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
                {radius || cats.length
                  ? "No members match these filters. Try a wider radius or fewer categories."
                  : "You're on the map. Other verified members appear here once they share their location."}
              </p>
            )}

            {members.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                  {data.count} member{data.count === 1 ? "" : "s"}{radius ? ` within ${radius} km` : ""} · nearest first
                  {data.truncated ? " · showing nearest 500 — narrow the radius or filters" : ""}
                </p>
                <div className="grid gap-2">
                  {nearest.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                      <button type="button" onClick={() => focusMember(m.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left" style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
                        title="Show on map">
                        <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 30, height: 30, background: C.cream }}>
                          <MapPin size={14} style={{ color: C.greenDk }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: C.soil }}>
                            {m.name}{m.verified && <ShieldCheck size={12} style={{ color: C.greenDk, display: "inline", marginLeft: 4, verticalAlign: "middle" }} />}
                          </div>
                          <div className="text-xs" style={{ color: C.muted }}>{TYPE_LABEL[m.account_type] || m.account_type}</div>
                        </div>
                      </button>
                      <div className="text-sm font-semibold shrink-0" style={{ color: C.greenDk }}>
                        {m.distance_km != null ? `${m.distance_km} km` : "—"}
                      </div>
                      {m.user_id && (
                        <button type="button" onClick={() => openWith({ user_id: m.user_id, full_name: m.name, profession: m.account_type })}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                          style={{ background: C.green, color: "#fff" }} title={`Message ${m.name}`}>
                          <MessageCircle size={12} /> Connect
                        </button>
                      )}
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

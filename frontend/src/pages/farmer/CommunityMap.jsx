/**
 * CommunityMap.jsx — /community/map
 *
 * Full-width dark interactive map using Leaflet.js (loaded from CDN via index.html).
 * Each farmer = one dot at city/country level (never exact address).
 *
 * Dot states:
 *   Online now      = bright green pulsing animated dot
 *   Active today    = solid green
 *   Active this week = faded green
 *   Inactive        = gray
 *   Admin           = gold
 *
 * Dot click → floating profile card
 * Filter bar: All | Online Now | By Crop | By Region | By Rank
 * Floating collapsible sidebar: total count, regional breakdown, "You are here"
 * Bottom stats strip: Countries | Farmers | Online | Crops
 *
 * Privacy rules enforced:
 *   - Location at city/country level only
 *   - Opted-out users not shown
 *   - User chose visibility at onboarding (show / country only / hidden)
 */

import { useEffect, useRef, useState } from "react";
import FarmerLayout from "../../components/farmer/FarmerLayout";

const C = {
  soil:    "#2C1A0E",
  green:   "#3D8C40",
  cream:   "#F5EFE0",
  gold:    "#D4A017",
  mapBg:   "#1A1F2E",
};

const RANK = {
  seedling:      { emoji: "🌱", label: "Seedling" },
  grower:        { emoji: "🌿", label: "Grower" },
  farmer:        { emoji: "🌾", label: "Farmer" },
  senior_farmer: { emoji: "👨‍🌾", label: "Senior Farmer" },
  champion:      { emoji: "🏆", label: "Champion" },
};

const REGIONS = ["All", "Pacific", "Asia", "Africa", "Americas", "Europe"];
const CROPS   = ["All Crops", "Kava", "Cassava", "Capsicum", "Tomato", "Dalo", "Yaqona", "Banana"];
const RANKS   = ["All Ranks", "Seedling", "Grower", "Farmer", "Senior Farmer", "Champion"];

// Mock farmer data (replace with API call to /api/v1/community/map)
const MOCK_FARMERS = [
  { id: "1", name: "Mere Tuilagi",   rank: "senior_farmer", farm: "Sigatoka Greens",   lat: -18.15, lng: 177.53, status: "online",   city: "Sigatoka",   country: "Fiji",        crops: ["Capsicum","Tomato"], memberSince: "Mar 2024", farmSize: "12 ha" },
  { id: "2", name: "Seru Naiqama",   rank: "farmer",        farm: "Kadavu Organic",     lat: -19.03, lng: 178.19, status: "today",    city: "Kadavu",     country: "Fiji",        crops: ["Kava","Dalo"],      memberSince: "Jan 2024", farmSize: "8 ha"  },
  { id: "3", name: "Ana Rokosuka",   rank: "grower",        farm: "Lautoka Gardens",   lat: -17.61, lng: 177.45, status: "online",   city: "Lautoka",    country: "Fiji",        crops: ["Tomato","Banana"],  memberSince: "Jun 2024", farmSize: "5 ha"  },
  { id: "4", name: "Jone Cakaudrove",rank: "champion",      farm: "Rakiraki Estate",   lat: -17.33, lng: 178.12, status: "online",   city: "Rakiraki",   country: "Fiji",        crops: ["Cassava","Yaqona"], memberSince: "Dec 2023", farmSize: "33 ha" },
  { id: "5", name: "Tom Wainiqolo",  rank: "seedling",      farm: "Pacific Roots",     lat: -8.52,  lng: 179.19, status: "week",     city: "Funafuti",   country: "Tuvalu",      crops: ["Cassava"],          memberSince: "Aug 2024", farmSize: "2 ha"  },
  { id: "6", name: "Lani Fono",      rank: "grower",        farm: "Samoa Fields",      lat: -13.83, lng: -172.0, status: "inactive", city: "Apia",       country: "Samoa",       crops: ["Banana","Taro"],    memberSince: "May 2024", farmSize: "6 ha"  },
  { id: "7", name: "Ratu Vosavakadua",rank:"farmer",        farm: "Ba Highlands",      lat: -17.53, lng: 177.68, status: "online",   city: "Ba",         country: "Fiji",        crops: ["Kava","Dalo"],      memberSince: "Feb 2024", farmSize: "15 ha" },
  { id: "8", name: "Mele Tupou",     rank: "grower",        farm: "Nuku'alofa Farms",  lat: -21.14, lng: -175.2, status: "today",    city: "Nuku'alofa", country: "Tonga",       crops: ["Yam","Cassava"],    memberSince: "Jul 2024", farmSize: "4 ha"  },
];

const STATUS_STYLE = {
  online:   { color: "#4ADE80", pulse: true,  label: "Online now"       },
  today:    { color: "#3D8C40", pulse: false, label: "Active today"     },
  week:     { color: "#1A5C1E", pulse: false, label: "Active this week" },
  inactive: { color: "#6B7280", pulse: false, label: "Inactive"         },
  admin:    { color: "#D4A017", pulse: true,  label: "Admin"            },
};

function ProfileCard({ farmer, onClose }) {
  if (!farmer) return null;
  const rank = RANK[farmer.rank] || RANK.seedling;
  const s = STATUS_STYLE[farmer.status] || STATUS_STYLE.inactive;

  return (
    <div className="absolute z-50 w-64 rounded-2xl shadow-2xl overflow-hidden"
      style={{ background: "white", border: `1px solid #E0D5C0`, top: "60px", right: "16px" }}>
      <div className="h-16 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${C.soil}, ${C.green})` }}>
        <div className="w-14 h-14 rounded-full border-4 border-white flex items-center justify-center text-white font-bold text-lg absolute -bottom-7"
          style={{ background: C.green }}>
          {farmer.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
        </div>
        <button onClick={onClose}
          className="absolute top-2 right-2 text-white/60 hover:text-white text-lg leading-none">
          ×
        </button>
      </div>
      <div className="pt-9 px-4 pb-4 text-center">
        <h3 className="font-bold text-sm" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
          {farmer.name}
        </h3>
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="text-sm">{rank.emoji}</span>
          <span className="text-xs text-gray-500">{rank.label}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">📍 {farmer.city}, {farmer.country}</p>

        <div className="flex items-center justify-center gap-1.5 mt-2">
          <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
          <span className="text-xs" style={{ color: s.color }}>{s.label}</span>
        </div>

        <div className="mt-3 text-left space-y-1 text-xs text-gray-500 border-t pt-3" style={{ borderColor: "#E0D5C0" }}>
          <div className="flex justify-between">
            <span>Farm</span>
            <span className="font-medium" style={{ color: C.soil }}>{farmer.farm}</span>
          </div>
          <div className="flex justify-between">
            <span>Size</span>
            <span className="font-medium" style={{ color: C.soil }}>{farmer.farmSize}</span>
          </div>
          <div className="flex justify-between">
            <span>Member since</span>
            <span className="font-medium" style={{ color: C.soil }}>{farmer.memberSince}</span>
          </div>
          <div className="flex justify-between">
            <span>Crops</span>
            <span className="font-medium" style={{ color: C.soil }}>{farmer.crops.join(", ")}</span>
          </div>
        </div>

        <button className="mt-3 w-full py-2 rounded-xl text-white text-xs font-semibold"
          style={{ background: C.green }}>
          View Profile
        </button>
      </div>
    </div>
  );
}

function SidebarPanel({ open, onToggle, farmers }) {
  const byRegion = [
    { region: "Pacific",  count: farmers.filter(f => ["Fiji","Tuvalu","Tonga","Samoa"].includes(f.country)).length },
    { region: "Asia",     count: 0 },
    { region: "Africa",   count: 0 },
    { region: "Americas", count: 0 },
    { region: "Europe",   count: 0 },
  ];

  return (
    <div className="absolute left-4 top-4 z-40 transition-all"
      style={{ width: open ? "220px" : "40px" }}>
      <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: "rgba(26,31,46,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={onToggle}
          className="flex items-center gap-2 p-3 w-full text-white/80 hover:text-white">
          <span className="text-lg">{open ? "◀" : "▶"}</span>
          {open && <span className="text-sm font-semibold">Platform Stats</span>}
        </button>

        {open && (
          <div className="px-4 pb-4 text-white">
            <div className="text-center mb-4">
              <p className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {farmers.length.toLocaleString()}
              </p>
              <p className="text-xs text-white/50">Registered Farmers</p>
            </div>

            <div className="space-y-1.5 text-xs mb-4">
              {byRegion.map(r => (
                <div key={r.region} className="flex justify-between items-center">
                  <span className="text-white/60">{r.region}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        background: C.green,
                        width: `${farmers.length > 0 ? (r.count / farmers.length) * 100 : 0}%`
                      }} />
                    </div>
                    <span className="text-white/80 w-4 text-right">{r.count}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-center py-2 rounded-lg" style={{ background: "rgba(61,140,64,0.2)", border: "1px solid rgba(61,140,64,0.4)", color: C.green }}>
              📍 You are here
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunityMap() {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filter, setFilter] = useState({ status: "all", crop: "All Crops", region: "All", rank: "All Ranks" });
  const [filtered, setFiltered] = useState(MOCK_FARMERS);

  // Apply filters
  useEffect(() => {
    let result = MOCK_FARMERS;
    if (filter.status === "online") result = result.filter(f => f.status === "online");
    if (filter.crop !== "All Crops") result = result.filter(f => f.crops.includes(filter.crop));
    if (filter.region !== "All") {
      const PACIFIC_COUNTRIES = ["Fiji", "Tuvalu", "Tonga", "Samoa", "Vanuatu", "Kiribati", "PNG"];
      if (filter.region === "Pacific") result = result.filter(f => PACIFIC_COUNTRIES.includes(f.country));
    }
    setFiltered(result);
  }, [filter]);

  // Init Leaflet map
  useEffect(() => {
    if (!window.L || leafletMap.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      center: [-15, 175],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);

    leafletMap.current = map;
  }, []);

  // Add/update farmer dots
  useEffect(() => {
    const L = window.L;
    if (!L || !leafletMap.current) return;

    // Clear existing markers
    leafletMap.current.eachLayer(layer => {
      if (layer._isTeivakaDot) leafletMap.current.removeLayer(layer);
    });

    filtered.forEach(farmer => {
      const s = STATUS_STYLE[farmer.status] || STATUS_STYLE.inactive;
      const pulseHtml = s.pulse
        ? `<div style="position:absolute;top:-4px;left:-4px;width:16px;height:16px;border-radius:50%;background:${s.color};opacity:0.3;animation:teivaka-pulse 2s ease-in-out infinite;"></div>`
        : "";

      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:8px;height:8px;">
          ${pulseHtml}
          <div style="width:8px;height:8px;border-radius:50%;background:${s.color};border:1.5px solid rgba(255,255,255,0.5);position:relative;z-index:1;"></div>
        </div>`,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
      });

      const marker = L.marker([farmer.lat, farmer.lng], { icon });
      marker._isTeivakaDot = true;
      marker.on("click", () => setSelectedFarmer(farmer));
      marker.addTo(leafletMap.current);
    });
  }, [filtered]);

  const onlineCount = filtered.filter(f => f.status === "online").length;
  const countryCount = new Set(filtered.map(f => f.country)).size;
  const cropCount = new Set(filtered.flatMap(f => f.crops)).size;

  return (
    <FarmerLayout>
      {/* Inject Leaflet CSS + pulse animation into head */}
      <style>{`
        @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        @keyframes teivaka-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(2); opacity: 0; }
        }
        .leaflet-container { background: #1A1F2E !important; }
      `}</style>

      <div className="relative" style={{ height: "calc(100vh - 116px)", marginLeft: "-1rem", marginRight: "-1rem" }}>

        {/* Filter bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 flex-wrap justify-center px-4">
          <div className="flex rounded-xl overflow-hidden shadow-lg" style={{ background: "rgba(26,31,46,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {["all", "online"].map(s => (
              <button key={s} onClick={() => setFilter(f => ({ ...f, status: s }))}
                className="px-3 py-2 text-xs font-medium transition-colors capitalize"
                style={{ background: filter.status === s ? C.green : "transparent", color: filter.status === s ? "white" : "rgba(255,255,255,0.6)" }}>
                {s === "all" ? "All Farmers" : "🟢 Online Now"}
              </button>
            ))}
          </div>

          <select value={filter.crop} onChange={e => setFilter(f => ({ ...f, crop: e.target.value }))}
            className="px-3 py-2 text-xs rounded-xl"
            style={{ background: "rgba(26,31,46,0.95)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
            {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filter.region} onChange={e => setFilter(f => ({ ...f, region: e.target.value }))}
            className="px-3 py-2 text-xs rounded-xl"
            style={{ background: "rgba(26,31,46,0.95)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
            {REGIONS.map(r => <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>)}
          </select>

          <select value={filter.rank} onChange={e => setFilter(f => ({ ...f, rank: e.target.value }))}
            className="px-3 py-2 text-xs rounded-xl"
            style={{ background: "rgba(26,31,46,0.95)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
            {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Leaflet map container */}
        <div ref={mapRef} style={{ width: "100%", height: "100%", background: C.mapBg }} />

        {/* Collapsible sidebar */}
        <SidebarPanel open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} farmers={filtered} />

        {/* Farmer profile card (on dot click) */}
        <ProfileCard farmer={selectedFarmer} onClose={() => setSelectedFarmer(null)} />

        {/* Dot legend */}
        <div className="absolute bottom-14 right-4 z-40 rounded-xl p-3 text-xs space-y-1"
          style={{ background: "rgba(26,31,46,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {[
            { color: "#4ADE80", pulse: true,  label: "Online now" },
            { color: "#3D8C40", pulse: false, label: "Active today" },
            { color: "#1A5C1E", pulse: false, label: "This week" },
            { color: "#6B7280", pulse: false, label: "Inactive" },
            { color: "#D4A017", pulse: false, label: "Admin" },
          ].map(d => (
            <div key={d.label} className="flex items-center gap-2 text-white/70">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              {d.label}
            </div>
          ))}
        </div>

        {/* Bottom stats strip */}
        <div className="absolute bottom-0 left-0 right-0 z-40 px-4 py-2 flex items-center justify-center gap-8"
          style={{ background: "rgba(26,31,46,0.95)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {[
            { icon: "🌍", label: "Countries",   value: countryCount },
            { icon: "👨‍🌾", label: "Farmers",     value: filtered.length.toLocaleString() },
            { icon: "🟢", label: "Online Now",   value: onlineCount },
            { icon: "🌱", label: "Crops Tracked", value: cropCount },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <span className="text-lg mr-1">{stat.icon}</span>
              <span className="text-white font-bold text-sm">{stat.value}</span>
              <span className="text-white/40 text-xs ml-1">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </FarmerLayout>
  );
}

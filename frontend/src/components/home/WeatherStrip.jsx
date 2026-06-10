/**
 * WeatherStrip.jsx — compact live weather for the Home landing.
 * Reads the current farm (localStorage tfos_current_farm_id, falling back to the
 * first farm) and renders now-conditions + a 7-day forecast from
 * /api/v1/weather/{current,forecast}/{farm_id}. Honest: renders nothing until a
 * farm + real Open-Meteo data exist. Includes a wet-week caution (spray-hold cue).
 */
import { useEffect, useState } from "react";
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Droplets, Wind, ShieldAlert } from "lucide-react";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

function wmo(code) {
  const c = Number(code);
  if (c === 0) return { label: "Clear", Icon: Sun };
  if (c <= 3) return { label: "Partly cloudy", Icon: CloudSun };
  if (c === 45 || c === 48) return { label: "Fog", Icon: CloudFog };
  if (c >= 51 && c <= 57) return { label: "Drizzle", Icon: CloudDrizzle };
  if (c >= 61 && c <= 67) return { label: "Rain", Icon: CloudRain };
  if (c >= 71 && c <= 77) return { label: "Snow", Icon: CloudSnow };
  if (c >= 80 && c <= 82) return { label: "Showers", Icon: CloudRain };
  if (c >= 95) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "—", Icon: Cloud };
}
const dayAbbr = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short" }); } catch { return ""; } };
const t1 = (v) => (v == null || isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}°`);

export default function WeatherStrip() {
  const [farmId, setFarmId] = useState(() => localStorage.getItem("tfos_current_farm_id") || null);
  const [cur, setCur] = useState(null);
  const [daily, setDaily] = useState(null);
  const [ready, setReady] = useState(false);

  // resolve a farm id if none stored
  useEffect(() => {
    if (farmId) return;
    getJSON("/api/v1/farms").then((r) => {
      const list = r?.data || r || [];
      if (Array.isArray(list) && list.length) setFarmId(list[0].farm_id);
      else setReady(true);
    }).catch(() => setReady(true));
  }, [farmId]);

  useEffect(() => {
    if (!farmId) return;
    (async () => {
      const [c, d] = await Promise.allSettled([
        getJSON(`/api/v1/weather/current/${encodeURIComponent(farmId)}`),
        getJSON(`/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`),
      ]);
      setCur(c.status === "fulfilled" ? (c.value?.data || null) : null);
      setDaily(d.status === "fulfilled" ? (d.value?.data || []) : []);
      setReady(true);
    })();
  }, [farmId]);

  // Nothing to show until we have real data — keep the landing clean.
  if (!ready) return null;
  if (!cur && (!daily || daily.length === 0)) return null;

  const now = cur ? wmo(cur.weather_code) : null;
  const rain7 = (daily || []).reduce((s, d) => s + (Number(d.precip_mm) || 0), 0);
  const wetWeek = rain7 >= 60;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {now && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 180 }}>
            <now.Icon size={38} style={{ color: "var(--green-dk)" }} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "var(--soil)", lineHeight: 1 }}>{t1(cur.temp_c)}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{now.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 10, marginTop: 2 }}>
                {cur.humidity_pct != null && <span><Droplets size={11} /> {Math.round(cur.humidity_pct)}%</span>}
                {cur.wind_kmh != null && <span><Wind size={11} /> {Math.round(cur.wind_kmh)} km/h</span>}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flex: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(daily || []).slice(0, 7).map((d, i) => {
            const w = wmo(d.weather_code);
            return (
              <div key={i} style={{ textAlign: "center", minWidth: 56 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dayAbbr(d.valid_at)}</div>
                <w.Icon size={20} style={{ color: "var(--soil)", margin: "2px auto" }} />
                <div style={{ fontSize: 12, color: "var(--soil)", fontWeight: 700 }}>{t1(d.temp_max_c)}<span style={{ color: "var(--muted)", fontWeight: 400 }}> {t1(d.temp_min_c)}</span></div>
                {d.precip_prob_pct != null && <div style={{ fontSize: 10.5, color: "var(--green-dk)" }}>{Math.round(d.precip_prob_pct)}%</div>}
              </div>
            );
          })}
        </div>
      </div>

      {wetWeek && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(106,168,79,0.08)", border: "1px solid var(--green)", borderRadius: 8, fontSize: 12, color: "var(--soil)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={14} style={{ color: "var(--green-dk)" }} />
          <span><strong>{Math.round(rain7)} mm rain forecast this week.</strong> Plan sprays around it — wet weather holds chemical applications and can delay harvest.</span>
        </div>
      )}
    </div>
  );
}

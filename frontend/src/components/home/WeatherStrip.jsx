/**
 * WeatherStrip.jsx — live weather for the Home landing: now-conditions + an
 * Hourly (next 48h) and 7-day forecast, from /api/v1/weather/{current,forecast}/{farm}.
 * Reads the current farm (localStorage, falls back to first farm). WMO code->icon,
 * wet-week spray-hold caution. Honest — renders nothing until a farm + real
 * Open-Meteo data exist. Full detail lives in /farm/weather.
 */
import { useEffect, useState } from "react";
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Droplets, Wind, ShieldAlert, ArrowRight } from "lucide-react";

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
const hourLabel = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "numeric" }); } catch { return ""; } };
const t1 = (v) => (v == null || isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}°`);

export default function WeatherStrip() {
  const [farmId, setFarmId] = useState(() => localStorage.getItem("tfos_current_farm_id") || null);
  const [cur, setCur] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [daily, setDaily] = useState(null);
  const [tab, setTab] = useState("hourly");
  const [ready, setReady] = useState(false);

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
      const fid = encodeURIComponent(farmId);
      const [c, h, d] = await Promise.allSettled([
        getJSON(`/api/v1/weather/current/${fid}`),
        getJSON(`/api/v1/weather/forecast/${fid}?range=hourly`),
        getJSON(`/api/v1/weather/forecast/${fid}?range=daily`),
      ]);
      setCur(c.status === "fulfilled" ? (c.value?.data || null) : null);
      setHourly(h.status === "fulfilled" ? (h.value?.data || []) : []);
      setDaily(d.status === "fulfilled" ? (d.value?.data || []) : []);
      setReady(true);
    })();
  }, [farmId]);

  if (!ready) return null;
  const hasData = cur || (hourly && hourly.length) || (daily && daily.length);
  if (!hasData) return null;

  const now = cur ? wmo(cur.weather_code) : null;
  const rain7 = (daily || []).reduce((s, d) => s + (Number(d.precip_mm) || 0), 0);
  const wetWeek = rain7 >= 60;
  const fetchedNote = cur?.fetched_at ? `Updated ${new Date(cur.fetched_at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : "Open-Meteo";

  const pill = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      fontSize: 11.5, padding: "4px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 600,
      border: tab === id ? "1px solid var(--green)" : "1px solid var(--line)",
      background: tab === id ? "rgba(106,168,79,0.12)" : "#fff",
      color: tab === id ? "var(--green-dk)" : "var(--muted)",
    }}>{label}</button>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* now header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        {now && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 180 }}>
            <now.Icon size={40} style={{ color: "var(--green-dk)" }} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--soil)", lineHeight: 1 }}>{t1(cur.temp_c)}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{now.label} · now</div>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 10, marginTop: 2 }}>
                {cur.humidity_pct != null && <span><Droplets size={11} /> {Math.round(cur.humidity_pct)}%</span>}
                {cur.wind_kmh != null && <span><Wind size={11} /> {Math.round(cur.wind_kmh)} km/h</span>}
              </div>
            </div>
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {pill("hourly", "Hourly")}
          {pill("daily", "7-day")}
          <a href="/farm/weather" style={{ fontSize: 11.5, color: "var(--green-dk)", display: "inline-flex", alignItems: "center", gap: 3 }}>Full weather <ArrowRight size={12} /></a>
        </div>
      </div>

      {/* hourly */}
      {tab === "hourly" && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {(hourly || []).length === 0 ? <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Hourly feed connecting…</div>
            : (hourly || []).slice(0, 24).map((h, i) => {
              const w = wmo(h.weather_code);
              return (
                <div key={i} style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{hourLabel(h.valid_at)}</div>
                  <w.Icon size={18} style={{ color: "var(--soil)", margin: "2px auto" }} />
                  <div style={{ fontSize: 12, color: "var(--soil)", fontWeight: 700 }}>{t1(h.temp_c)}</div>
                  <div style={{ fontSize: 10, color: "var(--green-dk)" }}>{h.precip_prob_pct != null ? `${Math.round(h.precip_prob_pct)}%` : ""}</div>
                </div>
              );
            })}
        </div>
      )}

      {/* 7-day */}
      {tab === "daily" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(daily || []).length === 0 ? <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Daily feed connecting…</div>
            : (daily || []).slice(0, 7).map((d, i) => {
              const w = wmo(d.weather_code);
              return (
                <div key={i} style={{ textAlign: "center", minWidth: 64, flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dayAbbr(d.valid_at)}</div>
                  <w.Icon size={22} style={{ color: "var(--soil)", margin: "3px auto" }} />
                  <div style={{ fontSize: 12.5, color: "var(--soil)", fontWeight: 700 }}>{t1(d.temp_max_c)}<span style={{ color: "var(--muted)", fontWeight: 400 }}> {t1(d.temp_min_c)}</span></div>
                  <div style={{ fontSize: 10.5, color: "var(--green-dk)" }}>{d.precip_prob_pct != null ? `${Math.round(d.precip_prob_pct)}%` : ""}{d.precip_mm ? ` · ${Math.round(d.precip_mm)}mm` : ""}</div>
                </div>
              );
            })}
        </div>
      )}

      {wetWeek && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(106,168,79,0.08)", border: "1px solid var(--green)", borderRadius: 8, fontSize: 12, color: "var(--soil)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={14} style={{ color: "var(--green-dk)" }} />
          <span><strong>{Math.round(rain7)} mm rain forecast this week.</strong> Plan sprays around it — wet weather holds chemical applications and can delay harvest.</span>
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "right" }}>{fetchedNote} · Open-Meteo</div>
    </div>
  );
}

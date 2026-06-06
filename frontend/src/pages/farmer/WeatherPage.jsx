/**
 * WeatherPage.jsx — /farm/weather  (coreWeatherView, Gate-1 traced)
 *
 * Weather decisions in one place — crops + animals. Mostly LIVE: production has
 * tenant.weather_log + endpoints, so observed weather the farmer logs is real.
 *   GET  /weather/summary/{farm}  — aggregates (rain/temp/humidity)
 *   GET  /weather?farm_id=&days=  — logged observations
 *   POST /weather                 — log a day  (the page's primary action)
 * Per-business guidance is live: latest observation × real enterprises
 * (financials/crops + flocks). The EXTERNAL forecast feed (7-day/cyclone/disease/
 * windows) is not connected — shown honestly as feed-pending, never fabricated
 * (a farmer could act on fake rain). No invented numbers.
 */
import { useMemo, useState } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CloudRain, CloudSun, Wind, Droplets, Thermometer, Plus, ShieldAlert, Sprout, Bird,
  AlertTriangle, RefreshCw, Activity, CalendarClock,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import Modal from "../../components/ui/Modal";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD", paper: "#FCFAF5",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F] focus-visible:ring-offset-1 transition";
const WET_MM = 10, HUMID = 80, WINDY_KMH = 25;

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(url, body) { const r = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }
function num(v) { return v == null || v === "" ? null : Number(v); }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function dOf(s) { return String(s || "").slice(0, 10); }
function fmtDate(s) { try { const d = new Date(dOf(s) + "T00:00:00"); if (!isNaN(d)) return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }); } catch { /* noop */ } return dOf(s); }

const useSummary = (id) => useQuery({ queryKey: ["wx-sum", id], queryFn: () => getJSON(`/api/v1/weather/summary/${encodeURIComponent(id)}?days=30`), enabled: !!id, retry: 0 });
const useObs = (id) => useQuery({ queryKey: ["wx-obs", id], queryFn: () => getJSON(`/api/v1/weather?farm_id=${encodeURIComponent(id)}&days=60`), enabled: !!id, retry: 0 });
const useCrops = (id) => useQuery({ queryKey: ["wx-crops", id], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useFlocks = (id) => useQuery({ queryKey: ["wx-flocks", id], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(id)}&is_active=true`), enabled: !!id, retry: 0 });

// ── guidance from latest observation × real enterprises ──────────────
function cropGuide(o) {
  if (!o) return null;
  return num(o.rainfall_mm) >= WET_MM ? "Heavy rain — hold spraying (wash-off), secure drainage, hold harvest on wet beds." : "Dry enough to spray and harvest. Good window.";
}
function animalGuide(name, o) {
  if (!o) return null;
  const n = String(name || "").toLowerCase();
  const wet = num(o.rainfall_mm) >= WET_MM, humid = num(o.humidity_pct) >= HUMID, windy = num(o.wind_speed_kmh) >= WINDY_KMH;
  if (/goat|sheep/.test(n)) return wet ? "Move to dry shelter — wet ground raises foot and parasite risk." : "Comfortable. Keep shelter dry and clean.";
  if (/hen|broiler|poultry|chick|layer/.test(n)) return (humid || windy) ? "High humidity/wind — watch heat stress. Ventilate coops, cool water; secure against wind." : "Comfortable. Keep water topped up.";
  if (/pig/.test(n)) return wet ? "Check pen drainage — standing water causes disease." : humid ? "Provide shade and a wallow to cool down." : "Comfortable.";
  if (/cattle|cow|beef/.test(n)) return wet ? "Move to higher, firmer ground; ensure clean water." : "Comfortable on pasture.";
  if (/bee|hive/.test(n)) return (wet || windy) ? "Secure hives against wind; hold inspections until it clears." : "Good flying weather — inspections fine.";
  return wet ? "Provide dry shelter and clean water." : "Comfortable.";
}

// ── atoms ────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, meta, link, onLink, children, pending }) {
  return (
    <section className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}>{Icon && <Icon size={14} />}{title}{pending && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>feed pending</span>}</h3>
        {link ? <button onClick={onLink} className={`text-xs ${FOCUS}`} style={{ color: C.greenDk }}>{link}</button> : meta ? <span className="text-[11px]" style={{ color: C.muted }}>{meta}</span> : null}
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}
function Tile({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border p-3 min-w-0" style={{ background: "white", borderColor: C.border }}>
      <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-bold truncate" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px] truncate" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block"><span className="text-[11px] font-medium" style={{ color: C.soil }}>{label}</span>{children}</label>;
}

// ── log-weather modal (real POST) ────────────────────────────────────
function LogWeatherModal({ open, onClose, farmId, onLogged }) {
  const [f, setF] = useState({ observation_date: todayStr(), rainfall_mm: "", temp_min_c: "", temp_max_c: "", humidity_pct: "", wind_speed_kmh: "", wind_direction: "", cloud_cover: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = `mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`;
  const inpStyle = { border: `1px solid ${C.border}`, background: C.paper, color: C.soil };
  const submit = async () => {
    if (!f.observation_date) { emitToast("Pick the observation date"); return; }
    setBusy(true);
    try {
      const tmin = num(f.temp_min_c), tmax = num(f.temp_max_c);
      const body = {
        farm_id: farmId, observation_date: f.observation_date,
        rainfall_mm: num(f.rainfall_mm), temp_min_c: tmin, temp_max_c: tmax,
        temp_avg_c: tmin != null && tmax != null ? (tmin + tmax) / 2 : null,
        humidity_pct: num(f.humidity_pct), wind_speed_kmh: num(f.wind_speed_kmh),
        wind_direction: f.wind_direction || null, cloud_cover: f.cloud_cover || null,
        notes: f.notes || null, idempotency_key: `wx-${farmId}-${f.observation_date}-${Date.now()}`,
      };
      await postJSON(`/api/v1/weather`, body);
      emitToast("Weather logged");
      onLogged(); onClose();
    } catch { emitToast("Couldn't log weather — try again"); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Log today's weather" size="md">
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Date"><input type="date" value={f.observation_date} onChange={set("observation_date")} className={inp} style={inpStyle} /></Field>
        <Field label="Rainfall (mm)"><input type="number" inputMode="decimal" value={f.rainfall_mm} onChange={set("rainfall_mm")} className={inp} style={inpStyle} placeholder="0" /></Field>
        <Field label="Temp min (°C)"><input type="number" inputMode="decimal" value={f.temp_min_c} onChange={set("temp_min_c")} className={inp} style={inpStyle} /></Field>
        <Field label="Temp max (°C)"><input type="number" inputMode="decimal" value={f.temp_max_c} onChange={set("temp_max_c")} className={inp} style={inpStyle} /></Field>
        <Field label="Humidity (%)"><input type="number" inputMode="decimal" value={f.humidity_pct} onChange={set("humidity_pct")} className={inp} style={inpStyle} /></Field>
        <Field label="Wind (km/h)"><input type="number" inputMode="decimal" value={f.wind_speed_kmh} onChange={set("wind_speed_kmh")} className={inp} style={inpStyle} /></Field>
        <Field label="Wind direction"><select value={f.wind_direction} onChange={set("wind_direction")} className={inp} style={inpStyle}><option value="">—</option>{["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label="Cloud cover"><select value={f.cloud_cover} onChange={set("cloud_cover")} className={inp} style={inpStyle}><option value="">—</option>{["CLEAR", "PARTLY_CLOUDY", "OVERCAST"].map((d) => <option key={d} value={d}>{d.replace("_", " ").toLowerCase()}</option>)}</select></Field>
        <div className="col-span-2"><Field label="Note (optional)"><input value={f.notes} onChange={set("notes")} className={inp} style={inpStyle} placeholder="e.g. storm in the afternoon" /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={`text-sm px-3 py-2 rounded-lg ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>Cancel</button>
        <button onClick={submit} disabled={busy} className={`text-sm px-4 py-2 rounded-lg text-white disabled:opacity-50 ${FOCUS}`} style={{ background: C.greenDk }}>{busy ? "Logging…" : "Log weather"}</button>
      </div>
    </Modal>
  );
}

function WeatherInner() {
  const { farmId } = useCurrentFarm();
  const qc = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);

  const summary = useSummary(farmId);
  const obs = useObs(farmId);
  const crops = useCrops(farmId);
  const flocks = useFlocks(farmId);

  const sum = summary.data?.data || null;
  const obsRows = useMemo(() => (obs.data?.data ?? []).slice().sort((a, b) => dOf(b.observation_date).localeCompare(dOf(a.observation_date))), [obs.data]);
  const latest = obsRows[0] || null;
  const loggedToday = obsRows.some((o) => dOf(o.observation_date) === todayStr());
  const cropRows = crops.data?.data ?? [];
  const flockRows = flocks.data?.data?.items ?? [];

  const onLogged = () => { ["wx-sum", "wx-obs"].forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] })); };
  const loading = summary.isLoading || obs.isLoading;
  const allErr = summary.isError && obs.isError;

  const has = (v) => v != null && v !== "";
  const cg = cropGuide(latest);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Weather</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Every weather decision in one place · crops + animals · {farmId || "your farm"}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FarmSelector /><ModeDropdown />
          <button onClick={() => setLogOpen(true)} className={`text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Log today's weather</button>
        </div>
      </div>

      {!loggedToday && !loading && (
        <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenTint, borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.greenDk }}><strong>Log today's weather — takes 10 seconds.</strong> The more days you log, the better your year-over-year picture becomes.</div>
          <button onClick={() => setLogOpen(true)} className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}><Plus size={12} />Log now</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="rounded-2xl border p-4" style={{ borderColor: C.border }}><div className="rounded animate-pulse" style={{ height: 48, background: C.cream }} /></div>)}</div>
      ) : (
        <>
          {/* 1. summary (LIVE) */}
          <Section icon={Activity} title="Your weather — last 30 days" meta="from your logged observations">
            {allErr ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}><AlertTriangle size={15} style={{ color: C.amber }} />Couldn't load — <button onClick={() => { summary.refetch(); obs.refetch(); }} className={`underline ${FOCUS}`} style={{ color: C.greenDk }}>retry</button></div>
            ) : (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <Tile label="Total rainfall" value={has(sum?.total_rainfall_mm) ? `${Math.round(Number(sum.total_rainfall_mm))} mm` : "—"} sub="last 30 days" color={C.greenDk} />
                <Tile label="Avg temp" value={has(sum?.avg_temp_c) ? `${sum.avg_temp_c}°C` : "—"} sub="daily average" />
                <Tile label="Max temp" value={has(sum?.max_temp_c) ? `${sum.max_temp_c}°C` : "—"} sub="hottest day" color={C.amber} />
                <Tile label="Min temp" value={has(sum?.min_temp_c) ? `${sum.min_temp_c}°C` : "—"} sub="coolest day" />
                <Tile label="Avg humidity" value={has(sum?.avg_humidity_pct) ? `${sum.avg_humidity_pct}%` : "—"} sub="daily average" />
              </div>
            )}
            {!allErr && !sum?.total_rainfall_mm && obsRows.length === 0 && (
              <div className="text-xs mt-2" style={{ color: C.muted }}>No weather logged yet. Tap “Log today's weather” to start your record.</div>
            )}
          </Section>

          {/* 2. 7-day forecast + now (HONEST feed-pending) */}
          <Section icon={CloudSun} title="7-day forecast & now" pending>
            <div className="rounded-xl p-3" style={{ background: C.paper, border: `1px dashed ${C.border}` }}>
              <div className="text-sm" style={{ color: C.soil }}>The external forecast feed (MetService Fiji) isn't connected yet — so TFOS won't show a 7-day forecast it can't stand behind.</div>
              {latest ? (
                <div className="text-xs mt-2" style={{ color: C.muted }}>Last recorded ({fmtDate(latest.observation_date)}): {has(latest.rainfall_mm) ? `${latest.rainfall_mm} mm` : "—"} rain · {has(latest.humidity_pct) ? `${latest.humidity_pct}% humidity` : "—"} · {has(latest.wind_speed_kmh) ? `${latest.wind_speed_kmh} km/h${latest.wind_direction ? ` ${latest.wind_direction}` : ""}` : "—"} wind.</div>
              ) : <div className="text-xs mt-2" style={{ color: C.muted }}>Log a few days and your recent conditions show here.</div>}
            </div>
          </Section>

          {/* 3. cyclone watch (HONEST feed-pending) */}
          <Section icon={ShieldAlert} title="Cyclone watch" pending>
            <div className="text-sm" style={{ color: C.muted }}>Cyclone alerts (NIWA / Fiji Met) activate once the forecast feed is connected. For animals: this is when you'd move stock to high ground and secure shelters.</div>
          </Section>

          {/* 4. what today's weather means for your businesses (LIVE) */}
          <Section icon={Activity} title="What your latest weather means for your businesses" meta={latest ? `based on ${fmtDate(latest.observation_date)}` : ""}>
            {!latest ? (
              <div className="text-sm" style={{ color: C.muted }}>Log today's weather to see tailored guidance for each crop and animal you run.</div>
            ) : (cropRows.length === 0 && flockRows.length === 0) ? (
              <div className="text-sm" style={{ color: C.muted }}>Add an enterprise and your per-business weather guidance appears here.</div>
            ) : (
              <div className="space-y-2">
                {cropRows.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Crops</div>}
                {cropRows.map((r) => (
                  <div key={`c-${r.production_id || r.production_name}`} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                    <Sprout size={14} style={{ color: C.green, marginTop: 2 }} />
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold" style={{ color: C.soil }}>{r.production_name}</div><div className="text-xs" style={{ color: C.muted }}>{cg}</div></div>
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: num(latest.rainfall_mm) >= WET_MM ? C.red : C.green }} />
                  </div>
                ))}
                {flockRows.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide pt-2" style={{ color: C.muted }}>Animals</div>}
                {flockRows.map((fl, i) => {
                  const g = animalGuide(fl.flock_label || fl.flock_type, latest);
                  const warn = /move|drainage|stress|secure|shade/i.test(g || "");
                  return (
                    <div key={`a-${fl.flock_id || i}`} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                      <Bird size={14} style={{ color: C.amber, marginTop: 2 }} />
                      <div className="flex-1 min-w-0"><div className="text-sm font-semibold" style={{ color: C.soil }}>{fl.flock_label || fl.flock_type}</div><div className="text-xs" style={{ color: C.muted }}>{g}</div></div>
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: warn ? C.amber : C.green }} />
                    </div>
                  );
                })}
                <div className="text-[11px] pt-1" style={{ color: C.muted }}>Good-practice guidance from your latest logged observation and your real businesses. Not a substitute for your own judgement.</div>
              </div>
            )}
          </Section>

          {/* 5. recent observations (LIVE) */}
          <Section icon={CloudRain} title="Recent observations" meta={`${obsRows.length} logged`}>
            {obsRows.length === 0 ? (
              <div className="text-sm" style={{ color: C.muted }}>Nothing logged yet — your daily weather record builds here.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-2">Date</th><th className="text-right p-2"><Droplets size={12} className="inline" /> Rain</th><th className="text-right p-2"><Thermometer size={12} className="inline" /> Temp</th><th className="text-right p-2">Humidity</th><th className="text-right p-2"><Wind size={12} className="inline" /> Wind</th></tr></thead>
                  <tbody>
                    {obsRows.slice(0, 30).map((o, i) => (
                      <tr key={o.weather_id || i} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                        <td className="p-2" style={{ color: C.soil }}>{fmtDate(o.observation_date)}</td>
                        <td className="p-2 text-right">{has(o.rainfall_mm) ? `${o.rainfall_mm} mm` : "—"}</td>
                        <td className="p-2 text-right">{has(o.temp_avg_c) ? `${o.temp_avg_c}°C` : has(o.temp_min_c) || has(o.temp_max_c) ? `${o.temp_min_c ?? "—"}–${o.temp_max_c ?? "—"}°C` : "—"}</td>
                        <td className="p-2 text-right">{has(o.humidity_pct) ? `${o.humidity_pct}%` : "—"}</td>
                        <td className="p-2 text-right">{has(o.wind_speed_kmh) ? `${o.wind_speed_kmh} km/h${o.wind_direction ? ` ${o.wind_direction}` : ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 6. disease pressure + crop windows (HONEST feed-pending) */}
          <Section icon={ShieldAlert} title="Disease pressure & crop windows" pending>
            <div className="text-sm" style={{ color: C.muted }}>Disease-pressure forecasts and spray/harvest/plant windows need the external forecast feed plus each crop's growth model. They turn on once the feed is connected — TFOS won't guess them.</div>
          </Section>

          {/* 7. year over year (HONEST) */}
          <Section icon={CalendarClock} title="Last year vs this year">
            <div className="text-sm" style={{ color: C.muted }}>This needs a year of your own logged weather to show honestly. Keep logging daily and it fills in — computed from your logged observations.</div>
          </Section>
        </>
      )}

      <LogWeatherModal open={logOpen} onClose={() => setLogOpen(false)} farmId={farmId} onLogged={onLogged} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function WeatherPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <WeatherInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

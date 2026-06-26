/**
 * WeatherPage.jsx — /farm/weather
 *
 * Redesigned 2026-06-26 (audit-approved). Feed-primary, decision-first, honest.
 * The 3-hourly Open-Meteo/GDACS worker is the primary source; manual logging is
 * an optional ground-reading correction (WX1). Never fabricates a forecast.
 *
 * Fixes: W1 (api.js token-refresh + error≠no-coords messaging); W2 (Fiji time);
 * W3 (one shared crop card, not faux per-crop); W4 (one "this week" block — outlook
 * + windows + disease, was 3 sections); W5 (ModeDropdown removed); W6/W8 (reconnect
 * refetch + summary/obs deferred until history opened → 8→6 initial calls); WX1
 * (guidance from the live feed; one-tap log prefilled from the now-reading; manual
 * log demoted); WX2 (spray window gated on WIND, not just rain); WX4 (staleness
 * surfaced); WX5 (cyclone leads when active + "Add prep task" weather→task bridge);
 * W7 (progressive disclosure); a11y (aria-hidden, reduced-motion); more AI (Ask AI).
 *
 * Filed: reconcile feed↔observations data layer; push alerts; GDD/ET + crop-specific
 * disease (KB); per-block microclimate; insurance/loss export; regional aggregate;
 * thresholds→config; composite endpoint + shared QueryClient; voice/i18n.
 */
import { useMemo, useState, useEffect } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CloudRain, Wind, Droplets, Thermometer, Plus, ShieldAlert, Sprout, Bird, Sparkles,
  AlertTriangle, Activity, CalendarClock, Sun, Cloud, CloudSun, CloudLightning, CloudSnow, CloudFog,
  ChevronDown, MapPin, WifiOff,
} from "lucide-react";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import Modal from "../../components/ui/Modal";
import { getJSON, send } from "../../utils/api";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] motion-reduce:transition-none";
const WET_MM = 10, HUMID = 80, WINDY_KMH = 25;
const PULSE = "animate-pulse motion-reduce:animate-none";

function num(v) { return v == null || v === "" ? null : Number(v); }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function fijiToday() { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } catch { return new Date().toISOString().slice(0, 10); } }
function dOf(s) { return String(s || "").slice(0, 10); }
const round1 = (v) => (v == null || v === "" ? null : Math.round(Number(v) * 10) / 10);
const has = (v) => v != null && v !== "";
function fmtDate(s) { try { const d = new Date(dOf(s) + "T00:00:00"); if (!isNaN(d)) return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }); } catch { /* noop */ } return dOf(s); }
function fmtDay(s) { try { const d = new Date(dOf(s) + "T00:00:00"); if (!isNaN(d)) return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }); } catch { /* noop */ } return dOf(s); }
function fmtTime(s) { try { const d = new Date(s); if (!isNaN(d)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { /* noop */ } return String(s || "").slice(11, 16); }
function ageHours(s) { if (!s) return null; const d = new Date(s); if (isNaN(d)) return null; return (Date.now() - d.getTime()) / 3.6e6; }
function asOf(s) { if (!s) return ""; const a = ageHours(s); const stale = a != null && a > 4; try { const d = new Date(s); return `${stale ? "may be stale · " : ""}as of ${d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`; } catch { return ""; } }
function wmo(code) {
  const c = Number(code);
  if (c === 0) return { label: "Clear", Icon: Sun };
  if (c <= 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (c === 3) return { label: "Overcast", Icon: Cloud };
  if (c >= 45 && c <= 48) return { label: "Fog", Icon: CloudFog };
  if (c >= 51 && c <= 57) return { label: "Drizzle", Icon: CloudRain };
  if (c >= 61 && c <= 67) return { label: "Rain", Icon: CloudRain };
  if (c >= 71 && c <= 77) return { label: "Snow", Icon: CloudSnow };
  if (c >= 80 && c <= 82) return { label: "Rain showers", Icon: CloudRain };
  if (c >= 95) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "—", Icon: Cloud };
}

// guidance from a unified signal (live feed preferred, else latest manual obs)
function cropGuide(sig) {
  if (!sig) return null;
  return sig.rain >= WET_MM ? "Heavy rain — hold spraying (wash-off), secure drainage, hold harvest on wet beds." : sig.wind >= WINDY_KMH ? "Windy — hold spraying (drift). Dry enough to harvest." : "Dry and calm — good window to spray and harvest.";
}
function animalGuide(name, sig) {
  if (!sig) return null;
  const n = String(name || "").toLowerCase();
  const wet = sig.rain >= WET_MM, humid = sig.humid >= HUMID, windy = sig.wind >= WINDY_KMH;
  if (/goat|sheep/.test(n)) return wet ? "Move to dry shelter — wet ground raises foot & parasite risk." : "Comfortable. Keep shelter dry and clean.";
  if (/hen|broiler|poultry|chick|layer/.test(n)) return (humid || windy) ? "High humidity/wind — watch heat stress. Ventilate coops, cool water; secure against wind." : "Comfortable. Keep water topped up.";
  if (/pig/.test(n)) return wet ? "Check pen drainage — standing water causes disease." : humid ? "Provide shade and a wallow to cool down." : "Comfortable.";
  if (/cattle|cow|beef/.test(n)) return wet ? "Move to higher, firmer ground; ensure clean water." : "Comfortable on pasture.";
  if (/bee|hive/.test(n)) return (wet || windy) ? "Secure hives against wind; hold inspections until it clears." : "Good flying weather — inspections fine.";
  return wet ? "Provide dry shelter and clean water." : "Comfortable.";
}

function Section({ icon: Icon, title, meta, children }) {
  return (
    <section className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.soil }}>{Icon && <Icon size={14} aria-hidden="true" />}{title}</h3>
        {meta ? <span className="text-[11px]" style={{ color: C.muted }}>{meta}</span> : null}
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}
function Field({ label, children }) {
  return <label className="block"><span className="text-[11px] font-medium" style={{ color: C.soil }}>{label}</span>{children}</label>;
}

function LogWeatherModal({ open, onClose, farmId, prefill, onLogged }) {
  const blank = { observation_date: fijiToday(), rainfall_mm: "", temp_min_c: "", temp_max_c: "", humidity_pct: "", wind_speed_kmh: "", wind_direction: "", cloud_cover: "", notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  // re-seed from the live reading each time it opens (one-tap log — WX1)
  useEffect(() => { if (open) setF({ ...blank, ...(prefill || {}) }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = `mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm ${FOCUS}`;
  const inpStyle = { border: `1px solid ${C.border}`, background: C.paper, color: C.soil };
  const submit = async () => {
    if (!f.observation_date) { emitToast("Pick the observation date"); return; }
    setBusy(true);
    try {
      const tmin = num(f.temp_min_c), tmax = num(f.temp_max_c);
      await send("POST", `/api/v1/weather`, {
        farm_id: farmId, observation_date: f.observation_date,
        rainfall_mm: num(f.rainfall_mm), temp_min_c: tmin, temp_max_c: tmax,
        temp_avg_c: tmin != null && tmax != null ? (tmin + tmax) / 2 : null,
        humidity_pct: num(f.humidity_pct), wind_speed_kmh: num(f.wind_speed_kmh),
        wind_direction: f.wind_direction || null, cloud_cover: f.cloud_cover || null,
        notes: f.notes || null, idempotency_key: `wx-${farmId}-${f.observation_date}-${Date.now()}`,
      });
      emitToast("Ground reading logged"); onLogged(); onClose();
    } catch (e) { emitToast(e?.userMessage || "Couldn't log — try again"); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Log a ground reading" size="md">
      <div className="text-[12px] mb-2" style={{ color: C.muted }}>Live weather is fetched automatically. Use this to record what you saw on the ground (e.g. your rain-gauge) or correct the feed.</div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Date"><input type="date" value={f.observation_date} onChange={set("observation_date")} className={inp} style={inpStyle} /></Field>
        <Field label="Rainfall (mm)"><input type="number" inputMode="decimal" value={f.rainfall_mm} onChange={set("rainfall_mm")} className={inp} style={inpStyle} placeholder="0" /></Field>
        <Field label="Temp min (°C)"><input type="number" inputMode="decimal" value={f.temp_min_c} onChange={set("temp_min_c")} className={inp} style={inpStyle} /></Field>
        <Field label="Temp max (°C)"><input type="number" inputMode="decimal" value={f.temp_max_c} onChange={set("temp_max_c")} className={inp} style={inpStyle} /></Field>
        <Field label="Humidity (%)"><input type="number" inputMode="decimal" value={f.humidity_pct} onChange={set("humidity_pct")} className={inp} style={inpStyle} /></Field>
        <Field label="Wind (km/h)"><input type="number" inputMode="decimal" value={f.wind_speed_kmh} onChange={set("wind_speed_kmh")} className={inp} style={inpStyle} /></Field>
        <div className="col-span-2"><Field label="Note (optional)"><input value={f.notes} onChange={set("notes")} className={inp} style={inpStyle} placeholder="e.g. storm in the afternoon" /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={`text-sm px-3 py-2 rounded-lg ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>Cancel</button>
        <button onClick={submit} disabled={busy} className={`text-sm px-4 py-2 rounded-lg text-white disabled:opacity-50 ${FOCUS}`} style={{ background: C.greenDk }}>{busy ? "Logging…" : "Log reading"}</button>
      </div>
    </Modal>
  );
}

function WeatherInner() {
  const { farmId } = useCurrentFarm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [logOpen, setLogOpen] = useState(false);
  const [logPrefill, setLogPrefill] = useState(null);
  const [histOpen, setHistOpen] = useState(false);

  const q = (key, url, enabled = true) => useQuery({ queryKey: key, queryFn: () => getJSON(url), enabled: !!farmId && enabled });
  const current = q(["wx-cur", farmId], `/api/v1/weather/current/${encodeURIComponent(farmId)}`);
  const daily = q(["wx-fc", farmId, "daily"], `/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`);
  const hourly = q(["wx-fc", farmId, "hourly"], `/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=hourly`);
  const cyclone = q(["wx-cyc", farmId], `/api/v1/weather/cyclone/${encodeURIComponent(farmId)}`);
  const crops = q(["wx-crops", farmId], `/api/v1/financials/crops/${encodeURIComponent(farmId)}`);
  const flocks = q(["wx-flocks", farmId], `/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`);
  // history: deferred until opened (W8 — saves 2 calls on first paint)
  const summary = q(["wx-sum", farmId], `/api/v1/weather/summary/${encodeURIComponent(farmId)}?days=30`, histOpen);
  const obs = q(["wx-obs", farmId], `/api/v1/weather?farm_id=${encodeURIComponent(farmId)}&days=60`, histOpen);

  const cur = current.data?.data || null;
  const dailyRows = daily.data?.data ?? [];
  const hourlyRows = hourly.data?.data ?? [];
  const cropRows = crops.data?.data ?? [];
  const flockRows = flocks.data?.data?.items ?? [];
  const cyc = cyclone.data?.data || null;

  // unified "today" signal: live feed preferred, else latest manual observation (WX1)
  const obsRows = useMemo(() => (obs.data?.data ?? []).slice().sort((a, b) => dOf(b.observation_date).localeCompare(dOf(a.observation_date))), [obs.data]);
  const latest = obsRows[0] || null;
  const sig = cur
    ? { rain: num(cur.precip_mm) ?? 0, humid: num(cur.humidity_pct) ?? 0, wind: num(cur.wind_kmh) ?? 0 }
    : latest ? { rain: num(latest.rainfall_mm) ?? 0, humid: num(latest.humidity_pct) ?? 0, wind: num(latest.wind_speed_kmh) ?? 0 } : null;

  const onLogged = () => { ["wx-sum", "wx-obs"].forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] })); };
  const openLogFromNow = () => {
    setLogPrefill(cur ? { rainfall_mm: round1(cur.precip_mm) ?? "", humidity_pct: round1(cur.humidity_pct) ?? "", wind_speed_kmh: round1(cur.wind_kmh) ?? "", wind_direction: cur.wind_dir || "" } : null);
    setLogOpen(true);
  };
  const askAi = () => navigate(`/tis?q=${encodeURIComponent("Give me a weather brief and what to do on my farm this week.")}`);
  const addCyclonePrep = async () => {
    if (!farmId) { emitToast("Select a farm first"); return; }
    try { await send("POST", `/api/v1/tasks/manual`, { farm_id: farmId, imperative: `Cyclone prep — secure shelters & move stock${cyc?.name ? ` (${cyc.name})` : ""}` }); emitToast("Prep task added to your Tasks"); }
    catch (e) { emitToast(e?.userMessage || "Couldn't add the task"); }
  };

  const w = cur ? wmo(cur.weather_code) : null;
  const noFeedError = current.isError;
  const cg = cropGuide(sig);

  return (
    <div className="tfp space-y-3 w-full max-w-4xl mx-auto">
      <div className="page-header">
        <div><h1>Weather</h1><div className="subtitle">Live conditions + your decisions for the week · {farmId || "your farm"}</div></div>
        <div className="page-actions">
          <FarmSelector />
          <button onClick={askAi} className={`btn ${FOCUS}`} style={{ border: `1px solid ${C.border}`, background: "white", color: C.greenDk }}><Sparkles size={14} aria-hidden="true" />Ask AI</button>
          <button onClick={openLogFromNow} className="btn btn-primary"><Plus size={14} aria-hidden="true" />Log</button>
        </div>
      </div>

      {/* CYCLONE — leads when active (WX5) */}
      {cyc?.active && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(212,68,46,0.07)", border: `1px solid ${C.red}` }} role="alert">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={20} style={{ color: C.red, marginTop: 1 }} aria-hidden="true" />
              <div>
                <div className="text-sm font-extrabold" style={{ color: C.red }}>{cyc.name}{cyc.category != null ? ` · Cat ${cyc.category}` : ""}{cyc.km_away != null ? ` · ${cyc.km_away} km away` : ""}</div>
                <div className="text-sm mt-0.5" style={{ color: C.soil }}>{cyc.advisory}</div>
                <div className="text-[10px] mt-1" style={{ color: C.muted }}>GDACS · RSMC Nadi {cyc.fetched_at ? `· ${asOf(cyc.fetched_at)}` : ""}</div>
              </div>
            </div>
            <button onClick={addCyclonePrep} className={`text-sm px-3 py-2 rounded-lg text-white font-semibold ${FOCUS}`} style={{ background: C.red }}>Add prep task</button>
          </div>
        </div>
      )}

      {/* NOW — live feed hero (WX1/WX4/W1) */}
      <Section icon={w ? w.Icon : CloudSun} title="Now" meta={cur ? asOf(cur.fetched_at) : ""}>
        {current.isLoading ? (
          <div className={`rounded-xl ${PULSE}`} style={{ height: 56, background: C.cream }} />
        ) : cur ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <w.Icon size={34} style={{ color: C.greenDk }} aria-hidden="true" />
              <div><div className="text-3xl font-bold" style={{ color: C.soil }}>{has(cur.temp_c) ? `${round1(cur.temp_c)}°C` : "—"}</div><div className="text-xs" style={{ color: C.muted }}>{w.label}</div></div>
            </div>
            <div className="flex gap-4 flex-wrap text-sm">
              <span className="flex items-center gap-1" style={{ color: C.soil }}><Droplets size={14} style={{ color: C.greenDk }} aria-hidden="true" />{has(cur.precip_mm) ? `${round1(cur.precip_mm)} mm` : "—"}</span>
              <span className="flex items-center gap-1" style={{ color: C.soil }}><Activity size={14} style={{ color: C.greenDk }} aria-hidden="true" />{has(cur.humidity_pct) ? `${round1(cur.humidity_pct)}%` : "—"}</span>
              <span className="flex items-center gap-1" style={{ color: C.soil }}><Wind size={14} style={{ color: C.greenDk }} aria-hidden="true" />{has(cur.wind_kmh) ? `${round1(cur.wind_kmh)} km/h${cur.wind_dir ? ` ${cur.wind_dir}` : ""}` : "—"}</span>
            </div>
            <button onClick={openLogFromNow} className={`ml-auto text-[12px] px-3 py-1.5 rounded-lg font-semibold ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Log a ground reading</button>
          </div>
        ) : noFeedError ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}><WifiOff size={15} style={{ color: C.amber }} aria-hidden="true" />Couldn't load live weather. <button onClick={() => { current.refetch(); daily.refetch(); }} className={`underline ${FOCUS}`} style={{ color: C.greenDk }}>Retry</button></div>
        ) : (
          <div className="text-sm" style={{ color: C.muted }}>
            Live conditions update automatically every 3 hours. If this stays empty, your farm may need its map location set.
            <button onClick={() => navigate("/farm/resources?tab=locations")} className={`ml-1 underline ${FOCUS}`} style={{ color: C.greenDk }}><MapPin size={12} className="inline" aria-hidden="true" /> Set farm location</button>
          </div>
        )}
      </Section>

      {/* THIS WEEK — outlook + windows + disease (consolidated, W4 / WX2) */}
      {(() => {
        if (daily.isLoading) return <Section icon={CloudSun} title="This week"><div className={`rounded-xl ${PULSE}`} style={{ height: 84, background: C.cream }} /></Section>;
        if (dailyRows.length === 0) return <Section icon={CloudSun} title="This week"><div className="text-sm" style={{ color: C.muted }}>The 7-day outlook appears here once the weather feed runs for this farm.</div></Section>;
        const wet = dailyRows.slice(0, 3).find((d) => Number(d.precip_prob_pct) >= 60 || Number(d.precip_mm) >= 25);
        const dry48 = dailyRows.slice(0, 2).every((d) => Number(d.precip_prob_pct || 0) < 40 && Number(d.precip_mm || 0) < 5);
        const wetDays = dailyRows.filter((d) => (Number(d.precip_mm) || 0) >= 5 || (Number(d.precip_prob_pct) || 0) >= 60).length;
        const humid = (num(cur?.humidity_pct) ?? (hourlyRows.length ? hourlyRows.reduce((a, h) => a + (Number(h.humidity_pct) || 0), 0) / hourlyRows.length : 0)) >= 80;
        const level = (wetDays >= 4 && humid) ? "HIGH" : (wetDays >= 2 || humid) ? "ELEVATED" : "LOW";
        const lvlCol = level === "HIGH" ? C.red : level === "ELEVATED" ? C.amber : C.greenDk;
        const chip = (label, c) => <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block" style={{ color: c, border: `1px solid ${C.border}` }}>{label}</span>;
        return (
          <Section icon={CalendarClock} title="This week — outlook & windows" meta="Open-Meteo">
            {wet ? (
              <div className="rounded-xl border p-3 flex items-start gap-2.5 mb-3" style={{ background: "#FEF6E6", borderColor: "var(--amber)" }}>
                <AlertTriangle size={18} style={{ color: "var(--amber)", marginTop: 1 }} aria-hidden="true" />
                <div><div className="text-sm font-semibold" style={{ color: C.soil }}>Heavy rain likely {fmtDay(wet.valid_at)}{has(wet.precip_mm) ? ` — ${round1(wet.precip_mm)} mm` : ""}{has(wet.precip_prob_pct) ? ` · ${wet.precip_prob_pct}%` : ""}</div><div className="text-[11px]" style={{ color: C.muted }}>Prepare drainage and hold spraying.</div></div>
              </div>
            ) : dry48 ? (
              <div className="rounded-xl border p-3 flex items-start gap-2.5 mb-3" style={{ background: C.greenTint, borderColor: C.border }}>
                <Sun size={18} style={{ color: "var(--amber)", marginTop: 1 }} aria-hidden="true" />
                <div><div className="text-sm font-semibold" style={{ color: C.greenDk }}>Good window for spraying & field work</div><div className="text-[11px]" style={{ color: C.muted }}>Rain unlikely in the next 48 hours.</div></div>
              </div>
            ) : null}
            <div className="grid gap-2 grid-cols-4 sm:grid-cols-7 mb-3">
              {dailyRows.map((d, i) => { const dw = wmo(d.weather_code); return (
                <div key={i} className="rounded-xl border p-2 text-center" style={{ background: "var(--paper)", borderColor: C.border }}>
                  <div className="text-[11px] font-semibold" style={{ color: C.soil }}>{fmtDay(d.valid_at)}</div>
                  <dw.Icon size={18} style={{ color: C.greenDk, margin: "4px auto" }} aria-hidden="true" />
                  <div className="text-sm font-bold" style={{ color: C.soil }}>{has(d.temp_max_c) ? `${round1(d.temp_max_c)}°` : "—"}<span className="text-[11px] font-normal" style={{ color: C.muted }}>{has(d.temp_min_c) ? `/${round1(d.temp_min_c)}°` : ""}</span></div>
                  <div className="text-[10px] flex items-center justify-center gap-0.5" style={{ color: C.muted }}><Droplets size={9} aria-hidden="true" />{has(d.precip_mm) ? `${round1(d.precip_mm)}mm` : "—"}</div>
                </div>
              ); })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-1.5">Day</th><th className="text-left p-1.5">Spray</th><th className="text-left p-1.5">Harvest</th><th className="text-left p-1.5">Plant</th></tr></thead>
                <tbody>
                  {dailyRows.map((d, i) => {
                    const p = Number(d.precip_mm) || 0, pr = Number(d.precip_prob_pct) || 0, wind = Number(d.wind_kmh) || 0;
                    const sprayHold = p >= 2 || pr >= 50 || wind >= WINDY_KMH; // WX2: wind-gated
                    return (
                      <tr key={i} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                        <td className="p-1.5" style={{ color: C.soil }}>{fmtDay(d.valid_at)}{wind >= WINDY_KMH && p < 2 && pr < 50 ? <span className="text-[10px]" style={{ color: C.muted }}> · windy</span> : ""}</td>
                        <td className="p-1.5">{sprayHold ? chip("HOLD", C.amber) : chip("OK", C.greenDk)}</td>
                        <td className="p-1.5">{p >= 5 ? chip("HOLD", C.amber) : chip("OK", C.greenDk)}</td>
                        <td className="p-1.5">{p >= 15 ? chip("WAIT", C.muted) : chip("GO", C.greenDk)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-sm mt-3" style={{ color: lvlCol, fontWeight: 700 }}>Fungal-disease pressure: {level}</div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{wetDays} of the next 7 days are wet{humid ? " & humid" : ""}. Spray HOLD includes windy days (drift). Weather-operational guidance — not crop-specific agronomy; ask AI for treatment.</div>
          </Section>
        );
      })()}

      {/* NEXT 48H — compact hourly strip */}
      {hourlyRows.length > 0 && (
        <Section icon={CalendarClock} title="Next 48 hours" meta="Open-Meteo">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hourlyRows.map((h, i) => { const hw = wmo(h.weather_code); return (
              <div key={i} className="rounded-xl border p-2.5 text-center shrink-0 min-w-[68px]" style={{ background: "var(--paper)", borderColor: C.border }}>
                <div className="text-[11px]" style={{ color: C.muted }}>{fmtTime(h.valid_at)}</div>
                <hw.Icon size={18} style={{ color: C.greenDk, margin: "4px auto" }} aria-hidden="true" />
                <div className="text-sm font-bold" style={{ color: C.soil }}>{has(h.temp_c) ? `${round1(h.temp_c)}°` : "—"}</div>
                <div className="text-[10px] flex items-center justify-center gap-0.5" style={{ color: C.muted }}><Droplets size={9} aria-hidden="true" />{has(h.precip_prob_pct) ? `${h.precip_prob_pct}%` : "—"}</div>
              </div>
            ); })}
          </div>
        </Section>
      )}

      {/* WHAT THIS WEATHER MEANS — one shared crop card + per-animal (W3) */}
      <Section icon={Activity} title="What this weather means" meta={cur ? "from live conditions" : latest ? `from ${fmtDate(latest.observation_date)}` : ""}>
        {!sig ? (
          <div className="text-sm" style={{ color: C.muted }}>Live conditions or a logged reading will turn on tailored guidance here.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "var(--paper)", border: `1px solid ${C.border}` }}>
              <Sprout size={16} style={{ color: C.green, marginTop: 1 }} aria-hidden="true" />
              <div><div className="text-sm font-semibold" style={{ color: C.soil }}>Crops {cropRows.length ? `(${cropRows.length})` : ""}</div><div className="text-xs" style={{ color: C.muted }}>{cg}</div></div>
            </div>
            {flockRows.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Animals</div>
                {flockRows.map((fl, i) => { const g = animalGuide(fl.flock_label || fl.flock_type, sig); const warn = /move|drainage|stress|secure|shade/i.test(g || ""); return (
                  <div key={fl.flock_id || i} className="flex items-start gap-2.5 py-1" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                    <Bird size={14} style={{ color: C.amber, marginTop: 2 }} aria-hidden="true" />
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold" style={{ color: C.soil }}>{fl.flock_label || fl.flock_type}</div><div className="text-xs" style={{ color: C.muted }}>{g}</div></div>
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: warn ? C.amber : C.green }} aria-hidden="true" />
                  </div>
                ); })}
              </div>
            )}
            <div className="text-[11px]" style={{ color: C.muted }}>Good-practice guidance from current conditions and your real enterprises. Not a substitute for your own judgement.</div>
          </div>
        )}
      </Section>

      {/* cyclone green (compact, when not active) */}
      {cyc && !cyc.active && (
        <div className="rounded-xl border p-2.5 flex items-center gap-2 text-sm" style={{ background: C.greenTint, borderColor: C.border }}>
          <ShieldAlert size={15} style={{ color: C.greenDk }} aria-hidden="true" />
          <span style={{ color: C.greenDk }}><strong>Cyclone watch: GREEN</strong> — {cyc.note || "no active system within 1000 km."}</span>
        </div>
      )}

      {/* HISTORY — demoted, deferred (WX1 / W8) */}
      <div className="rounded-2xl border bg-white" style={{ borderColor: C.border }}>
        <button onClick={() => setHistOpen((v) => !v)} className={`w-full flex items-center justify-between px-4 py-3 ${FOCUS}`} aria-expanded={histOpen}>
          <span className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.soil }}><CloudRain size={14} aria-hidden="true" />Your logged history &amp; ground readings</span>
          <ChevronDown size={16} className="motion-reduce:!transition-none" style={{ color: C.muted, transform: histOpen ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }} aria-hidden="true" />
        </button>
        {histOpen && (
          <div className="px-4 pb-4 space-y-3">
            {(summary.isLoading || obs.isLoading) ? (
              <div className={`rounded-xl ${PULSE}`} style={{ height: 56, background: C.cream }} />
            ) : (summary.isError && obs.isError) ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}><WifiOff size={15} style={{ color: C.amber }} aria-hidden="true" />Couldn't load — <button onClick={() => { summary.refetch(); obs.refetch(); }} className={`underline ${FOCUS}`} style={{ color: C.greenDk }}>retry</button></div>
            ) : (
              <>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  {[["Total rainfall", has(summary.data?.data?.total_rainfall_mm) ? `${Math.round(Number(summary.data.data.total_rainfall_mm))} mm` : "—", "last 30 days"],
                    ["Avg temp", has(summary.data?.data?.avg_temp_c) ? `${summary.data.data.avg_temp_c}°C` : "—", "daily average"],
                    ["Max temp", has(summary.data?.data?.max_temp_c) ? `${summary.data.data.max_temp_c}°C` : "—", "hottest day"],
                    ["Min temp", has(summary.data?.data?.min_temp_c) ? `${summary.data.data.min_temp_c}°C` : "—", "coolest day"],
                    ["Avg humidity", has(summary.data?.data?.avg_humidity_pct) ? `${summary.data.data.avg_humidity_pct}%` : "—", "daily average"]].map(([l, v, s]) => (
                    <div key={l} className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border }}><div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.muted }}>{l}</div><div className="text-lg font-bold truncate" style={{ color: C.soil }}>{v}</div><div className="text-[11px] truncate" style={{ color: C.muted }}>{s}</div></div>
                  ))}
                </div>
                {obsRows.length === 0 ? (
                  <div className="text-xs" style={{ color: C.muted }}>No ground readings logged yet. These build your own on-farm record alongside the live feed.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-2">Date</th><th className="text-right p-2">Rain</th><th className="text-right p-2">Temp</th><th className="text-right p-2">Humidity</th><th className="text-right p-2">Wind</th></tr></thead>
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
                <div className="text-[11px]" style={{ color: C.muted }}>Last-year-vs-this-year fills in after a year of your own logged readings — computed from your records, never invented.</div>
              </>
            )}
          </div>
        )}
      </div>

      <LogWeatherModal open={logOpen} onClose={() => setLogOpen(false)} farmId={farmId} prefill={logPrefill} onLogged={onLogged} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function WeatherPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <WeatherInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

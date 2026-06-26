/**
 * Labor.jsx — /farm/labor (Resources › Labour tab) — audit-approved redesign (2026-06-26).
 *
 * Reproduces the prototype's Labour surface (today/roster/timesheets/payroll/tasks/costing/
 * training/productivity) under <TfpShell>, wired to real data:
 *   Workers  GET/POST /api/v1/workers, PATCH /workers/{id}
 *   Labor    GET/POST /api/v1/labor (labor_attendance)   PATCH /labor/{id}
 *   Clock    POST /api/v1/attendance/clock  ·  on-site GET /api/v1/attendance/on-site  ·  feed GET /api/v1/attendance
 *   Pay wages → POST /api/v1/cash-ledger (EXPENSE · LABOR — feeds Cash + Bank Evidence)
 *
 * Redesign (audit L1–L32, L-BUG1):
 *  · all reads via getJSON / writes via send  → token refresh + humanized errors (L4)
 *  · cached-on-error: never a false "no workers" (L1); removed undefined onSiteIds (L-BUG1)
 *  · removed fabricated "Next payday" tile (L2); Fiji "today" (L5)
 *  · pay defaults to THIS WEEK's logged wages, not all-time (L24); "Wages (logged)" honest (L16)
 *  · one primary action per card; dead "Assign task" removed (L18/L20)
 *  · min-wage soft guard (day-rate ÷ 8 < FJD 4/hr) on Add/Edit/Mark (L30)
 *  · tabs + name are real buttons (L9); page Ask AI (L10); no emoji in toasts (L8)
 * Honest "Building": Costing + Productivity + Training (need work→harvest/cycle attribution).
 * FILED (backend): payroll-period settlement + worker_id FK on payments (L3/L21/L22 keystone),
 *  single labour-cost source (L29), piece-rate (L17), REI clock-in safety (L19), FNPF/DOB (L31).
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pencil, X, MapPin, Sparkles, AlertTriangle } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } // Fiji day (L5)
function fjd0(v) { return formatMoney(v ?? 0, { decimals: 0 }); }
function fjd2(v) { return formatMoney(v ?? 0, { decimals: 2 }); }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?"; }

const MIN_WAGE_HR = 4.0; // Fiji national minimum wage (FJD/hr) — soft guard, not a hard block (L30)
const effHourly = (dayRate) => (Number(dayRate) || 0) / 8;
function MinWageNote({ dayRate, isFamilyType }) {
  if (isFamilyType) return null;
  const h = effHourly(dayRate);
  if (!Number(dayRate) || h >= MIN_WAGE_HR) return null;
  return <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--amber)", marginTop: 6 }}><AlertTriangle size={12} />That's about {fjd2(h)}/hr — below Fiji minimum wage (FJD {MIN_WAGE_HR.toFixed(2)}/hr).</div>;
}

const TYPE_LABEL = { PERMANENT: "Permanent", CASUAL: "Casual", CONTRACT: "Contract", FAMILY: "Family" };
const WORKER_TYPES = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
const VIEWS = [["today", "Today", "Who's working"], ["roster", "People", "Employees"], ["attendance", "Timesheets", "Hours & GPS"], ["payroll", "Payroll", "Wages"], ["tasks", "Tasks", "Assignments"], ["costing", "Costing", "Labour cost"], ["develop", "Training", "Safety records"], ["analytics", "Productivity", "Trends"]];

async function getWorkers(farmId) { return (await getJSON(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`))?.data ?? []; }
async function getLabor(farmId) { return (await getJSON(`/api/v1/labor?farm_id=${encodeURIComponent(farmId)}`))?.data ?? []; }
async function getOnSite(farmId) { return await getJSON(`/api/v1/attendance/on-site?farm_id=${encodeURIComponent(farmId)}`); }
async function getAttendance(farmId) { return (await getJSON(`/api/v1/attendance?farm_id=${encodeURIComponent(farmId)}&limit=100`))?.data ?? []; }

// Device GPS fix for geo-locked clock in/out.
function getGeo() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}
function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

const isFamily = (w) => w.worker_type === "FAMILY";
const tk = (w) => (w.worker_type || "").toLowerCase();

function Snapshot({ label, value, sub, cls }) {
  return <div className={`snapshot-tile ${cls || ""}`}><div className="snapshot-label">{label}</div><div className="snapshot-value">{value}</div><div className="snapshot-sub">{sub}</div></div>;
}
function Building({ title, body }) {
  return <div className="card" style={{ padding: "16px 18px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</span><span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Building</span></div><div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{body}</div></div>;
}
function ErrorCard({ msg, onRetry }) {
  return <div className="card" style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}><div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 10 }}><AlertTriangle size={16} style={{ color: "var(--amber)" }} /><span style={{ fontWeight: 600, color: "var(--soil)" }}>{msg}</span></div><button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>;
}
function DegradedBanner() {
  return <div className="calendar-banner" style={{ background: "#FBF4E6", borderColor: "var(--amber)", color: "var(--soil)" }}><AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Couldn't refresh — showing the last saved data.</div>;
}

function GpsChip({ att }) {
  if (!att) return null;
  if (att.inside_boundary === true) return <span className="gps-chip" style={{ color: "var(--green-dk)" }}><MapPin size={10} />on the farm</span>;
  if (att.inside_boundary === false) return <span className="gps-chip" style={{ color: "var(--amber)" }}><MapPin size={10} />{att.distance_m != null ? `${Math.round(att.distance_m)}m off` : "off-farm"}</span>;
  return <span className="gps-chip"><MapPin size={10} />GPS logged</span>;
}

function TodayWorkerCard({ w, att, clocking, onClock, onPay, onOpen }) {
  const fam = isFamily(w);
  const onSite = att?.on_site;
  return (
    <div className={`today-worker-card ${tk(w)}`}>
      <div className="today-worker-head">
        <button className={`worker-avatar ${tk(w)}`} onClick={() => onOpen(w)} style={{ border: "none", cursor: "pointer" }} aria-label={`Open ${w.full_name}`}>{initials(w.full_name)}</button>
        <div style={{ flex: 1 }}>
          <button className="today-worker-name" style={{ cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit", color: "inherit" }} onClick={() => onOpen(w)}>{w.full_name}</button>
          <div className="today-worker-role"><span className={`worker-type-pill ${tk(w)}`}>{TYPE_LABEL[w.worker_type] || w.worker_type}</span></div>
        </div>
        <span className={`worker-status-pill ${onSite ? "on-site" : "off"}`}><span className="worker-status-dot" />{onSite ? "On-site" : att ? "Off" : "—"}</span>
      </div>
      <div className="today-worker-info">
        {att && <div className="today-worker-info-row"><span className="today-worker-info-label">{onSite ? "Checked in" : "Last seen"}</span><span className="today-worker-info-value" style={{ display: "flex", gap: 6, alignItems: "center" }}>{fmtTime(att.last_at)} <GpsChip att={att} /></span></div>}
        <div className="today-worker-info-row"><span className="today-worker-info-label">Hours this week</span><span className="today-worker-info-value">{w.hoursThisWeek}h</span></div>
        {fam ? <div className="today-worker-info-row"><span className="today-worker-info-label">Wages</span><span className="today-worker-info-value" style={{ fontStyle: "italic", color: "var(--muted)" }}>N/A · family</span></div>
          : <>
            <div className="today-worker-info-row"><span className="today-worker-info-label">Day rate</span><span className="today-worker-info-value">{fjd0(w.daily_rate_fjd)}/d</span></div>
            <div className="today-worker-info-row"><span className="today-worker-info-label">Wages this week</span><span className="today-worker-info-value">{fjd2(w.wagesWeek)}</span></div>
          </>}
      </div>
      <div className="today-worker-actions">
        {onSite
          ? <button className="btn btn-secondary" disabled={clocking} onClick={() => onClock(w, "CLOCK_OUT")}>{clocking ? "Locating…" : "Check out"}</button>
          : <button className="btn btn-primary" disabled={clocking} onClick={() => onClock(w, "CLOCK_IN")}>{clocking ? "Locating…" : "Check in (GPS)"}</button>}
        {!fam && <button className="btn btn-secondary" onClick={() => onPay(w)}>Pay wages</button>}
      </div>
    </div>
  );
}

function LaborInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("today");
  const [typeFilter, setTypeFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showFamily, setShowFamily] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRate, setEditRate] = useState(null);
  const [editDay, setEditDay] = useState(null);
  const [markFor, setMarkFor] = useState(undefined); // undefined=closed; null/worker=open
  const [payFor, setPayFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [clocking, setClocking] = useState(null);

  const workersQ = useQuery({ queryKey: ["workers", farmId], queryFn: () => getWorkers(farmId), enabled: !!farmId });
  const laborQ = useQuery({ queryKey: ["labor", farmId], queryFn: () => getLabor(farmId), enabled: !!farmId });
  const onSiteQ = useQuery({ queryKey: ["onsite", farmId], queryFn: () => getOnSite(farmId), enabled: !!farmId });
  const attendanceQ = useQuery({ queryKey: ["attendance", farmId], queryFn: () => getAttendance(farmId), enabled: !!farmId && (view === "attendance" || view === "today") });
  const records = laborQ.data ?? [];
  const clockFeed = attendanceQ.data ?? [];
  const onSiteByName = useMemo(() => { const m = {}; (onSiteQ.data?.data ?? []).forEach((d) => { if (d.worker_name) m[d.worker_name] = d; }); return m; }, [onSiteQ.data]);

  async function clock(w, kind) {
    setClocking(w.worker_id);
    try {
      const g = await getGeo();
      const b = await send("POST", "/api/v1/attendance/clock", { farm_id: farmId, kind, lat: g.lat, lng: g.lng, accuracy_m: g.accuracy, worker_name: w.full_name });
      const verb = kind === "CLOCK_IN" ? "Checked in" : "Checked out";
      if (b.has_boundary === false) emitToast(`${verb} · GPS saved · draw a farm boundary in Locations to geo-lock`);
      else if (b.inside_boundary) emitToast(`${verb} · on the farm`);
      else emitToast(`${verb} · ${Math.round(b.distance_m || 0)}m outside the boundary`);
      qc.invalidateQueries({ queryKey: ["onsite", farmId] }); qc.invalidateQueries({ queryKey: ["attendance", farmId] });
    } catch (e) {
      if (e && e.code === 1) emitToast("Location blocked — allow GPS in your browser to check in");
      else if (e && e.code === 3) emitToast("Location timed out — try again with a clear sky view");
      else emitToast(e?.userMessage || "Couldn't get your location");
    } finally { setClocking(null); }
  }

  const wkAgo = Date.now() - 7 * 864e5;
  const recById = useMemo(() => {
    const m = {};
    records.forEach((r) => { (m[r.worker_id] = m[r.worker_id] || []).push(r); });
    return m;
  }, [records]);
  const workers = useMemo(() => (workersQ.data ?? []).map((w) => {
    const recs = recById[w.worker_id] || [];
    const wk = recs.filter((r) => { const d = Date.parse(r.work_date); return Number.isFinite(d) && d >= wkAgo; });
    return {
      ...w,
      hoursThisWeek: wk.reduce((s, r) => s + Number(r.hours_worked || 0), 0),
      wagesWeek: wk.reduce((s, r) => s + Number(r.total_pay_fjd || 0), 0),
      wagesLogged: recs.reduce((s, r) => s + Number(r.total_pay_fjd || 0), 0),
    };
  }), [workersQ.data, recById]);

  const onSiteNow = onSiteQ.data?.on_site_count ?? 0; // L-BUG1: no undefined onSiteIds
  const hoursToday = records.filter((r) => String(r.work_date).slice(0, 10) === todayISO()).reduce((s, r) => s + Number(r.hours_worked || 0), 0);
  const wagesWeekTotal = workers.reduce((s, w) => s + (isFamily(w) ? 0 : w.wagesWeek), 0);

  const refetch = () => { qc.invalidateQueries({ queryKey: ["workers", farmId] }); qc.invalidateQueries({ queryKey: ["labor", farmId] }); };
  const team = workers.filter((w) => !isFamily(w));
  const family = workers.filter(isFamily);

  let roster = workers.slice();
  if (typeFilter !== "all") roster = roster.filter((w) => w.worker_type === typeFilter);
  if (q.trim()) { const qq = q.toLowerCase(); roster = roster.filter((w) => `${w.full_name} ${w.worker_id}`.toLowerCase().includes(qq)); }

  const askAi = () => navigate("/tis?q=" + encodeURIComponent("How can I manage my farm labour and wages more efficiently?"));

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div className="subtitle">Who works the farm · hours, attendance, wages</div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-secondary" onClick={askAi}><Sparkles size={13} />Ask AI</button>
              <button className="btn btn-secondary" onClick={() => setMarkFor(null)}><Plus size={13} />Mark attendance</button>
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={13} />Add worker</button>
            </div>
          </div>

          <div className="cycle-view-tabs" role="tablist">
            {VIEWS.map(([id, l, s]) => <button key={id} role="tab" aria-selected={view === id} className={`task-tab ${view === id ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setView(id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></button>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its team.</div>
            : workersQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : workersQ.isError && workers.length === 0 ? <ErrorCard msg="Couldn't load your team." onRetry={() => workersQ.refetch()} />
            : (
            <>
              {workersQ.isError && workers.length > 0 && <DegradedBanner />}
              {view === "today" ? (
              <>
                <div className="live-snapshot-strip">
                  <Snapshot cls="on-site" label="On-site now" value={onSiteQ.isError ? "—" : onSiteNow} sub="checked in (GPS)" />
                  <Snapshot cls="hours" label="Hours today" value={`${hoursToday}h`} sub="logged" />
                  <Snapshot cls="owed" label="Wages this week" value={fjd0(wagesWeekTotal)} sub={`${team.length} paid workers`} />
                  <Snapshot label="Team" value={workers.length} sub={`${family.length} family`} />
                </div>
                {team.length === 0 && family.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)", marginTop: 14 }}>No workers yet — add your first worker.</div> : null}
                {team.length > 0 && <>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "18px 0 8px" }}>Team</div>
                  <div className="today-team-grid">{team.map((w) => <TodayWorkerCard key={w.worker_id} w={w} att={onSiteByName[w.full_name]} clocking={clocking === w.worker_id} onClock={clock} onPay={setPayFor} onOpen={setDetailFor} />)}</div>
                </>}
                {family.length > 0 && (
                  <div className="family-section">
                    <div className="family-section-head">
                      <div className="family-section-title">Family helpers · {family.length} tracked, unpaid</div>
                      <label style={{ fontSize: 11.5, color: "var(--soil)", cursor: "pointer" }}><input type="checkbox" checked={showFamily} onChange={(e) => setShowFamily(e.target.checked)} /> Show family</label>
                    </div>
                    {showFamily && <div className="today-team-grid">{family.map((w) => <TodayWorkerCard key={w.worker_id} w={w} att={onSiteByName[w.full_name]} clocking={clocking === w.worker_id} onClock={clock} onPay={setPayFor} onOpen={setDetailFor} />)}</div>}
                  </div>
                )}
              </>
            ) : view === "roster" ? (
              <>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Type:</span>
                  <button className={`filter-pill ${typeFilter === "all" ? "active" : ""}`} onClick={() => setTypeFilter("all")}>All<span className="filter-pill-count">{workers.length}</span></button>
                  {WORKER_TYPES.map((t) => { const n = workers.filter((w) => w.worker_type === t.value).length; return n === 0 ? null : <button key={t.value} className={`filter-pill ${typeFilter === t.value ? "active" : ""}`} onClick={() => setTypeFilter(t.value)}>{t.label}<span className="filter-pill-count">{n}</span></button>; })}
                </div>
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workers by name or ID..." style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                </div>
                {roster.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No workers match these filters.</div>
                  : <div className="worker-directory-grid">{roster.map((w) => (
                    <div className="worker-directory-card" key={w.worker_id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        <div className={`worker-avatar lg ${tk(w)}`}>{initials(w.full_name)}</div>
                        <div style={{ flex: 1 }}><button onClick={() => setDetailFor(w)} style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left", fontSize: 15, fontWeight: 600, color: "var(--soil)" }}>{w.full_name}</button><div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{w.worker_id}{w.start_date ? ` · started ${String(w.start_date).slice(0, 10)}` : ""}</div></div>
                        <span className={`worker-type-pill ${tk(w)}`}>{TYPE_LABEL[w.worker_type] || w.worker_type}</span>
                      </div>
                      <div className="worker-directory-meta">
                        <div className="worker-meta-tile"><div className="worker-meta-label">Day rate</div><div className="worker-meta-value">{isFamily(w) ? "N/A" : `${fjd0(w.daily_rate_fjd)}/d`}</div></div>
                        <div className="worker-meta-tile"><div className="worker-meta-label">Hours / week</div><div className="worker-meta-value">{w.hoursThisWeek}h</div></div>
                        <div className="worker-meta-tile"><div className="worker-meta-label">Wages (logged)</div><div className="worker-meta-value">{isFamily(w) ? "N/A" : fjd0(w.wagesLogged)}</div></div>
                        <div className="worker-meta-tile"><div className="worker-meta-label">Contact</div><div className="worker-meta-value" style={{ fontSize: 11 }}>{w.contact_number || "—"}</div></div>
                      </div>
                      {!isFamily(w) && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px dashed var(--line)", marginTop: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditRate(w)}><Pencil size={12} />Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setMarkFor(w)}>Mark attendance</button>
                      </div>}
                    </div>
                  ))}</div>}
              </>
            ) : view === "attendance" ? (
              <>
                <div className="calendar-banner">Check-in/out is GPS-verified against your farm boundary — green = on the farm, amber = off. It's the worker's proof of attendance. Draw the boundary in Locations to enable geo-lock.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}><button className="btn btn-secondary" onClick={() => setMarkFor(null)}><Plus size={14} />Log a day (hours + pay)</button></div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "4px 0 8px" }}>Recent check-in / check-out (GPS)</div>
                {attendanceQ.isLoading ? <div className="card" style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
                  : attendanceQ.isError && clockFeed.length === 0 ? <ErrorCard msg="Couldn't load check-ins." onRetry={() => attendanceQ.refetch()} />
                  : clockFeed.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No GPS check-ins yet — tap “Check in (GPS)” on a worker in Today.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{clockFeed.map((c) => (
                    <div key={c.attendance_id} className="card" style={{ padding: "9px 13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div><div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{c.worker_name || "—"} <span style={{ fontWeight: 700, color: c.kind === "CLOCK_IN" ? "var(--green-dk)" : "var(--muted)" }}>· {c.kind === "CLOCK_IN" ? "IN" : "OUT"}</span></div><div style={{ fontSize: 11, color: "var(--muted)" }}>{String(c.occurred_at).slice(0, 10)} {fmtTime(c.occurred_at)}{c.note ? ` · ${c.note}` : ""}</div></div>
                      <GpsChip att={{ inside_boundary: c.inside_boundary, distance_m: c.distance_m }} />
                    </div>
                  ))}</div>}
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "18px 0 8px" }}>Logged days (hours &amp; pay)</div>
                {laborQ.isError && records.length === 0 ? <ErrorCard msg="Couldn't load logged days." onRetry={() => laborQ.refetch()} />
                  : records.length === 0 ? <div className="card" style={{ padding: 16, color: "var(--muted)" }}>No days logged yet.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{records.map((r) => (
                    <div key={r.attendance_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{r.worker_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{String(r.work_date).slice(0, 10)} · {r.hours_worked}h{r.task_description ? ` · ${r.task_description}` : ""}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontWeight: 700, color: "var(--soil)" }}>{fjd2(r.total_pay_fjd)}</div><button className="btn btn-secondary btn-sm" title="Fix this day" onClick={() => setEditDay(r)}><Pencil size={11} /></button></div>
                    </div>
                  ))}</div>}
              </>
            ) : view === "payroll" ? (
              team.length === 0 ? <Building title="Payroll" body="Wages owed and paid appear here once you add paid workers and mark attendance." />
                : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="calendar-banner">Wages logged from attendance. “Pay wages” records a labour expense in Cash (feeds Bank Evidence). The suggested amount is <b>this week’s logged wages</b> — owed-vs-paid settlement is on the roadmap.</div>
                  {team.map((w) => (
                    <div key={w.worker_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div><button onClick={() => setDetailFor(w)} style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", fontWeight: 600, color: "var(--soil)" }}>{w.full_name}</button><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{w.hoursThisWeek}h this week · {fjd0(w.daily_rate_fjd)}/d</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, color: "var(--soil)" }}>{fjd2(w.wagesWeek)}</div><div style={{ fontSize: 10.5, color: "var(--muted)" }}>this week</div></div><button className="btn btn-secondary btn-sm" onClick={() => setPayFor(w)}>Pay wages</button></div>
                    </div>
                  ))}
                </div>
            ) : view === "tasks" ? (
              <div className="card" style={{ padding: "18px 20px" }}>
                <div style={{ fontWeight: 700, color: "var(--soil)" }}>Task assignments</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px", lineHeight: 1.5 }}>Worker task assignments live in the Tasks pillar, where they're scheduled, tracked and auto-generated from compliance.</div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/farm/tasks")}>Open Tasks →</button>
              </div>
            ) : view === "costing" ? <Building title="Labour cost per cycle" body="What labour costs each cycle and enterprise to run — rolls up from attendance tagged to cycles. Turns on as you tag work to production." />
            : view === "develop" ? <Building title="Training & safety records" body="Worker skills, certifications, safety briefings and incident records — hash-chained to each worker. The records table ships next; honest-empty until then, never fabricated." />
            : <Building title="Productivity" body="Output per worker (kg per hour, over time) — needs work-to-harvest attribution. Tag attendance to cycles and harvests and this builds. No fabricated numbers." />}
            </>
          )}
        </div>
      </main>

      {detailFor && <WorkerDetail worker={workers.find((w) => w.worker_id === detailFor.worker_id) || detailFor} records={recById[detailFor.worker_id] || []} att={onSiteByName[detailFor.full_name]} clockFeed={clockFeed.filter((c) => c.worker_name === detailFor.full_name)} onClose={() => setDetailFor(null)} onClock={clock} clocking={clocking === detailFor.worker_id} onPay={() => { setPayFor(detailFor); setDetailFor(null); }} onEditRate={() => { setEditRate(detailFor); setDetailFor(null); }} />}

      {addOpen && <AddWorkerModal farmId={farmId} onClose={() => setAddOpen(false)} onSaved={() => { refetch(); setAddOpen(false); }} />}
      {editRate && <EditRateModal worker={editRate} onClose={() => setEditRate(null)} onSaved={() => { refetch(); setEditRate(null); }} />}
      {editDay && <DayEditModal record={editDay} onClose={() => setEditDay(null)} onSaved={() => { refetch(); setEditDay(null); }} />}
      {markFor !== undefined && <MarkAttendanceModal farmId={farmId} workers={team.concat(family)} preset={markFor} onClose={() => setMarkFor(undefined)} onSaved={() => { refetch(); setMarkFor(undefined); }} />}
      {payFor && <PayWagesModal farmId={farmId} worker={payFor} onClose={() => setPayFor(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["cash", farmId] }); setPayFor(null); }} />}
    </TfpShell>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function AddWorkerModal({ farmId, onClose, onSaved }) {
  const [f, setF] = useState({ full_name: "", worker_type: "CASUAL", daily_rate_fjd: "", contact_number: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (!f.full_name.trim() || !f.daily_rate_fjd) { emitToast("Name and daily rate are required"); return; }
    setBusy(true);
    try {
      await send("POST", "/api/v1/workers", { farm_id: farmId, full_name: f.full_name.trim(), worker_type: f.worker_type, daily_rate_fjd: Number(f.daily_rate_fjd), contact_number: f.contact_number.trim() || null });
      emitToast("Worker added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not add worker"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Add worker</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <Field label="Full name"><input value={f.full_name} onChange={set("full_name")} placeholder="e.g. Laisenia Waqa" /></Field>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Type</label><select value={f.worker_type} onChange={set("worker_type")}>{WORKER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label>Daily rate (FJD)</label><input type="number" min="0" step="0.50" value={f.daily_rate_fjd} onChange={set("daily_rate_fjd")} placeholder="30.00" disabled={f.worker_type === "FAMILY"} /></div>
          </div>
          <MinWageNote dayRate={f.daily_rate_fjd} isFamilyType={f.worker_type === "FAMILY"} />
          <Field label="Phone (optional)"><input value={f.contact_number} onChange={set("contact_number")} placeholder="9XX XXXX" /></Field>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Fiji minimum wage is FJD 4.00/hr (≈ FJD 32/8h day).</div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add worker"}</button></div>
      </div>
    </div>
  );
}

function EditRateModal({ worker, onClose, onSaved }) {
  const [f, setF] = useState({
    full_name: worker.full_name || "", worker_type: worker.worker_type || "CASUAL",
    daily_rate_fjd: String(worker.daily_rate_fjd ?? ""), contact_number: worker.contact_number || "", whatsapp_number: worker.whatsapp_number || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (!f.full_name.trim()) { emitToast("Name is required"); return; }
    setBusy(true);
    try {
      await send("PATCH", `/api/v1/workers/${encodeURIComponent(worker.worker_id)}`, {
        full_name: f.full_name.trim(), worker_type: f.worker_type, daily_rate_fjd: Number(f.daily_rate_fjd) || 0,
        contact_number: f.contact_number.trim() || null, whatsapp_number: f.whatsapp_number.trim() || null });
      emitToast("Worker updated"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not update worker"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Edit worker — {worker.full_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div><label>Full name</label><input value={f.full_name} onChange={set("full_name")} /></div>
            <div><label>Type</label><select value={f.worker_type} onChange={set("worker_type")}>{WORKER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Daily rate (FJD)</label><input type="number" min="0" step="0.50" value={f.daily_rate_fjd} onChange={set("daily_rate_fjd")} disabled={f.worker_type === "FAMILY"} /></div>
            <div><label>Phone</label><input value={f.contact_number} onChange={set("contact_number")} /></div>
            <div><label>WhatsApp</label><input value={f.whatsapp_number} onChange={set("whatsapp_number")} /></div>
          </div>
          <MinWageNote dayRate={f.daily_rate_fjd} isFamilyType={f.worker_type === "FAMILY"} />
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </div>
  );
}

function DayEditModal({ record, onClose, onSaved }) {
  const [f, setF] = useState({ hours_worked: String(record.hours_worked ?? ""), total_pay_fjd: String(record.total_pay_fjd ?? ""), task_description: record.task_description || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    setBusy(true);
    try {
      await send("PATCH", `/api/v1/labor/${encodeURIComponent(record.attendance_id)}`, {
        hours_worked: Number(f.hours_worked) || 0, total_pay_fjd: Number(f.total_pay_fjd) || 0, task_description: f.task_description.trim() || null });
      emitToast("Day corrected"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not save"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Fix logged day — {record.worker_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>{String(record.work_date).slice(0, 10)}. Correct the hours, pay or task.</div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label>Hours</label><input type="number" min="0" step="0.5" value={f.hours_worked} onChange={set("hours_worked")} /></div>
            <div><label>Pay (FJD)</label><input type="number" min="0" step="0.01" value={f.total_pay_fjd} onChange={set("total_pay_fjd")} /></div>
          </div>
          <Field label="Task"><input value={f.task_description} onChange={set("task_description")} /></Field>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </div>
  );
}

function MarkAttendanceModal({ farmId, workers, preset, onClose, onSaved }) {
  const [workerId, setWorkerId] = useState(preset?.worker_id || "");
  const [hours, setHours] = useState("8");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = workers.find((w) => w.worker_id === workerId);
  const fam = worker ? isFamily(worker) : false;
  const rate = Number(worker?.daily_rate_fjd ?? 0);
  const total = fam ? 0 : Math.round(rate * (Number(hours || 0) / 8) * 100) / 100;
  async function submit() {
    if (!workerId) { emitToast("Pick a worker"); return; }
    setBusy(true);
    try {
      await send("POST", "/api/v1/labor", { worker_id: workerId, farm_id: farmId, work_date: todayISO(), hours_worked: Number(hours), daily_rate_fjd: rate, total_pay_fjd: total, task_description: task.trim() || null });
      emitToast("Attendance logged"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not log attendance"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Mark attendance</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <Field label="Worker"><select value={workerId} onChange={(e) => setWorkerId(e.target.value)}><option value="">Pick a worker…</option>{workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.full_name} · {isFamily(w) ? "family" : `${fjd0(w.daily_rate_fjd)}/d`}</option>)}</select></Field>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
            <div><label>Hours</label><input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
            <div><label>Task (optional)</label><input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. weeding Bed 3" /></div>
          </div>
          {worker && !fam && <MinWageNote dayRate={rate} isFamilyType={false} />}
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !workerId}>{busy ? "Logging…" : fam ? "Log day (unpaid)" : `Log · ${fjd2(total)}`}</button></div>
      </div>
    </div>
  );
}

function PayWagesModal({ farmId, worker, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(Math.round((worker.wagesWeek || worker.daily_rate_fjd || 0) * 100) / 100));
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState("MOBILE_MONEY");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!Number(amount)) { emitToast("Enter the amount"); return; }
    setBusy(true);
    try {
      await send("POST", "/api/v1/cash-ledger", { farm_id: farmId, transaction_date: date, transaction_type: "EXPENSE", category: "LABOR", description: `Wages · ${worker.full_name}`, amount_fjd: Number(amount), payment_method: method });
      emitToast("Wages paid · logged in Cash"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not record payment"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Pay wages — {worker.full_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Suggested = this week’s logged wages. Records a labour expense in Cash (feeds Bank Evidence) and is hash-chained.</div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label>Amount (FJD)</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <Field label="Method"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="MOBILE_MONEY">M-PAiSA / mobile</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option></select></Field>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Paying…" : "Pay wages"}</button></div>
      </div>
    </div>
  );
}

function WorkerDetail({ worker, records, att, clockFeed, onClose, onClock, clocking, onPay, onEditRate }) {
  const fam = isFamily(worker);
  const onSite = att?.on_site;
  const logged = records.reduce((s, r) => s + Number(r.total_pay_fjd || 0), 0);
  const hours = records.reduce((s, r) => s + Number(r.hours_worked || 0), 0);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{worker.full_name}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className={`worker-type-pill ${tk(worker)}`}>{TYPE_LABEL[worker.worker_type] || worker.worker_type}</span>
            <span className={`worker-status-pill ${onSite ? "on-site" : "off"}`}><span className="worker-status-dot" />{onSite ? "On-site" : att ? "Off" : "—"}</span>
            <GpsChip att={att} />
            <span style={{ flex: 1 }} />
            {!fam && <button className="btn btn-secondary btn-sm" onClick={onEditRate}><Pencil size={12} />Edit</button>}
            <button className="btn btn-primary btn-sm" disabled={clocking} onClick={() => onClock(worker, onSite ? "CLOCK_OUT" : "CLOCK_IN")}>{clocking ? "Locating…" : onSite ? "Check out" : "Check in (GPS)"}</button>
          </div>
          <div className="worker-directory-meta" style={{ marginBottom: 14 }}>
            <div className="worker-meta-tile"><div className="worker-meta-label">Day rate</div><div className="worker-meta-value">{fam ? "N/A" : `${fjd0(worker.daily_rate_fjd)}/d`}</div></div>
            <div className="worker-meta-tile"><div className="worker-meta-label">Hours (logged)</div><div className="worker-meta-value">{hours}h</div></div>
            <div className="worker-meta-tile"><div className="worker-meta-label">Wages (logged)</div><div className="worker-meta-value">{fam ? "N/A" : fjd0(logged)}</div></div>
            <div className="worker-meta-tile"><div className="worker-meta-label">Contact</div><div className="worker-meta-value" style={{ fontSize: 11 }}>{worker.contact_number || "—"}</div></div>
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>GPS check-in history</div>
          {clockFeed.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>No GPS check-ins yet.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>{clockFeed.slice(0, 8).map((c) => (
              <div key={c.attendance_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
                <span style={{ color: "var(--soil)" }}>{c.kind === "CLOCK_IN" ? "IN" : "OUT"} · {String(c.occurred_at).slice(0, 10)} {fmtTime(c.occurred_at)}</span>
                <GpsChip att={{ inside_boundary: c.inside_boundary, distance_m: c.distance_m }} />
              </div>
            ))}</div>}
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Logged days</div>
          {records.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No days logged yet.</div>
            : records.slice(0, 10).map((r) => (
              <div key={r.attendance_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
                <span style={{ color: "var(--soil)" }}>{String(r.work_date).slice(0, 10)} · {r.hours_worked}h{r.task_description ? ` · ${r.task_description}` : ""}</span>
                <span style={{ fontWeight: 600 }}>{fjd2(r.total_pay_fjd)}</span>
              </div>
            ))}
        </div>
        <div className="overlay-foot">{!fam && <button className="btn btn-secondary" onClick={onPay}>Pay wages</button>}<button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function Labor() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <LaborInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

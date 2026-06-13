/**
 * CropCompliance.jsx — /farm/compliance — PIXEL-EXACT prototype producerComplianceEnhanced.
 *
 * Seven tabs (exact labels/hints from renderComplianceViewTabs):
 *   Status · Areas · Chemical register · Certifications · Overrides · Calendar · Analytics
 * Dual-layer enforcement strip + Log-chemical header action, all in .tfp markup.
 *
 * Real where the API serves it, honest-empty where it doesn't:
 *   Status      GET /crops/compliance/{farm} (blocks) + /cycles (full grid: blocked + clear cards)
 *   Register    GET /crops/compliance/{farm}/register (every chemical application + WHD + hash)
 *   Overrides   GET /crops/compliance/{farm}/overrides (real harvest_compliance_overrides ledger)
 *   Calendar    derived from compliance upcoming_clearances
 *   Areas       area cards — green where backed by records, honest "building" otherwise
 *   Certs       honest "building" (no certifications backend yet — named, not faked)
 *   Analytics   override history + chemical-use-by-type (real) + score/MRL honest-building
 * Inviolable #2 dual-layer copy is an accurate description of the real enforcement.
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Shield, Plus, Search, Clock, AlertTriangle, Check, Leaf, Lock, FlaskConical,
  List, Award, Activity, Home, Cloud, FileText, X,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function get(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const TABS = [
  ["status", "Status", "The gate"], ["areas", "Areas", "All standards"],
  ["register", "Chemical register", "Applications"], ["certs", "Certifications", "Certs"],
  ["overrides", "Overrides", "Ledger"], ["calendar", "Calendar", "Upcoming"],
  ["analytics", "Analytics", "Score"],
];

function DualLayer() {
  return (
    <div className="dual-layer-strip">
      <div className="dual-layer-main"><Shield size={16} />Dual-layer enforcement: ACTIVE</div>
      <div className="dual-layer-checks">
        <div className="dual-layer-check"><span className="dual-layer-dot" />Spray check</div>
        <div className="dual-layer-check"><span className="dual-layer-dot" />Permanent record check</div>
      </div>
      <div className="dual-layer-caption">Every harvest passes two independent checks. Neither can be bypassed without a logged FOUNDER override.</div>
    </div>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────
function StatusView({ farmId, comp, cycles, overridesYtd, navigate, onOverride }) {
  const [filter, setFilter] = useState("all");
  const blocks = comp?.active_blocks ?? [];
  const blockedByCycle = new Map(blocks.map((b) => [b.cycle_id, b]));
  const active = (cycles ?? []).filter((c) => ["PLANNED", "ACTIVE", "HARVESTING", "CLOSING"].includes(c.cycle_status || c.status));
  const cards = active.map((c) => {
    const blk = blockedByCycle.get(c.cycle_id);
    return { c, status: blk ? "blocked" : "clear", blk };
  });
  // include any blocked block not matched to a listed cycle
  blocks.forEach((b) => { if (!active.some((c) => c.cycle_id === b.cycle_id)) cards.push({ c: { cycle_id: b.cycle_id, production_name: b.crop, pu_id: b.pu_id, farmer_label: b.block_name }, status: "blocked", blk: b }); });
  const blocked = cards.filter((x) => x.status === "blocked").length;
  const clear = cards.filter((x) => x.status === "clear").length;
  const shown = filter === "all" ? cards : cards.filter((x) => x.status === filter);
  return (
    <>
      <DualLayer />
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className={`capital-tile ${blocked > 0 ? "critical" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter("blocked")}>
          <div className="capital-tile-label">Blocked now</div><div className="capital-tile-value" style={{ color: blocked > 0 ? "var(--red)" : "var(--soil)" }}>{blocked}</div><div className="capital-tile-sub">active WHD</div></div>
        <div className="capital-tile" style={{ cursor: "pointer" }} onClick={() => setFilter("clear")}>
          <div className="capital-tile-label">Harvest-safe</div><div className="capital-tile-value" style={{ color: "var(--green-dk)" }}>{clear}</div><div className="capital-tile-sub">0 organic</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Compliance streak</div><div className="capital-tile-value" style={{ color: "var(--soil)" }}>—</div><div className="capital-tile-sub">builds with records</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Overrides (YTD)</div><div className="capital-tile-value" style={{ color: overridesYtd > 0 ? "var(--amber)" : "var(--soil)" }}>{overridesYtd}</div><div className="capital-tile-sub">each is a ding</div></div>
      </div>
      <div className="gallery-filter-row" style={{ margin: "12px 0" }}>
        {[["all", "All"], ["blocked", "Blocked"], ["clear", "Clear"], ["organic", "Organic"]].map(([k, l]) => (
          <button key={k} className={`filter-pill${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No cycles match this filter.</div> : (
        <div className="comp-block-grid">
          {shown.map(({ c, status, blk }) => (
            <div key={c.cycle_id} className={`comp-block-card ${status}`}>
              <div className="comp-block-head">
                <div className={`comp-block-icon ${status}`}>{status === "blocked" ? <AlertTriangle size={18} /> : <Check size={18} />}</div>
                <div style={{ flex: 1 }}>
                  <div className="comp-block-name">{c.farmer_label || c.pu_id} · {(c.production_name || c.crop || "Crop")}</div>
                  <div style={{ marginTop: 4 }}><span className={`comp-status-pill ${status}`}>{status === "blocked" ? "Harvest blocked" : "Clear"}</span></div>
                </div>
              </div>
              {status === "blocked" ? (
                <>
                  <div className="comp-block-detail">{blk.chemical} applied {blk.applied_date} · WHD {blk.whd_days} days · clears {blk.clear_date}</div>
                  <div className={`whd-countdown${blk.days_remaining <= 2 ? "" : " soon"}`}><Clock size={12} />Clears in {blk.days_remaining} day{blk.days_remaining === 1 ? "" : "s"} · {blk.clear_date}</div>
                  <div style={{ marginTop: 8 }}><button className="btn founder-override-btn" onClick={(e) => { e.stopPropagation(); onOverride(blk); }}><AlertTriangle size={13} />FOUNDER override</button></div>
                </>
              ) : (
                <>
                  <div className="comp-block-detail">No active WHD · harvest-safe</div>
                  <div className="comp-buyer-ready"><Check size={11} />Buyer-ready</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Areas ────────────────────────────────────────────────────────────────────
function AreasView({ blocked, clear, navigate, setTab }) {
  const card = (Icon, title, statusLabel, color, desc, onClick) => (
    <div className="card" key={title} style={{ padding: "14px 16px", marginBottom: 12, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700, color: "var(--soil)" }}><span style={{ color: "var(--green)" }}><Icon size={17} /></span>{title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{desc}</div>
    </div>
  );
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Every compliance area on your farm, in one place. Areas with a green status are backed by your logged records. The rest build as you log.</div>
      {card(FlaskConical, "Food safety", blocked ? `${blocked} on hold` : "Clear", blocked ? "var(--red)" : "var(--green-dk)", `Spray and withdrawal records keep unsafe produce off the market. ${clear} clear · ${blocked} on hold.`, () => setTab("status"))}
      {card(List, "Medicine & chemical usage", "Logged", "var(--green-dk)", "Every spray and animal treatment recorded, with withdrawal periods enforced.", () => setTab("register"))}
      {card(Award, "Export certificates", "See certs", "var(--green-dk)", "Organic, GAP and export certificate status.", () => setTab("certs"))}
      {card(Shield, "Audit trail", "Hash-linked", "var(--green-dk)", "Every action hash-linked and tamper-proof.", () => setTab("overrides"))}
      {card(AlertTriangle, "Violations & holds", blocked ? `${blocked} active` : "None", blocked ? "var(--red)" : "var(--green-dk)", "Anything blocked from sale or harvest right now shows here.", () => setTab("status"))}
      {card(Activity, "Animal welfare", "Building", "var(--muted)", "Welfare checks, body condition and treatment records. Builds as you log animal health.", () => setTab("register"))}
      {card(Home, "Biosecurity", "Building", "var(--muted)", "Visitor logs, quarantine and disease watch. Builds as you record farm-gate activity.", null)}
      {card(Cloud, "Environmental", "Building", "var(--muted)", "Waste, water use and chemical runoff. Builds as you log inputs and disposal.", null)}
      {card(FileText, "Licenses & permits", "Building", "var(--muted)", "Farm licence, chemical handler permit and expiry reminders. Builds as you add them.", null)}
    </>
  );
}

// ── Chemical register ────────────────────────────────────────────────────────
function RegisterView({ farmId, navigate }) {
  const [q, setQ] = useState("");
  const rq = useQuery({ queryKey: ["comp-reg", farmId], queryFn: () => get(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/register`), enabled: !!farmId });
  const apps = rq.data?.data?.applications ?? [];
  const activeWHD = apps.filter((a) => a.active).length;
  const counts = {}; apps.forEach((a) => { counts[a.chemical] = (counts[a.chemical] || 0) + 1; });
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const filtered = q.trim() ? apps.filter((a) => `${a.chemical} ${a.block_id} ${a.crop}`.toLowerCase().includes(q.toLowerCase())) : apps;
  return (
    <>
      <div className="calendar-banner">Every chemical application is recorded against its block with the withholding period from the chemical library.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Applications</div><div className="capital-tile-value">{apps.length}</div><div className="capital-tile-sub">on record</div></div>
        <div className={`capital-tile ${activeWHD > 0 ? "low" : ""}`}><div className="capital-tile-label">Active WHDs</div><div className="capital-tile-value" style={{ color: activeWHD > 0 ? "var(--amber)" : "var(--soil)" }}>{activeWHD}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Blocks sprayed</div><div className="capital-tile-value">{new Set(apps.map((a) => a.block_id)).size}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Most used</div><div className="capital-tile-value" style={{ fontSize: 13 }}>{most ? most[0].split(" ")[0] : "—"}</div><div className="capital-tile-sub">{most ? `${most[1]} times` : ""}</div></div>
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chemical, block, crop…" style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/farm/field-events?type=CHEMICAL_APPLIED")}><Plus size={14} />Log chemical</button>
      </div>
      {rq.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
        : filtered.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No chemical applications recorded yet. Log one from the (+) Crops menu — every spray lands here with its withholding period.</div>
        : (
          <div style={{ overflowX: "auto", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9 }}>
            <table className="comp-table">
              <thead><tr><th>Date</th><th>Chemical</th><th>Block</th><th>Crop</th><th>WHD</th><th>Clears</th><th>Verify</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.event_id}>
                    <td style={{ fontSize: 11 }}>{a.applied_date}</td>
                    <td>{a.chemical}</td>
                    <td style={{ fontSize: 11 }}>{a.block_name || a.block_id}</td>
                    <td style={{ fontSize: 11.5 }}>{a.crop || "—"}</td>
                    <td style={{ fontFamily: "Menlo,monospace" }}>{a.whd_days}d</td>
                    <td style={{ fontSize: 11, ...(a.active ? { color: "var(--red)", fontWeight: 600 } : {}) }}>{a.clear_date}{a.active ? " (active)" : ""}</td>
                    <td>{a.hash ? <span className="verification-badge"><span className="verify-dot" />{a.hash}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

// ── Certifications (honest building — no certs backend yet) ───────────────────
function CertsView() {
  return (
    <>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Active certs</div><div className="capital-tile-value">—</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Expiring soon</div><div className="capital-tile-value">—</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Expired</div><div className="capital-tile-value">—</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Next renewal</div><div className="capital-tile-value" style={{ fontSize: 13 }}>—</div></div>
      </div>
      <div className="card" style={{ padding: 24, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Award size={16} style={{ color: "var(--green)" }} /><strong style={{ color: "var(--soil)" }}>Certifications</strong><span className="building-badge" style={{ marginLeft: "auto" }}>Building</span></div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>Organic (POETCom), GAP and export certificates — with expiry tracking that auto-creates a renewal task — register here. The certificate store is being built; nothing is shown until it holds your real documents (no placeholders).</div>
      </div>
    </>
  );
}

// ── Overrides ────────────────────────────────────────────────────────────────
function OverridesView({ farmId }) {
  const oq = useQuery({ queryKey: ["comp-ovr", farmId], queryFn: () => get(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/overrides`), enabled: !!farmId });
  const data = oq.data?.data || {};
  const list = data.overrides ?? [];
  return (
    <>
      <div className="page-header" style={{ paddingTop: 0 }}><div><h1 style={{ fontSize: 20 }}>Override history</h1><div className="subtitle">Every FOUNDER override · permanent record · counts against compliance score</div></div></div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="capital-tile"><div className="capital-tile-label">Total overrides</div><div className="capital-tile-value">{data.total ?? 0}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">YTD</div><div className="capital-tile-value">{data.ytd ?? 0}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Blocks honored</div><div className="capital-tile-value" style={{ color: "var(--green-dk)" }}>{(data.total ?? 0) === 0 ? "100%" : "—"}</div></div>
      </div>
      <div className="override-warning" style={{ margin: "14px 0" }}><AlertTriangle size={13} /> FOUNDER overrides bypass the WHD gate. Each requires a reason, triggers a CRITICAL alert to the Operator, and is permanently recorded. Bankers and premium buyers see override frequency — fewer is better.</div>
      {oq.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
        : list.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--green-dk)" }}><Check size={14} /> No overrides on record — every withholding hold has been honored. This is exactly what a banker wants to see.</div>
        : list.map((o) => (
          <div className="override-row" key={o.override_id}>
            <div className="override-row-head">
              <div><strong style={{ fontSize: 13, color: "var(--soil)" }}>Harvest override</strong> <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.approved ? "approved" : "denied"}</span></div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="permanent-lock"><Lock size={9} />permanent</span></div>
            </div>
            <div className="override-reason">"{o.reason}"</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)" }}>
              <span>{String(o.attempted_at || "").slice(0, 16).replace("T", " ")} · {o.authorized_by || "—"}</span>
            </div>
          </div>
        ))}
    </>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function CalendarView({ comp, navigate }) {
  const upcoming = comp?.upcoming_clearances ?? comp?.active_blocks ?? [];
  return (
    <>
      <div className="page-header" style={{ paddingTop: 0 }}><div><h1 style={{ fontSize: 20 }}>Upcoming compliance events</h1><div className="subtitle">Clear-dates · cert renewals</div></div></div>
      <div style={{ background: "rgba(191,144,0,0.06)", borderLeft: "3px solid var(--amber)", borderRadius: 7, padding: "12px 14px", margin: "14px 0", fontSize: 12, color: "var(--soil)" }}>
        <strong>Spray advisory:</strong> check the 48h rain forecast before applying — rain washes chemical off (wasted) and risks runoff. <a onClick={() => navigate("/farm/weather")} style={{ color: "var(--green-dk)", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>View weather</a>
      </div>
      {upcoming.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No upcoming compliance events. Clear-dates and renewals appear here as chemicals are applied and certificates added.</div>
        : upcoming.map((e) => (
          <div className="comp-cal-row" key={e.cycle_id}>
            <div className="comp-cal-date">{e.clear_date}</div>
            <div className="comp-cal-icon"><Check size={14} /></div>
            <div style={{ flex: 1, fontSize: 12.5, color: "var(--soil)" }}>WHD clears · {e.block_name || e.pu_id} {e.crop} harvest-safe</div>
            <span className="comp-status-pill clear">harvest</span>
          </div>
        ))}
    </>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsView({ farmId, overridesYtd, navigate }) {
  const rq = useQuery({ queryKey: ["comp-reg-an", farmId], queryFn: () => get(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/register`), enabled: !!farmId });
  const apps = rq.data?.data?.applications ?? [];
  const byChem = {}; apps.forEach((a) => { const k = a.chemical.split(" ")[0]; byChem[k] = (byChem[k] || 0) + 1; });
  const maxC = Math.max(...Object.values(byChem), 1);
  return (
    <>
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-card-title">Compliance score</div>
          <div className="comp-score-big"><div className="comp-score-num">—</div><div className="comp-score-label">streak builds with records</div></div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, fontSize: 11.5, color: "var(--soil)" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 600, color: overridesYtd > 0 ? "var(--amber)" : "var(--green-dk)" }}>{overridesYtd}</div><div style={{ color: "var(--muted)" }}>overrides</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 600, color: "var(--green-dk)" }}>{overridesYtd === 0 ? "100%" : "—"}</div><div style={{ color: "var(--muted)" }}>blocks honored</div></div>
          </div>
        </div>
        <div className="analytics-card">
          <div className="analytics-card-title">Chemical use by type<span className="analytics-card-link" onClick={() => emitToast("Applications grouped by chemical")}>Register →</span></div>
          <div style={{ padding: "8px 0" }}>
            {Object.keys(byChem).length === 0 ? <div style={{ fontSize: 12, color: "var(--muted)" }}>No applications yet.</div>
              : Object.entries(byChem).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <div className="util-bar-row" key={t}><div className="util-bar-name">{t}</div><div className="util-bar-track"><div className="util-bar-fill med" style={{ width: `${n / maxC * 100}%` }} /></div><div className="util-bar-value">{n}</div></div>
              ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 14, marginTop: 14, fontSize: 12.5, color: "var(--soil)", lineHeight: 1.8 }}>
        <strong>Compliance streak:</strong> building — turns on with logged records · <strong>Overrides this year:</strong> {overridesYtd} (banker target: 0)
      </div>
      <div className="analytics-card" style={{ marginTop: 14 }}>
        <div className="analytics-card-title">Compliance certificate<span className="analytics-card-link">The export passport</span></div>
        <div style={{ fontSize: 12, color: "var(--soil)", margin: "8px 0" }}>A clean chemical-record certificate — proving WHDs honored and zero breaches — generates from your Bank Evidence pack.</div>
        <button className="btn btn-primary" onClick={() => navigate("/farm/reports")}><FileText size={14} />Open Bank Evidence</button>
      </div>
    </>
  );
}

// ── Override modal (honest: explains the real gate; logging happens at harvest) ─
function OverrideModal({ blk, onClose, navigate }) {
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>FOUNDER override</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="override-warning" style={{ marginBottom: 12 }}><AlertTriangle size={13} /> This block is inside its withholding period ({blk.chemical}, clears {blk.clear_date}). Selling now is a real food-safety breach.</div>
          <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.7 }}>An override can only be recorded <strong>at the moment you attempt the harvest</strong> — the system asks for a reason there, fires a CRITICAL alert to the Operator, and writes a permanent record that bankers and buyers can see. There is no silent override.</div>
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Wait for clearance</button>
          <button className="btn btn-primary" onClick={() => { onClose(); navigate("/farm/harvest/new"); }}>Go to harvest →</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function CropComplianceInner() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("status");
  const [override, setOverride] = useState(null);

  const compQ = useQuery({ queryKey: ["comp", farmId], queryFn: () => get(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const cyclesQ = useQuery({ queryKey: ["comp-cycles", farmId], queryFn: () => get(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`).catch(() => ({ data: [] })), enabled: !!farmId });
  const ovrQ = useQuery({ queryKey: ["comp-ovr-h", farmId], queryFn: () => get(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/overrides`).catch(() => ({ data: {} })), enabled: !!farmId });

  const comp = compQ.data?.data || {};
  const cyclesRaw = cyclesQ.data?.data;
  const cycles = Array.isArray(cyclesRaw) ? cyclesRaw : cyclesRaw?.cycles ?? [];
  const overridesYtd = ovrQ.data?.data?.ytd ?? 0;
  const blocked = comp.blocked_count ?? 0;
  const checked = comp.checked_cycles ?? 0;
  const active = TABS.find((t) => t[0] === tab);

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="comp-wx-link"><Shield size={13} /><span>Weather affects spray windows and harvest holds.</span> <a onClick={() => navigate("/farm/weather")} style={{ color: "var(--green-dk)", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>Open weather</a></div>
          <div className="page-header">
            <div><h1>Compliance</h1><div className="subtitle">Spray safety and chemical records · {farmId || "your farm"}</div></div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-primary" onClick={() => navigate("/farm/field-events?type=CHEMICAL_APPLIED")}><Plus size={14} />Log chemical</button>
            </div>
          </div>
          <div className="cycle-view-tabs">
            {TABS.map(([id, l, s]) => <div key={id} className={`task-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></div>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its compliance.</div>
            : tab === "status" ? <StatusView farmId={farmId} comp={comp} cycles={cycles} overridesYtd={overridesYtd} navigate={navigate} onOverride={setOverride} />
            : tab === "areas" ? <AreasView blocked={blocked} clear={Math.max(0, checked - blocked)} navigate={navigate} setTab={setTab} />
            : tab === "register" ? <RegisterView farmId={farmId} navigate={navigate} />
            : tab === "certs" ? <CertsView />
            : tab === "overrides" ? <OverridesView farmId={farmId} />
            : tab === "calendar" ? <CalendarView comp={comp} navigate={navigate} />
            : <AnalyticsView farmId={farmId} overridesYtd={overridesYtd} navigate={navigate} />}

          <div style={{ marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/farm/compliance/poultry")}>View poultry compliance →</button>
          </div>
        </div>
        {override && <OverrideModal blk={override} onClose={() => setOverride(null)} navigate={navigate} />}
      </main>
    </TfpShell>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function CropCompliance() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <CropComplianceInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

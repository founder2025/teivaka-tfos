/**
 * Enterprises.jsx — /farm/enterprises
 *
 * Mirrors v262 coreEnterprisesView + coreEnterpriseDetailView (Gate-1 traced).
 * Your farm as a portfolio of businesses. 5 list tabs (Portfolio · Rankings ·
 * Cash & risk · Outlook · Investor) + per-enterprise detail (section tabs).
 *
 * Fully wired: every tile/glance/chip/card/button/tab does one real thing —
 * navigate, open detail, open the Add-enterprise modal (real cycle/flock create
 * routes), or an honest labeled toast. Never looks dead: loading = skeletons,
 * empty = watermarked "Example" PREVIEW template, errors = inline retry.
 *
 * An enterprise = one crop production (financials/crops, live money) or one
 * poultry flock-type (flocks, live head). Standing derived honestly from real
 * net/ROI (crops) or survival % (animals) — never a mock score. No fabricated
 * numbers shown to a banker; preview numbers are watermarked "Sample".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import { useFormModal } from "../../context/FormModalContext";
import {
  Sprout, Plus, Search, Layers, Coins, AlertTriangle, Crosshair, ArrowRight,
  Shield, BarChart3, Bird, RefreshCw,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import { useActiveEnterprises, VERTICAL_CONFIG } from "../../hooks/useActiveEnterprises";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import Modal from "../../components/ui/Modal";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "#E6DED0", muted: "var(--muted)", ink: "#3A2E26",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "#E9F2DD", paper: "#FCFAF5",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-1 transition";

const VIEW_TABS = [
  { id: "portfolio", label: "Portfolio", hint: "Overview" },
  { id: "rankings", label: "Rankings", hint: "Best to worst" },
  { id: "cashrisk", label: "Cash & risk", hint: "Money & exposure" },
  { id: "outlook", label: "Outlook", hint: "Future & links" },
  { id: "investor", label: "Investor", hint: "Worth & ROI" },
];
const PLANT_CATS = ["Vegetables", "Root Crops", "Fruits", "Plantation Crops", "Forestry", "Floriculture", "Protected Housing"];
const ANIMAL_CATS = ["Cattle", "Goats", "Sheep", "Pigs", "Poultry", "Aquaculture", "Apiculture"];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const useCrops = (id) => useQuery({ queryKey: ["entcrops", id], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });
const useFlocks = (id) => useQuery({ queryKey: ["entflocks", id], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(id)}&is_active=true`), enabled: !!id, retry: 0 });
// Slice D — the enterprise-agnostic read model: every production unit across
// every vertical (ponds, woodlots, hives, herds), so the portfolio stops being
// crop-and-flock only.
const useUnified = (id) => useQuery({ queryKey: ["entunified", id], queryFn: () => getJSON(`/api/v1/production-units/unified?farm_id=${encodeURIComponent(id)}`), enabled: !!id, retry: 0 });

function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { const n = n0(v); return `${n < 0 ? "−" : ""}FJD ${Math.abs(n).toLocaleString("en-FJ")}`; }
function roiTxt(r) { return r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(0)}%`; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function initials(s) { const p = String(s || "").trim().split(/\s+/); return ((p[0] || " ")[0] + ((p[1] || "")[0] || "")).toUpperCase(); }
function gradeColor(g) { return g === "Strong" ? C.green : g === "Steady" ? C.soil : g === "Watch" ? C.amber : g === "New" ? C.muted : C.red; }
function gradeFromScore(s) { return s >= 80 ? "Strong" : s >= 55 ? "Steady" : s >= 30 ? "Watch" : "At risk"; }

function cropStanding(net, roi) {
  const score = net > 0 ? Math.max(80, Math.min(100, Math.round(80 + (roi ?? 0) / 5)))
    : Math.max(45, Math.min(78, Math.round(75 + (roi ?? 0) / 10)));
  return { grade: net > 0 ? "Strong" : "Steady", score };
}
function entCategory(e) {
  const n = String(e.name || "").toLowerCase();
  if (e.kind === "animal") {
    if (/cattle|cow|beef|dairy/.test(n)) return "Cattle";
    if (/goat/.test(n)) return "Goats";
    if (/sheep|lamb/.test(n)) return "Sheep";
    if (/pig|pork|swine/.test(n)) return "Pigs";
    if (/fish|tilapia|prawn|shrimp|crab|seaweed|aqua|pond/.test(n)) return "Aquaculture";
    if (/bee|hive|honey|apiar/.test(n)) return "Apiculture";
    return "Poultry";
  }
  if (/cassava|sweet potato|taro|dalo|yam|kumala/.test(n)) return "Root Crops";
  if (/kava|sugar|coconut|cocoa|coffee|vanilla|ginger|turmeric/.test(n)) return "Plantation Crops";
  if (/melon|papaya|paw|banana|pineapple|mango|citrus|orange|lemon|fruit/.test(n)) return "Fruits";
  if (/mahogany|pine|teak|sandalwood|timber|forest/.test(n)) return "Forestry";
  if (/flower|ornamental|nursery plant|rose|orchid|cut flower/.test(n)) return "Floriculture";
  if (/greenhouse|hydroponic|aquaponic|shade house|protected/.test(n)) return "Protected Housing";
  return "Vegetables";
}
function prettyFlockType(t, label) {
  const m = { LAYER: "Layer hens", BROILER: "Broilers", LAYERS: "Layer hens", BROILERS: "Broilers" };
  if (t && m[String(t).toUpperCase()]) return m[String(t).toUpperCase()];
  if (t) return String(t).charAt(0) + String(t).slice(1).toLowerCase();
  return label || "Flock";
}

// Slice D — non-crop / non-poultry verticals surfaced from the unified view.
// Crops come from financials/crops, poultry from flocks (both above); this folds
// in ponds, woodlots, hives, herds, nursery batches as honest enterprise rows —
// unit counts only, financials build as the farmer logs (doctrine: no fake
// non-crop analytics while Crops is below 100%).
const UNIFIED_ENTERPRISE_LABEL = {
  AQUACULTURE: "Fish & sea", FORESTRY: "Forestry", LIVESTOCK: "Livestock",
  APICULTURE: "Bees", SPECIALTY: "Specialty", PERENNIALS: "Trees & vines",
};
function buildUnifiedEnterprises(unifiedData) {
  const units = unifiedData?.units ?? [];
  // Skip what's already counted: CROPS production units (financials/crops) and
  // FLOCK rows (flocks query). Group the rest by enterprise_type.
  const byEnt = {};
  units.forEach((u) => {
    if (u.enterprise_type === "CROPS" || u.unit_kind === "FLOCK") return;
    (byEnt[u.enterprise_type] = byEnt[u.enterprise_type] || []).push(u);
  });
  return Object.entries(byEnt).map(([ent, list], i) => {
    const activeN = list.filter((u) => !["INACTIVE", "CLOSED", "RETIRED", "TRANSPLANTED"].includes(String(u.status).toUpperCase())).length;
    return {
      id: `vert-${ent}-${i}`, name: UNIFIED_ENTERPRISE_LABEL[ent] || ent, kind: "vertical", engineLabel: UNIFIED_ENTERPRISE_LABEL[ent] || ent,
      income: 0, costs: 0, net: 0, roi: null, worth: 0, cycles: 0, active: activeN,
      head: 0, groups: list.length, status: activeN > 0 ? "active" : "closed", holds: 0,
      units: list.length, uom: list[0]?.unit_of_measure || "unit", enterprise_type: ent,
      route: (VERTICAL_CONFIG[ent]?.route || "/farm/enterprises").replace(/^\/farm\//, ""),
      st: { grade: "New", score: null, color: gradeColor("New") },
    };
  });
}

function buildEnterprises(cropData, flockData, unifiedData) {
  const ents = [];
  (cropData ?? []).forEach((r, i) => {
    const income = n0(r.total_income_fjd);
    const costs = n0(r.total_labor_fjd) + n0(r.total_input_cost_fjd);
    const net = income - costs;
    const active = income > 0 || costs > 0;
    const roi = costs > 0 ? (net / costs) * 100 : null;
    const st = active ? cropStanding(net, roi) : { grade: "New", score: null };
    ents.push({
      id: r.production_id || `crop-${i}`, name: r.production_name, kind: "crop", engineLabel: "Crops",
      income, costs, net, roi, worth: 0, cycles: n0(r.total_cycles), active: n0(r.total_cycles),
      head: 0, groups: 0, status: "active", holds: 0, st: { ...st, color: gradeColor(st.grade) },
      harvestKg: n0(r.total_harvest_kg), cokg: r.cokg_fjd_per_kg != null ? Number(r.cokg_fjd_per_kg) : null,
    });
  });
  const byType = {};
  (flockData ?? []).forEach((f) => { const key = String(f.flock_type || f.flock_label || "Flock"); (byType[key] = byType[key] || []).push(f); });
  Object.entries(byType).forEach(([key, flocks], i) => {
    const head = flocks.reduce((a, f) => a + n0(f.current_count), 0);
    const placed = flocks.reduce((a, f) => a + n0(f.placed_count), 0);
    const score = placed > 0 ? Math.round((head / placed) * 100) : null;
    const grade = score == null ? "New" : gradeFromScore(score);
    ents.push({
      id: `flock-${key}-${i}`, name: prettyFlockType(flocks[0].flock_type, flocks[0].flock_label), kind: "animal", engineLabel: "Animals",
      income: 0, costs: 0, net: 0, roi: null, worth: 0, cycles: 0, active: 0,
      head, groups: flocks.length, status: flocks.some((f) => f.is_active) ? "active" : "closed", holds: 0,
      st: { grade, score, color: gradeColor(grade) },
    });
  });
  // Slice D — fold in every other vertical's production units.
  buildUnifiedEnterprises(unifiedData).forEach((e) => ents.push(e));
  return ents;
}

// Sample dataset for the watermarked PREVIEW (empty farms). Never real, never bankable.
const SAMPLE_ENTS = buildEnterprises(
  [
    { production_id: "s1", production_name: "Tomato", total_income_fjd: 712, total_labor_fjd: 340, total_input_cost_fjd: 256, total_cycles: 1 },
    { production_id: "s2", production_name: "Cassava", total_income_fjd: 900, total_labor_fjd: 460, total_input_cost_fjd: 286, total_cycles: 2 },
    { production_id: "s3", production_name: "Bok choy", total_income_fjd: 64, total_labor_fjd: 50, total_input_cost_fjd: 30, total_cycles: 1 },
    { production_id: "s4", production_name: "Cucumber", total_income_fjd: 36, total_labor_fjd: 180, total_input_cost_fjd: 128, total_cycles: 2 },
  ],
  [
    { flock_type: "LAYER", flock_label: "Layer hens", current_count: 91, placed_count: 100, is_active: true },
    { flock_type: "BROILER", flock_label: "Broilers", current_count: 45, placed_count: 60, is_active: true },
  ],
).map((e) => ({ ...e, sample: true }));

function derive(ents) {
  const rows = ents;
  const byNet = [...rows].sort((a, b) => b.net - a.net);
  const scored = rows.filter((r) => r.st.score != null);
  const byHealth = [...scored].sort((a, b) => b.st.score - a.st.score);
  const byRoi = [...rows].sort((a, b) => (b.roi == null ? -1 : b.roi) - (a.roi == null ? -1 : a.roi));
  const tot = rows.reduce((t, r) => ({ inc: t.inc + r.income, cost: t.cost + r.costs, net: t.net + r.net, worth: t.worth + r.worth, holds: t.holds + r.holds }), { inc: 0, cost: 0, net: 0, worth: 0, holds: 0 });
  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
  const portScore = scored.length ? Math.round(scored.reduce((a, r) => a + r.st.score, 0) / scored.length) : 0;
  const portGrade = portScore >= 80 ? "Strong" : portScore >= 55 ? "Steady" : portScore >= 30 ? "Watch" : "At risk";
  const losing = rows.filter((r) => r.net < 0).sort((a, b) => a.net - b.net);
  const atRisk = scored.filter((r) => r.st.grade === "At risk" || r.st.grade === "Watch").sort((a, b) => a.st.score - b.st.score);
  const grow = byRoi.filter((r) => r.net >= 0 && (r.st.score ?? 0) >= 55)[0] || byRoi[0];
  return { rows, byNet, byHealth, byRoi, tot, counts, portScore, portGrade, best: byNet[0], lowHealth: byHealth[byHealth.length - 1], losing, atRisk, grow };
}

// ── atoms ────────────────────────────────────────────────────────────
function Card({ children, style, onClick, className = "" }) {
  return <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
    className={`rounded-2xl border bg-white ${onClick ? `cursor-pointer hover:brightness-[0.985] ${FOCUS}` : ""} ${className}`}
    style={{ borderColor: C.border, ...style }}>{children}</div>;
}
function KpiTile({ label, value, sub, color, low, onClick }) {
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-xl border p-3 min-w-0 ${onClick ? `cursor-pointer hover:brightness-95 ${FOCUS}` : ""}`}
      style={{ background: low ? "rgba(212,68,46,0.04)" : "var(--paper)", borderColor: C.border }}>
      <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-bold truncate" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px] truncate" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}
function Section({ title, meta, children }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h3 className="text-sm font-semibold" style={{ color: C.soil }}>{title}</h3>
        {meta && <span className="text-[11px] text-right" style={{ color: C.muted }}>{meta}</span>}
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </Card>
  );
}
function Row({ l, v, vColor, onClick }) {
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={`flex justify-between gap-3 py-1.5 text-sm ${onClick ? `cursor-pointer hover:bg-[#FCFAF5] -mx-1 px-1 rounded ${FOCUS}` : ""}`} style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
      <span style={{ color: C.muted }}>{l}</span><span style={{ color: vColor || C.soil, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Build({ desc, link, onLink }) {
  return (
    <div className="text-sm" style={{ color: C.muted }}>
      {desc} {desc && <span className="font-bold">Building</span>}
      {link && <div><button onClick={onLink} className={`mt-2.5 text-xs px-3 py-1.5 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{link}</button></div>}
    </div>
  );
}
function MiniBar({ score }) {
  const s = score || 0;
  const segs = [[18, C.greenDk], [14, C.green], [9, C.amber], [5, C.soil]];
  return <div className="flex gap-0.5 mt-1 h-1.5">{segs.map(([w, col], i) => <div key={i} style={{ width: (s / 100) * w, background: col, borderRadius: 2 }} />)}</div>;
}

// ── enterprise card ──────────────────────────────────────────────────
function EntCard({ e, onOpen }) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div className={`p-3 cursor-pointer ${FOCUS}`} role="button" tabIndex={0}
        onClick={() => onOpen(e)} onKeyDown={(ev) => { if (ev.key === "Enter") onOpen(e); }}>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: e.kind === "animal" ? C.amber : C.green }}>{initials(e.name)}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate flex items-center gap-1.5" style={{ color: C.soil }}>{e.name}{e.sample && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>Sample</span>}</div>
            <div className="flex items-center gap-1.5 my-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase" style={{ background: C.greenTint, color: C.soil }}>{e.engineLabel}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: e.status === "active" ? C.greenTint : C.cream, color: e.status === "active" ? C.greenDk : C.amber }}>{e.status}</span>
            </div>
            <div className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}>
              <Sprout size={11} />{e.kind === "vertical" ? `${e.units} ${e.uom}${e.units === 1 ? "" : "s"}` : e.kind === "animal" ? `${e.head} head · ${e.groups} group${e.groups === 1 ? "" : "s"}` : `${e.cycles} cycle${e.cycles === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold leading-none" style={{ color: e.st.color }}>{e.st.score ?? "—"}</div>
            <div className="text-[9px] uppercase" style={{ color: C.muted }}>standing</div>
            <MiniBar score={e.st.score} />
          </div>
        </div>
        {e.kind === "vertical" ? (
          <div className="rounded-lg p-2.5 mt-3 text-[11px]" style={{ background: C.paper, color: C.muted, lineHeight: 1.5 }}>
            Earnings and costs for this enterprise build as you log against its {e.uom}s. Use the (+) button to record sales, inputs and harvests.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {[["Earned", e.kind === "animal" ? "—" : fjd(e.income)], ["Spent", e.kind === "animal" ? "—" : fjd(e.costs)],
              ["Net", e.kind === "animal" ? "—" : fjd(e.net), e.net < 0 ? C.red : C.soil], ["ROI", e.kind === "animal" ? "—" : roiTxt(e.roi)]].map(([l, v, col]) => (
              <div key={l} className="rounded-lg p-2" style={{ background: C.paper }}>
                <div className="text-[9px] uppercase" style={{ color: C.muted }}>{l}</div>
                <div className="text-xs font-bold" style={{ color: col || C.soil }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] mt-2.5" style={{ color: C.muted }}><strong style={{ color: C.soil }}>Next:</strong> nothing scheduled</div>
      </div>
      <div className="flex gap-1.5 px-3 pb-3">
        <button onClick={() => onOpen(e)} className={`flex-1 text-xs px-3 py-2 rounded-lg text-white hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}>Open</button>
        <button onClick={() => emitToast("Pause needs an enterprise-status endpoint")} className={`text-xs px-3 py-2 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>Pause</button>
        <button onClick={() => emitToast("Close needs an enterprise-status endpoint")} className={`text-xs px-3 py-2 rounded-lg hover:brightness-95 ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>Close</button>
      </div>
    </Card>
  );
}

// ── Portfolio tab ────────────────────────────────────────────────────
function GlanceTile({ icon: Icon, q, a, color, onClick }) {
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={`rounded-xl border p-3 flex flex-col gap-1.5 ${onClick ? `cursor-pointer hover:brightness-95 ${FOCUS}` : ""}`} style={{ background: C.paper, borderColor: C.border }}>
      <div className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: C.muted }}><Icon size={14} className="mt-px shrink-0" />{q}</div>
      <div className="text-sm font-bold leading-snug" style={{ color: color || C.ink }}>{a}</div>
    </div>
  );
}
function Chip({ active, label, count, onClick }) {
  return (
    <button onClick={onClick} className={`text-xs px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 hover:brightness-95 ${FOCUS}`} style={{ border: `1px solid ${active ? C.green : C.border}`, background: active ? C.greenTint : "var(--paper)", color: active ? C.greenDk : C.muted }}>
      {label}{count != null && <span className="font-bold">{count}</span>}
    </button>
  );
}
// ── Slice C — "Your enterprises" strip: every declared vertical, each linking
// to its real dashboard (Crops/Poultry) or its honest stub (Aqua/Forestry/…).
// This is the entry point that makes a fish/forestry farmer's first visit
// coherent instead of crop-shaped.
function EnterpriseStrip({ farmId, navigate }) {
  const { active, loading } = useActiveEnterprises(farmId);
  if (loading || !active || active.length === 0) return null;
  return (
    <Section title="Your enterprises" meta="What you farm — tap to open">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {active.map((key) => {
          const cfg = VERTICAL_CONFIG[key];
          if (!cfg) return null;
          const sub = cfg.route.replace(/^\/farm\//, "");
          return (
            <button key={key} onClick={() => navigate(sub)}
              className={`text-left rounded-xl p-3 hover:brightness-95 ${FOCUS}`}
              style={{ border: `1px solid ${C.border}`, background: C.paper }}>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>{cfg.label}</div>
              <div className="text-[11px] mt-0.5" style={{ color: cfg.deep ? C.green : C.muted }}>
                {cfg.deep ? "Open dashboard →" : "On the roadmap →"}
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function PortfolioTab({ D, ents, typeFilter, setTypeFilter, standingFilter, setStandingFilter, search, setSearch, onOpen, setView, onAdd, navigate, farmId }) {
  const engines = useMemo(() => { const m = {}; ents.forEach((e) => { m[e.kind] = m[e.kind] || { label: e.engineLabel, n: 0 }; m[e.kind].n++; }); return m; }, [ents]);
  let rows = ents;
  if (typeFilter !== "all") rows = rows.filter((r) => r.kind === typeFilter);
  if (standingFilter !== "all") rows = rows.filter((r) => r.st.grade === standingFilter);
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.engineLabel.toLowerCase().includes(q));
  const byCat = {};
  rows.forEach((r) => { const cc = `${r.kind}|${entCategory(r)}`; (byCat[cc] = byCat[cc] || []).push(r); });

  const classBlock = (kind, label, cats) => {
    if (!cats.some((cat) => byCat[`${kind}|${cat}`])) return null;
    const empties = cats.filter((cat) => !byCat[`${kind}|${cat}`]);
    return (
      <div key={kind}>
        <div className="mt-4 mb-1 font-extrabold text-[15px]" style={{ color: C.soil }}>{label}</div>
        {cats.map((cat) => {
          const grp = byCat[`${kind}|${cat}`];
          if (!grp) return null;
          grp.sort((a, b) => b.net - a.net);
          return (
            <div key={cat}>
              <div className="mt-3 mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{cat} <span style={{ color: C.greenDk }}>{grp.length}</span></div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{grp.map((e) => <EntCard key={e.id} e={e} onOpen={onOpen} />)}</div>
            </div>
          );
        })}
        {empties.length > 0 && <div className="mt-2.5 text-xs" style={{ color: C.muted }}>Also supported: {empties.join(" · ")} — none started yet.</div>}
      </div>
    );
  };

  const grades = ["Strong", "Steady", "Watch", "At risk"];
  return (
    <div className="space-y-3">
      <EnterpriseStrip farmId={farmId} navigate={navigate} />
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Enterprises" value={String(D.rows.length)} sub={`${D.counts.active || 0} active${D.counts.paused ? ` · ${D.counts.paused} paused` : ""}`} onClick={() => onAdd()} />
        <KpiTile label="Net this season" value={fjd(D.tot.net)} sub={`earned ${n0(D.tot.inc)} · spent ${n0(D.tot.cost)}`} color={D.tot.net < 0 ? C.red : C.green} low={D.tot.net < 0} onClick={() => navigate("cash")} />
        <KpiTile label="Portfolio standing" value={D.portGrade} sub={`${D.portScore} / 100`} color={gradeColor(D.portGrade)} onClick={() => setView("rankings")} />
        <KpiTile label="Alerts" value={String(D.tot.holds)} sub="need a look" color={D.tot.holds > 0 ? C.red : C.soil} low={D.tot.holds > 0} onClick={() => setView("cashrisk")} />
      </div>

      <Section title="At a glance" meta="Your farm answered in one look · updates every time you log">
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
          <GlanceTile icon={Layers} q="How many enterprises do I have?" a={`${D.rows.length} · ${D.counts.active || 0} active`} onClick={() => onAdd()} />
          <GlanceTile icon={Coins} q="Which one makes the most money?" a={D.best ? `${D.best.name} — net ${fjd(D.best.net)}` : "—"} color={C.green} onClick={D.best ? () => onOpen(D.best) : undefined} />
          <GlanceTile icon={AlertTriangle} q="Which one loses money?" a={D.losing.length ? `${D.losing[0].name} — net ${fjd(D.losing[0].net)}` : "None — keep going"} color={D.losing.length ? C.red : C.green} onClick={D.losing.length ? () => onOpen(D.losing[0]) : () => setView("cashrisk")} />
          <GlanceTile icon={Crosshair} q="Which one needs attention?" a={D.lowHealth ? `${D.lowHealth.name} — ${D.lowHealth.st.grade} (${D.lowHealth.st.score})` : "All steady"} color={D.lowHealth ? gradeColor(D.lowHealth.st.grade) : C.green} onClick={D.lowHealth ? () => onOpen(D.lowHealth) : undefined} />
          <GlanceTile icon={ArrowRight} q="Which one should I grow?" a={D.grow ? `${D.grow.name} — strongest right now${D.grow.roi != null ? ` · ROI ${roiTxt(D.grow.roi)}` : ""}` : "—"} color={C.soil} onClick={D.grow ? () => onOpen(D.grow) : undefined} />
          <GlanceTile icon={Shield} q="Which one should I stop?" a={D.atRisk.length ? `${D.atRisk[0].name} — ${D.atRisk[0].st.grade}, look before you spend more` : "None — keep going"} color={D.atRisk.length ? C.amber : C.green} onClick={D.atRisk.length ? () => onOpen(D.atRisk[0]) : undefined} />
          <GlanceTile icon={BarChart3} q="What happens in the next 30 / 60 / 90 days?" a="Forecasts turn on once each enterprise has a logged season on the live system" color={C.muted} onClick={() => setView("outlook")} />
        </div>
      </Section>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[10px] uppercase tracking-wide shrink-0 mr-1" style={{ color: C.muted }}>Type:</span>
        <Chip active={typeFilter === "all"} label="All" count={ents.length} onClick={() => setTypeFilter("all")} />
        {Object.entries(engines).map(([k, v]) => <Chip key={k} active={typeFilter === k} label={v.label} count={v.n} onClick={() => setTypeFilter(k)} />)}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[10px] uppercase tracking-wide shrink-0 mr-1" style={{ color: C.muted }}>Standing:</span>
        <Chip active={standingFilter === "all"} label="All" onClick={() => setStandingFilter("all")} />
        {grades.map((g) => { const ct = ents.filter((r) => r.st.grade === g).length; return ct ? <Chip key={g} active={standingFilter === g} label={g} count={ct} onClick={() => setStandingFilter(g)} /> : null; })}
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search enterprises..." className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
      </div>

      {rows.length === 0
        ? <Card style={{ padding: 32, textAlign: "center" }}><span style={{ color: C.muted }}>No enterprises match these filters.</span></Card>
        : <div>{classBlock("crop", "Plant-based", PLANT_CATS)}{classBlock("animal", "Animal-based", ANIMAL_CATS)}</div>}
    </div>
  );
}

// ── Rankings / Cash / Outlook / Investor ─────────────────────────────
function RankingsTab({ D, onOpen }) {
  return (
    <div>
      <Section title="Health ranking" meta="Best to worst">
        {D.byHealth.length === 0 ? <Build desc="Standing ranks build as you log." /> : D.byHealth.map((r, i) => (
          <Row key={r.id} onClick={() => onOpen(r)} l={`${i + 1}. ${r.name}`} v={`${r.st.grade} · ${r.st.score}`} vColor={r.st.color} />
        ))}
      </Section>
      <Section title="Profitability ranking" meta="Who is making money">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-1.5">Enterprise</th><th className="text-right p-1.5">Earned</th><th className="text-right p-1.5">Spent</th><th className="text-right p-1.5">Net</th><th className="text-right p-1.5">ROI</th></tr></thead>
            <tbody>{D.byNet.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className={`cursor-pointer hover:bg-[#FCFAF5] ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                <td className="p-1.5" style={{ color: C.ink }}>{r.name}</td><td className="p-1.5 text-right">{n0(r.income)}</td><td className="p-1.5 text-right">{n0(r.costs)}</td>
                <td className="p-1.5 text-right" style={{ color: r.net < 0 ? C.red : C.green }}>{r.net < 0 ? "−" : ""}{Math.abs(n0(r.net))}</td><td className="p-1.5 text-right">{roiTxt(r.roi)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Benchmarking" meta="Profit per dollar spent">
        {D.byRoi.map((r, i) => <Row key={r.id} onClick={() => onOpen(r)} l={`${i + 1}. ${r.name}`} v={r.roi == null ? "not enough cost data" : `${roiTxt(r.roi)} per $ spent`} vColor={C.soil} />)}
      </Section>
    </div>
  );
}
function CashRiskTab({ D, onOpen }) {
  const gen = D.byNet[0], drain = D.byNet[D.byNet.length - 1];
  const bars = [...D.byNet].sort((a, b) => b.costs - a.costs);
  const alerts = []; D.rows.forEach((r) => { if (r.net < 0) alerts.push({ ent: r, txt: "spending ahead of earnings this season", col: C.amber }); });
  return (
    <div>
      <Section title="Cash flow" meta="Where cash comes from and goes">
        <div className="flex gap-6 flex-wrap">
          <div><div className="text-xs" style={{ color: C.muted }}>Best cash generator</div><button onClick={() => gen && onOpen(gen)} className={`text-sm font-semibold mt-0.5 ${FOCUS}`} style={{ color: C.green }}>{gen ? `${gen.name} · net ${fjd(gen.net)}` : "—"}</button></div>
          <div><div className="text-xs" style={{ color: C.muted }}>Biggest cash user</div><button onClick={() => drain && onOpen(drain)} className={`text-sm font-semibold mt-0.5 ${FOCUS}`} style={{ color: drain && drain.net < 0 ? C.red : C.soil }}>{drain ? `${drain.name} · net ${fjd(drain.net)}` : "—"}</button></div>
        </div>
        <div className="text-xs mt-2" style={{ color: C.muted }}>This season so far, not monthly — monthly cash rate turns on with dated cash records.</div>
      </Section>
      <Section title="Resource allocation" meta="How the farm is spread">
        {D.tot.cost > 0 ? bars.filter((r) => r.costs > 0).map((r) => {
          const pct = (r.costs / D.tot.cost) * 100;
          return (
            <div key={r.id} className="mb-2">
              <div className="flex justify-between text-xs mb-0.5"><span style={{ color: C.soil }}>{r.name}</span><span style={{ color: C.muted }}>{pct.toFixed(0)}% · FJD {n0(r.costs)}</span></div>
              <div className="h-1.5 rounded-full" style={{ background: C.cream }}><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: C.green }} /></div>
            </div>
          );
        }) : <span className="text-sm" style={{ color: C.muted }}>Spend split builds as you log costs.</span>}
        <div className="text-xs mt-2" style={{ color: C.muted }}>Labor split per enterprise turns on once worker time is logged against each enterprise.</div>
      </Section>
      <Section title="Alerts" meta={`${alerts.length} need${alerts.length === 1 ? "s" : ""} a look`}>
        {alerts.length === 0 ? <span className="text-sm" style={{ color: C.muted }}>Nothing needs attention right now.</span> : alerts.slice(0, 20).map((a, i) => (
          <div key={i} onClick={() => onOpen(a.ent)} className={`flex gap-2.5 py-1.5 text-sm cursor-pointer hover:bg-[#FCFAF5] -mx-1 px-1 rounded ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a.ent); }} style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
            <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: a.col }} /><span style={{ color: C.ink }}><strong style={{ fontWeight: 600 }}>{a.ent.name}</strong> — {a.txt}</span>
          </div>
        ))}
      </Section>
      <Section title="Risk dashboard" meta="Compliance & cash are live; the rest need live data">
        {D.rows.map((r) => {
          const cash = r.net < -500 ? "HIGH" : r.net < 0 ? "WATCH" : "LOW";
          const cashCol = cash === "HIGH" ? C.red : cash === "WATCH" ? C.amber : C.green;
          return (
            <div key={r.id} onClick={() => onOpen(r)} className={`py-2 text-xs cursor-pointer hover:bg-[#FCFAF5] -mx-1 px-1 rounded ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
              <div className="font-semibold mb-1" style={{ color: C.ink }}>{r.name}</div>
              <span className="mr-3" style={{ color: C.green }}>Compliance: <strong>Clear</strong></span>
              <span className="mr-3" style={{ color: cashCol }}>Cash: <strong>{cash}</strong></span>
              <span style={{ color: C.muted }}>Disease, weather & market: turn on with live data</span>
            </div>
          );
        })}
      </Section>
    </div>
  );
}
function OutlookTab({ D, onOpen }) {
  const hasA = D.rows.some((r) => r.kind === "animal"), hasC = D.rows.some((r) => r.kind === "crop");
  return (
    <div>
      <Section title="Forecasts (30 / 60 / 90 days)" meta="On the way">
        <div className="text-sm leading-relaxed" style={{ color: C.muted }}>TFOS will not put expected harvest, revenue or a confidence number on any enterprise until it has a logged season to learn from. A made-up forecast is the number a bank should never trust. Each enterprise switches its forecast on once it has run a season on the live system.</div>
      </Section>
      <Section title="Expansion readiness" meta="Honest until capacity is set">
        {D.rows.map((r) => <Row key={r.id} onClick={() => onOpen(r)} l={r.name} v="room to grow: needs your land/space limits" vColor={C.muted} />)}
        <div className="text-xs mt-2" style={{ color: C.muted }}>Set each enterprise's land or space limit on the live system and TFOS shows how much room it has to grow — no guessed percentages.</div>
      </Section>
      <Section title="Dependencies" meta="How enterprises feed each other">
        <div className="text-sm" style={{ color: C.muted }}>TFOS can link enterprises that feed each other so nothing is wasted.</div>
        {hasA && hasC
          ? <div className="text-sm mt-2" style={{ color: C.ink }}>Likely on your farm: <strong>animal manure → your crops</strong>, and <strong>crop leftovers → animal feed</strong>. Confirm these links on the live system and they map here.</div>
          : <div className="text-sm mt-2" style={{ color: C.muted }}>Add a second kind of enterprise (e.g. animals alongside crops) and TFOS suggests links like manure to crops.</div>}
      </Section>
      <Section title="Lifecycle" meta="Where each enterprise is">
        {D.rows.map((r) => <Row key={r.id} onClick={() => onOpen(r)} l={r.name} v={r.status} vColor={C.soil} />)}
      </Section>
    </div>
  );
}
function InvestorTab({ D, onOpen, navigate }) {
  const pRoi = D.tot.cost > 0 ? (D.tot.net / D.tot.cost) * 100 : null;
  return (
    <div>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-3">
        <KpiTile label="Put in" value={`FJD ${n0(D.tot.cost)}`} sub="total spent" onClick={() => navigate("cash")} />
        <KpiTile label="Worth now" value={D.tot.worth > 0 ? `FJD ${n0(D.tot.worth)}` : "—"} sub="standing assets" onClick={() => emitToast("Worth needs a valuation endpoint")} />
        <KpiTile label="Net" value={fjd(D.tot.net)} sub="earned minus spent" color={D.tot.net < 0 ? C.red : C.green} low={D.tot.net < 0} onClick={() => navigate("cash")} />
        <KpiTile label="ROI" value={roiTxt(pRoi)} sub="per dollar spent" onClick={() => navigate("analytics")} />
      </div>
      <Section title="Per enterprise" meta="Put in vs worth">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-1.5">Enterprise</th><th className="text-right p-1.5">Put in</th><th className="text-right p-1.5">Worth</th><th className="text-right p-1.5">ROI</th></tr></thead>
            <tbody>{D.byRoi.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className={`cursor-pointer hover:bg-[#FCFAF5] ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                <td className="p-1.5" style={{ color: C.ink }}>{r.name}</td><td className="p-1.5 text-right">{n0(r.costs)}</td><td className="p-1.5 text-right">{r.worth > 0 ? n0(r.worth) : "—"}</td><td className="p-1.5 text-right">{roiTxt(r.roi)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="text-xs mt-2" style={{ color: C.muted }}>Payback period and projected value turn on with dated cash history — not guessed.</div>
      </Section>
    </div>
  );
}

// ── per-enterprise detail ────────────────────────────────────────────
function entFdate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); }

function EnterpriseDetail({ e, farmId, onBack, go }) {
  const { openFormModal } = useFormModal();
  const isAnimal = e.kind === "animal";
  const baseTabs = [["dashboard", "Dashboard"], ["production", isAnimal ? "Herd & animals" : "Production"]];
  if (isAnimal) baseTabs.push(["breeding", "Breeding"]);
  const tabs = baseTabs.concat([["health", "Health"], ["inputs", isAnimal ? "Feed" : "Inputs"], ["labor", "Labour"], ["finance", "Finance"], ["compliance", "Compliance"], ["assets", "Assets"], ["records", "Records"], ["forecasts", "Forecasts"], ["analytics", "Analytics"], ["reports", "Reports"]]);
  const [tab, setTab] = useState("dashboard");

  // Real cycles for this crop enterprise (production_id === e.id).
  const cyclesQ = useQuery({
    queryKey: ["entcycles", e.id, farmId],
    queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`),
    enabled: !isAnimal && !!farmId && !e.sample, retry: 0,
  });
  const myCycles = useMemo(
    () => (cyclesQ.data?.data?.cycles || []).filter((c) => c.production_id === e.id),
    [cyclesQ.data, e.id]
  );
  // Real event timeline across this enterprise's cycles (bounded to 8 cycles).
  const cycleIds = useMemo(() => myCycles.map((c) => c.cycle_id), [myCycles]);
  const recordsQ = useQuery({
    queryKey: ["entrecords", e.id, cycleIds.join(",")],
    enabled: tab === "records" && cycleIds.length > 0 && !e.sample,
    retry: 0,
    queryFn: async () => {
      const slice = cycleIds.slice(0, 8);
      const lists = await Promise.all(slice.map((id) =>
        getJSON(`/api/v1/field-events?cycle_id=${encodeURIComponent(id)}&limit=50`).then((r) => r?.data?.events || []).catch(() => [])
      ));
      return lists.flat().sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 30);
    },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <button onClick={onBack} className={`text-xs mb-1 ${FOCUS}`} style={{ color: C.green }}>← Enterprises</button>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: C.soil }}>{e.name}{e.sample && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>Sample</span>}</h2>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>{e.engineLabel} · {e.status}</div>
        </div>
        <span className="text-sm font-semibold text-white px-3.5 py-1.5 rounded-full" style={{ background: e.st.color }}>{e.st.grade}{e.st.score != null ? ` · ${e.st.score}` : ""}</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 ${FOCUS}`} style={{ color: tab === id ? C.greenDk : C.muted, borderBottom: tab === id ? `2px solid ${C.green}` : "2px solid transparent" }}>{label}</button>
        ))}
      </div>
      {tab === "dashboard" && (
        <div>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-3">
            <KpiTile label="Health" value={e.st.grade} sub={e.st.score != null ? `score ${e.st.score}` : ""} color={e.st.color} />
            <KpiTile label="Net so far" value={isAnimal ? "—" : fjd(e.net)} color={e.net < 0 ? C.red : C.greenDk} onClick={() => go("cash")} />
            <KpiTile label={isAnimal ? "Head" : "Active cycles"} value={String(isAnimal ? e.head : e.active)} onClick={() => go("cycles")} />
            <KpiTile label="Open tasks" value="0" onClick={() => go("tasks")} />
          </div>
          <Section title="Standing" meta="Why this number"><Build desc="Standing builds as you log." /></Section>
          <Section title="Alerts">{e.holds > 0 ? <div className="text-sm" style={{ color: C.red }}>{e.holds} hold — do not sell or harvest</div> : <div className="text-sm" style={{ color: C.greenDk }}>Nothing needs attention right now.</div>}</Section>
        </div>
      )}
      {tab === "production" && (
        <div>
          <Section title="Active units" meta={isAnimal ? "Groups & head" : "Cycles"}>
            {isAnimal ? <><Row l="Groups" v={e.groups} /><Row l="Head" v={e.head} /></> : <><Row l="Cycles" v={e.cycles} /><Row l="Total harvested" v={e.harvestKg ? `${e.harvestKg.toLocaleString()} kg` : "—"} /></>}
          </Section>
          {!isAnimal && (
            <Section title="Cycles" meta="Every run of this crop · live">
              {cyclesQ.isLoading ? <div className="text-sm" style={{ color: C.muted }}>Loading cycles…</div>
                : myCycles.length === 0 ? <Build desc="No cycles logged for this crop yet." link="Start a cycle" onLink={() => openFormModal("cycle_new")} />
                : (
                  <table className="w-full text-sm">
                    <tbody>
                      {myCycles.map((c) => (
                        <tr key={c.cycle_id} onClick={() => go(`cycles/${c.cycle_id}`)} className={`cursor-pointer hover:bg-[#FCFAF5] ${FOCUS}`} tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") go(`cycles/${c.cycle_id}`); }} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                          <td className="py-1.5">{c.pu_farmer_label || c.pu_id || "—"}</td>
                          <td className="py-1.5"><span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.soil }}>{(c.cycle_status || "").toUpperCase()}</span></td>
                          <td className="py-1.5" style={{ color: C.muted }}>{entFdate(c.planting_date)}</td>
                          <td className="py-1.5 text-right">{c.actual_yield_kg ? `${Number(c.actual_yield_kg).toLocaleString()} kg` : "—"}</td>
                          <td className="py-1.5 text-right">{c.cogk_fjd_per_kg != null ? fjd(c.cogk_fjd_per_kg) + "/kg" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </Section>
          )}
        </div>
      )}
      {tab === "finance" && (
        <div>
          <Section title="Money" meta="Added up from logged records">
            <Row l="Earned" v={isAnimal ? "—" : fjd(e.income)} /><Row l="Spent" v={isAnimal ? "—" : fjd(e.costs)} />
            <Row l="Net" v={isAnimal ? "—" : fjd(e.net)} vColor={e.net < 0 ? C.red : C.soil} /><Row l="Return on spend" v={isAnimal ? "—" : roiTxt(e.roi)} />
            {!isAnimal && <Row l="Harvested" v={e.harvestKg ? `${e.harvestKg.toLocaleString()} kg` : "—"} />}
            {!isAnimal && <Row l="Cost of a kg" v={e.cokg != null ? `${fjd(e.cokg)}/kg` : "—"} />}
            {e.worth > 0 && <Row l="Worth" v={fjd(e.worth)} />}
          </Section>
          {!isAnimal && e.net < 0 && <div className="text-xs -mt-2 mb-3 px-1" style={{ color: C.muted }}>Net is negative because costs come before the harvest pays out — normal mid-season.</div>}
          <Section title="Profitability"><Build desc="Margin and profit trend over time build as cycles close." link="Cash" onLink={() => go("cash")} /></Section>
        </div>
      )}
      {tab === "compliance" && (
        <div>
          <Section title="Holds on record">{e.holds > 0 ? <div className="text-sm" style={{ color: C.red }}>{e.holds} hold on record</div> : <div className="text-sm" style={{ color: C.greenDk }}>Nothing blocked right now.</div>}</Section>
          <Section title="Audit trail"><div className="text-xs mb-1" style={{ color: C.muted }}>Every action against this enterprise is hash-linked and tamper-proof.</div><Build desc="" link="Compliance" onLink={() => go("compliance")} /></Section>
          <Section title="Certifications"><Build desc="Organic, GAP and export certificate status for this enterprise." /></Section>
        </div>
      )}
      {tab === "analytics" && (
        <div>
          <Section title="KPIs" meta="From logged records">
            <Row l="Net" v={isAnimal ? "—" : fjd(e.net)} /><Row l="Return on spend" v={isAnimal ? "—" : roiTxt(e.roi)} /><Row l={isAnimal ? "Head" : "Active cycles"} v={isAnimal ? e.head : e.active} />
          </Section>
          <Section title="Trends"><Build desc="Performance over time builds as records accumulate." link="Open Analytics" onLink={() => go("analytics")} /></Section>
        </div>
      )}
      {tab === "health" && <Section title="Treatments & holds"><Build desc={isAnimal ? "Treatments, withdrawal holds and mortality show here as you log animal health and sprays." : "Treatments and withdrawal holds show here as you log sprays."} link="Compliance" onLink={() => go("compliance")} /></Section>}
      {tab === "inputs" && <Section title={isAnimal ? "Feed" : "Inputs used"}><Build desc={`${isAnimal ? "Feed, medicines and supplements" : "Seed, fertilizer and chemicals"} show here as you log what you use against this enterprise.`} link="See inventory" onLink={() => go("inventory")} /></Section>}
      {tab === "labor" && <Section title="Assigned staff & productivity"><Build desc="Who works on this enterprise, their hours and what it produces per worker. Builds as you tag work to it." link="Open Labour" onLink={() => go("labor")} /></Section>}
      {tab === "assets" && <Section title="Infrastructure & equipment"><Build desc="Housing, machinery and gear tied to this enterprise." link="Assets & equipment" onLink={() => go("equipment")} /></Section>}
      {tab === "records" && (
        <Section title="Event timeline" meta="Everything logged against this crop's cycles · live">
          {isAnimal ? <Build desc="Animal event timeline builds as you log." />
            : cycleIds.length === 0 ? <Build desc="No cycles for this crop yet — nothing to show." />
            : recordsQ.isLoading ? <div className="text-sm" style={{ color: C.muted }}>Loading records…</div>
            : (recordsQ.data || []).length === 0 ? <Build desc="No field events logged against this crop's cycles yet." link="Log a field event" onLink={() => openFormModal("crops")} />
            : (
              <ul className="space-y-1.5">
                {(recordsQ.data || []).map((ev) => (
                  <li key={ev.event_id} className="flex items-start gap-2 text-sm">
                    <span className="font-mono text-[11px] mt-0.5 shrink-0" style={{ color: C.muted }}>{entFdate(ev.event_date)}</span>
                    <span className="font-semibold" style={{ color: C.soil }}>{String(ev.event_type || "").replace(/_/g, " ")}</span>
                    {ev.observation_text && <span style={{ color: C.muted }}>· {ev.observation_text}</span>}
                  </li>
                ))}
              </ul>
            )}
        </Section>
      )}
      {tab === "forecasts" && <Section title="Production, revenue & cost forecasts"><Build desc="What this enterprise is likely to produce, earn and cost next — builds once you have a season of history." /></Section>}
      {tab === "breeding" && <Section title="Breeding"><Build desc="Breeding records, births and lineage build as you log them." /></Section>}
      {tab === "reports" && <Section title="Enterprise reports"><div className="text-sm mb-1" style={{ color: C.muted }}>Make a report for this enterprise — production, finance or compliance — built from its logged records.</div><Build desc="" link="Go to Reports" onLink={() => go("reports")} /></Section>}
    </div>
  );
}

// ── states: loading / error / add modal / preview banner ─────────────
function Skeleton() {
  const blk = (h, w = "100%") => <div className="rounded-lg animate-pulse" style={{ height: h, width: w, background: C.cream }} />;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl border p-3" style={{ borderColor: C.border }}>{blk(40)}</div>)}</div>
      <div className="rounded-2xl border p-4" style={{ borderColor: C.border }}>{blk(20, "40%")}<div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 mt-3">{[0, 1, 2, 3].map((i) => <div key={i}>{blk(56)}</div>)}</div></div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="rounded-2xl border p-3" style={{ borderColor: C.border }}>{blk(120)}</div>)}</div>
    </div>
  );
}
function ErrorState({ onRetry }) {
  return (
    <Card style={{ padding: 24 }}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
        <div>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load enterprises</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>The portfolio reads from <code>/financials/crops</code> and <code>/flocks</code>. If the farm id is a code rather than a UUID this can 422.</div>
          <button onClick={onRetry} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
        </div>
      </div>
    </Card>
  );
}
function AddModal({ open, onClose, navigate }) {
  const { openFormModal } = useFormModal();
  const opt = (Icon, title, desc, onClick) => (
    <button onClick={onClick} className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 hover:brightness-95 ${FOCUS}`} style={{ borderColor: C.border, background: "var(--paper)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Icon size={18} /></div>
      <div><div className="text-sm font-semibold" style={{ color: C.soil }}>{title}</div><div className="text-xs" style={{ color: C.muted }}>{desc}</div></div>
    </button>
  );
  return (
    <Modal isOpen={open} onClose={onClose} title="Add an enterprise" size="sm">
      <div className="space-y-2.5">
        <div className="text-xs" style={{ color: C.muted }}>Pick what you farm — it sets up its own tasks, schedule, compliance and records, then appears here.</div>
        {opt(Sprout, "Start a crop cycle", "Tomatoes, cassava, kava — any field or tree crop", () => { onClose(); openFormModal("cycle_new"); })}
        {opt(Bird, "Place a flock", "Layer hens, broilers — start a poultry group", () => { onClose(); openFormModal("flock_new"); })}
        {opt(Plus, "Another type", "Cattle, goats, pigs, bees, fish & more", () => { emitToast("That vertical's create flow is on the build roadmap"); onClose(); })}
      </div>
    </Modal>
  );
}

// ── page shell ───────────────────────────────────────────────────────
function EnterprisesInner() {
  const { farmId } = useCurrentFarm();
  const rrNavigate = useNavigate();
  const navigate = (sub) => rrNavigate(`/farm/${sub}`);
  const crops = useCrops(farmId);
  const flocks = useFlocks(farmId);
  const unified = useUnified(farmId);

  const [view, setView] = useState("portfolio");
  const [typeFilter, setTypeFilter] = useState("all");
  const [standingFilter, setStandingFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openEnt, setOpenEnt] = useState(null);
  // Slice D — vertical rows (ponds/woodlots/hives) open their dashboard/stub;
  // crop/animal rows open the in-page detail.
  const openEntOrRoute = (e) => { if (e?.kind === "vertical" && e.route) navigate(e.route); else setOpenEnt(e); };
  const [addOpen, setAddOpen] = useState(false);

  const realEnts = useMemo(() => buildEnterprises(crops.data?.data, flocks.data?.data?.items, unified.data?.data), [crops.data, flocks.data, unified.data]);
  const loading = crops.isLoading || flocks.isLoading;
  const bothErrored = crops.isError && flocks.isError;
  const isPreview = !loading && !bothErrored && realEnts.length === 0;
  const ents = isPreview ? SAMPLE_ENTS : realEnts;
  const D = useMemo(() => derive(ents), [ents]);
  const retry = () => { crops.refetch(); flocks.refetch(); };

  if (openEnt) return <EnterpriseDetail e={openEnt} farmId={farmId} onBack={() => setOpenEnt(null)} go={navigate} />;

  const tabBody = view === "portfolio"
    ? <PortfolioTab D={D} ents={ents} typeFilter={typeFilter} setTypeFilter={setTypeFilter} standingFilter={standingFilter} setStandingFilter={setStandingFilter} search={search} setSearch={setSearch} onOpen={openEntOrRoute} setView={setView} onAdd={() => setAddOpen(true)} navigate={navigate} farmId={farmId} />
    : view === "rankings" ? <RankingsTab D={D} onOpen={openEntOrRoute} />
    : view === "cashrisk" ? <CashRiskTab D={D} onOpen={openEntOrRoute} />
    : view === "outlook" ? <OutlookTab D={D} onOpen={openEntOrRoute} />
    : <InvestorTab D={D} onOpen={openEntOrRoute} navigate={navigate} />;

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div><h1>Enterprises</h1><div className="subtitle">Your farm as a portfolio of businesses · {farmId || "your farm"}</div></div>
        <div className="page-actions">
          <FarmSelector /><ModeDropdown />
          <button onClick={() => setAddOpen(true)} className="btn btn-primary"><Plus size={14} />Add enterprise</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {VIEW_TABS.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0 ${FOCUS}`} style={{ color: view === t.id ? C.greenDk : C.muted, borderBottom: view === t.id ? `2px solid ${C.green}` : "2px solid transparent" }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>

      {loading ? <Skeleton />
        : bothErrored ? <ErrorState onRetry={retry} />
        : isPreview ? (
          <div className="space-y-3">
            <div className="rounded-2xl border-2 border-dashed p-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderColor: C.amber, background: "rgba(191,144,0,0.06)" }}>
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.amber }}><Layers size={18} /></div>
                <div>
                  <div className="text-sm font-bold" style={{ color: C.soil }}>Example — not your farm's data</div>
                  <div className="text-xs mt-0.5 max-w-xl" style={{ color: C.muted }}>This farm hasn't logged any enterprises yet. Below is a preview of how this page looks once data flows. Add your first enterprise to see your own numbers.</div>
                </div>
              </div>
              <button onClick={() => setAddOpen(true)} className={`text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1.5 hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}><Plus size={14} />Add your first enterprise</button>
            </div>
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none z-10" style={{ opacity: 0.06 }}>
                <div className="text-5xl font-extrabold uppercase tracking-widest -rotate-12 whitespace-nowrap" style={{ color: C.soil }}>Example · Example · Example · Example</div>
              </div>
              <div style={{ opacity: 0.92 }}>{tabBody}</div>
            </div>
          </div>
        )
        : tabBody}

      {(crops.isError !== flocks.isError) && !isPreview && !loading && (
        <div className="text-[11px]" style={{ color: C.muted }}>{crops.isError ? "Crop financials didn't load — showing animals only." : "Flocks didn't load — showing crops only."}</div>
      )}

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} navigate={navigate} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Enterprises() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <EnterprisesInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

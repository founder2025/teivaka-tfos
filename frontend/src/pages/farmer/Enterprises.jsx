/**
 * Enterprises.jsx — /farm/enterprises
 *
 * Redesigned 2026-06-26 (audit-approved). Your farm as a portfolio of businesses,
 * pivoted on the 3-Layer doctrine (Cash flow / Food security / Long-term asset).
 * Real data or watermarked-Sample/honest-empty only — a banker may see this.
 *
 * Fixes: EX1 (3-Layer surfaced — summary strip + per-card badge + filter; layer read
 * per crop from /cycles); EX2 (dropped the hardcoded "Open tasks: 0"); EX3 (no
 * enterprise entity → removed dead Pause/Close/Worth actions, filed a real entity);
 * E2/EX4/EX5 (no black-box /100 — honest Profitable/Building/Losing + survival%, no
 * invalid mixed average); E4 (13-tab detail → 4 real tabs + honest "more coming"); E1
 * (api.js token-refresh + de-jargoned error); E6 (no-op fallback fixed); E7 ("to date"
 * not "this season"); E8 (retry+reconnect); E9/EX8 (5 view tabs → 3; dropped redundant
 * strip); B90 (ModeDropdown gone). Watermarked "Example" preview kept.
 *
 * Filed: real enterprise entity (Pause/Close/Worth/roles), animal financials, per-
 * enterprise task count, per-block P&L grain, layer for animals/verticals, composite
 * endpoint + shared QueryClient, grounded standing, certifications.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import { useFormModal } from "../../context/FormModalContext";
import {
  Sprout, Plus, Search, Layers, Coins, AlertTriangle, Crosshair, ArrowRight,
  Bird, RefreshCw,
} from "lucide-react";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import { VERTICAL_CONFIG } from "../../hooks/useActiveEnterprises";
import FarmSelector from "../../components/farm/FarmSelector";
import Modal from "../../components/ui/Modal";
import { getJSON } from "../../utils/api";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", ink: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "var(--green-tint)", paper: "var(--cream-2)",
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] motion-reduce:transition-none transition";

const VIEW_TABS = [
  { id: "portfolio", label: "Portfolio", hint: "What you farm" },
  { id: "money", label: "Money", hint: "Profit, ROI & risk" },
  { id: "outlook", label: "Outlook", hint: "Future & links" },
];
const PLANT_CATS = ["Vegetables", "Root Crops", "Fruits", "Plantation Crops", "Forestry", "Floriculture", "Protected Housing"];
const ANIMAL_CATS = ["Cattle", "Goats", "Sheep", "Pigs", "Poultry", "Aquaculture", "Apiculture"];

// 3-Layer doctrine (Strike #101)
const LAYER = {
  CASH_FLOW: { label: "Cash flow", color: "var(--green)", blurb: "Sells fast — pays the bills" },
  FOOD_SECURITY: { label: "Food security", color: "var(--amber)", blurb: "Feeds the family & community" },
  LONG_TERM_ASSET: { label: "Long-term asset", color: "#2E6BB8", blurb: "Builds wealth over years" },
  UNCLASSIFIED: { label: "Not yet classified", color: "var(--muted)", blurb: "Set a layer when you create a cycle" },
};
const layerOf = (k) => LAYER[k] || LAYER.UNCLASSIFIED;

const useCrops = (id) => useQuery({ queryKey: ["entcrops", id], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(id)}`), enabled: !!id });
const useFlocks = (id) => useQuery({ queryKey: ["entflocks", id], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(id)}&is_active=true`), enabled: !!id });
const useUnified = (id) => useQuery({ queryKey: ["entunified", id], queryFn: () => getJSON(`/api/v1/production-units/unified?farm_id=${encodeURIComponent(id)}`), enabled: !!id });
// layer per crop: /cycles carries production_id + layer (EX1)
const useCyclesLayer = (id) => useQuery({ queryKey: ["entcycleslayer", id], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(id)}&limit=200`), enabled: !!id });

function n0(v) { return Math.round(Number(v) || 0); }
function fjd(v) { const n = n0(v); return `${n < 0 ? "−" : ""}FJD ${Math.abs(n).toLocaleString("en-FJ")}`; }
function roiTxt(r) { return r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(0)}%`; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function initials(s) { const p = String(s || "").trim().split(/\s+/); return ((p[0] || " ")[0] + ((p[1] || "")[0] || "")).toUpperCase(); }

// Honest crop standing — no black-box /100 (E2/EX5).
function cropStanding(income, net) {
  if (income > 0 && net >= 0) return { label: "Profitable", color: C.green };
  if (income > 0 && net < 0) return { label: "Losing", color: C.red };
  return { label: "Building", color: C.soil };
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

const UNIFIED_ENTERPRISE_LABEL = { AQUACULTURE: "Fish & sea", FORESTRY: "Forestry", LIVESTOCK: "Livestock", APICULTURE: "Bees", SPECIALTY: "Specialty", PERENNIALS: "Trees & vines" };
function buildUnifiedEnterprises(unifiedData) {
  const units = unifiedData?.units ?? [];
  const byEnt = {};
  units.forEach((u) => { if (u.enterprise_type === "CROPS" || u.unit_kind === "FLOCK") return; (byEnt[u.enterprise_type] = byEnt[u.enterprise_type] || []).push(u); });
  return Object.entries(byEnt).map(([ent, list], i) => {
    const activeN = list.filter((u) => !["INACTIVE", "CLOSED", "RETIRED", "TRANSPLANTED"].includes(String(u.status).toUpperCase())).length;
    return {
      id: `vert-${ent}-${i}`, name: UNIFIED_ENTERPRISE_LABEL[ent] || ent, kind: "vertical", engineLabel: UNIFIED_ENTERPRISE_LABEL[ent] || ent,
      income: 0, costs: 0, net: 0, roi: null, cycles: 0, active: activeN, head: 0, groups: list.length, status: activeN > 0 ? "active" : "closed",
      units: list.length, uom: list[0]?.unit_of_measure || "unit", layer: null,
      route: (VERTICAL_CONFIG[ent]?.route || "/farm/enterprises").replace(/^\/farm\//, ""),
      st: { label: "Building", color: C.soil },
    };
  });
}
function buildLayerMap(cyclesData) {
  const map = {};
  (cyclesData?.cycles ?? []).forEach((c) => { if (c.production_id && c.layer && !map[c.production_id]) map[c.production_id] = c.layer; });
  return map;
}
function buildEnterprises(cropData, flockData, unifiedData, layerMap = {}) {
  const ents = [];
  (cropData ?? []).forEach((r, i) => {
    const income = n0(r.total_income_fjd);
    const costs = n0(r.total_labor_fjd) + n0(r.total_input_cost_fjd);
    const net = income - costs;
    const roi = costs > 0 ? (net / costs) * 100 : null;
    ents.push({
      id: r.production_id || `crop-${i}`, name: r.production_name, kind: "crop", engineLabel: "Crops",
      income, costs, net, roi, cycles: n0(r.total_cycles), active: n0(r.total_cycles), head: 0, groups: 0,
      status: "active", layer: layerMap[r.production_id] || null, st: cropStanding(income, net),
      harvestKg: n0(r.total_harvest_kg), cokg: r.cokg_fjd_per_kg != null ? Number(r.cokg_fjd_per_kg) : null,
    });
  });
  const byType = {};
  (flockData ?? []).forEach((f) => { const key = String(f.flock_type || f.flock_label || "Flock"); (byType[key] = byType[key] || []).push(f); });
  Object.entries(byType).forEach(([key, flocks], i) => {
    const head = flocks.reduce((a, f) => a + n0(f.current_count), 0);
    const placed = flocks.reduce((a, f) => a + n0(f.placed_count), 0);
    const survival = placed > 0 ? Math.round((head / placed) * 100) : null;
    ents.push({
      id: `flock-${key}-${i}`, name: prettyFlockType(flocks[0].flock_type, flocks[0].flock_label), kind: "animal", engineLabel: "Animals",
      income: 0, costs: 0, net: 0, roi: null, cycles: 0, active: 0, head, groups: flocks.length,
      status: flocks.some((f) => f.is_active) ? "active" : "closed", layer: null, survival,
      st: { label: survival != null ? `${survival}% survival` : "Active", color: survival != null && survival < 80 ? C.amber : C.green },
    });
  });
  buildUnifiedEnterprises(unifiedData).forEach((e) => ents.push(e));
  return ents;
}

const SAMPLE_ENTS = buildEnterprises(
  [
    { production_id: "s1", production_name: "Tomato", total_income_fjd: 712, total_labor_fjd: 340, total_input_cost_fjd: 256, total_cycles: 1 },
    { production_id: "s2", production_name: "Cassava", total_income_fjd: 900, total_labor_fjd: 460, total_input_cost_fjd: 286, total_cycles: 2 },
    { production_id: "s3", production_name: "Bok choy", total_income_fjd: 64, total_labor_fjd: 50, total_input_cost_fjd: 30, total_cycles: 1 },
    { production_id: "s4", production_name: "Cucumber", total_income_fjd: 360, total_labor_fjd: 280, total_input_cost_fjd: 128, total_cycles: 2 },
  ],
  [{ flock_type: "LAYER", flock_label: "Layer hens", current_count: 91, placed_count: 100, is_active: true }],
  null,
  { s1: "CASH_FLOW", s2: "LONG_TERM_ASSET", s3: "FOOD_SECURITY", s4: "FOOD_SECURITY" },
).map((e) => ({ ...e, sample: true }));

function derive(ents) {
  const rows = ents;
  const byNet = [...rows].sort((a, b) => b.net - a.net);
  const byRoi = [...rows].sort((a, b) => (b.roi == null ? -1 : b.roi) - (a.roi == null ? -1 : a.roi));
  const tot = rows.reduce((t, r) => ({ inc: t.inc + r.income, cost: t.cost + r.costs, net: t.net + r.net }), { inc: 0, cost: 0, net: 0 });
  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
  const profitable = rows.filter((r) => r.income > 0 && r.net >= 0).length;
  // "losing" = SOLD at a loss only (income>0 && net<0) — never a mid-cycle crop (EX6)
  const losing = rows.filter((r) => r.income > 0 && r.net < 0).sort((a, b) => a.net - b.net);
  const best = byNet.find((r) => r.income > 0) || null;
  const grow = byRoi.find((r) => r.income > 0 && r.net >= 0) || null;
  // layer aggregation (EX1)
  const layerAgg = {};
  rows.forEach((r) => { const k = r.layer || "UNCLASSIFIED"; const a = layerAgg[k] = layerAgg[k] || { n: 0, net: 0, hasMoney: false }; a.n++; a.net += r.net; if (r.income > 0 || r.costs > 0) a.hasMoney = true; });
  return { rows, byNet, byRoi, tot, counts, profitable, losing, best, grow, layerAgg };
}

// ── atoms ─────────────────────────────────────────────────────────────
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
      className={`flex justify-between gap-3 py-1.5 text-sm ${onClick ? `cursor-pointer hover:bg-[var(--cream-2)] -mx-1 px-1 rounded ${FOCUS}` : ""}`} style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
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
function LayerBadge({ layer }) {
  if (!layer) return null;
  const l = layerOf(layer);
  return <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "var(--paper)", color: l.color, border: `1px solid ${C.border}` }}>{l.label}</span>;
}
function Chip({ active, label, count, onClick }) {
  return (
    <button onClick={onClick} className={`text-xs px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 hover:brightness-95 ${FOCUS}`} style={{ border: `1px solid ${active ? C.green : C.border}`, background: active ? C.greenTint : "var(--paper)", color: active ? C.greenDk : C.muted }}>
      {label}{count != null && <span className="font-bold">{count}</span>}
    </button>
  );
}

// ── 3-axis layer summary (EX1) ────────────────────────────────────────
function LayerStrip({ D, layerFilter, setLayerFilter }) {
  const order = ["CASH_FLOW", "FOOD_SECURITY", "LONG_TERM_ASSET", "UNCLASSIFIED"];
  const present = order.filter((k) => D.layerAgg[k]);
  if (present.length === 0) return null;
  return (
    <Section title="By layer" meta="Your 3-axis credit picture — tap to filter">
      <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
        {present.map((k) => {
          const l = layerOf(k); const a = D.layerAgg[k]; const on = layerFilter === k;
          return (
            <button key={k} onClick={() => setLayerFilter(on ? "all" : k)} className={`text-left rounded-xl border p-3 ${FOCUS}`}
              style={{ background: on ? C.greenTint : "var(--paper)", borderColor: on ? C.green : C.border }}>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: l.color }} /><span className="text-xs font-bold" style={{ color: C.soil }}>{l.label}</span></div>
              <div className="text-base font-bold mt-1" style={{ color: C.soil }}>{a.n} <span className="text-[11px] font-normal" style={{ color: C.muted }}>enterprise{a.n === 1 ? "" : "s"}</span></div>
              <div className="text-[11px]" style={{ color: a.hasMoney ? (a.net < 0 ? C.red : C.greenDk) : C.muted }}>{a.hasMoney ? `net ${fjd(a.net)}` : l.blurb}</div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ── enterprise card (no dead Pause/Close — EX3) ───────────────────────
function EntCard({ e, onOpen }) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div className={`p-3 cursor-pointer ${FOCUS}`} role="button" tabIndex={0} onClick={() => onOpen(e)} onKeyDown={(ev) => { if (ev.key === "Enter") onOpen(e); }}>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: e.kind === "animal" ? C.amber : C.green }}>{initials(e.name)}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate flex items-center gap-1.5" style={{ color: C.soil }}>{e.name}{e.sample && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>Sample</span>}</div>
            <div className="flex items-center gap-1.5 my-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase" style={{ background: C.greenTint, color: C.soil }}>{e.engineLabel}</span>
              <LayerBadge layer={e.layer} />
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: e.status === "active" ? C.greenTint : C.cream, color: e.status === "active" ? C.greenDk : C.amber }}>{e.status}</span>
            </div>
            <div className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}>
              <Sprout size={11} />{e.kind === "vertical" ? `${e.units} ${e.uom}${e.units === 1 ? "" : "s"}` : e.kind === "animal" ? `${e.head} head · ${e.groups} group${e.groups === 1 ? "" : "s"}` : `${e.cycles} cycle${e.cycles === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="text-right shrink-0"><div className="text-xs font-bold" style={{ color: e.st.color }}>{e.st.label}</div></div>
        </div>
        {e.kind === "vertical" ? (
          <div className="rounded-lg p-2.5 mt-3 text-[11px]" style={{ background: C.paper, color: C.muted, lineHeight: 1.5 }}>Earnings build as you log against its {e.uom}s. Use (+) to record sales, inputs and harvests.</div>
        ) : e.kind === "animal" ? (
          <div className="rounded-lg p-2.5 mt-3 text-[11px]" style={{ background: C.paper, color: C.muted, lineHeight: 1.5 }}>Money for animals turns on as flock costs &amp; sales are logged. Head &amp; survival are live.</div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {[["Earned", fjd(e.income)], ["Spent", fjd(e.costs)], ["Net", fjd(e.net), e.net < 0 ? C.red : C.soil], ["ROI", roiTxt(e.roi)]].map(([l, v, col]) => (
              <div key={l} className="rounded-lg p-2" style={{ background: C.paper }}><div className="text-[9px] uppercase" style={{ color: C.muted }}>{l}</div><div className="text-xs font-bold" style={{ color: col || C.soil }}>{v}</div></div>
            ))}
          </div>
        )}
      </div>
      <div className="px-3 pb-3"><button onClick={() => onOpen(e)} className={`w-full text-xs px-3 py-2 rounded-lg text-white hover:brightness-95 ${FOCUS}`} style={{ background: C.greenDk }}>Open</button></div>
    </Card>
  );
}

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

// ── Portfolio tab ─────────────────────────────────────────────────────
function PortfolioTab({ D, ents, typeFilter, setTypeFilter, layerFilter, setLayerFilter, standingFilter, setStandingFilter, search, setSearch, onOpen, setView, onAdd }) {
  const engines = useMemo(() => { const m = {}; ents.forEach((e) => { m[e.kind] = m[e.kind] || { label: e.engineLabel, n: 0 }; m[e.kind].n++; }); return m; }, [ents]);
  let rows = ents;
  if (typeFilter !== "all") rows = rows.filter((r) => r.kind === typeFilter);
  if (layerFilter !== "all") rows = rows.filter((r) => (r.layer || "UNCLASSIFIED") === layerFilter);
  if (standingFilter !== "all") rows = rows.filter((r) => r.st.label === standingFilter);
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.engineLabel.toLowerCase().includes(q));
  const byCat = {};
  rows.forEach((r) => { const cc = `${r.kind}|${entCategory(r)}`; (byCat[cc] = byCat[cc] || []).push(r); });

  const classBlock = (kind, label, cats) => {
    if (!cats.some((cat) => byCat[`${kind}|${cat}`])) return null;
    return (
      <div key={kind}>
        <div className="mt-4 mb-1 font-extrabold text-[15px]" style={{ color: C.soil }}>{label}</div>
        {cats.map((cat) => {
          const grp = byCat[`${kind}|${cat}`]; if (!grp) return null; grp.sort((a, b) => b.net - a.net);
          return (
            <div key={cat}>
              <div className="mt-3 mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{cat} <span style={{ color: C.greenDk }}>{grp.length}</span></div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{grp.map((e) => <EntCard key={e.id} e={e} onOpen={onOpen} />)}</div>
            </div>
          );
        })}
      </div>
    );
  };
  const standings = ["Profitable", "Building", "Losing"];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">
        <KpiTile label="Enterprises" value={String(D.rows.length)} sub={`${D.counts.active || 0} active`} onClick={() => onAdd()} />
        <KpiTile label="Net to date" value={fjd(D.tot.net)} sub={`earned ${n0(D.tot.inc)} · spent ${n0(D.tot.cost)}`} color={D.tot.net < 0 ? C.red : C.green} low={D.tot.net < 0} onClick={() => setView("money")} />
        <KpiTile label="Standing" value={`${D.profitable} profitable`} sub={D.losing.length ? `${D.losing.length} sold at a loss` : "none losing"} color={D.losing.length ? C.amber : C.green} low={D.losing.length > 0} onClick={() => setView("money")} />
      </div>

      <LayerStrip D={D} layerFilter={layerFilter} setLayerFilter={setLayerFilter} />

      <Section title="Quick answers" meta="Your farm in one look">
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
          <GlanceTile icon={Coins} q="Which makes the most money?" a={D.best ? `${D.best.name} — net ${fjd(D.best.net)}` : "Log sales to see this"} color={C.green} onClick={D.best ? () => onOpen(D.best) : undefined} />
          <GlanceTile icon={AlertTriangle} q="Which sold at a loss?" a={D.losing.length ? `${D.losing[0].name} — net ${fjd(D.losing[0].net)}` : "None — keep going"} color={D.losing.length ? C.red : C.green} onClick={D.losing.length ? () => onOpen(D.losing[0]) : undefined} />
          <GlanceTile icon={ArrowRight} q="Which should I grow?" a={D.grow ? `${D.grow.name} — best return${D.grow.roi != null ? ` · ROI ${roiTxt(D.grow.roi)}` : ""}` : "Builds with a logged season"} color={C.soil} onClick={D.grow ? () => onOpen(D.grow) : undefined} />
          <GlanceTile icon={Crosshair} q="How is my farm balanced?" a={`${Object.keys(D.layerAgg).filter((k) => k !== "UNCLASSIFIED").length} of 3 layers in use`} color={C.soil} onClick={() => setLayerFilter("all")} />
        </div>
      </Section>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[10px] uppercase tracking-wide shrink-0 mr-1" style={{ color: C.muted }}>Type:</span>
        <Chip active={typeFilter === "all"} label="All" count={ents.length} onClick={() => setTypeFilter("all")} />
        {Object.entries(engines).map(([k, v]) => <Chip key={k} active={typeFilter === k} label={v.label} count={v.n} onClick={() => setTypeFilter(k)} />)}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[10px] uppercase tracking-wide shrink-0 mr-1" style={{ color: C.muted }}>Layer:</span>
        <Chip active={layerFilter === "all"} label="All" onClick={() => setLayerFilter("all")} />
        {["CASH_FLOW", "FOOD_SECURITY", "LONG_TERM_ASSET", "UNCLASSIFIED"].map((k) => D.layerAgg[k] ? <Chip key={k} active={layerFilter === k} label={layerOf(k).label} count={D.layerAgg[k].n} onClick={() => setLayerFilter(k)} /> : null)}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[10px] uppercase tracking-wide shrink-0 mr-1" style={{ color: C.muted }}>Standing:</span>
        <Chip active={standingFilter === "all"} label="All" onClick={() => setStandingFilter("all")} />
        {standings.map((g) => { const ct = ents.filter((r) => r.st.label === g).length; return ct ? <Chip key={g} active={standingFilter === g} label={g} count={ct} onClick={() => setStandingFilter(g)} /> : null; })}
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search enterprises..." className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }} />
      </div>

      {rows.length === 0
        ? <Card style={{ padding: 32, textAlign: "center" }}><span style={{ color: C.muted }}>No enterprises match these filters.</span></Card>
        : <div>{classBlock("crop", "Plant-based", PLANT_CATS)}{classBlock("animal", "Animal-based", ANIMAL_CATS)}{classBlock("vertical", "Other verticals", [...new Set(ents.filter((e) => e.kind === "vertical").map(entCategory))])}</div>}
    </div>
  );
}

// ── Money tab (merge Rankings + Cash + Investor) ──────────────────────
function MoneyTab({ D, onOpen, navigate }) {
  const pRoi = D.tot.cost > 0 ? (D.tot.net / D.tot.cost) * 100 : null;
  return (
    <div>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-3">
        <KpiTile label="Put in" value={`FJD ${n0(D.tot.cost)}`} sub="total spent to date" onClick={() => navigate("money")} />
        <KpiTile label="Net" value={fjd(D.tot.net)} sub="earned minus spent" color={D.tot.net < 0 ? C.red : C.green} low={D.tot.net < 0} onClick={() => navigate("money")} />
        <KpiTile label="ROI" value={roiTxt(pRoi)} sub="per dollar spent" onClick={() => navigate("insights")} />
        <KpiTile label="Worth" value="—" sub="valuation on the roadmap" />
      </div>
      <Section title="Profitability" meta="Who is making money · to date">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead><tr className="text-xs" style={{ color: C.muted }}><th className="text-left p-1.5">Enterprise</th><th className="text-right p-1.5">Earned</th><th className="text-right p-1.5">Spent</th><th className="text-right p-1.5">Net</th><th className="text-right p-1.5">ROI</th></tr></thead>
            <tbody>{D.byNet.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className={`cursor-pointer hover:bg-[var(--cream-2)] ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                <td className="p-1.5" style={{ color: C.ink }}>{r.name}{r.kind === "animal" ? <span className="text-[10px]" style={{ color: C.muted }}> · money building</span> : ""}</td>
                <td className="p-1.5 text-right">{r.kind === "crop" ? n0(r.income) : "—"}</td><td className="p-1.5 text-right">{r.kind === "crop" ? n0(r.costs) : "—"}</td>
                <td className="p-1.5 text-right" style={{ color: r.net < 0 ? C.red : C.green }}>{r.kind === "crop" ? `${r.net < 0 ? "−" : ""}${Math.abs(n0(r.net))}` : "—"}</td><td className="p-1.5 text-right">{r.kind === "crop" ? roiTxt(r.roi) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Where the money goes" meta="Cost split across enterprises">
        {D.tot.cost > 0 ? [...D.byNet].filter((r) => r.costs > 0).sort((a, b) => b.costs - a.costs).map((r) => {
          const pct = (r.costs / D.tot.cost) * 100;
          return (
            <div key={r.id} className="mb-2">
              <div className="flex justify-between text-xs mb-0.5"><span style={{ color: C.soil }}>{r.name}</span><span style={{ color: C.muted }}>{pct.toFixed(0)}% · FJD {n0(r.costs)}</span></div>
              <div className="h-1.5 rounded-full" style={{ background: C.cream }}><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: C.green }} /></div>
            </div>
          );
        }) : <span className="text-sm" style={{ color: C.muted }}>Spend split builds as you log costs.</span>}
      </Section>
      <Section title="Alerts" meta={`${D.losing.length} sold at a loss`}>
        {D.losing.length === 0 ? <span className="text-sm" style={{ color: C.muted }}>Nothing is selling at a loss. Mid-season crops with costs but no harvest yet are normal and not flagged.</span>
          : D.losing.map((r) => (
            <div key={r.id} onClick={() => onOpen(r)} className={`flex gap-2.5 py-1.5 text-sm cursor-pointer hover:bg-[var(--cream-2)] -mx-1 px-1 rounded ${FOCUS}`} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: C.red }} /><span style={{ color: C.ink }}><strong style={{ fontWeight: 600 }}>{r.name}</strong> — sold for less than it cost (net {fjd(r.net)})</span>
            </div>
          ))}
      </Section>
      <div className="text-xs px-1" style={{ color: C.muted }}>Payback period, projected value and animal economics turn on with dated cash history and flock costs — never guessed.</div>
    </div>
  );
}

function OutlookTab({ D, onOpen }) {
  const hasA = D.rows.some((r) => r.kind === "animal"), hasC = D.rows.some((r) => r.kind === "crop");
  return (
    <div>
      <Section title="Forecasts (30 / 60 / 90 days)" meta="On the way">
        <div className="text-sm leading-relaxed" style={{ color: C.muted }}>TFOS won't put expected harvest, revenue or a confidence number on any enterprise until it has a logged season to learn from — a made-up forecast is the number a bank should never trust. Each enterprise switches its forecast on once it has run a season on the live system.</div>
      </Section>
      <Section title="Expansion readiness" meta="Honest until capacity is set">
        {D.rows.map((r) => <Row key={r.id} onClick={() => onOpen(r)} l={r.name} v="room to grow: needs your land/space limits" vColor={C.muted} />)}
      </Section>
      <Section title="Dependencies" meta="How enterprises feed each other">
        {hasA && hasC
          ? <div className="text-sm" style={{ color: C.ink }}>Likely on your farm: <strong>animal manure → your crops</strong>, and <strong>crop leftovers → animal feed</strong>. Confirm these on the live system and they map here.</div>
          : <div className="text-sm" style={{ color: C.muted }}>Add a second kind of enterprise (e.g. animals alongside crops) and TFOS suggests links like manure to crops.</div>}
      </Section>
      <Section title="Lifecycle" meta="Where each enterprise is">
        {D.rows.map((r) => <Row key={r.id} onClick={() => onOpen(r)} l={r.name} v={r.status} vColor={C.soil} />)}
      </Section>
    </div>
  );
}

// ── per-enterprise detail (4 real tabs — E4) ──────────────────────────
function entFdate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); }
function EnterpriseDetail({ e, farmId, onBack, go }) {
  const { openFormModal } = useFormModal();
  const isAnimal = e.kind === "animal";
  const tabs = [["dashboard", "Dashboard"], ["production", isAnimal ? "Herd" : "Production"], ["finance", "Finance"], ["records", "Records"]];
  const [tab, setTab] = useState("dashboard");
  const cyclesQ = useQuery({ queryKey: ["entcycles", e.id, farmId], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`), enabled: !isAnimal && e.kind !== "vertical" && !!farmId && !e.sample });
  const myCycles = useMemo(() => (cyclesQ.data?.data?.cycles || []).filter((c) => c.production_id === e.id), [cyclesQ.data, e.id]);
  const cycleIds = useMemo(() => myCycles.map((c) => c.cycle_id), [myCycles]);
  const recordsQ = useQuery({
    queryKey: ["entrecords", e.id, cycleIds.join(",")], enabled: tab === "records" && cycleIds.length > 0 && !e.sample,
    queryFn: async () => { const slice = cycleIds.slice(0, 8); const lists = await Promise.all(slice.map((id) => getJSON(`/api/v1/field-events?cycle_id=${encodeURIComponent(id)}&limit=50`).then((r) => r?.data?.events || []).catch(() => []))); return lists.flat().sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 30); },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <button onClick={onBack} className={`text-xs mb-1 ${FOCUS}`} style={{ color: C.green }}>← Enterprises</button>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: C.soil }}>{e.name}{e.sample && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>Sample</span>}</h2>
          <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: C.muted }}>{e.engineLabel} · {e.status}<LayerBadge layer={e.layer} /></div>
        </div>
        <span className="text-sm font-semibold text-white px-3.5 py-1.5 rounded-full" style={{ background: e.st.color }}>{e.st.label}</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 ${FOCUS}`} style={{ color: tab === id ? C.greenDk : C.muted, borderBottom: tab === id ? `2px solid ${C.green}` : "2px solid transparent" }}>{label}</button>
        ))}
      </div>
      {tab === "dashboard" && (
        <div>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-3">
            <KpiTile label="Standing" value={e.st.label} color={e.st.color} />
            <KpiTile label={isAnimal ? "Head" : "Net to date"} value={isAnimal ? String(e.head) : fjd(e.net)} color={!isAnimal && e.net < 0 ? C.red : C.greenDk} onClick={() => go("money")} />
            <KpiTile label={isAnimal ? "Groups" : "Cycles"} value={String(isAnimal ? e.groups : e.cycles)} onClick={() => go("cycles")} />
            <KpiTile label="Layer" value={e.layer ? layerOf(e.layer).label : "—"} sub={e.layer ? layerOf(e.layer).blurb : "set on a cycle"} color={layerOf(e.layer).color} />
          </div>
          <Section title="Alerts">{e.income > 0 && e.net < 0 ? <div className="text-sm" style={{ color: C.red }}>Sold for less than it cost — review pricing and inputs.</div> : <div className="text-sm" style={{ color: C.greenDk }}>Nothing needs attention right now.</div>}</Section>
          <div className="text-xs px-1" style={{ color: C.muted }}>Health, inputs, labour, assets, forecasts &amp; reports for this enterprise are on the way.</div>
        </div>
      )}
      {tab === "production" && (
        <div>
          <Section title="Active units" meta={isAnimal ? "Groups & head" : "Cycles"}>
            {isAnimal ? <><Row l="Groups" v={e.groups} /><Row l="Head" v={e.head} /><Row l="Survival" v={e.survival != null ? `${e.survival}%` : "—"} /></> : e.kind === "vertical" ? <Row l="Units" v={`${e.units} ${e.uom}${e.units === 1 ? "" : "s"}`} /> : <><Row l="Cycles" v={e.cycles} /><Row l="Total harvested" v={e.harvestKg ? `${e.harvestKg.toLocaleString()} kg` : "—"} /></>}
          </Section>
          {!isAnimal && e.kind !== "vertical" && (
            <Section title="Cycles" meta="Every run of this crop · live">
              {cyclesQ.isLoading ? <div className="text-sm" style={{ color: C.muted }}>Loading cycles…</div>
                : myCycles.length === 0 ? <Build desc="No cycles logged for this crop yet." link="Start a cycle" onLink={() => openFormModal("cycle_new")} />
                : (
                  <table className="w-full text-sm"><tbody>
                    {myCycles.map((c) => (
                      <tr key={c.cycle_id} onClick={() => go(`cycles/${c.cycle_id}`)} className={`cursor-pointer hover:bg-[var(--cream-2)] ${FOCUS}`} tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") go(`cycles/${c.cycle_id}`); }} style={{ borderTop: `1px solid rgba(92,64,51,0.07)` }}>
                        <td className="py-1.5">{c.pu_farmer_label || c.pu_id || "—"}</td>
                        <td className="py-1.5"><span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.soil }}>{(c.cycle_status || "").toUpperCase()}</span></td>
                        <td className="py-1.5" style={{ color: C.muted }}>{entFdate(c.planting_date)}</td>
                        <td className="py-1.5 text-right">{c.actual_yield_kg ? `${Number(c.actual_yield_kg).toLocaleString()} kg` : "—"}</td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
            </Section>
          )}
        </div>
      )}
      {tab === "finance" && (
        <div>
          <Section title="Money" meta="Added up from logged records · to date">
            {isAnimal ? <div className="text-sm" style={{ color: C.muted }}>Animal income and costs turn on as you log flock sales and feed/medicine costs. Head &amp; survival are live in Herd.</div>
              : <>
                <Row l="Earned" v={fjd(e.income)} /><Row l="Spent" v={fjd(e.costs)} />
                <Row l="Net" v={fjd(e.net)} vColor={e.net < 0 ? C.red : C.soil} /><Row l="Return on spend" v={roiTxt(e.roi)} />
                <Row l="Harvested" v={e.harvestKg ? `${e.harvestKg.toLocaleString()} kg` : "—"} />
                <Row l="Cost of a kg" v={e.cokg != null ? `${fjd(e.cokg)}/kg` : "—"} />
              </>}
          </Section>
          {!isAnimal && e.income === 0 && e.costs > 0 && <div className="text-xs -mt-2 mb-3 px-1" style={{ color: C.muted }}>Costs are in but no harvest has paid out yet — normal mid-season, not a loss.</div>}
        </div>
      )}
      {tab === "records" && (
        <Section title="Event timeline" meta="Everything logged against this crop's cycles · live">
          {isAnimal || e.kind === "vertical" ? <Build desc="Event timeline builds as you log against this enterprise." />
            : cycleIds.length === 0 ? <Build desc="No cycles for this crop yet — nothing to show." link="Log a field event" onLink={() => openFormModal("crops")} />
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
    </div>
  );
}

// ── states ────────────────────────────────────────────────────────────
function Skeleton() {
  const blk = (h, w = "100%") => <div className="rounded-lg animate-pulse motion-reduce:animate-none" style={{ height: h, width: w, background: C.cream }} />;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="rounded-xl border p-3" style={{ borderColor: C.border }}>{blk(40)}</div>)}</div>
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
          <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load your enterprises</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>Check your connection and try again — your data is safe.</div>
          <button onClick={onRetry} className={`mt-3 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={13} />Retry</button>
        </div>
      </div>
    </Card>
  );
}
function AddModal({ open, onClose }) {
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
        {opt(Plus, "Another type", "Cattle, goats, pigs, bees, fish — create flow on the roadmap", () => { emitToast("That vertical's create flow is on the build roadmap"); onClose(); })}
      </div>
    </Modal>
  );
}

function EnterprisesInner() {
  const { farmId } = useCurrentFarm();
  const rrNavigate = useNavigate();
  const navigate = (sub) => rrNavigate(`/farm/${sub}`);
  const crops = useCrops(farmId);
  const flocks = useFlocks(farmId);
  const unified = useUnified(farmId);
  const cyclesLayer = useCyclesLayer(farmId);

  const [view, setView] = useState("portfolio");
  const [typeFilter, setTypeFilter] = useState("all");
  const [layerFilter, setLayerFilter] = useState("all");
  const [standingFilter, setStandingFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openEnt, setOpenEnt] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const openEntOrRoute = (e) => { if (e?.kind === "vertical" && e.route) navigate(e.route); else setOpenEnt(e); };

  const layerMap = useMemo(() => buildLayerMap(cyclesLayer.data?.data), [cyclesLayer.data]);
  const realEnts = useMemo(() => buildEnterprises(crops.data?.data, flocks.data?.data?.items, unified.data?.data, layerMap), [crops.data, flocks.data, unified.data, layerMap]);
  const loading = crops.isLoading || flocks.isLoading;
  const bothErrored = crops.isError && flocks.isError;
  const isPreview = !loading && !bothErrored && realEnts.length === 0;
  const ents = isPreview ? SAMPLE_ENTS : realEnts;
  const D = useMemo(() => derive(ents), [ents]);
  const retry = () => { crops.refetch(); flocks.refetch(); unified.refetch(); cyclesLayer.refetch(); };

  if (openEnt) return <div className="tfp"><EnterpriseDetail e={openEnt} farmId={farmId} onBack={() => setOpenEnt(null)} go={navigate} /></div>;

  const tabBody = view === "portfolio"
    ? <PortfolioTab D={D} ents={ents} typeFilter={typeFilter} setTypeFilter={setTypeFilter} layerFilter={layerFilter} setLayerFilter={setLayerFilter} standingFilter={standingFilter} setStandingFilter={setStandingFilter} search={search} setSearch={setSearch} onOpen={openEntOrRoute} setView={setView} onAdd={() => setAddOpen(true)} />
    : view === "money" ? <MoneyTab D={D} onOpen={openEntOrRoute} navigate={navigate} />
    : <OutlookTab D={D} onOpen={openEntOrRoute} />;

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div><h1>Enterprises</h1><div className="subtitle">Your farm as a portfolio of businesses · {farmId || "your farm"}</div></div>
        <div className="page-actions">
          <FarmSelector />
          <button onClick={() => setAddOpen(true)} className="btn btn-primary"><Plus size={14} />Add enterprise</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }} role="tablist">
        {VIEW_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0 ${FOCUS}`} style={{ color: view === t.id ? C.greenDk : C.muted, borderBottom: view === t.id ? `2px solid ${C.green}` : "2px solid transparent" }}>
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

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function Enterprises() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <EnterprisesInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

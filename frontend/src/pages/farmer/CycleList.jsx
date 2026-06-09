/**
 * CycleList.jsx — /farm/cycles — the Production page (prototype "Cycles").
 *
 * Transfers the prototype's Cycles surface to prod, backed by real data:
 *   List     — status + 3-layer filters, quick stats, sortable table → cycle detail
 *   Calendar — 150-day production timeline (planting → expected harvest), real dates
 *   Planner  — real block (PU) occupancy + "start a crop here" on free blocks
 *
 * Data: GET /cycles (now includes layer), /production-units, /crops/compliance.
 * The prototype's Planner *recommendation scores* are mock ("real engine on the
 * way") — we show real occupancy instead of fabricating scores (façade rule).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NurseryRegister from "../../components/farm/NurseryRegister";
import PerformanceSummary from "../../components/farm/PerformanceSummary";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD",
  amber: "#BF9000", amberTint: "#FBF1D6", red: "#B00020", redTint: "#FBEAE6",
  cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26", panel: "#FFFFFF",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
           : { "Content-Type": "application/json" };
}
async function getJSON(u) {
  const r = await fetch(u, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? String(iso) : `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }
function dnum(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d.getTime(); }
function daysIn(iso) { const t = dnum(iso); return t == null ? null : Math.floor((Date.now() - t) / 86400000); }
function fmtMoney(v) { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtKg(v) { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : `${n.toLocaleString()} kg`; }

const STATUSES = ["all", "PLANNED", "ACTIVE", "HARVESTING", "CLOSING", "CLOSED", "FAILED"];
const STATUS_COLORS = {
  PLANNED: { bg: "#EEE7D8", fg: C.soil }, ACTIVE: { bg: C.green, fg: "#fff" },
  HARVESTING: { bg: C.amber, fg: "#fff" }, CLOSING: { bg: C.amber, fg: "#fff" },
  CLOSED: { bg: C.soil, fg: "#fff" }, FAILED: { bg: C.red, fg: "#fff" },
};
const LAYERS = {
  CASH_FLOW: { label: "Cash", bg: C.greenTint, fg: C.greenDk },
  FOOD_SECURITY: { label: "Food", bg: "#E7EEF6", fg: "#2C5C8A" },
  LONG_TERM_ASSET: { label: "Asset", bg: C.amberTint, fg: C.amber },
};
const ACTIVE_SET = new Set(["PLANNED", "ACTIVE", "HARVESTING"]);

function Pill({ active, onClick, children, count, accent }) {
  return (
    <button onClick={onClick}
      className="text-xs font-semibold px-3 py-1.5 rounded-full border"
      style={{
        borderColor: active ? (accent || C.soil) : C.border,
        background: active ? (accent || C.soil) : "#fff",
        color: active ? "#fff" : C.soil,
      }}>
      {children}{count != null && <span className="ml-1.5 opacity-70">{count}</span>}
    </button>
  );
}
function Stat({ label, value, color }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "#fff", borderColor: C.border }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-extrabold mt-0.5" style={{ color: color || C.soil }}>{value}</div>
    </div>
  );
}

export default function CycleList() {
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState(localStorage.getItem("tfos_current_farm_id") || "");
  const [cycles, setCycles] = useState([]);
  const [pus, setPus] = useState([]);
  const [blocks, setBlocks] = useState([]); // WHD active_blocks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [layerFilter, setLayerFilter] = useState("all");
  const [sortCol, setSortCol] = useState("daysIn");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        let fid = farmId;
        if (!fid) {
          const f = await getJSON("/api/v1/farms");
          const fl = f?.data?.farms || f?.data || [];
          fid = Array.isArray(fl) && fl[0]?.farm_id ? fl[0].farm_id : "";
          if (fid && !cancelled) setFarmId(fid);
        }
        const q = fid ? `?farm_id=${encodeURIComponent(fid)}&limit=200` : "?limit=200";
        const [cy, pu, cm] = await Promise.allSettled([
          getJSON(`/api/v1/cycles${q}`),
          fid ? getJSON(`/api/v1/production-units?farm_id=${encodeURIComponent(fid)}`) : Promise.resolve(null),
          fid ? getJSON(`/api/v1/crops/compliance/${encodeURIComponent(fid)}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCycles(cy.status === "fulfilled" ? (cy.value?.data?.cycles || []) : []);
        setPus(pu.status === "fulfilled" ? (pu.value?.data || []) : []);
        setBlocks(cm.status === "fulfilled" ? (cm.value?.data?.active_blocks || []) : []);
        if (cy.status !== "fulfilled") setError("Couldn't load cycles.");
      } catch {
        if (!cancelled) setError("Couldn't load the production page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [farmId]);

  const whdByCycle = useMemo(() => {
    const m = {};
    for (const b of blocks) if (b.cycle_id) m[b.cycle_id] = b;
    return m;
  }, [blocks]);

  const counts = useMemo(() => {
    const c = { all: cycles.length };
    for (const s of STATUSES.slice(1)) c[s] = cycles.filter((x) => (x.cycle_status || "").toUpperCase() === s).length;
    return c;
  }, [cycles]);

  const layerCounts = useMemo(() => {
    const m = { CASH_FLOW: 0, FOOD_SECURITY: 0, LONG_TERM_ASSET: 0, none: 0 };
    for (const c of cycles) { const l = c.layer; if (m[l] != null) m[l]++; else m.none++; }
    return m;
  }, [cycles]);

  const filtered = useMemo(() => {
    let out = cycles.filter((c) =>
      (statusFilter === "all" || (c.cycle_status || "").toUpperCase() === statusFilter) &&
      (layerFilter === "all" || c.layer === layerFilter)
    );
    const dir = sortDir === "asc" ? 1 : -1;
    out = out.slice().sort((a, b) => {
      const va = sortCol === "daysIn" ? (daysIn(a.planting_date) ?? -1e9) : (Number(a.cogk_fjd_per_kg) || -1);
      const vb = sortCol === "daysIn" ? (daysIn(b.planting_date) ?? -1e9) : (Number(b.cogk_fjd_per_kg) || -1);
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    return out;
  }, [cycles, statusFilter, layerFilter, sortCol, sortDir]);

  const activeCount = counts.ACTIVE || 0;
  const harvestingCount = counts.HARVESTING || 0;
  const avgCokg = useMemo(() => {
    const xs = cycles.filter((c) => c.layer === "CASH_FLOW" && c.cogk_fjd_per_kg != null).map((c) => Number(c.cogk_fjd_per_kg));
    return xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null;
  }, [cycles]);

  function sortBy(col) {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {/* header */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Cycles</h1>
            <div className="text-xs mt-0.5" style={{ color: C.muted }}>Every cycle from planting to closing</div>
          </div>
          <div className="flex gap-2">
            <Link to="/farm/nursery/new" className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.soil, background: "#fff" }}>+ Nursery batch</Link>
            <Link to="/farm/cycles/new" className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.green }}>+ New cycle</Link>
          </div>
        </div>

        {/* view tabs */}
        <div className="flex gap-2 mb-4">
          {[["list","List","All cycles"],["calendar","Calendar","Production timeline"],["planner","Planner","Block occupancy"]].map(([v, label, sub]) => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border text-left"
              style={{ borderColor: view === v ? C.green : C.border, background: view === v ? C.greenTint : "#fff", color: C.soil }}>
              {label}<span className="block text-[10px] font-normal" style={{ color: C.muted }}>{sub}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl animate-pulse" style={{ height: 220, background: "#fff" }} />
        ) : error ? (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: C.border, color: C.muted, background: "#fff" }}>{error}</div>
        ) : view === "list" ? (
          <>
            {/* status filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              {STATUSES.map((s) => (
                <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
                  count={counts[s] ?? 0} accent={s === "FAILED" ? C.red : undefined}>
                  {s === "all" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </Pill>
              ))}
            </div>
            {/* quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="Active" value={activeCount} color={C.greenDk} />
              <Stat label="Harvesting" value={harvestingCount} color={C.amber} />
              <Stat label="Avg CoKG (cash)" value={avgCokg != null ? fmtMoney(avgCokg) : "—"} />
              <Stat label="Total cycles" value={cycles.length} />
            </div>
            {/* layer rollup + filter */}
            <div className="flex flex-wrap gap-2 mb-3">
              <Pill active={layerFilter === "all"} onClick={() => setLayerFilter("all")}>All layers</Pill>
              {Object.entries(LAYERS).map(([k, v]) => (
                <Pill key={k} active={layerFilter === k} onClick={() => setLayerFilter(k)} accent={v.fg} count={layerCounts[k]}>{v.label}</Pill>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border p-10 text-center" style={{ borderColor: C.border, background: "#fff" }}>
                <div className="text-sm" style={{ color: C.muted }}>No cycles match these filters.</div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border, background: "#fff" }}>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ background: C.cream, color: C.soil }}>
                      {["Cycle","Crop","Block","Status"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide">{h}</th>)}
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer" onClick={() => sortBy("daysIn")}>Day {sortCol === "daysIn" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide">Layer</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide">Yield</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer" onClick={() => sortBy("cokg")}>CoKG {sortCol === "cokg" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide">Chem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => {
                      const st = (c.cycle_status || "").toUpperCase();
                      const sc = STATUS_COLORS[st] || STATUS_COLORS.PLANNED;
                      const lay = LAYERS[c.layer];
                      const di = daysIn(c.planting_date);
                      const whd = whdByCycle[c.cycle_id];
                      return (
                        <tr key={c.cycle_id || i} onClick={() => navigate(`/farm/cycles/${encodeURIComponent(c.cycle_id)}`)}
                          className="cursor-pointer hover:opacity-80" style={{ background: i % 2 ? C.cream : "#fff", color: C.soil }}>
                          <td className="px-3 py-2 font-mono text-[11px]" style={{ color: C.muted }}>{c.farmer_label || c.cycle_id}</td>
                          <td className="px-3 py-2">{c.production_name || c.production_id}</td>
                          <td className="px-3 py-2">{c.pu_farmer_label || c.pu_id || "—"}</td>
                          <td className="px-3 py-2"><span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.fg }}>{st}</span></td>
                          <td className="px-3 py-2">{di == null ? "—" : di < 0 ? `in ${-di}d` : `${di}d`}</td>
                          <td className="px-3 py-2">{lay ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: lay.bg, color: lay.fg }}>{lay.label}</span> : "—"}</td>
                          <td className="px-3 py-2">{fmtKg(c.actual_yield_kg) || "—"}</td>
                          <td className="px-3 py-2">{fmtMoney(c.cogk_fjd_per_kg) || "—"}</td>
                          <td className="px-3 py-2">{whd ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.redTint, color: C.red }}>WHD {whd.days_remaining}d</span> : <span style={{ color: C.muted }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : view === "calendar" ? (
          <CalendarView cycles={cycles} navigate={navigate} />
        ) : (
          <PlannerView pus={pus} cycles={cycles} navigate={navigate} />
        )}

        {/* Preserved prod widgets: nursery register (where nursery batches show) + performance summary */}
        {!loading && !error && (
          <div className="mt-6 space-y-6">
            <NurseryRegister farmId={farmId} />
            <PerformanceSummary />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar: 150-day production timeline (planting → expected harvest) ──────
function CalendarView({ cycles, navigate }) {
  const rows = cycles.filter((c) => c.planting_date).slice(0, 60);
  if (rows.length === 0) return <Empty text="No cycles with planting dates yet." />;
  const now = Date.now();
  const start = now - 30 * 86400000;
  const end = now + 120 * 86400000;
  const range = end - start;
  const pct = (t) => Math.max(0, Math.min(100, ((t - start) / range) * 100));
  // month gridlines
  const ticks = [];
  const d0 = new Date(start); d0.setUTCDate(1);
  for (let t = d0.getTime(); t < end; ) { const d = new Date(t); ticks.push({ left: pct(t), label: MONTHS[d.getUTCMonth()] }); d.setUTCMonth(d.getUTCMonth() + 1); t = d.getTime(); }
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#fff" }}>
      <div className="relative mb-2" style={{ height: 16 }}>
        {ticks.map((tk, i) => <div key={i} className="absolute text-[10px]" style={{ left: `${tk.left}%`, color: C.muted }}>{tk.label}</div>)}
        <div className="absolute" style={{ left: `${pct(now)}%`, top: 0, bottom: -8, width: 2, background: C.red }} title="today" />
      </div>
      <div className="space-y-1.5">
        {rows.map((c) => {
          const ps = dnum(c.planting_date);
          const pe = dnum(c.expected_harvest_date) || ps + 90 * 86400000;
          const left = pct(ps), width = Math.max(2, pct(pe) - pct(ps));
          const st = (c.cycle_status || "").toUpperCase();
          const sc = STATUS_COLORS[st] || STATUS_COLORS.PLANNED;
          return (
            <div key={c.cycle_id} className="flex items-center gap-2">
              <div className="w-32 shrink-0 truncate text-xs" style={{ color: C.soil }}>{c.production_name || c.production_id}</div>
              <div className="relative flex-1 h-5 rounded" style={{ background: C.cream }}>
                <div onClick={() => navigate(`/farm/cycles/${encodeURIComponent(c.cycle_id)}`)}
                  className="absolute h-5 rounded cursor-pointer flex items-center px-1.5 text-[10px] font-semibold overflow-hidden"
                  style={{ left: `${left}%`, width: `${width}%`, background: sc.bg, color: sc.fg }}
                  title={`${c.production_name}: ${fmtDate(c.planting_date)} → ${fmtDate(c.expected_harvest_date) || "+90d"}`}>
                  {c.pu_farmer_label || c.pu_id}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] mt-3" style={{ color: C.muted }}>Bars span planting → expected harvest (red line = today). Click a bar for cycle detail.</div>
    </div>
  );
}

// ── Planner: real block occupancy (no fabricated recommendation scores) ─────
function PlannerView({ pus, cycles, navigate }) {
  if (!pus || pus.length === 0) return <Empty text="No blocks mapped yet." />;
  const activeByPu = {};
  for (const c of cycles) if (ACTIVE_SET.has((c.cycle_status || "").toUpperCase())) activeByPu[c.pu_id] = c;
  return (
    <div>
      <div className="rounded-lg border p-3 mb-3 text-xs" style={{ borderColor: C.border, background: C.amberTint, color: C.soil }}>
        Block occupancy is live from your cycles. Scored next-crop recommendations (rotation/demand/weather) are on the roadmap — not shown until the engine is real.
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pus.map((pu) => {
          const c = activeByPu[pu.pu_id];
          const di = c ? daysIn(c.planting_date) : null;
          return (
            <div key={pu.pu_id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: "#fff" }}>
              <div className="font-semibold" style={{ color: C.soil }}>{pu.farmer_label || pu.pu_name || pu.pu_id}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{pu.area_sqm != null ? `${(pu.area_sqm / 10000).toFixed(2)} ha` : "—"}</div>
              {c ? (
                <div className="mt-2 cursor-pointer" onClick={() => navigate(`/farm/cycles/${encodeURIComponent(c.cycle_id)}`)}>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.greenTint, color: C.greenDk }}>{c.production_name}</span>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>{(c.cycle_status || "").toUpperCase()}{di != null ? ` · ${di < 0 ? `starts in ${-di}d` : `${di}d in`}` : ""}</div>
                </div>
              ) : (
                <div className="mt-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.cream, color: C.muted }}>Free</span>
                  <button onClick={() => navigate(`/farm/cycles/new?pu=${encodeURIComponent(pu.pu_id)}`)}
                    className="block mt-2 text-xs font-semibold underline" style={{ color: C.greenDk }}>Start a crop here →</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="rounded-2xl border p-10 text-center text-sm" style={{ borderColor: C.border, background: "#fff", color: C.muted }}>{text}</div>;
}

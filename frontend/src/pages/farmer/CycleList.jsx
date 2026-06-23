/**
 * CycleList.jsx — /farm/cycles — Production (pixel-exact prototype coreProductionView).
 *
 * Crops gate G6: the prototype's Production surface in .tfp markup inside
 * TfpShell — Production summary KPI strip, "By type" snapshot, and the
 * "Active production units" card grid — backed entirely by real data:
 *   GET /cycles · /financials/crops (value) · /crops/compliance (hold dot)
 * Honest where the prototype shows data prod doesn't carry per-cycle (buyer
 * commitments, task counts) — those are simply omitted, never faked.
 * Nursery register + New-cycle action preserved.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layers, Sprout, Crosshair, Check, DollarSign, Package, Award, Plus, AlertTriangle, Truck } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import NurseryRegister from "../../components/farm/NurseryRegister";
import { formatMoney } from "../../utils/money";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } });

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fdate(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? String(iso) : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
function kg(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
function fjd(n) { return formatMoney(Number(n) || 0, { decimals: 0 }); }
const ACTIVE_SET = new Set(["PLANNED", "ACTIVE", "HARVESTING", "CLOSING"]);

function progress(planted, expHarvest, status) {
  const p = planted ? Date.parse(planted) : null;
  const e = expHarvest ? Date.parse(expHarvest) : null;
  if (!p || !e || e <= p) return null;
  const pct = Math.round((Date.now() - p) / (e - p) * 100);
  if (Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

function KpiTile({ label, value, sub, color }) {
  return (
    <div className="capital-tile">
      <div className="capital-tile-label">{label}</div>
      <div className="capital-tile-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="capital-tile-sub">{sub}</div>}
    </div>
  );
}

function ProductionInner() {
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  const [cycles, setCycles] = useState([]);
  const [cropFin, setCropFin] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!farmId) { setLoading(false); return; }
    let dead = false;
    (async () => {
      setLoading(true); setErr("");
      const q = `?farm_id=${encodeURIComponent(farmId)}&limit=200`;
      const [cy, fin, cm] = await Promise.allSettled([
        getJSON(`/api/v1/cycles${q}`),
        getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`),
        getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`),
      ]);
      if (dead) return;
      setCycles(cy.status === "fulfilled" ? (cy.value?.data?.cycles || cy.value?.data || []) : []);
      setCropFin(fin.status === "fulfilled" ? (fin.value?.data || []) : []);
      setBlocks(cm.status === "fulfilled" ? (cm.value?.data?.active_blocks || []) : []);
      if (cy.status !== "fulfilled") setErr("Couldn't load production.");
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [farmId]);

  const blockedCycle = useMemo(() => new Set(blocks.map((b) => b.cycle_id)), [blocks]);
  const active = useMemo(() => cycles.filter((c) => ACTIVE_SET.has((c.cycle_status || c.status || "").toUpperCase())), [cycles]);

  // KPI roll-ups from real data.
  const expTot = active.reduce((s, c) => s + (Number(c.planned_yield_kg) || 0), 0);
  const actTot = cycles.reduce((s, c) => s + (Number(c.actual_yield_kg) || 0), 0);
  const valTot = cropFin.reduce((s, r) => s + (Number(r.total_income_fjd) || 0), 0);
  const businesses = new Set(active.map((c) => c.production_id || c.production_name)).size;

  // By type (group active cycles by crop).
  const byType = useMemo(() => {
    const m = {};
    active.forEach((c) => {
      const k = c.production_name || c.production_id || "Crop";
      m[k] = m[k] || { units: 0, exp: 0, act: 0 };
      m[k].units++; m[k].exp += Number(c.planned_yield_kg) || 0; m[k].act += Number(c.actual_yield_kg) || 0;
    });
    return Object.entries(m).sort((a, b) => b[1].units - a[1].units);
  }, [active]);

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Production</h1><div className="subtitle">What you're growing right now · {farmId || "your farm"}</div></div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-primary" onClick={() => navigate("/farm/cycles/new")}><Plus size={14} />New cycle</button>
            </div>
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its production.</div>
            : loading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : err ? <div className="card" style={{ padding: 20, color: "var(--red)" }}>{err}</div>
            : (
              <>
                {/* Nursery (prototype shows it above production) */}
                <NurseryRegister farmId={farmId} />

                {/* Production summary */}
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(5,1fr)", marginTop: 14 }}>
                  <KpiTile label="Active units" value={String(active.length)} sub="in the ground now" color="var(--green-dk)" />
                  <KpiTile label="Expected yield" value={`${kg(expTot)} kg`} sub="this season" color="var(--green-dk)" />
                  <KpiTile label="Harvested so far" value={`${kg(actTot)} kg`} sub={actTot > 0 ? "logged" : "not started"} color={actTot > 0 ? "var(--green-dk)" : "var(--amber)"} />
                  <KpiTile label="Production value" value={fjd(valTot)} sub="from sales" color={valTot > 0 ? "var(--green-dk)" : "var(--amber)"} />
                  <KpiTile label="Crops" value={String(businesses)} sub="producing" color="var(--soil)" />
                </div>

                {/* By type */}
                <div className="card" style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                    <strong style={{ color: "var(--soil)", display: "flex", gap: 8, alignItems: "center" }}><Layers size={15} />By type</strong>
                    <span className="card-meta" style={{ color: "var(--green-dk)", cursor: "pointer", fontSize: 12 }} onClick={() => navigate("/farm/enterprises")}>All businesses →</span>
                  </div>
                  <div style={{ padding: "4px 16px 12px" }}>
                    {byType.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>Nothing in production yet.</div>
                      : byType.map(([k, r]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
                          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{k}</div>
                          <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{r.units} unit{r.units === 1 ? "" : "s"} · {kg(r.exp)} kg expected{r.act > 0 ? ` · ${kg(r.act)} kg in` : ""}</div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Active production units */}
                <div className="card" style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                    <strong style={{ color: "var(--soil)", display: "flex", gap: 8, alignItems: "center" }}><Sprout size={15} />Active production units</strong>
                    <span className="card-meta" style={{ color: "var(--muted)", fontSize: 12 }}>{active.length} producing</span>
                  </div>
                  <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                    {active.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing in production yet. Start a crop run to see it here.</div>}
                    {active.map((c) => {
                      const blocked = blockedCycle.has(c.cycle_id);
                      const p = progress(c.planting_date, c.expected_harvest_date, c.cycle_status);
                      const started = (Number(c.actual_yield_kg) || 0) > 0 || ["HARVESTING", "CLOSING"].includes((c.cycle_status || "").toUpperCase());
                      const stage = (c.cycle_status || c.status || "planned").toLowerCase();
                      return (
                        <div key={c.cycle_id} className="card" style={{ margin: 0, cursor: "pointer" }} onClick={() => navigate(`/farm/cycles/${encodeURIComponent(c.cycle_id)}`)}>
                          <div style={{ padding: "13px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{c.farmer_label || c.pu_farmer_label || c.pu_name || c.pu_id}</div>
                              <span title={blocked ? "Harvest on hold" : "Clear"} style={{ flex: "none", width: 9, height: 9, borderRadius: "50%", background: blocked ? "var(--red)" : "var(--green)", marginTop: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{c.production_name || c.production_id}</div>
                            <div style={{ marginTop: 8 }}><span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "var(--soil)", background: "rgba(106,168,79,0.14)", padding: "2px 8px", borderRadius: 10, textTransform: "capitalize" }}>{stage}</span></div>
                            {p != null ? (
                              <>
                                <div style={{ marginTop: 9, height: 6, background: "rgba(92,64,51,0.1)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: "var(--green)" }} /></div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{p}% through the cycle</div>
                              </>
                            ) : <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 9 }}>Not started{c.expected_harvest_date ? ` · harvest from ${fdate(c.expected_harvest_date)}` : ""}</div>}
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, fontSize: 12 }}>
                              <div><div style={{ color: "var(--muted)" }}>Expected</div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{kg(c.planned_yield_kg)} kg</div></div>
                              <div style={{ textAlign: "right" }}><div style={{ color: "var(--muted)" }}>{started ? "Harvested" : "Status"}</div><div style={{ fontWeight: 600, color: started ? "var(--green)" : "var(--muted)" }}>{started ? `${kg(c.actual_yield_kg)} kg` : "growing"}</div></div>
                            </div>
                            {blocked && <div style={{ marginTop: 9, fontSize: 11, color: "var(--red)", borderTop: "1px solid rgba(92,64,51,0.08)", paddingTop: 7, display: "flex", gap: 5, alignItems: "center" }}><AlertTriangle size={11} />Harvest on hold — spray withholding</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
        </div>
      </main>
    </TfpShell>
  );
}

export default function CycleList() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <ProductionInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

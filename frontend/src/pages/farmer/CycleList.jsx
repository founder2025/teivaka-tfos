/**
 * CycleList.jsx — /farm/cycles — Production.
 *
 * Redesigned 2026-06-26 (audit-approved). Safety-first: the WHD harvest-hold
 * indicator FAILS CLOSED — green only when compliance is verified clear; "?" (not
 * green) when the compliance check couldn't load (PD-A). Live throughout:
 *   GET /cycles · /financials/crops (value) · /crops/compliance (hold state)
 * Closed/failed cycles are reachable via a status filter (PD-B). Honest where the
 * prototype shows data prod doesn't carry per-cycle — omitted, never faked.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Layers, Sprout, Plus, AlertTriangle, ShieldAlert } from "lucide-react";
import { useFormModal } from "../../context/FormModalContext";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import NurseryRegister from "../../components/farm/NurseryRegister";
import { formatMoney } from "../../utils/money";
import { getJSON } from "../../utils/api";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fdate(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? String(iso) : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
function kg(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
function fjd(n) { return formatMoney(Number(n) || 0, { decimals: 0 }); }
const ACTIVE_SET = new Set(["PLANNED", "ACTIVE", "HARVESTING", "CLOSING"]);
const STATUS_TABS = [["active", "Active"], ["closed", "Closed"], ["failed", "Failed"], ["all", "All"]];

// raw % through the calendar window (may exceed 100 → "past expected", PD-F)
function progressPct(planted, expHarvest) {
  const p = planted ? Date.parse(planted) : null;
  const e = expHarvest ? Date.parse(expHarvest) : null;
  if (!p || !e || e <= p) return null;
  const pct = Math.round((Date.now() - p) / (e - p) * 100);
  return Number.isNaN(pct) ? null : Math.max(0, pct);
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
  const { openFormModal } = useFormModal();
  const { farmId } = useCurrentFarm();
  const [statusFilter, setStatusFilter] = useState("active");

  const cyclesQ = useQuery({ queryKey: ["prod-cycles", farmId], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`), enabled: !!farmId });
  const finQ = useQuery({ queryKey: ["prod-fin", farmId], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const compQ = useQuery({ queryKey: ["prod-comp", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`), enabled: !!farmId });

  const cycles = cyclesQ.data?.data?.cycles || cyclesQ.data?.data || [];
  const cropFin = finQ.data?.data || [];
  const blocks = compQ.data?.data?.active_blocks || [];
  const complianceUnknown = compQ.isError; // PD-A: couldn't verify → fail closed, never green
  const loading = cyclesQ.isLoading || finQ.isLoading;
  const err = cyclesQ.isError;

  const blockedCycle = useMemo(() => new Set(blocks.map((b) => b.cycle_id)), [blocks]);
  const statusOf = (c) => (c.cycle_status || c.status || "").toUpperCase();
  const active = useMemo(() => cycles.filter((c) => ACTIVE_SET.has(statusOf(c))), [cycles]);
  const counts = useMemo(() => ({
    active: active.length,
    closed: cycles.filter((c) => statusOf(c) === "CLOSED").length,
    failed: cycles.filter((c) => statusOf(c) === "FAILED").length,
    all: cycles.length,
  }), [cycles, active]);
  const shown = useMemo(() => {
    if (statusFilter === "all") return cycles;
    if (statusFilter === "closed") return cycles.filter((c) => statusOf(c) === "CLOSED");
    if (statusFilter === "failed") return cycles.filter((c) => statusOf(c) === "FAILED");
    return active;
  }, [cycles, active, statusFilter]);

  // KPIs — active-scoped & honestly labelled (PD-E/P5)
  const expTot = active.reduce((s, c) => s + (Number(c.planned_yield_kg) || 0), 0);
  const actTot = active.reduce((s, c) => s + (Number(c.actual_yield_kg) || 0), 0);
  const valTot = cropFin.reduce((s, r) => s + (Number(r.total_income_fjd) || 0), 0);
  const businesses = new Set(active.map((c) => c.production_id || c.production_name)).size;

  const byType = useMemo(() => {
    const m = {};
    active.forEach((c) => {
      const k = c.production_name || "Crop";
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
              <button className="btn btn-primary" onClick={() => openFormModal("cycle_new")}><Plus size={14} />New cycle</button>
            </div>
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its production.</div>
            : loading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : err ? <div className="card" style={{ padding: 20, color: "var(--red)" }}>Couldn't load production. <button onClick={() => cyclesQ.refetch()} style={{ color: "var(--green-dk)", textDecoration: "underline" }}>Retry</button></div>
            : (
              <>
                <NurseryRegister farmId={farmId} />

                {complianceUnknown && (
                  <div className="card" style={{ marginTop: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, background: "#FEF6E6", border: "1px solid var(--amber)" }}>
                    <ShieldAlert size={15} style={{ color: "var(--amber)" }} />
                    <span style={{ fontSize: 12.5, color: "var(--soil)" }}>Harvest-safety (withholding) check couldn't load — hold markers show "?" until it refreshes. Don't harvest on an unverified block.</span>
                    <button onClick={() => compQ.refetch()} style={{ marginLeft: "auto", fontSize: 11, color: "var(--green-dk)", textDecoration: "underline" }}>Retry</button>
                  </div>
                )}

                {/* Production summary — responsive (PD-C), active-scoped (PD-E) */}
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginTop: 14 }}>
                  <KpiTile label="Active units" value={String(active.length)} sub="in the ground now" color="var(--green-dk)" />
                  <KpiTile label="Expected yield" value={`${kg(expTot)} kg`} sub="active cycles" color="var(--green-dk)" />
                  <KpiTile label="Harvested" value={`${kg(actTot)} kg`} sub={actTot > 0 ? "active cycles" : "not started"} color={actTot > 0 ? "var(--green-dk)" : "var(--amber)"} />
                  <KpiTile label="Production value" value={fjd(valTot)} sub="from sales · to date" color={valTot > 0 ? "var(--green-dk)" : "var(--amber)"} />
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

                {/* Status filter (PD-B) */}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
                  {STATUS_TABS.map(([k, label]) => {
                    const on = statusFilter === k;
                    return (
                      <button key={k} onClick={() => setStatusFilter(k)} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]"
                        style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
                          border: `1px solid ${on ? "var(--green-dk)" : "var(--line)"}`, background: on ? "var(--green)" : "var(--paper)", color: on ? "#fff" : "var(--soil)" }}>
                        {label} {counts[k]}
                      </button>
                    );
                  })}
                </div>

                {/* Production units */}
                <div className="card" style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                    <strong style={{ color: "var(--soil)", display: "flex", gap: 8, alignItems: "center" }}><Sprout size={15} />{STATUS_TABS.find((t) => t[0] === statusFilter)[1]} production units</strong>
                    <span className="card-meta" style={{ color: "var(--muted)", fontSize: 12 }}>{shown.length} shown</span>
                  </div>
                  <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                    {shown.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing here. {statusFilter === "active" ? "Start a crop run to see it in production." : "No cycles with this status."}</div>}
                    {shown.map((c) => {
                      const st = statusOf(c);
                      const blocked = blockedCycle.has(c.cycle_id);
                      const p = progressPct(c.planting_date, c.expected_harvest_date);
                      const started = (Number(c.actual_yield_kg) || 0) > 0 || ["HARVESTING", "CLOSING", "CLOSED"].includes(st);
                      // PD-A: green only when verified clear; "?" when compliance unknown
                      const dotState = blocked ? "blocked" : complianceUnknown ? "unknown" : "clear";
                      const dotColor = dotState === "blocked" ? "var(--red)" : dotState === "unknown" ? "var(--muted)" : "var(--green)";
                      const dotTitle = dotState === "blocked" ? "Harvest on hold (withholding)" : dotState === "unknown" ? "Harvest-safety not verified" : "Clear to harvest";
                      const open = () => navigate(`/farm/cycles/${encodeURIComponent(c.cycle_id)}`);
                      return (
                        <div key={c.cycle_id} className="card focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]" role="button" tabIndex={0}
                          style={{ margin: 0, cursor: "pointer" }} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
                          <div style={{ padding: "13px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{c.farmer_label || c.pu_farmer_label || c.pu_name || "Block"}</div>
                              <span title={dotTitle} aria-label={dotTitle} style={{ flex: "none", width: 11, height: 11, borderRadius: "50%", background: dotState === "unknown" ? "transparent" : dotColor, border: dotState === "unknown" ? `1.5px solid ${dotColor}` : "none", display: "grid", placeItems: "center", fontSize: 8, fontWeight: 800, color: dotColor, marginTop: 3 }}>{dotState === "unknown" ? "?" : ""}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{c.production_name || "Crop"}</div>
                            <div style={{ marginTop: 8 }}><span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "var(--soil)", background: "rgba(106,168,79,0.14)", padding: "2px 8px", borderRadius: 10, textTransform: "capitalize" }}>{st.toLowerCase()}</span></div>
                            {p != null ? (
                              p > 100 ? <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 9 }}>Past expected harvest</div> : (
                                <>
                                  <div style={{ marginTop: 9, height: 6, background: "rgba(92,64,51,0.1)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(100, p)}%`, height: "100%", background: "var(--green)" }} /></div>
                                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{p}% through the cycle</div>
                                </>
                              )
                            ) : <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 9 }}>Not started{c.expected_harvest_date ? ` · harvest from ${fdate(c.expected_harvest_date)}` : ""}</div>}
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, fontSize: 12 }}>
                              <div><div style={{ color: "var(--muted)" }}>Expected</div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{kg(c.planned_yield_kg)} kg</div></div>
                              <div style={{ textAlign: "right" }}><div style={{ color: "var(--muted)" }}>{started ? "Harvested" : "Status"}</div><div style={{ fontWeight: 600, color: started ? "var(--green)" : "var(--muted)" }}>{started ? `${kg(c.actual_yield_kg)} kg` : "growing"}</div></div>
                            </div>
                            {blocked && <div style={{ marginTop: 9, fontSize: 11, color: "var(--red)", borderTop: "1px solid rgba(92,64,51,0.08)", paddingTop: 7, display: "flex", gap: 5, alignItems: "center" }}><AlertTriangle size={11} />Harvest on hold — spray withholding</div>}
                            {dotState === "unknown" && <div style={{ marginTop: 9, fontSize: 11, color: "var(--muted)", borderTop: "1px solid rgba(92,64,51,0.08)", paddingTop: 7 }}>Harvest-safety unverified — refresh before harvesting</div>}
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

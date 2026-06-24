/**
 * CycleDetail.jsx — /farm/cycles/:cycleId
 *
 * Full panel-fidelity transfer of the prototype's cycleDetailView (8 panels):
 *   Header (breadcrumb, Day/stage/harvest subtitle, Back / Log event / View
 *           tasks / Close cycle / Mark failed)
 *   Status banner (FAILED / CLOSED outcome)
 *   Cycle progress strip
 *   Grid: Financial · Chemical compliance · Buyer commitments · Rotation ·
 *         Activity feed · Tasks for this cycle
 *
 * Real data: /cycles/{id} + /financials, /field-events?cycle_id, /harvests,
 * /crops/compliance, /cycles?pu_id (block rotation history), /tasks?entity_id.
 * Honest-empty where no backend exists yet (Buyer commitments — no per-cycle
 * order link), matching the prototype's own empty state. The prototype's
 * agronomic BBCH stage isn't tracked in prod, so the progress strip shows the
 * real cycle LIFECYCLE (Planned→Active→Harvesting→Closing→Closed).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useFormModal } from "../../context/FormModalContext";

const C = {
  soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", greenTint: "var(--green-tint)",
  amber: "var(--amber)", amberTint: "#FBF1D6", red: "#B00020", redTint: "#FBEAE6",
  cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", ink: "var(--soil)", panel: "var(--paper)",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
           : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }
function dnum(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d.getTime(); }
function daysBetween(a, b) { const x = dnum(a), y = dnum(b); return x == null || y == null ? null : Math.round((y - x) / 86400000); }
function daysIn(iso) { const t = dnum(iso); return t == null ? null : Math.floor((Date.now() - t) / 86400000); }
function fmtMoney(v) { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtKg(v) { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : `${Number(n).toLocaleString()} kg`; }

const LIFECYCLE = ["PLANNED", "ACTIVE", "HARVESTING", "CLOSING", "CLOSED"];
const LIFECYCLE_LABEL = { PLANNED: "Planned", ACTIVE: "Active", HARVESTING: "Harvesting", CLOSING: "Closing", CLOSED: "Closed" };
const STATUS_COLORS = {
  PLANNED: { bg: "#EEE7D8", fg: C.soil }, ACTIVE: { bg: C.green, fg: "var(--paper)" },
  HARVESTING: { bg: C.amber, fg: "var(--paper)" }, CLOSING: { bg: C.amber, fg: "var(--paper)" },
  CLOSED: { bg: C.soil, fg: "var(--paper)" }, FAILED: { bg: C.red, fg: "var(--paper)" },
};
const LAYER_LABEL = { CASH_FLOW: "Cash Flow", FOOD_SECURITY: "Food Security", LONG_TERM_ASSET: "Long-Term Asset" };
const NEXT_STATUS = { PLANNED: ["ACTIVE", "FAILED"], ACTIVE: ["HARVESTING", "FAILED"], HARVESTING: ["CLOSING", "FAILED"], CLOSING: ["CLOSED", "FAILED"], CLOSED: [], FAILED: [] };
const STATUS_VERB = { ACTIVE: "Mark active", HARVESTING: "Start harvest", CLOSING: "Begin closing", CLOSED: "Close cycle", FAILED: "Mark failed" };

function Badge({ children, bg, fg }) { return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color: fg }}>{children}</span>; }
function Panel({ title, action, onAction, children }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>{title}</h2>
        {action && <button onClick={onAction} className="text-xs font-semibold" style={{ color: C.greenDk }}>{action}</button>}
      </div>
      {children}
    </div>
  );
}
function MiniStat({ label, value, color }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-base font-extrabold" style={{ color: color || C.soil }}>{value ?? "—"}</div>
    </div>
  );
}

export default function CycleDetail() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const [cycle, setCycle] = useState(null);
  const [fin, setFin] = useState(null);
  const [events, setEvents] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [block, setBlock] = useState(null);     // WHD block for this cycle
  const [history, setHistory] = useState([]);   // prior cycles in same PU
  const [openTasks, setOpenTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const cRes = await getJSON(`/api/v1/cycles/${encodeURIComponent(cycleId)}`);
      const c = cRes?.data || cRes;
      setCycle(c);
      const [finR, evR, hvR, cmR, hiR, tkR] = await Promise.allSettled([
        getJSON(`/api/v1/cycles/${encodeURIComponent(cycleId)}/financials`),
        getJSON(`/api/v1/field-events?cycle_id=${encodeURIComponent(cycleId)}&limit=100`),
        getJSON(`/api/v1/harvests?cycle_id=${encodeURIComponent(cycleId)}`),
        c?.farm_id ? getJSON(`/api/v1/crops/compliance/${encodeURIComponent(c.farm_id)}`) : Promise.resolve(null),
        c?.pu_id ? getJSON(`/api/v1/cycles?pu_id=${encodeURIComponent(c.pu_id)}&limit=50`) : Promise.resolve(null),
        getJSON(`/api/v1/tasks?entity_id=${encodeURIComponent(cycleId)}&status=OPEN&limit=100`),
      ]);
      setFin(finR.status === "fulfilled" ? (finR.value?.data || finR.value) : null);
      setEvents(evR.status === "fulfilled" ? (evR.value?.data?.events || []) : []);
      setHarvests(hvR.status === "fulfilled" ? (hvR.value?.data?.harvests || []) : []);
      const blocks = cmR.status === "fulfilled" ? (cmR.value?.data?.active_blocks || []) : [];
      setBlock(blocks.find((b) => b.cycle_id === cycleId) || null);
      const allCyc = hiR.status === "fulfilled" ? (hiR.value?.data?.cycles || []) : [];
      setHistory(allCyc.filter((x) => x.cycle_id !== cycleId));
      setOpenTasks(tkR.status === "fulfilled" ? (Array.isArray(tkR.value?.data) ? tkR.value.data : []) : []);
    } catch (e) {
      setError(e.message === "404" ? "Cycle not found." : "Couldn't load this cycle.");
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function transition(next) {
    if (acting) return;
    if (next === "FAILED" && !window.confirm("Mark this cycle as FAILED? This is terminal.")) return;
    if (next === "CLOSED" && !window.confirm("Close this cycle? This is terminal and computes final CoKG.")) return;
    setActing(next);
    try {
      const r = await fetch(`/api/v1/cycles/${encodeURIComponent(cycleId)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ cycle_status: next }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.detail?.message || b?.detail || `Transition failed (${r.status})`); }
      await load();
    } catch (e) { alert(e.message); } finally { setActing(""); }
  }

  if (loading) return <div className="max-w-5xl mx-auto p-4"><div className="rounded-2xl animate-pulse" style={{ height: 180, background: C.cream }} /></div>;
  if (error) return (
    <div className="max-w-5xl mx-auto p-4 space-y-3">
      <Link to="/farm/cycles" className="text-xs underline" style={{ color: C.greenDk }}>← Back to cycles</Link>
      <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: C.border, color: C.muted }}>{error}</div>
    </div>
  );

  const c = cycle || {};
  const status = (c.cycle_status || "").toUpperCase();
  const sc = STATUS_COLORS[status] || STATUS_COLORS.PLANNED;
  const since = daysIn(c.planting_date);
  const expLen = daysBetween(c.planting_date, c.expected_harvest_date);
  const toHarvest = c.expected_harvest_date ? daysBetween(new Date().toISOString(), c.expected_harvest_date) : null;
  const transitions = NEXT_STATUS[status] || [];
  const lifeIdx = LIFECYCLE.indexOf(status);

  // Financial figures
  const earned = fmtMoney(fin?.total_revenue_fjd);
  const spent = fmtMoney(fin?.total_cost_fjd);
  const cokg = fmtMoney(fin?.cogk_fjd_per_kg);
  const margin = fin?.gross_margin_pct != null ? Number(fin.gross_margin_pct) : null;
  const marginLabel = margin == null ? "In progress" : margin >= 15 ? "Profitable" : margin >= -5 ? "Break-even" : "Loss-making";
  const marginColor = margin == null ? C.muted : margin >= 15 ? C.greenDk : margin >= -5 ? C.amber : C.red;
  const planned = Number(c.planned_yield_kg) || 0;
  const actual = Number(c.actual_yield_kg) || 0;
  const yieldPct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;

  // Chemical applications from events
  const chemEvents = events.filter((e) => String(e.event_type || "").toUpperCase().includes("SPRAY") || String(e.event_type || "").toUpperCase().includes("CHEMICAL") || e.chemical_id);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* breadcrumb + header */}
      <div className="text-xs" style={{ color: C.muted }}>
        <Link to="/farm/cycles" style={{ color: C.greenDk }}>Crops</Link> › <Link to="/farm/cycles" style={{ color: C.greenDk }}>Cycles</Link> › <span style={{ color: C.soil }}>{c.production_name || c.production_id} · {c.pu_farmer_label || c.pu_id} · {c.farmer_label || c.cycle_id}</span>
      </div>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>{c.production_name || c.production_id} · {c.pu_farmer_label || c.pu_id}</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>
            Day {since ?? "—"}{expLen ? ` of expected ${expLen}` : ""} · {LIFECYCLE_LABEL[status] || status}
            {toHarvest != null && status !== "CLOSED" && status !== "FAILED" ? ` · ${toHarvest > 0 ? `${toHarvest} days to harvest` : "past expected harvest"}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge bg={sc.bg} fg={sc.fg}>{status}</Badge>
          {c.layer && <Badge bg={C.greenTint} fg={C.greenDk}>{LAYER_LABEL[c.layer] || c.layer}</Badge>}
        </div>
      </div>

      {/* header actions */}
      <div className="flex flex-wrap gap-2">
        <ActionBtn onClick={() => navigate("/farm/cycles")}>← Back to list</ActionBtn>
        <ActionBtn onClick={() => openFormModal("crops", { cycleId })}>+ Log event</ActionBtn>
        <ActionBtn onClick={() => navigate(`/farm/tasks?cycle=${encodeURIComponent(cycleId)}`)}>View tasks</ActionBtn>
        {transitions.map((next) => (
          <ActionBtn key={next} onClick={() => transition(next)} disabled={!!acting} danger={next === "FAILED"}>
            {acting === next ? "…" : (STATUS_VERB[next] || next)}
          </ActionBtn>
        ))}
      </div>

      {/* outcome banner */}
      {status === "FAILED" && (
        <div className="rounded-xl border p-3" style={{ background: C.redTint, borderColor: C.border, borderLeft: `4px solid ${C.red}` }}>
          <div className="font-bold" style={{ color: C.red }}>This cycle was marked FAILED</div>
        </div>
      )}
      {status === "CLOSED" && (
        <div className="rounded-xl border p-3" style={{ background: C.cream, borderColor: C.border }}>
          <span className="font-bold" style={{ color: C.soil }}>Closed cycle</span>
          <span style={{ color: C.muted }}> · final yield {fmtKg(c.actual_yield_kg) || "—"} · {earned || "—"} earned{margin != null ? ` · ${marginLabel} (${margin.toFixed(0)}%)` : ""}</span>
        </div>
      )}

      {/* cycle progress strip (real lifecycle) */}
      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.muted }}>Cycle progress {status === "FAILED" ? "(failed)" : ""}</div>
        <div className="flex items-center">
          {LIFECYCLE.map((s, i) => {
            const done = lifeIdx > i, cur = lifeIdx === i;
            const dotBg = status === "FAILED" ? C.redTint : done ? C.green : cur ? C.amber : C.cream;
            const dotFg = (done || cur) && status !== "FAILED" ? "var(--paper)" : C.muted;
            return (
              <div key={s} className="flex items-center" style={{ flex: i < LIFECYCLE.length - 1 ? 1 : "0 0 auto" }}>
                <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: dotBg, color: dotFg }}>{done ? "✓" : i + 1}</div>
                  <span className="text-[10px] mt-1" style={{ color: cur ? C.soil : C.muted, fontWeight: cur ? 700 : 400 }}>{LIFECYCLE_LABEL[s]}</span>
                </div>
                {i < LIFECYCLE.length - 1 && <div className="h-0.5 flex-1" style={{ background: lifeIdx > i ? C.green : C.border }} />}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] mt-2" style={{ color: C.muted }}>Lifecycle status (agronomic growth-stage tracking is on the roadmap).</div>
      </div>

      {/* 6-panel grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* 1. Financial summary */}
        <Panel title="Financial summary">
          {fin ? (
            <>
              <div className="text-2xl font-extrabold" style={{ color: C.soil }}>{earned || "Pending"} <span className="text-xs font-normal" style={{ color: C.muted }}>earned</span></div>
              <Badge bg={margin == null ? C.cream : margin >= 15 ? C.greenTint : margin >= -5 ? C.amberTint : C.redTint} fg={marginColor}>{marginLabel}{margin != null ? ` · ${margin.toFixed(0)}%` : ""}</Badge>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <MiniStat label="Spent" value={spent} />
                <MiniStat label="CoKG estimate" value={cokg} />
                <MiniStat label="Expected yield" value={planned ? `${planned.toLocaleString()} kg` : "—"} />
                <MiniStat label="Actual yield" value={fmtKg(c.actual_yield_kg)} />
              </div>
              <div className="text-[11px] mt-3" style={{ color: C.muted }}>Yield progress vs expected</div>
              <div className="h-2 rounded-full mt-1" style={{ background: C.cream }}>
                <div className="h-2 rounded-full" style={{ width: `${yieldPct}%`, background: C.green }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: C.muted }}><span>0 kg</span><span>{yieldPct}%</span><span>{planned ? `${planned.toLocaleString()} kg` : "—"}</span></div>
            </>
          ) : <div className="text-sm" style={{ color: C.muted }}>No financials computed yet — costs roll up as you log inputs, labour and harvests.</div>}
        </Panel>

        {/* 2. Chemical compliance */}
        <Panel title="Chemical compliance" action="+ Apply" onAction={() => openFormModal("crops", { eventType: "CHEMICAL_APPLIED", cycleId })}>
          {block ? (
            <>
              <div className="text-lg font-extrabold" style={{ color: C.red }}>{block.chemical} — {block.days_remaining}d left</div>
              <div className="text-[11px] mt-1" style={{ color: C.muted }}>Cannot harvest until withholding clears · clears {fmtDate(block.clear_date)}</div>
            </>
          ) : (
            <>
              <div className="text-lg font-extrabold" style={{ color: C.greenDk }}>Clear to harvest</div>
              <div className="text-[11px] mt-1" style={{ color: C.muted }}>No active withholding period</div>
            </>
          )}
          {chemEvents.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.muted }}>Recent chemicals</div>
              {chemEvents.slice(0, 5).map((e) => (
                <div key={e.event_id} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: C.soil }}>{e.chemical_application || e.observation_text || "Chemical"}</span>
                  <span style={{ color: C.muted }}>{fmtDate(e.event_date)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* 3. Buyer commitments — honest-empty (no per-cycle order backend yet) */}
        <Panel title="Buyer commitments">
          <div className="text-sm py-2" style={{ color: C.muted }}>No buyer commitments tied to this cycle yet.</div>
          <div className="text-[10px]" style={{ color: C.muted }}>Per-cycle buyer commitments need an order↔cycle link (on the roadmap) — not faked.</div>
        </Panel>

        {/* 4. Rotation context — real block history */}
        <Panel title="Rotation context">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.muted }}>Prior crops in this block</div>
          {history.length === 0 ? (
            <div className="text-xs" style={{ color: C.muted }}>No prior rotation recorded for {c.pu_farmer_label || c.pu_id}.</div>
          ) : (
            history.slice(0, 3).map((h) => (
              <div key={h.cycle_id} className="flex justify-between text-xs py-0.5">
                <span style={{ color: C.soil }}>{h.production_name || h.production_id}</span>
                <span style={{ color: C.muted }}>{fmtDate(h.planting_date)} · {(h.cycle_status || "").toUpperCase()}</span>
              </div>
            ))
          )}
          <div className="mt-2 pt-2 border-t text-[11px]" style={{ borderColor: C.border, color: C.muted }}>Current crop: <b style={{ color: C.soil }}>{c.production_name || c.production_id}</b></div>
        </Panel>

        {/* 5. Activity feed — real events */}
        <Panel title="Activity feed" action="View all" onAction={() => navigate("/farm/field-events")}>
          {events.length === 0 ? (
            <div className="text-sm" style={{ color: C.muted }}>Nothing logged yet for this cycle.</div>
          ) : (
            <div className="space-y-1">
              {events.slice(0, 8).map((e) => (
                <div key={e.event_id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono shrink-0" style={{ color: C.muted, width: 44 }}>{fmtDate(e.event_date).slice(0, 6)}</span>
                  <span className="font-semibold" style={{ color: C.ink }}>{String(e.event_type || "").replace(/_/g, " ")}</span>
                  {e.observation_text && <span className="flex-1 text-right truncate" style={{ color: C.soil }}>{e.observation_text}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* 6. Tasks for this cycle — real open count + total events */}
        <Panel title="Tasks for this cycle" action="Open task timeline" onAction={() => navigate(`/farm/tasks?cycle=${encodeURIComponent(cycleId)}`)}>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Pending (open)" value={openTasks.length} color={openTasks.length > 0 ? C.amber : C.soil} />
            <MiniStat label="Total events" value={events.length} />
            <MiniStat label="Harvests" value={harvests.length} />
            <MiniStat label="On hold (WHD)" value={block ? 1 : 0} color={block ? C.red : C.soil} />
          </div>
          <button onClick={() => navigate(`/farm/tasks?cycle=${encodeURIComponent(cycleId)}`)} className="w-full mt-3 text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ background: C.green }}>Open task timeline →</button>
        </Panel>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
      style={{ background: "var(--paper)", border: `1px solid ${"var(--line)"}`, color: danger ? "#B00020" : "var(--soil)" }}>
      {children}
    </button>
  );
}

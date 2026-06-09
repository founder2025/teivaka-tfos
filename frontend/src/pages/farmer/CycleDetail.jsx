/**
 * CycleDetail.jsx — /farm/cycles/:cycleId
 *
 * The prototype's per-cycle detail, backed entirely by real endpoints:
 *   GET   /api/v1/cycles/{id}                 → header + status + layer
 *   GET   /api/v1/cycles/{id}/financials      → CoKG panel
 *   GET   /api/v1/field-events?cycle_id={id}  → activity timeline
 *   GET   /api/v1/harvests?cycle_id={id}      → harvest log
 *   GET   /api/v1/crops/compliance/{farm_id}  → WHD block for this cycle
 *   PATCH /api/v1/cycles/{id}                 → status transitions
 *
 * Six panels. No mock data — every value is real or honest-empty.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD",
  amber: "#BF9000", red: "#B00020", redTint: "#FBEAE6", cream: "#F8F3E9",
  border: "#E6DED0", muted: "#8A7863", ink: "#3A2E26", panel: "#FFFFFF",
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
function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function fmtMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtKg(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : `${n.toLocaleString()} kg`;
}

const STATUS_COLORS = {
  PLANNED: { bg: "#EEE7D8", fg: C.soil }, ACTIVE: { bg: C.green, fg: "#fff" },
  HARVESTING: { bg: C.amber, fg: "#fff" }, CLOSING: { bg: C.amber, fg: "#fff" },
  CLOSED: { bg: C.soil, fg: "#fff" }, FAILED: { bg: C.red, fg: "#fff" },
};
const NEXT_STATUS = {
  PLANNED: ["ACTIVE", "FAILED"], ACTIVE: ["HARVESTING", "FAILED"],
  HARVESTING: ["CLOSING", "FAILED"], CLOSING: ["CLOSED", "FAILED"],
  CLOSED: [], FAILED: [],
};
const STATUS_VERB = {
  ACTIVE: "Mark active", HARVESTING: "Start harvest",
  CLOSING: "Begin closing", CLOSED: "Close cycle", FAILED: "Mark failed",
};
const LAYER_LABEL = {
  CASH_FLOW: "Cash Flow", FOOD_SECURITY: "Food Security", LONG_TERM_ASSET: "Long-Term Asset",
};

function Badge({ children, bg, fg }) {
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color: fg }}>{children}</span>;
}
function Panel({ title, right, children }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-extrabold" style={{ color: color || C.soil }}>{value ?? "—"}</div>
    </div>
  );
}

export default function CycleDetail() {
  const { cycleId } = useParams();
  const [cycle, setCycle] = useState(null);
  const [fin, setFin] = useState(null);
  const [events, setEvents] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [block, setBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const cRes = await getJSON(`/api/v1/cycles/${encodeURIComponent(cycleId)}`);
      const c = cRes?.data || cRes;
      setCycle(c);
      // Fire the dependent reads in parallel; each is independently fail-soft.
      const [finRes, evRes, hvRes, cmRes] = await Promise.allSettled([
        getJSON(`/api/v1/cycles/${encodeURIComponent(cycleId)}/financials`),
        getJSON(`/api/v1/field-events?cycle_id=${encodeURIComponent(cycleId)}&limit=100`),
        getJSON(`/api/v1/harvests?cycle_id=${encodeURIComponent(cycleId)}`),
        c?.farm_id ? getJSON(`/api/v1/crops/compliance/${encodeURIComponent(c.farm_id)}`) : Promise.resolve(null),
      ]);
      setFin(finRes.status === "fulfilled" ? (finRes.value?.data || finRes.value) : null);
      setEvents(evRes.status === "fulfilled" ? ((evRes.value?.data?.events) || []) : []);
      setHarvests(hvRes.status === "fulfilled" ? ((hvRes.value?.data?.harvests) || []) : []);
      const blocks = cmRes.status === "fulfilled" ? (cmRes.value?.data?.active_blocks || []) : [];
      setBlock(blocks.find((b) => b.cycle_id === cycleId) || null);
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
      const r = await fetch(`/api/v1/cycles/${encodeURIComponent(cycleId)}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ cycle_status: next }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.detail?.message || body?.detail || `Transition failed (${r.status})`);
      }
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActing("");
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto p-4"><div className="rounded-2xl animate-pulse" style={{ height: 160, background: C.cream }} /></div>;
  if (error) return (
    <div className="max-w-4xl mx-auto p-4 space-y-3">
      <Link to="/farm/cycles" className="text-xs underline" style={{ color: C.greenDk }}>← Back to cycles</Link>
      <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: C.border, color: C.muted }}>{error}</div>
    </div>
  );

  const c = cycle || {};
  const sc = STATUS_COLORS[c.cycle_status] || STATUS_COLORS.PLANNED;
  const since = daysSince(c.planting_date);
  const cokg = fmtMoney(fin?.cogk_fjd_per_kg);
  const transitions = NEXT_STATUS[c.cycle_status] || [];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <Link to="/farm/cycles" className="text-xs underline" style={{ color: C.greenDk }}>← Back to cycles</Link>

      {/* 1. Header / overview */}
      <Panel
        title="Cycle"
        right={<div className="flex items-center gap-1.5">
          <Badge bg={sc.bg} fg={sc.fg}>{c.cycle_status}</Badge>
          {c.layer && <Badge bg={C.greenTint} fg={C.greenDk}>{LAYER_LABEL[c.layer] || c.layer}</Badge>}
        </div>}
      >
        <div className="text-xl font-extrabold" style={{ color: C.ink }}>{c.production_name || c.production_id}</div>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>
          {c.pu_farmer_label || c.pu_id || "—"} · <span className="font-mono">{c.cycle_id}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <Stat label="Planted" value={fmtDate(c.planting_date)} />
          <Stat label="Days since" value={since != null ? `${since}d` : null} />
          <Stat label="Expected harvest" value={fmtDate(c.expected_harvest_date)} />
          <Stat label="Actual yield" value={fmtKg(c.actual_yield_kg)} />
        </div>
      </Panel>

      {/* 2. Status & actions */}
      <Panel title="Status & actions">
        {transitions.length === 0 ? (
          <div className="text-sm" style={{ color: C.muted }}>This cycle is in a terminal state ({c.cycle_status}). No further transitions.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {transitions.map((next) => (
              <button key={next} onClick={() => transition(next)} disabled={!!acting}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: next === "FAILED" ? C.redTint : C.greenTint, color: next === "FAILED" ? C.red : C.greenDk, border: `1px solid ${C.border}` }}>
                {acting === next ? "…" : (STATUS_VERB[next] || next)}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* 3. Financials — CoKG first */}
      <Panel title="Financials (Cost of a Kilogram)">
        {fin ? (
          <>
            <div className="rounded-xl p-3 mb-3" style={{ background: C.greenTint }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.greenDk }}>Cost per kg (CoKG)</div>
              <div className="text-3xl font-extrabold" style={{ color: C.greenDk }}>{cokg || "Pending harvest"}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Inputs" value={fmtMoney(fin.total_input_cost_fjd)} />
              <Stat label="Labour" value={fmtMoney(fin.total_labor_cost_fjd)} />
              <Stat label="Other" value={fmtMoney(fin.total_other_cost_fjd)} />
              <Stat label="Total cost" value={fmtMoney(fin.total_cost_fjd)} />
              <Stat label="Revenue" value={fmtMoney(fin.total_revenue_fjd)} color={C.greenDk} />
              <Stat label="Gross profit" value={fmtMoney(fin.gross_profit_fjd)} color={C.greenDk} />
              <Stat label="Margin" value={fin.gross_margin_pct != null ? `${Number(fin.gross_margin_pct).toFixed(1)}%` : null} />
              <Stat label="Harvested" value={fmtKg(fin.total_harvest_kg)} />
            </div>
          </>
        ) : (
          <div className="text-sm" style={{ color: C.muted }}>No financials computed yet — costs roll up as you log inputs, labour and harvests.</div>
        )}
      </Panel>

      {/* 4. Compliance / WHD */}
      <Panel title="Spray compliance">
        {block ? (
          <div className="rounded-xl p-3" style={{ background: C.redTint, borderLeft: `3px solid ${C.red}` }}>
            <div className="font-bold" style={{ color: C.red }}>On hold — do not sell ({block.days_remaining}d left)</div>
            <div className="text-xs mt-0.5" style={{ color: C.soil }}>
              {block.chemical} applied {fmtDate(block.applied_date)} · {block.whd_days}-day withholding · clears <b>{fmtDate(block.clear_date)}</b>.
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: C.greenDk }}>Clear to harvest — no active chemical withholding on this cycle.</div>
        )}
      </Panel>

      {/* 5. Activity timeline */}
      <Panel title="Activity" right={<span className="text-xs" style={{ color: C.muted }}>{events.length} logged</span>}>
        {events.length === 0 ? (
          <div className="text-sm" style={{ color: C.muted }}>Nothing logged yet for this cycle.</div>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li key={e.event_id} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-[11px] mt-0.5 shrink-0" style={{ color: C.muted }}>{fmtDate(e.event_date)}</span>
                <span className="font-semibold" style={{ color: C.ink }}>{String(e.event_type || "").replace(/_/g, " ")}</span>
                {e.observation_text && <span style={{ color: C.muted }}>· {e.observation_text}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 6. Harvest log */}
      <Panel title="Harvest log" right={<span className="text-xs" style={{ color: C.muted }}>{harvests.length}</span>}>
        {harvests.length === 0 ? (
          <div className="text-sm" style={{ color: C.muted }}>No harvests recorded yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {harvests.map((h, i) => (
              <li key={h.harvest_id || i} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-1.5" style={{ borderColor: C.border }}>
                <span className="font-mono text-[11px]" style={{ color: C.muted }}>{fmtDate(h.harvest_date)}</span>
                <span className="font-semibold" style={{ color: C.ink }}>{fmtKg(h.gross_yield_kg) || "—"}</span>
                <span style={{ color: C.muted }}>
                  {fmtKg(h.marketable_yield_kg) ? `${fmtKg(h.marketable_yield_kg)} marketable` : ""}
                  {h.chemical_compliance_cleared === false ? " · ⚠ uncleared" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

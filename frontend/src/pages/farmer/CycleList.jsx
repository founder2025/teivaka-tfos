/**
 * CycleList.jsx — /farm/cycles (Phase 4b).
 *
 * Read-only table of production cycles (crops) for the active tenant. Reads
 * from GET /api/v1/cycles (success_envelope: { data: { cycles: [...] },
 * meta: { limit, offset, count } }). Bearer token from localStorage.
 *
 * No props. Default export. Mirrors HarvestList.jsx structure for visual
 * consistency: same color tokens, same authHeaders, same loading/error/empty
 * scaffolding.
 *
 * Status pill mapping:
 *   PLANNED    → border-gray bg, soil text
 *   ACTIVE     → green bg, white text
 *   HARVESTING → amber bg, white text
 *   CLOSING    → amber bg, white text
 *   CLOSED     → soil bg, white text
 *   FAILED     → red bg, white text
 *
 * "Start crop" CTA + empty-state link both point at /farm because the
 * dedicated create-cycle route is not yet shipped (NewCycleModal lives on the
 * dashboard). Update once /farm/cycles/new exists.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  amber:   "#BF9000",
  red:     "#B00020",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
  panel:   "#FFFFFF",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function shortId(s) {
  if (!s) return null;
  const str = String(s);
  const idx = str.lastIndexOf("-");
  if (idx === -1) return str;
  const tail = str.slice(idx + 1);
  return tail.length > 0 ? tail.slice(-8) : str;
}

function fmtKg(n) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num)) return null;
  return `${num.toFixed(1)} kg`;
}

function fmtMoney(n) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num)) return null;
  return num.toFixed(2);
}

const STATUS_STYLE = {
  PLANNED:    { bg: C.border, fg: C.soil,  label: "Planned" },
  ACTIVE:     { bg: C.green,  fg: "#FFF",  label: "Active" },
  HARVESTING: { bg: C.amber,  fg: "#FFF",  label: "Harvesting" },
  CLOSING:    { bg: C.amber,  fg: "#FFF",  label: "Closing" },
  CLOSED:     { bg: C.soil,   fg: "#FFF",  label: "Closed" },
  FAILED:     { bg: C.red,    fg: "#FFF",  label: "Failed" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: C.border, fg: C.soil, label: status || "—" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function Muted({ children }) {
  return <span style={{ color: C.muted }}>{children ?? "—"}</span>;
}

function HeaderBar() {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>
          Crops
        </h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          Active and past crop runs
        </p>
      </div>
      <Link
        to="/farm"
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
        style={{ background: C.green }}
      >
        Start crop
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="text-center py-16 text-sm"
      style={{ color: C.muted }}
      role="status"
    >
      Loading cycles…
    </div>
  );
}

function ErrorPanel({ message }) {
  return (
    <div
      className="border rounded-lg px-4 py-3 text-sm"
      style={{ background: "#FDECEC", borderColor: C.red, color: C.red }}
      role="alert"
    >
      {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <p className="text-base font-semibold" style={{ color: C.soil }}>
        No crops planted yet
      </p>
      <Link
        to="/farm"
        className="inline-block mt-2 text-sm underline"
        style={{ color: C.green }}
      >
        Start your first crop
      </Link>
    </div>
  );
}

function CropCell({ row }) {
  const primary = row.production_name || row.production_id || "—";
  const secondary = row.pu_farmer_label || shortId(row.pu_id) || "—";
  return (
    <div>
      <div className="font-semibold" style={{ color: C.soil }}>{primary}</div>
      <div className="text-xs mt-0.5" style={{ color: C.muted }}>{secondary}</div>
    </div>
  );
}

function CycleCell({ row }) {
  if (row.farmer_label) {
    return <span style={{ color: C.soil }}>{row.farmer_label}</span>;
  }
  const tail = shortId(row.cycle_id);
  return (
    <span className="font-mono text-xs" style={{ color: C.muted }}>
      {tail || "—"}
    </span>
  );
}

function CycleTable({ rows }) {
  const thCls = "text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide";
  const tdCls = "px-3 py-2 text-sm align-top";
  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ borderColor: C.border, background: C.panel }}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: C.cream, color: C.soil }}>
            <th className={thCls}>Crop</th>
            <th className={thCls}>Cycle</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Planted</th>
            <th className={thCls}>Expected harvest</th>
            <th className={thCls}>Actual yield</th>
            <th className={thCls}>CoKG (FJD/kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const stripe = i % 2 === 0 ? C.panel : C.cream;
            const planted  = fmtDate(row.planting_date);
            const expected = fmtDate(row.expected_harvest_date);
            const yieldStr = fmtKg(row.actual_yield_kg);
            const cokg     = fmtMoney(row.cogk_fjd_per_kg);
            return (
              <tr
                key={row.cycle_id || i}
                style={{ background: stripe, color: C.soil }}
              >
                <td className={tdCls}><CropCell row={row} /></td>
                <td className={tdCls}><CycleCell row={row} /></td>
                <td className={tdCls}><StatusBadge status={row.cycle_status} /></td>
                <td className={tdCls}>{planted ?? <Muted />}</td>
                <td className={tdCls}>{expected ?? <Muted />}</td>
                <td className={tdCls}>{yieldStr ?? <Muted />}</td>
                <td className={tdCls}>{cokg ?? <Muted />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CycleList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/v1/cycles?limit=50", {
          headers: authHeaders(),
        });
        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try {
            const body = await res.json();
            msg = body?.detail?.message || body?.detail || body?.message || msg;
          } catch (_) { /* ignore */ }
          if (!cancelled) setError(typeof msg === "string" ? msg : JSON.stringify(msg));
          return;
        }
        const body = await res.json();
        const list =
          body?.data?.cycles ||
          body?.cycles ||
          [];
        if (!cancelled) setRows(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <HeaderBar />
        {loading && <LoadingState />}
        {!loading && error && <ErrorPanel message={error} />}
        {!loading && !error && rows.length === 0 && <EmptyState />}
        {!loading && !error && rows.length > 0 && <CycleTable rows={rows} />}
      </div>
    </div>
  );
}

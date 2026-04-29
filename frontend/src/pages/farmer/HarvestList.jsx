/**
 * HarvestList.jsx — /farm/harvests (Phase 4b).
 *
 * Read-only table of past harvests for the active tenant. Reads from
 * GET /api/v1/harvests (success_envelope: { data: { harvests: [...] },
 * meta: { limit, offset, count } }). Bearer token from localStorage.
 *
 * No props. Default export. Mirrors color tokens + authHeaders pattern
 * used by HarvestNew.jsx.
 *
 * Compliance badge logic:
 *   cleared=true,  override=false → green "Cleared"
 *   cleared=false, override=true  → amber "Override"
 *   cleared=false, override=false → red   "Blocked"
 *   else                           → green "Cleared"
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function shortId(s) {
  if (!s) return "—";
  const str = String(s);
  const idx = str.lastIndexOf("-");
  if (idx === -1) return str;
  const tail = str.slice(idx + 1);
  return tail.length > 0 ? tail.slice(-8) : str;
}

function fmtKg(n) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return num.toFixed(1);
}

function ComplianceBadge({ cleared, override }) {
  let bg = C.green;
  let label = "✓ Cleared";
  if (cleared === false && override === true) {
    bg = C.amber;
    label = "⚠ Override";
  } else if (cleared === false && override === false) {
    bg = C.red;
    label = "✗ Blocked";
  }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ background: bg }}
    >
      {label}
    </span>
  );
}

function HeaderBar() {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>
          Harvests
        </h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          Past harvest records
        </p>
      </div>
      <Link
        to="/farm/harvest/new"
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
        style={{ background: C.green }}
      >
        Log harvest
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
      Loading harvests…
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
        No harvests yet
      </p>
      <Link
        to="/farm/harvest/new"
        className="inline-block mt-2 text-sm underline"
        style={{ color: C.green }}
      >
        Log your first harvest
      </Link>
    </div>
  );
}

function HarvestTable({ rows }) {
  const thCls = "text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide";
  const tdCls = "px-3 py-2 text-sm";
  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ borderColor: C.border, background: C.panel }}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: C.cream, color: C.soil }}>
            <th className={thCls}>Date</th>
            <th className={thCls}>Crop</th>
            <th className={thCls}>Block</th>
            <th className={thCls}>Gross (kg)</th>
            <th className={thCls}>Marketable (kg)</th>
            <th className={thCls}>Waste (kg)</th>
            <th className={thCls}>Compliance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const stripe = i % 2 === 0 ? C.panel : C.cream;
            const wasteNum = Number(h.waste_kg);
            const wasteZero = !isNaN(wasteNum) && wasteNum === 0;
            return (
              <tr
                key={h.harvest_id || i}
                style={{ background: stripe, color: C.soil }}
              >
                <td className={tdCls}>{fmtDate(h.harvest_date)}</td>
                <td className={tdCls}>{shortId(h.production_id)}</td>
                <td className={tdCls}>{shortId(h.pu_id)}</td>
                <td className={tdCls}>{fmtKg(h.gross_yield_kg)}</td>
                <td className={tdCls}>{fmtKg(h.marketable_yield_kg)}</td>
                <td
                  className={tdCls}
                  style={wasteZero ? { color: C.muted } : undefined}
                >
                  {fmtKg(h.waste_kg)}
                </td>
                <td className={tdCls}>
                  <ComplianceBadge
                    cleared={h.chemical_compliance_cleared}
                    override={h.compliance_override}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HarvestList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/v1/harvests?limit=50", {
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
          body?.data?.harvests ||
          body?.harvests ||
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
        {!loading && !error && rows.length > 0 && <HarvestTable rows={rows} />}
      </div>
    </div>
  );
}

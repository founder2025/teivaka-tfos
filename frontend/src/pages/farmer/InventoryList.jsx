/**
 * InventoryList.jsx — /farm/inventory (Phase 4b).
 *
 * Read-only table of inputs/inventory on hand for the active tenant. Reads
 * from GET /api/v1/inputs. Bearer token from localStorage.
 *
 * ENVELOPE QUIRK: GET /api/v1/inputs returns { data: [...flat array...] } —
 * NOT the success_envelope wrapper used by /harvests and /cycles. There is
 * no `meta`, and `data` is the row array directly (not `data.inputs`).
 *
 * Per backlog note, the `farm_id` query param has a 500-bug at the SQL
 * layer (filter references a column that doesn't exist on tenant.inputs).
 * Do not pass it. Inventory creation is via the universal (+) shell
 * button, not from this page — there is no "New input" CTA here.
 *
 * Status pill mapping (driven by mv_input_balance.stock_status):
 *   OK / HEALTHY / null → green  "In stock"
 *   LOW                 → amber  "Low"
 *   OUT                 → red    "Out"
 *   anything else       → gray   raw value
 */
import { useEffect, useState } from "react";

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

function fmtQty(n) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num)) return null;
  return num.toFixed(1).replace(/\.0$/, "");
}

function fmtMoney(n) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (isNaN(num)) return null;
  return num.toFixed(2);
}

function StockBadge({ status }) {
  let bg = C.green;
  let fg = "#FFF";
  let label = "In stock";
  if (status === "OK" || status === "HEALTHY" || status == null) {
    // default
  } else if (status === "LOW") {
    bg = C.amber;
    label = "Low";
  } else if (status === "OUT") {
    bg = C.red;
    label = "Out";
  } else {
    bg = C.border;
    fg = C.soil;
    label = String(status);
  }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function ChemicalTag() {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border"
      style={{ borderColor: C.red, color: C.red, background: "#FFF" }}
      title="Restricted chemical"
    >
      ⚗ Chemical
    </span>
  );
}

function ExpiringSoonTag() {
  return (
    <span
      className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
      style={{ background: C.amber, color: "#FFF" }}
    >
      expires soon
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
          Inventory
        </h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          Stock on hand
        </p>
      </div>
      {/* Inventory creation is via the universal (+) shell button, not here. */}
      <div />
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
      Loading inventory…
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
        No inventory yet
      </p>
      <p className="text-sm mt-1" style={{ color: C.muted }}>
        Add your first item from the (+) button
      </p>
    </div>
  );
}

function ItemCell({ row }) {
  const primary = row.input_name || row.input_id || "—";
  const secondary = row.input_category || "";
  return (
    <div>
      <div className="font-semibold" style={{ color: C.soil }}>{primary}</div>
      {secondary && (
        <div className="text-xs mt-0.5 uppercase tracking-wide" style={{ color: C.muted }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

function StockCell({ row }) {
  const qty = fmtQty(row.current_stock_qty);
  const unit = row.unit_of_measure || "";
  if (qty === null) return <Muted />;
  return <span>{qty}{unit ? ` ${unit}` : ""}</span>;
}

function ExpiryCell({ row }) {
  const date = fmtDate(row.expiry_date);
  if (!date) return <Muted />;
  return (
    <span>
      {date}
      {row.expiring_soon === true && <ExpiringSoonTag />}
    </span>
  );
}

function InventoryTable({ rows }) {
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
            <th className={thCls}>Item</th>
            <th className={thCls}>Stock</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Expiry</th>
            <th className={thCls}>Unit cost (FJD)</th>
            <th className={thCls}>Location</th>
            <th className={thCls}>Chemical</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const stripe = i % 2 === 0 ? C.panel : C.cream;
            const cost = fmtMoney(row.unit_cost_fjd);
            return (
              <tr
                key={row.input_id || i}
                style={{ background: stripe, color: C.soil }}
              >
                <td className={tdCls}><ItemCell row={row} /></td>
                <td className={tdCls}><StockCell row={row} /></td>
                <td className={tdCls}><StockBadge status={row.stock_status} /></td>
                <td className={tdCls}><ExpiryCell row={row} /></td>
                <td className={tdCls}>{cost ?? <Muted />}</td>
                <td className={tdCls}>
                  {row.storage_location ? row.storage_location : <Muted />}
                </td>
                <td className={tdCls}>
                  {row.is_chemical === true ? <ChemicalTag /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/v1/inputs", {
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
        // /api/v1/inputs returns { data: [...flat array...] } — NOT success_envelope.
        const list = Array.isArray(body?.data) ? body.data : [];
        if (!cancelled) setRows(list);
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
        {!loading && !error && rows.length > 0 && <InventoryTable rows={rows} />}
      </div>
    </div>
  );
}

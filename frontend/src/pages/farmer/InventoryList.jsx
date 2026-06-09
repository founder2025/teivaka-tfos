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
  // Real values from /inputs: ADEQUATE | LOW_STOCK | REORDER_NOW | OUT_OF_STOCK | NO_REORDER_SET
  const map = {
    ADEQUATE:       { bg: C.green,  fg: "#FFF",   label: "In stock" },
    LOW_STOCK:      { bg: C.amber,  fg: "#FFF",   label: "Low" },
    REORDER_NOW:    { bg: "#D4442E", fg: "#FFF",  label: "Reorder" },
    OUT_OF_STOCK:   { bg: C.red,    fg: "#FFF",   label: "Out" },
    NO_REORDER_SET: { bg: C.border, fg: C.soil,   label: "No reorder set" },
  };
  const s = map[status] || (status == null
    ? { bg: C.green, fg: "#FFF", label: "In stock" }
    : { bg: C.border, fg: C.soil, label: String(status) });
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
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

const NEEDS_ORDER = new Set(["OUT_OF_STOCK", "REORDER_NOW", "LOW_STOCK"]);

function KpiStrip({ rows }) {
  const skus = rows.length;
  const value = rows.reduce((a, r) => a + (Number(r.current_stock_qty) || 0) * (Number(r.unit_cost_fjd) || 0), 0);
  const reorder = rows.filter((r) => NEEDS_ORDER.has(r.stock_status)).length;
  const expiring = rows.filter((r) => r.expiring_soon === true).length;
  const tile = (label, val, color) => (
    <div className="rounded-xl border p-3" style={{ background: C.panel, borderColor: C.border }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-extrabold mt-0.5" style={{ color: color || C.soil }}>{val}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      {tile("SKUs", skus)}
      {tile("Stock value", `FJD ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)}
      {tile("To reorder", reorder, reorder ? C.amber : C.green)}
      {tile("Expiring soon", expiring, expiring ? C.amber : C.green)}
    </div>
  );
}

function Tabs({ view, setView }) {
  const TABS = [["stock", "Stock", "On hand"], ["reorder", "Reorder", "What to order"], ["movements", "Movements", "Audit feed"], ["suppliers", "Suppliers", "Who supplies"], ["analytics", "Analytics", "Value by category"]];
  return (
    <div className="flex gap-2 overflow-x-auto mb-3">
      {TABS.map(([v, label, sub]) => (
        <button key={v} onClick={() => setView(v)} className="px-3 py-2 rounded-lg text-sm font-semibold border text-left shrink-0"
          style={{ borderColor: view === v ? C.green : C.border, background: view === v ? "#E9F2DD" : "#fff", color: C.soil }}>
          {label}<span className="block text-[10px] font-normal" style={{ color: C.muted }}>{sub}</span>
        </button>
      ))}
    </div>
  );
}

function MovementsView({ rows, loading }) {
  if (loading) return <Muted>Loading movements…</Muted>;
  if (!rows.length) return <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>No stock movements logged yet — receiving or using stock records here.</div>;
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.border, background: C.panel }}>
      <table className="w-full border-collapse text-sm">
        <thead><tr style={{ background: C.cream, color: C.soil }}>
          {["Date", "Item", "Type", "Change", "Cost (FJD)"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const qc = Number(r.qty_change) || 0;
            return (
              <tr key={r.transaction_id || i} style={{ background: i % 2 ? C.cream : C.panel, color: C.soil }}>
                <td className="px-3 py-2">{fmtDate(r.transaction_date) || <Muted />}</td>
                <td className="px-3 py-2 font-medium">{r.input_name || r.input_id}</td>
                <td className="px-3 py-2">{String(r.transaction_type || "").replace(/_/g, " ")}</td>
                <td className="px-3 py-2 font-semibold" style={{ color: qc < 0 ? C.red : C.green }}>{qc > 0 ? "+" : ""}{fmtQty(qc)}</td>
                <td className="px-3 py-2">{fmtMoney(r.total_cost_fjd) ?? <Muted />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuppliersView({ rows, loading }) {
  if (loading) return <Muted>Loading suppliers…</Muted>;
  if (!rows.length) return <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>No suppliers added yet.</div>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => (
        <div key={s.supplier_id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
          <div className="font-semibold" style={{ color: C.soil }}>{s.supplier_name}</div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>{s.supplier_type || "—"}{s.island ? ` · ${s.island}` : ""}</div>
          {(s.phone || s.whatsapp_number) && <div className="text-xs mt-1" style={{ color: C.soil }}>{s.phone || s.whatsapp_number}</div>}
        </div>
      ))}
    </div>
  );
}

function AnalyticsView({ rows }) {
  const byCat = {};
  for (const r of rows) {
    const cat = r.input_category || "Other";
    byCat[cat] = (byCat[cat] || 0) + (Number(r.current_stock_qty) || 0) * (Number(r.unit_cost_fjd) || 0);
  }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = cats.reduce((a, [, v]) => a + v, 0);
  if (!cats.length || total === 0) return <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>Stock value by category appears once items carry quantities and unit costs.</div>;
  return (
    <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: C.border, background: C.panel }}>
      <div className="text-sm font-semibold" style={{ color: C.soil }}>Stock value by category — FJD {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      {cats.map(([cat, v]) => (
        <div key={cat}>
          <div className="flex justify-between text-xs mb-0.5" style={{ color: C.soil }}><span className="uppercase tracking-wide">{cat}</span><span>FJD {v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
          <div className="h-2 rounded-full" style={{ background: C.cream }}><div className="h-2 rounded-full" style={{ width: `${Math.round((v / total) * 100)}%`, background: C.green }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function InventoryList() {
  const [rows, setRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auxLoading, setAuxLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("stock");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await fetch("/api/v1/inputs", { headers: authHeaders() });
        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try { const body = await res.json(); msg = body?.detail?.message || body?.detail || body?.message || msg; } catch (_) { /* ignore */ }
          if (!cancelled) setError(typeof msg === "string" ? msg : JSON.stringify(msg));
          return;
        }
        const body = await res.json();
        if (!cancelled) setRows(Array.isArray(body?.data) ? body.data : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
      // Movements + suppliers are independently fail-soft (don't block the page).
      try {
        const [mv, sp] = await Promise.allSettled([
          fetch("/api/v1/input-transactions", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/v1/suppliers", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!cancelled) {
          setMovements(mv.status === "fulfilled" && Array.isArray(mv.value?.data) ? mv.value.data : []);
          setSuppliers(sp.status === "fulfilled" && Array.isArray(sp.value?.data) ? sp.value.data : []);
        }
      } finally {
        if (!cancelled) setAuxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reorderRows = rows.filter((r) => NEEDS_ORDER.has(r.stock_status));

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <HeaderBar />
        {loading ? <LoadingState />
          : error ? <ErrorPanel message={error} />
          : (
            <>
              <KpiStrip rows={rows} />
              <Tabs view={view} setView={setView} />
              {view === "stock" && (rows.length === 0 ? <EmptyState /> : <InventoryTable rows={rows} />)}
              {view === "reorder" && (reorderRows.length === 0
                ? <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.greenDk || C.green }}>Nothing to reorder — every item is above its reorder point.</div>
                : <InventoryTable rows={reorderRows} />)}
              {view === "movements" && <MovementsView rows={movements} loading={auxLoading} />}
              {view === "suppliers" && <SuppliersView rows={suppliers} loading={auxLoading} />}
              {view === "analytics" && <AnalyticsView rows={rows} />}
            </>
          )}
      </div>
    </div>
  );
}

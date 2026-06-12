/**
 * InventoryList.jsx — /farm/inventory — PIXEL-EXACT rebuild of the prototype's Inventory.
 *
 * Reproduces coreInventoryView (stock/movements/reorder/suppliers/analytics) pixel-for-
 * pixel — capital-strip, inventory-table + stock-progress bars, reorder-card grid,
 * cycle-view-tabs under <TfpShell> — replacing the Tailwind page. Wired real:
 *   Stock     GET /api/v1/inputs (with computed stock_status)   Add → POST /api/v1/inputs
 *   Movements GET/POST /api/v1/input-transactions (PURCHASE = receive, USAGE = use;
 *             the after_input_txn_inventory trigger auto-updates on-hand stock)
 *   Suppliers GET /api/v1/suppliers
 * Analytics = value by category, derived. Honest-empty where there's nothing logged.
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fjd0(v) { const n = Number(v ?? 0); return `FJD ${Math.round(n).toLocaleString("en-FJ")}`; }
function fjd2(v) { const n = Number(v ?? 0); return `FJD ${n.toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function num(v) { return Number(v ?? 0); }

const CAT_LABEL = { FERTILIZER: "Fertilizer", PESTICIDE: "Pesticide", HERBICIDE: "Herbicide", FUNGICIDE: "Fungicide", SEED: "Seed", SEEDLING: "Seedling", TOOL: "Tool", PACKAGING: "Packaging", FUEL: "Fuel", OTHER: "Other" };
const CAT_OPTIONS = Object.entries(CAT_LABEL).map(([value, label]) => ({ value, label }));
const VIEWS = [["stock", "Stock", "Current snapshot"], ["movements", "Movements", "Audit feed"], ["reorder", "Reorder", "What to order"], ["suppliers", "Suppliers", "Who supplies"], ["analytics", "Analytics", "Value by category"]];
const CRITICAL = new Set(["OUT_OF_STOCK", "REORDER_NOW"]);
const statusBand = (s) => CRITICAL.has(s) ? "critical" : s === "LOW_STOCK" ? "low" : s === "NO_REORDER_SET" ? "unset" : "ok";
const STATUS_COLOR = { critical: "var(--red)", low: "var(--amber)", ok: "var(--green-dk)", unset: "var(--muted)" };
const itemValue = (i) => num(i.current_stock_qty) * num(i.unit_cost_fjd);

async function getInputs(farmId) { const r = await fetch(`/api/v1/inputs${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`, { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? []; }
async function getMovements() { const r = await fetch("/api/v1/input-transactions", { headers: authHeaders() }); if (!r.ok) return []; return (await r.json())?.data ?? []; }
async function getSuppliers() { const r = await fetch("/api/v1/suppliers", { headers: authHeaders() }); if (!r.ok) return []; const b = await r.json(); return b?.data ?? []; }

function StockBar({ i }) {
  const cur = num(i.current_stock_qty), rop = num(i.reorder_point_qty);
  if (!rop) return <span className="stock-qty-text">{cur} {i.unit_of_measure}</span>;
  const scale = rop * 2;
  const fillPct = Math.max(2, Math.min(100, (cur / scale) * 100));
  const band = statusBand(i.stock_status);
  return (
    <div>
      <span className="stock-qty-text">{cur} {i.unit_of_measure} <span style={{ color: "var(--muted)", fontSize: 11 }}>· min {rop}</span></span>
      <div className="stock-progress-wrap"><div className="stock-progress-bar"><div className="stock-progress-fill" style={{ width: `${fillPct}%`, background: STATUS_COLOR[band] }} /><div className="stock-progress-min-marker" style={{ left: "50%" }} /></div></div>
    </div>
  );
}

function InventoryInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("stock");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [storage, setStorage] = useState("all");
  const [sort, setSort] = useState("days-left-asc");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [move, setMove] = useState(null); // {input|null, kind:'PURCHASE'|'USAGE'}

  const inputsQ = useQuery({ queryKey: ["inputs", farmId], queryFn: () => getInputs(farmId), enabled: !!farmId });
  const movesQ = useQuery({ queryKey: ["moves"], queryFn: getMovements, enabled: !!farmId });
  const supsQ = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers, enabled: !!farmId });
  const items = inputsQ.data ?? [];
  const movements = movesQ.data ?? [];
  const suppliers = supsQ.data ?? [];
  const supName = (id) => suppliers.find((s) => s.supplier_id === id)?.supplier_name;

  // Burn rate (last 30d USAGE) + days-left, per item — real, from movements.
  const burnByInput = useMemo(() => {
    const cut = Date.now() - 30 * 864e5; const m = {};
    movements.forEach((t) => { if (t.txn_type !== "USAGE") return; const d = Date.parse(t.transaction_date); if (!Number.isFinite(d) || d < cut) return; m[t.input_id] = (m[t.input_id] || 0) + num(t.quantity); });
    return m;
  }, [movements]);
  const burn30 = (i) => burnByInput[i.input_id] || 0;
  const daysLeft = (i) => { const daily = burn30(i) / 30; return daily > 0 ? Math.round(num(i.current_stock_qty) / daily) : null; };
  const storages = useMemo(() => Array.from(new Set(items.map((i) => i.storage_location).filter(Boolean))), [items]);

  const totalValue = items.reduce((s, i) => s + itemValue(i), 0);
  const critical = items.filter((i) => CRITICAL.has(i.stock_status)).length;
  const low = items.filter((i) => i.stock_status === "LOW_STOCK").length;
  const chemValue = items.filter((i) => ["PESTICIDE", "HERBICIDE", "FUNGICIDE"].includes(i.input_category)).reduce((s, i) => s + itemValue(i), 0);
  const expiringCount = items.filter((i) => i.expiring_soon).length;
  const catsPresent = useMemo(() => { const m = {}; items.forEach((i) => { m[i.input_category] = (m[i.input_category] || 0) + 1; }); return m; }, [items]);

  let rows = items.slice();
  if (cat !== "all") rows = rows.filter((i) => i.input_category === cat);
  if (status !== "all") rows = rows.filter((i) => statusBand(i.stock_status) === status);
  if (storage !== "all") rows = rows.filter((i) => i.storage_location === storage);
  if (q.trim()) { const qq = q.toLowerCase(); rows = rows.filter((i) => `${i.input_name} ${i.input_id} ${i.storage_location || ""}`.toLowerCase().includes(qq)); }
  rows.sort((a, b) => {
    if (sort === "name") return (a.input_name || "").localeCompare(b.input_name || "");
    if (sort === "value-desc") return itemValue(b) - itemValue(a);
    if (sort === "category") return (a.input_category || "").localeCompare(b.input_category || "");
    const da = daysLeft(a), db = daysLeft(b); // days-left-asc (nulls last)
    return (da == null ? Infinity : da) - (db == null ? Infinity : db);
  });
  const reorderItems = items.filter((i) => CRITICAL.has(i.stock_status));
  const recentMoves = movements.slice(0, 4);

  const refetch = () => qc.invalidateQueries({ queryKey: ["inputs", farmId] });

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Inventory</h1><div className="subtitle">Seed, fertilizer, chemicals, fuel · what you hold and what to reorder</div></div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={13} />Add item</button>
            </div>
          </div>

          <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <div className="capital-tile total"><div className="capital-tile-label">Total inventory value</div><div className="capital-tile-value">{fjd0(totalValue)}</div><div className="capital-tile-sub">capital tied up</div></div>
            <div className="capital-tile critical"><div className="capital-tile-label">Critical items</div><div className={`capital-tile-value ${critical > 0 ? "critical" : ""}`} style={{ color: critical > 0 ? "var(--red)" : null }}>{critical}</div><div className="capital-tile-sub">order now</div></div>
            <div className="capital-tile low"><div className="capital-tile-label">Low items</div><div className="capital-tile-value" style={{ color: low > 0 ? "var(--amber)" : null }}>{low}</div><div className="capital-tile-sub">in buffer</div></div>
            <div className="capital-tile"><div className="capital-tile-label">In chemicals</div><div className="capital-tile-value">{fjd0(chemValue)}</div><div className="capital-tile-sub">WHD-tracked</div></div>
            <div className="capital-tile"><div className="capital-tile-label">Expiring</div><div className="capital-tile-value" style={{ color: expiringCount > 0 ? "var(--amber)" : null }}>{expiringCount}</div><div className="capital-tile-sub">within 30 days</div></div>
          </div>

          {recentMoves.length > 0 && (
            <div style={{ background: "rgba(106,168,79,0.07)", border: "1px solid var(--line)", borderLeft: "3px solid var(--green)", borderRadius: 9, padding: "9px 13px", margin: "12px 0", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green-dk)", textTransform: "uppercase", letterSpacing: ".4px" }}>Recent events</span>
              {recentMoves.map((m) => <span key={m.txn_id} style={{ fontSize: 11.5, color: "var(--soil)" }}>{m.txn_type === "PURCHASE" ? "↓" : "↑"} {m.input_name} · {num(m.quantity)}{m.unit}</span>)}
            </div>
          )}

          <div className="cycle-view-tabs">
            {VIEWS.map(([id, l, s]) => <div key={id} className={`task-tab ${view === id ? "active" : ""}`} onClick={() => setView(id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></div>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its inventory.</div>
            : inputsQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : view === "stock" ? (
              <>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Category:</span>
                  <button className={`filter-pill ${cat === "all" ? "active" : ""}`} onClick={() => setCat("all")}>All<span className="filter-pill-count">{items.length}</span></button>
                  {Object.entries(catsPresent).map(([c, n]) => <button key={c} className={`filter-pill ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{CAT_LABEL[c] || c}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="task-controls-row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", alignSelf: "center" }}>Status:</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
                    <option value="all">All status</option><option value="critical">Critical</option><option value="low">Low</option><option value="ok">OK</option>
                  </select>
                  {storages.length > 0 && <>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", alignSelf: "center" }}>Storage:</span>
                    <select value={storage} onChange={(e) => setStorage(e.target.value)} style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
                      <option value="all">All locations</option>{storages.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>}
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", alignSelf: "center" }}>Sort:</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
                    <option value="days-left-asc">Days left ↑</option><option value="name">Name</option><option value="value-desc">Value ↓</option><option value="category">Category</option>
                  </select>
                  <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU, location..." style={{ width: "100%", padding: "7px 12px 7px 34px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                    <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={13} /></span>
                  </div>
                </div>
                {items.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>No items yet — add your seed, fertilizer, chemicals or fuel to track stock.</div>
                  : rows.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No items match these filters.</div>
                  : <><div className="inventory-table-wrap"><table className="inventory-table">
                    <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Storage</th><th>Stock</th><th>Min/Max</th><th>Burn rate</th><th>Days left</th><th>Value</th><th>Status</th></tr></thead>
                    <tbody>{rows.map((i) => {
                      const band = statusBand(i.stock_status); const dl = daysLeft(i); const b30 = burn30(i);
                      const rop = num(i.reorder_point_qty); const max = rop ? rop + num(i.reorder_qty || rop) : 0;
                      return (
                        <tr key={i.input_id} onClick={() => setMove({ input: i, kind: "PURCHASE" })} style={{ cursor: "pointer" }}>
                          <td className="sku-cell" style={{ fontSize: 10.5, fontFamily: "Menlo,monospace", color: "var(--muted)" }}>{i.input_id}</td>
                          <td className="name-cell"><span style={{ fontWeight: 600, color: "var(--soil)" }}>{i.input_name}</span>{i.expiring_soon && <span className="compliance-badge expired" style={{ marginLeft: 6 }}>EXPIRING</span>}{i.is_chemical && <span className="compliance-badge restricted" style={{ marginLeft: 6 }}>CHEM</span>}</td>
                          <td><span className={`inv-category-pill ${(i.input_category || "").toLowerCase()}`}>{CAT_LABEL[i.input_category] || i.input_category}</span></td>
                          <td>{i.storage_location ? <span className="storage-chip">{i.storage_location}</span> : <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>}</td>
                          <td><StockBar i={i} /></td>
                          <td className="value-cell" style={{ fontSize: 10.5, color: "var(--muted)" }}>{rop ? `${rop}/${max}` : "—"}</td>
                          <td><span className="burn-rate-display">{b30 > 0 ? `${b30.toFixed(1)}${i.unit_of_measure}/30d` : "—"}</span></td>
                          <td className="value-cell">{dl == null ? "∞" : `${dl}d`}</td>
                          <td className="value-cell">{i.unit_cost_fjd ? fjd2(itemValue(i)) : "—"}</td>
                          <td><span className={`inv-status-pill ${band}`}><span className="inv-status-dot" />{band}</span></td>
                        </tr>
                      );
                    })}</tbody>
                  </table></div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="btn btn-secondary" onClick={() => setMove({ input: null, kind: "USAGE" })}><ArrowUpFromLine size={14} />Use stock</button>
                    <button className="btn btn-primary" onClick={() => setMove({ input: null, kind: "PURCHASE" })}><ArrowDownToLine size={14} />Receive stock</button>
                  </div></>}
              </>
            ) : view === "reorder" ? (
              reorderItems.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>Nothing to reorder — all items are above their reorder point.</div>
                : <div className="reorder-grid">{reorderItems.map((i) => (
                  <div className="reorder-card" key={i.input_id}>
                    <div className="reorder-card-head"><span className="reorder-card-title">{i.input_name}</span><span style={{ fontSize: 11, fontWeight: 700, color: "var(--red)" }}>{i.stock_status === "OUT_OF_STOCK" ? "OUT" : "REORDER"}</span></div>
                    <div className="reorder-card-meta">On hand {num(i.current_stock_qty)} {i.unit_of_measure} · min {num(i.reorder_point_qty)}{i.reorder_qty ? ` · order ${num(i.reorder_qty)}` : ""}</div>
                    {i.preferred_supplier_id && <div className="reorder-card-supplier-mini">Supplier: {supName(i.preferred_supplier_id) || i.preferred_supplier_id}</div>}
                    <div className="reorder-card-actions"><button className="btn btn-primary btn-sm" onClick={() => setMove({ input: i, kind: "PURCHASE" })}><ArrowDownToLine size={12} />Receive stock</button></div>
                  </div>
                ))}</div>
            ) : view === "movements" ? (
              movesQ.isLoading ? <div className="card" style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
                : (movesQ.data ?? []).length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No stock movements yet — receiving or using stock records here.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{(movesQ.data ?? []).map((m) => (
                  <div key={m.txn_id} className="card" style={{ padding: "9px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{m.input_name} <span style={{ color: m.txn_type === "PURCHASE" ? "var(--green-dk)" : "var(--amber)", fontWeight: 700 }}>· {m.txn_type}</span></div><div style={{ fontSize: 11, color: "var(--muted)" }}>{String(m.transaction_date).slice(0, 10)} · {num(m.quantity)} {m.unit}{m.total_cost_fjd ? ` · ${fjd2(m.total_cost_fjd)}` : ""}</div></div>
                  </div>
                ))}</div>
            ) : view === "suppliers" ? (
              supsQ.isLoading ? <div className="card" style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
                : suppliers.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No suppliers added yet.</div>
                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>{suppliers.map((s) => (
                  <div key={s.supplier_id} className="card" style={{ padding: "12px 14px" }}><div style={{ fontWeight: 700, color: "var(--soil)" }}>{s.supplier_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.supplier_type || "—"}{s.island ? ` · ${s.island}` : ""}{s.phone ? ` · ${s.phone}` : ""}</div></div>
                ))}</div>
            ) : <AnalyticsView items={items} />}
        </div>
      </main>

      {addOpen && <AddInputModal farmId={farmId} suppliers={suppliers} onClose={() => setAddOpen(false)} onSaved={() => { refetch(); setAddOpen(false); }} />}
      {move && <MoveModal farmId={farmId} input={move.input} kind={move.kind} items={items} suppliers={suppliers} onClose={() => setMove(null)} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["moves"] }); setMove(null); }} />}
    </TfpShell>
  );
}

function AnalyticsView({ items }) {
  const byCat = useMemo(() => {
    const m = {};
    items.forEach((i) => { const k = i.input_category; (m[k] = m[k] || { cat: k, value: 0, count: 0 }); m[k].value += itemValue(i); m[k].count += 1; });
    return Object.values(m).sort((a, b) => b.value - a.value);
  }, [items]);
  if (!byCat.length) return <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Stock value by category appears once you add items with a unit cost.</div>;
  const max = byCat.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {byCat.map((r) => (
        <div key={r.cat}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--soil)", fontWeight: 600, marginBottom: 4 }}><span>{CAT_LABEL[r.cat] || r.cat} · {r.count} item{r.count === 1 ? "" : "s"}</span><span>{fjd0(r.value)}</span></div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 8, borderRadius: 999, width: `${(r.value / max) * 100}%`, background: "var(--green-dk)" }} /></div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function AddInputModal({ farmId, suppliers, onClose, onSaved }) {
  const [f, setF] = useState({ input_name: "", input_category: "FERTILIZER", unit_of_measure: "kg", current_stock_qty: "0", reorder_point_qty: "", reorder_qty: "", unit_cost_fjd: "", preferred_supplier_id: "", storage_location: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (!f.input_name.trim()) { emitToast("Item name is required"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/inputs", { method: "POST", headers: authHeaders(), body: JSON.stringify({
        farm_id: farmId, input_name: f.input_name.trim(), input_category: f.input_category, unit_of_measure: f.unit_of_measure.trim() || "unit",
        current_stock_qty: Number(f.current_stock_qty) || 0, reorder_point_qty: f.reorder_point_qty ? Number(f.reorder_point_qty) : null,
        reorder_qty: f.reorder_qty ? Number(f.reorder_qty) : null, unit_cost_fjd: f.unit_cost_fjd ? Number(f.unit_cost_fjd) : null,
        preferred_supplier_id: f.preferred_supplier_id || null, storage_location: f.storage_location.trim() || null }) });
      if (!r.ok) { let m = "Could not add item"; try { const b = await r.json(); m = b?.detail || m; } catch {} emitToast(typeof m === "string" ? m : "Could not add item"); return; }
      emitToast("Item added"); onSaved?.();
    } catch { emitToast("Could not add item"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Add inventory item</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div><label>Item name</label><input value={f.input_name} onChange={set("input_name")} placeholder="e.g. NPK 13-13-21" /></div>
            <div><label>Category</label><select value={f.input_category} onChange={set("input_category")}>{CAT_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Unit</label><input value={f.unit_of_measure} onChange={set("unit_of_measure")} placeholder="kg / L / unit" /></div>
            <div><label>On hand</label><input type="number" min="0" step="0.01" value={f.current_stock_qty} onChange={set("current_stock_qty")} /></div>
            <div><label>Unit cost (FJD)</label><input type="number" min="0" step="0.01" value={f.unit_cost_fjd} onChange={set("unit_cost_fjd")} /></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Reorder point</label><input type="number" min="0" step="0.01" value={f.reorder_point_qty} onChange={set("reorder_point_qty")} placeholder="alert below this" /></div>
            <div><label>Reorder qty</label><input type="number" min="0" step="0.01" value={f.reorder_qty} onChange={set("reorder_qty")} placeholder="how much to buy" /></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Supplier</label><select value={f.preferred_supplier_id} onChange={set("preferred_supplier_id")}><option value="">—</option>{suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}</select></div>
            <div><label>Storage location</label><input value={f.storage_location} onChange={set("storage_location")} placeholder="e.g. Shed A" /></div>
          </div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add item"}</button></div>
      </div>
    </div>
  );
}

function MoveModal({ farmId, input, kind, items, suppliers, onClose, onSaved }) {
  const receive = kind === "PURCHASE";
  const [inputId, setInputId] = useState(input?.input_id || "");
  const sel = input || (items || []).find((i) => i.input_id === inputId) || null;
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(sel?.unit_cost_fjd ? String(sel.unit_cost_fjd) : "");
  const [supplier, setSupplier] = useState(sel?.preferred_supplier_id || "");
  const [busy, setBusy] = useState(false);
  const unit = sel?.unit_of_measure || "unit";
  async function submit() {
    if (!sel) { emitToast("Pick an item"); return; }
    if (!Number(qty)) { emitToast("Enter a quantity"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/input-transactions", { method: "POST", headers: authHeaders(), body: JSON.stringify({
        input_id: sel.input_id, farm_id: farmId, transaction_type: kind, transaction_date: todayISO(),
        quantity: Number(qty), unit,
        ...(receive ? { unit_cost_fjd: cost ? Number(cost) : null, supplier_id: supplier || null } : {}) }) });
      if (!r.ok) throw new Error();
      emitToast(receive ? "Stock received" : "Stock used"); onSaved?.();
    } catch { emitToast("Could not record movement"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{receive ? "Receive stock" : "Use stock"}{input ? ` — ${input.input_name}` : ""}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          {!input && <Field label="Item"><select value={inputId} onChange={(e) => setInputId(e.target.value)}><option value="">Pick an item…</option>{(items || []).map((i) => <option key={i.input_id} value={i.input_id}>{i.input_name} · {num(i.current_stock_qty)}{i.unit_of_measure}</option>)}</select></Field>}
          {sel && <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "10px 0 12px" }}>On hand: {num(sel.current_stock_qty)} {unit}. {receive ? "Receiving adds to" : "Using subtracts from"} on-hand stock.</div>}
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: receive ? "1fr 1fr" : "1fr", gap: 10 }}>
            <div><label>Quantity ({unit})</label><input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div>
            {receive && <div><label>Unit cost (FJD)</label><input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>}
          </div>
          {receive && <Field label="Supplier"><select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">—</option>{suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}</select></Field>}
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : receive ? "Receive" : "Use"}</button></div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function InventoryList() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <InventoryInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

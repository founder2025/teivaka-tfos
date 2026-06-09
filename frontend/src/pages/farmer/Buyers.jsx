/**
 * Buyers.jsx — /farm/buyers
 *
 * Team design system (FarmDashboard pattern) + v262 Buyers surface, all 5
 * prototype tabs. Real data where the API serves it; honest structured empties
 * (no mock data) elsewhere.
 *   Live: GET/POST /api/v1/customers, GET/POST /api/v1/orders,
 *         PATCH /orders/{id}/status, GET /api/v1/productions.
 *   Empty (named backend needed): Demand signals, Pipeline, Analytics.
 */
import { useMemo, useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { Plus, Phone } from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";
import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E",
};
const CUSTOMER_TYPES = [
  { value: "MARKET_VENDOR", label: "Market vendor" },
  { value: "HOTEL", label: "Hotel" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "SUPERMARKET", label: "Supermarket" },
  { value: "EXPORT", label: "Export" },
  { value: "INDIVIDUAL", label: "Individual" },
];
const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PICKING", "DISPATCHED", "DELIVERED", "CANCELLED", "INVOICED", "PAID"];
const STATUS_COLOR = {
  PENDING: C.amber, CONFIRMED: C.green, PICKING: C.green, DISPATCHED: C.green,
  DELIVERED: C.greenDk, PAID: C.greenDk, INVOICED: C.greenDk, CANCELLED: C.red,
};
const TABS = [
  { id: "directory", label: "Directory", hint: "Relationships" },
  { id: "orders", label: "Active orders", hint: "Open POs" },
  { id: "receivables", label: "Receivables", hint: "Money owed" },
  { id: "demand", label: "Demand signals", hint: "Feeds forecast", needs: "a demand-signal feed" },
  { id: "pipeline", label: "Pipeline", hint: "Leads", needs: "a sales-pipeline endpoint" },
  { id: "analytics", label: "Analytics", hint: "Top buyers" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatFJD(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "FJD —";
  return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function typeLabel(v) { return CUSTOMER_TYPES.find((t) => t.value === v)?.label || v || "—"; }

async function fetchCustomers() {
  const res = await fetch("/api/v1/customers", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}
async function fetchOrders(farmId) {
  const qs = farmId ? `?farm_id=${encodeURIComponent(farmId)}` : "";
  const res = await fetch(`/api/v1/orders${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? [];
}
async function fetchProductions() {
  const res = await fetch("/api/v1/productions?is_active=true", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data?.productions ?? [];
}

function AddCustomerModal({ isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("MARKET_VENDOR");
  const [phone, setPhone] = useState("");
  const [island, setIsland] = useState("");
  const [terms, setTerms] = useState("0");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) { emitToast("Buyer name is required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/customers", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ customer_name: name.trim(), customer_type: type, phone: phone.trim() || null, island: island.trim() || null, payment_terms_days: Number(terms) || 0 }),
      });
      if (!res.ok) throw new Error();
      emitToast("Buyer added"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not add buyer"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add buyer"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add buyer</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Buyer name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nayans Supermarket" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Type
          <ThemedSelect value={type} onChange={setType} options={CUSTOMER_TYPES} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+679 …" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Island (optional)
            <input value={island} onChange={(e) => setIsland(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Payment terms (days)
            <input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        </div>
      </div>
    </Modal>
  );
}

function NewOrderModal({ farmId, customers, isOpen, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState("");
  const [productionId, setProductionId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [grade, setGrade] = useState("A");
  const [busy, setBusy] = useState(false);
  const prodQuery = useQuery({ queryKey: ["productions"], queryFn: fetchProductions, enabled: isOpen });
  const productions = prodQuery.data ?? [];
  const total = (Number(qty || 0) * Number(price || 0)) || 0;
  async function submit() {
    if (!customerId || !productionId || !qty || !price) { emitToast("Buyer, crop, quantity and price are required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ farm_id: farmId, customer_id: customerId, order_date: todayISO(), line_items: [{ production_id: productionId, quantity_kg: Number(qty), unit_price_fjd: Number(price), grade }] }),
      });
      if (!res.ok) throw new Error();
      emitToast("Order created"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not create order"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New order"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Create · {formatFJD(total)}</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Buyer
          <ThemedSelect value={customerId} onChange={setCustomerId} placeholder="Pick a buyer…" options={customers.map((c) => ({ value: c.customer_id, label: c.customer_name }))} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Crop
          <ThemedSelect value={productionId} onChange={setProductionId} placeholder="Pick a crop…" options={productions.map((p) => ({ value: p.production_id, label: p.production_name || p.production_id }))} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Qty (kg)
            <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Price/kg
            <input type="number" min="0" step="0.10" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Grade
            <ThemedSelect value={grade} onChange={setGrade} options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]} /></label>
        </div>
      </div>
    </Modal>
  );
}

function Pill({ status, onChange }) {
  return (
    <select value={status} onChange={(e) => onChange(e.target.value)} className="text-xs font-semibold rounded-full px-2 py-1 border"
      style={{ color: STATUS_COLOR[status] || C.muted, borderColor: C.border, background: "white" }}>
      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function NeedsBlock({ tab }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{tab.label}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>
        This tab is ready and will populate from {tab.needs}. No numbers shown until that data is real — by design, so nothing here is fabricated.
      </div>
    </div>
  );
}

function BuyersInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("directory");
  const [addCust, setAddCust] = useState(false);
  const [newOrder, setNewOrder] = useState(false);

  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const ordersQuery = useQuery({ queryKey: ["orders", farmId], queryFn: () => fetchOrders(farmId), enabled: !!farmId });
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const openOrders = orders.filter((o) => !["DELIVERED", "PAID", "CANCELLED"].includes(o.order_status)).length;
  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];

  async function advance(orderId, status) {
    try {
      const res = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/status?order_status=${status}`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error();
      emitToast(`Order → ${status}`); qc.invalidateQueries({ queryKey: ["orders", farmId] });
    } catch { emitToast("Could not update order"); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Buyers</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Revenue CRM · orders · receivables</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FarmSelector />
        <ModeDropdown />
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Buyers" value={String(customers.length)} sub="in directory" loading={customersQuery.isLoading} />
        <MetricCard label="Open orders" value={String(openOrders)} sub="not yet delivered" loading={ordersQuery.isLoading} />
        <MetricCard label="Receivables" phase="Phase 6" />
        <MetricCard label="Reliability" phase="Phase 6" />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-4 py-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>{activeTab.label}</div>
          {tab === "directory" && <button onClick={() => setAddCust(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={15} /> Add buyer</button>}
          {tab === "orders" && <button onClick={() => setNewOrder(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={15} /> New order</button>}
        </div>

        {tab === "directory" && (
          <div className="space-y-2">
            {customersQuery.isLoading && <p style={{ color: C.muted }}>Loading buyers…</p>}
            {!customersQuery.isLoading && customers.length === 0 && <p style={{ color: C.muted }}>No buyers yet. Add your first buyer.</p>}
            {customers.map((c) => (
              <div key={c.customer_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                <div>
                  <div className="font-medium text-sm" style={{ color: C.soil }}>{c.customer_name}</div>
                  <div className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                    <span>{typeLabel(c.customer_type)}</span>
                    {c.phone && <span className="flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                    {c.island && <span>· {c.island}</span>}
                  </div>
                </div>
                <div className="text-xs" style={{ color: C.muted }}>{Number(c.payment_terms_days) > 0 ? `${c.payment_terms_days}d terms` : "cash"}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            {ordersQuery.isLoading && <p style={{ color: C.muted }}>Loading orders…</p>}
            {!ordersQuery.isLoading && orders.length === 0 && <p style={{ color: C.muted }}>No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.order_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                <div>
                  <div className="font-medium text-sm" style={{ color: C.soil }}>{o.customer_name}</div>
                  <div className="text-xs" style={{ color: C.muted }}>{String(o.order_date).slice(0, 10)}{(o.total_amount_fjd ?? o.total_fjd) != null ? ` · ${formatFJD(o.total_amount_fjd ?? o.total_fjd)}` : ""}</div>
                </div>
                <Pill status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
              </div>
            ))}
          </div>
        )}

        {tab === "receivables" && (() => {
          // Fulfilled-but-unpaid orders = money owed. Real, derived from /orders.
          const OWED = ["DISPATCHED", "DELIVERED", "INVOICED"];
          const owed = orders.filter((o) => OWED.includes(o.order_status));
          const amt = (o) => Number(o.net_amount_fjd ?? o.total_amount_fjd ?? o.total_fjd ?? 0);
          const total = owed.reduce((a, o) => a + amt(o), 0);
          const days = (o) => { const d = Date.parse(o.expected_delivery_date || o.order_date); return Number.isFinite(d) ? Math.floor((Date.now() - d) / 864e5) : null; };
          return (
            <div className="space-y-2">
              {ordersQuery.isLoading && <p style={{ color: C.muted }}>Loading…</p>}
              {!ordersQuery.isLoading && owed.length === 0 && <p style={{ color: C.muted }}>Nothing outstanding — all fulfilled orders are paid.</p>}
              {owed.length > 0 && <div className="text-sm font-semibold mb-1" style={{ color: C.soil }}>Owed: {formatFJD(total)} across {owed.length} order{owed.length === 1 ? "" : "s"}</div>}
              {owed.map((o) => { const d = days(o); return (
                <div key={o.order_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: C.cream }}>
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.soil }}>{o.customer_name}</div>
                    <div className="text-xs" style={{ color: C.muted }}>{o.order_status}{d != null ? ` · ${d}d outstanding` : ""}</div>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: d != null && d > 30 ? C.red : C.soil }}>{formatFJD(amt(o))}</div>
                </div>
              ); })}
            </div>
          );
        })()}

        {tab === "analytics" && (() => {
          // Top buyers by order value + count. Real, derived from /orders.
          const amt = (o) => Number(o.net_amount_fjd ?? o.total_amount_fjd ?? o.total_fjd ?? 0);
          const by = {};
          orders.filter((o) => o.order_status !== "CANCELLED").forEach((o) => {
            const k = o.customer_name || o.customer_id || "—";
            (by[k] = by[k] || { name: k, value: 0, count: 0 }); by[k].value += amt(o); by[k].count += 1;
          });
          const ranked = Object.values(by).sort((a, b) => b.value - a.value);
          const max = ranked.reduce((m, r) => Math.max(m, r.value), 0);
          if (ranked.length === 0) return <p style={{ color: C.muted }}>Buyer analytics appear once you log orders.</p>;
          return (
            <div className="space-y-2">
              {ranked.map((r) => (
                <div key={r.name}>
                  <div className="flex justify-between text-xs mb-0.5" style={{ color: C.soil }}><span className="font-medium">{r.name}</span><span>{formatFJD(r.value)} · {r.count} order{r.count === 1 ? "" : "s"}</span></div>
                  <div className="h-2 rounded-full" style={{ background: C.cream }}><div className="h-2 rounded-full" style={{ width: `${max ? Math.round((r.value / max) * 100) : 0}%`, background: C.greenDk }} /></div>
                </div>
              ))}
            </div>
          );
        })()}

        {activeTab.needs && <NeedsBlock tab={activeTab} />}
      </section>

      <AddCustomerModal isOpen={addCust} onClose={() => setAddCust(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })} />
      <NewOrderModal farmId={farmId} customers={customers} isOpen={newOrder} onClose={() => setNewOrder(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["orders", farmId] })} />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Buyers() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <BuyersInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

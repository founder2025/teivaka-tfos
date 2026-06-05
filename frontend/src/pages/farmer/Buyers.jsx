/**
 * Buyers.jsx — /farm/buyers
 *
 * Replaces the ComingSoon stub. Parity target: prototype v262 Buyers surface.
 * SCOPE (bounded by live API): Customers directory + Orders.
 *   GET/POST /api/v1/customers
 *   GET/POST /api/v1/orders, PATCH /api/v1/orders/{id}/status
 *   GET /api/v1/productions (for order line items)
 * NOT yet backed (so absent, no mock data): reliability score, receivables
 * ageing, demand signals, pipeline, WhatsApp deep-links → need backend.
 *
 * Conventions mirror CashLedger/Labor: localStorage JWT, react-query,
 * shared Modal + ThemedSelect, warm palette, window toast events.
 */
import { useMemo, useState } from "react";
import {
  QueryClient, QueryClientProvider, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { Truck, Plus, Phone, ChevronRight } from "lucide-react";

import Modal from "../../components/ui/Modal.jsx";
import ThemedSelect from "../../components/inputs/ThemedSelect.jsx";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", bgPage: "#F5EFE0", border: "#E6DED0",
  muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000",
  red: "#D4442E", greenTint: "#E9F2DD", amberTint: "#FAF1D5",
};

const CUSTOMER_TYPES = [
  { value: "MARKET_VENDOR", label: "Market vendor" },
  { value: "HOTEL", label: "Hotel" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "SUPERMARKET", label: "Supermarket" },
  { value: "EXPORT", label: "Export" },
  { value: "INDIVIDUAL", label: "Individual" },
];
const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PICKING", "DISPATCHED", "DELIVERED", "CANCELLED", "INVOICED", "PAID",
];
const STATUS_COLOR = {
  PENDING: C.amber, CONFIRMED: C.green, PICKING: C.green, DISPATCHED: C.green,
  DELIVERED: C.greenDk, PAID: C.greenDk, INVOICED: C.greenDk, CANCELLED: C.red,
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
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

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const b = await res.json(); return b?.data ?? b?.farms ?? [];
}
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

// --- Add customer ----------------------------------------------------
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
        body: JSON.stringify({
          customer_name: name.trim(), customer_type: type,
          phone: phone.trim() || null, island: island.trim() || null,
          payment_terms_days: Number(terms) || 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Buyer added"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not add buyer"); } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add buyer"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add buyer</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Buyer name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nayans Supermarket" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Type
          <ThemedSelect value={type} onChange={setType} options={CUSTOMER_TYPES} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+679 …" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Island (optional)
            <input value={island} onChange={(e) => setIsland(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
          <label className="block text-sm" style={{ color: C.soil }}>Payment terms (days)
            <input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

// --- New order (single line item) ------------------------------------
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
        body: JSON.stringify({
          farm_id: farmId, customer_id: customerId, order_date: todayISO(),
          line_items: [{ production_id: productionId, quantity_kg: Number(qty), unit_price_fjd: Number(price), grade }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitToast("Order created"); onSaved?.(); onClose?.();
    } catch { emitToast("Could not create order"); } finally { setBusy(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New order"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Create · {formatFJD(total)}</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Buyer
          <ThemedSelect value={customerId} onChange={setCustomerId} placeholder="Pick a buyer…"
            options={customers.map((c) => ({ value: c.customer_id, label: c.customer_name }))} />
        </label>
        <label className="block text-sm" style={{ color: C.soil }}>Crop
          <ThemedSelect value={productionId} onChange={setProductionId} placeholder="Pick a crop…"
            options={productions.map((p) => ({ value: p.production_id, label: p.production_name || p.production_id }))} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm" style={{ color: C.soil }}>Qty (kg)
            <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
          <label className="block text-sm" style={{ color: C.soil }}>Price/kg
            <input type="number" min="0" step="0.10" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} />
          </label>
          <label className="block text-sm" style={{ color: C.soil }}>Grade
            <ThemedSelect value={grade} onChange={setGrade} options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function Pill({ status, onChange }) {
  return (
    <select value={status} onChange={(e) => onChange(e.target.value)}
      className="text-xs font-semibold rounded-full px-2 py-1 border"
      style={{ color: STATUS_COLOR[status] || C.muted, borderColor: C.border, background: "white" }}>
      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function BuyersInner() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("customers");
  const [farmId, setFarmId] = useState("");
  const [addCust, setAddCust] = useState(false);
  const [newOrder, setNewOrder] = useState(false);

  const farmsQuery = useQuery({ queryKey: ["farms"], queryFn: fetchFarms });
  const farms = farmsQuery.data ?? [];
  const activeFarm = farmId || farms[0]?.farm_id || "";
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const ordersQuery = useQuery({ queryKey: ["orders", activeFarm], queryFn: () => fetchOrders(activeFarm), enabled: !!activeFarm });
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  async function advance(orderId, status) {
    try {
      const res = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/status?order_status=${status}`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error();
      emitToast(`Order → ${status}`);
      qc.invalidateQueries({ queryKey: ["orders", activeFarm] });
    } catch { emitToast("Could not update order"); }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" style={{ background: C.bgPage, minHeight: "100%" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Truck size={22} color={C.soil} />
          <h1 className="text-xl font-semibold" style={{ color: C.soil }}>Buyers</h1>
        </div>
        <div className="flex items-center gap-2">
          {farms.length > 1 && (
            <ThemedSelect value={activeFarm} onChange={setFarmId} options={farms.map((f) => ({ value: f.farm_id, label: f.farm_name || f.farm_id }))} />
          )}
          {tab === "customers" ? (
            <button onClick={() => setAddCust(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={16} /> Add buyer</button>
          ) : (
            <button onClick={() => setNewOrder(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm" style={{ background: C.greenDk }}><Plus size={16} /> New order</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Buyers</div>
          <div className="text-2xl font-semibold" style={{ color: C.soil }}>{customers.length}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "white", borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.muted }}>Open orders</div>
          <div className="text-2xl font-semibold" style={{ color: C.greenDk }}>{orders.filter((o) => !["DELIVERED", "PAID", "CANCELLED"].includes(o.order_status)).length}</div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: C.border }}>
        {[["customers", "Buyers"], ["orders", "Orders"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-sm font-medium"
            style={{ color: tab === k ? C.greenDk : C.muted, borderBottom: tab === k ? `2px solid ${C.green}` : "2px solid transparent" }}>{label}</button>
        ))}
      </div>

      {tab === "customers" && (
        <div className="space-y-2">
          {customersQuery.isLoading && <p style={{ color: C.muted }}>Loading buyers…</p>}
          {!customersQuery.isLoading && customers.length === 0 && <p style={{ color: C.muted }}>No buyers yet. Add your first buyer.</p>}
          {customers.map((c) => (
            <div key={c.customer_id} className="flex items-center justify-between rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
              <div>
                <div className="font-medium" style={{ color: C.soil }}>{c.customer_name}</div>
                <div className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                  <span>{typeLabel(c.customer_type)}</span>
                  {c.phone && <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>}
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
            <div key={o.order_id} className="flex items-center justify-between rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
              <div>
                <div className="font-medium" style={{ color: C.soil }}>{o.customer_name}</div>
                <div className="text-xs" style={{ color: C.muted }}>
                  {String(o.order_date).slice(0, 10)}
                  {(o.total_amount_fjd ?? o.total_fjd) != null ? ` · ${formatFJD(o.total_amount_fjd ?? o.total_fjd)}` : ""}
                </div>
              </div>
              <Pill status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
            </div>
          ))}
        </div>
      )}

      <AddCustomerModal isOpen={addCust} onClose={() => setAddCust(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })} />
      <NewOrderModal farmId={activeFarm} customers={customers} isOpen={newOrder} onClose={() => setNewOrder(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["orders", activeFarm] })} />
    </div>
  );
}

const _client = new QueryClient();
export default function Buyers() {
  return (
    <QueryClientProvider client={_client}>
      <BuyersInner />
    </QueryClientProvider>
  );
}

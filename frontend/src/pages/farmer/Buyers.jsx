/**
 * Buyers.jsx — /farm/buyers — PIXEL-EXACT rebuild of the prototype's Buyers CRM.
 *
 * Reproduces the sacred v263 prototype (coreBuyersView / buyersDirectoryView /
 * buyerDetailView) pixel-for-pixel — its own .buyer-*, .capital-strip, .cycle-view-tabs,
 * .reliability-* DOM under <TfpShell> — wired to REAL data, honest where not backed:
 *   Directory   → GET /api/v1/customers  + Add buyer (POST /customers)
 *   Orders      → GET /api/v1/orders, New order (POST /orders), status (PATCH .../status)
 *   Receivables / Analytics / Concentration / Top-buyer / per-buyer YTD → derived from /orders
 *   Reliability → DERIVED transparently from real order history (payment record, order
 *                 consistency, volume, relationship age). "Building" under 2 orders — a
 *                 credit signal is never fabricated.
 *   Demand / Pipeline / Disputes / Comms → honest-empty (no backend yet).
 */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MapPin, Truck, X, Phone } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fjd0(v) { const n = Number(v ?? 0); return `FJD ${Math.round(Math.abs(n)).toLocaleString("en-FJ")}`; }
function fjd2(v) { const n = Number(v ?? 0); return `FJD ${Math.abs(n).toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function initials(name) { return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"; }

const TYPE_LABEL = {
  MARKET_VENDOR: "Market vendor", HOTEL: "Hotel", RESTAURANT: "Restaurant",
  SUPERMARKET: "Supermarket", EXPORT: "Export agent", INDIVIDUAL: "Individual",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PICKING", "DISPATCHED", "DELIVERED", "CANCELLED", "INVOICED", "PAID"];
const OWED = ["DISPATCHED", "DELIVERED", "INVOICED"];
const VIEW_TABS = [
  ["directory", "Directory", "Relationships"], ["orders", "Active orders", "Open POs"],
  ["receivables", "Receivables", "What's owed"], ["demand", "Demand signals", "Feeds forecast"],
  ["pipeline", "Pipeline", "Leads"], ["analytics", "Analytics", "Risk & trends"],
];

async function getCustomers() { const r = await fetch("/api/v1/customers", { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? []; }
async function getOrders(farmId) { const r = await fetch(`/api/v1/orders${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`, { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? []; }
async function getProductions() { const r = await fetch("/api/v1/productions?is_active=true", { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data?.productions ?? []; }

function amt(o) { return Number(o.net_amount_fjd ?? o.total_amount_fjd ?? o.total_fjd ?? 0); }
function reliabilityTier(s) { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }

// Transparent reliability from REAL orders. Returns null (Building) under 2 orders.
function deriveReliability(custOrders) {
  const live = custOrders.filter((o) => o.order_status !== "CANCELLED");
  if (live.length < 2) return null;
  const fulfilled = live.filter((o) => ["DISPATCHED", "DELIVERED", "INVOICED", "PAID"].includes(o.order_status));
  const paid = live.filter((o) => o.order_status === "PAID").length;
  const payment = fulfilled.length ? Math.round(40 * (paid / fulfilled.length)) : 0;
  const orderConsistency = Math.min(30, live.length * 5);
  const revenue = live.reduce((s, o) => s + amt(o), 0);
  const volume = Math.min(20, Math.round(revenue / 250));
  const dates = live.map((o) => Date.parse(o.order_date)).filter(Number.isFinite);
  const months = dates.length ? Math.floor((Date.now() - Math.min(...dates)) / (30 * 864e5)) : 0;
  const relationshipAge = Math.min(10, months);
  const score = payment + orderConsistency + volume + relationshipAge;
  return { score: Math.min(100, score), breakdown: { payment, orderConsistency, volume, relationshipAge } };
}

function CapitalTile({ label, value, sub, valueColor, valueClass, onClick }) {
  return (
    <div className="capital-tile" onClick={onClick} style={onClick ? { cursor: "pointer" } : null}>
      <div className="capital-tile-label">{label}</div>
      <div className={`capital-tile-value ${valueClass || ""}`} style={valueColor ? { color: valueColor } : null}>{value}</div>
      <div className="capital-tile-sub">{sub}</div>
    </div>
  );
}

function BuyerCard({ b, onOpen }) {
  const rel = b.reliability;
  const tier = rel ? reliabilityTier(rel.score) : null;
  return (
    <div className="buyer-card" onClick={onOpen}>
      <div className="buyer-card-head">
        <div className={`buyer-avatar ${b.typeKey}`}>{initials(b.name)}</div>
        <div style={{ flex: 1 }}>
          <div className="buyer-card-name">{b.name}</div>
          <div style={{ margin: "3px 0" }}>
            <span className={`buyer-type-pill ${b.typeKey}`}>{b.typeLabel}</span>{" "}
            <span className="buyer-status-pill active">active</span>
          </div>
          {b.city && <div className="buyer-card-loc"><MapPin size={11} />{b.city}</div>}
        </div>
        <div className="buyer-card-reliability">
          {rel ? (
            <>
              <div className={`buyer-card-reliability-num reliability-score ${tier}`}>{rel.score}</div>
              <div className="buyer-card-reliability-label">reliability</div>
              <div className="reliability-mini-bar">
                <div className="reliability-mini-seg filled payment" style={{ width: `${rel.breakdown.payment / 40 * 18}px` }} />
                <div className="reliability-mini-seg filled consistency" style={{ width: `${rel.breakdown.orderConsistency / 30 * 14}px` }} />
                <div className="reliability-mini-seg filled volume" style={{ width: `${rel.breakdown.volume / 20 * 9}px` }} />
                <div className="reliability-mini-seg filled age" style={{ width: `${rel.breakdown.relationshipAge / 10 * 5}px` }} />
              </div>
            </>
          ) : (
            <>
              <div className="reliability-score-pill building">Building</div>
              <div className="buyer-card-reliability-label" style={{ marginTop: 3 }}>history</div>
            </>
          )}
        </div>
      </div>
      <div className="buyer-card-stats">
        <div><div className="buyer-card-stat-value">{fjd0(b.ytdRevenue)}</div><div className="buyer-card-stat-label">YTD sales</div></div>
        <div><div className="buyer-card-stat-value" style={{ color: b.receivable > 0 ? "var(--red)" : "var(--soil)" }}>{fjd0(b.receivable)}</div><div className="buyer-card-stat-label">owed</div></div>
        <div><div className="buyer-card-stat-value">{b.orderCount}</div><div className="buyer-card-stat-label">orders</div></div>
      </div>
    </div>
  );
}

function EmptyView({ title, note }) {
  return (
    <div className="card" style={{ padding: "30px 20px", textAlign: "center" }}>
      <div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, maxWidth: 440, margin: "6px auto 0", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

function BuyersInner() {
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("directory");
  const [detailId, setDetailId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [relFilter, setRelFilter] = useState("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const customersQ = useQuery({ queryKey: ["customers"], queryFn: getCustomers });
  const ordersQ = useQuery({ queryKey: ["orders", farmId], queryFn: () => getOrders(farmId), enabled: !!farmId });
  const customers = customersQ.data ?? [];
  const orders = ordersQ.data ?? [];

  const ordersByCust = useMemo(() => {
    const m = {};
    orders.forEach((o) => { (m[o.customer_id] = m[o.customer_id] || []).push(o); });
    return m;
  }, [orders]);

  const buyers = useMemo(() => customers.map((c) => {
    const co = ordersByCust[c.customer_id] || [];
    const live = co.filter((o) => o.order_status !== "CANCELLED");
    return {
      id: c.customer_id, name: c.customer_name, typeKey: (c.customer_type || "").toLowerCase().replace(/_/g, "-"),
      typeLabel: TYPE_LABEL[c.customer_type] || c.customer_type || "—",
      city: c.island || c.market_location || c.address || "", phone: c.phone, terms: Number(c.payment_terms_days) || 0,
      contact: c.contact_person, raw: c,
      ytdRevenue: live.reduce((s, o) => s + amt(o), 0),
      receivable: co.filter((o) => OWED.includes(o.order_status)).reduce((s, o) => s + amt(o), 0),
      orderCount: live.length, reliability: deriveReliability(co),
    };
  }), [customers, ordersByCust]);

  const totalReceivable = buyers.reduce((s, b) => s + b.receivable, 0);
  const ranked = buyers.filter((b) => b.ytdRevenue > 0).sort((a, b) => b.ytdRevenue - a.ytdRevenue);
  const topBuyer = ranked[0];
  const totalRev = ranked.reduce((s, b) => s + b.ytdRevenue, 0) || 1;
  const top3pct = Math.round(100 * ranked.slice(0, 3).reduce((s, b) => s + b.ytdRevenue, 0) / totalRev);
  const concCls = top3pct < 50 ? "safe" : top3pct <= 70 ? "watch" : "risk";

  const typesPresent = useMemo(() => {
    const seen = {}; buyers.forEach((b) => { seen[b.raw.customer_type] = (seen[b.raw.customer_type] || 0) + 1; });
    return Object.entries(seen).map(([k, n]) => ({ key: k, label: TYPE_LABEL[k] || k, n }));
  }, [buyers]);

  let filtered = buyers.slice();
  if (typeFilter !== "all") filtered = filtered.filter((b) => b.raw.customer_type === typeFilter);
  if (relFilter !== "all") filtered = filtered.filter((b) => b.reliability && reliabilityTier(b.reliability.score) === relFilter);
  if (q.trim()) { const qq = q.toLowerCase(); filtered = filtered.filter((b) => `${b.name} ${b.contact || ""} ${b.city}`.toLowerCase().includes(qq)); }
  filtered.sort((a, b) => b.ytdRevenue - a.ytdRevenue);

  async function advance(orderId, status) {
    try { const r = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/status?order_status=${status}`, { method: "PATCH", headers: authHeaders() }); if (!r.ok) throw new Error(); emitToast(`Order → ${status}`); qc.invalidateQueries({ queryKey: ["orders", farmId] }); }
    catch { emitToast("Could not update order"); }
  }
  const refetchCustomers = () => qc.invalidateQueries({ queryKey: ["customers"] });
  const refetchOrders = () => qc.invalidateQueries({ queryKey: ["orders", farmId] });

  const detailBuyer = detailId ? buyers.find((b) => b.id === detailId) : null;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          {detailBuyer ? (
            <BuyerDetail b={detailBuyer} orders={ordersByCust[detailBuyer.id] || []} onBack={() => setDetailId(null)} onNewOrder={() => setOrderOpen(true)} advance={advance} />
          ) : (
            <>
              <div className="page-header">
                <div><h1>Buyers</h1><div className="subtitle">Crops + animals · who buys from you, what they owe, who to chase</div></div>
                <div className="page-actions">
                  <FarmSelector />
                  <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={14} />Add buyer</button>
                </div>
              </div>

              <div className="cycle-view-tabs">
                {VIEW_TABS.map(([id, label, hint]) => (
                  <div key={id} className={`task-tab ${view === id ? "active" : ""}`} onClick={() => setView(id)}>
                    {label}<span className="task-tab-count" style={{ fontSize: 10 }}>{hint}</span>
                  </div>
                ))}
              </div>

              {view === "directory" && (
                <>
                  <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                    <CapitalTile label="Active buyers" value={buyers.length} sub={`of ${buyers.length} total`} />
                    <CapitalTile label="Receivables" value={fjd0(totalReceivable)} sub="owed to farm" valueColor={totalReceivable > 0 ? "var(--red)" : "var(--soil)"} onClick={() => setView("receivables")} />
                    <CapitalTile label="Top buyer YTD" value={topBuyer ? topBuyer.name.split(" ")[0] : "—"} sub={topBuyer ? fjd0(topBuyer.ytdRevenue) : "FJD 0"} onClick={() => topBuyer && setDetailId(topBuyer.id)} />
                    <CapitalTile label="Concentration risk" value={`${top3pct}%`} valueClass={`concentration-value ${concCls}`} sub="top 3 of revenue" onClick={() => setView("analytics")} />
                  </div>

                  <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Type:</span>
                    <button className={`filter-pill ${typeFilter === "all" ? "active" : ""}`} onClick={() => setTypeFilter("all")}>All<span className="filter-pill-count">{buyers.length}</span></button>
                    {typesPresent.map((t) => <button key={t.key} className={`filter-pill ${typeFilter === t.key ? "active" : ""}`} onClick={() => setTypeFilter(t.key)}>{t.label}<span className="filter-pill-count">{t.n}</span></button>)}
                  </div>
                  <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Reliability:</span>
                    {[["all", "All"], ["high", "High 80+"], ["medium", "Medium 60-79"], ["low", "Low <60"]].map(([id, label]) => (
                      <button key={id} className={`filter-pill ${relFilter === id ? "active" : ""}`} onClick={() => setRelFilter(id)}>{label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 14, position: "relative" }}>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyers by name, contact, city..."
                      style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                  </div>

                  {customersQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading buyers…</div>
                    : buyers.length === 0 ? <EmptyView title="No buyers yet" note="Add your first buyer to start tracking orders, receivables and reliability." />
                    : filtered.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No buyers match these filters.</div>
                    : <div className="buyer-directory-grid">{filtered.map((b) => <BuyerCard key={b.id} b={b} onOpen={() => setDetailId(b.id)} />)}</div>}
                </>
              )}

              {view === "orders" && (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}>
                    <button className="btn btn-primary" onClick={() => setOrderOpen(true)}><Plus size={14} />New order</button>
                  </div>
                  <OrderList orders={orders} loading={ordersQ.isLoading} advance={advance} />
                </>
              )}

              {view === "receivables" && <Receivables orders={orders} loading={ordersQ.isLoading} />}
              {view === "analytics" && <Analytics ranked={ranked} totalRev={totalRev} top3pct={top3pct} concCls={concCls} />}
              {view === "demand" && <EmptyView title="Demand signals" note="This view is ready and will populate from a demand-signal feed (buyer requests, recurring orders, market prices). No numbers shown until that data is real — by design, nothing here is fabricated." />}
              {view === "pipeline" && <EmptyView title="Pipeline" note="Leads and prospective buyers will appear here once a sales-pipeline endpoint is wired. Honest-empty until then." />}
            </>
          )}
        </div>
      </main>

      {addOpen && <AddBuyerModal onClose={() => setAddOpen(false)} onSaved={() => { refetchCustomers(); setAddOpen(false); }} />}
      {orderOpen && <NewOrderModal farmId={farmId} customers={customers} onClose={() => setOrderOpen(false)} onSaved={() => { refetchOrders(); setOrderOpen(false); }} />}
    </TfpShell>
  );
}

function StatusPill({ status, onChange }) {
  const color = { PENDING: "var(--amber)", CONFIRMED: "var(--green)", PICKING: "var(--green)", DISPATCHED: "var(--green)", DELIVERED: "var(--green-dk)", PAID: "var(--green-dk)", INVOICED: "var(--green-dk)", CANCELLED: "var(--red)" }[status] || "var(--muted)";
  return (
    <select value={status} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "3px 8px", border: "1px solid var(--line)", color, background: "#fff" }}>
      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function OrderList({ orders, loading, advance }) {
  if (loading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading orders…</div>;
  if (!orders.length) return <EmptyView title="No orders yet" note="Log an order from a buyer and it shows here with its status and value." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {orders.map((o) => (
        <div key={o.order_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--soil)" }}>{o.customer_name}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{String(o.order_date).slice(0, 10)}{amt(o) ? ` · ${fjd2(amt(o))}` : ""}</div>
          </div>
          <StatusPill status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
        </div>
      ))}
    </div>
  );
}

function Receivables({ orders, loading }) {
  if (loading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>;
  const owed = orders.filter((o) => OWED.includes(o.order_status));
  const total = owed.reduce((s, o) => s + amt(o), 0);
  if (!owed.length) return <EmptyView title="Nothing outstanding" note="All fulfilled orders are paid." />;
  const days = (o) => { const d = Date.parse(o.delivery_date || o.order_date); return Number.isFinite(d) ? Math.floor((Date.now() - d) / 864e5) : null; };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700, color: "var(--soil)" }}>Owed: {fjd2(total)} across {owed.length} order{owed.length === 1 ? "" : "s"}</div>
      {owed.map((o) => { const d = days(o); return (
        <div key={o.order_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{o.customer_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.order_status}{d != null ? ` · ${d}d outstanding` : ""}</div></div>
          <div style={{ fontWeight: 700, color: d != null && d > 30 ? "var(--red)" : "var(--soil)" }}>{fjd2(amt(o))}</div>
        </div>
      ); })}
    </div>
  );
}

function Analytics({ ranked, totalRev, top3pct, concCls }) {
  if (!ranked.length) return <EmptyView title="Buyer analytics" note="Top buyers, revenue share and concentration risk appear once you log orders." />;
  const max = ranked.reduce((m, r) => Math.max(m, r.ytdRevenue), 0) || 1;
  return (
    <>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 12 }}>
        <CapitalTile label="Total revenue (YTD)" value={fjd0(totalRev)} sub={`${ranked.length} buyer${ranked.length === 1 ? "" : "s"}`} />
        <CapitalTile label="Concentration risk" value={`${top3pct}%`} valueClass={`concentration-value ${concCls}`} sub="top 3 of revenue" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ranked.map((r) => (
          <div key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2, color: "var(--soil)" }}><span style={{ fontWeight: 600 }}>{r.name}</span><span>{fjd0(r.ytdRevenue)} · {r.orderCount} order{r.orderCount === 1 ? "" : "s"}</span></div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 8, borderRadius: 999, width: `${Math.round((r.ytdRevenue / max) * 100)}%`, background: "var(--green-dk)" }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function BuyerDetail({ b, orders, onBack, onNewOrder, advance }) {
  const live = orders.filter((o) => o.order_status !== "CANCELLED");
  const rel = b.reliability;
  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>← Back to buyers</button>
          <h1>{b.name}</h1>
          <div className="subtitle">{b.typeLabel}{b.city ? ` · ${b.city}` : ""}{b.terms > 0 ? ` · ${b.terms}d terms` : " · cash"}</div>
        </div>
        <div className="page-actions"><button className="btn btn-primary" onClick={onNewOrder}><Plus size={14} />New order</button></div>
      </div>

      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
        <CapitalTile label="YTD sales" value={fjd0(b.ytdRevenue)} sub={`${b.orderCount} orders`} />
        <CapitalTile label="Owed now" value={fjd0(b.receivable)} sub="receivable" valueColor={b.receivable > 0 ? "var(--red)" : "var(--soil)"} />
        <CapitalTile label="Reliability" value={rel ? rel.score : "Building"} valueClass={rel ? `reliability-score ${reliabilityTier(rel.score)}` : ""} sub={rel ? "from order history" : "needs ≥2 orders"} />
        <CapitalTile label="Contact" value={b.phone || "—"} sub={b.contact || "no contact"} />
      </div>

      {rel && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 8 }}>Reliability — how it's computed (from your real orders)</div>
          {[["Payment record", rel.breakdown.payment, 40], ["Order consistency", rel.breakdown.orderConsistency, 30], ["Volume", rel.breakdown.volume, 20], ["Relationship age", rel.breakdown.relationshipAge, 10]].map(([label, v, max]) => (
            <div className="reliability-subscore-row" key={label}>
              <span className="reliability-subscore-label">{label}</span>
              <span className="reliability-subscore-track"><span className="reliability-subscore-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
              <span className="reliability-subscore-value">{v}/{max}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 8 }}>Orders</div>
        {live.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 12.5 }}>No orders logged for this buyer yet.</div>
          : live.map((o) => (
            <div key={o.order_id} className="buyer-history-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
              <div><div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{fjd2(amt(o))}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{String(o.order_date).slice(0, 10)}</div></div>
              <StatusPill status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
            </div>
          ))}
      </div>

      <EmptyView title="Communication · disputes · demand" note="Per-buyer comms log, payment history, demand signals and disputes appear here once those records are wired (next slice). Nothing fabricated until then." />
    </>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function AddBuyerModal({ onClose, onSaved }) {
  const [f, setF] = useState({ customer_name: "", customer_type: "MARKET_VENDOR", contact_person: "", phone: "", island: "", payment_terms_days: "0", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (!f.customer_name.trim()) { emitToast("Buyer name is required"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/customers", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...f, payment_terms_days: Number(f.payment_terms_days) || 0 }) });
      if (!r.ok) throw new Error();
      emitToast("Buyer added"); onSaved?.();
    } catch { emitToast("Could not add buyer"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Add new buyer</h2><button onClick={onClose} className="overlay-close"><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label>Buyer name</label><input value={f.customer_name} onChange={set("customer_name")} placeholder="e.g. Nayans Supermarkets" /></div>
            <div><label>Type</label><select value={f.customer_type} onChange={set("customer_type")}>{TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>City / island</label><input value={f.island} onChange={set("island")} placeholder="e.g. Suva" /></div>
            <div><label>Contact name</label><input value={f.contact_person} onChange={set("contact_person")} /></div>
          </div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Phone</label><input value={f.phone} onChange={set("phone")} placeholder="9XX XXXX" /></div>
            <div><label>Payment terms</label><select value={f.payment_terms_days} onChange={set("payment_terms_days")}><option value="0">Cash</option><option value="7">Net 7d</option><option value="14">Net 14d</option><option value="30">Net 30d</option></select></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}><label>Internal notes</label><textarea rows={2} maxLength={500} value={f.notes} onChange={set("notes")} placeholder="Preferences, payment habits..." /></div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add buyer"}</button></div>
      </div>
    </div>
  );
}

function NewOrderModal({ farmId, customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState("");
  const [productionId, setProductionId] = useState("");
  const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [grade, setGrade] = useState("A");
  const [busy, setBusy] = useState(false);
  const prodQ = useQuery({ queryKey: ["productions"], queryFn: getProductions });
  const productions = prodQ.data ?? [];
  const total = (Number(qty || 0) * Number(price || 0)) || 0;
  async function submit() {
    if (!customerId || !productionId || !qty || !price) { emitToast("Buyer, crop, quantity and price are required"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/orders", { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, customer_id: customerId, order_date: todayISO(), line_items: [{ production_id: productionId, quantity_kg: Number(qty), unit_price_fjd: Number(price), grade }] }) });
      if (!r.ok) throw new Error();
      emitToast("Order created"); onSaved?.();
    } catch { emitToast("Could not create order"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Log new order</h2><button onClick={onClose} className="overlay-close"><X size={14} /></button></div>
        <div className="overlay-body">
          <Field label="Buyer"><select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Pick a buyer…</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}</select></Field>
          <Field label="Crop"><select value={productionId} onChange={(e) => setProductionId(e.target.value)}><option value="">Pick a crop…</option>{productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name || p.production_id}</option>)}</select></Field>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label>Qty (kg)</label><input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label>Price/kg</label><input type="number" min="0" step="0.10" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div><label>Grade</label><select value={grade} onChange={(e) => setGrade(e.target.value)}><option>A</option><option>B</option><option>C</option></select></div>
          </div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : `Create · ${fjd2(total)}`}</button></div>
      </div>
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

/**
 * Buyers.jsx — "Buyers & sales" (Market tab) — audit-approved redesign (2026-06-26).
 *
 * Buyer CRM under <TfpShell>, wired to real data:
 *   Directory   GET/POST/PATCH /customers · derived reliability from real orders
 *   Orders      GET/POST /orders · status PATCH /orders/{id}/status (forward-only)
 *   Payment     POST /orders/{id}/payment → cash_ledger INCOME + marks PAID (the ONLY PAID path)
 *   Demand/Pipeline/Disputes/Comms  GET/POST (buyers_crm.py — all wired)
 *   Logistics   POST /service-jobs (transport / cold storage)
 *
 * Redesign (audit B1–B32):
 *  · MONEY FOOTGUN FIXED (B1/B30): PAID only via Log payment; status select is forward-only;
 *    PAID/CANCELLED removed from the casual select; Cancel is a confirmed action.
 *  · reads via utils/api + cached-on-error (B2/B4); formatMoney (B5); Fiji time (B6)
 *  · to-chase banner (B28) + AR aging buckets + avg days outstanding (B29)
 *  · WhatsApp chase on overdue (B17); multi-line new order (B22); honest partial-pay note (B23)
 *  · shared <Modal> Esc/focus (B8); arrow-key tabs (B7); dispute-resolve modal not prompt (B13)
 *  · drop redundant h1 (B9); view-aware Ask AI (B10); responsive strips (B12); submit-locks
 * FILED (backend): /status refuse PAID (B1-server), partial-payment state (B23), sale→stock
 *  deduction (B24), provenance/traceability on sales (B27), invoice PDF (B16), credit limit (B26),
 *  animal sales via orders (B15), deliveries/pick-list (B31), DSO/trend (B32), pagination (B20).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MapPin, Truck, X, Phone, Pencil, Sparkles, AlertTriangle, MessageCircle, Trash2 } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { useFarmName } from "../../utils/farmName";
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } // Fiji day (B6)
function fjd0(v) { return formatMoney(Math.abs(Number(v ?? 0)), { decimals: 0 }); }
function fjd2(v) { return formatMoney(Math.abs(Number(v ?? 0)), { decimals: 2 }); }
function initials(name) { return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"; }
function waLink(number, text) { const n = String(number || "").replace(/[^0-9]/g, ""); if (!n) return null; const full = n.startsWith("679") ? n : `679${n}`; return `https://wa.me/${full}?text=${encodeURIComponent(text)}`; }
const STRIP = { gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" };

// Must match tenant.customers.customer_type CHECK (migration 124).
const TYPE_LABEL = {
  SUPERMARKET: "Supermarket", RESTAURANT: "Restaurant", WHOLESALE: "Wholesaler",
  MUNICIPAL: "Municipal market", COOP: "Co-op", ROADSIDE: "Roadside", HOTEL: "Hotel",
  EXPORT: "Export agent", DIRECT: "Direct retail", INDIVIDUAL: "Individual", RELATED_PARTY: "Related party",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
const ORDER_FLOW = ["PENDING", "CONFIRMED", "PICKING", "DISPATCHED", "DELIVERED", "INVOICED"]; // PAID via /payment only; CANCELLED via guarded action (B1/B30)
const OWED = ["DISPATCHED", "DELIVERED", "INVOICED"];
const VIEW_TABS = [
  ["directory", "Directory", "Relationships"], ["orders", "Active orders", "Open POs"],
  ["receivables", "Receivables", "What's owed"], ["demand", "Demand signals", "Feeds forecast"],
  ["pipeline", "Pipeline", "Leads"], ["analytics", "Analytics", "Risk & trends"],
];
const AI_PROMPTS = {
  directory: "How do I grow my sales and find more reliable buyers for my farm produce?",
  orders: "How should I manage farm produce orders and fulfilment efficiently?",
  receivables: "I have buyers who owe me money — how should I prioritise and chase payment politely?",
  demand: "How do I use buyer demand signals to plan what to plant?",
  pipeline: "How do I convert new buyer leads into regular customers?",
  analytics: "My sales are concentrated in a few buyers — how do I reduce that risk?",
};

async function getCustomers(farmId) { return (await getJSON(`/api/v1/customers${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`))?.data ?? []; }
async function getOrders(farmId) { return (await getJSON(`/api/v1/orders${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`))?.data ?? []; }
async function getProductions() { return (await getJSON("/api/v1/productions?is_active=true"))?.data?.productions ?? []; }
async function getCommunications(custId) { return (await getJSON(`/api/v1/customers/${encodeURIComponent(custId)}/communications`))?.data ?? []; }
async function getDemandSignals(farmId) { return (await getJSON(`/api/v1/demand-signals${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`))?.data ?? []; }
async function getLeads(farmId) { return (await getJSON(`/api/v1/leads${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`))?.data ?? []; }
async function getDisputes(custId) { return (await getJSON(`/api/v1/disputes?customer_id=${encodeURIComponent(custId)}`))?.data ?? []; }
async function postServiceJob(order, serviceType) {
  try {
    const title = serviceType === "COLD_STORAGE" ? `Cold storage for order ${order.order_id}` : `Deliver order ${order.order_id}`;
    await send("POST", "/api/v1/service-jobs", {
      service_type: serviceType, title, farm_id: order.farm_id, order_id: order.order_id,
      produce_desc: order.customer_name ? `Sale to ${order.customer_name}` : null,
      dropoff_location: order.delivery_address || order.customer_name || null,
    });
    emitToast(serviceType === "COLD_STORAGE" ? "Cold-storage job posted — nearby providers notified" : "Transport job posted — nearby providers notified");
  } catch (e) { emitToast(e?.userMessage || "Could not post the job"); }
}

function amt(o) { return Number(o.net_amount_fjd ?? o.total_amount_fjd ?? o.total_fjd ?? 0); }
function reliabilityTier(s) { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }
function daysOut(o) { const d = Date.parse(o.delivery_date || o.order_date); return Number.isFinite(d) ? Math.floor((Date.parse(todayISO()) - d) / 864e5) : null; }

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

// ── shared modal (Esc-close, role=dialog, focus-on-open) ───────────────
function Modal({ title, onClose, children, foot, maxWidth }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button onClick={onClose} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}
function ErrorCard({ msg, onRetry }) {
  return <div className="card" style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}><div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 10 }}><AlertTriangle size={16} style={{ color: "var(--amber)" }} /><span style={{ fontWeight: 600, color: "var(--soil)" }}>{msg}</span></div><button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>;
}
function DegradedBanner() {
  return <div className="calendar-banner" style={{ background: "#FBF4E6", borderColor: "var(--amber)", color: "var(--soil)" }}><AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Couldn't refresh — showing the last saved data.</div>;
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
    <div className={`buyer-card ${b.ferry ? "ferry" : ""}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="buyer-card-head">
        <div className={`buyer-avatar ${b.typeKey}`}>{initials(b.name)}</div>
        <div style={{ flex: 1 }}>
          <div className="buyer-card-name">{b.name}</div>
          <div style={{ margin: "3px 0" }}>
            <span className={`buyer-type-pill ${b.typeKey}`}>{b.typeLabel}</span>{" "}
            <span className="buyer-status-pill active">active</span>
          </div>
          {(b.city || b.distanceKm != null || b.ferry) && (
            <div className="buyer-card-loc">
              <MapPin size={11} />{b.city || "—"}{b.distanceKm != null ? ` · ${b.distanceKm} km away` : ""}
              {b.ferry && <span className="ferry-chip"><Truck size={9} />ferry</span>}
            </div>
          )}
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
  const navigate = useNavigate();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("directory");
  const [detailId, setDetailId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [relFilter, setRelFilter] = useState("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editBuyer, setEditBuyer] = useState(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [payOrder, setPayOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [commFor, setCommFor] = useState(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const customersQ = useQuery({ queryKey: ["customers", farmId], queryFn: () => getCustomers(farmId) });
  const ordersQ = useQuery({ queryKey: ["orders", farmId], queryFn: () => getOrders(farmId), enabled: !!farmId });
  const demandQ = useQuery({ queryKey: ["demand", farmId], queryFn: () => getDemandSignals(farmId), enabled: view === "demand" });
  const leadsQ = useQuery({ queryKey: ["leads", farmId], queryFn: () => getLeads(farmId), enabled: view === "pipeline" });
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
      city: c.island || c.address || "", phone: c.phone, whatsapp: c.whatsapp_number, terms: Number(c.payment_terms_days) || 0,
      contact: c.contact_name, ferry: !!c.ferry_dependent, distanceKm: c.distance_km != null ? Number(c.distance_km) : null, raw: c,
      ytdRevenue: live.reduce((s, o) => s + amt(o), 0),
      receivable: co.filter((o) => OWED.includes(o.order_status)).reduce((s, o) => s + amt(o), 0),
      orderCount: live.length, reliability: deriveReliability(co),
    };
  }), [customers, ordersByCust]);

  const totalReceivable = buyers.reduce((s, b) => s + b.receivable, 0);
  const owedOrders = orders.filter((o) => OWED.includes(o.order_status));
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
    try { await send("PATCH", `/api/v1/orders/${encodeURIComponent(orderId)}/status?order_status=${status}`); emitToast(`Order → ${status}`); qc.invalidateQueries({ queryKey: ["orders", farmId] }); }
    catch (e) { emitToast(e?.userMessage || "Could not update order"); }
  }
  const refetchCustomers = () => qc.invalidateQueries({ queryKey: ["customers"] });
  const refetchOrders = () => qc.invalidateQueries({ queryKey: ["orders", farmId] });
  const askAi = () => navigate("/tis?q=" + encodeURIComponent(AI_PROMPTS[view] || AI_PROMPTS.directory));
  const onTabKey = (e, id) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = VIEW_TABS.findIndex((v) => v[0] === id);
    const ni = e.key === "ArrowRight" ? (i + 1) % VIEW_TABS.length : (i - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    setView(VIEW_TABS[ni][0]);
  };

  const detailBuyer = detailId ? buyers.find((b) => b.id === detailId) : null;
  const dataDegraded = (customersQ.isError || ordersQ.isError) && buyers.length > 0;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          {detailBuyer ? (
            <BuyerDetail b={detailBuyer} orders={ordersByCust[detailBuyer.id] || []} onBack={() => setDetailId(null)}
              onNewOrder={() => setOrderOpen(true)} advance={advance} onCancel={(o) => setCancelOrder(o)}
              onLogPayment={(o) => setPayOrder(o)} onLogComm={() => setCommFor(detailBuyer)} onEdit={() => setEditBuyer(detailBuyer.raw)} />
          ) : (
            <>
              <div className="page-header">
                <div className="subtitle">Crops + animals · who buys from you, what they owe, who to chase</div>
                <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                  <FarmSelector />
                  <button className="btn btn-secondary" onClick={askAi}><Sparkles size={14} />Ask AI</button>
                  <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={14} />Add buyer</button>
                </div>
              </div>

              {dataDegraded && <DegradedBanner />}
              {totalReceivable > 0 && view !== "receivables" && (
                <button onClick={() => setView("receivables")} className="calendar-banner" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "#FBF4E6", borderColor: "var(--amber)", color: "var(--soil)", cursor: "pointer" }}>
                  <AlertTriangle size={14} style={{ color: "var(--amber)" }} /><strong>{fjd0(totalReceivable)}</strong> owed across {owedOrders.length} order{owedOrders.length === 1 ? "" : "s"} — chase now →
                </button>
              )}

              <div className="cycle-view-tabs" role="tablist" aria-label="Buyer views">
                {VIEW_TABS.map(([id, label, hint]) => (
                  <button key={id} role="tab" aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={`task-tab ${view === id ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setView(id)} onKeyDown={(e) => onTabKey(e, id)}>
                    {label}<span className="task-tab-count" style={{ fontSize: 10 }}>{hint}</span>
                  </button>
                ))}
              </div>

              {view === "directory" && (
                <>
                  <div className="capital-strip" style={STRIP}>
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
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyers by name, contact, city..." aria-label="Search buyers"
                      style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                  </div>

                  {customersQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading buyers…</div>
                    : customersQ.isError && buyers.length === 0 ? <ErrorCard msg="Couldn't load your buyers." onRetry={() => customersQ.refetch()} />
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
                  <OrderList orders={orders} loading={ordersQ.isLoading} isError={ordersQ.isError} onRetry={() => ordersQ.refetch()} advance={advance} onPay={(o) => setPayOrder(o)} onCancel={(o) => setCancelOrder(o)} />
                </>
              )}

              {view === "receivables" && <Receivables orders={orders} loading={ordersQ.isLoading} isError={ordersQ.isError} onRetry={() => ordersQ.refetch()} buyersById={Object.fromEntries(buyers.map((b) => [b.id, b]))} onPay={(o) => setPayOrder(o)} />}
              {view === "analytics" && <Analytics ranked={ranked} totalRev={totalRev} top3pct={top3pct} concCls={concCls} />}
              {view === "demand" && <DemandView signals={demandQ.data ?? []} loading={demandQ.isLoading} isError={demandQ.isError} onRetry={() => demandQ.refetch()} buyersById={Object.fromEntries(buyers.map((b) => [b.id, b]))} onAdd={() => setSignalOpen(true)}
                onToggle={async (id, status) => { try { await send("PATCH", `/api/v1/demand-signals/${encodeURIComponent(id)}/status?status=${status}`); qc.invalidateQueries({ queryKey: ["demand", farmId] }); } catch (e) { emitToast(e?.userMessage || "Could not update"); } }} />}
              {view === "pipeline" && <PipelineView leads={leadsQ.data ?? []} loading={leadsQ.isLoading} isError={leadsQ.isError} onRetry={() => leadsQ.refetch()} onAdd={() => setLeadOpen(true)}
                onStage={async (id, stage) => { try { await send("PATCH", `/api/v1/leads/${encodeURIComponent(id)}/stage?stage=${stage}`); qc.invalidateQueries({ queryKey: ["leads", farmId] }); } catch (e) { emitToast(e?.userMessage || "Could not move lead"); } }} />}
            </>
          )}
        </div>
      </main>

      {addOpen && <AddBuyerModal onClose={() => setAddOpen(false)} onSaved={() => { refetchCustomers(); setAddOpen(false); }} />}
      {editBuyer && <AddBuyerModal edit={editBuyer} onClose={() => setEditBuyer(null)} onSaved={() => { refetchCustomers(); setDetailId(null); setEditBuyer(null); }} />}
      {orderOpen && <NewOrderModal farmId={farmId} customers={customers} onClose={() => setOrderOpen(false)} onSaved={() => { refetchOrders(); setOrderOpen(false); }} />}
      {payOrder && <LogPaymentModal order={payOrder} onClose={() => setPayOrder(null)} onSaved={() => { refetchOrders(); setPayOrder(null); }} />}
      {cancelOrder && <ConfirmModal title="Cancel this order?" body={`Cancel the order from ${cancelOrder.customer_name} (${fjd2(amt(cancelOrder))})? This can't be undone and removes it from your sales.`} confirmLabel="Cancel order" onClose={() => setCancelOrder(null)} onConfirm={() => { advance(cancelOrder.order_id, "CANCELLED"); setCancelOrder(null); }} />}
      {commFor && <LogCommunicationModal buyer={commFor} onClose={() => setCommFor(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["communications", commFor.id] }); setCommFor(null); }} />}
      {signalOpen && <AddDemandSignalModal farmId={farmId} customers={customers} onClose={() => setSignalOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["demand", farmId] }); setSignalOpen(false); }} />}
      {leadOpen && <AddLeadModal farmId={farmId} onClose={() => setLeadOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["leads", farmId] }); setLeadOpen(false); }} />}
    </TfpShell>
  );
}

// Forward-only status control — no PAID (use Log payment) / no CANCELLED (use Cancel). (B1/B30)
function StatusControl({ status, onChange }) {
  if (status === "PAID") return <span className="buyer-status-pill active" style={{ background: "rgba(106,168,79,0.18)", color: "var(--green-dk)" }}>PAID</span>;
  if (status === "CANCELLED") return <span className="buyer-status-pill" style={{ background: "rgba(163,45,45,0.12)", color: "var(--red)" }}>CANCELLED</span>;
  const color = { PENDING: "var(--amber)", CONFIRMED: "var(--green)", PICKING: "var(--green)", DISPATCHED: "var(--green)", DELIVERED: "var(--green-dk)", INVOICED: "var(--green-dk)" }[status] || "var(--muted)";
  return (
    <select value={status} onChange={(e) => onChange(e.target.value)} aria-label="Order status" style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "3px 8px", border: "1px solid var(--line)", color, background: "var(--paper)" }}>
      {ORDER_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function OrderRow({ o, advance, onPay, onCancel }) {
  const owed = OWED.includes(o.order_status);
  const terminal = o.order_status === "PAID" || o.order_status === "CANCELLED";
  return (
    <div className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
      <div>
        <div style={{ fontWeight: 600, color: "var(--soil)" }}>{o.customer_name}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{String(o.order_date).slice(0, 10)}{amt(o) ? ` · ${fjd2(amt(o))}` : ""}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {owed && <button className="btn btn-primary btn-sm" onClick={() => onPay(o)}>Log payment</button>}
        <StatusControl status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
        {!terminal && <button className="btn btn-secondary btn-sm" title="Cancel order" aria-label="Cancel order" onClick={() => onCancel(o)}><Trash2 size={12} /></button>}
      </div>
    </div>
  );
}

function OrderList({ orders, loading, isError, onRetry, advance, onPay, onCancel }) {
  if (loading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading orders…</div>;
  if (isError && !orders.length) return <ErrorCard msg="Couldn't load orders." onRetry={onRetry} />;
  if (!orders.length) return <EmptyView title="No orders yet" note="Log an order from a buyer and it shows here with its status and value." />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{orders.map((o) => <OrderRow key={o.order_id} o={o} advance={advance} onPay={onPay} onCancel={onCancel} />)}</div>;
}

function Receivables({ orders, loading, isError, onRetry, buyersById, onPay }) {
  if (loading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>;
  if (isError && !orders.length) return <ErrorCard msg="Couldn't load receivables." onRetry={onRetry} />;
  const owed = orders.filter((o) => OWED.includes(o.order_status));
  if (!owed.length) return <EmptyView title="Nothing outstanding" note="All fulfilled orders are paid." />;
  const total = owed.reduce((s, o) => s + amt(o), 0);
  // AR aging buckets (B29)
  const buckets = { "0-30": 0, "31-60": 0, "60+": 0 };
  let dsum = 0, dn = 0;
  owed.forEach((o) => { const d = daysOut(o) ?? 0; dsum += d; dn += 1; if (d <= 30) buckets["0-30"] += amt(o); else if (d <= 60) buckets["31-60"] += amt(o); else buckets["60+"] += amt(o); });
  const avgDays = dn ? Math.round(dsum / dn) : 0;
  const sorted = owed.slice().sort((a, b) => (daysOut(b) ?? 0) - (daysOut(a) ?? 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="capital-strip" style={STRIP}>
        <CapitalTile label="0–30 days" value={fjd0(buckets["0-30"])} sub="current" />
        <CapitalTile label="31–60 days" value={fjd0(buckets["31-60"])} sub="watch" valueColor={buckets["31-60"] > 0 ? "var(--amber)" : "var(--soil)"} />
        <CapitalTile label="60+ days" value={fjd0(buckets["60+"])} sub="overdue" valueColor={buckets["60+"] > 0 ? "var(--red)" : "var(--soil)"} />
        <CapitalTile label="Total owed" value={fjd0(total)} sub={`avg ${avgDays}d · ${owed.length} order${owed.length === 1 ? "" : "s"}`} />
      </div>
      {sorted.map((o) => {
        const d = daysOut(o);
        const buyer = buyersById[o.customer_id];
        const wa = buyer && waLink(buyer.whatsapp || buyer.phone, `Hi${buyer.contact ? ` ${buyer.contact}` : ""}, a friendly reminder about the ${fjd2(amt(o))} for order ${o.order_id}. Thank you!`);
        return (
          <div key={o.order_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
            <div><div style={{ fontWeight: 600, color: "var(--soil)" }}>{o.customer_name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.order_status}{d != null ? ` · ${d}d outstanding` : ""}</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={{ fontWeight: 700, color: d != null && d > 30 ? "var(--red)" : "var(--soil)" }}>{fjd2(amt(o))}</div>
              {wa && <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><MessageCircle size={12} />Chase</a>}
              <button className="btn btn-primary btn-sm" onClick={() => onPay(o)}>Log payment</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Analytics({ ranked, totalRev, top3pct, concCls }) {
  if (!ranked.length) return <EmptyView title="Buyer analytics" note="Top buyers, revenue share and concentration risk appear once you log orders." />;
  const max = ranked.reduce((m, r) => Math.max(m, r.ytdRevenue), 0) || 1;
  return (
    <>
      <div className="capital-strip" style={{ ...STRIP, marginBottom: 12 }}>
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

const CHANNEL_LABEL = { whatsapp: "WhatsApp", call: "Call", visit: "Visit", email: "Email", sms: "SMS" };

function BuyerDetail({ b, orders, onBack, onNewOrder, advance, onCancel, onLogPayment, onLogComm, onEdit }) {
  const { farmId } = useCurrentFarm();
  const qc = useQueryClient();
  const live = orders.filter((o) => o.order_status !== "CANCELLED");
  const rel = b.reliability;
  const commsQ = useQuery({ queryKey: ["communications", b.id], queryFn: () => getCommunications(b.id) });
  const comms = commsQ.data ?? [];
  const disputesQ = useQuery({ queryKey: ["disputes", b.id], queryFn: () => getDisputes(b.id) });
  const disputes = disputesQ.data ?? [];
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState(null);
  const wa = waLink(b.whatsapp || b.phone, `Hi${b.contact ? ` ${b.contact}` : ""}, `);
  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>← Back to buyers</button>
          <h1>{b.name}</h1>
          <div className="subtitle">{b.typeLabel}{b.city ? ` · ${b.city}` : ""}{b.terms > 0 ? ` · ${b.terms}d terms` : " · cash"}</div>
        </div>
        <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onEdit}><Pencil size={14} />Edit</button>
          {wa && <a className="btn btn-secondary" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><MessageCircle size={14} />WhatsApp</a>}
          <button className="btn btn-secondary" onClick={onLogComm}><Phone size={14} />Log communication</button>
          <button className="btn btn-primary" onClick={onNewOrder}><Plus size={14} />New order</button>
        </div>
      </div>

      <div className="capital-strip" style={{ ...STRIP, marginBottom: 14 }}>
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
          : live.map((o) => {
            const owed = OWED.includes(o.order_status);
            const terminal = o.order_status === "PAID" || o.order_status === "CANCELLED";
            return (
              <div key={o.order_id} className="buyer-history-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
                <div><div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{fjd2(amt(o))}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{String(o.order_date).slice(0, 10)}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {owed && <button className="btn btn-primary btn-sm" onClick={() => onLogPayment(o)}>Log payment</button>}
                  <button className="btn btn-secondary btn-sm" title="Post a delivery job for nearby providers" onClick={() => postServiceJob(o, "TRANSPORT")}>Find transport</button>
                  <button className="btn btn-secondary btn-sm" title="Post a cold-storage job for nearby providers" onClick={() => postServiceJob(o, "COLD_STORAGE")}>Cold storage</button>
                  <StatusControl status={o.order_status} onChange={(s) => advance(o.order_id, s)} />
                  {!terminal && <button className="btn btn-secondary btn-sm" title="Cancel order" aria-label="Cancel order" onClick={() => onCancel(o)}><Trash2 size={12} /></button>}
                </div>
              </div>
            );
          })}
      </div>

      <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)" }}>Communication log</div>
          <button className="btn btn-secondary btn-sm" onClick={onLogComm}><Plus size={13} />Log</button>
        </div>
        {commsQ.isLoading ? <div style={{ color: "var(--muted)", fontSize: 12.5 }}>Loading…</div>
          : commsQ.isError ? <div style={{ color: "var(--amber)", fontSize: 12.5 }}>Couldn't load communications.</div>
          : comms.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 12.5 }}>No communications logged yet. Record a call, visit or message and it's hash-chained to this buyer.</div>
          : comms.map((c) => (
            <div key={c.communication_id} className="buyer-history-row" style={{ padding: "8px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{c.topic || CHANNEL_LABEL[c.channel] || c.channel}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{String(c.comm_date).slice(0, 10)}{c.comm_time ? ` · ${c.comm_time}` : ""}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{CHANNEL_LABEL[c.channel] || c.channel} · {c.direction}{c.notes ? ` · ${c.notes}` : ""}</div>
            </div>
          ))}
      </div>

      <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)" }}>Disputes</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setDisputeOpen(true)}><Plus size={13} />Log dispute</button>
        </div>
        {disputesQ.isLoading ? <div style={{ color: "var(--muted)", fontSize: 12.5 }}>Loading…</div>
          : disputesQ.isError ? <div style={{ color: "var(--amber)", fontSize: 12.5 }}>Couldn't load disputes.</div>
          : disputes.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 12.5 }}>No disputes — a clean record with this buyer.</div>
          : disputes.map((d) => (
            <div key={d.dispute_id} className="dispute-card">
              <div className="dispute-card-head">
                <span style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{(d.reason || "dispute").replace(/-/g, " ")}{d.quantity_kg ? ` · ${d.quantity_kg}kg` : ""}</span>
                <span className="dispute-reason-pill" style={{ background: d.status === "resolved" ? "rgba(106,168,79,0.18)" : "rgba(163,45,45,0.16)", color: d.status === "resolved" ? "var(--green-dk)" : "var(--red)" }}>{d.status}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{String(d.dispute_date).slice(0, 10)}{d.financial_impact_fjd ? ` · impact ${fjd0(d.financial_impact_fjd)}` : ""}{d.description ? ` · ${d.description}` : ""}{d.resolution ? ` · resolved: ${d.resolution}` : ""}</div>
              {d.status !== "resolved" && <div style={{ marginTop: 6 }}><button className="btn btn-secondary btn-sm" onClick={() => setResolveFor(d)}>Mark resolved</button></div>}
            </div>
          ))}
      </div>

      <EmptyView title="Demand signals" note="Per-buyer recurring-demand signals live on the Demand tab. Add one there to feed the forecast." />
      {disputeOpen && <LogDisputeModal buyer={b} farmId={farmId} orders={live} onClose={() => setDisputeOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["disputes", b.id] }); setDisputeOpen(false); }} />}
      {resolveFor && <ResolveDisputeModal dispute={resolveFor} onClose={() => setResolveFor(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["disputes", b.id] }); setResolveFor(null); }} />}
    </>
  );
}

function DemandView({ signals, loading, isError, onRetry, buyersById, onAdd, onToggle }) {
  const active = signals.filter((s) => s.status === "active");
  const byConf = (c) => active.filter((s) => s.confidence === c).length;
  return (
    <>
      <div className="calendar-banner">Demand signals capture what each buyer recurrently wants — they feed the production forecast. Improve confidence by confirming buyer terms in writing.</div>
      <div style={{ background: "rgba(106,168,79,0.06)", borderLeft: "3px solid var(--green)", borderRadius: 7, padding: "12px 14px", margin: "14px 0", fontSize: 12.5, color: "var(--soil)" }}>
        <strong>{byConf("high")} signals at high confidence</strong> · {byConf("medium")} medium · {byConf("low")} low.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button className="btn btn-primary" onClick={onAdd}><Plus size={14} />Add signal</button></div>
      {loading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
        : isError && signals.length === 0 ? <ErrorCard msg="Couldn't load demand signals." onRetry={onRetry} />
        : signals.length === 0 ? <EmptyView title="No demand signals yet" note="Log what a buyer recurrently wants (crop, grade, quantity, frequency) and it appears here to feed your forecast." />
        : <div className="demand-grid">{signals.map((d) => {
          const buyer = buyersById[d.customer_id];
          return (
            <div className={`demand-card ${d.status === "paused" ? "paused" : ""}`} key={d.signal_id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{buyer ? buyer.name : d.customer_id}</div>
                  <div className="demand-card-crop">{d.crop_type || "—"}{d.grade ? ` · ${d.grade}-grade` : ""}</div>
                </div>
                <span className={`confidence-pill ${d.confidence}`}>{d.confidence}</span>
              </div>
              <div className="demand-card-qty">{d.quantity_kg ? `${d.quantity_kg}kg` : "—"}{d.avg_price_fjd ? <span style={{ fontSize: 12, color: "var(--muted)" }}> @ {fjd2(d.avg_price_fjd)}/kg</span> : null}</div>
              <div style={{ margin: "6px 0" }}>{d.frequency && <span className="frequency-pill">{d.frequency}</span>}{d.preferred_day ? <span style={{ fontSize: 11, color: "var(--muted)" }}> {d.preferred_day}</span> : null}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => onToggle(d.signal_id, d.status === "active" ? "paused" : "active")}>{d.status === "active" ? "Pause" : "Resume"}</button>
            </div>
          );
        })}</div>}
    </>
  );
}

const STAGES = [["lead", "Lead"], ["qualified", "Qualified"], ["negotiating", "Negotiating"], ["won", "Won"]];
const NEXT_STAGE = { lead: "qualified", qualified: "negotiating", negotiating: "won", won: "won" };

function PipelineView({ leads, loading, isError, onRetry, onAdd, onStage }) {
  const active = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const totalValue = active.reduce((s, l) => s + Number(l.potential_monthly_fjd || 0), 0);
  const won = leads.filter((l) => l.stage === "won");
  const wonValue = won.reduce((s, l) => s + Number(l.potential_monthly_fjd || 0), 0);
  return (
    <>
      <div className="capital-strip" style={{ ...STRIP, marginTop: 14 }}>
        <CapitalTile label="Pipeline value" value={fjd0(totalValue)} sub="monthly potential" />
        <CapitalTile label="Won" value={fjd0(wonValue)} sub={`${won.length} deal${won.length === 1 ? "" : "s"}`} valueColor="var(--green-dk)" />
        <CapitalTile label="Active leads" value={active.length} sub="in progress" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}><button className="btn btn-primary" onClick={onAdd}><Plus size={14} />Add lead</button></div>
      {loading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
        : isError && leads.length === 0 ? <ErrorCard msg="Couldn't load leads." onRetry={onRetry} />
        : leads.length === 0 ? <EmptyView title="No leads yet" note="Add a prospective buyer and move them through Lead → Qualified → Negotiating → Won." />
        : <div className="pipeline-kanban">{STAGES.map(([key, label]) => {
          const col = leads.filter((l) => l.stage === key);
          return (
            <div className="pipeline-column" key={key}>
              <div className="pipeline-column-head"><span>{label}</span><span>{col.length}</span></div>
              {col.length === 0 ? <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: 14 }}>No leads</div>
                : col.map((l) => (
                  <div className="pipeline-card" key={l.lead_id} onClick={() => l.stage !== "won" && onStage(l.lead_id, NEXT_STAGE[l.stage])} title="Tap to advance stage">
                    <div className="pipeline-card-name">{l.prospect_name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{[l.city, l.prospect_type].filter(Boolean).join(" · ")}</div>
                    {l.potential_monthly_fjd != null && <div className="pipeline-card-value">{fjd0(l.potential_monthly_fjd)}/mo</div>}
                    {l.next_action && <div className="pipeline-card-action">→ {l.next_action}{l.next_action_date ? <><br /><span style={{ color: "var(--muted)" }}>{String(l.next_action_date).slice(0, 10)}</span></> : null}</div>}
                  </div>
                ))}
            </div>
          );
        })}</div>}
    </>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function ConfirmModal({ title, body, confirmLabel, onClose, onConfirm }) {
  return (
    <Modal title={title} onClose={onClose} maxWidth={440} foot={<><button className="btn btn-secondary" onClick={onClose}>Keep order</button><button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={onConfirm}>{confirmLabel}</button></>}>
      <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.5 }}>{body}</div>
    </Modal>
  );
}

function AddBuyerModal({ onClose, onSaved, edit }) {
  const { farmId } = useCurrentFarm();
  const farmName = useFarmName(farmId);
  const c = edit || {};
  const [f, setF] = useState({
    customer_name: c.customer_name || "", customer_type: c.customer_type || "SUPERMARKET", island: c.island || "", distance_km: c.distance_km ?? "",
    gps_lat: c.gps_lat ?? "", gps_lng: c.gps_lng ?? "",
    contact_name: c.contact_name || "", contact_role: c.contact_role || "", phone: c.phone || "", whatsapp_number: c.whatsapp_number || "",
    payment_terms_days: String(c.payment_terms_days ?? "0"), preferred_channel: c.preferred_channel || "whatsapp", ferry_dependent: !!c.ferry_dependent, notes: c.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const captureLocation = () => {
    if (!navigator.geolocation) { emitToast("Location isn't available on this device — type the coordinates instead"); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF((s) => ({ ...s, gps_lat: pos.coords.latitude.toFixed(6), gps_lng: pos.coords.longitude.toFixed(6) })); setGeoBusy(false); emitToast("Location pinned"); },
      () => { setGeoBusy(false); emitToast("Couldn't read location — allow access or type the coordinates"); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  async function submit() {
    if (lock.current) return;
    if (!f.customer_name.trim()) { emitToast("Buyer name is required"); return; }
    lock.current = true; setBusy(true);
    try {
      const body = {
        customer_name: f.customer_name.trim(), customer_type: f.customer_type,
        island: f.island.trim() || null, distance_km: f.distance_km ? Number(f.distance_km) : null,
        gps_lat: f.gps_lat !== "" && f.gps_lat != null ? Number(f.gps_lat) : null,
        gps_lng: f.gps_lng !== "" && f.gps_lng != null ? Number(f.gps_lng) : null,
        contact_name: f.contact_name.trim() || null, contact_role: f.contact_role.trim() || null,
        phone: f.phone.trim() || null, whatsapp_number: f.whatsapp_number.trim() || null,
        preferred_channel: f.preferred_channel, ferry_dependent: !!f.ferry_dependent,
        payment_terms_days: Number(f.payment_terms_days) || 0, notes: f.notes.trim() || null,
      };
      if (edit) await send("PATCH", `/api/v1/customers/${encodeURIComponent(edit.customer_id)}`, body);
      else await send("POST", "/api/v1/customers", body);
      emitToast(edit ? "Buyer updated" : "Buyer added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || (edit ? "Could not save buyer" : "Could not add buyer")); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={edit ? "Edit buyer" : "Add new buyer"} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : edit ? "Save" : "Add buyer"}</button></>}>
      <div className="form-event-anchors">
        <div className="anchors-block-head">Anchors · Farm + Operator</div>
        <div className="anchor-row"><span className="anchor-row-label">Farm</span><span className="anchor-row-value">{farmName || "—"}</span></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Buyer name</label><input value={f.customer_name} onChange={set("customer_name")} placeholder="e.g. Nayans Supermarkets" /></div>
        <div><label>Type</label><select value={f.customer_type} onChange={set("customer_type")}>{TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>City</label><input value={f.island} onChange={set("island")} placeholder="e.g. Suva" /></div>
        <div>
          <label>Buyer location (real distance)</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" className="btn btn-secondary" style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }} onClick={captureLocation} disabled={geoBusy}>
              <MapPin size={12} /> {geoBusy ? "Locating…" : "Pin location"}
            </button>
            <span style={{ fontSize: 11, color: f.gps_lat ? "var(--green-dk)" : "var(--muted)" }}>{f.gps_lat ? "Pinned" : "Not set"}</span>
          </div>
        </div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
        <div><label>Latitude</label><input type="number" step="any" value={f.gps_lat} onChange={set("gps_lat")} placeholder="-18.1416" /></div>
        <div><label>Longitude</label><input type="number" step="any" value={f.gps_lng} onChange={set("gps_lng")} placeholder="178.4419" /></div>
        <div><label>Approx km (no pin)</label><input type="number" min="0" value={f.distance_km} onChange={set("distance_km")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Contact name</label><input value={f.contact_name} onChange={set("contact_name")} /></div>
        <div><label>Role</label><input value={f.contact_role} onChange={set("contact_role")} placeholder="e.g. Buyer, Manager" /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Phone</label><input value={f.phone} onChange={set("phone")} placeholder="9XX XXXX" /></div>
        <div><label>WhatsApp</label><input value={f.whatsapp_number} onChange={set("whatsapp_number")} placeholder="9XX XXXX" /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Payment terms</label><select value={f.payment_terms_days} onChange={set("payment_terms_days")}><option value="0">Cash</option><option value="7">Net 7d</option><option value="14">Net 14d</option><option value="30">Net 30d</option></select></div>
        <div><label>Preferred channel</label><select value={f.preferred_channel} onChange={set("preferred_channel")}><option value="whatsapp">whatsapp</option><option value="call">call</option><option value="visit">visit</option><option value="email">email</option></select></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={f.ferry_dependent} onChange={(e) => setF((s) => ({ ...s, ferry_dependent: e.target.checked }))} />Ferry-dependent buyer (island delivery)
        </label>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Internal notes</label><textarea rows={2} maxLength={500} value={f.notes} onChange={set("notes")} placeholder="Preferences, payment habits..." /></div>
    </Modal>
  );
}

function NewOrderModal({ farmId, customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState("");
  const [marketplace, setMarketplace] = useState(false);
  const [lines, setLines] = useState([{ production_id: "", qty: "", price: "", grade: "A" }]); // multi-line (B22)
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const prodQ = useQuery({ queryKey: ["productions"], queryFn: getProductions });
  const productions = prodQ.data ?? [];
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, { production_id: "", qty: "", price: "", grade: "A" }]);
  const removeLine = (i) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));
  const total = lines.reduce((s, l) => s + (Number(l.qty || 0) * Number(l.price || 0)), 0);
  async function submit() {
    if (lock.current) return;
    const valid = lines.filter((l) => l.production_id && Number(l.qty) > 0 && Number(l.price) > 0);
    if (!customerId || valid.length === 0) { emitToast("Buyer and at least one crop line (qty + price) are required"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/orders", { farm_id: farmId, customer_id: customerId, order_date: todayISO(), is_marketplace_sale: marketplace,
        line_items: valid.map((l) => ({ production_id: l.production_id, quantity_kg: Number(l.qty), unit_price_fjd: Number(l.price), grade: l.grade })) });
      emitToast("Order created"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not create order"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Log new order" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : `Create · ${fjd2(total)}`}</button></>}>
      <Field label="Buyer"><select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Pick a buyer…</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}</select></Field>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "12px 0 6px" }}>Crops in this order</div>
      {lines.map((l, i) => (
        <div key={i} className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.8fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
          <div><label>Crop</label><select value={l.production_id} onChange={(e) => setLine(i, "production_id", e.target.value)}><option value="">Pick…</option>{productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.production_name || "Crop"}</option>)}</select></div>
          <div><label>Qty kg</label><input type="number" min="0" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} /></div>
          <div><label>Price/kg</label><input type="number" min="0" step="0.10" value={l.price} onChange={(e) => setLine(i, "price", e.target.value)} /></div>
          <div><label>Grade</label><select value={l.grade} onChange={(e) => setLine(i, "grade", e.target.value)}><option>A</option><option>B</option><option>C</option></select></div>
          <button className="btn btn-secondary btn-sm" title="Remove line" aria-label="Remove line" onClick={() => removeLine(i)} disabled={lines.length === 1} style={{ marginBottom: 2 }}><X size={12} /></button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={12} />Add another crop</button>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: "var(--soil)" }}>
        <input type="checkbox" checked={marketplace} onChange={(e) => setMarketplace(e.target.checked)} />
        This sale came through the Teivaka marketplace
      </label>
    </Modal>
  );
}

function LogPaymentModal({ order, onClose, onSaved }) {
  const owed = amt(order);
  const [amount, setAmount] = useState(String(owed || ""));
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const partial = Number(amount) > 0 && Number(amount) < owed;
  async function submit() {
    if (lock.current) return;
    if (!Number(amount)) { emitToast("Enter the amount received"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", `/api/v1/orders/${encodeURIComponent(order.order_id)}/payment`, { amount_fjd: Number(amount), payment_date: date, payment_method: method, reference: reference.trim() || null });
      emitToast("Payment recorded · order marked PAID"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not record payment"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Log payment from buyer" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Recording…" : "Record payment"}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>{order.customer_name} · order {order.order_id} · {fjd2(owed)} owed. Recording a payment adds a cash-ledger income row (feeds Bank Evidence) and marks the order PAID.</div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Amount (FJD)</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {partial && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--amber)", marginTop: 6 }}><AlertTriangle size={12} />This still marks the whole order PAID — partial settlement isn't tracked yet. Enter the full amount, or record the balance separately.</div>}
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select></div>
        <div><label>Reference (optional)</label><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="receipt / txn no." /></div>
      </div>
    </Modal>
  );
}

function LogCommunicationModal({ buyer, onClose, onSaved }) {
  const [f, setF] = useState({ comm_date: todayISO(), comm_time: "", channel: "whatsapp", direction: "outbound", topic: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await send("POST", `/api/v1/customers/${encodeURIComponent(buyer.id)}/communications`, { ...f, comm_time: f.comm_time || null, topic: f.topic.trim() || null, notes: f.notes.trim() || null });
      emitToast("Communication logged"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not log communication"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Log communication" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Logging…" : "Log communication"}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>With {buyer.name}. Each entry is hash-chained to this buyer.</div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Date</label><input type="date" value={f.comm_date} onChange={set("comm_date")} /></div>
        <div><label>Time (optional)</label><input type="time" value={f.comm_time} onChange={set("comm_time")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Channel</label><select value={f.channel} onChange={set("channel")}><option value="whatsapp">WhatsApp</option><option value="call">Call</option><option value="visit">Visit</option><option value="email">Email</option><option value="sms">SMS</option></select></div>
        <div><label>Direction</label><select value={f.direction} onChange={set("direction")}><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Topic</label><input value={f.topic} onChange={set("topic")} placeholder="e.g. Confirmed Thursday delivery" /></div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes</label><textarea rows={2} maxLength={500} value={f.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

function AddDemandSignalModal({ farmId, customers, onClose, onSaved }) {
  const [f, setF] = useState({ customer_id: "", crop_type: "", grade: "A", quantity_kg: "", avg_price_fjd: "", frequency: "weekly", confidence: "medium", notes: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.customer_id) { emitToast("Pick a buyer"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/demand-signals", { customer_id: f.customer_id, farm_id: farmId, crop_type: f.crop_type.trim() || null, grade: f.grade,
        quantity_kg: f.quantity_kg ? Number(f.quantity_kg) : null, avg_price_fjd: f.avg_price_fjd ? Number(f.avg_price_fjd) : null,
        frequency: f.frequency, confidence: f.confidence, notes: f.notes.trim() || null });
      emitToast("Demand signal added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not add signal"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Add demand signal" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add signal"}</button></>}>
      <Field label="Buyer"><select value={f.customer_id} onChange={set("customer_id")}><option value="">Pick a buyer…</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}</select></Field>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div><label>Crop</label><input value={f.crop_type} onChange={set("crop_type")} placeholder="e.g. eggplant" /></div>
        <div><label>Grade</label><select value={f.grade} onChange={set("grade")}><option>A</option><option>B</option><option>C</option></select></div>
        <div><label>Qty (kg)</label><input type="number" min="0" value={f.quantity_kg} onChange={set("quantity_kg")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Price/kg</label><input type="number" min="0" step="0.10" value={f.avg_price_fjd} onChange={set("avg_price_fjd")} /></div>
        <div><label>Frequency</label><select value={f.frequency} onChange={set("frequency")}><option value="weekly">weekly</option><option value="fortnightly">fortnightly</option><option value="monthly">monthly</option><option value="one_off">one-off</option></select></div>
        <div><label>Confidence</label><select value={f.confidence} onChange={set("confidence")}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes</label><textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

function AddLeadModal({ farmId, onClose, onSaved }) {
  const [f, setF] = useState({ prospect_name: "", prospect_type: "SUPERMARKET", city: "", potential_monthly_fjd: "", stage: "lead", next_action: "", next_action_date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.prospect_name.trim()) { emitToast("Prospect name is required"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/leads", { prospect_name: f.prospect_name.trim(), farm_id: farmId, prospect_type: f.prospect_type, city: f.city.trim() || null,
        potential_monthly_fjd: f.potential_monthly_fjd ? Number(f.potential_monthly_fjd) : null, stage: f.stage,
        next_action: f.next_action.trim() || null, next_action_date: f.next_action_date || null, notes: f.notes.trim() || null });
      emitToast("Lead added"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not add lead"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Add lead" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add lead"}</button></>}>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Prospect name</label><input value={f.prospect_name} onChange={set("prospect_name")} placeholder="e.g. Tappoo Hotel" /></div>
        <div><label>Type</label><select value={f.prospect_type} onChange={set("prospect_type")}>{TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>City</label><input value={f.city} onChange={set("city")} /></div>
        <div><label>Potential FJD/mo</label><input type="number" min="0" value={f.potential_monthly_fjd} onChange={set("potential_monthly_fjd")} /></div>
        <div><label>Stage</label><select value={f.stage} onChange={set("stage")}><option value="lead">Lead</option><option value="qualified">Qualified</option><option value="negotiating">Negotiating</option><option value="won">Won</option></select></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Next action</label><input value={f.next_action} onChange={set("next_action")} placeholder="e.g. Send sample" /></div>
        <div><label>By date</label><input type="date" value={f.next_action_date} onChange={set("next_action_date")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes</label><textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

function LogDisputeModal({ buyer, farmId, orders, onClose, onSaved }) {
  const [f, setF] = useState({ order_id: "", dispute_date: todayISO(), reason: "quality-rejection", quantity_kg: "", financial_impact_fjd: "", description: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/disputes", { customer_id: buyer.id, farm_id: farmId, order_id: f.order_id || null, dispute_date: f.dispute_date,
        reason: f.reason, quantity_kg: f.quantity_kg ? Number(f.quantity_kg) : null,
        financial_impact_fjd: f.financial_impact_fjd ? Number(f.financial_impact_fjd) : null, description: f.description.trim() || null });
      emitToast("Dispute logged"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not log dispute"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Log dispute" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Logging…" : "Log dispute"}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>With {buyer.name}. Hash-chained to this buyer.</div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Reason</label><select value={f.reason} onChange={set("reason")}><option value="quality-rejection">Quality rejection</option><option value="quantity-shortfall">Quantity shortfall</option><option value="late-delivery">Late delivery</option><option value="payment">Payment</option><option value="other">Other</option></select></div>
        <div><label>Date</label><input type="date" value={f.dispute_date} onChange={set("dispute_date")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Qty affected (kg)</label><input type="number" min="0" value={f.quantity_kg} onChange={set("quantity_kg")} /></div>
        <div><label>Financial impact (FJD)</label><input type="number" min="0" value={f.financial_impact_fjd} onChange={set("financial_impact_fjd")} /></div>
      </div>
      {orders.length > 0 && <Field label="Related order (optional)"><select value={f.order_id} onChange={set("order_id")}><option value="">—</option>{orders.map((o) => <option key={o.order_id} value={o.order_id}>{o.order_id} · {fjd2(amt(o))}</option>)}</select></Field>}
      <div className="form-row" style={{ marginTop: 10 }}><label>Description</label><textarea rows={2} value={f.description} onChange={set("description")} placeholder="What went wrong" /></div>
    </Modal>
  );
}

function ResolveDisputeModal({ dispute, onClose, onSaved }) {
  const [resolution, setResolution] = useState("accepted");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (!resolution.trim()) { emitToast("Enter how it was resolved"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("PATCH", `/api/v1/disputes/${encodeURIComponent(dispute.dispute_id)}/resolve`, { resolution: resolution.trim() });
      emitToast("Dispute resolved"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not resolve"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Resolve dispute" onClose={onClose} maxWidth={440} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Mark resolved"}</button></>}>
      <Field label="How was it resolved?"><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="accepted">Accepted</option><option value="discounted">Discounted</option><option value="refunded">Refunded</option><option value="replaced">Replaced</option><option value="rejected">Rejected claim</option></select></Field>
    </Modal>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function Buyers() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <BuyersInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

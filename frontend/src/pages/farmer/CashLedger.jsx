/**
 * CashLedger.jsx — /farm/money › "Cash" tab — audit-approved redesign (2026-06-26).
 *
 * Live balance + rail split, this-week net, receivables, net working capital, ledger feed,
 * category spend. CRUD on /api/v1/cash-ledger — every mutation hash-chained
 * (CASH_LOGGED/UPDATED/DELETED) + a server-enforced 48h edit window.
 *
 * Redesign (audit CA-BUG, CA1–CA27):
 *  · CA-BUG: list limit 200 (backend cap) — was 500 → 422 → false $0.
 *  · reads via api.js getJSON / writes via send (token refresh + humanized errors); Fiji time
 *  · cached-on-error + Retry (no false-empty on a money page); formatMoney; lucide Lock; submit-lock
 *  · CA17: NWC = balance + receivables (credit already in balance → no double-count); payables = info
 *  · CA18: inflow-set sign (INCOME/LOAN/GRANT/TRANSFER) so all types display/sign correctly
 *  · CA19: rails include Other/credit so they reconcile to balance; CA1: honest 200-cap note
 *  · shared a11y <Modal>; arrow-key tabs; drop redundant h1; view-aware Ask AI
 * FILED (backend): server-side aggregates / pagination (CA1), credit-as-payable accrual (CA17),
 *  TRANSFER + loan/grant types (CA18), correcting-entry path for the 48h lock (CA24), statement
 *  reconcile (CA15), ledger export (CA14), per-cycle P&L (CA21/CA22), tax mapping (CA27).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, X, ShieldCheck, Lock, Sparkles, AlertTriangle } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";
import { getCurrentUser } from "../../utils/auth";
import { formatMoney } from "../../utils/money";

const LIST_LIMIT = 200; // backend caps le=200 (CA-BUG)
// Editing/deleting cash retroactively changes the balance — management-only in the UI;
// fail-open if role is unknown (authoritative gate filed backend, SS-CA5).
function canManageCash() { const r = getCurrentUser()?.role; return !r || ["FOUNDER", "MANAGER", "ADMIN", "OWNER"].includes(r); }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }); } // Fiji day (CA4)
function fjd0(v) { return formatMoney(v ?? 0, { decimals: 0 }); }
function fjd2(v) { return formatMoney(v ?? 0, { decimals: 2 }); }
function amt(e) { return Number(e.amount_fjd ?? 0); }

const INFLOW = new Set(["INCOME", "LOAN", "GRANT", "TRANSFER"]); // matches backend balance sign SQL (CA18)
function isInflow(e) { return INFLOW.has(e.transaction_type); }
// Rail keys include "other" so M-PAiSA + cash + bank + other = balance (CA19).
const RAIL = { MOBILE_MONEY: ["mpaisa", "M-PAiSA"], CASH: ["cash", "Cash"], BANK_TRANSFER: ["bank", "Bank"], CREDIT: ["other", "Credit"], OTHER: ["other", "Other"] };
function railOf(e) { return RAIL[e.payment_method] || RAIL.OTHER; }

const PAYMENT_METHODS = [["CASH", "Cash"], ["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CREDIT", "Credit"], ["OTHER", "Other"]];
const CATEGORIES_BY_TYPE = {
  INCOME: [["HARVEST_SALE", "Harvest sale"], ["OTHER_INCOME", "Other income"]],
  EXPENSE: [["INPUTS_FERTILIZER", "Inputs — fertilizer"], ["INPUTS_CHEMICAL", "Inputs — chemical"], ["INPUTS_SEED", "Inputs — seed"], ["LABOR", "Labor"], ["EQUIPMENT", "Equipment"], ["FUEL", "Fuel"], ["TRANSPORT", "Transport"], ["FERRY", "Ferry"], ["OTHER_EXPENSE", "Other expense"]],
};
const VIEWS = [["overview", "Overview", "Live balance"], ["ledger", "Ledger", "Audit feed"], ["categories", "Categories", "Spend trends"], ["forecast", "Forecast", "Runway + outlook"], ["reconciliation", "Reconcile", "Check vs reality"], ["evidence", "Bank Evidence", "Lender-ready"]];
const WINDOWS = [["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["all", "All"]];
const WINDOW_DAYS = { week: 7, month: 31, quarter: 92, year: 366, all: Infinity };
const AI_PROMPTS = {
  overview: "Where is my farm cash going and how can I improve my cash flow?",
  ledger: "How should I keep clean cash records for my farm?",
  categories: "Which of my farm costs are highest and how do I bring them down?",
  forecast: "How do I forecast my farm cash flow for the season ahead?",
};

async function getCash(farmId) {
  const qs = new URLSearchParams({ limit: String(LIST_LIMIT) });
  if (farmId) qs.set("farm_id", farmId);
  return (await getJSON(`/api/v1/cash-ledger?${qs}`)) ?? {};
}
async function getOrders(farmId) { return (await getJSON(`/api/v1/orders${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`))?.data ?? []; }

// 48h correction window — server enforces 403 by created_at.
function cashWithin48h(createdAt) { if (!createdAt) return false; const t = Date.parse(createdAt); return Number.isFinite(t) && (Date.now() - t) <= 48 * 3600 * 1000; }

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
        <div className="overlay-head"><h2>{title}</h2><button className="overlay-close" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
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

function Tile({ label, value, sub, color, onClick }) {
  return <div className="capital-tile" onClick={onClick} style={onClick ? { cursor: "pointer" } : null}>
    <div className="capital-tile-label">{label}</div><div className="capital-tile-value" style={color ? { color } : null}>{value}</div><div className="capital-tile-sub">{sub}</div></div>;
}
// Honest-empty for a BUILT feature with no data yet (no "Building" badge — that implies unbuilt).
function EmptyState({ title, body, onAdd, addLabel }) {
  return <div className="card" style={{ padding: "28px 22px", textAlign: "center" }}>
    <div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div>
    <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px auto 14px", maxWidth: 380, lineHeight: 1.5 }}>{body}</div>
    {onAdd && <button className="btn btn-primary btn-sm" onClick={onAdd}><Plus size={13} />{addLabel || "Log cash"}</button>}
  </div>;
}

function CashEventCard({ e, onEdit, onDelete, canManage }) {
  const inc = isInflow(e); const [railK, railL] = railOf(e);
  const editable = cashWithin48h(e.created_at) && canManage;
  return (
    <div className={`cash-event-card ${inc ? "in" : "out"}`}>
      <div className="cash-event-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`cash-dir-pill ${inc ? "in" : "out"}`}>{inc ? "In" : "Out"}</span>
          <span className="cash-cat-pill">{(e.category || "—").replace(/_/g, " ").toLowerCase()}</span>
          <span className={`rail-badge ${railK}`}>{railL}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "Menlo,monospace" }}>{String(e.transaction_date).slice(0, 10)}</span>
        </div>
        <div className={`cash-event-amount ${inc ? "in" : "out"}`}>{inc ? "+" : "−"}{fjd2(amt(e))}</div>
      </div>
      <div className="cash-event-desc">{e.description || "—"}</div>
      <div className="cash-event-meta">
        {e.pu_id && <span className="event-anchor-chip">{e.pu_id}</span>}
        {e.reference_id && e.reference_type !== "CASH" && <span style={{ color: "var(--muted)", fontFamily: "Menlo,monospace" }}>· {e.reference_id}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)", flexWrap: "wrap" }}>
        <span className="verification-badge"><span className="verify-dot" />hash-chained</span>
        <span style={{ flex: 1 }} />
        {editable ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(e)}><Pencil size={12} />Edit</button>
            <button className="btn btn-secondary btn-sm" style={{ color: "var(--red)" }} onClick={() => onDelete(e)}><Trash2 size={12} />Delete</button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }} title="Locked after 48h — the audit trail is permanent"><Lock size={11} />Locked</span>
        )}
      </div>
    </div>
  );
}

function CashInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const canManage = canManageCash();
  const [view, setView] = useState("overview");
  const [dir, setDir] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [rail, setRail] = useState("all");
  const [win, setWin] = useState("month");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("type");
    if (t === "in" || t === "out") {
      setForm({ mode: "create", type: t === "in" ? "INCOME" : "EXPENSE" });
      searchParams.delete("type");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const cashQ = useQuery({ queryKey: ["cash", farmId], queryFn: () => getCash(farmId), enabled: !!farmId });
  const ordersQ = useQuery({ queryKey: ["orders", farmId], queryFn: () => getOrders(farmId), enabled: !!farmId });
  const entries = cashQ.data?.entries ?? [];
  const balance = Number(cashQ.data?.cash_balance_fjd ?? 0);
  const orders = ordersQ.data ?? [];
  const atCap = entries.length >= LIST_LIMIT; // CA1: breakdown is page-scoped beyond this

  // CA19: rails include "other" so they reconcile to the page balance.
  const railBal = useMemo(() => {
    const b = { mpaisa: 0, cash: 0, bank: 0, other: 0 };
    entries.forEach((e) => { const [k] = railOf(e); const s = isInflow(e) ? amt(e) : -amt(e); if (k in b) b[k] += s; });
    return b;
  }, [entries]);
  const now = Date.now();
  const inWin = (e, w) => { const d = Date.parse(e.transaction_date); return Number.isFinite(d) && (now - d) / 864e5 <= WINDOW_DAYS[w]; };
  const week = entries.filter((e) => inWin(e, "week"));
  const weekIn = week.filter(isInflow).reduce((s, e) => s + amt(e), 0);
  const weekOut = week.filter((e) => !isInflow(e)).reduce((s, e) => s + amt(e), 0);
  const weekNet = weekIn - weekOut;
  const receivables = orders.filter((o) => ["DISPATCHED", "DELIVERED", "INVOICED"].includes(o.order_status)).reduce((s, o) => s + Number(o.net_amount_fjd ?? o.total_amount_fjd ?? 0), 0);
  const creditPurchases = entries.filter((e) => !isInflow(e) && e.payment_method === "CREDIT").reduce((s, e) => s + amt(e), 0);
  // CA17: credit purchases already reduced `balance`; NWC = balance + receivables (no double-subtract).
  const nwc = balance + receivables;

  const filtered = useMemo(() => {
    let r = entries.filter((e) => inWin(e, win));
    if (dir === "in") r = r.filter(isInflow); else if (dir === "out") r = r.filter((e) => !isInflow(e));
    if (catFilter !== "all") r = r.filter((e) => e.category === catFilter);
    if (rail !== "all") r = r.filter((e) => railOf(e)[0] === rail);
    if (q.trim()) { const qq = q.toLowerCase(); r = r.filter((e) => `${e.description || ""} ${e.category || ""} ${e.reference_id || ""}`.toLowerCase().includes(qq)); }
    return r.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
  }, [entries, win, dir, catFilter, rail, q]);
  const fIn = filtered.filter(isInflow).reduce((s, e) => s + amt(e), 0);
  const fOut = filtered.filter((e) => !isInflow(e)).reduce((s, e) => s + amt(e), 0);
  const cats = useMemo(() => { const m = {}; entries.forEach((e) => { m[e.category] = (m[e.category] || 0) + 1; }); return m; }, [entries]);

  const refetch = () => qc.invalidateQueries({ queryKey: ["cash", farmId] });
  async function doDelete() {
    try { await send("DELETE", `/api/v1/cash-ledger/${encodeURIComponent(del.ledger_id)}`); emitToast("Entry deleted"); refetch(); }
    catch (e) { emitToast(e?.userMessage || "Could not delete"); } finally { setDel(null); }
  }
  const recent = entries.slice().sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date))).slice(0, 8);
  const askAi = () => navigate("/tis?q=" + encodeURIComponent(AI_PROMPTS[view] || AI_PROMPTS.overview));
  const onTabKey = (e, id) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = VIEWS.findIndex((v) => v[0] === id);
    const ni = e.key === "ArrowRight" ? (i + 1) % VIEWS.length : (i - 1 + VIEWS.length) % VIEWS.length;
    setView(VIEWS[ni][0]);
  };
  const capNote = atCap ? "Breakdown covers your latest 200 entries · balance is all-time." : null;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div className="subtitle">Live balance across every business · crops + animals</div>
            <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
              <FarmSelector />
              <button className="btn btn-secondary" onClick={askAi}><Sparkles size={13} />Ask AI</button>
              <button className="btn btn-secondary" onClick={() => setForm({ mode: "create", type: "INCOME" })}><Plus size={13} />Cash in</button>
              <button className="btn btn-primary" onClick={() => setForm({ mode: "create", type: "EXPENSE" })}><Plus size={13} />Expense</button>
            </div>
          </div>

          <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Tile label="Balance" value={fjd0(balance)} sub="live · all rails" />
            <Tile label="This week net" value={`${weekNet < 0 ? "−" : "+"}${fjd0(Math.abs(weekNet))}`} sub={`${fjd0(weekIn)} in · ${fjd0(weekOut)} out`} color={weekNet < 0 ? "var(--amber)" : "var(--green-dk)"} onClick={() => setView("ledger")} />
            <div title="Money buyers still owe you for delivered orders"><Tile label="Receivables" value={fjd0(receivables)} sub="owed to farm" onClick={() => navigate("/farm/market")} /></div>
            <div title="Things you bought on credit — these already reduce your balance"><Tile label="Credit purchases" value={fjd0(creditPurchases)} sub={creditPurchases > 0 ? "already in balance" : "none"} color={creditPurchases > 0 ? "var(--amber)" : null} /></div>
            <div title="What you'd have if every buyer paid you: your balance plus money owed to you"><Tile label="Net working capital" value={fjd0(nwc)} sub="balance + money owed to you" /></div>
          </div>

          <div className="cycle-view-tabs" role="tablist" aria-label="Cash views">
            {VIEWS.map(([id, label, sub]) => <button key={id} role="tab" aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={`task-tab ${view === id ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setView(id)} onKeyDown={(e) => onTabKey(e, id)}>{label}<span className="task-tab-count" style={{ fontSize: 10 }}>{sub}</span></button>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its cash.</div>
            : cashQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : cashQ.isError && entries.length === 0 ? <ErrorCard msg="Couldn't load your cash." onRetry={() => cashQ.refetch()} />
            : (
            <>
              {cashQ.isError && entries.length > 0 && <DegradedBanner />}
              {view === "overview" ? (
              <>
                <div className="cash-balance-card" style={{ marginBottom: 14 }}>
                  <div className="cash-balance-label">Balance</div>
                  <div className="cash-balance-value">{fjd2(balance)}</div>
                  <div className="cash-balance-sub">{entries.length}{atCap ? "+" : ""} logged entries</div>
                  <div className="rail-breakdown">
                    <div className="rail-segment mpaisa"><div className="rail-segment-label">M-PAiSA</div><div className="rail-segment-value">{fjd0(railBal.mpaisa)}</div><div className="rail-segment-sub">mobile</div></div>
                    <div className="rail-segment cash"><div className="rail-segment-label">Cash</div><div className="rail-segment-value">{fjd0(railBal.cash)}</div><div className="rail-segment-sub">on hand</div></div>
                    <div className="rail-segment bank"><div className="rail-segment-label">Bank</div><div className="rail-segment-value">{fjd0(railBal.bank)}</div><div className="rail-segment-sub">transfer</div></div>
                    {railBal.other !== 0 && <div className="rail-segment"><div className="rail-segment-label">Other</div><div className="rail-segment-value">{fjd0(railBal.other)}</div><div className="rail-segment-sub">credit/other</div></div>}
                  </div>
                  {capNote && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>{capNote}</div>}
                </div>
                <div className="cash-rp-strip">
                  <div className="cash-rp-tile receivables" onClick={() => navigate("/farm/market")}><div className="cash-rp-label">Receivables</div><div className="cash-rp-value">{fjd0(receivables)}</div><div className="cash-rp-sub">owed to farm</div></div>
                  <div className="cash-rp-tile payables"><div className="cash-rp-label">Credit purchases</div><div className="cash-rp-value">{fjd0(creditPurchases)}</div><div className="cash-rp-sub">already in balance</div></div>
                  <div className="cash-rp-tile net-wc"><div className="cash-rp-label">Net working capital</div><div className="cash-rp-value">{fjd0(nwc)}</div><div className="cash-rp-sub">balance + receivables</div></div>
                </div>
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}><span>Recent cash events</span><button style={{ fontSize: 11.5, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setView("ledger")}>View all in ledger</button></div>
                  {recent.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No cash logged yet — use Cash in / Expense.</div>
                    : recent.map((e) => <CashEventCard key={e.ledger_id} e={e} canManage={canManage} onEdit={(x) => setForm({ mode: "edit", type: x.transaction_type, entry: x })} onDelete={setDel} />)}
                </div>
              </>
            ) : view === "ledger" ? (
              <>
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                  <Tile label={`Cash in (${win})`} value={fjd2(fIn)} sub={`${filtered.filter(isInflow).length} events`} color="var(--green-dk)" />
                  <Tile label={`Cash out (${win})`} value={fjd2(fOut)} sub={`${filtered.filter((e) => !isInflow(e)).length} events`} color="var(--amber)" />
                  <Tile label="Net" value={`${fIn - fOut < 0 ? "−" : "+"}${fjd2(Math.abs(fIn - fOut))}`} sub="in − out" color={fIn - fOut < 0 ? "var(--red)" : "var(--green-dk)"} />
                  <Tile label="Events" value={filtered.length} sub="in window" />
                </div>
                {capNote && <div style={{ fontSize: 11, color: "var(--muted)", margin: "0 2px 8px" }}>{capNote}</div>}
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Direction:</span>
                  {[["all", "All", entries.length], ["in", "In", entries.filter(isInflow).length], ["out", "Out", entries.filter((e) => !isInflow(e)).length]].map(([id, l, n]) => <button key={id} className={`filter-pill ${dir === id ? "active" : ""}`} onClick={() => setDir(id)}>{l}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Category:</span>
                  <button className={`filter-pill ${catFilter === "all" ? "active" : ""}`} onClick={() => setCatFilter("all")}>All</button>
                  {Object.entries(cats).map(([c, n]) => <button key={c} className={`filter-pill ${catFilter === c ? "active" : ""}`} onClick={() => setCatFilter(c)}>{(c || "—").replace(/_/g, " ").toLowerCase()}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="task-controls-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Rail:</span>
                    <select value={rail} onChange={(e) => setRail(e.target.value)} aria-label="Rail" style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
                      <option value="all">All rails</option><option value="mpaisa">M-PAiSA</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="other">Credit/other</option>
                    </select>
                  </div>
                  <div className="task-time-window">{WINDOWS.map(([w, l]) => <button key={w} className={`task-time-btn ${win === w ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setWin(w)}>{l}</button>)}</div>
                </div>
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, reference..." aria-label="Search cash" style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                </div>
                {filtered.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No cash events match these filters.</div>
                  : filtered.map((e) => <CashEventCard key={e.ledger_id} e={e} canManage={canManage} onEdit={(x) => setForm({ mode: "edit", type: x.transaction_type, entry: x })} onDelete={setDel} />)}
              </>
            ) : view === "categories" ? <CategoriesView entries={entries} capNote={capNote} onAdd={() => setForm({ mode: "create", type: "EXPENSE" })} />
            : view === "forecast" ? <ForecastView farmId={farmId} balance={balance} onAdd={() => setForm({ mode: "create", type: "INCOME" })} />
            : view === "reconciliation" ? <ReconcileView balance={balance} railBal={railBal} atCap={atCap} onAdd={() => setForm({ mode: "create", type: "INCOME" })} />
            : (
              <div className="card" style={{ padding: "18px 20px" }}>
                <div style={{ fontWeight: 700, color: "var(--soil)", display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={15} />Bank Evidence</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px", lineHeight: 1.5 }}>Your cash ledger is hash-chained and feeds the lender-ready Bank Evidence pack (cashflow statement + audit-verifiable records).</div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/farm/reports")}>Open Bank Evidence →</button>
              </div>
            )}
            </>
          )}
        </div>
      </main>

      {form && <EntryForm form={form} farmId={farmId} onClose={() => setForm(null)} onSaved={() => { refetch(); setForm(null); }} />}
      {del && <Modal title="Delete this entry?" onClose={() => setDel(null)} maxWidth={420} foot={<><button className="btn btn-secondary" onClick={() => setDel(null)}>Cancel</button><button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={doDelete}>Delete</button></>}>
        <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}>{del.description || del.category} · {fjd2(amt(del))}. The audit-chain record remains; only the live ledger row is removed. This can't be undone.</div>
      </Modal>}
    </TfpShell>
  );
}

function CategoriesView({ entries, capNote, onAdd }) {
  const byCat = useMemo(() => {
    const m = {};
    entries.forEach((e) => { const k = e.category || "—"; (m[k] = m[k] || { cat: k, income: 0, expense: 0 }); if (isInflow(e)) m[k].income += amt(e); else m[k].expense += amt(e); });
    return Object.values(m).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [entries]);
  if (!byCat.length) return <EmptyState title="No cash logged yet" body="Log a cash-in or an expense and your spending by category — with your biggest cost — appears here." onAdd={onAdd} addLabel="Log cash" />;
  const totalIncome = byCat.reduce((s, r) => s + r.income, 0);
  const totalExpense = byCat.reduce((s, r) => s + r.expense, 0);
  const net = totalIncome - totalExpense;
  const max = byCat.reduce((m, r) => Math.max(m, r.income, r.expense), 0) || 1;
  const topCost = byCat.filter((r) => r.expense > 0).sort((a, b) => b.expense - a.expense)[0];
  const pct = (v) => (totalExpense > 0 ? Math.round((v / totalExpense) * 100) : 0);
  const label = (c) => (c || "—").replace(/_/g, " ").toLowerCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Tile label="Income" value={fjd0(totalIncome)} sub={`${byCat.filter((r) => r.income > 0).length} categories`} color="var(--green-dk)" />
        <Tile label="Spending" value={fjd0(totalExpense)} sub={`${byCat.filter((r) => r.expense > 0).length} categories`} color="var(--amber)" />
        <Tile label="Net" value={`${net < 0 ? "−" : "+"}${fjd0(Math.abs(net))}`} sub="income − spending" color={net < 0 ? "var(--red)" : "var(--green-dk)"} />
      </div>
      {topCost && totalExpense > 0 && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--soil)" }}>
          Biggest cost: <strong>{label(topCost.cat)}</strong> — {fjd0(topCost.expense)} ({pct(topCost.expense)}% of your spending).
        </div>
      )}
      {capNote && <div style={{ fontSize: 11, color: "var(--muted)" }}>{capNote}</div>}
      {byCat.map((r) => (
        <div key={r.cat}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--soil)", fontWeight: 600, marginBottom: 4 }}>
            <span>{label(r.cat)}</span>
            <span>{r.income ? `+${fjd0(r.income)}` : ""}{r.expense ? ` −${fjd0(r.expense)}${totalExpense > 0 ? ` · ${pct(r.expense)}%` : ""}` : ""}</span>
          </div>
          {r.income > 0 && <div style={{ height: 7, borderRadius: 999, background: "var(--cream-2,#efe7d6)", marginBottom: 3 }}><div style={{ height: 7, borderRadius: 999, width: `${(r.income / max) * 100}%`, background: "var(--green-dk)" }} /></div>}
          {r.expense > 0 && <div style={{ height: 7, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 7, borderRadius: 999, width: `${(r.expense / max) * 100}%`, background: "var(--amber)" }} /></div>}
        </div>
      ))}
    </div>
  );
}

// Real cash forecast — runway + 8-week projection + upcoming income, strictly from
// /analytics/{farm}/forecasts (balance + recent avg weekly net + live harvest dates). Honest-empty.
function ForecastView({ farmId, balance, onAdd }) {
  const q = useQuery({ queryKey: ["cash-forecast", farmId], queryFn: () => getJSON(`/api/v1/analytics/${encodeURIComponent(farmId)}/forecasts`), enabled: !!farmId, retry: 1 });
  if (q.isLoading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading forecast…</div>;
  if (q.isError) return <ErrorCard msg="Couldn't load the forecast." onRetry={() => q.refetch()} />;
  const d = q.data?.data || {};
  const avg = d.avg_weekly_net_fjd;
  const proj = d.cash_projection || [];
  const harvests = d.harvest_windows || [];
  if (avg == null) return <EmptyState title="Forecast needs a little history" body="Log a few weeks of cash in and out and your runway + projection appear here — projected only from your real numbers, never invented." onAdd={onAdd} addLabel="Log cash" />;
  const burning = avg < 0;
  const runwayWeeks = burning ? Math.max(0, Math.floor(balance / Math.abs(avg))) : null;
  const longRunway = burning && runwayWeeks > 52; // SF2: cap absurd numbers
  const firstNeg = proj.find((p) => p.projected_balance < 0);
  const maxAbs = Math.max(1, ...proj.map((p) => Math.abs(p.projected_balance)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cash-balance-card">
        <div className="cash-balance-label">{burning ? "Cash runway" : "Cash trend"}</div>
        <div className="cash-balance-value" style={{ color: burning ? (runwayWeeks <= 4 ? "var(--red)" : "var(--amber)") : "var(--green-dk)" }}>
          {!burning ? "Cash-positive" : longRunway ? "Over a year" : `≈ ${runwayWeeks} week${runwayWeeks === 1 ? "" : "s"}`}
        </div>
        <div className="cash-balance-sub">{burning ? (longRunway ? `more than 52 weeks of cash at the moment — you're spending ${fjd2(Math.abs(avg))} more than you earn each week` : `you're spending ${fjd2(Math.abs(avg))} more than you earn each week`) : `building reserves at +${fjd2(avg)} a week`}</div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 4 }}>Projected balance</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Projected from your average weekly net over the last 8 weeks — a guide, not a guarantee.</div>
        {proj.map((p) => { const neg = p.projected_balance < 0; return (
          <div key={p.week_offset} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ width: 52, fontSize: 11.5, color: "var(--muted)" }}>Wk +{p.week_offset}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 8, borderRadius: 999, width: `${(Math.abs(p.projected_balance) / maxAbs) * 100}%`, background: neg ? "var(--red)" : "var(--green-dk)" }} /></div>
            <span style={{ width: 90, textAlign: "right", fontFamily: "Menlo,monospace", fontSize: 12, color: neg ? "var(--red)" : "var(--soil)" }}>{fjd0(p.projected_balance)}</span>
          </div>
        ); })}
        {firstNeg && burning && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--red)", marginTop: 8 }}><AlertTriangle size={13} />On this trend, cash dips below zero around week +{firstNeg.week_offset} — line up income or trim costs before then.</div>}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 8 }}>Expected income — upcoming harvests</div>
        {harvests.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No harvests scheduled. Set expected harvest dates on your cycles and they appear here as income events.</div>
          : harvests.map((h) => (
            <div key={h.cycle_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(92,64,51,0.08)", gap: 8 }}>
              <div><span style={{ fontWeight: 600, color: "var(--soil)" }}>{h.crop || "Crop"}</span>{h.planned_yield_kg ? <span style={{ fontSize: 11.5, color: "var(--muted)" }}> · {Math.round(h.planned_yield_kg)}kg expected</span> : ""}</div>
              <span style={{ fontSize: 11.5, color: h.overdue ? "var(--red)" : "var(--muted)" }}>{h.overdue ? "overdue · " : ""}{String(h.date).slice(0, 10)}</span>
            </div>
          ))}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Income amounts aren't projected here — they depend on price + grade you set at sale (no invented figures).</div>
      </div>
    </div>
  );
}

// Real reconciliation — compare your logged rail balances against what's actually in M-PAiSA,
// the bank and cash on hand, to catch missed entries. Client-side check; statement import + saved
// reconciliations are the next slice (honestly named).
function ReconcileView({ balance, railBal, atCap, onAdd }) {
  const [a, setA] = useState({ mpaisa: "", cash: "", bank: "" });
  const rows = [["mpaisa", "M-PAiSA"], ["cash", "Cash on hand"], ["bank", "Bank"]];
  const set = (k) => (e) => setA((s) => ({ ...s, [k]: e.target.value }));
  const allEntered = rows.every(([k]) => a[k] !== "");
  const totalActual = rows.reduce((s, [k]) => s + Number(a[k] || 0), 0);
  // SF1: the trustworthy check is total-actual vs the whole-ledger balance (correct at any size).
  const totalDiff = allEntered ? totalActual - balance : null;
  // Per-rail diff is only valid when the breakdown is whole-ledger (not at the 200 cap).
  const diffOf = (k) => (!atCap && a[k] !== "") ? Number(a[k]) - (railBal[k] || 0) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="calendar-banner">Enter what's actually in M-PAiSA, your bank and cash on hand. We compare your total to your logged balance to catch a missed entry.{atCap ? " (You have 200+ entries, so the per-rail check is hidden — the total below is the accurate one.)" : ""}</div>
      <div className="card" style={{ padding: 16 }}>
        {rows.map(([k, label]) => { const dv = diffOf(k); return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
            <span style={{ fontSize: 13, color: "var(--soil)", fontWeight: 600, minWidth: 110 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginLeft: "auto" }}>
              {!atCap && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>logged {fjd0(railBal[k] || 0)}</span>}
              <label style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>actual <input type="number" step="0.01" value={a[k]} onChange={set(k)} placeholder="0" style={{ width: 100, textAlign: "right", padding: "6px 8px", border: "1.5px solid var(--line)", borderRadius: 6, fontSize: 12.5 }} /></label>
              {dv != null && <span style={{ fontFamily: "Menlo,monospace", fontSize: 12.5, color: dv === 0 ? "var(--green-dk)" : "var(--red)", minWidth: 64, textAlign: "right" }}>{dv > 0 ? "+" : dv < 0 ? "−" : ""}{fjd0(Math.abs(dv))}</span>}
            </div>
          </div>
        ); })}
        {railBal.other ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Plus {fjd0(railBal.other)} logged as credit/other (not a cash rail).</div> : null}
      </div>
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--soil)" }}><span>Logged balance (all-time)</span><strong style={{ fontFamily: "Menlo,monospace" }}>{fjd0(balance)}</strong></div>
        {!allEntered ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Enter all three actual balances to check your total.</div>
          : totalDiff === 0
          ? <div style={{ color: "var(--green-dk)", fontWeight: 600, marginTop: 8 }}>Matched — your ledger is in sync with reality.</div>
          : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ color: "var(--soil)", fontSize: 13 }}>Off by <strong style={{ color: "var(--red)" }}>{fjd0(Math.abs(totalDiff))}</strong> — {totalDiff > 0 ? "you have more than logged (a sale not recorded?)" : "you have less than logged (an expense not recorded?)"}</div>
              <button className="btn btn-secondary btn-sm" onClick={onAdd}><Plus size={12} />Add the missing entry</button>
            </div>}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>This is a quick check — it isn't saved yet. Statement import and saved reconciliation history are the next slice.</div>
    </div>
  );
}

function Field({ label, children }) { return <div className="form-row"><label>{label}</label>{children}</div>; }

function EntryForm({ form, farmId, onClose, onSaved }) {
  const isEdit = form.mode === "edit";
  const e = form.entry || {};
  const [type, setType] = useState(form.type || "INCOME");
  const [date, setDate] = useState((e.transaction_date || todayISO()).slice(0, 10));
  const [category, setCategory] = useState(e.category || CATEGORIES_BY_TYPE[form.type || "INCOME"][0][0]);
  const [amount, setAmount] = useState(e.amount_fjd ? String(e.amount_fjd) : "");
  const [method, setMethod] = useState(e.payment_method || "CASH");
  const [description, setDescription] = useState(e.description || "");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // submit-lock vs double-posted cash (CA20)
  const cats = CATEGORIES_BY_TYPE[type] || CATEGORIES_BY_TYPE.INCOME;
  async function submit() {
    if (lock.current) return;
    if (!Number(amount)) { emitToast("Enter the amount"); return; }
    lock.current = true; setBusy(true);
    try {
      if (isEdit) {
        await send("PATCH", `/api/v1/cash-ledger/${encodeURIComponent(e.ledger_id)}`, { category, amount_fjd: Number(amount), payment_method: method, description: description.trim() || category });
      } else {
        await send("POST", "/api/v1/cash-ledger", { farm_id: farmId, transaction_date: date, transaction_type: type, category, description: description.trim() || category, amount_fjd: Number(amount), payment_method: method });
      }
      emitToast(isEdit ? "Entry updated" : type === "INCOME" ? "Cash in logged" : "Expense logged"); onSaved?.();
    } catch (err) { emitToast(err?.userMessage || "Could not save"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={isEdit ? "Edit entry" : type === "INCOME" ? "Log cash in" : "Log expense"} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Log"}</button></>}>
      {!isEdit && (
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label>Type</label><select value={type} onChange={(ev) => { setType(ev.target.value); setCategory(CATEGORIES_BY_TYPE[ev.target.value][0][0]); }}><option value="INCOME">Cash in</option><option value="EXPENSE">Expense</option></select></div>
          <div><label>Date</label><input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></div>
        </div>
      )}
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: isEdit ? 0 : 10 }}>
        <div><label>Category</label><select value={category} onChange={(ev) => setCategory(ev.target.value)}>{cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label>Amount (FJD)</label><input type="number" min="0" step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} /></div>
      </div>
      <Field label="Payment method"><select value={method} onChange={(ev) => setMethod(ev.target.value)}>{PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      {method === "CREDIT" && type === "EXPENSE" && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Note: credit purchases currently reduce your balance straight away — proper payables tracking is on the roadmap.</div>}
      <Field label="Description"><input value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="What was this for" /></Field>
    </Modal>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } } });
export default function CashLedger() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <CashInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

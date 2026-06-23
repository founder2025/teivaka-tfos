/**
 * CashLedger.jsx — /farm/cash — PIXEL-EXACT rebuild of the prototype's Cash surface.
 *
 * Reproduces coreFinanceView pixel-for-pixel (cash-balance-card + rail breakdown, KPI
 * tiles, cycle-view-tabs, cash-event-card, filters) under <TfpShell>, wired to the real
 * ledger CRUD (GET/POST/PATCH/DELETE /api/v1/cash-ledger — every mutation hash-chained
 * as CASH_LOGGED/UPDATED/DELETED by the backend) + /orders for receivables.
 *
 * Real/derived: balance (+ M-PAiSA/cash/bank rail split from payment_method), this-week
 * net, net-so-far, receivables (owed orders), payables (credit-method expenses),
 * net working capital, ledger feed, category spend. Honest "Building": forecast +
 * reconciliation. Bank Evidence → links to /farm/reports.
 */
import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fjd0(v) { const n = Number(v ?? 0); return `FJD ${Math.round(n).toLocaleString("en-FJ")}`; }
function fjd2(v) { const n = Number(v ?? 0); return `FJD ${n.toLocaleString("en-FJ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function amt(e) { return Number(e.amount_fjd ?? 0); }

const RAIL = { MOBILE_MONEY: ["mpaisa", "M-PAiSA"], CASH: ["cash", "Cash"], BANK_TRANSFER: ["bank", "Bank"], CREDIT: ["credit", "Credit"], OTHER: ["other", "Other"] };
function railOf(e) { return RAIL[e.payment_method] || RAIL.OTHER; }
function isIncome(e) { return e.transaction_type === "INCOME"; }

const PAYMENT_METHODS = [["CASH", "Cash"], ["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CREDIT", "Credit"], ["OTHER", "Other"]];
const CATEGORIES_BY_TYPE = {
  INCOME: [["HARVEST_SALE", "Harvest sale"], ["OTHER_INCOME", "Other income"]],
  EXPENSE: [["INPUTS_FERTILIZER", "Inputs — fertilizer"], ["INPUTS_CHEMICAL", "Inputs — chemical"], ["INPUTS_SEED", "Inputs — seed"], ["LABOR", "Labor"], ["EQUIPMENT", "Equipment"], ["FUEL", "Fuel"], ["TRANSPORT", "Transport"], ["FERRY", "Ferry"], ["OTHER_EXPENSE", "Other expense"]],
};
const VIEWS = [["overview", "Overview", "Live balance"], ["ledger", "Ledger", "Audit feed"], ["categories", "Categories", "Spend trends"], ["forecast", "Forecast", "13-week ahead"], ["reconciliation", "Reconcile", "Match statement"], ["evidence", "Bank Evidence", "Lender-ready"]];
const WINDOWS = [["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["all", "All"]];
const WINDOW_DAYS = { week: 7, month: 31, quarter: 92, year: 366, all: Infinity };

async function getCash(farmId) { const qs = new URLSearchParams({ limit: "500" }); if (farmId) qs.set("farm_id", farmId); const r = await fetch(`/api/v1/cash-ledger?${qs}`, { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? {}; }
async function getOrders(farmId) { const r = await fetch(`/api/v1/orders${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`, { headers: authHeaders() }); if (!r.ok) throw new Error(r.status); return (await r.json())?.data ?? []; }

function Tile({ label, value, sub, color, onClick }) {
  return <div className="capital-tile" onClick={onClick} style={onClick ? { cursor: "pointer" } : null}>
    <div className="capital-tile-label">{label}</div><div className="capital-tile-value" style={color ? { color } : null}>{value}</div><div className="capital-tile-sub">{sub}</div></div>;
}
function Building({ title, body }) {
  return <div className="card" style={{ padding: "16px 18px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</span><span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Building</span></div>
    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{body}</div></div>;
}

// 48h correction window — edits/deletes lock by server created_at (backend enforces 403).
function cashWithin48h(createdAt) {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && (Date.now() - t) <= 48 * 3600 * 1000;
}

function CashEventCard({ e, onEdit, onDelete }) {
  const inc = isIncome(e); const [railK, railL] = railOf(e);
  const editable = cashWithin48h(e.created_at);
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
        {e.farm_id && <span className="event-anchor-chip">{e.farm_id}</span>}
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
          <span style={{ fontSize: 11, color: "var(--muted)" }} title="Locked after 48h — the audit trail is permanent">🔒 Locked</span>
        )}
      </div>
    </div>
  );
}

function CashInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [view, setView] = useState("overview");
  const [dir, setDir] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [rail, setRail] = useState("all");
  const [win, setWin] = useState("month");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // {mode, type, entry}
  const [del, setDel] = useState(null);
  // Slice F — the (+) universal "Record a sale / purchase" deep-links here with
  // ?type=in|out and opens the right add-form straight away (one tap, not two).
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

  const railBal = useMemo(() => {
    const b = { mpaisa: 0, cash: 0, bank: 0 };
    entries.forEach((e) => { const [k] = railOf(e); const s = isIncome(e) ? amt(e) : -amt(e); if (k in b) b[k] += s; });
    return b;
  }, [entries]);
  const now = Date.now();
  const inWin = (e, w) => { const d = Date.parse(e.transaction_date); return Number.isFinite(d) && (now - d) / 864e5 <= WINDOW_DAYS[w]; };
  const week = entries.filter((e) => inWin(e, "week"));
  const weekIn = week.filter(isIncome).reduce((s, e) => s + amt(e), 0);
  const weekOut = week.filter((e) => !isIncome(e)).reduce((s, e) => s + amt(e), 0);
  const weekNet = weekIn - weekOut;
  const receivables = orders.filter((o) => ["DISPATCHED", "DELIVERED", "INVOICED"].includes(o.order_status)).reduce((s, o) => s + Number(o.net_amount_fjd ?? o.total_amount_fjd ?? 0), 0);
  const payables = entries.filter((e) => !isIncome(e) && e.payment_method === "CREDIT").reduce((s, e) => s + amt(e), 0);
  const nwc = balance + receivables - payables;

  // Ledger filtering
  const filtered = useMemo(() => {
    let r = entries.filter((e) => inWin(e, win));
    if (dir === "in") r = r.filter(isIncome); else if (dir === "out") r = r.filter((e) => !isIncome(e));
    if (catFilter !== "all") r = r.filter((e) => e.category === catFilter);
    if (rail !== "all") r = r.filter((e) => railOf(e)[0] === rail);
    if (q.trim()) { const qq = q.toLowerCase(); r = r.filter((e) => `${e.description || ""} ${e.category || ""} ${e.reference_id || ""}`.toLowerCase().includes(qq)); }
    return r.sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
  }, [entries, win, dir, catFilter, rail, q]);
  const fIn = filtered.filter(isIncome).reduce((s, e) => s + amt(e), 0);
  const fOut = filtered.filter((e) => !isIncome(e)).reduce((s, e) => s + amt(e), 0);
  const cats = useMemo(() => { const m = {}; entries.forEach((e) => { m[e.category] = (m[e.category] || 0) + 1; }); return m; }, [entries]);

  const refetch = () => qc.invalidateQueries({ queryKey: ["cash", farmId] });
  async function doDelete() {
    try { const r = await fetch(`/api/v1/cash-ledger/${encodeURIComponent(del.ledger_id)}`, { method: "DELETE", headers: authHeaders() }); if (!r.ok && r.status !== 204) throw new Error(); emitToast("Entry deleted"); refetch(); }
    catch { emitToast("Could not delete"); } finally { setDel(null); }
  }
  const recent = entries.slice().sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date))).slice(0, 8);

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Cash</h1><div className="subtitle">Live balance across every business · crops + animals</div></div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-secondary" onClick={() => setForm({ mode: "create", type: "INCOME" })}><Plus size={13} />Log cash in</button>
              <button className="btn btn-primary" onClick={() => setForm({ mode: "create", type: "EXPENSE" })}><Plus size={13} />Log expense</button>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Tile label="Balance" value={fjd0(balance)} sub={`M-PAiSA ${fjd0(railBal.mpaisa)} · cash ${fjd0(railBal.cash)} · bank ${fjd0(railBal.bank)}`} />
            <Tile label="This week net" value={`${weekNet < 0 ? "−" : "+"}${fjd0(Math.abs(weekNet))}`} sub={`${fjd0(weekIn)} in · ${fjd0(weekOut)} out`} color={weekNet < 0 ? "var(--amber)" : "var(--green-dk)"} onClick={() => setView("ledger")} />
            <Tile label="Receivables" value={fjd0(receivables)} sub="owed to farm" onClick={() => navigate("/farm/buyers")} />
            <Tile label="Payables" value={fjd0(payables)} sub={payables > 0 ? "credit purchases" : "nothing owed"} color={payables > 0 ? "var(--amber)" : null} />
            <Tile label="Net working capital" value={fjd0(nwc)} sub="cash + recv − pay" />
          </div>

          <div className="cycle-view-tabs">
            {VIEWS.map(([id, label, sub]) => <div key={id} className={`task-tab ${view === id ? "active" : ""}`} onClick={() => setView(id)}>{label}<span className="task-tab-count" style={{ fontSize: 10 }}>{sub}</span></div>)}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its cash.</div>
            : cashQ.isLoading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : view === "overview" ? (
              <>
                <div className="cash-balance-card" style={{ marginBottom: 14 }}>
                  <div className="cash-balance-label">Balance</div>
                  <div className="cash-balance-value">{fjd2(balance)}</div>
                  <div className="cash-balance-sub">{entries.length} logged entries</div>
                  <div className="rail-breakdown">
                    <div className="rail-segment mpaisa"><div className="rail-segment-label">M-PAiSA</div><div className="rail-segment-value">{fjd0(railBal.mpaisa)}</div><div className="rail-segment-sub">mobile</div></div>
                    <div className="rail-segment cash"><div className="rail-segment-label">Cash</div><div className="rail-segment-value">{fjd0(railBal.cash)}</div><div className="rail-segment-sub">on hand</div></div>
                    <div className="rail-segment bank"><div className="rail-segment-label">Bank</div><div className="rail-segment-value">{fjd0(railBal.bank)}</div><div className="rail-segment-sub">transfer</div></div>
                  </div>
                </div>
                <div className="cash-rp-strip">
                  <div className="cash-rp-tile receivables" onClick={() => navigate("/farm/buyers")}><div className="cash-rp-label">Receivables</div><div className="cash-rp-value">{fjd0(receivables)}</div><div className="cash-rp-sub">owed to farm</div></div>
                  <div className="cash-rp-tile payables"><div className="cash-rp-label">Payables</div><div className="cash-rp-value">{fjd0(payables)}</div><div className="cash-rp-sub">credit purchases</div></div>
                  <div className="cash-rp-tile net-wc"><div className="cash-rp-label">Net working capital</div><div className="cash-rp-value">{fjd0(nwc)}</div><div className="cash-rp-sub">cash + recv − pay</div></div>
                </div>
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}><span>Recent cash events</span><span style={{ fontSize: 11.5, color: "var(--muted)", cursor: "pointer" }} onClick={() => setView("ledger")}>View all in ledger</span></div>
                  {recent.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No cash logged yet — use Log cash in / Log expense.</div>
                    : recent.map((e) => <CashEventCard key={e.ledger_id} e={e} onEdit={(x) => setForm({ mode: "edit", type: x.transaction_type, entry: x })} onDelete={setDel} />)}
                </div>
              </>
            ) : view === "ledger" ? (
              <>
                <div className="capital-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                  <Tile label={`Cash in (${win})`} value={fjd2(fIn)} sub={`${filtered.filter(isIncome).length} events`} color="var(--green-dk)" />
                  <Tile label={`Cash out (${win})`} value={fjd2(fOut)} sub={`${filtered.filter((e) => !isIncome(e)).length} events`} color="var(--amber)" />
                  <Tile label="Net" value={`${fIn - fOut < 0 ? "−" : "+"}${fjd2(Math.abs(fIn - fOut))}`} sub="in − out" color={fIn - fOut < 0 ? "var(--red)" : "var(--green-dk)"} />
                  <Tile label="Events" value={filtered.length} sub="in window" />
                </div>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Direction:</span>
                  {[["all", "All", entries.length], ["in", "In", entries.filter(isIncome).length], ["out", "Out", entries.filter((e) => !isIncome(e)).length]].map(([id, l, n]) => <button key={id} className={`filter-pill ${dir === id ? "active" : ""}`} onClick={() => setDir(id)}>{l}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="gallery-filter-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginRight: 6, alignSelf: "center" }}>Category:</span>
                  <button className={`filter-pill ${catFilter === "all" ? "active" : ""}`} onClick={() => setCatFilter("all")}>All</button>
                  {Object.entries(cats).map(([c, n]) => <button key={c} className={`filter-pill ${catFilter === c ? "active" : ""}`} onClick={() => setCatFilter(c)}>{(c || "—").replace(/_/g, " ").toLowerCase()}<span className="filter-pill-count">{n}</span></button>)}
                </div>
                <div className="task-controls-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Rail:</span>
                    <select value={rail} onChange={(e) => setRail(e.target.value)} style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
                      <option value="all">All rails</option><option value="mpaisa">M-PAiSA</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="credit">Credit</option>
                    </select>
                  </div>
                  <div className="task-time-window">{WINDOWS.map(([w, l]) => <div key={w} className={`task-time-btn ${win === w ? "active" : ""}`} onClick={() => setWin(w)}>{l}</div>)}</div>
                </div>
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, reference..." style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}><Search size={14} /></span>
                </div>
                {filtered.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No cash events match these filters.</div>
                  : filtered.map((e) => <CashEventCard key={e.ledger_id} e={e} onEdit={(x) => setForm({ mode: "edit", type: x.transaction_type, entry: x })} onDelete={setDel} />)}
              </>
            ) : view === "categories" ? <CategoriesView entries={entries} />
            : view === "forecast" ? <Building title="13-week cash forecast" body="Projects cash in/out 13 weeks ahead from your recurring buyer demand signals + scheduled costs. Turns on once you log a season of cash and set buyer demand. Nothing projected from fabricated numbers." />
            : view === "reconciliation" ? <Building title="Reconcile statement" body="Match your logged cash against a bank / M-PAiSA statement to catch anything missed. Ships with statement import — until then the ledger is your single source of truth." />
            : (
              <div className="card" style={{ padding: "18px 20px" }}>
                <div style={{ fontWeight: 700, color: "var(--soil)", display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={15} />Bank Evidence</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px", lineHeight: 1.5 }}>Your cash ledger is hash-chained and feeds the lender-ready Bank Evidence pack (cashflow statement + audit-verifiable records).</div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/farm/reports")}>Open Bank Evidence →</button>
              </div>
            )}
        </div>
      </main>

      {form && <EntryForm form={form} farmId={farmId} onClose={() => setForm(null)} onSaved={() => { refetch(); setForm(null); }} />}
      {del && (
        <div className="overlay-backdrop show" onClick={() => setDel(null)}>
          <div className="overlay-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head"><h2>Delete this entry?</h2><button className="overlay-close" onClick={() => setDel(null)}><X size={14} /></button></div>
            <div className="overlay-body"><div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}>{del.description || del.category} · {fjd2(amt(del))}. The audit-chain record remains; only the live ledger row is removed. This can't be undone.</div></div>
            <div className="overlay-foot"><button className="btn btn-secondary" onClick={() => setDel(null)}>Cancel</button><button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={doDelete}>Delete</button></div>
          </div>
        </div>
      )}
    </TfpShell>
  );
}

function CategoriesView({ entries }) {
  const byCat = useMemo(() => {
    const m = {};
    entries.forEach((e) => { const k = e.category || "—"; (m[k] = m[k] || { cat: k, income: 0, expense: 0 }); if (isIncome(e)) m[k].income += amt(e); else m[k].expense += amt(e); });
    return Object.values(m).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [entries]);
  if (!byCat.length) return <Building title="Category spend trends" body="Income and expense by category appear here once you log cash." />;
  const max = byCat.reduce((m, r) => Math.max(m, r.income, r.expense), 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {byCat.map((r) => (
        <div key={r.cat}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--soil)", fontWeight: 600, marginBottom: 4 }}>
            <span>{(r.cat).replace(/_/g, " ").toLowerCase()}</span>
            <span>{r.income ? `+${fjd0(r.income)}` : ""}{r.expense ? ` −${fjd0(r.expense)}` : ""}</span>
          </div>
          {r.income > 0 && <div style={{ height: 7, borderRadius: 999, background: "var(--cream-2,#efe7d6)", marginBottom: 3 }}><div style={{ height: 7, borderRadius: 999, width: `${(r.income / max) * 100}%`, background: "var(--green-dk)" }} /></div>}
          {r.expense > 0 && <div style={{ height: 7, borderRadius: 999, background: "var(--cream-2,#efe7d6)" }}><div style={{ height: 7, borderRadius: 999, width: `${(r.expense / max) * 100}%`, background: "var(--amber)" }} /></div>}
        </div>
      ))}
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
  const cats = CATEGORIES_BY_TYPE[type] || [];
  async function submit() {
    if (!Number(amount)) { emitToast("Enter the amount"); return; }
    setBusy(true);
    try {
      let r;
      if (isEdit) {
        r = await fetch(`/api/v1/cash-ledger/${encodeURIComponent(e.ledger_id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ category, amount_fjd: Number(amount), payment_method: method, description: description.trim() || category }) });
      } else {
        r = await fetch("/api/v1/cash-ledger", { method: "POST", headers: authHeaders(), body: JSON.stringify({ farm_id: farmId, transaction_date: date, transaction_type: type, category, description: description.trim() || category, amount_fjd: Number(amount), payment_method: method }) });
      }
      if (!r.ok) { let m = "Could not save"; try { const b = await r.json(); m = b?.detail?.message || b?.detail || m; } catch {} emitToast(typeof m === "string" ? m : "Could not save"); return; }
      emitToast(isEdit ? "Entry updated" : type === "INCOME" ? "Cash in logged" : "Expense logged"); onSaved?.();
    } catch { emitToast("Could not save"); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{isEdit ? "Edit entry" : type === "INCOME" ? "Log cash in" : "Log expense"}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
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
          <Field label="Description"><input value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="What was this for" /></Field>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Log"}</button></div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function CashLedger() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <CashInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

/**
 * MarketIntelligence.jsx — folded into the Home → Marketplace view.
 *
 * V1 surfaces (Operator spec 2026-06-09), pixel-consistent with the prototype's
 * own price/demand classes (prices-tbl / demand-card / signal-tile, scoped .tfp):
 *   Prices  → GET /api/v1/market/prices   (weighted from actual sales, else avg)
 *   Demand  → GET /api/v1/market/demand    + POST to post buyer demand
 *   Supply  → GET /api/v1/market/supply    + POST to post a projected harvest
 *   Signals → GET /api/v1/market/signals   (balance + opportunity score per crop)
 *
 * Honest: every board is real submitted data — empty until users submit (no mock
 * numbers). Every action button hits a real endpoint.
 */
import { useEffect, useState } from "react";
import { DollarSign, ShoppingBag, Sprout, Crosshair, Plus, X, TrendingUp, TrendingDown, Minus, Trash2 } from "lucide-react";
import { getCurrentUser } from "../../utils/auth";
import { hasRole } from "../../utils/roles";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";
const postJSON = (u, body) => send("POST", u, body);
const fjd = (v) => formatMoney(v, { fallback: "—" });
const confClass = (c) => ({ VERY_HIGH: "high", HIGH: "high", MEDIUM: "medium", LOW: "low" }[c] || "low");

function TrendIcon({ t }) {
  if (t === "UP") return <TrendingUp size={13} style={{ color: "var(--green-dk)" }} />;
  if (t === "DOWN") return <TrendingDown size={13} style={{ color: "#b3261e" }} />;
  return <Minus size={13} style={{ color: "var(--muted)" }} />;
}

const TABS = [
  { id: "prices", label: "Market prices", Icon: DollarSign },
  { id: "demand", label: "Buyer demand", Icon: ShoppingBag },
  { id: "supply", label: "Supply board", Icon: Sprout },
  { id: "signals", label: "Signals & opportunity", Icon: Crosshair },
];

/* ---------- submit modals ---------- */
function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, background: "var(--paper)" };

function Modal({ title, onClose, onSubmit, busy, children }) {
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>{title}</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div className="overlay-body">{children}</div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={onSubmit}>{busy ? "Saving…" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}

function PriceModal({ onClose, onDone }) {
  const [f, setF] = useState({ production_id: "", price_per_kg_fjd: "", quantity_kg: "", grade: "A", location_region: "", island: "", buyer_type: "", is_actual_sale: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async () => {
    if (!f.production_id || !f.price_per_kg_fjd) { setErr("Crop code and price are required."); return; }
    setBusy(true); setErr(null);
    try { await postJSON("/api/v1/market/prices", { ...f, price_per_kg_fjd: Number(f.price_per_kg_fjd), quantity_kg: f.quantity_kg ? Number(f.quantity_kg) : null }); onDone(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Modal title="Submit a market price" onClose={onClose} onSubmit={submit} busy={busy}>
      {err && <div className="comm-note" style={{ marginBottom: 10, color: "#b3261e" }}>{err}</div>}
      <Field label="Crop code (e.g. CRP-TOM)"><input style={inp} value={f.production_id} onChange={(e) => setF({ ...f, production_id: e.target.value.toUpperCase() })} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Price FJD/kg"><input style={inp} type="number" step="0.01" value={f.price_per_kg_fjd} onChange={(e) => setF({ ...f, price_per_kg_fjd: e.target.value })} /></Field>
        <Field label="Quantity kg (sold)"><input style={inp} type="number" step="0.01" value={f.quantity_kg} onChange={(e) => setF({ ...f, quantity_kg: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Grade"><select style={inp} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option>A</option><option>B</option><option>C</option></select></Field>
        <Field label="Island"><input style={inp} value={f.island} onChange={(e) => setF({ ...f, island: e.target.value })} /></Field>
      </div>
      <Field label="Buyer type"><input style={inp} placeholder="Supermarket / Hotel / Market / Exporter" value={f.buyer_type} onChange={(e) => setF({ ...f, buyer_type: e.target.value })} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--soil)" }}>
        <input type="checkbox" checked={f.is_actual_sale} onChange={(e) => setF({ ...f, is_actual_sale: e.target.checked })} />
        This is a completed sale (counts toward the weighted market price)
      </label>
    </Modal>
  );
}

function DemandModal({ onClose, onDone }) {
  const [f, setF] = useState({ production_id: "", quantity_kg: "", frequency: "WEEKLY", grade: "A", buyer_type: "", island: "", price_offered_fjd: "", required_by: "", notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async () => {
    if (!f.production_id || !f.quantity_kg) { setErr("Crop code and quantity are required."); return; }
    setBusy(true); setErr(null);
    try { await postJSON("/api/v1/market/demand", { ...f, quantity_kg: Number(f.quantity_kg), price_offered_fjd: f.price_offered_fjd ? Number(f.price_offered_fjd) : null, required_by: f.required_by || null }); onDone(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Modal title="Post buyer demand" onClose={onClose} onSubmit={submit} busy={busy}>
      {err && <div className="comm-note" style={{ marginBottom: 10, color: "#b3261e" }}>{err}</div>}
      <Field label="Crop code (e.g. CRP-TOM)"><input style={inp} value={f.production_id} onChange={(e) => setF({ ...f, production_id: e.target.value.toUpperCase() })} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Quantity kg"><input style={inp} type="number" step="0.01" value={f.quantity_kg} onChange={(e) => setF({ ...f, quantity_kg: e.target.value })} /></Field>
        <Field label="Frequency"><select style={inp} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option>ONE_OFF</option><option>WEEKLY</option><option>MONTHLY</option><option>QUARTERLY</option><option>RECURRING</option></select></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Grade"><select style={inp} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option>A</option><option>B</option><option>C</option></select></Field>
        <Field label="Price offered FJD/kg"><input style={inp} type="number" step="0.01" value={f.price_offered_fjd} onChange={(e) => setF({ ...f, price_offered_fjd: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Island"><input style={inp} value={f.island} onChange={(e) => setF({ ...f, island: e.target.value })} /></Field>
        <Field label="Needed by"><input style={inp} type="date" value={f.required_by} onChange={(e) => setF({ ...f, required_by: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><input style={inp} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}

function SupplyModal({ onClose, onDone }) {
  const [f, setF] = useState({ production_id: "", plants: "", expected_yield_per_unit_kg: "", success_probability: "0.85", harvest_date: "", island: "", grade: "A", notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const projected = (f.plants && f.expected_yield_per_unit_kg) ? Math.round(Number(f.plants) * Number(f.expected_yield_per_unit_kg) * Number(f.success_probability || 0.85)) : null;
  const submit = async () => {
    if (!f.production_id) { setErr("Crop code is required."); return; }
    setBusy(true); setErr(null);
    try { await postJSON("/api/v1/market/supply", { ...f, plants: f.plants ? Number(f.plants) : null, expected_yield_per_unit_kg: f.expected_yield_per_unit_kg ? Number(f.expected_yield_per_unit_kg) : null, success_probability: Number(f.success_probability || 0.85), harvest_date: f.harvest_date || null }); onDone(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Modal title="Post a projected harvest" onClose={onClose} onSubmit={submit} busy={busy}>
      {err && <div className="comm-note" style={{ marginBottom: 10, color: "#b3261e" }}>{err}</div>}
      <Field label="Crop code (e.g. CRP-TOM)"><input style={inp} value={f.production_id} onChange={(e) => setF({ ...f, production_id: e.target.value.toUpperCase() })} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Plants"><input style={inp} type="number" value={f.plants} onChange={(e) => setF({ ...f, plants: e.target.value })} /></Field>
        <Field label="Yield kg/plant"><input style={inp} type="number" step="0.1" value={f.expected_yield_per_unit_kg} onChange={(e) => setF({ ...f, expected_yield_per_unit_kg: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Success probability (0–1)"><input style={inp} type="number" step="0.01" value={f.success_probability} onChange={(e) => setF({ ...f, success_probability: e.target.value })} /></Field>
        <Field label="Harvest date"><input style={inp} type="date" value={f.harvest_date} onChange={(e) => setF({ ...f, harvest_date: e.target.value })} /></Field>
      </div>
      <Field label="Island"><input style={inp} value={f.island} onChange={(e) => setF({ ...f, island: e.target.value })} /></Field>
      {projected != null && <div className="comm-note" style={{ marginTop: 4 }}>Projected supply ≈ <strong>{projected.toLocaleString()} kg</strong> (plants × yield × success).</div>}
    </Modal>
  );
}

const BLANK_SEED = { production_id: "", price_per_kg_fjd: "", grade: "A", island: "", buyer_type: "" };
function SeedModal({ onClose, onDone }) {
  const [items, setItems] = useState([{ ...BLANK_SEED }, { ...BLANK_SEED }, { ...BLANK_SEED }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (i, k, v) => setItems(items.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const submit = async () => {
    const clean = items.filter((r) => r.production_id && r.price_per_kg_fjd)
      .map((r) => ({ ...r, production_id: r.production_id.toUpperCase(), price_per_kg_fjd: Number(r.price_per_kg_fjd) }));
    if (!clean.length) { setErr("Enter at least one crop code and price."); return; }
    setBusy(true); setErr(null);
    try { const res = await postJSON("/api/v1/market/prices/seed-reference", { items: clean }); onDone(res?.data?.inserted || clean.length); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Modal title="Seed reference prices (admin)" onClose={onClose} onSubmit={submit} busy={busy}>
      {err && <div className="comm-note" style={{ marginBottom: 10, color: "#b3261e" }}>{err}</div>}
      <div className="comm-note" style={{ marginBottom: 12 }}>Enter <strong>real</strong> reference prices you know. These show on the board as ADMIN_REFERENCE and never count toward the weighted-sales price.</div>
      <table className="prices-tbl" style={{ marginBottom: 10 }}>
        <thead><tr><th>Crop code</th><th>FJD/kg</th><th>Grade</th><th>Island</th><th>Buyer</th><th></th></tr></thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td><input style={{ ...inp, minWidth: 90 }} value={r.production_id} onChange={(e) => set(i, "production_id", e.target.value.toUpperCase())} placeholder="CRP-TOM" /></td>
              <td><input style={{ ...inp, width: 80 }} type="number" step="0.01" value={r.price_per_kg_fjd} onChange={(e) => set(i, "price_per_kg_fjd", e.target.value)} /></td>
              <td><select style={{ ...inp, width: 60 }} value={r.grade} onChange={(e) => set(i, "grade", e.target.value)}><option>A</option><option>B</option><option>C</option></select></td>
              <td><input style={{ ...inp, width: 90 }} value={r.island} onChange={(e) => set(i, "island", e.target.value)} /></td>
              <td><input style={{ ...inp, width: 100 }} value={r.buyer_type} onChange={(e) => set(i, "buyer_type", e.target.value)} placeholder="Market" /></td>
              <td>{items.length > 1 && <button className="btn btn-sm btn-secondary" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={12} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm btn-secondary" onClick={() => setItems([...items, { ...BLANK_SEED }])}><Plus size={12} />Add row</button>
    </Modal>
  );
}

/* ---------- views ---------- */
function Prices({ rows, onAdd, onSeed, isAdmin }) {
  if (!rows) return <div className="comm-note">Loading prices…</div>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Weighted from completed sales · FJD per kg</span>
        {isAdmin && <button className="btn btn-sm btn-secondary" style={{ marginLeft: "auto" }} onClick={onSeed}><DollarSign size={12} />Seed reference</button>}
        <button className="btn btn-sm btn-primary" style={{ marginLeft: isAdmin ? 8 : "auto" }} onClick={onAdd}><Plus size={12} />Submit price</button>
      </div>
      {rows.length === 0 ? (
        <div className="comm-note">No prices logged yet. Submit the price you bought or sold at — the board fills as farmers and buyers report real numbers.</div>
      ) : (
        <table className="prices-tbl">
          <thead><tr><th>Crop</th><th>Market price</th><th>Range</th><th>Trend</th><th>Confidence</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.production_id}>
                <td className="prices-crop">{r.production_name}</td>
                <td><div className="prices-fjd">{fjd(r.weighted_price_fjd)}</div><div className="prices-grade">{r.weighted_from_sales ? "weighted · sales" : "avg · reported"}</div></td>
                <td><div className="prices-grade">{fjd(r.price_low_fjd)} – {fjd(r.price_high_fjd)}</div></td>
                <td><TrendIcon t={r.trend} /></td>
                <td><span className={`demand-conf demand-conf-${confClass(r.confidence)}`}>{r.confidence}</span></td>
                <td><div className="prices-grade">{r.last_updated ? r.last_updated.slice(0, 10) : "—"}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Demand({ rows, onAdd }) {
  if (!rows) return <div className="comm-note">Loading demand…</div>;
  return (
    <>
      <div style={{ display: "flex", marginBottom: 10 }}>
        <button className="btn btn-sm btn-primary" style={{ marginLeft: "auto" }} onClick={onAdd}><Plus size={12} />Post demand</button>
      </div>
      {rows.length === 0 ? (
        <div className="comm-note">No open buyer demand yet. Buyers (hotels, supermarkets, exporters) post what they need here so farmers grow to demand, not leftovers.</div>
      ) : (
        <div className="demand-grid">
          {rows.map((d) => (
            <div className="demand-card" key={d.demand_record_id}>
              <div className="demand-card-h"><span className="demand-buyer">{d.buyer_name || "Buyer"}{d.buyer_type ? ` · ${d.buyer_type}` : ""}</span><span className="demand-conf demand-conf-high">{d.is_recurring ? "RECURRING" : d.frequency}</span></div>
              <div className="demand-what"><Sprout size={13} /><strong>{Number(d.quantity_kg).toLocaleString()} kg</strong> {d.production_name || d.production_id}{d.grade ? ` · Grade ${d.grade}` : ""}</div>
              <div className="demand-when"><ShoppingBag size={12} />{d.frequency}{d.required_by ? ` · by ${String(d.required_by).slice(0, 10)}` : ""}{d.island ? ` · ${d.island}` : ""}</div>
              {d.price_offered_fjd != null && <div className="demand-price"><DollarSign size={12} />{fjd(d.price_offered_fjd)} / kg</div>}
              {d.notes && <div className="demand-note">{d.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Supply({ rows, onAdd }) {
  if (!rows) return <div className="comm-note">Loading supply…</div>;
  return (
    <>
      <div style={{ display: "flex", marginBottom: 10 }}>
        <button className="btn btn-sm btn-primary" style={{ marginLeft: "auto" }} onClick={onAdd}><Plus size={12} />Post harvest</button>
      </div>
      {rows.length === 0 ? (
        <div className="comm-note">No projected harvests yet. Post what you're growing and when it lands — buyers see supply coming, and signals can spot gluts and gaps.</div>
      ) : (
        <table className="prices-tbl">
          <thead><tr><th>Crop</th><th>Projected</th><th>Harvest</th><th>Location</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.supply_forecast_id}>
                <td className="prices-crop">{s.production_name || s.production_id}{s.grade ? ` · Gr ${s.grade}` : ""}</td>
                <td><div className="prices-fjd">{s.projected_supply_kg != null ? `${Number(s.projected_supply_kg).toLocaleString()} kg` : "—"}</div>{s.plants ? <div className="prices-grade">{s.plants} plants</div> : null}</td>
                <td><div className="prices-grade">{s.harvest_date ? String(s.harvest_date).slice(0, 10) : "—"}</div></td>
                <td><div className="prices-grade">{[s.location_region, s.island].filter(Boolean).join(", ") || "—"}</div></td>
                <td><span className="pill grey">{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Signals({ rows }) {
  if (!rows) return <div className="comm-note">Loading signals…</div>;
  if (rows.length === 0) return <div className="comm-note">Signals appear once there's supply and demand to compare. Post a projected harvest and a buyer demand, and the balance + opportunity score compute automatically.</div>;
  const bandColor = (b) => ({ EXCELLENT: "var(--green-dk)", GOOD: "var(--green)", MODERATE: "var(--amber)", HIGH_RISK: "#b3261e" }[b] || "var(--muted)");
  return (
    <div className="signal-grid">
      {rows.map((r) => (
        <div className="signal-tile" key={r.production_id}>
          <div className="signal-tile-name">{r.production_name}</div>
          <div className="signal-tile-metric" style={{ color: bandColor(r.opportunity_band) }}>{r.opportunity_score}</div>
          <div className="signal-tile-state">{r.opportunity_band.replace("_", " ")} · {r.balance_status}</div>
          <div className="signal-tile-foot">
            <span><Sprout size={11} /> {Number(r.supply_index_kg).toLocaleString()}kg</span>
            <span><ShoppingBag size={11} /> {Number(r.demand_index_kg).toLocaleString()}kg</span>
            <span><TrendIcon t={r.price_trend} /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MarketIntelligence() {
  const [tab, setTab] = useState("prices");
  const [prices, setPrices] = useState(null);
  const [demand, setDemand] = useState(null);
  const [supply, setSupply] = useState(null);
  const [signals, setSignals] = useState(null);
  const [modal, setModal] = useState(null);
  const isAdmin = (() => { try { return hasRole(getCurrentUser()?.role, "ADMIN"); } catch { return false; } })();

  const load = async () => {
    const [p, d, s, sg] = await Promise.allSettled([
      getJSON("/api/v1/market/prices"), getJSON("/api/v1/market/demand"),
      getJSON("/api/v1/market/supply"), getJSON("/api/v1/market/signals"),
    ]);
    setPrices(p.status === "fulfilled" ? (p.value?.data || []) : []);
    setDemand(d.status === "fulfilled" ? (d.value?.data || []) : []);
    setSupply(s.status === "fulfilled" ? (s.value?.data || []) : []);
    setSignals(sg.status === "fulfilled" ? (sg.value?.data || []) : []);
  };
  useEffect(() => { load(); }, []);
  const done = () => { setModal(null); load(); };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Crosshair size={16} style={{ color: "var(--green-dk)" }} />
        <strong style={{ color: "var(--soil)" }}>Market Intelligence</strong>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>What's selling · who needs it · what to plant next</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} className={`pill ${t.id === tab ? "" : "grey"}`} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: t.id === tab ? "1px solid var(--green)" : "1px solid var(--line)", background: t.id === tab ? "rgba(106,168,79,0.1)" : "var(--paper)", color: t.id === tab ? "var(--green-dk)" : "var(--muted)", padding: "6px 12px", fontWeight: 600 }} onClick={() => setTab(t.id)}>
            <t.Icon size={13} />{t.label}
          </button>
        ))}
      </div>

      {tab === "prices" && <Prices rows={prices} onAdd={() => setModal("price")} onSeed={() => setModal("seed")} isAdmin={isAdmin} />}
      {tab === "demand" && <Demand rows={demand} onAdd={() => setModal("demand")} />}
      {tab === "supply" && <Supply rows={supply} onAdd={() => setModal("supply")} />}
      {tab === "signals" && <Signals rows={signals} />}

      {modal === "price" && <PriceModal onClose={() => setModal(null)} onDone={done} />}
      {modal === "demand" && <DemandModal onClose={() => setModal(null)} onDone={done} />}
      {modal === "supply" && <SupplyModal onClose={() => setModal(null)} onDone={done} />}
      {modal === "seed" && <SeedModal onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

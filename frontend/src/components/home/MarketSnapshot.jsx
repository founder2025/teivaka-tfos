/**
 * MarketSnapshot.jsx — compact "live market intelligence" panel for the Home
 * landing. Surfaces real data from /api/v1/market/* (prices, signals, demand);
 * honest-empty per card until data exists. Renders inside .tfp (HomePillar).
 */
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, DollarSign, ShoppingBag, Crosshair, ArrowRight } from "lucide-react";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const fjd = (v) => (v == null || isNaN(Number(v)) ? "—" : `FJD ${Number(v).toFixed(2)}`);

function Trend({ t }) {
  if (t === "UP") return <TrendingUp size={13} style={{ color: "var(--green-dk)" }} />;
  if (t === "DOWN") return <TrendingDown size={13} style={{ color: "#b3261e" }} />;
  return <Minus size={13} style={{ color: "var(--muted)" }} />;
}
const bandColor = (b) => ({ EXCELLENT: "var(--green-dk)", GOOD: "var(--green)", MODERATE: "var(--amber,#bf9000)", HIGH_RISK: "#b3261e" }[b] || "var(--muted)");

const cardStyle = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", flex: 1, minWidth: 220 };
const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 };
const headStyle = { display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--soil)", fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6 };
const emptyStyle = { fontSize: 12, color: "var(--muted)", padding: "10px 0" };

export default function MarketSnapshot({ onOpenMarket }) {
  const [prices, setPrices] = useState(null);
  const [signals, setSignals] = useState(null);
  const [demand, setDemand] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, s, d] = await Promise.allSettled([
        getJSON("/api/v1/market/prices"),
        getJSON("/api/v1/market/signals"),
        getJSON("/api/v1/market/demand"),
      ]);
      setPrices(p.status === "fulfilled" ? (p.value?.data || []) : []);
      setSignals(s.status === "fulfilled" ? (s.value?.data || []) : []);
      setDemand(d.status === "fulfilled" ? (d.value?.data || []) : []);
    })();
  }, []);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Crosshair size={16} style={{ color: "var(--green-dk)" }} />
        <strong style={{ color: "var(--soil)" }}>Market intelligence · today</strong>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Real prices · demand · opportunity across your country</span>
        {onOpenMarket && (
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: "auto" }} onClick={onOpenMarket}>
            Open marketplace <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Prices */}
        <div style={cardStyle}>
          <div style={headStyle}><DollarSign size={13} /> Market prices · FJD/kg</div>
          {prices == null ? <div style={emptyStyle}>Loading…</div>
            : prices.length === 0 ? <div style={emptyStyle}>No prices logged yet. Add reference prices or log a sale and they show here.</div>
            : prices.slice(0, 6).map((r) => (
              <div style={rowStyle} key={r.production_id}>
                <span style={{ color: "var(--soil)", fontWeight: 600 }}>{r.production_name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--green-dk)", fontWeight: 700 }}>{fjd(r.weighted_price_fjd ?? r.price_avg_fjd)}</span>
                  <Trend t={r.trend} />
                </span>
              </div>
            ))}
        </div>

        {/* Opportunity */}
        <div style={cardStyle}>
          <div style={headStyle}><Crosshair size={13} /> Opportunity</div>
          {signals == null ? <div style={emptyStyle}>Loading…</div>
            : signals.length === 0 ? <div style={emptyStyle}>Opportunity scores appear once there's supply and demand to compare.</div>
            : signals.slice(0, 5).map((r) => (
              <div style={rowStyle} key={r.production_id}>
                <span style={{ color: "var(--soil)", fontWeight: 600 }}>{r.production_name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{(r.balance_status || "").toLowerCase()}</span>
                  <span style={{ fontWeight: 800, color: bandColor(r.opportunity_band) }}>{r.opportunity_score}</span>
                </span>
              </div>
            ))}
        </div>

        {/* Buyer demand */}
        <div style={cardStyle}>
          <div style={headStyle}><ShoppingBag size={13} /> Buyer demand</div>
          {demand == null ? <div style={emptyStyle}>Loading…</div>
            : demand.length === 0 ? <div style={emptyStyle}>No open buyer demand yet. Buyers post what they need here.</div>
            : demand.slice(0, 5).map((d) => (
              <div style={rowStyle} key={d.demand_record_id}>
                <span style={{ color: "var(--soil)", fontWeight: 600 }}>{d.production_name || d.production_id}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{Number(d.quantity_kg).toLocaleString()}kg · {d.frequency?.toLowerCase()}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

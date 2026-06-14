/** AdminMarketIntelligence — /admin/intelligence/market (I6).
 *  Backend wired, awaiting the Ministry / exporter price feed. Honest-empty:
 *  shows the tier schema is ready and names the blocker — never fakes prices.
 *  Also surfaces the crowdsourced reports farmers already submit. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { LineChart, Plug } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)", gold: "var(--amber)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const TIER_NOTE = { FARMGATE: "what the farmer is paid", WHOLESALE: "market depot", RETAIL: "shop shelf", EXPORT: "overseas buyer" };

export default function AdminMarketIntelligence() {
  const [d, setD] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/admin/intelligence/market").then((r) => setD(r.data)).catch((e) => { if (e.status === 403) setDenied(true); setD({}); });
  }, []);

  if (denied) return <AdminLayout><div style={{ ...card, color: C.muted }}>Admin Command Center is founder-only.</div></AdminLayout>;
  if (d == null) return <AdminLayout><div style={card}>Loading…</div></AdminLayout>;

  const awaiting = d.status === "AWAITING_FEED";
  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <LineChart size={20} style={{ color: C.greenDk }} />
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Market Intelligence</h1>
        <span style={{ fontSize: 10, fontWeight: 800, background: awaiting ? C.gold : C.green, color: "#fff", borderRadius: 999, padding: "3px 9px", textTransform: "uppercase" }}>{awaiting ? "Awaiting feed" : "Live"}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
        Authoritative prices by tier — and the farmgate→wholesale spread that proves revenue realism for the
        Bank Evidence credit story. Compared against farmers’ own crowdsourced reports.
      </p>

      {awaiting && (
        <div style={{ ...card, background: "#FBF4E2", border: `1px solid ${C.gold}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Plug size={18} style={{ color: C.gold, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.soil }}>Backend wired · awaiting data feed</div>
            <p style={{ fontSize: 12.5, color: C.soil, margin: "3px 0 0", lineHeight: 1.5 }}>{d.blocker}</p>
          </div>
        </div>
      )}

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 22 }}>
        <Stat label="Authoritative prices" value={d.authoritative_prices ?? 0} />
        <Stat label="Crowdsourced reports" value={d.crowdsourced_reports ?? "—"} />
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Price tiers ready to receive</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {(d.price_tiers_supported || []).map((t) => {
            const n = (d.tiers || []).find((x) => x.price_tier === t)?.rows || 0;
            return (
              <div key={t} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px", minWidth: 130, background: C.cream }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.soil }}>{t}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{TIER_NOTE[t]}</div>
                <div style={{ fontSize: 13, color: n ? C.greenDk : C.muted, fontWeight: 700, marginTop: 2 }}>{n} rows</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Latest authoritative prices</div>
        {(d.latest && d.latest.length) ? (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <tbody>
              {d.latest.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.cream}` }}>
                  <td style={{ padding: "8px 16px", color: C.soil, fontWeight: 600 }}>{r.commodity}</td>
                  <td style={{ padding: "8px 8px", color: C.muted }}>{r.price_tier}</td>
                  <td style={{ padding: "8px 8px", color: C.muted }}>{r.region}</td>
                  <td style={{ padding: "8px 16px", color: C.greenDk, fontWeight: 700, textAlign: "right" }}>${r.price_fjd}/{r.unit}</td>
                  <td style={{ padding: "8px 16px", color: C.muted, textAlign: "right" }}>{r.observed_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 14, color: C.muted, fontSize: 12.5 }}>No authoritative prices loaded yet — the feed lands here via the ingestion runbook, no redeploy.</div>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.greenDk, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

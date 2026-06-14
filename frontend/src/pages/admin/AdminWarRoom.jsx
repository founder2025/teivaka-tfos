/** AdminWarRoom — /admin/warroom (FOUNDER only). Subscription/retention/funnel
 *  intelligence from real tables + the event spine. Stricter than ADMIN. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Crosshair, TrendingDown, Layers } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)", gold: "var(--amber)", red: "var(--red)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const h2 = { fontSize: 15, fontWeight: 800, color: C.soil, margin: "0 0 10px" };

function Bar({ label, n, pct, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ width: 130, fontSize: 12.5, color: C.soil }}>{label}</span>
      <div style={{ flex: 1, background: C.cream, borderRadius: 6, height: 22, overflow: "hidden", border: `1px solid ${C.line}` }}>
        <div style={{ width: `${Math.max(2, pct)}%`, background: color || C.green, height: "100%", borderRadius: 6 }} />
      </div>
      <strong style={{ width: 70, textAlign: "right", color: C.soil, fontSize: 13 }}>{n ?? 0}</strong>
      <span style={{ width: 52, textAlign: "right", fontSize: 11.5, color: C.muted }}>{pct != null ? `${pct}%` : ""}</span>
    </div>
  );
}

export default function AdminWarRoom() {
  const [d, setD] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/admin/warroom").then((r) => setD(r.data)).catch((e) => { if (e.status === 403) setDenied(true); setD({}); });
  }, []);

  if (denied) return <AdminLayout><div style={{ ...card, color: C.muted }}>The War Room is founder-only.</div></AdminLayout>;
  if (d == null) return <AdminLayout><div style={card}>Loading…</div></AdminLayout>;

  const funnelMax = Math.max(...(d.funnel || []).map((f) => f.n || 0), 1);
  const adoptMax = Math.max(...((d.feature_adoption || []).map((a) => a.users || 0)), 1);

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Crosshair size={20} style={{ color: C.gold }} />
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Founder War Room</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, background: C.gold, color: "#fff", borderRadius: 999, padding: "3px 9px", textTransform: "uppercase" }}>Founder only</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-md:!grid-cols-1">
        <div style={card}>
          <div style={h2}>Activation funnel</div>
          {(d.funnel || []).map((f, i) => (
            <Bar key={f.step} label={f.step} n={f.n} pct={Math.round((f.n / funnelMax) * 100)} color={i === (d.funnel.length - 1) ? C.gold : C.green} />
          ))}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            Step conversion: {(d.funnel || []).map((f) => `${f.step.split(" ")[0]} ${f.pct_of_prev}%`).join(" · ")}
          </div>
        </div>

        <div style={card}>
          <div style={h2}><TrendingDown size={15} style={{ verticalAlign: "-2px", color: C.red }} /> Churn risk</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Active · 7d", d.churn?.active_7d, C.greenDk], ["At-risk · 14–30d", d.churn?.at_risk_14d, C.gold], ["Dormant · 30d+", d.churn?.dormant_30d, C.red]].map(([l, n, col]) => (
              <div key={l} style={{ flex: 1, minWidth: 110, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: col }}>{n ?? 0}</div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ ...h2, marginTop: 16 }}>Subscriptions</div>
          {(d.subscriptions || []).map((s) => (
            <div key={s.tier} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13, color: C.soil }}>
              <span>{s.tier}</span><strong>{s.tenants}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={h2}>Retention cohorts — by signup month</div>
        {!(d.cohorts || []).length ? <div style={{ color: C.muted, fontSize: 13 }}>No cohort data yet.</div> : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead><tr>{["Cohort", "Signed up", "Still active (30d)", "Retention"].map((c) => <th key={c} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "5px 8px", borderBottom: `1px solid ${C.line}` }}>{c}</th>)}</tr></thead>
            <tbody>
              {d.cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{c.cohort}</td>
                  <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{c.signed_up}</td>
                  <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{c.still_active}</td>
                  <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ display: "inline-block", height: 8, width: Math.max(4, (c.retention_pct || 0) * 0.9), background: (c.retention_pct || 0) >= 50 ? C.green : C.gold, borderRadius: 4 }} />
                      <strong style={{ color: C.soil }}>{c.retention_pct ?? 0}%</strong>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <div style={h2}><Layers size={15} style={{ verticalAlign: "-2px" }} /> Feature adoption — last 30 days</div>
        {!d.analytics_live ? <div style={{ color: C.muted, fontSize: 13 }}>Event spine not deployed yet.</div>
          : !(d.feature_adoption || []).length ? <div style={{ color: C.muted, fontSize: 13 }}>No events yet — fills as members use the platform (I1 just shipped).</div>
          : (d.feature_adoption || []).map((a) => (
            <div key={`${a.pillar}-${a.event_type}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 12.5 }}>
              <span style={{ width: 70, color: C.muted, fontSize: 11 }}>{a.pillar}</span>
              <span style={{ flex: 1, color: C.soil }}>{a.event_type.replace(/_/g, " ")}</span>
              <span style={{ display: "inline-block", height: 8, width: Math.max(4, (a.users / adoptMax) * 120), background: C.green, borderRadius: 4 }} />
              <strong style={{ width: 50, textAlign: "right", color: C.soil }}>{a.users ?? 0}</strong>
              <span style={{ width: 60, textAlign: "right", color: C.muted, fontSize: 11 }}>{a.events} ev</span>
            </div>
          ))}
      </div>

      <div style={card}>
        <div style={h2}>Ecosystem</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(d.ecosystem || {}).map(([k, v]) => (
            <div key={k} style={{ flex: 1, minWidth: 100, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.soil }}>{v ?? 0}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>{(d.notes || []).join(" ")}</div>
    </AdminLayout>
  );
}

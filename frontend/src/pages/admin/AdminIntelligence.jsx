/**
 * AdminIntelligence — /admin/intelligence. The data moat, custodial view:
 * production / people / commerce / engagement computed from real tables,
 * snapshot-cached with freshness stamp, per-table CSV, and the Covenant
 * §3-bound external report (k≥10 suppression enforced in code).
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { RefreshCw, Download, Shield } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)", gold: "var(--amber)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };

async function downloadCsv(url, name) {
  const t = localStorage.getItem("tfos_access_token");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function Table({ rows, section, table }) {
  if (rows == null) return <div style={{ color: C.muted, fontSize: 12.5 }}>Not available on this deployment (source table missing) — honest gap, not zero.</div>;
  if (!rows.length) return <div style={{ color: C.muted, fontSize: 12.5 }}>No data yet — fills as the platform is used.</div>;
  const cols = Object.keys(rows[0]);
  const max = Math.max(...rows.map((r) => Number(r[cols[cols.length - 1]]) || 0), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "4px 8px", borderBottom: `1px solid ${C.line}` }}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 15).map((r, i) => (
            <tr key={i}>
              {cols.map((c, j) => (
                <td key={c} style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>
                  {j === cols.length - 1 && typeof r[c] === "number" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ display: "inline-block", height: 8, width: Math.max(4, (r[c] / max) * 90), background: C.green, borderRadius: 4 }} />
                      <strong>{r[c]}</strong>
                    </span>
                  ) : String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {section && (
        <button onClick={() => downloadCsv(`/api/v1/admin/intelligence/export.csv?section=${section}&table=${table}`, `intel-${section}-${table}.csv`)}
          style={{ marginTop: 8, display: "inline-flex", gap: 5, alignItems: "center", border: `1px solid ${C.line}`, background: "var(--paper)", color: C.soil, borderRadius: 8, padding: "5px 11px", fontSize: 11.5, cursor: "pointer" }}>
          <Download size={11} /> CSV
        </button>
      )}
    </div>
  );
}

function KV({ obj }) {
  if (!obj) return null;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ flex: 1, minWidth: 110, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: v == null ? C.muted : C.soil }}>{v == null ? "—" : v}</div>
          <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase" }}>{k.replace(/_/g, " ")}</div>
        </div>
      ))}
    </div>
  );
}

/* Slide-ready growth board — the M-PAiSA-style stat tiles, every number live. */
function GrowthBoard({ g }) {
  if (!g) return null;
  const k = g.kpis || {};
  const TILES = [
    [k.members_total, "Members"],
    [k.dau, "Daily active users"],
    [k.wau, "Weekly active users"],
    [k.mau, "Monthly active users"],
    [k.site_visits_30d, "Site visits · 30d"],
    [k.pwa_installs_total, "App installs (PWA)"],
    [k.active_sellers, "Active sellers"],
    [k.active_listings, "Products & services listed"],
    [k.signups_30d, "New signups · 30d"],
  ];
  return (
    <div style={{ background: "linear-gradient(120deg,var(--green-dk),var(--green))", borderRadius: 14, padding: 22, marginBottom: 16, color: "#fff" }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Growth KPIs — live, verifiable</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
        {TILES.map(([n, label]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{n == null ? "—" : Number(n).toLocaleString()}</div>
            <div style={{ fontSize: 10.5, opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.85, marginTop: 10 }}>
        {(g.notes || []).join(" ")}
      </div>
    </div>
  );
}

export default function AdminIntelligence() {
  const [data, setData] = useState(null);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (refresh) => {
    setBusy(true);
    getJSON(`/api/v1/admin/intelligence${refresh ? "?refresh=true" : ""}`)
      .then((r) => { setData(r.data); setCached(Boolean(r.cached)); })
      .catch(() => setData({ sections: {} }))
      .finally(() => setBusy(false));
  };
  useEffect(() => { load(false); }, []);

  const s = data?.sections || {};
  const h2 = { fontSize: 15, fontWeight: 800, color: C.soil, margin: "0 0 4px" };
  const src = (t) => <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 10 }}>Source: {t}</div>;

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Intelligence</h1>
        <span style={{ fontSize: 11.5, color: C.muted }}>
          {data?.computed_at ? `Snapshot ${new Date(data.computed_at).toLocaleString()}${cached ? " (cached)" : " (fresh)"}` : "Loading…"}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => load(true)} disabled={busy}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${C.line}`, background: "var(--paper)", color: C.soil, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <RefreshCw size={13} /> {busy ? "Computing…" : "Refresh"}
        </button>
        <button onClick={() => downloadCsv("/api/v1/admin/intelligence/external.csv", "teivaka-external-report.csv")}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${C.gold}`, background: "rgba(191,144,0,0.08)", color: "#8a6a00", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Shield size={13} /> External report (Covenant §3)
        </button>
      </div>

      <div style={{ ...card, background: C.cream, fontSize: 12, color: C.soil, display: "flex", gap: 8 }}>
        <Shield size={14} style={{ color: C.greenDk, flexShrink: 0, marginTop: 1 }} />
        <span>This view is <strong>custodial</strong> (Covenant §2) — founder eyes only. The External report applies Covenant §3 in code: region aggregates, k-anonymity floor of 10 (smaller regions are suppressed entirely), zero identifiers.</span>
      </div>

      {data == null ? <div style={card}>Loading…</div> : (
        <>
          <GrowthBoard g={s.growth} />
          {s.growth?.dau_trend != null && (
            <div style={card}>
              <h2 style={h2}>Daily active users — last 14 days</h2>
              <Table rows={s.growth.dau_trend} section="growth" table="dau_trend" />
            </div>
          )}
          <div style={card}>
            <h2 style={h2}>Production — what's grown and raised, where</h2>
            {src(s.production?.source)}
            <Table rows={s.production?.crops_by_region} section="production" table="crops_by_region" />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 240 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Farms by region</strong><Table rows={s.production?.farms_by_region} section="production" table="farms_by_region" /></div>
              <div style={{ flex: 1, minWidth: 240 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Poultry flocks by region</strong><Table rows={s.production?.poultry_flocks_by_region} section="production" table="poultry_flocks_by_region" /></div>
            </div>
          </div>

          <div style={card}>
            <h2 style={h2}>People — members, funnel, retention</h2>
            {src(s.people?.source)}
            <strong style={{ fontSize: 12.5, color: C.soil }}>Activation funnel</strong>
            <KV obj={s.people?.funnel} />
            <strong style={{ fontSize: 12.5, color: C.soil, display: "block", marginTop: 12 }}>Churn (inactive members)</strong>
            <KV obj={s.people?.churn} />
            <strong style={{ fontSize: 12.5, color: C.soil, display: "block", marginTop: 12 }}>Tier distribution</strong>
            <Table rows={s.people?.tier_distribution} section="people" table="tier_distribution" />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
              <div style={{ flex: 1.4, minWidth: 260 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Members by profession × country</strong><Table rows={s.people?.members_by_profession_country} section="people" table="members_by_profession_country" /></div>
              <div style={{ flex: 1, minWidth: 220 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Signups by month</strong><Table rows={s.people?.signups_by_month} section="people" table="signups_by_month" /></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
              Not captured yet (honest gap): {(s.people?.not_captured || []).join(", ")} — needs optional, consent-based profile fields before these can ever be reported.
            </div>
          </div>

          <div style={card}>
            <h2 style={h2}>Commerce — marketplace and prices</h2>
            {src(s.commerce?.source)}
            <Table rows={s.commerce?.listings_by_category_region} section="commerce" table="listings_by_category_region" />
            <div style={{ fontSize: 12.5, color: C.soil, marginTop: 8 }}>Market price reports submitted: <strong>{s.commerce?.market_price_reports ?? "—"}</strong></div>
          </div>

          <div style={card}>
            <h2 style={h2}>Engagement — community, classroom, TIS demand</h2>
            {src(s.engagement?.source)}
            <strong style={{ fontSize: 12.5, color: C.soil }}>Classroom</strong>
            <KV obj={s.engagement?.classroom} />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 240 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Posts by week</strong><Table rows={s.engagement?.posts_by_week} section="engagement" table="posts_by_week" /></div>
              <div style={{ flex: 1, minWidth: 240 }}><strong style={{ fontSize: 12.5, color: C.soil }}>Top groups</strong><Table rows={s.engagement?.top_groups} section="engagement" table="top_groups" /></div>
            </div>
            <strong style={{ fontSize: 12.5, color: C.soil, display: "block", marginTop: 14 }}>What farmers are asking TIS that the KB can't answer yet — the content priority queue</strong>
            <Table rows={s.engagement?.tis_top_unanswered} section="engagement" table="tis_top_unanswered" />
          </div>
        </>
      )}
    </AdminLayout>
  );
}

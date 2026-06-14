/** AdminWeatherIntelligence — /admin/intelligence/weather (I7).
 *  Backend wired, awaiting the Fiji Met Service feed. Honest-empty: shows the
 *  wiring is ready (regions + schema) and names the blocker — never fakes
 *  rainfall. Fills the moment external.weather_observations is loaded. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { CloudRain, Plug } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)", gold: "var(--amber)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };

function AwaitingBanner({ blocker }) {
  return (
    <div style={{ ...card, background: "#FBF4E2", border: `1px solid ${C.gold}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Plug size={18} style={{ color: C.gold, flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.soil }}>Backend wired · awaiting data feed</div>
        <p style={{ fontSize: 12.5, color: C.soil, margin: "3px 0 0", lineHeight: 1.5 }}>{blocker}</p>
      </div>
    </div>
  );
}

export default function AdminWeatherIntelligence() {
  const [d, setD] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/admin/intelligence/weather").then((r) => setD(r.data)).catch((e) => { if (e.status === 403) setDenied(true); setD({}); });
  }, []);

  if (denied) return <AdminLayout><div style={{ ...card, color: C.muted }}>Admin Command Center is founder-only.</div></AdminLayout>;
  if (d == null) return <AdminLayout><div style={card}>Loading…</div></AdminLayout>;

  const awaiting = d.status === "AWAITING_FEED";
  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <CloudRain size={20} style={{ color: C.greenDk }} />
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Weather Intelligence</h1>
        <span style={{ fontSize: 10, fontWeight: 800, background: awaiting ? C.gold : C.green, color: "#fff", borderRadius: 999, padding: "3px 9px", textTransform: "uppercase" }}>{awaiting ? "Awaiting feed" : "Live"}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
        Rainfall &amp; temperature per region, year-over-year — and the real prize: correlating weather against
        the pest/disease sightings you already collect (observed correlation, never inferred advice).
      </p>

      {awaiting && <AwaitingBanner blocker={d.blocker} />}

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 22 }}>
        <Stat label="Regions wired" value={d.regions_ready ?? "—"} />
        <Stat label="Observations" value={d.observations_total ?? 0} />
        <Stat label="Date range" value={d.date_range?.earliest ? `${d.date_range.earliest} → ${d.date_range.latest}` : "—"} small />
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Schema ready to receive</div>
        <div>
          {(d.schema_fields || []).map((f) => (
            <span key={f} style={{ display: "inline-block", background: C.cream, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 10px", marginRight: 6, marginBottom: 6, fontSize: 12, color: C.soil }}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>
          <span>Region</span><span>Observations · avg rainfall</span>
        </div>
        {(d.coverage || []).map((r) => (
          <div key={r.region} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${C.cream}`, fontSize: 13, color: C.soil }}>
            <span>{r.region}</span>
            <span style={{ color: r.observations ? C.soil : C.muted }}>
              {r.observations || 0}{r.avg_rainfall_mm != null ? ` · ${r.avg_rainfall_mm} mm` : ""}
            </span>
          </div>
        ))}
        {(!d.coverage || !d.coverage.length) && <div style={{ padding: 14, color: C.muted, fontSize: 12.5 }}>Region registry not loaded — run the deploy script.</div>}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, small }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: small ? 15 : 24, fontWeight: 800, color: C.greenDk, lineHeight: 1.2, marginTop: small ? 4 : 0 }}>{value}</div>
    </div>
  );
}

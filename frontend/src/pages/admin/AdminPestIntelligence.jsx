/** AdminPestIntelligence — /admin/intelligence/pests. The Pest & Disease dome
 *  (I5). Pressure maps from real farmer scouting events (tenant.field_events
 *  PEST_OBSERVE / DISEASE_OBSERVE), joined to region (I4) + crop. Honest-empty
 *  until farmers log sightings; soil chemistry is flagged as a pending gap. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Bug, Stethoscope } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)", gold: "var(--amber)", red: "var(--red)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const h2 = { fontSize: 15, fontWeight: 800, color: C.soil, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 7 };

function PressureTable({ rows, cols, heat }) {
  if (rows == null) return <div style={{ color: C.muted, fontSize: 12.5 }}>Not available on this deployment (source missing) — honest gap, not zero.</div>;
  if (!rows.length) return <div style={{ color: C.muted, fontSize: 12.5 }}>No sightings logged yet — fills as farmers scout their blocks.</div>;
  const max = Math.max(...rows.map((r) => Number(r.sightings) || 0), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.line}` }}>
            {cols.map((c) => <th key={c.key} style={{ padding: "6px 8px", fontWeight: 700 }}>{c.label}</th>)}
            <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Sightings</th>
            <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>{heat.label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.cream}` }}>
              {cols.map((c) => <td key={c.key} style={{ padding: "6px 8px", color: C.soil }}>{r[c.key] ?? "—"}</td>)}
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                <span style={{ display: "inline-block", minWidth: 26, textAlign: "right", fontWeight: 700, color: C.soil }}>{r.sightings}</span>
                <span style={{ display: "inline-block", width: Math.round((r.sightings / max) * 60) + 4, height: 8, background: C.green, borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }} />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: Number(r[heat.key]) > 0 ? C.red : C.muted, fontWeight: Number(r[heat.key]) > 0 ? 700 : 400 }}>{r[heat.key] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPestIntelligence() {
  const [d, setD] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/admin/intelligence/pests").then((r) => setD(r.data)).catch((e) => { if (e.status === 403) setDenied(true); setD({}); });
  }, []);

  if (denied) return <AdminLayout><div style={{ ...card, color: C.muted }}>Admin Command Center is founder-only.</div></AdminLayout>;
  if (d == null) return <AdminLayout><div style={card}>Loading…</div></AdminLayout>;

  const t = d.totals || {};
  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Bug size={20} style={{ color: C.greenDk }} />
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Pest &amp; Disease Intelligence</h1>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
        Pressure maps from real farmer scouting — what was seen, where, on which crop. Observations only, never inferred advice.
      </p>

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 22 }}>
        <Stat label="Pest sightings" value={t.pest_sightings ?? "—"} />
        <Stat label="Disease sightings" value={t.disease_sightings ?? "—"} />
        <Stat label="Last 30 days" value={t.sightings_30d ?? "—"} />
        <Stat label="Farms reporting" value={t.farms_reporting ?? "—"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="max-md:!grid-cols-1">
        <div style={card}>
          <div style={h2}><Bug size={15} style={{ color: C.greenDk }} /> Pest pressure</div>
          <PressureTable rows={d.pest_pressure} cols={[{ key: "pest", label: "Pest" }, { key: "crop", label: "Crop" }, { key: "region", label: "Region" }]} heat={{ key: "high_density", label: "High" }} />
        </div>
        <div style={card}>
          <div style={h2}><Stethoscope size={15} style={{ color: C.greenDk }} /> Disease pressure</div>
          <PressureTable rows={d.disease_pressure} cols={[{ key: "disease", label: "Disease" }, { key: "crop", label: "Crop" }, { key: "region", label: "Region" }]} heat={{ key: "severe", label: "Severe" }} />
        </div>
      </div>

      <div style={card}>
        <div style={h2}>Recent sightings</div>
        {d.recent == null ? (
          <div style={{ color: C.muted, fontSize: 12.5 }}>Not available on this deployment — honest gap.</div>
        ) : !d.recent.length ? (
          <div style={{ color: C.muted, fontSize: 12.5 }}>No sightings logged yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.recent.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.soil, borderBottom: `1px solid ${C.cream}`, paddingBottom: 6 }}>
                <span style={{ width: 78, color: C.muted }}>{r.date}</span>
                {r.kind === "pest" ? <Bug size={13} style={{ color: C.greenDk }} /> : <Stethoscope size={13} style={{ color: C.red }} />}
                <span style={{ fontWeight: 600 }}>{r.subject || "—"}</span>
                {r.level && <span style={{ fontSize: 10.5, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 8px", color: C.muted }}>{r.level}</span>}
                <span style={{ marginLeft: "auto", color: C.muted }}>{r.region}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...card, background: C.cream, fontSize: 12.5, color: C.soil }}>
        <strong>Soil chemistry (pH · N-P-K): pending.</strong> Lab-grade soil data needs the soil-testing pipeline (lab partnership).
        Farmers can already log what they <em>see</em> (soil-condition field observations); measured chemistry is an honest gap, not faked.
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

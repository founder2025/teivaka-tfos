/** AdminGeoIntelligence — /admin/intelligence/geo. The Geographic dome (I4).
 *  Recursive farm roll-up over shared.geo_regions (National -> Division ->
 *  Province) from real tenant.farms.region_id. Honest-empty until farms are
 *  classified; sub-province levels are flagged as pending external data. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Map as MapIcon, Globe } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E6E1D6", muted: "#8A8678", cream: "#F8F3E9", gold: "#BF9000" };
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const INDENT = { COUNTRY: 0, DIVISION: 1, PROVINCE: 2, DISTRICT: 3, TIKINA: 4, VILLAGE: 5 };

export default function AdminGeoIntelligence() {
  const [d, setD] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/admin/intelligence/geo").then((r) => setD(r.data)).catch((e) => { if (e.status === 403) setDenied(true); setD({}); });
  }, []);

  if (denied) return <AdminLayout><div style={{ ...card, color: C.muted }}>Admin Command Center is founder-only.</div></AdminLayout>;
  if (d == null) return <AdminLayout><div style={card}>Loading…</div></AdminLayout>;

  const tree = d.tree;
  const notLoaded = d.regions_loaded == null || tree == null;
  // Order the flat tree as a depth-first walk (parent then children) so the
  // indented rows read like a hierarchy.
  const ordered = [];
  if (Array.isArray(tree)) {
    const byParent = {};
    tree.forEach((r) => { (byParent[r.parent_region_id] || (byParent[r.parent_region_id] = [])).push(r); });
    const walk = (parent) => (byParent[parent] || [])
      .sort((a, b) => (b.farms - a.farms) || a.name.localeCompare(b.name))
      .forEach((r) => { ordered.push(r); walk(r.region_id); });
    walk(null);
  }
  const maxFarms = Math.max(...(ordered.map((r) => r.farms || 0)), 1);

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Globe size={20} style={{ color: C.greenDk }} />
        <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>Geographic Intelligence</h1>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
        Farm distribution rolled up the Fiji administrative hierarchy. Every count is real,
        computed from each farm’s region — no estimates.
      </p>

      {/* Coverage honesty strip */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
        <Stat label="Regions loaded" value={d.regions_loaded ?? "—"} />
        <Stat label="Farms classified" value={d.farms_classified ?? "—"} sub={`of ${d.farms_total ?? "—"} total`} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Levels</div>
          <div style={{ fontSize: 12.5, color: C.soil, marginTop: 2 }}>
            {(d.levels_loaded || []).map((l) => (
              <span key={l} style={{ display: "inline-block", background: C.cream, border: `1px solid ${C.line}`, borderRadius: 999, padding: "2px 9px", marginRight: 6, marginBottom: 4 }}>{l.toLowerCase()}</span>
            ))}
            {(d.levels_pending || []).map((l) => (
              <span key={l} title={d.pending_blocker} style={{ display: "inline-block", color: C.muted, border: `1px dashed ${C.line}`, borderRadius: 999, padding: "2px 9px", marginRight: 6, marginBottom: 4 }}>{l.toLowerCase()} · pending</span>
            ))}
          </div>
        </div>
      </div>

      {notLoaded ? (
        <div style={{ ...card, color: C.muted, fontSize: 13 }}>
          Geographic registry not loaded on this deployment yet — run the deploy script (migration 112). Honest gap, not zero.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span>Region</span><span>Farms · consented</span>
          </div>
          {ordered.map((r) => (
            <div key={r.region_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, paddingLeft: (INDENT[r.level] || 0) * 16 }}>
                {r.level === "COUNTRY" ? <MapIcon size={14} style={{ color: C.greenDk }} /> : null}
                <span style={{ fontSize: 13.5, fontWeight: r.level === "COUNTRY" ? 800 : r.level === "DIVISION" ? 700 : 500, color: C.soil }}>{r.name}</span>
                <span style={{ fontSize: 10, color: C.muted, textTransform: "lowercase" }}>{r.level}</span>
              </div>
              <div style={{ width: 110, background: C.cream, borderRadius: 6, height: 18, overflow: "hidden", border: `1px solid ${C.line}` }}>
                <div style={{ width: `${Math.max(r.farms ? 4 : 0, Math.round((r.farms / maxFarms) * 100))}%`, background: C.green, height: "100%" }} />
              </div>
              <strong style={{ width: 44, textAlign: "right", fontSize: 13, color: C.soil }}>{r.farms ?? 0}</strong>
              <span style={{ width: 70, textAlign: "right", fontSize: 11.5, color: C.muted }}>{r.consented_farms ?? 0} opt-in</span>
            </div>
          ))}
          {ordered.every((r) => !r.farms) && (
            <div style={{ padding: "12px 16px", color: C.muted, fontSize: 12.5 }}>
              No farms classified to a region yet — fills as farmers set their location. The hierarchy above is the live registry.
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.greenDk, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted }}>{sub}</div>}
    </div>
  );
}

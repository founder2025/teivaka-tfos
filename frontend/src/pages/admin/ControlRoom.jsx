/** Control Room — /admin/control-room. Founder/admin operations hub. Real links to the
 *  admin tools + a live system snapshot from /api/v1/admin/dashboard (honest-empty on fail). */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";
import { Users, FileText, BarChart3, Map, Settings as Cog, Flag, Cpu, Shield } from "lucide-react";

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F" };

const TOOLS = [
  { to: "/admin/users", label: "Users", desc: "Accounts, roles, suspensions", Icon: Users },
  { to: "/admin/content", label: "Content", desc: "Posts, KB, courses", Icon: FileText },
  { to: "/admin/moderation", label: "Moderation", desc: "Reported community posts", Icon: Flag },
  { to: "/admin/analytics", label: "Analytics", desc: "Platform metrics", Icon: BarChart3 },
  { to: "/admin/map", label: "Farm Map", desc: "Farms across the network", Icon: Map },
  { to: "/admin/task-engine", label: "Task Engine", desc: "Automation + decision rules", Icon: Cpu },
  { to: "/admin/settings", label: "Platform Settings", desc: "Global configuration", Icon: Cog },
];

export default function ControlRoom() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch("/api/v1/admin/dashboard", { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : null)).then((b) => setStats(b?.data ?? b ?? {})).catch(() => setStats({}));
  }, []);

  const S = stats || {};
  const metrics = [
    ["Tenants", S.tenant_count ?? S.tenants ?? "—"],
    ["Users", S.user_count ?? S.users ?? "—"],
    ["Farms", S.farm_count ?? S.farms ?? "—"],
    ["Active today", S.active_today ?? "—"],
  ];

  return (
    <AdminLayout>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 8, color: C.soil }}><Shield size={20} /> Control Room</h1>
        <p style={{ color: C.muted, marginTop: 4 }}>Founder operations hub — system snapshot and every admin tool in one place.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, margin: "16px 0" }}>
          {metrics.map(([k, v]) => (
            <div key={k} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{stats == null ? "…" : v}</div>
              <div style={{ fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>{k}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} style={{ textDecoration: "none", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "center", color: C.soil }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(106,168,79,0.12)", color: C.greenDk, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><t.Icon size={19} /></span>
              <span>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{t.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{t.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

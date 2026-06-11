/** AdminDashboard — /admin. The Platform Dashboard, rebuilt light-theme with
 *  REAL numbers only: live tiles from /admin/overview, clickable queue cards,
 *  real recent activity, real signup trend and top crops. The legacy
 *  placeholder dashboard ("connect community_posts to populate") is dead. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { Users, Activity, Sparkles, MessageSquare, Tractor, UserPlus, BadgeCheck, GraduationCap, CreditCard, Library } from "lucide-react";
import { getJSON } from "../../utils/api";

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E6E1D6", muted: "#8A8678", cream: "#F8F3E9", gold: "#BF9000" };
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 };

const TILES = [
  ["members_total", "Total members", Users],
  ["dau", "Active today", Activity],
  ["new_today", "New today", UserPlus],
  ["posts_today", "Posts today", MessageSquare],
  ["tis_queries_today", "TIS queries today", Sparkles],
  ["active_farms", "Active farms", Tractor],
];
const QUEUES = [
  ["verifications_pending", "Pending verifications", "/admin/verifications", BadgeCheck],
  ["author_requests_pending", "Author applications", "/admin/classroom", GraduationCap],
  ["tier_requests_pending", "Tier requests", "/admin/requests", CreditCard],
  ["library_submissions_pending", "Library submissions", "/admin/classroom", Library],
];

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    getJSON("/api/v1/admin/overview").then((r) => setD(r.data)).catch(() => setD({}));
  }, []);
  const t = d?.tiles || {}, q = d?.queues || {};
  return (
    <AdminLayout>
      <h1 style={{ margin: "0 0 14px", fontSize: 22, color: C.soil }}>Platform Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        {TILES.map(([k, label, Icon]) => (
          <div key={k} style={{ ...card, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(106,168,79,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={18} style={{ color: C.greenDk }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: d == null ? C.muted : C.soil }}>{d == null ? "…" : (t[k] ?? 0)}</div>
              <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 12, marginBottom: 14 }}>
        {QUEUES.map(([k, label, to, Icon]) => (
          <Link key={k} to={to} style={{ ...card, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", borderColor: (q[k] || 0) > 0 ? C.gold : C.line }}>
            <Icon size={16} style={{ color: (q[k] || 0) > 0 ? C.gold : C.muted }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.soil }}>{label}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: (q[k] || 0) > 0 ? C.gold : C.muted }}>{d == null ? "…" : (q[k] ?? 0)}</span>
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }} className="max-md:!grid-cols-1">
        <div style={card}>
          <strong style={{ color: C.soil, fontSize: 14 }}>Recent activity</strong>
          {d == null ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Loading…</div>
            : !(d.activity || []).length ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>No community activity yet — fills as members post.</div>
            : (d.activity || []).map((a, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.soil }}>
                <strong>{a.who}</strong> · <span style={{ color: C.muted }}>{new Date(a.created_at).toLocaleString()}</span>
                <div>{a.what}{(a.what || "").length >= 90 ? "…" : ""}</div>
              </div>
            ))}
        </div>
        <div>
          <div style={{ ...card, marginBottom: 14 }}>
            <strong style={{ color: C.soil, fontSize: 14 }}>Signups — last 30 days</strong>
            {d == null ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Loading…</div>
              : !(d.signup_trend || []).length ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>No signups in the last 30 days.</div>
              : (d.signup_trend || []).slice(0, 10).map((s) => (
                <div key={s.day} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: C.soil }}>
                  <span style={{ width: 80, color: C.muted }}>{s.day.slice(5)}</span>
                  <span style={{ display: "inline-block", height: 8, width: Math.max(6, Math.min(120, s.signups * 18)), background: C.green, borderRadius: 4 }} />
                  <strong>{s.signups}</strong>
                </div>
              ))}
          </div>
          <div style={card}>
            <strong style={{ color: C.soil, fontSize: 14 }}>Top crops — by cycles</strong>
            {d == null ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Loading…</div>
              : !(d.top_crops || []).length ? <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>No production cycles yet.</div>
              : (d.top_crops || []).map((cR) => (
                <div key={cR.crop} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5, color: C.soil }}>
                  <span style={{ flex: 1 }}>{cR.crop}</span>
                  <span style={{ display: "inline-block", height: 8, width: Math.max(6, Math.min(110, cR.cycles * 14)), background: C.gold, borderRadius: 4 }} />
                  <strong>{cR.cycles}</strong>
                </div>
              ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

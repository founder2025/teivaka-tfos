/**
 * NotificationsPage — the bell "View all" destination. Real notifications from
 * every source pillar, categorized, each deep-linking to its exact origin:
 *   Community like/react/reply/repost/share/mention → the post (/home?post=)
 *   Community follow                                 → the person (/u/:id)
 *   Tasks (open/overdue)                             → /farm/tasks
 *   TIS advisories                                   → /farm/tasks
 * No mock data; honest-empty when there's nothing.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ListChecks, Heart, MessageCircle, Repeat2, Share2, UserPlus, AtSign, Sparkles } from "lucide-react";
import { useTisSse } from "../../hooks/useTisSse";

const tok = () => localStorage.getItem("tfos_access_token");
const H = () => { const t = tok(); return t ? { Authorization: `Bearer ${t}` } : {}; };

const relTime = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const COMMUNITY_ICON = { LIKE: Heart, REACT: Heart, REPLY: MessageCircle, REPOST: Repeat2, SHARE: Share2, FOLLOW: UserPlus, MENTION: AtSign };
const COMMUNITY_VERB = { LIKE: "liked your post", REACT: "reacted to your post", REPLY: "replied to your post", REPOST: "reposted your post", SHARE: "shared a post with you", FOLLOW: "started following you", MENTION: "mentioned you" };

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { advisories } = useTisSse();
  const [community, setCommunity] = useState([]);
  const [taskN, setTaskN] = useState({ open: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all"); // all | community | tasks | advisories

  useEffect(() => {
    if (!tok()) return;
    (async () => {
      try {
        const [c, t] = await Promise.allSettled([
          fetch("/api/v1/community/notifications?limit=100", { headers: H() }).then((r) => r.json()),
          fetch("/api/v1/tasks/count", { headers: H() }).then((r) => r.json()),
        ]);
        if (c.status === "fulfilled") setCommunity(c.value?.data || []);
        if (t.status === "fulfilled" && t.value?.data) setTaskN({ open: t.value.data.open || 0, overdue: t.value.data.overdue || 0 });
        // opening the page = seen → clear the bell badge
        await fetch("/api/v1/community/notifications/read", { method: "POST", headers: H() }).catch(() => {});
      } finally { setLoading(false); }
    })();
  }, []);

  const openCommunity = (n) => {
    if (n.type === "FOLLOW" && n.actor_user_id) navigate(`/u/${n.actor_user_id}`);
    else if (n.post_id) navigate(`/home?post=${encodeURIComponent(n.post_id)}`);
    else navigate("/home");
  };

  const counts = useMemo(() => ({
    community: community.length,
    tasks: (taskN.open > 0 || taskN.overdue > 0) ? 1 : 0,
    advisories: advisories.length,
  }), [community, taskN, advisories]);
  const total = counts.community + counts.tasks + counts.advisories;

  const showCommunity = cat === "all" || cat === "community";
  const showTasks = cat === "all" || cat === "tasks";
  const showAdvisories = cat === "all" || cat === "advisories";

  const Row = ({ icon: Icon, color, title, sub, onClick, unread }) => (
    <button onClick={onClick} className="card" style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", marginBottom: 8, cursor: onClick ? "pointer" : "default", background: unread ? "rgba(106,168,79,0.06)" : "#fff", border: "1px solid var(--line)" }}>
      <span style={{ width: 34, height: 34, borderRadius: "50%", background: `${color}1A`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={17} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, color: "var(--soil)", lineHeight: 1.35 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{sub}</span>}
      </span>
    </button>
  );

  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 720 }}>
          <div className="page-header">
            <div>
              <h1>Notifications</h1>
              <p className="subtitle">Everything happening across your Teivaka — tap any item to go straight to it.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[["all", "All"], ["community", "Community"], ["tasks", "Tasks"], ["advisories", "Advisories"]].map(([id, label]) => (
              <button key={id} className={`btn btn-sm ${cat === id ? "btn-primary" : "btn-secondary"}`} onClick={() => setCat(id)}>{label}</button>
            ))}
          </div>

          {loading ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            : total === 0 ? (
              <div className="card" style={{ padding: 36, textAlign: "center", color: "var(--muted)" }}>
                <Bell size={44} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: "var(--soil)" }}>All caught up</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>New activity from the community, your tasks and TIS will appear here.</div>
              </div>
            ) : (
              <>
                {showTasks && (taskN.overdue > 0 || taskN.open > 0) && (
                  <Row icon={ListChecks} color={taskN.overdue > 0 ? "#D4442E" : "#3E7B1F"} unread
                    title={taskN.overdue > 0 ? <><strong>{taskN.overdue}</strong> task{taskN.overdue === 1 ? "" : "s"} overdue</> : <><strong>{taskN.open}</strong> open task{taskN.open === 1 ? "" : "s"}</>}
                    sub="Tap to review your tasks" onClick={() => navigate("/farm/tasks")} />
                )}

                {showAdvisories && advisories.map((a) => (
                  <Row key={a.advisory_id} icon={Sparkles} color="#BF9000" unread={!a.read_at}
                    title={a.title || a.preview} sub={`TIS advisory${a.priority ? ` · ${a.priority}` : ""} · ${relTime(a.created_at || a.read_at)}`}
                    onClick={() => navigate("/farm/tasks")} />
                ))}

                {showCommunity && community.map((n) => {
                  const Icon = COMMUNITY_ICON[n.type] || Bell;
                  const name = n.actor_name || "Someone";
                  return (
                    <Row key={n.notification_id} icon={Icon} color="#6AA84F" unread={!n.read_at}
                      title={n.body || <><strong>{name}</strong> {COMMUNITY_VERB[n.type] || (n.type || "").toLowerCase()}</>}
                      sub={relTime(n.created_at)} onClick={() => openCommunity(n)} />
                  );
                })}
              </>
            )}
        </div>
      </main>
    </div>
  );
}

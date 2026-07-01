/**
 * WhoToFollow — the graph-growth engine (Following F2).
 * Ranked, trust-aware follow suggestions (GET /community/suggested-follows).
 * Optimistic Follow; flat lucide icons; honest-empty → Directory.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, UserCheck } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import Avatar from "../ui/Avatar";
import TrustBadge from "../ui/TrustBadge";
import { personaLabel } from "../../utils/personas";

export default function WhoToFollow({ title = "Who to follow", limit = 6, onFollowed }) {
  const [people, setPeople] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getJSON(`/api/v1/community/suggested-follows?limit=${limit}`)
      .then((r) => setPeople(r.data || [])).catch(() => setPeople([]));
  }, [limit]);

  const follow = async (p) => {
    setPeople((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, _followed: true } : x))); // optimistic
    try {
      await send("POST", `/api/v1/community/follow/${p.user_id}`);
      onFollowed && onFollowed(p);
    } catch {
      setPeople((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, _followed: false } : x)));
    }
  };

  if (people == null) {
    return <div className="card" style={{ padding: 14 }}><div style={{ fontSize: 12.5, color: "var(--muted)" }}>Finding people…</div></div>;
  }
  if (people.length === 0) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--soil)", marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
          No suggestions yet — find people in{" "}
          <button onClick={() => navigate("/home/directory")} style={{ background: "none", border: "none", color: "var(--green-dk)", fontWeight: 600, cursor: "pointer", padding: 0 }}>Directory</button>.
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <UserPlus size={15} style={{ color: "var(--green-dk)" }} />
        <strong style={{ fontSize: 13, color: "var(--soil)" }}>{title}</strong>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {people.map((p) => (
          <div key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => navigate(`/u/${p.user_id}`)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
              <Avatar src={p.avatar_url} name={p.full_name} size={34} fontScale={0.4} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.full_name}</span>
                <TrustBadge level={p.trust_level} size={9} showLabel={false} />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{personaLabel(p.profession)}{p.country ? ` · ${p.country}` : ""}</div>
            </div>
            <button onClick={() => follow(p)} disabled={p._followed} className="btn btn-sm"
              style={{ flexShrink: 0, border: p._followed ? "1px solid var(--line)" : "1px solid var(--green)", background: p._followed ? "var(--paper)" : "var(--green)", color: p._followed ? "var(--muted)" : "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
              {p._followed ? <><UserCheck size={13} />Following</> : <><UserPlus size={13} />Follow</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

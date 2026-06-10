/** Team — /me/team. Real current members from /api/v1/me/team; invites land in workers phase. */
import { useEffect, useState } from "react";
import { Users, UserPlus } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

export default function Team() {
  const [team, setTeam] = useState(null);
  useEffect(() => { getJSON("/api/v1/me/team").then((r) => setTeam(r.data || [])).catch(() => setTeam([])); }, []);
  return (
    <MeShell title="Team" subtitle="People on your farm account.">
      {team == null ? <div style={{ color: C.muted, padding: 14 }}>Loading…</div>
        : team.map((m) => (
          <div key={m.user_id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(m.full_name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.soil, fontSize: 14 }}>{m.full_name}{m.is_you ? " (you)" : ""}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{m.email}</div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: C.greenDk, background: "rgba(106,168,79,0.12)", borderRadius: 6, padding: "3px 8px" }}>{m.role}</span>
          </div>
        ))}
      <div style={{ ...card, background: C.cream, color: C.muted, fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
        <UserPlus size={16} style={{ color: C.green, flexShrink: 0 }} />
        Inviting workers with scoped access lands in the upcoming workers phase. For now this lists everyone already on your account.
      </div>
    </MeShell>
  );
}

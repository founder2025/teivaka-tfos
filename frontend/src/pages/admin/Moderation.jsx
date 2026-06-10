/**
 * Moderation.jsx — /admin/moderation. Admin queue for reported community posts.
 * Lists open community.feed_flags; Hide removes the post for users, Dismiss clears
 * the report. Backed by GET /api/v1/community/flags + POST /flags/{id}/action.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";
import { Flag, EyeOff, Check, RotateCcw } from "lucide-react";

async function getJSON(u) { const r = await fetch(u, { headers: authHeader() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function act(u, body) {
  const r = await fetch(u, { method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };

export default function Moderation() {
  const [flags, setFlags] = useState(null);
  const [tab, setTab] = useState("OPEN");
  const load = () => { setFlags(null); getJSON(`/api/v1/community/flags?status_filter=${tab}`).then((r) => setFlags(r.data || [])).catch(() => setFlags([])); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const doAction = async (flag_id, action) => { await act(`/api/v1/community/flags/${flag_id}/action`, { action }); load(); };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 8, color: "#5C4033" }}><Flag size={20} /> Moderation</h1>
        <p style={{ color: "#8A7B6F", marginTop: 4 }}>Reported community posts. Hide removes a post for all users; Dismiss clears the report.</p>

        <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          {["OPEN", "ACTIONED", "DISMISSED", "ALL"].map((s) => (
            <button key={s} onClick={() => setTab(s)} style={{
              padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              border: tab === s ? "1px solid #6AA84F" : "1px solid #E8E2D4",
              background: tab === s ? "rgba(106,168,79,0.12)" : "#fff", color: tab === s ? "#3E7B1F" : "#8A7B6F",
            }}>{s}</button>
          ))}
        </div>

        {flags == null ? <p style={{ color: "#8A7B6F" }}>Loading…</p>
          : flags.length === 0 ? <p style={{ color: "#8A7B6F", padding: 20, background: "#F8F3E9", borderRadius: 8 }}>No {tab.toLowerCase()} reports. The queue is clear.</p>
          : flags.map((f) => (
            <div key={f.flag_id} style={{ background: "#fff", border: "1px solid #E8E2D4", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ background: "rgba(191,144,0,0.15)", color: "#BF9000", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, textTransform: "uppercase" }}>{f.reason}</span>
                <span style={{ fontSize: 11.5, color: "#8A7B6F" }}>reported by {f.reporter_name || "—"} · {fmt(f.created_at)}</span>
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#8A7B6F" }}>{f.status}{f.post_status === "hidden" ? " · post hidden" : ""}</span>
              </div>
              <div style={{ fontSize: 13.5, color: "#5C4033", background: "#F8F3E9", borderRadius: 6, padding: "8px 10px", fontStyle: "italic" }}>
                {f.post_body ? `"${f.post_body}"` : "(post unavailable / deleted)"}
              </div>
              <div style={{ fontSize: 11.5, color: "#8A7B6F", marginTop: 4 }}>by {f.author_name || "—"}</div>
              {f.status === "OPEN" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm" style={{ background: "#D4442E", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center" }} onClick={() => doAction(f.flag_id, "HIDE")}><EyeOff size={13} />Hide post</button>
                  <button className="btn btn-sm" style={{ background: "#fff", border: "1px solid #E8E2D4", padding: "6px 12px", borderRadius: 6, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center" }} onClick={() => doAction(f.flag_id, "DISMISS")}><Check size={13} />Dismiss</button>
                </div>
              )}
              {f.post_status === "hidden" && f.post_id && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" style={{ background: "#fff", border: "1px solid #E8E2D4", padding: "6px 12px", borderRadius: 6, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center" }} onClick={() => doAction(f.flag_id, "RESTORE")}><RotateCcw size={13} />Restore post</button>
                </div>
              )}
            </div>
          ))}
      </div>
    </AdminLayout>
  );
}

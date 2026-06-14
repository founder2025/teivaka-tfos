/**
 * NewChatModal — shared "new message" picker. Lists people you follow
 * (/people?following=true, searchable); calls onPick(person) on selection.
 * Used by both the full Messages inbox and the floating chat dropdown.
 */
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import Avatar from "../ui/Avatar";
import { personaLabel } from "../../utils/personas";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const C = { soil: "#5C4033", line: "#E8E2D4", muted: "#8A7B6F" };

export default function NewChatModal({ onClose, onPick }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => {
      getJSON(`${API}/people?following=true${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => setPeople(r.data || [])).catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "9vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", maxHeight: "72vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${C.line}` }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ color: C.soil }}>New message</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 12px" }}>
            <Search size={14} style={{ color: C.muted }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people you follow…" style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: C.soil }} />
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {people == null ? <div style={{ padding: 20, color: C.muted, fontSize: 13, textAlign: "center" }}>Loading…</div>
            : people.length === 0 ? <div style={{ padding: 24, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>{q ? "No matches." : <>You're not following anyone yet. <strong>Follow people in Home → Directory</strong> to start a conversation.</>}</div>
              : people.map((p) => (
                <button key={p.user_id} onClick={() => onPick(p)} style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", border: "none", borderBottom: `1px solid ${C.line}`, background: "#fff", cursor: "pointer", textAlign: "left" }}>
                  <Avatar src={p.avatar_url} name={p.full_name} size={38} fontScale={0.36} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.full_name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{personaLabel((p.account_type || "").toLowerCase())}</span>
                  </span>
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ChatDropdown — compact connections card under the top-bar message icon (mirrors
 * NotificationsPanel). Picking a person spawns a floating chat head (context.openWith).
 * Reads the live connection list written by ChatWidget's poll (context.conns).
 */
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { X, Volume2, VolumeX, Bell } from "lucide-react";
import { useChat } from "../../context/ChatContext";
import { enablePush } from "../../utils/push";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import Avatar from "../ui/Avatar";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", muted: "#8A7B6F", red: "#D4442E" };
const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
import { personaLabel } from "../../utils/personas";

export default function ChatDropdown() {
  const narrow = useIsNarrow(640);
  const chat = useChat();
  const ref = useRef(null);
  const [local, setLocal] = useState(chat.conns);
  const [muted, setMuted] = useState(localStorage.getItem("tfos_chat_muted") === "1");
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  useEffect(() => { setLocal(chat.conns); }, [chat.conns]);
  useEffect(() => { if (chat.conns == null) getJSON(`${API}/connections`).then((r) => setLocal(r.data || [])).catch(() => setLocal([])); }, []); // eslint-disable-line

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.("[data-chat-toggle]")) chat.setDropdownOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") chat.setDropdownOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [chat]);

  const pick = (c) => { chat.openWith(c); chat.setDropdownOpen(false); };
  const toggleMute = () => { const n = !muted; setMuted(n); localStorage.setItem("tfos_chat_muted", n ? "1" : "0"); };
  const enableAlerts = async () => {
    const res = await enablePush();
    setPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    if (!res.ok && res.reason === "vapid_not_configured") {
      // permission granted but server push not yet provisioned — in-tab toast+chime still work
      console.info("Web Push: server VAPID not configured yet; in-app alerts active.");
    }
  };

  return (
    <div ref={ref} role="dialog" aria-label="Messages"
      className={`z-50 rounded-lg shadow-xl ${narrow ? "fixed" : "absolute right-0 top-full mt-2"}`}
      style={{ ...(narrow ? { left: 8, right: 8, top: 60, width: "auto", maxHeight: "75vh" } : { width: 320, maxHeight: 460 }), background: "#fff", border: `1px solid ${C.line}`, color: C.soil, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Messages</span>
        <span style={{ display: "flex", gap: 2 }}>
          <button onClick={toggleMute} title={muted ? "Unmute" : "Mute"} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 32, height: 32 }}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <button onClick={() => chat.setDropdownOpen(false)} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 32, height: 32 }}><X size={18} /></button>
        </span>
      </div>
      {perm === "default" && (
        <button onClick={enableAlerts} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.line}`, background: "rgba(106,168,79,0.10)", color: C.greenDk, cursor: "pointer", padding: "9px 12px", fontSize: 11.5 }}>
          <Bell size={14} /><span><strong>Enable alerts</strong> — pop-up + sound on new messages.</span>
        </button>
      )}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {local == null ? <div style={{ color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>Loading…</div>
          : local.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12.5, padding: "26px 20px", textAlign: "center", lineHeight: 1.6 }}>
              No connections yet. <strong>Chat unlocks when you and another user follow each other</strong> — find people in Home → Directory.
            </div>
          ) : local.map((c) => (
            <button key={c.user_id} onClick={() => pick(c)}
              style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", minHeight: 44, border: "none", borderBottom: `1px solid ${C.line}`, background: c.unread > 0 ? "rgba(106,168,79,0.06)" : "#fff", cursor: "pointer", textAlign: "left" }}>
              <span style={{ position: "relative", flexShrink: 0 }}>
                <Avatar src={c.avatar_url} name={c.full_name} size={36} fontScale={0.36} />
                {c.online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: C.soil, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</span>
                  <span style={{ fontSize: 9.5, color: C.muted }}>{personaLabel(c.profession)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.online ? <span style={{ color: C.greenDk }}>● Active now</span> : c.last_body || "Tap to chat"}
                </div>
              </div>
              {c.unread > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.unread}</span>}
            </button>
          ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 12px", borderTop: `1px solid ${C.line}` }}>
        <NavLink to="/messages" onClick={() => chat.setDropdownOpen(false)}
          style={{ color: C.greenDk, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
          View all messages
        </NavLink>
      </div>
    </div>
  );
}

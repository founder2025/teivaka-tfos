/**
 * ChatWidget.jsx — global live chat (bottom-right), connection-gated.
 * Discovery/follow are open (Directory); chat + presence only work between MUTUAL
 * connections. Heartbeat presence (POST /presence/ping), connections list with live
 * dots + unread, 1:1 threads polled every 4s. Video call is a stub (Phase 3).
 * Backend: /api/v1/community/{presence,connections,chat}. Honest-empty until connected.
 */
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ArrowLeft, Send, Video, Circle } from "lucide-react";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const H = () => { const t = tok(); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };
async function getJSON(u) { const r = await fetch(u, { headers: H() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const r = await fetch(u, { method: "POST", headers: H(), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F" };
const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const PROF = { farmer: "Farmer", buyer: "Buyer", supplier: "Supplier", service_provider: "Service Provider", banker: "Banker", business: "Business", exporter: "Exporter", importer: "Importer" };
const ago = (iso) => { if (!iso) return ""; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; };

function Avatar({ name, online }) {
  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      <span style={{ width: 36, height: 36, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(name)}</span>
      {online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
    </span>
  );
}

function Thread({ conn, me, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const load = () => getJSON(`${API}/chat/with/${conn.user_id}`).then((r) => setMsgs(r.data?.messages || [])).catch(() => setMsgs([]));
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [conn.user_id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const body = text.trim(); setText("");
    try { await postJSON(`${API}/chat/with/${conn.user_id}`, { body }); await load(); } catch { setText(body); } finally { setBusy(false); }
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.soil }}><ArrowLeft size={18} /></button>
        <Avatar name={conn.full_name} online={conn.online} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: C.soil }}>{conn.full_name}</div>
          <div style={{ fontSize: 11, color: conn.online ? C.greenDk : C.muted }}>{conn.online ? "Active now" : conn.last_seen ? `Active ${ago(conn.last_seen)} ago` : "Offline"}</div>
        </div>
        <button title="Video call (coming soon)" onClick={() => alert("Video calling launches in a later phase.")} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><Video size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, background: C.cream }}>
        {msgs == null ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 20 }}>Loading…</div>
          : msgs.length === 0 ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 20 }}>Say hello to {conn.full_name.split(" ")[0]}.</div>
          : msgs.map((m) => (
            <div key={m.message_id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "78%", background: m.mine ? C.green : "#fff", color: m.mine ? "#fff" : C.soil, border: m.mine ? "none" : `1px solid ${C.line}`, borderRadius: 12, padding: "7px 11px", fontSize: 13, lineHeight: 1.4 }}>
              {m.body}
              <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 2, textAlign: "right" }}>{ago(m.created_at)}</div>
            </div>
          ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${C.line}` }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…"
          style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 18, padding: "8px 12px", fontSize: 13, outline: "none" }} />
        <button onClick={send} disabled={busy || !text.trim()} style={{ border: "none", background: C.green, color: "#fff", borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
      </div>
    </>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [conns, setConns] = useState(null);
  const [active, setActive] = useState(null);
  const [unread, setUnread] = useState(0);
  const me = (() => { try { return JSON.parse(localStorage.getItem("tfos_user") || "null"); } catch { return null; } })();

  // heartbeat presence
  useEffect(() => {
    if (!tok()) return undefined;
    const ping = () => postJSON(`${API}/presence/ping`).catch(() => {});
    ping();
    const id = setInterval(ping, 30000);
    return () => clearInterval(id);
  }, []);

  // unread badge
  useEffect(() => {
    if (!tok()) return undefined;
    const load = () => getJSON(`${API}/chat/unread-count`).then((r) => setUnread(r.data?.unread || 0)).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  const loadConns = () => getJSON(`${API}/connections`).then((r) => setConns(r.data || [])).catch(() => setConns([]));
  useEffect(() => { if (open) { loadConns(); const id = setInterval(loadConns, 15000); return () => clearInterval(id); } }, [open]);

  if (!tok()) return null;

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Chat"
        style={{ position: "fixed", right: 88, bottom: 24, width: 56, height: 56, borderRadius: "50%", background: C.green, color: "#fff", border: "3px solid #fff", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", cursor: "pointer", zIndex: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MessageCircle size={24} />
        {unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: "#D4442E", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div style={{ position: "fixed", right: 24, bottom: 88, width: 340, height: 460, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", zIndex: 48, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {active ? (
            <Thread conn={active} me={me} onBack={() => { setActive(null); loadConns(); }} />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
                <strong style={{ color: C.soil }}>Messages</strong>
                <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {conns == null ? <div style={{ color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>Loading…</div>
                  : conns.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 12.5, padding: "28px 22px", textAlign: "center", lineHeight: 1.6 }}>
                      No connections yet. <strong>Chat unlocks when you and another user follow each other.</strong> Find people in Home → Directory and Follow them; once they follow you back, they appear here.
                    </div>
                  ) : conns.map((c) => (
                    <button key={c.user_id} onClick={() => setActive(c)}
                      style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", border: "none", borderBottom: `1px solid ${C.line}`, background: c.unread > 0 ? "rgba(106,168,79,0.06)" : "#fff", cursor: "pointer", textAlign: "left" }}>
                      <Avatar name={c.full_name} online={c.online} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: C.soil, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</span>
                          <span style={{ fontSize: 9.5, color: C.muted }}>{PROF[c.profession] || c.profession}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.online ? <span style={{ color: C.greenDk }}>● Active now</span> : c.last_body || "Tap to chat"}
                        </div>
                      </div>
                      {c.unread > 0 && <span style={{ background: "#D4442E", color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.unread}</span>}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * ChatWidget.jsx — global live chat. Opened from the TOP-BAR message icon (state via
 * ChatContext), not a floating FAB — so it never collides with the TIS sparkles FAB.
 *  - Desktop: connections list anchored bottom-right (above the FABs) + Messenger-style
 *    chat windows stacked leftward (multiple at once).
 *  - Mobile: full-screen sheet (one conversation at a time, back button), composer above
 *    the keyboard (100dvh), above the bottom nav.
 *  - Live presence dots, pop-up toast + chime + OS notification, "Enable alerts" nudge.
 * Connection-gated (mutual follow). Frontend only.
 */
import { useEffect, useRef, useState } from "react";
import { X, Send, Video, Volume2, VolumeX, Minus, Bell, ArrowLeft } from "lucide-react";
import { useChat } from "../../context/ChatContext";

const API = "/api/v1/community";
const MAX_OPEN = 3;
const tok = () => localStorage.getItem("tfos_access_token");
const H = () => { const t = tok(); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };
async function getJSON(u) { const r = await fetch(u, { headers: H() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const r = await fetch(u, { method: "POST", headers: H(), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", red: "#D4442E" };
const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const PROF = { farmer: "Farmer", buyer: "Buyer", supplier: "Supplier", service_provider: "Service Provider", banker: "Banker", business: "Business", exporter: "Exporter", importer: "Importer" };
const ago = (iso) => { if (!iso) return ""; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; };

const isMuted = () => localStorage.getItem("tfos_chat_muted") === "1";
function chime() {
  if (isMuted()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.start(t0); o.stop(t0 + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch { /* no audio */ }
}
function osNotify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification(title, { body, icon: "/teivaka_logo.png" });
    }
  } catch { /* ignore */ }
}

function useIsMobile() {
  const get = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 900px)");
    const on = () => setM(mql.matches); on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return m;
}

function Avatar({ name, online, size = 36 }) {
  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      <span style={{ width: size, height: size, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: size * 0.36, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(name)}</span>
      {online && <span style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.3, height: size * 0.3, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
    </span>
  );
}

function ChatWindow({ conn, offset = 0, fullscreen = false, onClose, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [min, setMin] = useState(false);
  const endRef = useRef(null);
  const load = () => getJSON(`${API}/chat/with/${conn.user_id}`).then((r) => setMsgs(r.data?.messages || [])).catch(() => setMsgs([]));
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [conn.user_id]);
  useEffect(() => { if (!min) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, min]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); const body = text.trim(); setText("");
    try { await postJSON(`${API}/chat/with/${conn.user_id}`, { body }); await load(); } catch { setText(body); } finally { setBusy(false); }
  };
  const W = 300;
  const shell = fullscreen
    ? { position: "fixed", inset: 0, width: "100%", height: "100dvh", borderRadius: 0, zIndex: 1300 }
    : { position: "fixed", bottom: 24, right: 384 + offset * (W + 12), width: W, height: min ? 46 : 420, borderRadius: "12px 12px 0 0", zIndex: 49 };
  return (
    <div style={{ ...shell, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div onClick={() => !fullscreen && setMin((m) => !m)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.line}`, cursor: fullscreen ? "default" : "pointer", background: C.cream }}>
        {fullscreen && <button onClick={onBack} aria-label="Back" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.soil, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} /></button>}
        <Avatar name={conn.full_name} online={conn.online} size={fullscreen ? 34 : 28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conn.full_name}</div>
          <div style={{ fontSize: 11, color: conn.online ? C.greenDk : C.muted }}>{conn.online ? "Active now" : conn.last_seen ? `Active ${ago(conn.last_seen)} ago` : "Offline"}</div>
        </div>
        <button title="Video (coming soon)" onClick={(e) => { e.stopPropagation(); alert("Video calling launches in a later phase."); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><Video size={18} /></button>
        {!fullscreen && <button onClick={(e) => { e.stopPropagation(); setMin((m) => !m); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><Minus size={16} /></button>}
        {!fullscreen && <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={16} /></button>}
      </div>
      {!min && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: 6, background: C.cream, WebkitOverflowScrolling: "touch" }}>
            {msgs == null ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>Loading…</div>
              : msgs.length === 0 ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>Say hello to {conn.full_name.split(" ")[0]}.</div>
              : msgs.map((m) => (
                <div key={m.message_id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%", background: m.mine ? C.green : "#fff", color: m.mine ? "#fff" : C.soil, border: m.mine ? "none" : `1px solid ${C.line}`, borderRadius: 12, padding: "7px 11px", fontSize: 13, lineHeight: 1.4 }}>
                  {m.body}<div style={{ fontSize: 9, opacity: 0.7, marginTop: 2, textAlign: "right" }}>{ago(m.created_at)}</div>
                </div>
              ))}
            <div ref={endRef} />
          </div>
          <div style={{ display: "flex", gap: 8, padding: 8, borderTop: `1px solid ${C.line}`, background: "#fff" }}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message…" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 18, padding: "9px 13px", fontSize: 14, outline: "none" }} />
            <button onClick={send} disabled={busy || !text.trim()} style={{ border: "none", background: C.green, color: "#fff", borderRadius: "50%", width: 40, height: 40, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatWidget() {
  const chat = useChat();
  const mobile = useIsMobile();
  const [conns, setConns] = useState(null);
  const [openChats, setOpenChats] = useState([]);   // desktop windows
  const [mobileConn, setMobileConn] = useState(null); // mobile single conversation
  const [muted, setMuted] = useState(isMuted());
  const [toasts, setToasts] = useState([]);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const prevUnread = useRef(null);
  const openIds = useRef(new Set());

  useEffect(() => { openIds.current = new Set([...openChats.map((c) => c.user_id), ...(mobileConn ? [mobileConn.user_id] : [])]); }, [openChats, mobileConn]);

  // heartbeat presence
  useEffect(() => {
    if (!tok()) return undefined;
    const ping = () => postJSON(`${API}/presence/ping`).catch(() => {});
    ping(); const id = setInterval(ping, 30000); return () => clearInterval(id);
  }, []);

  // single poll → list + presence + unread (pushed to context) + new-message alerts
  useEffect(() => {
    if (!tok()) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const r = await getJSON(`${API}/connections`);
        if (!alive) return;
        const list = r.data || [];
        setConns(list);
        let total = 0; const next = {}; const fresh = [];
        for (const c of list) {
          const u = c.unread || 0; next[c.user_id] = u; total += u;
          const had = prevUnread.current ? (prevUnread.current[c.user_id] || 0) : 0;
          if (prevUnread.current && u > had && !openIds.current.has(c.user_id)) fresh.push(c);
        }
        if (fresh.length) {
          chime();
          fresh.forEach((c) => {
            osNotify(c.full_name, c.last_body || "New message");
            setToasts((t) => [...t, { id: `${c.user_id}-${Date.now()}`, conn: c }]);
          });
        }
        prevUnread.current = next;
        chat.setUnread(total);
      } catch { /* ignore */ }
    };
    poll(); const id = setInterval(poll, 9000); return () => { alive = false; clearInterval(id); };
    /* eslint-disable-next-line */
  }, []);

  // auto-dismiss toasts
  useEffect(() => {
    if (!toasts.length) return undefined;
    const id = setTimeout(() => setToasts((t) => t.slice(1)), 5000);
    return () => clearTimeout(id);
  }, [toasts]);

  // escape closes
  useEffect(() => {
    const onKey = (e) => { if (e.key !== "Escape") return; if (mobileConn) setMobileConn(null); else chat.setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* eslint-disable-next-line */
  }, [mobileConn]);

  const requestPerm = () => { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(setNotifPerm).catch(() => {}); };
  const enableAlerts = () => { if ("Notification" in window) Notification.requestPermission().then(setNotifPerm).catch(() => {}); };

  const openChat = (c) => {
    requestPerm();
    if (mobile) { setMobileConn(c); chat.setOpen(true); return; }
    setOpenChats((cur) => (cur.find((x) => x.user_id === c.user_id) ? cur : [...cur, c].slice(-MAX_OPEN)));
  };
  const closeChat = (uid) => setOpenChats((cur) => cur.filter((c) => c.user_id !== uid));
  const toggleMute = () => { const n = !muted; setMuted(n); localStorage.setItem("tfos_chat_muted", n ? "1" : "0"); };
  const loadConns = () => getJSON(`${API}/connections`).then((r) => setConns(r.data || [])).catch(() => setConns([]));
  useEffect(() => { if (chat.open) loadConns(); /* eslint-disable-next-line */ }, [chat.open]);

  if (!tok()) return null;

  const List = ({ fullscreen }) => (
    <div style={fullscreen
      ? { position: "fixed", inset: 0, width: "100%", height: "100dvh", background: "#fff", zIndex: 1300, display: "flex", flexDirection: "column" }
      : { position: "fixed", right: 24, bottom: 88, width: 320, height: 440, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", zIndex: 48, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
        <strong style={{ color: C.soil }}>Messages</strong>
        <span style={{ display: "flex", gap: 4 }}>
          <button onClick={toggleMute} title={muted ? "Unmute alerts" : "Mute alerts"} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button onClick={() => chat.setOpen(false)} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={20} /></button>
        </span>
      </div>
      {notifPerm === "default" && (
        <button onClick={enableAlerts} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.line}`, background: "rgba(106,168,79,0.10)", color: C.greenDk, cursor: "pointer", padding: "10px 14px", fontSize: 12 }}>
          <Bell size={15} /><span><strong>Enable alerts</strong> — pop-up + sound on new messages, even in another tab.</span>
        </button>
      )}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {conns == null ? <div style={{ color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>Loading…</div>
          : conns.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12.5, padding: "28px 22px", textAlign: "center", lineHeight: 1.6 }}>
              No connections yet. <strong>Chat unlocks when you and another user follow each other.</strong> Find people in Home → Directory and Follow them.
            </div>
          ) : conns.map((c) => (
            <button key={c.user_id} onClick={() => openChat(c)}
              style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", minHeight: 44, border: "none", borderBottom: `1px solid ${C.line}`, background: c.unread > 0 ? "rgba(106,168,79,0.06)" : "#fff", cursor: "pointer", textAlign: "left" }}>
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
              {c.unread > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.unread}</span>}
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <>
      {/* desktop: persistent chat windows */}
      {!mobile && openChats.map((c, i) => <ChatWindow key={c.user_id} conn={c} offset={i} onClose={() => closeChat(c.user_id)} />)}

      {/* panel (opened from the top-bar message icon) */}
      {chat.open && (mobile
        ? (mobileConn
            ? <ChatWindow conn={mobileConn} fullscreen onBack={() => setMobileConn(null)} />
            : <List fullscreen />)
        : <List fullscreen={false} />)}

      {/* pop-up toasts */}
      <div style={{ position: "fixed", top: 72, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, maxWidth: "calc(100vw - 32px)" }}>
        {toasts.map((t) => (
          <button key={t.id} onClick={() => { openChat(t.conn); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
            style={{ display: "flex", gap: 10, alignItems: "center", width: 300, maxWidth: "calc(100vw - 32px)", background: "#fff", border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.green}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
            <Avatar name={t.conn.full_name} online={t.conn.online} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.soil }}>{t.conn.full_name}</div>
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.conn.last_body || "sent you a message"}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * ChatWidget.jsx — floating chat heads (Messenger-style), opened from the top-bar
 * message dropdown (RightCluster → ChatDropdown → context.openWith).
 *  - Desktop: each open conversation is a free-floating window you DRAG anywhere by its
 *    header (mouse + touch), snap to the nearest edge on release, collapse to a round
 *    avatar bubble (also draggable), expand on click. Multiple at once. Position +
 *    collapsed state persist in localStorage across reloads.
 *  - Mobile (<=900px): tapping a person/bubble opens a full-screen sheet (100dvh) with a
 *    back button; collapsed bubbles still float.
 *  - Presence heartbeat, unread (single source → ChatContext), pop-up toast + chime +
 *    OS notification (when tab hidden) all kept. Connection-gated.
 *
 * NOTE: a web page cannot float on the OS desktop or run while the browser is closed —
 * that's native-only. Closed-tab delivery is handled separately via Web Push (pending
 * VAPID provisioning — see summary), not here.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, Video, Minus, ArrowLeft } from "lucide-react";
import { useChat } from "../../context/ChatContext";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const H = () => { const t = tok(); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };
async function getJSON(u) { const r = await fetch(u, { headers: H() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const r = await fetch(u, { method: "POST", headers: H(), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", red: "#D4442E" };
const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const ago = (iso) => { if (!iso) return ""; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; };
const isMuted = () => localStorage.getItem("tfos_chat_muted") === "1";

function chime() {
  if (isMuted()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = f; const t0 = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.start(t0); o.stop(t0 + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch { /* no audio */ }
}
function osNotify(title, body) { try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(title, { body, icon: "/teivaka_logo.png" }); } catch { /* ignore */ } }

function useIsMobile() {
  const get = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  const [m, setM] = useState(get);
  useEffect(() => { const mql = window.matchMedia("(max-width: 900px)"); const on = () => setM(mql.matches); on(); mql.addEventListener?.("change", on); return () => mql.removeEventListener?.("change", on); }, []);
  return m;
}

function Avatar({ name, online, size = 36 }) {
  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      <span style={{ width: size, height: size, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: size * 0.36, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(name)}</span>
      {online && <span style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
    </span>
  );
}

/* messages + composer (shared by desktop window and mobile sheet) */
function Convo({ conn, onActivity }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const load = useCallback(() => getJSON(`${API}/chat/with/${conn.user_id}`).then((r) => { setMsgs(r.data?.messages || []); onActivity?.(); }).catch(() => setMsgs([])), [conn.user_id, onActivity]);
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const send = async () => { if (!text.trim() || busy) return; setBusy(true); const b = text.trim(); setText(""); try { await postJSON(`${API}/chat/with/${conn.user_id}`, { body: b }); await load(); } catch { setText(b); } finally { setBusy(false); } };
  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6, background: C.cream, WebkitOverflowScrolling: "touch" }}>
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
  );
}

const posKey = (id) => `tfos_chat_pos_${id}`;
function loadState(id, index) {
  try { const s = JSON.parse(localStorage.getItem(posKey(id)) || "null"); if (s) return s; } catch { /* ignore */ }
  const w = 320; const x = Math.max(8, window.innerWidth - w - 16 - index * 30); const y = Math.max(64, window.innerHeight - 460 - 16);
  return { x, y, collapsed: false };
}
function saveState(id, s) { try { localStorage.setItem(posKey(id), JSON.stringify(s)); } catch { /* ignore */ } }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* desktop draggable window / bubble */
function FloatingChat({ conn, index, onClose }) {
  const [st, setSt] = useState(() => loadState(conn.user_id, index));
  const drag = useRef(null);
  const sizeRef = useRef({ w: 320, h: 440 });
  const persist = (next) => { setSt(next); saveState(conn.user_id, next); };

  const dims = () => (st.collapsed ? { w: 60, h: 60 } : { w: 320, h: 440 });

  const reclamp = useCallback(() => {
    const { w, h } = dims();
    setSt((s) => ({ ...s, x: clamp(s.x, 8, window.innerWidth - w - 8), y: clamp(s.y, 64, window.innerHeight - h - 8) }));
  }, [st.collapsed]); // eslint-disable-line
  useEffect(() => { window.addEventListener("resize", reclamp); return () => window.removeEventListener("resize", reclamp); }, [reclamp]);

  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    const { w, h } = dims();
    setSt((s) => ({ ...s, x: clamp(drag.current.px + dx, 8, window.innerWidth - w - 8), y: clamp(drag.current.py + dy, 64, window.innerHeight - h - 8) }));
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
    const d = drag.current; drag.current = null;
    const { w } = dims();
    setSt((s) => {
      const center = s.x + w / 2;
      const snapX = center < window.innerWidth / 2 ? 8 : window.innerWidth - w - 8;
      const next = { ...s, x: snapX };
      // tap on a collapsed bubble (no drag) → expand
      if (d && !d.moved && s.collapsed) { next.collapsed = false; next.x = clamp(next.x, 8, window.innerWidth - 320 - 8); }
      saveState(conn.user_id, next); return next;
    });
  };
  const onDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, px: st.x, py: st.y, moved: false };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    e.preventDefault();
  };

  if (st.collapsed) {
    return (
      <div onPointerDown={onDown} title={conn.full_name}
        style={{ position: "fixed", left: st.x, top: st.y, width: 60, height: 60, zIndex: 1200, cursor: "grab", touchAction: "none", userSelect: "none" }}>
        <Avatar name={conn.full_name} online={conn.online} size={60} />
        {conn.unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{conn.unread > 9 ? "9+" : conn.unread}</span>}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `1px solid ${C.line}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", left: st.x, top: st.y, width: 320, height: 440, zIndex: 1200, background: "#fff", border: `1px solid ${C.line}`, borderRadius: "12px 12px 8px 8px", boxShadow: "0 12px 34px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div onPointerDown={onDown} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderBottom: `1px solid ${C.line}`, background: C.cream, cursor: "grab", touchAction: "none", userSelect: "none" }}>
        <Avatar name={conn.full_name} online={conn.online} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conn.full_name}</div>
          <div style={{ fontSize: 10.5, color: conn.online ? C.greenDk : C.muted }}>{conn.online ? "Active now" : "Offline"}</div>
        </div>
        <button title="Video (coming soon)" onClick={(e) => { e.stopPropagation(); alert("Video calling launches in a later phase."); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><Video size={17} /></button>
        <button title="Collapse" onClick={(e) => { e.stopPropagation(); persist({ ...st, collapsed: true }); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><Minus size={17} /></button>
        <button title="Close" onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={17} /></button>
      </div>
      <Convo conn={conn} />
    </div>
  );
}

/* mobile: draggable bubble */
function MobileBubble({ conn, index, onTap, onClose }) {
  const [p, setP] = useState(() => { const s = loadState(conn.user_id, index); return { x: clamp(s.x, 8, window.innerWidth - 60 - 8), y: clamp(s.y, 64, window.innerHeight - 140) }; });
  const drag = useRef(null);
  const onMove = (e) => { if (!drag.current) return; const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy; if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true; setP({ x: clamp(drag.current.px + dx, 8, window.innerWidth - 68), y: clamp(drag.current.py + dy, 64, window.innerHeight - 140) }); };
  const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); const d = drag.current; drag.current = null; saveState(conn.user_id, { x: p.x, y: p.y, collapsed: true }); if (d && !d.moved) onTap(); };
  const onDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false }; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); e.preventDefault(); };
  return (
    <div onPointerDown={onDown} style={{ position: "fixed", left: p.x, top: p.y, width: 60, height: 60, zIndex: 1200, touchAction: "none", userSelect: "none" }}>
      <Avatar name={conn.full_name} online={conn.online} size={60} />
      {conn.unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{conn.unread > 9 ? "9+" : conn.unread}</span>}
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "#fff", border: `1px solid ${C.line}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
    </div>
  );
}

export default function ChatWidget() {
  const chat = useChat();
  const mobile = useIsMobile();
  const [mobileExpanded, setMobileExpanded] = useState(null); // user_id on mobile
  const [toasts, setToasts] = useState([]);
  const prevUnread = useRef(null);
  const openIds = useRef(new Set());

  useEffect(() => { openIds.current = new Set([...(chat.openChats || []).map((c) => c.user_id)]); }, [chat.openChats]);

  // heartbeat
  useEffect(() => { if (!tok()) return undefined; const ping = () => postJSON(`${API}/presence/ping`).catch(() => {}); ping(); const id = setInterval(ping, 30000); return () => clearInterval(id); }, []);

  // single poll → conns + unread (context) + alerts
  useEffect(() => {
    if (!tok()) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const r = await getJSON(`${API}/connections`); if (!alive) return;
        const list = r.data || []; chat.setConns(list);
        let total = 0; const next = {}; const fresh = [];
        for (const c of list) { const u = c.unread || 0; next[c.user_id] = u; total += u; const had = prevUnread.current ? (prevUnread.current[c.user_id] || 0) : 0; if (prevUnread.current && u > had && !(openIds.current.has(c.user_id))) fresh.push(c); }
        if (fresh.length) { chime(); fresh.forEach((c) => { osNotify(c.full_name, c.last_body || "New message"); setToasts((t) => [...t, { id: `${c.user_id}-${Date.now()}`, conn: c }]); }); }
        prevUnread.current = next; chat.setUnread(total);
      } catch { /* ignore */ }
    };
    poll(); const id = setInterval(poll, 9000); return () => { alive = false; clearInterval(id); };
    /* eslint-disable-next-line */
  }, []);

  useEffect(() => { if (!toasts.length) return undefined; const id = setTimeout(() => setToasts((t) => t.slice(1)), 5000); return () => clearTimeout(id); }, [toasts]);

  // merge live presence/unread into the open-chat snapshots
  const live = (c) => (chat.conns || []).find((x) => x.user_id === c.user_id) || c;

  if (!tok()) return null;

  return (
    <>
      {/* desktop: draggable windows/bubbles */}
      {!mobile && (chat.openChats || []).map((c, i) => (
        <FloatingChat key={c.user_id} conn={live(c)} index={i} onClose={() => chat.closeChat(c.user_id)} />
      ))}

      {/* mobile: bubbles + one full-screen sheet */}
      {mobile && (chat.openChats || []).map((c, i) => (
        c.user_id === mobileExpanded ? null : <MobileBubble key={c.user_id} conn={live(c)} index={i} onTap={() => setMobileExpanded(c.user_id)} onClose={() => chat.closeChat(c.user_id)} />
      ))}
      {mobile && mobileExpanded && (() => {
        const c = live((chat.openChats || []).find((x) => x.user_id === mobileExpanded) || { user_id: mobileExpanded });
        return (
          <div style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", zIndex: 1300, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.line}`, background: C.cream }}>
              <button onClick={() => setMobileExpanded(null)} aria-label="Back" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.soil, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} /></button>
              <Avatar name={c.full_name} online={c.online} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.soil }}>{c.full_name}</div>
                <div style={{ fontSize: 11, color: c.online ? C.greenDk : C.muted }}>{c.online ? "Active now" : "Offline"}</div>
              </div>
              <button title="Video (coming soon)" onClick={() => alert("Video calling launches in a later phase.")} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 40, height: 40 }}><Video size={18} /></button>
              <button onClick={() => { chat.closeChat(mobileExpanded); setMobileExpanded(null); }} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, width: 40, height: 40 }}><X size={20} /></button>
            </div>
            <Convo conn={c} />
          </div>
        );
      })()}

      {/* pop-up toasts */}
      <div style={{ position: "fixed", top: 72, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, maxWidth: "calc(100vw - 32px)" }}>
        {toasts.map((t) => (
          <button key={t.id} onClick={() => { chat.openWith(t.conn); if (mobile) setMobileExpanded(t.conn.user_id); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
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

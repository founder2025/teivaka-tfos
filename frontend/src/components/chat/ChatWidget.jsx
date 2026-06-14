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
import { X, Send, Minus, ArrowLeft, Image as ImageIcon, Mic, Square, MoreVertical, SmilePlus } from "lucide-react";
import { useChat } from "../../context/ChatContext";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const H = () => { const t = tok(); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };
async function getJSON(u) { const r = await fetch(u, { headers: H() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const r = await fetch(u, { method: "POST", headers: H(), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }
async function uploadFile(file) {
  // multipart → reuse the community /uploads endpoint (15 MB, image/video/audio).
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  const t = tok();
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch(`${API}/uploads`, { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", red: "#D4442E" };
const iconBtn = { border: "none", background: "transparent", cursor: "pointer", color: "#8A7B6F", padding: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const menuItem = { display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#5C4033", whiteSpace: "nowrap" };
const convMuteKey = (id) => `tfos_chat_mute_${id}`;
const isConvMuted = (id) => { try { return localStorage.getItem(convMuteKey(id)) === "1"; } catch { return false; } };
const setConvMuted = (id, v) => { try { if (v) localStorage.setItem(convMuteKey(id), "1"); else localStorage.removeItem(convMuteKey(id)); } catch { /* ignore */ } };
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

function Avatar({ name, src, online, size = 36 }) {
  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      {src
        ? <img src={src} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
        : <span style={{ width: size, height: size, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: size * 0.36, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(name)}</span>}
      {online && <span style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
    </span>
  );
}

/* messages + composer (shared by desktop window and mobile sheet) */
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const dayLabel = (iso) => {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export function Convo({ conn, onActivity }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [picker, setPicker] = useState(null); // message_id with an open reaction picker
  const [showJump, setShowJump] = useState(false); // "↓ new messages" pill while scrolled up
  const endRef = useRef(null);
  const scrollRef = useRef(null);      // the messages scroll container
  const atBottomRef = useRef(true);    // is the viewer at/near the bottom?
  const prevLenRef = useRef(null);     // message count last render (null = fresh convo)
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const lastTypingRef = useRef(0);
  const load = useCallback(() => getJSON(`${API}/chat/with/${conn.user_id}`).then((r) => { setMsgs(r.data?.messages || []); setOtherTyping(!!r.data?.other_typing); onActivity?.(); }).catch(() => setMsgs([])), [conn.user_id, onActivity]);
  // SSE drives the fast path; this is a slow safety-net poll only
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);
  // reload instantly when the SSE stream signals activity involving this peer
  useEffect(() => {
    const on = (e) => { const d = (e && e.detail) || {}; if (!d.from || d.from === conn.user_id) load(); };
    window.addEventListener("tfos-chat-refresh", on);
    return () => window.removeEventListener("tfos-chat-refresh", on);
  }, [load, conn.user_id]);

  const nearBottom = () => { const el = scrollRef.current; if (!el) return true; return el.scrollHeight - el.scrollTop - el.clientHeight < 90; };
  const onScroll = () => { atBottomRef.current = nearBottom(); if (atBottomRef.current && showJump) setShowJump(false); };
  const scrollToBottom = (behavior = "auto") => { endRef.current?.scrollIntoView({ behavior }); atBottomRef.current = true; setShowJump(false); };

  // switching conversation = treat next message load as a fresh open (jump to end)
  useEffect(() => { prevLenRef.current = null; setShowJump(false); }, [conn.user_id]);

  // Scroll policy: jump to bottom on first open OR when I send OR when I'm
  // already at the bottom; otherwise stay put and offer a "new messages" pill.
  useEffect(() => {
    if (msgs == null) return;
    const len = msgs.length;
    const prev = prevLenRef.current;
    const lastMine = len > 0 && msgs[len - 1].mine;
    if (prev == null) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (len > prev) {
      if (lastMine || atBottomRef.current) scrollToBottom("smooth");
      else setShowJump(true);
    }
    prevLenRef.current = len;
    /* eslint-disable-next-line */
  }, [msgs]);
  // keep pinned to the typing indicator only if already at the bottom
  useEffect(() => { if (otherTyping && atBottomRef.current) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [otherTyping]);
  // stop any in-flight recording if the convo unmounts
  useEffect(() => () => { try { recRef.current?.stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ } }, []);

  // tell the other side we're typing — throttled to once / 3s so it's keystroke-safe
  const notifyTyping = () => { const now = Date.now(); if (now - lastTypingRef.current > 3000) { lastTypingRef.current = now; postJSON(`${API}/chat/with/${conn.user_id}/typing`).catch(() => {}); } };

  const toggleReact = async (m, emoji) => {
    const mineEmoji = (m.reactions || []).find((r) => r.mine)?.emoji;
    try {
      if (mineEmoji === emoji) await fetch(`${API}/chat/message/${m.message_id}/react`, { method: "DELETE", headers: H() });
      else await fetch(`${API}/chat/message/${m.message_id}/react`, { method: "PUT", headers: H(), body: JSON.stringify({ emoji }) });
      setPicker(null); await load();
    } catch { /* ignore */ }
  };

  const send = async () => { if (!text.trim() || busy) return; setBusy(true); const b = text.trim(); setText(""); try { await postJSON(`${API}/chat/with/${conn.user_id}`, { body: b }); await load(); } catch { setText(b); } finally { setBusy(false); } };

  const sendMedia = async (file) => {
    if (!file || busy) return;
    const type = file.type || "";
    const kind = type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "image";
    setBusy(true);
    try {
      const up = await uploadFile(file);
      const url = up?.data?.url; if (!url) throw new Error("upload failed");
      await postJSON(`${API}/chat/with/${conn.user_id}`, { message_type: kind, media_url: url, media_meta: { name: up.data?.name, bytes: up.data?.bytes } });
      await load();
    } catch (e) {
      const s = String(e);
      alert("Couldn't send that file. " + (s.includes("413") ? "Max 15 MB." : s.includes("415") ? "Unsupported file type." : "Please try again."));
    } finally { setBusy(false); }
  };

  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendMedia(f); };

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { alert("Voice notes need a newer browser."); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const n = (err && err.name) || "";
      if (n === "NotAllowedError" || n === "SecurityError") alert("Microphone is blocked. Tap the lock icon in your browser's address bar → Permissions → allow Microphone, then try again.");
      else if (n === "NotFoundError" || n === "DevicesNotFoundError") alert("No microphone was found on this device.");
      else alert("Couldn't start the microphone. Please try again.");
      return;
    }
    if (typeof MediaRecorder === "undefined") { stream.getTracks().forEach((t) => t.stop()); alert("Voice recording isn't supported on this browser."); return; }
    // pick a container/codec this browser actually supports (Samsung Internet,
    // iOS Safari etc. reject the default) — otherwise new MediaRecorder throws
    let mime = "";
    for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
      try { if (window.MediaRecorder?.isTypeSupported?.(c)) { mime = c; break; } } catch { /* ignore */ }
    }
    let mr;
    try { mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch { stream.getTracks().forEach((t) => t.stop()); alert("Voice recording isn't supported on this browser."); return; }
    mr.stream = stream; chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const mtype = mr.mimeType || mime || "audio/webm";
      const ext = (mtype.includes("mp4") || mtype.includes("m4a")) ? "m4a" : mtype.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(chunksRef.current, { type: mtype });
      if (blob.size > 0) await sendMedia(new File([blob], `voice-${Date.now()}.${ext}`, { type: mtype }));
    };
    try { mr.start(); } catch { stream.getTracks().forEach((t) => t.stop()); alert("Couldn't start recording. Please try again."); return; }
    recRef.current = mr; setRecording(true);
  };
  const stopRec = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };

  const renderBody = (m) => {
    if (m.message_type === "image") return <img src={m.media_url} alt="photo" onClick={() => window.open(m.media_url, "_blank")} style={{ maxWidth: 200, maxHeight: 240, borderRadius: 10, display: "block", cursor: "pointer" }} />;
    if (m.message_type === "video") return <video src={m.media_url} controls style={{ maxWidth: 220, maxHeight: 240, borderRadius: 10, display: "block" }} />;
    if (m.message_type === "audio") return <audio src={m.media_url} controls style={{ width: 200, display: "block" }} />;
    return m.body;
  };

  // last of MY messages → drives the Seen/Sent receipt
  const lastMine = (msgs || []).filter((m) => m.mine).slice(-1)[0];
  let prevDay = null;

  return (
    <>
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6, background: C.cream, WebkitOverflowScrolling: "touch", position: "relative" }}>
        {msgs == null ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>Loading…</div>
          : msgs.length === 0 ? <div style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16 }}>Say hello to {conn.full_name.split(" ")[0]}.</div>
          : msgs.map((m) => {
            const isMedia = m.message_type && m.message_type !== "text";
            const reactions = m.reactions || [];
            const day = dayLabel(m.created_at); const showDay = day !== prevDay; prevDay = day;
            return (
              <div key={m.message_id} style={{ display: "contents" }}>
                {showDay && <div style={{ alignSelf: "center", fontSize: 10, color: C.muted, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "1px 10px", margin: "4px 0" }}>{day}</div>}
                <div style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%", display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexDirection: m.mine ? "row-reverse" : "row" }}>
                    <div style={{ background: isMedia ? "transparent" : (m.mine ? C.green : "#fff"), color: m.mine ? "#fff" : C.soil, border: (isMedia || m.mine) ? "none" : `1px solid ${C.line}`, borderRadius: 12, padding: isMedia ? 0 : "7px 11px", fontSize: 13, lineHeight: 1.4 }}>
                      {renderBody(m)}<div style={{ fontSize: 9, opacity: 0.7, marginTop: 2, textAlign: "right", color: isMedia ? C.muted : undefined }}>{ago(m.created_at)}</div>
                    </div>
                    <button onClick={() => setPicker(picker === m.message_id ? null : m.message_id)} title="React" style={{ ...iconBtn, padding: 2, opacity: 0.55 }}><SmilePlus size={15} /></button>
                  </div>
                  {picker === m.message_id && (
                    <div style={{ display: "flex", gap: 2, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.14)" }}>
                      {REACTIONS.map((e) => <button key={e} onClick={() => toggleReact(m, e)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, padding: 2, lineHeight: 1 }}>{e}</button>)}
                    </div>
                  )}
                  {reactions.length > 0 && (
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {reactions.map((r) => <button key={r.emoji} onClick={() => toggleReact(m, r.emoji)} title="Tap to toggle" style={{ border: `1px solid ${r.mine ? C.green : C.line}`, background: r.mine ? "#EAF5E5" : "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11, cursor: "pointer", lineHeight: "18px", color: C.soil }}>{r.emoji} {r.count}</button>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        {otherTyping && <div style={{ alignSelf: "flex-start", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "7px 12px", fontSize: 13, color: C.muted, fontStyle: "italic" }}>typing…</div>}
        {lastMine && <div style={{ alignSelf: "flex-end", fontSize: 10, color: C.muted, marginTop: -2 }}>{lastMine.read_at ? "Seen" : "Sent"}</div>}
        {showJump && (
          <button onClick={() => scrollToBottom("smooth")} style={{ position: "sticky", bottom: 6, alignSelf: "center", border: "none", background: C.green, color: "#fff", borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>↓ New messages</button>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${C.line}`, background: "#fff", alignItems: "center" }}>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onPick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy || recording} title="Send photo or video" style={iconBtn}><ImageIcon size={18} /></button>
        <button onClick={recording ? stopRec : startRec} disabled={busy} title={recording ? "Stop & send voice note" : "Record voice note"} style={{ ...iconBtn, color: recording ? C.red : C.muted }}>{recording ? <Square size={16} /> : <Mic size={18} />}</button>
        <input value={text} onChange={(e) => { setText(e.target.value); notifyTyping(); }} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={recording ? "Recording… tap ■ to send" : "Message…"} disabled={recording} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 18, padding: "9px 13px", fontSize: 14, outline: "none", background: recording ? C.cream : "#fff" }} />
        <button onClick={send} disabled={busy || recording || !text.trim()} style={{ border: "none", background: C.green, color: "#fff", borderRadius: "50%", width: 40, height: 40, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
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

/* kebab menu shared by desktop + mobile headers: mute / report / block */
function ConvoMenu({ conn, onClose }) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => isConvMuted(conn.user_id));
  const toggleMute = () => { const v = !muted; setConvMuted(conn.user_id, v); setMuted(v); setOpen(false); };
  const report = async () => {
    setOpen(false);
    const reason = window.prompt(`Report ${conn.full_name}. What's the problem?`);
    if (!reason || !reason.trim()) return;
    try { await fetch(`${API}/chat/report`, { method: "POST", headers: H(), body: JSON.stringify({ reported_user_id: conn.user_id, reason: reason.trim() }) }); window.alert("Thanks — our team will review this."); } catch { /* ignore */ }
  };
  const block = async () => {
    setOpen(false);
    if (!window.confirm(`Block ${conn.full_name}? They won't be able to message you, and this chat will close.`)) return;
    try { await fetch(`${API}/chat/block/${conn.user_id}`, { method: "POST", headers: H() }); } catch { /* ignore */ }
    onClose();
  };
  return (
    <div style={{ position: "relative", display: "flex" }} onPointerDown={(e) => e.stopPropagation()}>
      <button title="More" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted, display: "flex" }}><MoreVertical size={17} /></button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 1399 }} />
          <div style={{ position: "absolute", right: 0, top: 26, zIndex: 1400, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", minWidth: 160, overflow: "hidden" }}>
            <button onClick={toggleMute} style={menuItem}>{muted ? "Unmute notifications" : "Mute notifications"}</button>
            <button onClick={report} style={menuItem}>Report…</button>
            <button onClick={block} style={{ ...menuItem, color: C.red, borderTop: `1px solid ${C.line}` }}>Block</button>
          </div>
        </>
      )}
    </div>
  );
}

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
        <Avatar name={conn.full_name} src={conn.avatar_url} online={conn.online} size={60} />
        {conn.unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{conn.unread > 9 ? "9+" : conn.unread}</span>}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `1px solid ${C.line}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", left: st.x, top: st.y, width: 320, height: 440, zIndex: 1200, background: "#fff", border: `1px solid ${C.line}`, borderRadius: "12px 12px 8px 8px", boxShadow: "0 12px 34px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div onPointerDown={onDown} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderBottom: `1px solid ${C.line}`, background: C.cream, cursor: "grab", touchAction: "none", userSelect: "none" }}>
        <Avatar name={conn.full_name} src={conn.avatar_url} online={conn.online} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conn.full_name}</div>
          <div style={{ fontSize: 10.5, color: conn.online ? C.greenDk : C.muted }}>{conn.online ? "Active now" : "Offline"}</div>
        </div>
        <ConvoMenu conn={conn} onClose={onClose} />
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
      <Avatar name={conn.full_name} src={conn.avatar_url} online={conn.online} size={60} />
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

  // fetch connections → unread badges + new-message toasts/chime
  const pollConns = useCallback(async () => {
    if (!tok()) return;
    try {
      const r = await getJSON(`${API}/connections`);
      const list = r.data || []; chat.setConns(list);
      let total = 0; const next = {}; const fresh = [];
      for (const c of list) { const u = c.unread || 0; next[c.user_id] = u; total += u; const had = prevUnread.current ? (prevUnread.current[c.user_id] || 0) : 0; if (prevUnread.current && u > had && !(openIds.current.has(c.user_id)) && !isConvMuted(c.user_id)) fresh.push(c); }
      if (fresh.length) { chime(); fresh.forEach((c) => { osNotify(c.full_name, c.last_body || "New message"); setToasts((t) => [...t, { id: `${c.user_id}-${Date.now()}`, conn: c }]); }); }
      prevUnread.current = next; chat.setUnread(total);
    } catch { /* ignore */ }
  }, [chat]);

  // initial fetch + slow safety-net poll (SSE drives the fast path)
  useEffect(() => { if (!tok()) return undefined; pollConns(); const id = setInterval(pollConns, 25000); return () => clearInterval(id); }, [pollConns]);

  // SSE realtime: instant message / reaction / typing / seen, no busy polling
  useEffect(() => {
    if (!tok()) return undefined;
    let es;
    try { es = new EventSource(`${API}/chat/stream?access_token=${encodeURIComponent(tok())}`); }
    catch { return undefined; }
    es.addEventListener("chat", (e) => {
      pollConns();
      let detail = {}; try { detail = JSON.parse(e.data); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("tfos-chat-refresh", { detail }));
    });
    es.addEventListener("ping", () => {});
    return () => { try { es.close(); } catch { /* ignore */ } };
  }, [pollConns]);

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
              <ConvoMenu conn={c} onClose={() => { chat.closeChat(c.user_id); setMobileExpanded(null); }} />
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
            <Avatar name={t.conn.full_name} src={t.conn.avatar_url} online={t.conn.online} size={32} />
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

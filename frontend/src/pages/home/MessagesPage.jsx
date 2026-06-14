/**
 * MessagesPage — the full inbox (messages "View all" destination).
 * Left: everyone you're messaging (real /connections — avatar, last message,
 * unread, presence, search) + a "new message" compose. Right: the open
 * conversation, reusing the exact Convo from ChatWidget (text/photo/voice,
 * reactions, Seen, typing, SSE, fixed scroll). Header identity is clickable →
 * actions dropdown (profile / follow / mute / report / block).
 * Deep-link: /messages/:userId. Mobile/tablet: <820px single pane + back.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ArrowLeft, MessageCircle, PenSquare, X, ChevronDown, User, UserPlus, Ban, Flag, Volume2, VolumeX } from "lucide-react";
import { Convo } from "../../components/chat/ChatWidget";
import Avatar from "../../components/ui/Avatar";
import { personaLabel } from "../../utils/personas";
import { useIsNarrow } from "../../hooks/useIsNarrow";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function api(method, u, body) { const t = tok(); const r = await fetch(u, { method, headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }
const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", red: "#D4442E" };
const muteKey = (id) => `tfos_chat_mute_${id}`;

/* compose: pick someone you follow to start/open a conversation */
function ComposeModal({ onClose, onPick }) {
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "9vh 16px" }}>
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
                <button key={p.user_id} onClick={() => onPick(p.user_id)} style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", border: "none", borderBottom: `1px solid ${C.line}`, background: "#fff", cursor: "pointer", textAlign: "left" }}>
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

const MI = ({ icon: Icon, children, onClick, danger }) => (
  <button onClick={onClick} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: danger ? C.red : C.soil }}><Icon size={15} />{children}</button>
);

/* clickable header identity → actions dropdown */
function HeaderIdentity({ conn, onBlocked }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(muteKey(conn.user_id)) === "1");
  const close = () => setOpen(false);
  const profile = () => { close(); navigate(`/u/${conn.user_id}`); };
  const follow = async () => { close(); try { await api("POST", `${API}/follow/${conn.user_id}`); toast(`Following ${conn.full_name} ✓`, "success"); } catch { toast("Couldn't follow", "error"); } };
  const toggleMute = () => { const v = !muted; try { v ? localStorage.setItem(muteKey(conn.user_id), "1") : localStorage.removeItem(muteKey(conn.user_id)); } catch { /* ignore */ } setMuted(v); close(); };
  const report = async () => { close(); const reason = window.prompt(`Report ${conn.full_name}. What's the problem?`); if (!reason || !reason.trim()) return; try { await api("POST", `${API}/chat/report`, { reported_user_id: conn.user_id, reason: reason.trim() }); toast("Thanks — our team will review this.", "success"); } catch { toast("Couldn't send report", "error"); } };
  const block = async () => { close(); if (!window.confirm(`Block ${conn.full_name}? They won't be able to message you, and this chat will close.`)) return; try { await api("POST", `${API}/chat/block/${conn.user_id}`); onBlocked?.(); } catch { toast("Couldn't block", "error"); } };
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>
        <Avatar src={conn?.avatar_url} name={conn?.full_name} size={34} fontScale={0.36} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conn?.full_name}</span>
          <span style={{ display: "block", fontSize: 11, color: conn?.online ? C.greenDk : C.muted }}>{conn?.online ? "Active now" : "Offline"}</span>
        </span>
        <ChevronDown size={16} style={{ color: C.muted, flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1399 }} />
          <div style={{ position: "absolute", left: 0, top: 42, zIndex: 1400, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", minWidth: 190, overflow: "hidden" }}>
            <MI icon={User} onClick={profile}>View profile</MI>
            <MI icon={UserPlus} onClick={follow}>Follow</MI>
            <MI icon={muted ? Volume2 : VolumeX} onClick={toggleMute}>{muted ? "Unmute" : "Mute"} notifications</MI>
            <MI icon={Flag} onClick={report}>Report…</MI>
            <MI icon={Ban} onClick={block} danger>Block</MI>
          </div>
        </>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const narrow = useIsNarrow(820);
  const [conns, setConns] = useState(null);
  const [q, setQ] = useState("");
  const [compose, setCompose] = useState(false);

  const load = () => getJSON(`${API}/connections`).then((r) => setConns(r.data || [])).catch(() => setConns([]));
  useEffect(() => { load(); const id = setInterval(load, 25000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const on = () => load();
    window.addEventListener("tfos-chat-refresh", on);
    return () => window.removeEventListener("tfos-chat-refresh", on);
  }, []);

  const filtered = useMemo(() => {
    const list = conns || [];
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter((c) => (c.full_name || "").toLowerCase().includes(s));
  }, [conns, q]);

  const selected = useMemo(
    () => (conns || []).find((c) => c.user_id === userId) || (userId ? { user_id: userId, full_name: "Conversation", profession: "farmer" } : null),
    [conns, userId],
  );

  const Row = (c) => (
    <button key={c.user_id} onClick={() => navigate(`/messages/${c.user_id}`)}
      style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "11px 12px", border: "none", borderBottom: `1px solid ${C.line}`, background: c.user_id === userId ? "rgba(106,168,79,0.10)" : c.unread > 0 ? "rgba(106,168,79,0.05)" : "#fff", cursor: "pointer", textAlign: "left", flexShrink: 0 }}>
      <span style={{ position: "relative", flexShrink: 0 }}>
        <Avatar src={c.avatar_url} name={c.full_name} size={42} fontScale={0.36} />
        {c.online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: "50%", background: "#4caf50", border: "2px solid #fff" }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: c.unread > 0 ? 800 : 700, fontSize: 14, color: C.soil, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</span>
          <span style={{ fontSize: 9.5, color: C.muted, flexShrink: 0 }}>{personaLabel(c.profession)}</span>
        </span>
        <span style={{ display: "block", fontSize: 12, color: c.unread > 0 ? C.soil : C.muted, fontWeight: c.unread > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
          {c.online ? <span style={{ color: C.greenDk }}>● Active now</span> : c.last_body || "Tap to chat"}
        </span>
      </span>
      {c.unread > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread}</span>}
    </button>
  );

  const listPane = (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", borderRight: narrow ? "none" : `1px solid ${C.line}`, background: "#fff" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 12px", background: "#fff", flex: 1 }}>
          <Search size={14} style={{ color: C.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages…" style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: C.soil }} />
        </div>
        <button onClick={() => setCompose(true)} title="New message" style={{ border: "none", background: C.green, color: "#fff", borderRadius: "50%", width: 38, height: 38, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PenSquare size={17} /></button>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {conns == null ? <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>Loading…</div>
          : filtered.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: "28px 20px", textAlign: "center", lineHeight: 1.6 }}>
              {q ? "No matches." : <>No conversations yet. Tap <strong>New message</strong> to start one, or follow people in Home → Directory.</>}
            </div>
          ) : filtered.map(Row)}
      </div>
    </div>
  );

  const convPane = (withBack) => (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", minWidth: 0, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.line}`, background: C.cream, flexShrink: 0 }}>
        {withBack && <button onClick={() => navigate("/messages")} aria-label="Back" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.soil, display: "flex" }}><ArrowLeft size={20} /></button>}
        <HeaderIdentity conn={selected} onBlocked={() => navigate("/messages")} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Convo conn={selected} onActivity={load} />
      </div>
    </div>
  );

  const emptyState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.muted, gap: 10, height: "100%", background: "#fff" }}>
      <MessageCircle size={42} strokeWidth={1.5} style={{ opacity: 0.4 }} />
      <div style={{ fontSize: 14, color: C.soil, fontWeight: 700 }}>Select a conversation</div>
      <div style={{ fontSize: 13 }}>Pick someone on the left, or</div>
      <button className="btn btn-primary btn-sm" onClick={() => setCompose(true)}><PenSquare size={13} /> New message</button>
    </div>
  );

  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 1100, height: "calc(100dvh - 132px)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="page-header" style={{ flexShrink: 0 }}>
            <h1>Messages</h1>
            <p className="subtitle">Everyone you're talking to, in one place.</p>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", flex: 1, minHeight: 0, display: "flex" }}>
            {narrow ? (
              <div style={{ flex: 1, minHeight: 0 }}>{userId ? convPane(true) : listPane}</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", width: "100%", minHeight: 0 }}>
                {listPane}
                {selected ? convPane(false) : emptyState}
              </div>
            )}
          </div>
        </div>
      </main>
      {compose && <ComposeModal onClose={() => setCompose(false)} onPick={(id) => { setCompose(false); navigate(`/messages/${id}`); }} />}
    </div>
  );
}

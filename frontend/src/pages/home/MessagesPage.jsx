/**
 * MessagesPage — the full inbox (the messages "View all" destination).
 * Left: everyone you're messaging (real /connections — avatar, last message,
 * unread, presence, search). Right: the open conversation, reusing the exact
 * chat component from ChatWidget (text + photo/voice, reactions, Seen, typing,
 * realtime SSE) — no second chat implementation. Deep-link: /messages/:userId.
 *
 * Layout: a bounded-height (dvh) flex shell with min-height:0 on every flex
 * child so the user list AND the conversation history each scroll on their own
 * (Instagram-style). Desktop/tablet = two panes; mobile = one pane + back.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ArrowLeft, MessageCircle } from "lucide-react";
import { Convo } from "../../components/chat/ChatWidget";
import Avatar from "../../components/ui/Avatar";
import { personaLabel } from "../../utils/personas";
import { useIsNarrow } from "../../hooks/useIsNarrow";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", cream: "#F8F3E9", muted: "#8A7B6F", red: "#D4442E" };

export default function MessagesPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const narrow = useIsNarrow(820);   // <820 → single pane (phones, portrait tablets)
  const [conns, setConns] = useState(null);
  const [q, setQ] = useState("");

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
          <span style={{ fontWeight: 700, fontSize: 14, color: C.soil, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</span>
          <span style={{ fontSize: 9.5, color: C.muted, flexShrink: 0 }}>{personaLabel(c.profession)}</span>
        </span>
        <span style={{ display: "block", fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
          {c.online ? <span style={{ color: C.greenDk }}>● Active now</span> : c.last_body || "Tap to chat"}
        </span>
      </span>
      {c.unread > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 9, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread}</span>}
    </button>
  );

  // --- panes (each is a bounded flex column so its inner area scrolls) -------
  const listPane = (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", borderRight: narrow ? "none" : `1px solid ${C.line}`, background: "#fff" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 12px", background: "#fff" }}>
          <Search size={14} style={{ color: C.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages…" style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: C.soil }} />
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {conns == null ? <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>Loading…</div>
          : filtered.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: "28px 20px", textAlign: "center", lineHeight: 1.6 }}>
              {q ? "No matches." : <>No conversations yet. <strong>Chat unlocks when you follow someone (or they follow you)</strong> — find people in Home → Directory.</>}
            </div>
          ) : filtered.map(Row)}
      </div>
    </div>
  );

  const convPane = (withBack) => (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", minWidth: 0, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.cream, flexShrink: 0 }}>
        {withBack && <button onClick={() => navigate("/messages")} aria-label="Back" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.soil, display: "flex" }}><ArrowLeft size={20} /></button>}
        <Avatar src={selected?.avatar_url} name={selected?.full_name} size={34} fontScale={0.36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: C.soil, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected?.full_name}</div>
          <div style={{ fontSize: 11, color: selected?.online ? C.greenDk : C.muted }}>{selected?.online ? "Active now" : "Offline"}</div>
        </div>
      </div>
      {/* Convo's root is a fragment (scrolling messages area + composer); this
          bounded flex column makes its flex:1 message list scroll on its own. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Convo conn={selected} onActivity={load} />
      </div>
    </div>
  );

  const emptyState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.muted, gap: 8, height: "100%", background: "#fff" }}>
      <MessageCircle size={42} strokeWidth={1.5} style={{ opacity: 0.4 }} />
      <div style={{ fontSize: 14, color: C.soil, fontWeight: 700 }}>Select a conversation</div>
      <div style={{ fontSize: 13 }}>Pick someone on the left to start chatting.</div>
    </div>
  );

  return (
    <div className="tfp">
      <main className="main-content">
        {/* dvh-bounded column so inner panes can own their scroll on mobile too */}
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
    </div>
  );
}

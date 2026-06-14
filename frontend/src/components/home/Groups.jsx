/**
 * Groups.jsx — the Home pillar's connection engine. Public-read interest
 * groups (kava growers, poultry keepers, regions, exporters...): browse/search
 * grid, join/leave, create (verified members), and a group page whose feed IS
 * the real feed infrastructure (FeedView with a group filter — reactions,
 * replies, photos all work). Owner can edit/close; admin can feature.
 */
import { useEffect, useState, useRef } from "react";
import { Users, Plus, Search, X, Star, Lock as LockIcon, Settings as Cog, Send, Image as ImageIcon, Mic, Square } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import FeedView from "./FeedView";

const API = "/api/v1/community";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };
const gcDayLabel = (iso) => {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const gcTime = (iso) => { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const gcInitials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

const CATEGORIES = [["CROPS", "Crops"], ["LIVESTOCK", "Livestock"], ["FISHING", "Fishing"], ["EXPORT", "Export"],
  ["WOMEN_IN_AG", "Women in Ag"], ["YOUTH", "Youth"], ["EQUIPMENT", "Equipment"], ["REGION", "Region"], ["GENERAL", "General"]];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

const COVERS = [
  "linear-gradient(135deg,#6aa84f,#3d6b2e)", "linear-gradient(135deg,#bf9000,#7a5c00)",
  "linear-gradient(135deg,#2e7d6b,#174f42)", "linear-gradient(135deg,#7b5ea7,#4a3168)",
  "linear-gradient(135deg,#c0603a,#83402a)", "linear-gradient(135deg,#3a7ca5,#235a7c)",
];
function coverFor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

function GroupForm({ group, onClose, onDone }) {
  const editing = Boolean(group);
  const [f, setF] = useState({ name: group?.name || "", description: group?.description || "", category: group?.category || "GENERAL" });
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };
  const submit = async () => {
    try {
      if (editing) {
        await send("PATCH", `${API}/groups/${group.group_id}`, f);
        toast("Group updated ✓", "success");
        onDone();
      } else {
        const r = await send("POST", `${API}/groups`, f);
        toast("Group created — you're the owner ✓", "success");
        onDone(r.data.group_id);
      }
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>{editing ? "Edit group" : "Start a group"}</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div style={{ padding: 18 }}>
          <div className="cb-field-lbl">Group name *</div>
          <input autoFocus style={inp} value={f.name} placeholder="e.g. Kava Growers · Kadavu" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="cb-field-lbl">What's it about?</div>
          <textarea style={{ ...inp, minHeight: 70 }} value={f.description} placeholder="Who is this group for, and what do members share here?" onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="cb-field-lbl">Category</div>
          <select style={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            {editing && (
              <button className="btn btn-sm btn-secondary" style={{ marginRight: "auto", color: group.status === "CLOSED" ? "var(--green-dk)" : "#b3402e" }}
                onClick={async () => {
                  try {
                    await send("PATCH", `${API}/groups/${group.group_id}`, { status: group.status === "CLOSED" ? "ACTIVE" : "CLOSED" });
                    toast(group.status === "CLOSED" ? "Group reopened ✓" : "Group closed — no new joins or posts", "success");
                    onDone();
                  } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
                }}>
                {group.status === "CLOSED" ? "Reopen group" : "Close group"}
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={submit}>{editing ? "Save" : "Create group"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* realtime group chat room (members only). Reuses the SSE signal dispatched by
   ChatWidget; text + photo/video + voice notes. Reactions/receipts deferred. */
function GroupChat({ groupId }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const tokn = () => localStorage.getItem("tfos_access_token");

  const load = () => getJSON(`${API}/groups/${groupId}/chat`).then((r) => setMsgs(r.data || [])).catch(() => setMsgs([]));
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [groupId]);
  useEffect(() => {
    const on = (e) => { const d = (e && e.detail) || {}; if (d.type === "group_message" && d.group_id === groupId) load(); };
    window.addEventListener("tfos-chat-refresh", on);
    return () => window.removeEventListener("tfos-chat-refresh", on);
    /* eslint-disable-next-line */
  }, [groupId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => () => { try { recRef.current?.stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ } }, []);

  const doSend = async () => { if (!text.trim() || busy) return; setBusy(true); const b = text.trim(); setText(""); try { await send("POST", `${API}/groups/${groupId}/chat`, { body: b }); await load(); } catch { setText(b); } finally { setBusy(false); } };
  const upload = async (file) => { const fd = new FormData(); fd.append("file", file); const t = tokn(); const r = await fetch(`${API}/uploads`, { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const sendMedia = async (file) => {
    if (!file || busy) return;
    const ty = file.type || ""; const kind = ty.startsWith("video/") ? "video" : ty.startsWith("audio/") ? "audio" : "image";
    setBusy(true);
    try { const up = await upload(file); const url = up?.data?.url; if (!url) throw new Error("upload"); await send("POST", `${API}/groups/${groupId}/chat`, { message_type: kind, media_url: url, media_meta: { name: up.data?.name, bytes: up.data?.bytes } }); await load(); }
    catch (e) { const s = String(e); toast(s.includes("413") ? "File too large (max 15 MB)." : s.includes("415") ? "Unsupported file type." : "Couldn't send that file.", "error"); }
    finally { setBusy(false); }
  };
  const onPick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendMedia(f); };
  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast("Voice notes aren't supported on this device.", "error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); mr.stream = stream; chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const mtype = mr.mimeType || "audio/webm"; const ext = (mtype.includes("mp4") || mtype.includes("m4a")) ? "m4a" : mtype.includes("ogg") ? "ogg" : "webm"; const blob = new Blob(chunksRef.current, { type: mtype }); if (blob.size > 0) await sendMedia(new File([blob], `voice-${Date.now()}.${ext}`, { type: mtype })); };
      mr.start(); recRef.current = mr; setRecording(true);
    } catch { toast("Microphone permission is needed for voice notes.", "error"); }
  };
  const stopRec = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };
  const renderBody = (m) => {
    if (m.message_type === "image") return <img src={m.media_url} alt="photo" onClick={() => window.open(m.media_url, "_blank")} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 10, display: "block", cursor: "pointer" }} />;
    if (m.message_type === "video") return <video src={m.media_url} controls style={{ maxWidth: 240, maxHeight: 260, borderRadius: 10, display: "block" }} />;
    if (m.message_type === "audio") return <audio src={m.media_url} controls style={{ width: 220, display: "block" }} />;
    return m.body;
  };

  let prevDay = null;
  const ICONBTN = { border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", padding: 6, display: "flex", flexShrink: 0 };
  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: 460, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 7, background: "var(--cream)" }}>
        {msgs == null ? <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", marginTop: 18 }}>Loading…</div>
          : msgs.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", marginTop: 18 }}>No messages yet — say hello to the group.</div>
          : msgs.map((m) => {
            const isMedia = m.message_type && m.message_type !== "text";
            const day = gcDayLabel(m.created_at); const showDay = day !== prevDay; prevDay = day;
            return (
              <div key={m.message_id} style={{ display: "contents" }}>
                {showDay && <div style={{ alignSelf: "center", fontSize: 10.5, color: "var(--muted)", background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "1px 10px", margin: "4px 0" }}>{day}</div>}
                <div style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "82%", display: "flex", gap: 7, flexDirection: m.mine ? "row-reverse" : "row", alignItems: "flex-end" }}>
                  {!m.mine && (m.sender_avatar ? <img src={m.sender_avatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--green)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{gcInitials(m.sender_name)}</span>)}
                  <div style={{ background: isMedia ? "transparent" : (m.mine ? "var(--green)" : "#fff"), color: m.mine ? "#fff" : "var(--soil)", border: (isMedia || m.mine) ? "none" : "1px solid var(--line)", borderRadius: 12, padding: isMedia ? 0 : "7px 11px", fontSize: 13.5, lineHeight: 1.45 }}>
                    {!m.mine && !isMedia && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green-dk)", marginBottom: 2 }}>{m.sender_name}</div>}
                    {renderBody(m)}
                    <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 2, textAlign: "right", color: isMedia ? "var(--muted)" : undefined }}>{gcTime(m.created_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--line)", background: "#fff", alignItems: "center" }}>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onPick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy || recording} title="Send photo or video" style={ICONBTN}><ImageIcon size={18} /></button>
        <button onClick={recording ? stopRec : startRec} disabled={busy} title={recording ? "Stop & send voice note" : "Record voice note"} style={{ ...ICONBTN, color: recording ? "var(--danger,#D4442E)" : "var(--muted)" }}>{recording ? <Square size={16} /> : <Mic size={18} />}</button>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSend()} placeholder={recording ? "Recording… tap ■ to send" : "Message the group…"} disabled={recording} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 18, padding: "9px 13px", fontSize: 14, outline: "none" }} />
        <button onClick={doSend} disabled={busy || recording || !text.trim()} style={{ border: "none", background: "var(--green)", color: "#fff", borderRadius: "50%", width: 40, height: 40, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
      </div>
    </div>
  );
}

function GroupPage({ groupId, onBack }) {
  const [g, setG] = useState(null);
  const [members, setMembers] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("feed");
  const load = () => getJSON(`${API}/groups/${groupId}`).then((r) => setG(r.data))
    .catch((e) => { toast(`Couldn't open the group: ${e.userMessage || e.message}`, "error"); onBack(); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [groupId]);
  useEffect(() => {
    if (showMembers) getJSON(`${API}/groups/${groupId}/members`).then((r) => setMembers(r.data || [])).catch(() => setMembers([]));
  }, [showMembers, groupId]);
  const toggleJoin = async () => {
    try {
      await send(g.is_member ? "DELETE" : "POST", `${API}/groups/${groupId}/join`);
      toast(g.is_member ? "You left the group" : `Welcome to ${g.name} ✓`, "success");
      load();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  if (!g) return <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>;
  return (
    <div>
      <button className="cp-back" style={{ marginBottom: 10 }} onClick={onBack}>← All groups</button>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: 90, background: g.cover_url ? `url(${g.cover_url}) center/cover` : coverFor(g.name), position: "relative" }}>
          {g.featured && <span style={{ position: "absolute", left: 12, top: 12, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,0.4)", color: "#ffd76a", borderRadius: 999, padding: "4px 10px" }}>★ FEATURED</span>}
          {g.status === "CLOSED" && <span style={{ position: "absolute", right: 12, top: 12, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 999, padding: "4px 10px" }}><LockIcon size={9} /> CLOSED</span>}
        </div>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 17 }}>{g.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {CAT_LABEL[g.category] || g.category} · <button onClick={() => setShowMembers(!showMembers)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--green-dk)", fontWeight: 600, fontSize: 12 }}>{g.member_count} member{g.member_count === 1 ? "" : "s"}</button>
              {g.owner_name && <> · started by {g.owner_name}</>}
            </div>
            {g.description && <div style={{ fontSize: 13, color: "var(--soil)", marginTop: 4 }}>{g.description}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {g.can_manage && <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Cog size={13} />Edit</button>}
            {!g.is_owner && (
              <button className={`btn btn-sm ${g.is_member ? "btn-secondary" : "btn-primary"}`} onClick={toggleJoin}>
                {g.is_member ? "Joined ✓" : "Join group"}
              </button>
            )}
          </div>
        </div>
        {showMembers && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px" }}>
            {members == null ? <span style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</span>
              : members.map((m) => (
                <div key={m.user_id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13, color: "var(--soil)" }}>
                  <strong>{m.full_name}</strong>
                  {m.verified && <span style={{ color: "var(--green-dk)", fontSize: 11 }}>✓</span>}
                  <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{m.profession}{m.role === "OWNER" ? " · owner" : ""}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      {editing && (
        <GroupForm group={g} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load(); }} />
      )}
      {g.is_member || g.is_owner
        ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className={`btn btn-sm ${tab === "feed" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("feed")}>Feed</button>
              <button className={`btn btn-sm ${tab === "chat" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("chat")}>Chat</button>
            </div>
            {tab === "feed" ? <FeedView initialFilter={`group_${groupId}`} groupId={groupId} /> : <GroupChat groupId={groupId} />}
          </>
        )
        : (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 22 }}>
            <Users size={26} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 4 }}>Join to see the conversation</div>
            <div style={{ fontSize: 13 }}>Members share updates, questions and photos here. Joining is free and instant.</div>
          </div>
        )}
    </div>
  );
}

export default function Groups() {
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = (search) => {
    const p = new URLSearchParams();
    if (search?.trim()) p.set("search", search.trim());
    if (mine) p.set("mine", "true");
    getJSON(`${API}/groups?${p.toString()}`).then((r) => setGroups(r.data || []))
      .catch((e) => { setGroups([]); toast(`Couldn't load groups: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(q); /* eslint-disable-next-line */ }, [mine]);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);

  const join = async (g, e) => {
    e.stopPropagation();
    try {
      await send(g.is_member ? "DELETE" : "POST", `${API}/groups/${g.group_id}/join`);
      toast(g.is_member ? "You left the group" : `Welcome to ${g.name} ✓`, "success");
      load(q);
    } catch (err) { toast(`${err.userMessage || err.message}`, "error"); }
  };

  if (open) return <GroupPage groupId={open} onBack={() => { setOpen(null); load(q); }} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", background: "#fff" }}>
          <Search size={14} style={{ color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups — crops, regions, export…"
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: "var(--soil)" }} />
        </div>
        <button className={`btn btn-sm ${mine ? "btn-primary" : "btn-secondary"}`} onClick={() => setMine(!mine)}>My groups</button>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Plus size={13} />Start a group</button>
      </div>
      {groups == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : groups.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>
            <Users size={28} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 4 }}>{q || mine ? "No groups found" : "No groups yet"}</div>
            <div style={{ fontSize: 13 }}>{q || mine ? "Try a different search." : "Start the first one — your crop, your region, your people."}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {groups.map((g) => (
              <div key={g.group_id} className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setOpen(g.group_id)}>
                <div style={{ height: 70, background: g.cover_url ? `url(${g.cover_url}) center/cover` : coverFor(g.name), position: "relative" }}>
                  {g.featured && <span style={{ position: "absolute", left: 10, top: 10, fontSize: 10, fontWeight: 800, background: "rgba(0,0,0,0.4)", color: "#ffd76a", borderRadius: 999, padding: "3px 9px" }}><Star size={9} /> FEATURED</span>}
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 14.5 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "2px 0 8px" }}>
                    {CAT_LABEL[g.category] || g.category} · {g.member_count} member{g.member_count === 1 ? "" : "s"}{g.post_count > 0 ? ` · ${g.post_count} post${g.post_count === 1 ? "" : "s"}` : ""}
                  </div>
                  {g.description && <div style={{ fontSize: 12.5, color: "var(--soil)", marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.description}</div>}
                  <button className={`btn btn-sm ${g.is_member ? "btn-secondary" : "btn-primary"}`} onClick={(e) => g.is_owner ? e.stopPropagation() || setOpen(g.group_id) : join(g, e)} style={{ width: "100%" }}>
                    {g.is_owner ? "Your group — open" : g.is_member ? "Joined ✓" : "Join"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      {creating && <GroupForm onClose={() => setCreating(false)} onDone={(gid) => { setCreating(false); if (gid) setOpen(gid); load(q); }} />}
    </div>
  );
}

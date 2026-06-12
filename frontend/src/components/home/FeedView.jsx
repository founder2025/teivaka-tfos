/**
 * FeedView.jsx — the Home → Feed surface, fully wired to /api/v1/community/feed*.
 * Pixel-faithful to the sacred prototype's cm-* community feed (styles in
 * src/styles/feed.css, scoped under .tfp). Every action hits a real endpoint:
 * compose, like, emoji-react, reply (threaded), repost, share-to-user, save,
 * follow, topics, plus All/Following/Saved/Questions/Topics/profession filters
 * and Verified-only.
 */
import { useEffect, useRef, useState } from "react";
import {
  Image, MapPin, HelpCircle, Link2, Send, Star, MessageSquare, Repeat2, Share2,
  Smile, MoreHorizontal, Trash2, Check, BadgeCheck, X, Leaf, ShoppingBag, Gift,
  Droplet, BookOpen, Rss, UserPlus, UserCheck, Pencil, Flag,
  Pin, Archive, Copy, EyeOff, Ban, BellOff, Bookmark, Users, Camera, MailCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../utils/auth";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import Avatar from "../ui/Avatar";
import PhotoLightbox from "./PhotoLightbox";

const API = "/api/v1/community";
// Shared wrapper (utils/api): token auto-refresh on 401 + truthful error
// classification (err.kind network|server|client, err.userMessage).
import { getJSON, send } from "../../utils/api";
// Loud feedback — routed through the shell Toast. No silent failures.
const toast = (message, type) => {
  try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); }
  catch { /* noop */ }
};
const AUDIENCE_LABELS = { everyone: "Everyone", followers: "Your followers", farmer: "Farmers", buyer: "Buyers", banker: "Bankers", business: "Business", service_provider: "Service Providers" };

const REACTIONS = [
  { key: "strong_crop", label: "Strong crop", Icon: Leaf },
  { key: "good_harvest", label: "Good harvest", Icon: ShoppingBag },
  { key: "vinaka", label: "Vinaka", Icon: Gift },
  { key: "hoping_rain", label: "Hoping for rain", Icon: Droplet },
  { key: "learning", label: "Learning from this", Icon: BookOpen },
];
const RX = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));
import { personaLabel } from "../../utils/personas";
const FILTERS = [
  ["all", "All"], ["following", "Following"], ["questions", "Questions"],
  ["topics", "Topics"], ["profession_farmer", "Farmers"], ["profession_buyer", "Buyers"],
  ["profession_service_provider", "Service Providers"], ["profession_banker", "Bankers"], ["profession_business", "Business"],
];
const AUDIENCES = [
  ["everyone", "Everyone"], ["followers", "Your followers"], ["farmer", "Farmers"],
  ["buyer", "Buyers"], ["banker", "Bankers"], ["business", "Business"], ["service_provider", "Service Providers"],
];

const initials = (name) => (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const fmtTime = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
function renderBody(text) {
  // highlight @[Name] mentions
  const parts = String(text || "").split(/(@\[[^\]]+\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^@\[([^\]]+)\]$/);
    if (m) return <span className="cm-mention" key={i}>@{m[1]}</span>;
    return <span key={i}>{p}</span>;
  });
}

/* ---------------- small modals ---------------- */
function Overlay({ title, onClose, children, foot, maxWidth = 440 }) {
  return (
    // "show" is required: prototype.css hides .overlay-backdrop without it
    // (display:none) — omitting it made every composer modal open invisibly.
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span className="overlay-title">{title}</span><button className="overlay-close" onClick={onClose}><X size={16} /></button></div>
        <div className="overlay-body">{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}
const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box" };

function PlaceModal({ onPick, onClose }) {
  const [v, setV] = useState("");
  const [gps, setGps] = useState(null);        // null=asking, []=unavailable, [...names]
  const [farms, setFarms] = useState([]);
  // Real suggestions only: GPS reverse-geocode (server proxy — CSP-safe) + my farms.
  useEffect(() => {
    getJSON("/api/v1/farms").then((r) => {
      const list = r?.data?.farms || r?.data || [];
      setFarms([...new Set(list.flatMap((f) => [f.farm_name, f.location_island]).filter(Boolean))].slice(0, 4));
    }).catch(() => setFarms([]));
    if (!navigator.geolocation) { setGps([]); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        getJSON(`/api/v1/geo/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          .then((r) => setGps(r?.data?.places || []))
          .catch(() => setGps([]));
      },
      () => setGps([]), // permission denied / unavailable — fall back to typing
      { timeout: 8000, maximumAge: 600000 },
    );
  }, []);
  const chips = [...new Set([...(gps || []), ...farms])];
  return (
    <Overlay title="Tag a place" onClose={onClose}
      foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => v.trim() && onPick(v.trim())}>Add place</button></>}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
        {gps == null ? "Finding places near you…" : chips.length ? "Near you and your farms — tap one, or type a place." : "Location unavailable — type a place."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {chips.map((c) => <button key={c} className="cm-tool-btn" style={{ minHeight: 40 }} onClick={() => onPick(c)}><MapPin size={11} />{c}</button>)}
      </div>
      <input style={inp} placeholder="Or type a place — village, town, block" maxLength={60} value={v} onChange={(e) => setV(e.target.value)} />
    </Overlay>
  );
}
function LinkRecordModal({ onPick, onClose }) {
  const [v, setV] = useState("");
  return (
    <Overlay title="Link a record" onClose={onClose}
      foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => v.trim() && onPick(v.trim())}>Attach</button></>}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>Attach a verifiable audit record by its hash (from a Bank Evidence PDF or /verify). It shows as a tappable Linked record on your post.</p>
      <input style={inp} placeholder="Audit hash, e.g. c1a4b7e2d9f3" value={v} onChange={(e) => setV(e.target.value)} />
    </Overlay>
  );
}
function ShareModal({ post, onClose, onShared }) {
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => { getJSON(`${API}/people${q ? `?search=${encodeURIComponent(q)}` : ""}`).then((r) => setPeople(r.data || [])).catch(() => setPeople([])); }, [q]);
  const submit = async () => {
    if (!sel) { setErr("Pick someone to share with."); return; }
    setBusy(true); setErr(null);
    try { await send("POST", `${API}/feed/${post.post_id}/share`, { to_user_id: sel.user_id, note }); onShared(sel); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Overlay title="Share with a person" onClose={onClose}
      foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !sel} onClick={submit}>{busy ? "Sharing…" : "Share"}</button></>}>
      {err && <div className="cm-empty" style={{ color: "#b3261e", marginBottom: 8 }}>{err}</div>}
      <input style={{ ...inp, marginBottom: 10 }} placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {people == null ? <div className="cm-empty">Loading…</div> :
          people.length === 0 ? <div className="cm-empty">No people found.</div> :
            people.map((p) => (
              <button key={p.user_id} className="cm-menu-item" style={{ borderColor: sel?.user_id === p.user_id ? "var(--green)" : "var(--line)" }} onClick={() => setSel(p)}>
                <Avatar src={p.avatar_url} name={p.full_name} size={30} fontScale={0.4} />
                <span style={{ flex: 1 }}>{p.full_name} {p.verified && <BadgeCheck size={12} className="cm-verified-tick" />}</span>
                <span className="cm-prof-badge">{personaLabel(p.profession)}</span>
              </button>
            ))}
      </div>
      <textarea style={{ ...inp, marginTop: 10, minHeight: 50 }} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Overlay>
  );
}
function TopicsModal({ onClose }) {
  const [topics, setTopics] = useState(null);
  const [v, setV] = useState("");
  const load = () => getJSON(`${API}/topics`).then((r) => setTopics(r.data || [])).catch(() => setTopics([]));
  useEffect(() => { load(); }, []);
  const add = async () => { if (!v.trim()) return; await send("POST", `${API}/topics`, { topic: v.trim() }); setV(""); load(); };
  const del = async (t) => { await send("DELETE", `${API}/topics/${encodeURIComponent(t)}`); load(); };
  return (
    <Overlay title="Manage topics" onClose={onClose} foot={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>Follow crop/topic tags. The <strong>Topics</strong> filter shows posts tagged with these.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={inp} placeholder="e.g. cassava, eggplant, kava" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" onClick={add}>Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {topics == null ? "Loading…" : topics.length === 0 ? <span style={{ color: "var(--muted)", fontSize: 12.5 }}>No topics followed yet.</span> :
          topics.map((t) => <span key={t} className="cm-draft-tag">{t}<button className="cm-draft-tag-x" onClick={() => del(t)}><X size={10} /></button></span>)}
      </div>
    </Overlay>
  );
}

/* ---------------- composer ---------------- */
// Upload pipeline: client-side compression + XHR progress (utils/imageCompress).
// A 9 MB phone photo becomes ~300 KB before it touches the wire.
import { uploadMedia } from "../../utils/imageCompress";

function MentionPicker({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);
  // Mention set = people YOU follow (incl. mutual connections) — not strangers.
  useEffect(() => { const id = setTimeout(() => getJSON(`${API}/people?following=true${q ? `&search=${encodeURIComponent(q)}` : ""}`).then((r) => setPeople(r.data || [])).catch(() => setPeople([])), 200); return () => clearTimeout(id); }, [q]);
  return (
    <Overlay title="Mention someone you follow" onClose={onClose}>
      <input style={{ ...inp, marginBottom: 10 }} placeholder="Search people you follow…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {people == null ? <div className="cm-empty">Loading…</div> : people.length === 0 ? <div className="cm-empty">{q ? "No one you follow matches that." : "You can mention people once you follow them — find people in Directory."}</div> :
          people.map((p) => (
            <button key={p.user_id} className="cm-menu-item" onClick={() => onPick(p.full_name)}>
              <Avatar src={p.avatar_url} name={p.full_name} size={30} fontScale={0.4} />
              <span style={{ flex: 1 }}>{p.full_name}</span>
              <span className="cm-prof-badge">{personaLabel(p.profession)}</span>
            </button>
          ))}
      </div>
    </Overlay>
  );
}

const BLANK_DRAFT = { body: "", audience: "everyone", photos: [], location: null, vertical: "", isQuestion: false, link: null, reach: "LOCAL", kind: "POST" };
const DRAFT_KEY = "tfos_feed_draft";
const BODY_MAX = 2000; // backend CHECK caps body at 2000 chars
const EMOJIS = ["🌱", "🌾", "🍌", "🥥", "🍠", "🌶️", "🍆", "🥬", "🐔", "🐐", "🐄", "🐖", "🐝", "🐟", "🚜", "🌧️", "☀️", "🌊", "💪", "🙏", "❤️", "😀", "😂", "👍", "🎉", "✅", "🔥", "🇫🇯"];

function Composer({ me, onPosted, groupId }) {
  // Draft autosave: restore an unfinished post (text + already-uploaded photos)
  // if the user navigated away mid-compose.
  const [draft, setDraft] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (d && (d.body || d.photos?.length)) return { ...BLANK_DRAFT, ...d }; } catch { /* noop */ }
    return BLANK_DRAFT;
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadNote, setUploadNote] = useState(""); // "photo 2 of 3"
  const [modal, setModal] = useState(null);
  const [canGlobal, setCanGlobal] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const [resending, setResending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [myEmail, setMyEmail] = useState(me?.email || "");
  const fileRef = useRef();
  const cameraRef = useRef();
  const narrow = useIsNarrow(760);
  useEffect(() => {
    getJSON("/api/v1/auth/me").then((r) => {
      const d = r?.data ?? r;
      const prof = (d?.profession || "").toLowerCase();
      setCanGlobal(prof === "exporter" || prof === "importer");
      if (d?.email) setMyEmail(d.email);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      if (draft.body || draft.photos?.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* storage full/blocked — autosave is best-effort */ }
  }, [draft]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const pickFile = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ""; if (!files.length) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadPct(0); setUploadNote(files.length > 1 ? `photo ${i + 1} of ${files.length}` : "");
        const url = await uploadMedia(f, setUploadPct);
        setDraft((d) => ({ ...d, photos: [...d.photos, { id: Math.random().toString(36).slice(2), url, video: f.type.startsWith("video") }] }));
      }
      toast(files.length > 1 ? `${files.length} photos attached ✓` : "Photo attached ✓", "success");
    } catch (err) { toast(`Couldn't upload: ${err.message || err}. Tap Photo/Video to retry.`, "error"); }
    finally { setUploading(false); setUploadPct(0); setUploadNote(""); }
  };
  const resendVerify = async () => {
    if (!myEmail) { toast("Couldn't find your email — re-login and try again.", "error"); return; }
    setResending(true);
    try {
      await send("POST", "/api/v1/auth/resend-verification", { email: myEmail });
      toast("Verification email sent ✓ — check your inbox.", "success");
    } catch (e) { toast(String(e.message || e), "error"); } finally { setResending(false); }
  };
  const post = async () => {
    if (!draft.body.trim() || busy) return;
    setBusy(true);
    try {
      await send("POST", `${API}/feed`, {
        body: draft.body.trim(), audience: draft.audience, location: draft.location,
        vertical: draft.vertical.trim() || null, photos: draft.photos.map((p) => p.url),
        is_question: draft.isQuestion, link_audit_hash: draft.link, reach: draft.reach, kind: draft.kind,
        ...(groupId ? { group_id: groupId } : {}),
      });
      setDraft(BLANK_DRAFT);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      setNeedVerify(false);
      toast("Posted ✓", "success");
      onPosted();
    } catch (err) {
      if (err.status === 403 && /verify/i.test(String(err.message))) setNeedVerify(true);
      else if (err.status === 429) toast("You're posting too quickly — wait a moment and try again.", "error");
      else toast(`Couldn't post: ${err.message || err}`, "error");
    } finally { setBusy(false); }
  };
  return (
    <div className="cm-composer">
      <div className="cm-composer-avatar"><Avatar src={me?.avatar_url} name={me?.full_name} size={40} /></div>
      <div className="cm-composer-body">
        <textarea placeholder="Share with your network…" value={draft.body} maxLength={BODY_MAX} onChange={(e) => set("body", e.target.value)} />
        {draft.body.length > BODY_MAX - 300 && (
          <div style={{ textAlign: "right", fontSize: 11, color: draft.body.length >= BODY_MAX ? "#b3261e" : "var(--muted)", marginTop: 2 }}>
            {draft.body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
          </div>
        )}
        <div className="cm-composer-extras">
          {draft.photos.map((ph) => (
            <div className="cm-draft-thumb" key={ph.id}>{ph.video ? <video src={ph.url} muted /> : <img src={ph.url} alt="" />}<button className="cm-draft-thumb-x" onClick={() => set("photos", draft.photos.filter((p) => p.id !== ph.id))}><X size={11} /></button></div>
          ))}
          {draft.location && <span className="cm-draft-tag"><MapPin size={11} />{draft.location}<button className="cm-draft-tag-x" onClick={() => set("location", null)}><X size={10} /></button></span>}
          {draft.link && <span className="cm-draft-tag"><Link2 size={11} />Record {draft.link}<button className="cm-draft-tag-x" onClick={() => set("link", null)}><X size={10} /></button></span>}
          {draft.isQuestion && <span className="cm-draft-tag"><HelpCircle size={11} />Question<button className="cm-draft-tag-x" onClick={() => set("isQuestion", false)}><X size={10} /></button></span>}
          {draft.kind === "EDU_REEL" && <span className="cm-draft-tag"><BookOpen size={11} />Educational reel (global)<button className="cm-draft-tag-x" onClick={() => set("kind", "POST")}><X size={10} /></button></span>}
          {draft.reach === "GLOBAL" && <span className="cm-draft-tag">🌐 Global reach<button className="cm-draft-tag-x" onClick={() => set("reach", "LOCAL")}><X size={10} /></button></span>}
        </div>
        {uploading && (
          <div style={{ margin: "8px 0 2px" }}>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(92,64,51,0.12)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${uploadPct}%`, background: "var(--green)", transition: "width 200ms ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              {uploadPct < 100 ? `Uploading ${uploadNote || "photo"}… ${uploadPct}%` : `Processing ${uploadNote || "photo"}…`}
            </div>
          </div>
        )}
        {needVerify && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "rgba(191,144,0,0.10)", border: "1px solid rgba(191,144,0,0.45)", borderRadius: 8, padding: "10px 12px", margin: "8px 0 2px" }}>
            <MailCheck size={16} style={{ color: "var(--amber, #bf9000)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--soil)", minWidth: 180 }}>
              <strong>Verify your email to post.</strong> Check your inbox for the link{myEmail ? ` sent to ${myEmail}` : ""}.
            </span>
            <button className="btn btn-sm btn-secondary" disabled={resending} onClick={resendVerify} style={{ minHeight: 36 }}>{resending ? "Sending…" : "Resend email"}</button>
          </div>
        )}
        <div className="cm-composer-foot" style={narrow ? { flexDirection: "column", alignItems: "stretch", gap: 8 } : undefined}>
          <div className="cm-composer-tools" style={{ flexWrap: "wrap", rowGap: 6 }}>
            <button className="cm-tool-btn" onClick={() => fileRef.current?.click()} disabled={uploading} style={narrow ? { minHeight: 44 } : undefined}><Image size={13} />Photo / Video</button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={pickFile} />
            {narrow && <>
              <button className="cm-tool-btn" onClick={() => cameraRef.current?.click()} disabled={uploading} style={{ minHeight: 44 }}><Camera size={13} />Camera</button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />
            </>}
            <button className="cm-tool-btn" onClick={() => setEmojiOpen((v) => !v)} style={narrow ? { minHeight: 44 } : undefined}><Smile size={13} />Emoji</button>
            <button className="cm-tool-btn" onClick={() => setModal("place")} style={narrow ? { minHeight: 44 } : undefined}><MapPin size={13} />Place</button>
            <button className={`cm-tool-btn ${draft.isQuestion ? "cm-tool-active" : ""}`} onClick={() => set("isQuestion", !draft.isQuestion)} style={narrow ? { minHeight: 44 } : undefined}><HelpCircle size={13} />Ask</button>
            <button className="cm-tool-btn" onClick={() => setModal("mention")} style={narrow ? { minHeight: 44 } : undefined}><UserPlus size={13} />Mention</button>
            {!narrow && <button className="cm-tool-btn" onClick={() => setModal("link")}><Link2 size={13} />Link record</button>}
            <button className={`cm-tool-btn ${draft.kind === "EDU_REEL" ? "cm-tool-active" : ""}`} onClick={() => set("kind", draft.kind === "EDU_REEL" ? "POST" : "EDU_REEL")} style={narrow ? { minHeight: 44 } : undefined}><BookOpen size={13} />Reel</button>
            {canGlobal && <button className={`cm-tool-btn ${draft.reach === "GLOBAL" ? "cm-tool-active" : ""}`} onClick={() => set("reach", draft.reach === "GLOBAL" ? "LOCAL" : "GLOBAL")} title="Global reach (exporters/importers)">🌐</button>}
            <select className="cm-audience-select" value={draft.audience} onChange={(e) => set("audience", e.target.value)} style={narrow ? { minHeight: 44 } : undefined}>
              {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy || uploading || !draft.body.trim()} onClick={post} style={narrow ? { width: "100%", minHeight: 44, justifyContent: "center" } : undefined}><Send size={13} />{busy ? "Posting…" : "Post"}</button>
        </div>
        {emojiOpen && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginTop: 6 }}>
            {EMOJIS.map((em) => (
              <button key={em} onClick={() => { set("body", (draft.body + " " + em).trimStart().slice(0, BODY_MAX)); }} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", width: 36, height: 36, lineHeight: 1 }}>{em}</button>
            ))}
          </div>
        )}
        {!narrow && <div className="cm-composer-hint">Seen by your country's {draft.audience === "everyone" ? "whole network" : draft.audience} (global if Reel/🌐). Use Mention to tag people. Reports go to Cody as moderator.</div>}
      </div>
      {modal === "place" && <PlaceModal onClose={() => setModal(null)} onPick={(v) => { set("location", v); setModal(null); }} />}
      {modal === "link" && <LinkRecordModal onClose={() => setModal(null)} onPick={(v) => { set("link", v); setModal(null); }} />}
      {modal === "mention" && <MentionPicker onClose={() => setModal(null)} onPick={(name) => { set("body", `${draft.body}${draft.body && !draft.body.endsWith(" ") ? " " : ""}@[${name}] `); setModal(null); }} />}
    </div>
  );
}

/* ---------------- replies ---------------- */
function Replies({ post, me, onCount }) {
  const [list, setList] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState("");
  const load = () => getJSON(`${API}/feed/${post.post_id}/replies`).then((r) => { setList(r.data || []); onCount?.(r.data?.length || 0); }).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!text.trim()) return;
    await send("POST", `${API}/feed/${post.post_id}/replies`, { body: text.trim(), parent_reply_id: replyTo });
    setText(""); setReplyTo(null); load();
  };
  const toggleLike = async (r) => {
    await send(r.liked ? "DELETE" : "POST", `${API}/feed/replies/${r.reply_id}/like`);
    setList((l) => l.map((x) => x.reply_id === r.reply_id ? { ...x, liked: !x.liked, like_count: x.like_count + (x.liked ? -1 : 1) } : x));
  };
  const markBest = async (r) => { await send("POST", `${API}/feed/${post.post_id}/best/${r.reply_id}`); load(); };
  if (list == null) return <div className="cm-replies-section"><div className="cm-empty">Loading replies…</div></div>;
  const top = list.filter((r) => !r.parent_reply_id);
  const kids = (id) => list.filter((r) => r.parent_reply_id === id);
  const Card = ({ r, nested }) => (
    <div className={`cm-reply-card ${nested ? "cm-reply-nested" : ""} ${post.best_answer_reply_id === r.reply_id ? "cm-reply-best" : ""}`}>
      <div className="cm-reply-avatar"><Avatar src={r.author_avatar} name={r.author_name} size={30} fontScale={0.4} /></div>
      <div className="cm-reply-body-col">
        <div className="cm-reply-head">
          <span className="cm-reply-author">{r.author_name}</span>
          {r.author_verified && <BadgeCheck size={11} className="cm-verified-tick" />}
          {post.best_answer_reply_id === r.reply_id && <span className="cm-best-tag">Best answer</span>}
          <span className="cm-reply-time">{fmtTime(r.created_at)}</span>
        </div>
        <div className="cm-reply-body">{renderBody(r.body)}</div>
        <div className="cm-reply-actions">
          <button className={`cm-reply-action ${r.liked ? "cm-action-active" : ""}`} onClick={() => toggleLike(r)}><Star size={11} />{r.like_count || 0}</button>
          {!nested && <button className="cm-reply-action" onClick={() => setReplyTo(replyTo === r.reply_id ? null : r.reply_id)}><MessageSquare size={11} />Reply</button>}
          {post.is_question && post.author_user_id === me?.user_id && <button className="cm-reply-action" onClick={() => markBest(r)}><Check size={11} />{post.best_answer_reply_id === r.reply_id ? "Unmark best" : "Best answer"}</button>}
        </div>
        {replyTo === r.reply_id && (
          <div className="cm-reply-composer">
            <textarea placeholder={`Reply to ${r.author_name}…`} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-sm btn-primary" onClick={submit}><Send size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div className="cm-replies-section">
      {top.length === 0 && <div className="cm-empty">No replies yet. Be the first.</div>}
      {top.map((r) => (
        <div key={r.reply_id}>
          <Card r={r} nested={false} />
          {kids(r.reply_id).map((k) => <Card key={k.reply_id} r={k} nested />)}
        </div>
      ))}
      {replyTo === null && (
        <div className="cm-reply-composer">
          <textarea placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={submit}><Send size={12} /></button>
        </div>
      )}
    </div>
  );
}

/* ---------------- post card ---------------- */
function PostCard({ post, me, onChange, onRemoved }) {
  const navigate = useNavigate();
  const [p, setP] = useState(post);
  const [showReplies, setShowReplies] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null); // photo index or null
  useEffect(() => { setP(post); setEditText(post.body); }, [post]);
  const mine = p.author_user_id === me?.user_id;

  const saveEdit = async () => {
    if (!editText.trim()) return;
    try { await send("PATCH", `${API}/feed/${p.post_id}`, { body: editText.trim() }); setP({ ...p, body: editText.trim(), edited_at: new Date().toISOString() }); setEditing(false); toast("Post updated ✓", "success"); }
    catch (e) { toast(`Couldn't update: ${e.message || e}`, "error"); }
  };
  const saveAudience = async (aud) => {
    setAudienceOpen(false);
    try { await send("PATCH", `${API}/feed/${p.post_id}`, { audience: aud }); setP({ ...p, audience: aud }); toast("Audience updated ✓", "success"); }
    catch (e) { toast(`Couldn't update audience: ${e.message || e}`, "error"); }
  };

  const toggleLike = async () => {
    const liked = !p.liked;
    setP({ ...p, liked, like_count: p.like_count + (liked ? 1 : -1) });
    try { await send(liked ? "POST" : "DELETE", `${API}/feed/${p.post_id}/like`); } catch { setP(p); }
  };
  const setReaction = async (key) => {
    setShowTray(false);
    const same = p.my_reaction === key;
    const reactions = { ...(p.reactions || {}) };
    if (p.my_reaction) reactions[p.my_reaction] = Math.max(0, (reactions[p.my_reaction] || 1) - 1);
    if (!same) reactions[key] = (reactions[key] || 0) + 1;
    setP({ ...p, my_reaction: same ? null : key, reactions });
    try { await send(same ? "DELETE" : "PUT", `${API}/feed/${p.post_id}/react`, same ? undefined : { reaction: key }); } catch { /* keep */ }
  };
  const toggleSave = async () => {
    const saved = !p.saved; setP({ ...p, saved });
    try { await send(saved ? "POST" : "DELETE", `${API}/feed/${p.post_id}/save`); toast(saved ? "Saved ✓" : "Removed from saved", "success"); }
    catch (e) { setP(p); toast(`Couldn't ${saved ? "save" : "unsave"}: ${e.message || e}`, "error"); }
  };
  const repost = async () => {
    try { await send("POST", `${API}/feed/${p.post_id}/repost`, {}); toast("Reposted ✓", "success"); onChange?.(); }
    catch (e) { toast(`Couldn't repost: ${e.message || e}`, "error"); }
  };
  const del = async () => {
    setMenu(false);
    try { await send("DELETE", `${API}/feed/${p.post_id}`); toast("Post deleted", "success"); onRemoved?.(p.post_id); }
    catch (e) { toast(`Couldn't delete: ${e.message || e}`, "error"); }
  };

  // ---- three-dot menu actions (each loud + persists) ----
  const closeMenu = () => setMenu(false);
  const run = async (fn, ok, errPrefix) => {
    try { await fn(); if (ok) toast(ok, "success"); }
    catch (e) { toast(`${errPrefix}: ${e.message || e}`, "error"); }
  };
  const copyLink = () => {
    closeMenu();
    const url = `${window.location.origin}/home?post=${p.post_id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Link copied ✓", "success")).catch(() => toast(url));
    else toast(url);
  };
  const pin = () => { closeMenu(); run(async () => { const r = await send("POST", `${API}/feed/${p.post_id}/pin`); setP({ ...p, pinned: r?.data?.pinned }); }, p.pinned ? "Unpinned" : "Pinned ✓", "Couldn't pin"); };
  const archive = () => { closeMenu(); run(async () => { await send("POST", `${API}/feed/${p.post_id}/archive`); onRemoved?.(p.post_id); }, "Post hidden from your feed", "Couldn't hide"); };
  const toggleComments = () => { closeMenu(); const next = p.comments_enabled === false; run(async () => { await send("PATCH", `${API}/feed/${p.post_id}`, { comments_enabled: next }); setP({ ...p, comments_enabled: next }); }, next ? "Comments turned on ✓" : "Comments turned off", "Couldn't update"); };
  const hideForMe = () => { closeMenu(); run(async () => { await send("POST", `${API}/feed/${p.post_id}/hide-for-me`); onRemoved?.(p.post_id); }, "We'll show fewer like this", "Couldn't hide"); };
  const muteAuthor = () => { closeMenu(); run(async () => { await send("POST", `${API}/mute/${p.author_user_id}`); onRemoved?.(p.post_id); }, `Muted ${p.author_name}`, "Couldn't mute"); };
  const blockAuthor = () => { closeMenu(); run(async () => { await send("POST", `${API}/block/${p.author_user_id}`); onRemoved?.(p.post_id); }, `Blocked ${p.author_name}`, "Couldn't block"); };
  const saveFromMenu = () => { closeMenu(); toggleSave(); };

  const summaryKeys = Object.keys(p.reactions || {}).filter((k) => p.reactions[k] > 0);
  return (
    <div className="cm-post-card">
      {p.is_repost && p.repost_author_name && (
        <div className="cm-repost-banner"><Repeat2 size={12} /> Reposted</div>
      )}
      <div className="cm-post-head">
        <div className="cm-post-avatar" onClick={() => p.author_user_id && navigate(`/u/${p.author_user_id}`)} style={{ cursor: "pointer" }}><Avatar src={p.author_avatar} name={p.author_name} size={40} /></div>
        <div className="cm-post-author-block">
          <div className="cm-post-author-row">
            <span className="cm-post-author-name" onClick={() => p.author_user_id && navigate(`/u/${p.author_user_id}`)} style={{ cursor: "pointer" }}>{p.author_name}</span>
            {p.author_verified && <BadgeCheck size={13} className="cm-verified-tick" />}
            <span className="cm-prof-badge">{personaLabel(p.author_profession)}</span>
            {p.is_question && <span className="cm-prof-badge" style={{ background: "rgba(191,144,0,0.14)", color: "var(--amber,#bf9000)" }}><HelpCircle size={10} /> Question</span>}
          </div>
          <div className="cm-post-meta">{fmtTime(p.created_at)}{p.location ? ` · ${p.location}` : ""}{p.vertical ? ` · ${p.vertical}` : ""}{p.pinned ? " · 📌 Pinned" : ""}</div>
        </div>
        <div className="cm-post-head-actions">
          <button className="cm-post-menu-btn" onClick={() => setMenu(!menu)}><MoreHorizontal size={16} /></button>
          {menu && (
            <>
              <div onClick={closeMenu} style={{ position: "fixed", inset: 0, zIndex: 40 }} aria-hidden />
              <div className="cm-post-menu-modal" style={{ zIndex: 41 }}>
                {mine ? (
                  <>
                    <button className="cm-menu-item" onClick={() => { setMenu(false); setEditing(true); }}><Pencil size={14} />Edit post</button>
                    <button className="cm-menu-item" onClick={() => { setMenu(false); setAudienceOpen(true); }}><Users size={14} />Edit audience</button>
                    <button className="cm-menu-item" onClick={pin}><Pin size={14} />{p.pinned ? "Unpin from profile" : "Pin to profile"}</button>
                    <button className="cm-menu-item" onClick={toggleComments}><MessageSquare size={14} />{p.comments_enabled === false ? "Turn comments on" : "Turn comments off"}</button>
                    <button className="cm-menu-item" onClick={copyLink}><Copy size={14} />Copy link</button>
                    <button className="cm-menu-item" onClick={archive}><Archive size={14} />Hide from my feed</button>
                    <button className="cm-menu-item cm-menu-danger" onClick={del}><Trash2 size={14} />Delete post</button>
                  </>
                ) : (
                  <>
                    <button className="cm-menu-item" onClick={saveFromMenu}><Bookmark size={14} />{p.saved ? "Unsave" : "Save post"}</button>
                    <button className="cm-menu-item" onClick={copyLink}><Copy size={14} />Copy link</button>
                    <button className="cm-menu-item" onClick={hideForMe}><EyeOff size={14} />Hide — show fewer like this</button>
                    <button className="cm-menu-item" onClick={muteAuthor}><BellOff size={14} />Mute {p.author_name}</button>
                    <button className="cm-menu-item cm-menu-danger" onClick={blockAuthor}><Ban size={14} />Block {p.author_name}</button>
                    <button className="cm-menu-item cm-menu-danger" onClick={() => { setMenu(false); setReporting(true); }}><Flag size={14} />Report post</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {p.is_repost && p.repost_author_name && (
        <div className="cm-quoted">
          <div className="cm-quoted-author">{p.repost_author_name} · {personaLabel(p.repost_author_profession)}</div>
          <div className="cm-quoted-body">{renderBody(p.repost_body)}</div>
        </div>
      )}

      {editing ? (
        <div style={{ marginBottom: 10 }}>
          <textarea className="cm-edit-area" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid var(--line)", borderRadius: 6, fontFamily: "inherit", fontSize: 13.5, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
            <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setEditText(p.body); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="cm-post-body">{renderBody(p.body)}{p.edited_at && <span style={{ fontSize: 10.5, color: "var(--muted)" }}> · edited</span>}</div>
      )}

      {p.link_audit_hash && (
        <a className="cm-link-record" href={`/verify/${p.link_audit_hash}`} target="_blank" rel="noreferrer"><Link2 size={12} />Linked record · {p.link_audit_hash}</a>
      )}
      {p.photos?.length > 0 && (
        <div className="cm-post-photos">{p.photos.map((src, i) => (/\.(mp4|webm|mov)$/i.test(src)
          ? <video key={i} src={src} controls preload="metadata" onClick={(e) => { e.preventDefault(); setLightbox(i); }} style={{ cursor: "pointer" }} />
          : <img key={i} src={src} alt="" loading="lazy" decoding="async" onClick={() => setLightbox(i)} style={{ cursor: "pointer" }} />))}</div>
      )}

      {summaryKeys.length > 0 && (
        <div className="v103-react-summary">
          {summaryKeys.map((k) => { const R = RX[k]; const I = R?.Icon || Smile; return <span className="v103-react-count" key={k}><I size={11} /> {p.reactions[k]}</span>; })}
        </div>
      )}

      <div className="cm-post-actions">
        <button className={`cm-action-btn ${p.liked ? "cm-action-active" : ""}`} onClick={toggleLike}><Star size={13} />Like · {p.like_count || 0}</button>
        {p.comments_enabled === false
          ? <button className="cm-action-btn" disabled title="Comments are turned off" style={{ opacity: 0.5, cursor: "default" }}><MessageSquare size={13} />Comments off</button>
          : <button className="cm-action-btn" onClick={() => setShowReplies(!showReplies)}><MessageSquare size={13} />Reply · {p.reply_count || 0}</button>}
        <button className="cm-action-btn" onClick={repost}><Repeat2 size={13} />Repost{p.repost_count ? ` · ${p.repost_count}` : ""}</button>
        <button className="cm-action-btn" onClick={() => setShare(true)}><Share2 size={13} />Share</button>
        <button className={`cm-action-btn ${p.my_reaction ? "cm-action-active" : ""}`} onClick={() => setShowTray(!showTray)}><Smile size={13} />{p.my_reaction ? (RX[p.my_reaction]?.label || "Reacted") : "React"}</button>
        <button className={`cm-action-btn ${p.saved ? "cm-action-active" : ""}`} style={{ marginLeft: "auto" }} onClick={toggleSave}><BookOpen size={13} />{p.saved ? "Saved" : "Save"}</button>
      </div>

      {showTray && (
        <div className="v103-react-tray">
          {REACTIONS.map((r) => <button key={r.key} className={`v103-react-chip ${p.my_reaction === r.key ? "v103-react-mine" : ""}`} onClick={() => setReaction(r.key)}><r.Icon size={13} /> {r.label}</button>)}
        </div>
      )}

      {showReplies && <Replies post={p} me={me} onCount={(n) => setP((pp) => ({ ...pp, reply_count: n }))} />}

      {share && <ShareModal post={p} onClose={() => setShare(false)} onShared={(u) => { setShare(false); }} />}
      {reporting && <ReportModal post={p} onClose={() => setReporting(false)} />}
      {lightbox != null && <PhotoLightbox post={p} startIndex={lightbox} onClose={() => setLightbox(null)} />}
      {audienceOpen && (
        <Overlay title="Edit audience" onClose={() => setAudienceOpen(false)}>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>Who can see this post?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {AUDIENCES.map(([v, l]) => (
              <button key={v} className="cm-menu-item" style={{ borderColor: p.audience === v ? "var(--green)" : "var(--line)", justifyContent: "space-between" }} onClick={() => saveAudience(v)}>
                <span>{l}</span>{p.audience === v && <Check size={14} className="cm-verified-tick" />}
              </button>
            ))}
          </div>
        </Overlay>
      )}
    </div>
  );
}

function ReportModal({ post, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try { await send("POST", `${API}/feed/${post.post_id}/report`, { reason: reason.trim() }); setDone(true); }
    catch (e) { alert(String(e.message || e)); setBusy(false); }
  };
  return (
    <Overlay title="Report post" onClose={onClose}
      foot={done ? <button className="btn btn-primary" onClick={onClose}>Close</button> :
        <><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !reason.trim()} onClick={submit}>{busy ? "Sending…" : "Report"}</button></>}>
      {done ? <div className="comm-note">Thanks — this post was reported to the moderator.</div> : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>Tell the moderator (Cody) what's wrong with this post.</p>
          <textarea style={{ ...inp, minHeight: 70 }} placeholder="Reason (spam, abuse, false info, …)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
    </Overlay>
  );
}

/* ---------------- feed ---------------- */
export default function FeedView({ initialFilter = "all", groupId = null }) {
  // Real identity from /auth/me — the JWT payload has `sub`, NOT `user_id`,
  // so the old getCurrentUser() comparison made `mine` always false and own
  // posts never showed Edit/Delete/Archive. Seed instantly from the JWT
  // (sub -> user_id) so ownership works even before the fetch lands.
  const [me, setMe] = useState(() => {
    try { const p = getCurrentUser(); return p ? { ...p, user_id: p.user_id || p.sub } : null; } catch { return null; }
  });
  useEffect(() => {
    getJSON("/api/v1/auth/me").then((r) => { const d = r?.data ?? r; if (d?.user_id) setMe(d); }).catch(() => {});
  }, []);
  const [filter, setFilter] = useState(initialFilter);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [posts, setPosts] = useState(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(false);
  const PAGE = 20;

  const load = (silent) => {
    if (!silent) setPosts(null);
    setEnd(false);
    getJSON(`${API}/feed?filter=${filter}&verified_only=${verifiedOnly}&limit=${PAGE}&offset=0`)
      .then((r) => { const d = r.data || []; setPosts(d); setEnd(d.length < PAGE); })
      .catch((e) => { setPosts([]); if (!silent) toast(`Couldn't load the feed: ${e.userMessage || e.message || e}`, "error"); });
  };
  const loadMore = () => {
    setMore(true);
    getJSON(`${API}/feed?filter=${filter}&verified_only=${verifiedOnly}&limit=${PAGE}&offset=${posts.length}`)
      .then((r) => { const d = r.data || []; setPosts((cur) => [...cur, ...d]); setEnd(d.length < PAGE); })
      .catch(() => {}).finally(() => setMore(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, verifiedOnly]);
  // refresh when the tab/window regains focus so others' new posts appear
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    /* eslint-disable-next-line */
  }, [filter, verifiedOnly]);

  return (
    <div className="cm-feed">
      <Composer me={me} groupId={groupId} onPosted={() => { if (!groupId) setFilter("all"); load(); }} />

      {!groupId && <div className="cm-filter-row">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`cm-pill ${filter === id ? "cm-pill-active" : ""}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <div className="cm-pill-spacer" />
        <button className={`cm-pill cm-pill-verified ${verifiedOnly ? "cm-pill-active" : ""}`} onClick={() => setVerifiedOnly(!verifiedOnly)}><Check size={11} /> Verified only</button>
        <button className="cm-pill" onClick={() => setTopicsOpen(true)}><Rss size={11} /> Manage topics</button>
      </div>}

      {posts == null ? <div className="cm-empty">Loading feed…</div> :
        posts.length === 0 ? <div className="cm-empty">No posts match your filter yet. Share the first update.</div> :
          <>
            {posts.map((p) => <PostCard key={p.post_id} post={p} me={me} onChange={() => load(true)} onRemoved={(id) => setPosts((l) => l.filter((x) => x.post_id !== id))} />)}
            {!end && (
              <button className="btn btn-secondary" style={{ alignSelf: "center", margin: "4px auto" }} disabled={more} onClick={loadMore}>
                {more ? "Loading…" : "Load more"}
              </button>
            )}
          </>}

      {topicsOpen && <TopicsModal onClose={() => setTopicsOpen(false)} />}
    </div>
  );
}

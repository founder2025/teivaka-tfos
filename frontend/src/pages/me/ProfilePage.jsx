/**
 * ProfilePage — /me (own) and /u/:id (others). Social-media profile matching the
 * prototype: header (avatar+change photo, chips, verified, phone, joined, last active),
 * actions (Edit / Preview as public / Export — own; Follow / Message — others), stat
 * cards, trust block, facts table, and a left-rail of tabs (Overview/Posts/Reels/Photos/
 * Saved/My records/Activity/Settings + Network). Real data + per-field visibility.
 */
import { useEffect, useMemo, useState } from "react";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Eye, Layers, Play, Image as ImageIcon, Bookmark, Activity as ActivityIcon, Settings as Cog,
  Rss, Users, Store, Contact, Camera, Pencil, Download, Shield, BadgeCheck, Phone, Calendar,
  Clock, MapPin, MessageCircle, UserPlus, UserCheck, ArrowRight, X, Award, QrCode,
} from "lucide-react";
import { C, getJSON, send, card } from "./_meCommon";
import { getCurrentUser } from "../../utils/auth";
import { useChat } from "../../context/ChatContext";
import { uploadMedia } from "../../utils/imageCompress";
import AvatarCropper from "../../components/me/AvatarCropper";
import Avatar from "../../components/ui/Avatar";

// Loud, non-silent feedback — routed through the shell's Toast. Every write on
// this page surfaces success/failure here instead of failing quietly.
const toast = (message, type) => {
  try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); }
  catch { /* noop */ }
};

const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const PROF = { farmer: "Farmer", buyer: "Buyer", supplier: "Supplier", service_provider: "Service Provider", banker: "Banker", business: "Business", exporter: "Exporter", importer: "Importer" };
// Guard against null/epoch dates: an unset created_at must read "—", never "01/01/1970".
const isRealDate = (d) => d instanceof Date && !isNaN(d) && d.getFullYear() > 1971;
const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso); return isRealDate(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }) : "—"; };
const monthsSince = (iso) => { if (!iso) return ""; const d = new Date(iso); if (!isRealDate(d)) return ""; const m = Math.max(0, Math.round((Date.now() - d) / (30.44 * 864e5))); return `${m} month${m === 1 ? "" : "s"}`; };
const fmtPost = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const isVideo = (s) => /\.(mp4|webm|mov)$/i.test(s || "");

const TABS = [
  { id: "overview", label: "Overview", Icon: Eye },
  { id: "posts", label: "Posts", Icon: Layers },
  { id: "reels", label: "Reels", Icon: Play },
  { id: "photos", label: "Photos", Icon: ImageIcon },
  { id: "saved", label: "Saved", Icon: Bookmark, route: "/home/saved", selfOnly: true },
  { id: "records", label: "My records", Icon: ActivityIcon, selfOnly: true },
  { id: "activity", label: "Activity", Icon: ActivityIcon, selfOnly: true },
  { id: "settings", label: "Settings", Icon: Cog, route: "/me/settings", selfOnly: true },
];
const NETWORK = [
  { label: "Feed", Icon: Rss, route: "/home" },
  { label: "Following", Icon: Users, route: "/home/following" },
  { label: "Marketplace", Icon: Store, route: "/home/marketplace" },
  { label: "Directory", Icon: Contact, route: "/home/directory" },
];

function Stat({ n, label, onClick }) {
  return (
    <button onClick={onClick} style={{ ...card, marginBottom: 0, flex: 1, minWidth: 120, textAlign: "left", cursor: onClick ? "pointer" : "default", border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.soil }}>{n}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
    </button>
  );
}

// Suggested members — real existing users from /community/people, with working
// Follow. New users land on /me first, so this is their discovery entry point.
// Honest-empty when the platform genuinely has no one else to suggest yet.
/** Classroom credentials — public trust display: verified, scannable certs. */
function ProfileCertificates({ userId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!userId) return;
    getJSON(`/api/v1/classroom/users/${userId}/certificates`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  }, [userId]);
  if (!rows || !rows.length) return null;   // honest: section only exists when earned
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Award size={16} style={{ color: "#BF9000" }} />
        <strong style={{ color: C.soil }}>Classroom certificates</strong>
        <span style={{ fontSize: 12, color: C.muted }}>· verified credentials, scannable by anyone</span>
      </div>
      {rows.map((c) => (
        <div key={c.cert_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{c.course_title}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>Earned {new Date(c.issued_at).toLocaleDateString()} · {c.cert_id}</div>
          </div>
          {c.audit_hash && (
            <a href={`/verify/${c.audit_hash}`} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", gap: 5, alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", color: C.soil, textDecoration: "none", fontSize: 12.5 }}>
              <QrCode size={13} />Verify
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function SuggestedPeople() {
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState({});
  useEffect(() => {
    getJSON("/api/v1/community/people")
      .then((r) => setPeople(((r.data || r) || []).filter((x) => !x.is_following).slice(0, 6)))
      .catch(() => setPeople([]));
  }, []);
  const follow = async (u) => {
    setBusy((b) => ({ ...b, [u.user_id]: true }));
    try {
      await send("POST", `/api/v1/community/follow/${u.user_id}`);
      toast(`Following ${u.full_name} ✓`, "success");
      setPeople((list) => (list || []).filter((x) => x.user_id !== u.user_id));
    } catch (e) {
      toast(`Couldn't follow: ${e.message || e}`, "error");
    } finally { setBusy((b) => ({ ...b, [u.user_id]: false })); }
  };
  if (people == null) return <div style={{ ...card, color: C.muted }}>Loading suggestions…</div>;
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ color: C.soil }}>Suggested for you</strong>
        <Link to="/home/directory" style={{ fontSize: 12.5, color: C.greenDk, textDecoration: "none" }}>See all</Link>
      </div>
      {people.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13 }}>No suggestions yet — as more farmers, buyers and suppliers join, they'll appear here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {people.map((u) => (
            <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => navigate(`/u/${u.user_id}`)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                <Avatar src={u.avatar_url} name={u.full_name} size={36} fontScale={0.36} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, color: C.soil, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name}{u.verified ? <BadgeCheck size={12} style={{ display: "inline", marginLeft: 4, color: C.greenDk }} /> : null}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{(PROF[u.profession] || u.profession || "Member")}{u.country ? ` · ${u.country}` : ""}</span>
                </span>
              </button>
              <button onClick={() => follow(u)} disabled={busy[u.user_id]} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <UserPlus size={13} />{busy[u.user_id] ? "…" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditModal({ me, onClose, onSaved }) {
  const [f, setF] = useState({
    full_name: me.full_name || "", bio: me.bio || "", whatsapp_number: me.phone || me.whatsapp_number || "",
    country: me.country || "", account_type: (me.profession || "farmer").toUpperCase(),
  });
  const fv = me.field_visibility || {};
  const [vis, setVis] = useState({
    phone: fv.phone || "connections", joined: fv.joined || "public",
    location: fv.location || "public", bio: fv.bio || "public", records: fv.records || "public",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const setV = (k, v) => setVis({ ...vis, [k]: v });
  const inp = { width: "100%", padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginTop: 4 };
  const VIS_FIELDS = [["phone", "Phone"], ["joined", "Joined date"], ["location", "Location / country"], ["bio", "Bio"], ["records", "Records logged"]];
  const save = async () => {
    setBusy(true);
    const merged = { ...fv, ...vis };
    try {
      await send("PATCH", "/api/v1/me", {
        full_name: f.full_name, bio: f.bio, whatsapp_number: f.whatsapp_number,
        country: f.country, account_type: f.account_type,
        field_visibility: merged,
      });
      toast("Profile saved ✓", "success");
      // Hand the saved values back so the page reflects them immediately, even
      // if the heavier profile reload is slow or fails.
      onSaved({
        full_name: f.full_name, bio: f.bio, phone: f.whatsapp_number,
        country: f.country, profession: (f.account_type || "").toLowerCase(),
        field_visibility: merged,
      });
    } catch (e) {
      toast(`Couldn't save profile: ${e.message || e}`, "error");
    } finally { setBusy(false); }
  };
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(40,30,20,.4)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "7vh" }}>
      <div style={{ width: "min(540px, calc(100vw - 24px))", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
          <strong style={{ color: C.soil }}>Edit profile</strong>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16 }}>
          <label style={{ fontSize: 12, color: C.muted }}>Full name<input style={inp} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Bio<textarea style={{ ...inp, minHeight: 64 }} value={f.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell the network about your farm…" /></label>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <label style={{ fontSize: 12, color: C.muted, flex: 1 }}>Phone<input style={inp} value={f.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} /></label>
            <label style={{ fontSize: 12, color: C.muted, width: 90 }}>Country<input style={inp} maxLength={2} value={f.country} onChange={(e) => set("country", e.target.value.toUpperCase())} /></label>
          </div>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Profession<select style={inp} value={f.account_type} onChange={(e) => set("account_type", e.target.value)}>{["FARMER", "BUYER", "SUPPLIER", "SERVICE_PROVIDER", "BANKER", "BUSINESS", "EXPORTER", "IMPORTER"].map((t) => <option key={t} value={t}>{PROF[t.toLowerCase()]}</option>)}</select></label>

          <div style={{ marginTop: 18, fontSize: 12.5, fontWeight: 700, color: C.soil }}>Privacy — who can see</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Everyone · Followers · Connections (mutual) · Only me</div>
          {VIS_FIELDS.map(([k, label]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: C.soil }}>{label}</span>
              <select value={vis[k]} onChange={(e) => setV(k, e.target.value)} style={{ width: 150, padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13 }}>
                <option value="public">Everyone</option><option value="followers">Followers</option><option value="connections">Connections</option><option value="private">Only me</option>
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.line}` }}>
          <button onClick={onClose} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ border: "none", background: C.green, color: "#fff", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage({ self = false }) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const chat = useChat();
  const narrow = useIsNarrow(760);
  const [meId, setMeId] = useState(null);
  const [p, setP] = useState(null);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [previewPublic, setPreviewPublic] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);
  const [records, setRecords] = useState(null);
  const [activity, setActivity] = useState(null);
  const [meData, setMeData] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [avatarPct, setAvatarPct] = useState(null); // null = idle, 0-100 uploading
  const [cropFile, setCropFile] = useState(null);   // file awaiting crop/reposition
  const [coverPct, setCoverPct] = useState(null);   // cover upload progress
  const [loadFailed, setLoadFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // resolve own user_id (for /me). THE OLD DEAD-END: if this call failed, meId
  // stayed null, the profile fetch never fired, and the page sat on "Loading
  // profile…" forever. Failures now surface as a retryable error state.
  useEffect(() => {
    if (self) {
      setLoadFailed(false);
      getJSON("/api/v1/auth/me")
        .then((r) => { const d = r?.data ?? r; setMeData(d); setMeId(d?.user_id); })
        .catch(() => { setMeId(null); setLoadFailed(true); });
    }
  }, [self, retryTick]);

  // Never an infinite spinner: if nothing has rendered after 10s, offer Retry.
  useEffect(() => {
    if (p) return undefined;
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [p, retryTick]);

  const retry = () => { setTimedOut(false); setLoadFailed(false); setP(null); setRetryTick((n) => n + 1); };

  const targetId = self ? meId : routeId;
  // Fallback profile from /auth/me so the OWN profile renders even if the profile API
  // isn't deployed/reachable yet.
  const selfFallback = () => meData ? {
    user_id: meData.user_id, full_name: meData.full_name || meData.email, profession: (meData.profession || meData.account_type || "farmer").toLowerCase(),
    role: meData.role, country: meData.country, bio: meData.bio, avatar_url: meData.avatar_url,
    verified: !!meData.email_verified, joined: meData.created_at || null, phone: meData.whatsapp_number || null,
    is_you: true, is_following: false, is_connected: false, field_visibility: meData.field_visibility || {},
    stats: { posts: 0, followers: 0, following: 0, records: 0 }, posts: [],
  } : {};
  const load = () => {
    if (!targetId) return;
    getJSON(`/api/v1/community/profile/${targetId}`).then((r) => setP(r.data || r))
      .catch(() => {
        // Don't silently mask a backend failure as an empty-but-fine profile.
        if (self) { setP(selfFallback()); toast("Couldn't reach the profile service — showing limited info from your account.", "error"); }
        else setP({});
      });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetId, meData, retryTick]);
  // Stats (Posts count etc.) stay fresh: refetch when the tab regains focus —
  // e.g. after posting on Home and coming back here.
  useEffect(() => {
    const onFocus = () => { if (targetId) load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    /* eslint-disable-next-line */
  }, [targetId, meData]);

  // After a successful edit: merge the saved values straight into the view so
  // the change is visible instantly, refresh the authoritative /auth/me copy
  // (keeps the fallback fresh), then reconcile against the server.
  const handleSaved = (vals) => {
    setEditing(false);
    if (vals) setP((cur) => (cur ? { ...cur, ...vals } : cur));
    if (self) getJSON("/api/v1/auth/me").then((r) => { const d = r?.data ?? r; setMeData(d); }).catch(() => {});
    load();
  };
  useEffect(() => { if (tab === "records" && p?.is_you && records == null) getJSON("/api/v1/me/records").then((r) => setRecords(r.data || [])).catch(() => setRecords([])); }, [tab, p, records]);
  useEffect(() => { if (tab === "activity" && p?.is_you && activity == null && targetId) getJSON(`/api/v1/community/profile/${targetId}/activity`).then((r) => setActivity(r.data || [])).catch(() => setActivity([])); }, [tab, p, activity, targetId]);

  // Step 1: pick a file -> open the cropper (don't upload the raw photo).
  const pickAvatar = (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setCropFile(file); };
  // Step 2: cropper returns a neatly-framed square -> compress + upload.
  const uploadAvatar = async (cropped) => {
    setCropFile(null);
    setAvatarPct(0);
    try {
      const url = await uploadMedia(cropped, setAvatarPct);
      // Cache-bust so the new photo shows everywhere instead of a cached old one.
      const bust = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setAvatarBroken(false);
      setP((cur) => (cur ? { ...cur, avatar_url: bust } : cur)); // show it immediately
      await send("PATCH", "/api/v1/me", { avatar_url: url });
      toast("Photo updated ✓", "success");
      load();
    } catch (err) { toast(`Couldn't update photo: ${err.message || err}. Tap the camera to retry.`, "error"); }
    finally { setAvatarPct(null); }
  };
  const uploadCover = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setCoverPct(0);
    try {
      const url = await uploadMedia(file, setCoverPct);
      const bust = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setP((cur) => (cur ? { ...cur, cover_url: bust } : cur));
      await send("PATCH", "/api/v1/me", { cover_url: url });
      toast("Cover photo updated ✓", "success");
      load();
    } catch (err) { toast(`Couldn't update cover: ${err.message || err}`, "error"); }
    finally { setCoverPct(null); }
  };
  const toggleFollow = async () => {
    setBusyFollow(true);
    try { await send(p.is_following ? "DELETE" : "POST", `/api/v1/community/follow/${targetId}`); load(); }
    catch (e) { toast(`Couldn't update follow: ${e.message || e}`, "error"); }
    finally { setBusyFollow(false); }
  };

  if (!p) {
    if (loadFailed || timedOut) {
      return (
        <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.soil, marginBottom: 6 }}>
            {loadFailed ? "Couldn't load your profile" : "This is taking longer than usual"}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            {loadFailed ? "We couldn't reach the server. Check your connection and try again." : "Slow connection or a busy server — give it another go."}
          </div>
          <button onClick={retry} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 44 }}>Retry</button>
        </div>
      );
    }
    // Skeleton — the page's real shape while it loads, not a lone text line.
    const sk = { background: "rgba(92,64,51,0.08)", borderRadius: 8 };
    return (
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "8px 0" }} aria-busy="true" aria-label="Loading profile">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ ...sk, width: 72, height: 72, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...sk, height: 22, width: "40%", marginBottom: 10 }} />
            <div style={{ ...sk, height: 13, width: "60%", marginBottom: 8 }} />
            <div style={{ ...sk, height: 13, width: "35%" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...sk, height: 76, flex: 1, minWidth: 120 }} />)}
        </div>
        <div style={{ ...sk, height: 140, marginTop: 14 }} />
      </div>
    );
  }
  if (!p.user_id) return <div style={{ maxWidth: 1040, margin: "0 auto", color: C.muted, padding: 20 }}>Profile not found.</div>;

  const isYou = p.is_you;
  const pub = previewPublic; // own-profile public preview
  // If the stored avatar URL is dead (e.g. an upload that failed server-side
  // before the file was written), fall back to the initials circle instead of
  // the browser's broken-image icon.
  const Avatar = ({ size }) => (
    p.avatar_url && !avatarBroken
      ? <img src={p.avatar_url} alt="" onError={() => setAvatarBroken(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
      : <span style={{ width: size, height: size, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: size * 0.36, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(p.full_name)}</span>
  );

  const tabs = TABS.filter((t) => !(t.selfOnly && !isYou) || pub === false ? true : !t.selfOnly).filter((t) => !(t.selfOnly && !isYou));
  const goTab = (t) => { if (t.route) navigate(t.route); else setTab(t.id); };

  const postFilter = (kind) => (p.posts || []).filter((x) => {
    const hasMedia = (x.photos || []).length > 0;
    if (kind === "reels") return (x.photos || []).some(isVideo);
    if (kind === "photos") return (x.photos || []).some((s) => !isVideo(s)) && hasMedia;
    return true;
  });

  const PostList = ({ kind }) => {
    const list = postFilter(kind);
    if (list.length === 0) return <div style={{ ...card, color: C.muted }}>{isYou ? "Nothing here yet." : "No posts to show."}</div>;
    if (kind === "photos" || kind === "reels") {
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {list.flatMap((x) => (x.photos || []).filter((s) => kind === "reels" ? isVideo(s) : !isVideo(s)).map((s, i) => (
          kind === "reels" ? <video key={x.post_id + i} src={s} controls preload="metadata" style={{ width: "100%", borderRadius: 10, background: "#000" }} />
            : <img key={x.post_id + i} src={s} alt="" loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
        )))}
      </div>;
    }
    return list.map((x) => (
      <div style={card} key={x.post_id}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{fmtPost(x.created_at)}{x.is_repost ? " · reposted" : ""}{x.audience && x.audience !== "everyone" ? ` · ${x.audience}` : ""}</div>
        <div style={{ fontSize: 14, color: C.soil, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{x.body}</div>
        {(x.photos || []).length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 6, marginTop: 8 }}>{x.photos.map((s, i) => isVideo(s) ? <video key={i} src={s} controls preload="metadata" style={{ width: "100%", borderRadius: 8 }} /> : <img key={i} src={s} alt="" loading="lazy" decoding="async" style={{ width: "100%", borderRadius: 8 }} />)}</div>}
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>♥ {x.like_count || 0} · 💬 {x.reply_count || 0}</div>
      </div>
    ));
  };

  // Mobile: the left rail collapses into a horizontal scrollable tab strip
  // above the content (cleanest social-app pattern — never overlaps the header).
  const TabStrip = () => (
    <nav style={{ width: "100%", display: "flex", gap: 6, overflowX: "auto", padding: "2px 0 8px", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
      {tabs.map((t) => {
        const on = tab === t.id;
        return (
          <button key={t.id} onClick={() => goTab(t)} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", minHeight: 44, borderRadius: 999, border: `1px solid ${on ? C.green : C.line}`, background: on ? "rgba(106,168,79,0.12)" : "#fff", color: on ? C.greenDk : C.soil, fontSize: 13, fontWeight: on ? 700 : 500, whiteSpace: "nowrap", cursor: "pointer" }}>
            <t.Icon size={15} />{t.label}
          </button>
        );
      })}
      {NETWORK.map((n) => (
        <button key={n.label} onClick={() => navigate(n.route)} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", minHeight: 44, borderRadius: 999, border: `1px solid ${C.line}`, background: "#fff", color: C.muted, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer" }}>
          <n.Icon size={15} />{n.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", padding: "0 16px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
      {/* Sidebar-on-top on every viewport: the pill tab-strip leads, content
          sits centered in one clean column (Operator-directed 2026-06-11). */}
      <TabStrip />

      {/* main */}
      <main style={{ width: "100%", minWidth: 0 }}>
        {/* cover banner */}
        <div style={{ position: "relative", height: 150, borderRadius: 12, marginBottom: 14, overflow: "hidden", background: p.cover_url ? "#000" : "linear-gradient(120deg, rgba(106,168,79,0.25), rgba(62,123,31,0.35))", border: `1px solid ${C.line}` }}>
          {p.cover_url && <img src={p.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          {isYou && !pub && (
            <label style={{ position: "absolute", right: 10, bottom: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.92)", color: C.soil, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, cursor: "pointer" }}>
              <Camera size={13} />{coverPct != null ? `${coverPct}%` : (p.cover_url ? "Change cover" : "Add cover")}
              <input type="file" accept="image/*" hidden onChange={uploadCover} disabled={coverPct != null} />
            </label>
          )}
        </div>
        {/* header */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <label style={{ position: "relative", cursor: isYou ? "pointer" : "default", flexShrink: 0 }}>
            <Avatar size={72} />
            {isYou && <>
              <span style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Camera size={13} /></span>
              <input type="file" accept="image/*" hidden onChange={pickAvatar} disabled={avatarPct != null} />
              {avatarPct != null && (
                <span style={{ position: "absolute", left: 0, right: 0, bottom: -12 }}>
                  <span style={{ display: "block", height: 5, borderRadius: 3, background: "rgba(92,64,51,0.12)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${avatarPct}%`, background: C.green, transition: "width 200ms ease" }} />
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: C.muted, textAlign: "center", marginTop: 2 }}>{avatarPct < 100 ? `${avatarPct}%` : "Processing…"}</span>
                </span>
              )}
            </>}
          </label>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 22, color: C.soil }}>{p.full_name}</h1>
              {isYou && !pub && <span style={{ background: "rgba(106,168,79,.14)", color: C.greenDk, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>YOU</span>}
              {p.verified && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(106,168,79,.14)", color: C.greenDk, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}><BadgeCheck size={11} /> VERIFIED</span>}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted, marginTop: 6 }}>
              {p.phone && <span><Phone size={12} /> {p.phone}</span>}
              {p.joined && <span><Calendar size={12} /> joined {fmtDate(p.joined)} · {monthsSince(p.joined)}</span>}
              <span><Clock size={12} /> {isYou ? "active just now" : "member"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ background: C.soil, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6 }}>{p.role}</span>
              <span style={{ ...{ background: "rgba(106,168,79,.12)", color: C.greenDk }, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, display: "inline-flex", gap: 3, alignItems: "center" }}>{(PROF[p.profession] || p.profession).toUpperCase()} {p.verified && <BadgeCheck size={11} />}</span>
              {p.country && <span style={{ fontSize: 11, color: C.muted, display: "inline-flex", gap: 3, alignItems: "center" }}><MapPin size={12} /> {p.country}</span>}
            </div>
            {p.bio && <p style={{ fontSize: 13, color: C.soil, marginTop: 10, lineHeight: 1.55 }}>{p.bio}</p>}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
          {isYou ? <>
            <button onClick={() => setEditing(true)} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}><Pencil size={14} />Edit profile</button>
            <button onClick={() => setPreviewPublic((v) => !v)} style={{ background: "#fff", color: C.soil, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><Eye size={14} />{pub ? "Exit preview" : "Preview as public"}</button>
            <Link to="/me/data" style={{ background: "#fff", color: C.soil, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 14px", textDecoration: "none", display: "inline-flex", gap: 6, alignItems: "center" }}><Download size={14} />Export my data</Link>
          </> : <>
            <button onClick={toggleFollow} disabled={busyFollow} style={{ background: p.is_following ? "#fff" : C.green, color: p.is_following ? C.soil : "#fff", border: p.is_following ? `1px solid ${C.line}` : "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}>{p.is_following ? <><UserCheck size={14} />Following</> : <><UserPlus size={14} />Follow</>}</button>
            <button onClick={() => { if (p.is_connected) { chat.openWith({ user_id: p.user_id, full_name: p.full_name, profession: p.profession }); chat.setDropdownOpen?.(false); } else alert("You can message once you're mutually connected (you both follow each other)."); }} style={{ background: "#fff", color: p.is_connected ? C.greenDk : C.muted, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><MessageCircle size={14} />Message</button>
          </>}
        </div>
        {pub && <div style={{ ...card, background: "rgba(191,144,0,.08)", borderColor: C.amber, color: C.soil, fontSize: 12.5 }}>Viewing your profile as the public sees it. Fields you've restricted are hidden.</div>}

        {/* tab body */}
        {tab === "overview" && <>
          {isYou && (() => {
            const checks = [["Photo", !!p.avatar_url], ["Cover", !!p.cover_url], ["Bio", !!p.bio], ["Phone", !!p.phone], ["Location", !!p.country], ["First post", (p.stats?.posts || 0) > 0]];
            const done = checks.filter((c) => c[1]).length;
            const pct = Math.round((done / checks.length) * 100);
            if (pct >= 100) return null;
            return (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ color: C.soil }}>Complete your profile</strong>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.greenDk }}>{pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "rgba(92,64,51,0.1)", overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: C.green, transition: "width 250ms ease" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {checks.filter((c) => !c[1]).map(([label]) => (
                    <button key={label} onClick={() => setEditing(true)} style={{ fontSize: 11.5, color: C.soil, background: "rgba(92,64,51,0.06)", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>+ {label}</button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat n={p.stats?.posts ?? 0} label="Posts" onClick={() => setTab("posts")} />
            <Stat n={p.stats?.followers ?? 0} label="Followers" />
            <Stat n={p.stats?.following ?? 0} label="Following" />
            <Stat n={p.stats?.records ?? "—"} label="Records logged" onClick={isYou ? () => setTab("records") : undefined} />
          </div>
          <div style={{ ...card, textAlign: "center", padding: "22px 16px" }}>
            <Shield size={26} style={{ color: p.verified ? C.green : C.muted }} />
            <div style={{ fontWeight: 700, color: C.soil, marginTop: 8 }}>{p.verified ? "Verified farmer" : "Not verified yet"}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{p.verified ? "Identity and farm verified. Buyers and lenders can trust this record." : "Verification pending — records remain hash-chained and auditable."}</div>
            <a href="/verify" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 14px", color: C.soil, textDecoration: "none", fontSize: 13 }}>View</a>
          </div>

          {/* Verified record — what this farmer has built (prototype parity). */}
          <div style={{ ...card, border: `1px solid ${C.green}`, background: "rgba(106,168,79,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Shield size={16} style={{ color: C.greenDk }} />
              <strong style={{ color: C.greenDk }}>Verified record</strong>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>What this farmer has built — a record buyers and lenders can check.</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[["Logged actions", p.stats?.records ?? 0], ["Crop runs", p.stats?.crop_runs ?? 0], ["Attestations", p.stats?.attestations ?? 0]].map(([k, v]) => (
                <div key={k} style={{ flex: 1, minWidth: 110, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{v}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{k}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.muted, margin: "12px 0" }}>✓ Activity is recorded as it happens and can be independently verified.</div>
            <a href="/verify" style={{ display: "inline-flex", gap: 6, alignItems: "center", background: C.green, color: "#fff", borderRadius: 8, padding: "9px 16px", textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}><Shield size={14} />Verify this record</a>
          </div>

          <ProfileCertificates userId={p.user_id || targetId} />

          <div style={card}>
            {[["Farm", p.country ? "All farms" : "All farms"], ["Role", p.role], ["Member since", fmtDate(p.joined)], ["Last active", isYou ? "just now" : "recently"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 2px", borderBottom: `1px solid ${C.line}`, fontSize: 13.5 }}>
                <span style={{ color: C.muted }}>{k}</span><strong style={{ color: C.soil }}>{v}</strong>
              </div>
            ))}
          </div>
          {isYou && <SuggestedPeople />}
        </>}
        {tab === "posts" && <PostList kind="posts" />}
        {tab === "reels" && <PostList kind="reels" />}
        {tab === "photos" && <PostList kind="photos" />}
        {tab === "records" && <>
          <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><strong style={{ color: C.soil }}>{p.stats?.records ?? 0} records logged</strong><div style={{ fontSize: 12, color: C.muted }}>Hash-chained, verifiable farm activity.</div></div>
            <Link to="/farm/history" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: C.greenDk, fontSize: 13 }}>Full ledger <ArrowRight size={13} /></Link>
          </div>
          {records == null ? <div style={{ color: C.muted, padding: 12 }}>Loading…</div>
            : records.length === 0 ? <div style={{ ...card, color: C.muted }}>No records logged yet.</div>
            : records.map((r, i) => (
              <div key={i} style={{ ...card, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{(r.event_type || "").replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{r.entity_type || ""}{r.occurred_at ? ` · ${fmtPost(r.occurred_at)}` : ""}</div>
                </div>
                {r.audit_hash && <a href={`/verify/${r.audit_hash}`} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: C.greenDk, fontFamily: "monospace", flexShrink: 0 }}>{String(r.audit_hash).slice(0, 10)}…</a>}
              </div>
            ))}
        </>}
        {tab === "activity" && <>
          {activity == null ? <div style={{ color: C.muted, padding: 12 }}>Loading…</div>
            : activity.length === 0 ? <div style={{ ...card, color: C.muted }}>No activity yet. Like, react to or reply on posts and it shows here.</div>
            : activity.map((a, i) => (
              <div key={i} style={{ ...card, marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, color: C.greenDk, fontWeight: 600, textTransform: "capitalize" }}>{a.kind}{a.created_at ? <span style={{ color: C.muted, fontWeight: 400 }}> · {fmtPost(a.created_at)}</span> : null}</div>
                {a.snippet && <div style={{ fontSize: 13, color: C.soil, marginTop: 4, fontStyle: "italic" }}>"{a.snippet}"</div>}
              </div>
            ))}
        </>}

        {editing && <EditModal me={{ ...p, field_visibility: p.field_visibility }} onClose={() => setEditing(false)} onSaved={handleSaved} />}
        {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onCropped={uploadAvatar} />}
      </main>
    </div>
  );
}

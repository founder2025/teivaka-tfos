/**
 * ProfilePage — /me (own) and /u/:id (others). Social-media profile matching the
 * prototype: header (avatar+change photo, chips, verified, phone, joined, last active),
 * actions (Edit / Preview as public / Export — own; Follow / Message — others), stat
 * cards, trust block, facts table, and a left-rail of tabs (Overview/Posts/Reels/Photos/
 * Saved/My records/Activity/Settings + Network). Real data + per-field visibility.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Eye, Layers, Play, Image as ImageIcon, Bookmark, Activity as ActivityIcon, Settings as Cog,
  Rss, Users, Store, Contact, Camera, Pencil, Download, Shield, BadgeCheck, Phone, Calendar,
  Clock, MapPin, MessageCircle, UserPlus, UserCheck, ArrowRight, X,
} from "lucide-react";
import { C, getJSON, send, card } from "./_meCommon";
import { getCurrentUser } from "../../utils/auth";
import { useChat } from "../../context/ChatContext";

const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const PROF = { farmer: "Farmer", buyer: "Buyer", supplier: "Supplier", service_provider: "Service Provider", banker: "Banker", business: "Business", exporter: "Exporter", importer: "Importer" };
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }); } catch { return ""; } };
const monthsSince = (iso) => { try { const d = new Date(iso); const m = Math.max(0, Math.round((Date.now() - d) / (30.44 * 864e5))); return `${m} month${m === 1 ? "" : "s"}`; } catch { return ""; } };
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

function EditModal({ me, onClose, onSaved }) {
  const [f, setF] = useState({
    full_name: me.full_name || "", bio: me.bio || "", whatsapp_number: me.phone || me.whatsapp_number || "",
    country: me.country || "", account_type: (me.profession || "farmer").toUpperCase(),
    phone_vis: (me.field_visibility?.phone) || "connections",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const inp = { width: "100%", padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginTop: 4 };
  const save = async () => {
    setBusy(true);
    try {
      await send("PATCH", "/api/v1/me", {
        full_name: f.full_name, bio: f.bio, whatsapp_number: f.whatsapp_number,
        country: f.country, account_type: f.account_type,
        field_visibility: { ...(me.field_visibility || {}), phone: f.phone_vis },
      });
      onSaved();
    } finally { setBusy(false); }
  };
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(40,30,20,.4)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "7vh" }}>
      <div style={{ width: "min(520px, calc(100vw - 24px))", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, maxHeight: "85vh", overflow: "auto" }}>
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
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <label style={{ fontSize: 12, color: C.muted, flex: 1 }}>Profession<select style={inp} value={f.account_type} onChange={(e) => set("account_type", e.target.value)}>{["FARMER", "BUYER", "SUPPLIER", "SERVICE_PROVIDER", "BANKER", "BUSINESS", "EXPORTER", "IMPORTER"].map((t) => <option key={t} value={t}>{PROF[t.toLowerCase()]}</option>)}</select></label>
            <label style={{ fontSize: 12, color: C.muted, flex: 1 }}>Who can see your phone<select style={inp} value={f.phone_vis} onChange={(e) => set("phone_vis", e.target.value)}><option value="public">Everyone</option><option value="followers">Followers</option><option value="connections">Connections</option><option value="private">Only me</option></select></label>
          </div>
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
  const [meId, setMeId] = useState(null);
  const [p, setP] = useState(null);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [previewPublic, setPreviewPublic] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);

  // resolve own user_id (for /me)
  useEffect(() => {
    if (self) getJSON("/api/v1/auth/me").then((r) => setMeId((r?.data ?? r)?.user_id)).catch(() => setMeId(null));
  }, [self]);

  const targetId = self ? meId : routeId;
  const load = () => { if (targetId) getJSON(`/api/v1/community/profile/${targetId}`).then((r) => setP(r.data || r)).catch(() => setP({})); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetId]);

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("tfos_access_token");
      const up = await fetch("/api/v1/community/uploads", { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
      const url = (await up.json())?.data?.url;
      if (url) { await send("PATCH", "/api/v1/me", { avatar_url: url }); load(); }
    } catch (err) { alert(String(err.message || err)); }
  };
  const toggleFollow = async () => {
    setBusyFollow(true);
    try { await send(p.is_following ? "DELETE" : "POST", `/api/v1/community/follow/${targetId}`); load(); } finally { setBusyFollow(false); }
  };

  if (!p) return <div style={{ maxWidth: 1040, margin: "0 auto", color: C.muted, padding: 20 }}>Loading profile…</div>;
  if (!p.user_id) return <div style={{ maxWidth: 1040, margin: "0 auto", color: C.muted, padding: 20 }}>Profile not found.</div>;

  const isYou = p.is_you;
  const pub = previewPublic; // own-profile public preview
  const Avatar = ({ size }) => (
    p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
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
          kind === "reels" ? <video key={x.post_id + i} src={s} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />
            : <img key={x.post_id + i} src={s} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
        )))}
      </div>;
    }
    return list.map((x) => (
      <div style={card} key={x.post_id}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{fmtPost(x.created_at)}{x.is_repost ? " · reposted" : ""}{x.audience && x.audience !== "everyone" ? ` · ${x.audience}` : ""}</div>
        <div style={{ fontSize: 14, color: C.soil, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{x.body}</div>
        {(x.photos || []).length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 6, marginTop: 8 }}>{x.photos.map((s, i) => isVideo(s) ? <video key={i} src={s} controls style={{ width: "100%", borderRadius: 8 }} /> : <img key={i} src={s} alt="" style={{ width: "100%", borderRadius: 8 }} />)}</div>}
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>♥ {x.like_count || 0} · 💬 {x.reply_count || 0}</div>
      </div>
    ));
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* left rail */}
      <aside style={{ width: 230, flexShrink: 0, position: "sticky", top: 70 }}>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar size={40} />
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.full_name}</div><div style={{ fontSize: 11, color: C.muted }}>{PROF[p.profession] || p.profession}</div></div>
          </div>
          {tabs.map((t) => (
            <div key={t.id} onClick={() => goTab(t)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer", color: tab === t.id ? C.greenDk : C.soil, background: tab === t.id ? "rgba(106,168,79,0.10)" : "transparent", fontSize: 13.5, minHeight: 40 }}>
              <t.Icon size={16} /><span>{t.label}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em", margin: "12px 0 4px 10px" }}>Network</div>
          {NETWORK.map((n) => (
            <div key={n.label} onClick={() => navigate(n.route)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer", color: C.soil, fontSize: 13.5, minHeight: 40 }}>
              <n.Icon size={16} /><span style={{ flex: 1 }}>{n.label}</span><ArrowRight size={13} style={{ color: C.muted }} />
            </div>
          ))}
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, minWidth: 280 }}>
        {/* header */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <label style={{ position: "relative", cursor: isYou ? "pointer" : "default", flexShrink: 0 }}>
            <Avatar size={72} />
            {isYou && <>
              <span style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Camera size={13} /></span>
              <input type="file" accept="image/*" hidden onChange={uploadAvatar} />
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
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat n={p.stats?.posts ?? 0} label="Posts" onClick={() => setTab("posts")} />
            <Stat n={p.stats?.followers ?? 0} label="Followers" />
            <Stat n={p.stats?.following ?? 0} label="Following" />
            <Stat n={p.stats?.records ?? 0} label="Records logged" onClick={isYou ? () => setTab("records") : undefined} />
          </div>
          <div style={{ ...card, textAlign: "center", padding: "22px 16px" }}>
            <Shield size={26} style={{ color: p.verified ? C.green : C.muted }} />
            <div style={{ fontWeight: 700, color: C.soil, marginTop: 8 }}>{p.verified ? "Verified farmer" : "Not verified yet"}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{p.verified ? "Identity and farm verified. Buyers and lenders can trust this record." : "Verification pending — records remain hash-chained and auditable."}</div>
            <a href="/verify" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 14px", color: C.soil, textDecoration: "none", fontSize: 13 }}>View</a>
          </div>
          <div style={card}>
            {[["Farm", p.country ? "All farms" : "All farms"], ["Role", p.role], ["Member since", fmtDate(p.joined)], ["Last active", isYou ? "just now" : "recently"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 2px", borderBottom: `1px solid ${C.line}`, fontSize: 13.5 }}>
                <span style={{ color: C.muted }}>{k}</span><strong style={{ color: C.soil }}>{v}</strong>
              </div>
            ))}
          </div>
        </>}
        {tab === "posts" && <PostList kind="posts" />}
        {tab === "reels" && <PostList kind="reels" />}
        {tab === "photos" && <PostList kind="photos" />}
        {tab === "records" && <div style={{ ...card }}>
          <div style={{ fontWeight: 700, color: C.soil }}>{p.stats?.records ?? 0} records logged</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Your hash-chained farm activity. Open the full ledger in Farm → History.</div>
          <Link to="/farm/history" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 10, color: C.greenDk }}>Open Farm History <ArrowRight size={13} /></Link>
        </div>}
        {tab === "activity" && <div style={{ ...card, color: C.muted }}>Your likes, comments and reactions across the community will appear here. (Activity timeline is being wired — your posts are under the Posts tab.)</div>}

        {editing && <EditModal me={{ ...p, field_visibility: p.field_visibility }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      </main>
    </div>
  );
}

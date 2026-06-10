/** MeProfile — /me. The user's own profile: identity + their feed posts. */
import { useEffect, useState } from "react";
import { BadgeCheck, MapPin } from "lucide-react";
import { C, getJSON, card } from "./_meCommon";

const initials = (n) => (n || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const PROF = { farmer: "Farmer", buyer: "Buyer", supplier: "Supplier", service_provider: "Service Provider", banker: "Banker", business: "Business", exporter: "Exporter", importer: "Importer" };
const fmt = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export default function MeProfile() {
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    getJSON("/api/v1/auth/me").then((r) => {
      const d = r?.data ?? r; setMe(d);
      if (d?.user_id) getJSON(`/api/v1/community/feed?author=${d.user_id}&limit=30`).then((p) => setPosts(p.data || [])).catch(() => setPosts([]));
      else setPosts([]);
    }).catch(() => { setMe({}); setPosts([]); });
  }, []);

  const name = me?.full_name || me?.email || "You";
  const prof = (me?.profession || me?.account_type || "").toLowerCase();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px 0" }}>
      <div style={{ ...card, display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 700, fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 20, color: C.soil }}>{name}</h1>
            {me?.email_verified && <BadgeCheck size={18} style={{ color: C.green }} />}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {prof && <span style={{ background: "rgba(106,168,79,0.12)", color: C.greenDk, borderRadius: 6, padding: "2px 8px", fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>{PROF[prof] || prof}</span>}
            {me?.country && <span><MapPin size={12} /> {me.country}</span>}
            {me?.email && <span>{me.email}</span>}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 14, color: C.soil, margin: "6px 2px 10px" }}>Your posts</h2>
      {posts == null ? <div style={{ color: C.muted, padding: 14 }}>Loading…</div>
        : posts.length === 0 ? <div style={{ ...card, color: C.muted }}>You haven't posted yet. Share an update in Home → Feed and it shows here.</div>
        : posts.map((p) => (
          <div style={card} key={p.post_id}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{fmt(p.created_at)}{p.audience && p.audience !== "everyone" ? ` · ${p.audience}` : ""}{p.is_repost ? " · reposted" : ""}</div>
            <div style={{ fontSize: 14, color: C.soil, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.body}</div>
            {p.photos?.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 6, marginTop: 8 }}>{p.photos.map((s, i) => (/\.(mp4|webm|mov)$/i.test(s) ? <video key={i} src={s} controls style={{ width: "100%", borderRadius: 8 }} /> : <img key={i} src={s} alt="" style={{ width: "100%", borderRadius: 8 }} />))}</div>}
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>♥ {p.like_count || 0} · 💬 {p.reply_count || 0}{p.repost_count ? ` · ↻ ${p.repost_count}` : ""}</div>
          </div>
        ))}
    </div>
  );
}

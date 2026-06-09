/**
 * HomePillar.jsx — /home — PIXEL-EXACT rebuild of the prototype's HOME pillar.
 *
 * Reproduces the prototype's exact shell (topbar + left-rail sub-nav + main-inner)
 * and the 5 HOME views (Feed/Following/Marketplace/Directory/Saved) using the
 * prototype's own DOM + classes (rendered under <TfpShell> → styles/prototype.css).
 * Mock data is swapped for live API data; honest-empty where no backend exists.
 *   Feed        → GET /api/v1/community/posts   (real)
 *   Marketplace → GET /api/v1/community/listings (real) + market-price leads
 *   Following / Saved → honest-empty (no follow/save backend yet)
 *   Directory   → honest-empty (no unified directory endpoint yet)
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, BookOpen, Tractor, Sparkles, Search, MessageSquare, Bell, ChevronDown,
  Star, Bookmark, Plus, Shield, DollarSign, ShoppingBag, Rss, Users, List as ListIcon,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import MarketIntelligence from "../../components/home/MarketIntelligence";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fjd(v) { const n = Number(v); return isNaN(n) ? null : `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const PILLARS = [
  { id: "home", label: "Home", Icon: Home, to: "/home" },
  { id: "classroom", label: "Classroom", Icon: BookOpen, to: "/classroom" },
  { id: "farm", label: "Farm", Icon: Tractor, to: "/farm" },
  { id: "tis", label: "TIS", Icon: Sparkles, to: "/tis" },
];
const HOME_NAV = [
  { id: "feed", label: "Feed", Icon: Rss },
  { id: "following", label: "Following", Icon: Users },
  { id: "marketplace", label: "Marketplace", Icon: ShoppingBag },
  { id: "directory", label: "Directory", Icon: ListIcon },
  { id: "saved", label: "Saved", Icon: Bookmark },
];

function PageHead({ title, sub, action }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1><div className="subtitle">{sub}</div></div>
      <div className="page-actions">{action}</div>
    </div>
  );
}

function Feed({ posts, loading }) {
  if (loading) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>;
  if (!posts.length) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No posts yet — when farmers share harvests, warnings and tips, they appear here.</div>;
  return posts.map((p) => (
    <div className="feed-post" key={p.post_id}>
      <div className="feed-post-head">
        <div className="avatar-circle" style={{ width: 34, height: 34, fontSize: 12 }}>{(p.author_name || "?")[0]}</div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--soil)" }}>{p.author_name || "Farmer"}{p.location_region ? ` (${p.location_region})` : ""}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{timeAgo(p.created_at)}</div>
        </div>
      </div>
      <div className="feed-post-body">{p.body}</div>
      <div className="feed-post-actions">
        <button><Star size={13} />Like · {p.like_count ?? 0}</button>
        <button><MessageSquare size={13} />Comment · {p.comment_count ?? 0}</button>
        <button><Bookmark size={13} />Save</button>
      </div>
    </div>
  ));
}

export default function HomePillar() {
  const navigate = useNavigate();
  const [view, setView] = useState("feed");
  const [posts, setPosts] = useState(null);
  const [listings, setListings] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, l] = await Promise.allSettled([
        getJSON("/api/v1/community/posts?limit=30"),
        getJSON("/api/v1/community/listings"),
      ]);
      setPosts(p.status === "fulfilled" ? (p.value?.data?.posts || p.value?.data || []) : []);
      setListings(l.status === "fulfilled" ? (l.value?.data || []) : []);
    })();
  }, []);

  const head = useMemo(() => ({
    feed: ["Feed", "What farmers in Fiji are sharing"],
    following: ["Following", "People you follow"],
    marketplace: ["Marketplace", "Buy and sell produce · inputs · tools"],
    directory: ["Directory", "Farmers, buyers, suppliers across Fiji"],
    saved: ["Saved", "Your saved posts and listings"],
  }[view]), [view]);

  let body;
  if (view === "feed") {
    body = <Feed posts={posts || []} loading={posts == null} />;
  } else if (view === "following") {
    body = <div className="card"><p style={{ color: "var(--muted)" }}>You're not following anyone yet. Follow farmers and their latest posts appear here.</p></div>;
  } else if (view === "marketplace") {
    body = (
      <>
        <div className="mk-lead">
          <button className="mk-lead-btn" onClick={() => navigate("/farm/weather")}><DollarSign size={16} /><div><strong>Today's prices</strong><span>See the price before you sell</span></div></button>
          <button className="mk-lead-btn" onClick={() => navigate("/farm/buyers")}><ShoppingBag size={16} /><div><strong>Buyer demand</strong><span>Who needs what near you</span></div></button>
        </div>
        {listings == null ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
          : listings.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No listings yet — produce and inputs farmers list for sale appear here.</div>
          : (
            <div className="marketplace-grid">
              {listings.map((it, i) => (
                <div className="mk-card" key={it.listing_id || i}>
                  <div className="mk-img">{it.title || it.production_name || "Listing"}</div>
                  <div className="mk-body">
                    <div className="mk-title">{it.title || it.production_name || "Listing"}</div>
                    <div className="mk-price">{fjd(it.price_fjd ?? it.unit_price_fjd ?? it.price) || "—"}</div>
                    <div className="mk-meta">{[it.location_region || it.location_name || it.island, it.quantity_kg ? `${it.quantity_kg}kg available` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        <MarketIntelligence />
      </>
    );
  } else if (view === "directory") {
    body = (
      <div className="card">
        <table className="data-table">
          <tbody>
            <tr><th>Type</th><th>Name</th><th>Location</th><th></th></tr>
            <tr><td colSpan={4} style={{ color: "var(--muted)", padding: "14px 8px" }}>The cross-Fiji directory (farmers, buyers, suppliers, ferries, extension) appears here once the directory service is connected — not shown until it's real.</td></tr>
          </tbody>
        </table>
      </div>
    );
  } else {
    body = <div className="card"><h3 style={{ marginTop: 0, color: "var(--soil)" }}>Your saved items</h3><p style={{ color: "var(--muted)" }}>Nothing saved yet. Save a post or listing and it appears here for quick recall.</p></div>;
  }

  const action = view === "feed"
    ? <button className="btn btn-secondary" onClick={() => navigate("/tfos")}><Shield size={13} />Why TFOS works</button>
    : view === "marketplace"
    ? <button className="btn btn-primary"><Plus size={14} />New listing</button>
    : null;

  return (
    <TfpShell>
      {/* topbar */}
      <header className="topbar">
        <div className="brand" onClick={() => navigate("/home")} style={{ cursor: "pointer" }}>
          <div className="brand-logo"><img src="/teivaka_logo.png" alt="" style={{ height: 24 }} /></div>
          <div className="brand-text">teivaka</div>
        </div>
        <div className="topbar-search"><Search size={14} /><span>Search farm, tasks, people…</span><span className="search-kbd">⌘K</span></div>
        <div className="topbar-pillars">
          {PILLARS.map((p) => (
            <button key={p.id} className={`pillar-btn ${p.id === "home" ? "active" : ""}`} onClick={() => navigate(p.to)}>
              <p.Icon size={15} />{p.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <div className="status-dot" title="All systems synced" />
          <button className="icon-btn" title="Messages"><MessageSquare size={18} /></button>
          <button className="icon-btn" title="Notifications"><Bell size={18} /></button>
          <button className="avatar-btn" onClick={() => navigate("/me")} title="Account"><div className="avatar-circle">UK</div><ChevronDown size={14} /></button>
        </div>
      </header>

      {/* shell: left rail + content */}
      <div className="shell">
        <aside className="left-rail">
          <div className="rail-head">home</div>
          {HOME_NAV.map((it) => (
            <div key={it.id} className={`rail-item ${it.id === view ? "active" : ""}`} onClick={() => setView(it.id)}>
              <it.Icon size={16} /><span>{it.label}</span>
            </div>
          ))}
        </aside>
        <main className="main-content">
          <div className="main-inner">
            <PageHead title={head[0]} sub={head[1]} action={action} />
            {body}
          </div>
        </main>
      </div>
    </TfpShell>
  );
}

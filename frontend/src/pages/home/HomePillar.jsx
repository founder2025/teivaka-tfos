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
import { useNavigate, useLocation } from "react-router-dom";
import { useCapabilities } from "../../utils/capabilities";
import {
  Home, BookOpen, Tractor, Sparkles, Search, MessageSquare, Bell, ChevronDown,
  Star, Bookmark, Plus, Shield, DollarSign, ShoppingBag, Rss, Users, List as ListIcon, TrendingUp,
  HelpCircle, Calendar,
} from "lucide-react";
import { useMe } from "../../hooks/useMe";
import TfpShell from "../../components/farm/TfpShell";
import MarketIntelligence from "../../components/home/MarketIntelligence";
import FeedView from "../../components/home/FeedView";
import WeatherStrip from "../../components/home/WeatherStrip";
import Directory from "../../components/home/Directory";
import Groups from "../../components/home/Groups";
import { useFlags, DisabledNotice } from "../../utils/useFlags.jsx";
import Marketplace from "../../components/home/Marketplace";
import WorkHub from "./WorkHub";
import { StoriesRow, NewsCard } from "../../components/home/FeedExtras";
import SponsorCorner from "../../components/home/SponsorCorner";
import NearYouRail from "../../components/home/NearYouRail";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import "../../styles/feed.css";

// Shared wrapper: token auto-refresh on 401 + truthful errors.
import { getJSON } from "../../utils/api";
import { formatMoney } from "../../utils/money";
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fjd(v) { return formatMoney(v); }

// ── Community landing blocks (screenshot layout) ──────────────────────────────
function Greeting({ me }) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = (me?.full_name || me?.name || "").trim().split(" ")[0] || me?.username || "there";
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: "var(--muted)", fontSize: 14 }}>{part}, {name} 👋</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--soil)", margin: "2px 0" }}>Welcome to the community</h1>
      <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Connect. Share. Learn. Grow together.</div>
    </div>
  );
}

function StatTile({ Icon, label, value, color }) {
  return (
    <div className="card" style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1a`, color, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--soil)" }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      </div>
    </div>
  );
}
function StatsStrip({ posts, connections }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
      <StatTile Icon={MessageSquare} label="New posts"       value={posts ?? "—"}       color="#2E6BB8" />
      <StatTile Icon={HelpCircle}    label="New questions"   value={0}                  color="#7E57C2" />
      <StatTile Icon={Calendar}      label="Events this week" value={0}                 color="#C9A227" />
      <StatTile Icon={Users}         label="New connections" value={connections ?? "—"} color="#5C9A3F" />
    </div>
  );
}

// Real highlights from recent community posts; honest-empty when there are none.
function WhatsHappening({ posts }) {
  const navigate = useNavigate();
  const recent = (posts || []).slice(0, 3);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--green-dk)", marginBottom: 10 }}>What's happening</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing new yet — community highlights show here as farmers post.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recent.map((p) => (
            <div key={p.post_id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.4 }}>{(p.body || "").slice(0, 90)}{(p.body || "").length > 90 ? "…" : ""}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.author_name || "Farmer"} · {timeAgo(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => navigate("/home/feed")} style={{ marginTop: 8, background: "none", border: "none", color: "var(--green-dk)", fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0 }}>View all updates →</button>
    </div>
  );
}

function TrendingTopics() {
  return (
    <div className="card" style={{ padding: 14, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <TrendingUp size={15} style={{ color: "var(--green-dk)" }} />
        <strong style={{ fontSize: 13, color: "var(--soil)" }}>Trending topics</strong>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Topics rank here as the community tags its posts. Nothing trending yet.</div>
    </div>
  );
}
function UpcomingEvents() {
  return (
    <div className="card" style={{ padding: 14, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Calendar size={15} style={{ color: "var(--green-dk)" }} />
        <strong style={{ fontSize: 13, color: "var(--soil)" }}>Upcoming events</strong>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No events scheduled yet — community events will show here.</div>
    </div>
  );
}

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
  { id: "prices", label: "Market prices", Icon: TrendingUp },
  { id: "directory", label: "Directory", Icon: ListIcon },
  { id: "groups", label: "Groups", Icon: Users },
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
  const { pathname } = useLocation();
  const view = pathname.split("/")[2] || "feed";
  const { can } = useCapabilities();
  const wide = !useIsNarrow(1100); // room for the right rail
  const me = useMe();
  const [posts, setPosts] = useState(null);
  const [listings, setListings] = useState(null);
  const [connections, setConnections] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, l, pe] = await Promise.allSettled([
        getJSON("/api/v1/community/posts?limit=30"),
        getJSON("/api/v1/community/listings"),
        getJSON("/api/v1/community/people"),
      ]);
      setPosts(p.status === "fulfilled" ? (p.value?.data?.posts || p.value?.data || []) : []);
      setListings(l.status === "fulfilled" ? (l.value?.data || []) : []);
      if (pe.status === "fulfilled") {
        const people = pe.value?.data?.people || pe.value?.data || [];
        setConnections(Array.isArray(people) ? people.length : null);
      }
    })();
  }, []);

  const head = useMemo(() => ({
    feed: ["Feed", "What farmers in Fiji are sharing"],
    following: ["Following", "People you follow"],
    marketplace: ["Marketplace", "Buy and sell produce · inputs · tools"],
    prices: ["Market prices", "What's selling · who needs it · what to plant next"],
    directory: ["Directory", "Farmers, buyers, suppliers across Fiji"],
    groups: ["Groups", "Your crop, your region, your people"],
    saved: ["Saved", "Your saved posts and listings"],
  }[view]), [view]);

  const flagOn = useFlags();
  // "Work & hire" (Jobs + Services, re-homed from Farm) owns its own shell — render it directly.
  // Placed after all hooks so hook order stays stable across view changes.
  if (view === "work") return <WorkHub />;
  const FLAG_FOR = { feed: "home_feed", following: "home_feed", marketplace: "marketplace", prices: "marketplace", groups: "groups" };
  const gateFlag = FLAG_FOR[view];

  let body;
  if (gateFlag && !flagOn(gateFlag)) {
    body = <DisabledNotice what={head ? head[0] : "This area"} />;
  } else if (view === "feed") {
    const postCount = posts == null ? null : posts.length;
    body = wide ? (
      // Feed v2 — stream-first: a farmer reaches a post in one screen. The vanity/social
      // widgets (stats, stories, news) are cut; "what's happening" + trends move to the
      // aside so the main column is greeting → weather → the ranked stream.
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Greeting me={me} />
          <WeatherStrip />
          <FeedView initialFilter="all" />
        </div>
        <aside style={{ width: 300, flexShrink: 0, position: "sticky", top: 72 }}>
          <NearYouRail />
          <SponsorCorner />
          <WhatsHappening posts={posts} />
          <TrendingTopics />
          <UpcomingEvents />
        </aside>
      </div>
    ) : (
      // Mobile = maximally stream-first: greeting → weather → needs-near-you → the feed.
      <>
        <Greeting me={me} />
        <WeatherStrip />
        <NearYouRail compact />
        <FeedView initialFilter="all" />
        <SponsorCorner compact />
        <TrendingTopics />
      </>
    );
  } else if (view === "following") {
    body = <FeedView initialFilter="following" />;
  } else if (view === "marketplace") {
    body = <Marketplace />;
  } else if (view === "prices") {
    body = <MarketIntelligence />;
  } else if (view === "directory") {
    body = <Directory />;
  } else if (view === "groups") {
    body = <Groups />;
  } else {
    body = <FeedView initialFilter="saved" />;
  }

  const action = view === "feed"
    ? <button className="btn btn-secondary" onClick={() => navigate("/tfos")}><Shield size={13} />Why TFOS works</button>
    : view === "marketplace" && can("MARKET_LIST")
    ? <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("tfos:new-listing"))}><Plus size={14} />New listing</button>
    : null;

  // Renders inside the shared FarmerShell (top bar + left rail + bottom nav).
  // Content-only, wrapped in .tfp so the prototype's feature styling applies.
  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner">
          {view !== "feed" && <PageHead title={head[0]} sub={head[1]} action={action} />}
          {body}
        </div>
      </main>
    </div>
  );
}

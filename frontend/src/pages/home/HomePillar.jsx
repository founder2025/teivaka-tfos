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
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import MarketIntelligence from "../../components/home/MarketIntelligence";
import FeedView from "../../components/home/FeedView";
import WeatherStrip from "../../components/home/WeatherStrip";
import Directory from "../../components/home/Directory";
import Groups from "../../components/home/Groups";
import { useFlags, DisabledNotice } from "../../utils/useFlags.jsx";
import Marketplace from "../../components/home/Marketplace";
import { StoriesRow, NewsCard } from "../../components/home/FeedExtras";
import SponsorCorner from "../../components/home/SponsorCorner";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import "../../styles/feed.css";

// Shared wrapper: token auto-refresh on 401 + truthful errors.
import { getJSON } from "../../utils/api";
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
  const wide = !useIsNarrow(1100); // room for the Sponsor Corner right rail
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
    prices: ["Market prices", "What's selling · who needs it · what to plant next"],
    directory: ["Directory", "Farmers, buyers, suppliers across Fiji"],
    groups: ["Groups", "Your crop, your region, your people"],
    saved: ["Saved", "Your saved posts and listings"],
  }[view]), [view]);

  const flagOn = useFlags();
  const FLAG_FOR = { feed: "home_feed", following: "home_feed", marketplace: "marketplace", prices: "marketplace", groups: "groups" };
  const gateFlag = FLAG_FOR[view];

  let body;
  if (gateFlag && !flagOn(gateFlag)) {
    body = <DisabledNotice what={head ? head[0] : "This area"} />;
  } else if (view === "feed") {
    body = wide ? (
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NewsCard />
          <WeatherStrip />
          <StoriesRow />
          <FeedView initialFilter="all" />
        </div>
        <aside style={{ width: 300, flexShrink: 0, position: "sticky", top: 72 }}>
          <SponsorCorner />
        </aside>
      </div>
    ) : (
      <>
        <NewsCard />
        <WeatherStrip />
        <SponsorCorner compact />
        <StoriesRow />
        <FeedView initialFilter="all" />
      </>
    );
  } else if (view === "following") {
    body = <FeedView initialFilter="following" />;
  } else if (view === "marketplace") {
    body = (
      <>
        <Marketplace />
        <MarketIntelligence />
      </>
    );
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
          <PageHead title={head[0]} sub={head[1]} action={action} />
          {body}
        </div>
      </main>
    </div>
  );
}

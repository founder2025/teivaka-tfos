/**
 * HomePillar.jsx — /home — PIXEL-EXACT rebuild of the prototype's HOME pillar.
 *
 * Renders the shared shell + the HOME views. Each view is a real, self-fetching
 * component wired to live data (Feed/Following/Saved → FeedView on community.feed_*,
 * Marketplace, Market prices, Directory, Groups, Work & Hire). The feed column is
 * greeting → weather → the ranked stream; the aside carries Near-You + Sponsor.
 */
import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCapabilities } from "../../utils/capabilities";
import {
  Home, BookOpen, Tractor, Sparkles, Search, Bell, ChevronDown,
  Plus, Shield, DollarSign, ShoppingBag, Rss, Users, List as ListIcon, TrendingUp,
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
import SponsorCorner from "../../components/home/SponsorCorner";
import NearYouRail from "../../components/home/NearYouRail";
import InviteCard from "../../components/home/InviteCard";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import "../../styles/feed.css";

// ── Community landing blocks ──────────────────────────────────────────────────
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

export default function HomePillar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = pathname.split("/")[2] || "feed";
  const { can } = useCapabilities();
  const wide = !useIsNarrow(1100); // room for the right rail
  const me = useMe();

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
          <InviteCard />
          <SponsorCorner />
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
        <InviteCard compact />
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

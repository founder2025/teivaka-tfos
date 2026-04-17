/**
 * Community.jsx — /community
 * First screen after login. Community Hub.
 *
 * Layout: 68/32 split (feed left, sidebar right)
 * Left:  Post composer + feed filter bar + infinite post cards
 * Right: Platform identity + stats + mini map + members + invite + farm snapshot
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import FarmerLayout from "../../components/farmer/FarmerLayout";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  soil:   "#2C1A0E",
  green:  "#3D8C40",
  cream:  "#F5EFE0",
  gold:   "#D4A017",
  border: "#E0D5C0",
  cardBg: "#FFFFFF",
};

// ── Rank badge map ────────────────────────────────────────────────────────────
const RANK = {
  seedling:       { emoji: "🌱", label: "Seedling",      color: "#6B9E6E" },
  grower:         { emoji: "🌿", label: "Grower",        color: "#3D8C40" },
  farmer:         { emoji: "🌾", label: "Farmer",        color: "#8B6914" },
  senior_farmer:  { emoji: "👨‍🌾", label: "Senior Farmer", color: "#5C4A1E" },
  champion:       { emoji: "🏆", label: "Champion",      color: "#D4A017" },
};

// ── Category pill config ──────────────────────────────────────────────────────
const CATEGORY = {
  Win:      { bg: "#FFF3CD", text: "#8B6914",  border: "#D4A017" },
  Question: { bg: "#E8F0FE", text: "#1A56DB",  border: "#3F83F8" },
  Tip:      { bg: "#ECFDF5", text: "#065F46",  border: "#3D8C40" },
  Problem:  { bg: "#FFF7ED", text: "#9A3412",  border: "#FB923C" },
  Update:   { bg: "#F3F4F6", text: "#374151",  border: "#9CA3AF" },
};

// ── Mock feed data ────────────────────────────────────────────────────────────
const MOCK_POSTS = [
  {
    id: "1",
    author: "Mere Tuilagi",
    rank: "senior_farmer",
    location: "Sigatoka Valley, Fiji",
    timestamp: "2h ago",
    category: "Win",
    headline: "Record capsicum harvest — 2.4 tonnes from Zone A this week 🌶️",
    body: "After adjusting our irrigation schedule based on TIS recommendations, we've seen a 34% yield increase on our capsicums. The AI suggested shifting watering to early morning and reducing frequency during the flowering stage. Honestly wasn't expecting such a dramatic difference in just 3 weeks.",
    image: null,
    likes: 47,
    comments: 12,
    liked: false,
    saved: false,
  },
  {
    id: "2",
    author: "Seru Naiqama",
    rank: "farmer",
    location: "Kadavu, Fiji",
    timestamp: "4h ago",
    category: "Question",
    headline: "Anyone else dealing with root rot after the heavy rains?",
    body: "Lost about 15% of my kava crop to root rot this week. Water just sitting on the lower zones. Has anyone tried raised bed conversion mid-season? Wondering if it's worth the labour cost at this stage or if I should just accept the loss and focus on the healthy plants.",
    image: null,
    likes: 23,
    comments: 31,
    liked: true,
    saved: false,
  },
  {
    id: "3",
    author: "Ana Rokosuka",
    rank: "grower",
    location: "Lautoka, Fiji",
    timestamp: "6h ago",
    category: "Tip",
    headline: "Companion planting with marigolds cut my pest spray cost by 60%",
    body: "Been experimenting with companion planting for 4 months now. Planted marigold borders around all my tomato and eggplant beds. The aphid population dropped significantly and I've gone from spraying twice a week to once every 10 days. Sharing my layout if anyone wants to try it.",
    image: null,
    likes: 89,
    comments: 24,
    liked: false,
    saved: true,
  },
  {
    id: "4",
    author: "Jone Cakaudrove",
    rank: "champion",
    location: "Rakiraki, Fiji",
    timestamp: "Yesterday",
    category: "Update",
    headline: "Phase 2 expansion — breaking ground on 8 new growing zones next week",
    body: "Six months ago I started with 2 zones and 4 crops. Today we're expanding to 10 zones with diversified production including nursery, apiculture, and aquaponics integration. TIS helped me model the ROI — projecting break-even in month 14. Will post weekly updates on the build progress.",
    image: null,
    likes: 134,
    comments: 45,
    liked: false,
    saved: false,
  },
];

const ONLINE_MEMBERS = [
  { initials: "MT", color: "#3D8C40" },
  { initials: "SN", color: "#8B6914" },
  { initials: "AR", color: "#1A56DB" },
  { initials: "JC", color: "#D4A017" },
  { initials: "LV", color: "#9A3412" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  const r = RANK[rank] || RANK.seedling;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: r.color + "20", color: r.color, border: `1px solid ${r.color}40` }}>
      {r.emoji} {r.label}
    </span>
  );
}

function CategoryPill({ category }) {
  const c = CATEGORY[category] || CATEGORY.Update;
  return (
    <span className="inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {category}
    </span>
  );
}

function PostComposer() {
  const [text, setText] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const TAGS = ["Update", "Win", "Question", "Tip"];

  return (
    <div className="rounded-2xl p-4 shadow-sm mb-4"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm"
          style={{ background: C.green }}>
          YO
        </div>
        <div className="flex-1">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Share a harvest, ask a question, post a win..."
            rows={2}
            className="w-full resize-none text-sm focus:outline-none placeholder-gray-400 leading-relaxed"
            style={{ color: C.soil, fontFamily: "'Lora', Georgia, serif" }}
          />
          <div className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="flex gap-1.5 flex-wrap">
              {TAGS.map(tag => {
                const c = CATEGORY[tag];
                return (
                  <button key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className="text-xs px-3 py-1 rounded-full font-medium transition-all"
                    style={{
                      background: activeTag === tag ? c.bg : "transparent",
                      color: activeTag === tag ? c.text : "#9CA3AF",
                      border: `1px solid ${activeTag === tag ? c.border : "#E5E7EB"}`,
                    }}>
                    {tag}
                  </button>
                );
              })}
            </div>
            <button
              disabled={!text.trim()}
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: C.green }}>
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedFilterBar({ active, onChange }) {
  const FILTERS = ["All", "Following", "My Zone", "Knowledge", "Wins"];
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide pb-1">
      {FILTERS.map(f => (
        <button key={f} onClick={() => onChange(f)}
          className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all"
          style={{
            background: active === f ? C.green : "white",
            color: active === f ? "white" : C.soil,
            border: `1px solid ${active === f ? C.green : C.border}`,
          }}>
          {f}
        </button>
      ))}
    </div>
  );
}

function PostCard({ post }) {
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likes, setLikes] = useState(post.likes);

  function toggleLike() {
    setLiked(l => !l);
    setLikes(n => liked ? n - 1 : n + 1);
  }

  return (
    <article className="rounded-2xl p-5 shadow-sm mb-3 transition-shadow hover:shadow-md"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

      {/* Author row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: C.green }}>
            {post.author.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: C.soil,
                fontFamily: "'Playfair Display', Georgia, serif" }}>
                {post.author}
              </span>
              <RankBadge rank={post.rank} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <span>📍 {post.location}</span>
              <span>·</span>
              <span>{post.timestamp}</span>
            </div>
          </div>
        </div>
        <CategoryPill category={post.category} />
      </div>

      {/* Content */}
      <h3 className="font-bold text-base mb-2 leading-snug"
        style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {post.headline}
      </h3>
      <p className="text-sm text-gray-600 leading-relaxed mb-3" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        {post.body}
      </p>

      {/* Image placeholder */}
      {post.image && (
        <div className="rounded-xl overflow-hidden mb-3 bg-gray-100 h-48 flex items-center justify-center text-gray-400 text-sm">
          Image
        </div>
      )}

      {/* Reaction bar */}
      <div className="flex items-center justify-between pt-3"
        style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-1">
          <button onClick={toggleLike}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all hover:bg-gray-50"
            style={{ color: liked ? C.green : "#6B7280" }}>
            <span>{liked ? "❤️" : "🤍"}</span>
            <span className="font-medium">{likes}</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gray-500 hover:bg-gray-50 transition-all">
            <span>💬</span>
            <span className="font-medium">{post.comments}</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gray-500 hover:bg-gray-50 transition-all">
            <span>↗️</span>
            <span>Share</span>
          </button>
        </div>
        <button onClick={() => setSaved(s => !s)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all hover:bg-gray-50"
          style={{ color: saved ? C.gold : "#9CA3AF" }}>
          <span>{saved ? "🔖" : "🏷️"}</span>
        </button>
      </div>

      {/* Comment preview */}
      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
        <button className="text-xs font-medium hover:underline"
          style={{ color: C.green }}>
          View {post.comments} comment{post.comments !== 1 ? "s" : ""} →
        </button>
      </div>
    </article>
  );
}

// ── Right Sidebar blocks ──────────────────────────────────────────────────────

function SidebarCard({ children, className = "" }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm mb-4 ${className}`}
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
      {children}
    </div>
  );
}

function PlatformIdentityCard() {
  return (
    <SidebarCard>
      {/* Banner */}
      <div className="rounded-xl h-20 flex items-center justify-center mb-3 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.soil}, ${C.green})` }}>
        <div className="text-center text-white">
          <div className="text-2xl">🌿</div>
          <div className="text-xs opacity-70 mt-0.5">Pacific Farming Intelligence</div>
        </div>
      </div>
      <h3 className="font-bold text-base mb-0.5" style={{ color: C.soil,
        fontFamily: "'Playfair Display', Georgia, serif" }}>
        Teivaka
      </h3>
      <p className="text-xs text-gray-500 mb-3 italic">Generate Wealth from Idle Lands</p>
      <div className="space-y-1.5">
        {[
          { icon: "📚", label: "Free Knowledge Base", path: "/kb" },
          { icon: "🌾", label: "Manage My Farm",       path: "/farm" },
          { icon: "🤖", label: "Talk to TIS",          path: "/tis" },
        ].map(link => (
          <Link key={link.path} to={link.path}
            className="flex items-center gap-2 text-sm py-1 hover:underline"
            style={{ color: C.green }}>
            <span>{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </div>
    </SidebarCard>
  );
}

function StatsRow() {
  return (
    <SidebarCard>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Farmers",      value: "1,284" },
          { label: "Online Now",   value: "38" },
          { label: "Crops Tracked", value: "94" },
        ].map(stat => (
          <div key={stat.label}>
            <p className="font-bold text-lg" style={{ color: C.soil,
              fontFamily: "'Playfair Display', Georgia, serif" }}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
}

function MiniMapWidget() {
  return (
    <SidebarCard>
      <div className="rounded-xl overflow-hidden h-28 mb-2 flex items-center justify-center relative"
        style={{ background: "#1A1F2E" }}>
        {/* Simulated dot map */}
        {[
          { top: "30%", left: "25%", pulse: true },
          { top: "45%", left: "70%", pulse: false },
          { top: "55%", left: "40%", pulse: true },
          { top: "35%", left: "55%", pulse: false },
          { top: "60%", left: "80%", pulse: true },
          { top: "25%", left: "45%", pulse: false },
          { top: "50%", left: "15%", pulse: true },
        ].map((dot, i) => (
          <div key={i} className="absolute"
            style={{ top: dot.top, left: dot.left }}>
            <div className="w-2 h-2 rounded-full"
              style={{
                background: dot.pulse ? "#4ADE80" : "#3D8C40",
                boxShadow: dot.pulse ? "0 0 0 3px rgba(74,222,128,0.3)" : "none",
              }} />
          </div>
        ))}
        <div className="absolute bottom-2 left-2 right-2">
          <div className="text-white/60 text-xs text-center">🟢 38 farmers online across 54 countries</div>
        </div>
      </div>
      <Link to="/community/map"
        className="text-sm font-medium hover:underline flex items-center gap-1"
        style={{ color: C.green }}>
        View Full Map →
      </Link>
    </SidebarCard>
  );
}

function ActiveMembersCard() {
  return (
    <SidebarCard>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Now</p>
      <div className="flex items-center gap-1">
        {ONLINE_MEMBERS.map((m, i) => (
          <div key={i}
            className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
            style={{ background: m.color, marginLeft: i > 0 ? "-8px" : "0", zIndex: 10 - i, position: "relative" }}>
            {m.initials}
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-3">+ 33 more online</span>
      </div>
    </SidebarCard>
  );
}

function InviteButton() {
  return (
    <div className="mb-4">
      <button className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
        style={{ border: `2px solid ${C.green}`, color: C.green, background: "transparent" }}>
        + INVITE A FARMER
      </button>
    </div>
  );
}

function FarmSnapshotCard() {
  return (
    <SidebarCard>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Farm</p>
        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: C.green }}>Active</span>
      </div>
      <p className="font-bold text-sm mb-3" style={{ color: C.soil,
        fontFamily: "'Playfair Display', Georgia, serif" }}>
        Save-A-Lot Farm
      </p>
      <div className="space-y-1.5 text-xs text-gray-500 mb-3">
        <div className="flex justify-between">
          <span>Active crops</span>
          <span className="font-medium" style={{ color: C.soil }}>7 varieties</span>
        </div>
        <div className="flex justify-between">
          <span>Next task</span>
          <span className="font-medium" style={{ color: C.soil }}>Fertilise Zone B — Tomorrow</span>
        </div>
        <div className="flex justify-between">
          <span>Zones</span>
          <span className="font-medium" style={{ color: C.soil }}>14 active</span>
        </div>
      </div>
      <Link to="/farm"
        className="block text-center text-sm font-medium py-2 rounded-xl text-white transition-opacity hover:opacity-90"
        style={{ background: C.green }}>
        Go to Farm Manager →
      </Link>
    </SidebarCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Community() {
  const [feedFilter, setFeedFilter] = useState("All");

  return (
    <FarmerLayout>
      <div className="flex gap-5">

        {/* ── Left feed column (68%) ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0" style={{ flexBasis: "68%" }}>
          <PostComposer />
          <FeedFilterBar active={feedFilter} onChange={setFeedFilter} />
          {MOCK_POSTS.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
          <div className="text-center py-6">
            <button className="text-sm font-medium hover:underline" style={{ color: C.green }}>
              Load more posts →
            </button>
          </div>
        </div>

        {/* ── Right sidebar (32%) — sticky on desktop ────────────────────── */}
        <aside className="hidden lg:block shrink-0 sticky"
          style={{ flexBasis: "32%", top: "116px", alignSelf: "flex-start", maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
          <PlatformIdentityCard />
          <StatsRow />
          <MiniMapWidget />
          <ActiveMembersCard />
          <InviteButton />
          <FarmSnapshotCard />
        </aside>

      </div>
    </FarmerLayout>
  );
}

/**
 * Home.jsx — /home community feed (MVP Week 2).
 *
 * GET /api/v1/community/posts?limit=20. Read-only for MVP:
 * like/comment counts render but do not accept input yet.
 *
 * Sub-components stay at module scope (focus-stability rule).
 */
import { useEffect, useState } from "react";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  amber:  "#BF9000",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

const PAGE_LIMIT = 20;
const SKELETON_BG = "#EFE7D6";

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (isNaN(then.getTime())) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

function SkeletonBar({ h = 12, w = "100%" }) {
  return (
    <div
      className="rounded animate-pulse"
      style={{ background: SKELETON_BG, height: h, width: w }}
    />
  );
}

function SkeletonCard() {
  return (
    <section
      className="bg-white rounded-2xl px-4 py-4 space-y-2"
      style={{ border: `1px solid ${C.border}` }}
    >
      <SkeletonBar h={14} w="40%" />
      <SkeletonBar h={18} w={80} />
      <div className="space-y-1.5 pt-1">
        <SkeletonBar h={12} w="100%" />
        <SkeletonBar h={12} w="92%" />
        <SkeletonBar h={12} w="60%" />
      </div>
    </section>
  );
}

function TypePill({ kind }) {
  if (!kind) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white"
      style={{ background: C.amber, letterSpacing: "0.08em" }}
    >
      {kind}
    </span>
  );
}

function CropPill({ crop }) {
  if (!crop) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: C.cream, color: C.soil, border: `1px solid ${C.border}` }}
    >
      {crop}
    </span>
  );
}

function HeartIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PostCard({ post }) {
  const author = post.author_name || "Unknown";
  const region = post.location_region;
  const age = timeAgo(post.created_at);
  return (
    <section
      className="bg-white rounded-2xl px-4 py-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs" style={{ color: C.muted }}>
        <span className="font-semibold" style={{ color: C.soil }}>{author}</span>
        {region && <><span>·</span><span>{region}</span></>}
        {age && <><span>·</span><span>{age}</span></>}
      </div>

      {(post.post_type || post.crop_tag) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <TypePill kind={post.post_type} />
          <CropPill crop={post.crop_tag} />
        </div>
      )}

      {post.body && (
        <p
          className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed max-w-prose"
          style={{ color: C.soil }}
        >
          {post.body}
        </p>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: C.muted }}>
        <span className="inline-flex items-center gap-1">
          <HeartIcon />
          <span>{Number(post.like_count ?? 0)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <CommentIcon />
          <span>{Number(post.comment_count ?? 0)}</span>
        </span>
      </div>
    </section>
  );
}

export default function Home() {
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const res = await fetch(`/api/v1/community/posts?limit=${PAGE_LIMIT}`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          if (!cancelled) setError(`Could not load feed (HTTP ${res.status}).`);
          return;
        }
        const body = await res.json();
        const list = Array.isArray(body)
          ? body
          : (Array.isArray(body?.posts) ? body.posts : []);
        if (!cancelled) setPosts(list);
      } catch (e) {
        if (!cancelled) setError(`Network error: ${e.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <div className="text-xs font-medium" style={{ color: C.muted }}>Community</div>
        <h1 className="text-2xl font-bold mt-0.5" style={{ color: C.soil }}>
          What's happening across Pacific farms
        </h1>
      </div>

      {loading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {!loading && error && (
        <section
          className="bg-white rounded-2xl px-4 py-4"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="text-sm" style={{ color: C.amber }}>{error}</div>
        </section>
      )}

      {!loading && !error && posts.length === 0 && (
        <section
          className="rounded-2xl px-4 py-6 text-center"
          style={{ background: C.cream, border: `1px solid ${C.border}` }}
        >
          <div className="text-sm" style={{ color: C.muted }}>
            No posts yet — check back soon
          </div>
        </section>
      )}

      {!loading && !error && posts.map((p) => (
        <PostCard key={p.post_id} post={p} />
      ))}

      {!loading && !error && posts.length === PAGE_LIMIT && (
        // TODO: wire pagination handler — render only for MVP
        <button
          type="button"
          className="w-full py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background: C.green }}
        >
          Load more
        </button>
      )}
    </div>
  );
}

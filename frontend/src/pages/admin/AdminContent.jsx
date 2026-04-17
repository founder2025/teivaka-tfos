/**
 * AdminContent.jsx — /admin/content
 *
 * Three sections:
 *   1. Flagged Posts queue (Keep / Delete / Warn / Ban)
 *   2. KB Pending Submissions (Approve / Reject / Edit)
 *   3. Pinned Content manager
 */

import { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

const SECTIONS = ["flagged", "kb-pending", "pinned"];
const SECTION_LABELS = { flagged: "Flagged Posts", "kb-pending": "KB Submissions", pinned: "Pinned Content" };

export default function AdminContent() {
  const [section, setSection] = useState("flagged");
  const [flagged, setFlagged] = useState([]);
  const [kbPending, setKbPending] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (section === "flagged") {
      fetch("/api/v1/admin/content/flagged", { headers: authHeader() })
        .then(r => r.json()).then(d => setFlagged(d.posts || []))
        .finally(() => setLoading(false));
    } else if (section === "kb-pending") {
      fetch("/api/v1/admin/content/kb-pending", { headers: authHeader() })
        .then(r => r.json()).then(d => setKbPending(d.articles || []))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [section]);

  async function postAction(postId, action) {
    await fetch(`/api/v1/admin/content/${postId}/action`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: "Admin moderation" }),
    });
    setFlagged(f => f.filter(p => p.post_id !== postId));
  }

  async function kbAction(articleId, action) {
    await fetch(`/api/v1/admin/content/kb/${articleId}/${action}`, {
      method: "POST",
      headers: authHeader(),
    });
    setKbPending(k => k.filter(a => a.article_id !== articleId));
  }

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-white mb-5">Content Moderation</h1>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg w-fit mb-5 p-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              section === s ? "bg-amber-500 text-amber-950" : "text-gray-400 hover:text-white"
            }`}>
            {SECTION_LABELS[s]}
            {s === "flagged" && flagged.length > 0 && (
              <span className="ml-1.5 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">
                {flagged.length}
              </span>
            )}
            {s === "kb-pending" && kbPending.length > 0 && (
              <span className="ml-1.5 bg-yellow-600 text-white text-xs rounded-full px-1.5 py-0.5">
                {kbPending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-16">Loading…</div>
      ) : section === "flagged" ? (
        <div className="space-y-3">
          {flagged.length === 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl py-12 text-center text-gray-500">
              ✅ No flagged posts — moderation queue is clear
            </div>
          )}
          {flagged.map(post => (
            <div key={post.post_id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-400 font-medium text-sm">🚩 {post.flag_count} flags</span>
                    <span className="text-gray-500 text-xs">by {post.author_name}</span>
                    <span className="text-gray-600 text-xs">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                  {post.title && <p className="text-white font-medium mb-1">{post.title}</p>}
                  <p className="text-gray-300 text-sm line-clamp-3">{post.content}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => postAction(post.post_id, "keep")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-300">
                    ✓ Keep
                  </button>
                  <button onClick={() => postAction(post.post_id, "delete")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300">
                    🗑 Delete
                  </button>
                  <button onClick={() => postAction(post.post_id, "warn")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-orange-900 hover:bg-orange-800 text-orange-300">
                    ⚠ Warn
                  </button>
                  <button onClick={() => postAction(post.post_id, "ban")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300">
                    🚫 Ban
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : section === "kb-pending" ? (
        <div className="space-y-3">
          {kbPending.length === 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl py-12 text-center text-gray-500">
              ✅ No pending KB submissions
            </div>
          )}
          {kbPending.map(article => (
            <div key={article.article_id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-white font-medium mb-1">{article.title}</p>
                  <div className="flex gap-3 text-xs text-gray-400 mb-2">
                    <span>Category: {article.category}</span>
                    <span>By: {article.submitted_by}</span>
                    <span>{new Date(article.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-300 text-sm line-clamp-3">{article.content_preview}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => kbAction(article.article_id, "approve")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-300">
                    ✓ Approve
                  </button>
                  <button onClick={() => kbAction(article.article_id, "reject")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300">
                    ✗ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="font-semibold text-gray-200 mb-3">Pinned Content & Announcements</h2>
          <div className="text-gray-500 text-sm">
            Drag-and-drop pinned post ordering and announcement banner editor — connect to
            community_posts table with is_pinned = true.
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

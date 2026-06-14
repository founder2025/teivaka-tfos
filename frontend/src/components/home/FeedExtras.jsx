/**
 * FeedExtras — StoriesRow (24h stories above the feed) + NewsCard (agri headlines).
 * Real endpoints only: /community/stories*, /news/agri. Honest-empty when bare.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Newspaper, Trash2 } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import { uploadMedia } from "../../utils/imageCompress";
import Avatar from "../ui/Avatar";

const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

/* ---------------- Stories ---------------- */
function StoryViewer({ group, onClose, onDeleted }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);
  const s = group.stories[idx];
  const next = () => (idx < group.stories.length - 1 ? setIdx(idx + 1) : onClose());
  const prev = () => idx > 0 && setIdx(idx - 1);
  useEffect(() => {
    send("POST", `/api/v1/community/stories/${s.story_id}/view`).catch(() => {});
    if (s.media_type !== "video") {
      timer.current = setTimeout(next, 6000);
      return () => clearTimeout(timer.current);
    }
    return undefined;
    // eslint-disable-next-line
  }, [idx]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [idx]);
  const del = async () => {
    try { await send("DELETE", `/api/v1/community/stories/${s.story_id}`); toast("Story deleted", "success"); onDeleted(); }
    catch (e) { toast(`Couldn't delete: ${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 100vw)", height: "min(86vh, 760px)", display: "flex", flexDirection: "column" }}>
        {/* progress bars */}
        <div style={{ display: "flex", gap: 4, padding: "10px 10px 6px" }}>
          {group.stories.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < idx ? "var(--paper)" : i === idx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 8px", color: "#fff" }}>
          <Avatar src={group.author_avatar} name={group.author_name} size={30} fontScale={0.4} />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{group.author_name}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {group.is_you && <button onClick={del} aria-label="Delete story" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", width: 36, height: 36 }}><Trash2 size={17} /></button>}
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", width: 36, height: 36 }}><X size={20} /></button>
          </span>
        </div>
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {s.media_type === "video"
            ? <video key={s.story_id} src={s.media_url} autoPlay controls onEnded={next} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            : <img key={s.story_id} src={s.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
          {/* tap zones */}
          <button onClick={prev} aria-label="Previous" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", background: "transparent", border: "none", cursor: "pointer" }} />
          <button onClick={next} aria-label="Next" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", background: "transparent", border: "none", cursor: "pointer" }} />
        </div>
        {s.caption && <div style={{ color: "#fff", fontSize: 13.5, padding: "10px 14px", textAlign: "center" }}>{s.caption}</div>}
      </div>
    </div>
  );
}

export function StoriesRow() {
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef();
  const load = () => getJSON("/api/v1/community/stories").then((r) => setGroups(r.data || [])).catch(() => setGroups([]));
  useEffect(() => { load(); }, []);
  const addStory = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setPosting(true);
    try {
      const url = await uploadMedia(f);
      await send("POST", "/api/v1/community/stories", { media_url: url, media_type: f.type.startsWith("video") ? "video" : "image" });
      toast("Story posted ✓ — visible for 24 hours", "success");
      load();
    } catch (err) { toast(`Couldn't post story: ${err.userMessage || err.message || err}`, "error"); }
    finally { setPosting(false); }
  };
  if (groups == null) return null;
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 2px 12px", WebkitOverflowScrolling: "touch" }}>
      <button onClick={() => fileRef.current?.click()} disabled={posting} style={{ flexShrink: 0, width: 64, background: "transparent", border: "none", cursor: "pointer", textAlign: "center" }}>
        <span style={{ width: 56, height: 56, margin: "0 auto", borderRadius: "50%", border: "2px dashed var(--green)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green-dk)" }}>
          <Plus size={22} />
        </span>
        <span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>{posting ? "Posting…" : "Your story"}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={addStory} />
      {groups.map((g) => (
        <button key={g.author_user_id} onClick={() => setOpen(g)} style={{ flexShrink: 0, width: 64, background: "transparent", border: "none", cursor: "pointer", textAlign: "center" }}>
          <span style={{ display: "inline-flex", padding: 2, borderRadius: "50%", border: `2.5px solid ${g.all_seen ? "var(--line)" : "var(--green)"}` }}>
            <Avatar src={g.author_avatar} name={g.author_name} size={52} fontScale={0.38} />
          </span>
          <span style={{ display: "block", fontSize: 10.5, color: "var(--soil)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.is_you ? "You" : (g.author_name || "").split(" ")[0]}</span>
        </button>
      ))}
      {open && <StoryViewer group={open} onClose={() => { setOpen(null); load(); }} onDeleted={() => { setOpen(null); load(); }} />}
    </div>
  );
}

/* ---------------- Agri news ---------------- */
export function NewsCard() {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON("/api/v1/news/agri").then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);
  if (items == null || items.length === 0) return null; // honest: no card when no real news
  return (
    <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Newspaper size={15} style={{ color: "var(--green-dk)" }} />
        <strong style={{ fontSize: 13, color: "var(--soil)" }}>Agriculture news</strong>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {items.slice(0, 3).map((n, i) => (
          <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--soil)", textDecoration: "none", lineHeight: 1.4 }}>
            • {n.title}{n.source ? <span style={{ color: "var(--muted)" }}> — {n.source}</span> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

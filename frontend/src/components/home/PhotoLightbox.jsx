/**
 * PhotoLightbox — Facebook-style media viewer for post photos/videos.
 * Auto-enlarged centered view, prev/next (buttons, arrow keys, swipe), counter,
 * Esc / backdrop close, video controls, and PER-PHOTO reactions backed by
 * feed_reactions target_type='photo' (migration 094).
 */
import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Leaf, ShoppingBag, Gift, Droplet, BookOpen } from "lucide-react";
import { getJSON, send } from "../../utils/api";

const REACTIONS = [
  { key: "strong_crop", label: "Strong crop", Icon: Leaf },
  { key: "good_harvest", label: "Good harvest", Icon: ShoppingBag },
  { key: "vinaka", label: "Vinaka", Icon: Gift },
  { key: "hoping_rain", label: "Hoping for rain", Icon: Droplet },
  { key: "learning", label: "Learning", Icon: BookOpen },
];
const isVideo = (s) => /\.(mp4|webm|mov)$/i.test(s || "");
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

export default function PhotoLightbox({ post, startIndex = 0, onClose }) {
  const photos = post.photos || [];
  const [idx, setIdx] = useState(startIndex);
  const [rx, setRx] = useState({});       // idx -> {counts, mine}
  const touch = useRef(null);
  const next = () => setIdx((i) => (i + 1) % photos.length);
  const prev = () => setIdx((i) => (i - 1 + photos.length) % photos.length);

  useEffect(() => {
    getJSON(`/api/v1/community/feed/${post.post_id}/photos/reactions`).then((r) => setRx(r.data || {})).catch(() => {});
  }, [post.post_id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    // eslint-disable-next-line
  }, []);

  const cur = rx[String(idx)] || { counts: {}, mine: null };
  const react = async (key) => {
    const same = cur.mine === key;
    // optimistic
    setRx((m) => {
      const slot = { counts: { ...(m[String(idx)]?.counts || {}) }, mine: same ? null : key };
      if (cur.mine) slot.counts[cur.mine] = Math.max(0, (slot.counts[cur.mine] || 1) - 1);
      if (!same) slot.counts[key] = (slot.counts[key] || 0) + 1;
      return { ...m, [String(idx)]: slot };
    });
    try {
      await send(same ? "DELETE" : "PUT", `/api/v1/community/feed/${post.post_id}/photos/${idx}/react`, same ? undefined : { reaction: key });
    } catch (e) { toast(`Couldn't react: ${e.userMessage || e.message}`, "error"); }
  };

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (dx < -40) next(); else if (dx > 40) prev();
    touch.current = null;
  };

  const src = photos[idx];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", color: "#fff" }}>
        <span style={{ fontSize: 13 }}>{photos.length > 1 ? `${idx + 1} / ${photos.length}` : ""}</span>
        <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#fff", cursor: "pointer", width: 44, height: 44 }}><X size={22} /></button>
      </div>
      <div onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {isVideo(src)
          ? <video key={src} src={src} controls autoPlay style={{ maxWidth: "96vw", maxHeight: "100%", objectFit: "contain" }} />
          : <img key={src} src={src} alt="" style={{ maxWidth: "96vw", maxHeight: "100%", objectFit: "contain", touchAction: "pinch-zoom" }} />}
        {photos.length > 1 && <>
          <button onClick={prev} aria-label="Previous" style={{ position: "absolute", left: 8, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={24} /></button>
          <button onClick={next} aria-label="Next" style={{ position: "absolute", right: 8, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={24} /></button>
        </>}
      </div>
      {/* per-photo reactions */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", padding: "10px 12px 16px" }}>
        {REACTIONS.map((r) => {
          const n = cur.counts[r.key] || 0;
          const mine = cur.mine === r.key;
          return (
            <button key={r.key} onClick={() => react(r.key)} style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 40, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, border: mine ? "1px solid var(--green, var(--green))" : "1px solid rgba(255,255,255,0.3)", background: mine ? "rgba(106,168,79,0.25)" : "rgba(255,255,255,0.08)", color: "#fff" }}>
              <r.Icon size={14} />{r.label}{n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

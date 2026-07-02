/**
 * ReviewModal — shared 1–5★ + comment review dialog (WH3). The caller passes
 * onSubmit(rating, comment) which does the POST; this handles the star picker,
 * submit-lock, and Esc/backdrop close. Used by Jobs (employer↔worker) and
 * Services (requester↔provider) — one review UI, one behaviour everywhere.
 */
import { useEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";

const emit = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };

export default function ReviewModal({ title = "Leave a review", subtitle, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  async function submit() {
    if (lock.current) return;
    if (!(rating >= 1 && rating <= 5)) { emit("Pick a star rating"); return; }
    lock.current = true; setBusy(true);
    try { await onSubmit(rating, comment.trim() || null); }
    catch (e) { emit(e?.userMessage || "Could not submit review"); lock.current = false; }
    finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button onClick={onClose} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">
          {subtitle && <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>{subtitle}</div>}
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }} role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}>
                <Star size={30} style={{ color: "var(--amber)", fill: (hover || rating) >= n ? "var(--amber)" : "transparent" }} />
              </button>
            ))}
          </div>
          <div className="form-row"><label>Comment (optional)</label><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How did it go?" /></div>
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !rating}>{busy ? "Submitting…" : "Submit review"}</button>
        </div>
      </div>
    </div>
  );
}

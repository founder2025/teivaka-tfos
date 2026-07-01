/**
 * share util — the growth/share loop (Feed Phase 1).
 *
 * "Share anywhere": on mobile, navigator.share() opens the native OS sheet that
 * reaches EVERY installed app (WhatsApp, Messenger, SMS, Email, Telegram, Signal,
 * IG DM, AirDrop, Copy…) — no per-app code. WhatsApp + Email + Copy remain as
 * explicit one-tap shortcuts / desktop fallbacks (Pacific defaults to WhatsApp).
 *
 * Post links prefer the PUBLIC /verify/<hash> when the post carries a verifiable
 * record (the moat; works for logged-out recipients), else the post permalink.
 * Invites use the caller's referral copy_text (ref link → public Landing →
 * Register prefilled = attributed signups).
 */
import { getJSON } from "./api";

export function canNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function postUrl(post) {
  const origin = window.location.origin;
  return post?.link_audit_hash
    ? `${origin}/verify/${post.link_audit_hash}`   // public + verifiable
    : `${origin}/home?post=${post?.post_id}`;
}

export function postShareText(post) {
  const snippet = String(post?.body || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const proven = post?.link_audit_hash ? "\n✓ Verifiable record" : "";
  return `${snippet ? `"${snippet}"\n` : ""}${proven}\n${postUrl(post)}\n\nSeen on Teivaka — the farming network.`;
}

export function openWhatsApp(text) {
  try {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  } catch { /* popup blocked — best-effort */ }
}

export function shareToWhatsApp(post) {
  openWhatsApp(postShareText(post));
}

export function shareViaEmail(post) {
  const subject = "Shared from Teivaka";
  const body = postShareText(post);
  try { window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
  catch { /* no mail client — best-effort */ }
}

/** Native OS share sheet (reaches every app). Returns false if unavailable OR it
 *  failed for a non-cancel reason, so callers can fall back. User-cancel = success. */
export async function nativeSharePost(post) {
  if (!canNativeShare()) return false;
  try {
    await navigator.share({ title: "Teivaka", text: postShareText(post), url: postUrl(post) });
    return true;
  } catch (e) {
    return e && e.name === "AbortError";   // cancelled → don't fall back
  }
}

async function referralText() {
  try {
    const r = await getJSON("/api/v1/me/referral");
    return r?.share_links?.copy_text || r?.data?.share_links?.copy_text
      || `Join me on Teivaka — the farming network. ${window.location.origin}`;
  } catch {
    return `Join me on Teivaka — the farming network. ${window.location.origin}`;
  }
}

/** Attributed invite: native sheet if available (reaches WhatsApp/email/SMS/DM),
 *  else WhatsApp. */
export async function invite() {
  const text = await referralText();
  if (canNativeShare()) {
    try { await navigator.share({ title: "Join me on Teivaka", text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  openWhatsApp(text);
}

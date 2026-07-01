/**
 * whatsappShare.js — the WhatsApp growth loop (Feed Phase 1).
 *
 * Pacific runs on WhatsApp, so every share and invite goes out on the rails people
 * already use. Two loops:
 *   - shareToWhatsApp(post): push a post out to WhatsApp. Prefers the PUBLIC
 *     /verify/<hash> link when the post carries a verifiable record (the moat,
 *     and it works for logged-out recipients); otherwise the post permalink.
 *   - inviteViaWhatsApp(): the attributed growth loop — the caller's referral
 *     copy_text (ref link lands on the public Landing → Register prefilled).
 */
import { getJSON } from "./api";

export function openWhatsApp(text) {
  try {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  } catch { /* popup blocked — best-effort */ }
}

export function postShareText(post) {
  const origin = window.location.origin;
  const snippet = String(post?.body || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const link = post?.link_audit_hash
    ? `${origin}/verify/${post.link_audit_hash}`      // public + verifiable (the moat)
    : `${origin}/home?post=${post?.post_id}`;
  const proven = post?.link_audit_hash ? "\n✓ Verifiable record" : "";
  return `${snippet ? `"${snippet}"\n` : ""}${proven}\n${link}\n\nSeen on Teivaka — the farming network.`;
}

export function shareToWhatsApp(post) {
  openWhatsApp(postShareText(post));
}

export async function inviteViaWhatsApp() {
  let txt;
  try {
    const r = await getJSON("/api/v1/me/referral");
    txt = r?.share_links?.copy_text || r?.data?.share_links?.copy_text;
  } catch { /* fall back to a generic invite below */ }
  openWhatsApp(txt || `Join me on Teivaka — the farming network. ${window.location.origin}`);
}

/**
 * identityGate.js — detect the progressive-verification watcher's signal.
 *
 * High-value endpoints guarded by the backend require_identity() dependency return
 * 403 with detail.code === "IDENTITY_VERIFICATION_REQUIRED" once the matching
 * capability is flipped to Gate.HIGH_TRUST. Callers use this to pop <IdentityGate>.
 *
 * Usage:
 *   const res = await fetch(url, { headers });
 *   if (res.status === 403) {
 *     const body = await res.json().catch(() => ({}));
 *     if (isIdentityRequired(res.status, body)) { setShowIdentityGate(true); return; }
 *   }
 */
export function isIdentityRequired(status, body) {
  if (status !== 403) return false;
  const code = body?.detail?.code || body?.code;
  return code === "IDENTITY_VERIFICATION_REQUIRED";
}

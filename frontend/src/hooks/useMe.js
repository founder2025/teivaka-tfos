/**
 * useMe — cached /api/v1/auth/me for nav/persona decisions.
 *
 * getCurrentUser() only decodes the JWT (no account_type), so persona-aware nav
 * needs /auth/me. Module-level cache keyed on the access token (so switching
 * accounts in-tab re-fetches), shared across PillarTabs + the shell route guard.
 */
import { useEffect, useState } from "react";

let _me = null;
let _meToken = null;
let _promise = null;

function token() {
  try { return localStorage.getItem("tfos_access_token"); } catch { return null; }
}

function fetchMe() {
  const t = token();
  if (!t) return Promise.resolve(null);
  if (_me && _meToken === t) return Promise.resolve(_me);
  if (_promise) return _promise;
  _promise = fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${t}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { _me = j?.data || null; _meToken = t; return _me; })
    .catch(() => null)
    .finally(() => { _promise = null; });
  return _promise;
}

export function resetMe() { _me = null; _meToken = null; _promise = null; }

/** Returns the current user's /auth/me data (or null while loading / signed out). */
export function useMe() {
  const [me, setMe] = useState(_meToken === token() ? _me : null);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then((m) => { if (!cancelled) setMe(m); });
    return () => { cancelled = true; };
  }, []);
  return me;
}

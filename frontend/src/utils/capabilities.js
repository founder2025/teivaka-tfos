/**
 * capabilities.js — frontend mirror of the backend capability layer
 * (app/core/capabilities.py). Single place the UI asks "is this allowed?".
 *
 * Today every member capability is OPEN, so `can()` returns true for any
 * signed-in user and nothing is hidden. When a gate is turned on server-side,
 * /api/v1/auth/me returns that capability as false and the UI can show an
 * upsell / verify prompt — WITHOUT changing this file's callers.
 *
 * Usage:
 *   const { can, loading } = useCapabilities();
 *   {can("POST_STORY") && <StoryButton />}
 *
 * Admin is NOT a capability — it is gated by role, server-side, separately.
 */
import { useEffect, useState } from "react";

// Module-level cache so we fetch /auth/me capabilities at most once per load.
let _capCache = null;
let _capPromise = null;

async function fetchCapabilities() {
  if (_capCache) return _capCache;
  if (_capPromise) return _capPromise;
  const token = (() => {
    try { return localStorage.getItem("tfos_access_token"); } catch { return null; }
  })();
  if (!token) return {};
  _capPromise = fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      _capCache = json?.data?.capabilities || {};
      return _capCache;
    })
    .catch(() => ({}))
    .finally(() => { _capPromise = null; });
  return _capPromise;
}

/** Clear the cache on login/logout so capabilities are re-fetched. */
export function resetCapabilities() {
  _capCache = null;
  _capPromise = null;
}

/** Pure check against an already-loaded capability map. */
export function canWith(map, capability) {
  if (!map) return false;
  return map[capability] === true;
}

/**
 * Hook. Returns { can, capabilities, loading }.
 * `can(cap)` is OPTIMISTIC while loading (returns true) so the open platform
 * never flickers features off for a signed-in user on a slow connection.
 */
export function useCapabilities() {
  const [map, setMap] = useState(_capCache);
  const [loading, setLoading] = useState(!_capCache);

  useEffect(() => {
    let cancelled = false;
    if (_capCache) { setLoading(false); return; }
    fetchCapabilities().then((m) => {
      if (cancelled) return;
      setMap(m);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  function can(capability) {
    if (loading && !map) return true; // optimistic until loaded (platform is open)
    return canWith(map, capability);
  }

  return { can, capabilities: map || {}, loading };
}

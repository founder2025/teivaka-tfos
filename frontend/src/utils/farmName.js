/**
 * farmName.js — resolve a farmer's chosen farm NAME from an internal farm_id.
 *
 * The farm_id (e.g. "F001-A0EE") is an immutable PK / RLS + audit anchor and must
 * NEVER be shown to a farmer as their farm's identity. Their chosen farm_name lives
 * on tenant.farms and comes back from GET /api/v1/farms. This hook fetches that list
 * ONCE (module-level cache shared across every caller) and maps farm_id -> farm_name.
 *
 * Callers render `farmName || farmId` so there is never a blank, and an honest code
 * fallback if a name is genuinely missing.
 */
import { useEffect, useState } from "react";

let _cache = null;     // { [farm_id]: farm_name }
let _promise = null;   // in-flight fetch, so concurrent callers share one request

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function loadFarms() {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = fetch("/api/v1/farms", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { farms: [] }))
      .then((body) => {
        const list = Array.isArray(body)
          ? body
          : body?.farms || body?.data?.farms || body?.data || [];
        const m = {};
        (Array.isArray(list) ? list : []).forEach((f) => {
          if (f?.farm_id) m[f.farm_id] = f.farm_name || f.farm_id;
        });
        _cache = m;
        return m;
      })
      .catch(() => {
        _cache = {};
        return _cache;
      });
  }
  return _promise;
}

/** Returns the farmer's farm name for an id, or undefined while loading. */
export function useFarmName(farmId) {
  const [name, setName] = useState(_cache ? _cache[farmId] : undefined);
  useEffect(() => {
    let alive = true;
    if (!farmId) {
      setName(undefined);
      return;
    }
    if (_cache && _cache[farmId] !== undefined) {
      setName(_cache[farmId]);
      return;
    }
    loadFarms().then((m) => {
      if (alive) setName(m[farmId]);
    });
    return () => {
      alive = false;
    };
  }, [farmId]);
  return name;
}

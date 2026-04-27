/**
 * useEffectiveMode — single source of truth for mode-based routing/UI.
 *
 * Returns the EFFECTIVE mode the surface should render for, plus the
 * tools to inspect/override it. Three values matter:
 *
 *   real     — derived mode stored at login (localStorage 'tfos_mode'),
 *              backfilled from /api/v1/auth/me on cold cache.
 *   override — sessionStorage 'tfos_mode_override', honored only when
 *              the current user has FOUNDER role. Lets Cody preview
 *              SOLO/GROWTH/COMMERCIAL surfaces without touching the DB.
 *   effective — what the UI should follow: override (if FOUNDER and set)
 *              else real.
 *
 * MBI Part 19 compliance: override is FOUNDER-gated, session-scoped,
 * and never written to tenant.tenants.mode — so non-FOUNDER users have
 * no path to toggle their own mode.
 */
import { useCallback, useEffect, useState } from "react";

import { authHeader, getCurrentUser } from "../utils/auth";
import { hasRole } from "../utils/roles";

const REAL_KEY     = "tfos_mode";
const OVERRIDE_KEY = "tfos_mode_override";

let inflightFetch = null;

async function fetchMode() {
  if (inflightFetch) return inflightFetch;
  inflightFetch = (async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { headers: { ...authHeader() } });
      if (!res.ok) return null;
      const body = await res.json();
      const m = body?.data?.mode || null;
      if (m) localStorage.setItem(REAL_KEY, m);
      return m;
    } catch {
      return null;
    } finally {
      inflightFetch = null;
    }
  })();
  return inflightFetch;
}

export function useEffectiveMode() {
  const [real, setReal] = useState(() => {
    try { return localStorage.getItem(REAL_KEY); } catch { return null; }
  });
  const [override, setOverrideState] = useState(() => {
    try { return sessionStorage.getItem(OVERRIDE_KEY); } catch { return null; }
  });

  // Cold-cache backfill: if Login.jsx hasn't populated tfos_mode yet
  // (existing session, page refresh, etc.), pull it from /auth/me once.
  useEffect(() => {
    if (real) return;
    let cancelled = false;
    fetchMode().then((m) => {
      if (!cancelled && m) setReal(m);
    });
    return () => { cancelled = true; };
  }, [real]);

  const user = getCurrentUser();
  const isFounder = hasRole(user?.role, "FOUNDER");
  const effective = (isFounder && override) ? override : real;

  const setOverride = useCallback((mode) => {
    try {
      if (mode === null || mode === undefined) {
        sessionStorage.removeItem(OVERRIDE_KEY);
        setOverrideState(null);
      } else {
        sessionStorage.setItem(OVERRIDE_KEY, mode);
        setOverrideState(mode);
      }
    } catch {
      /* sessionStorage unavailable — silently ignore */
    }
  }, []);

  return { effective, real, override, setOverride, isFounder };
}

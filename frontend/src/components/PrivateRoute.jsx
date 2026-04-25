/**
 * PrivateRoute.jsx — Route guards for TFOS
 *
 * Guards:
 *   <PrivateRoute>      — must be authenticated (any role)
 *   <AdminRoute>        — must have role = "ADMIN"
 *   <FarmerRoute>       — must be authenticated, non-admin, and onboarding complete
 *   <OnboardingRoute>   — must be authenticated, non-admin, and onboarding NOT yet complete
 *
 * Security rule: Admin tabs/routes are NEVER rendered for farmer accounts.
 * They are completely absent from the React tree — not CSS-hidden,
 * not disabled, not greyed out. They do not exist in the DOM.
 *
 * FarmerRoute (Day 3b sidequest, 2026-04-25):
 *   When the local onboarding-complete cache is FALSE we no longer trust it
 *   blindly — the cache may be stale (cleared, fresh device, server backfill
 *   not yet replicated). We fire one GET /api/v1/onboarding/status to learn
 *   the truth from tenant.tenants.onboarded_at and only redirect to the
 *   wizard if the server confirms incomplete. Cache=true is still a fast
 *   path with no round-trip.
 */

import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  getCurrentUser,
  isAdmin,
  getOnboardingComplete,
  setOnboardingComplete,
  authHeader,
} from "../utils/auth";

/** Require any authenticated user */
export function PrivateRoute({ children }) {
  const user = getCurrentUser();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

/** Require role = ADMIN. Non-admins see /403 */
export function AdminRoute({ children }) {
  const user = getCurrentUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!isAdmin()) {
    return <Navigate to="/403" replace />;
  }
  return children;
}

/**
 * Require authenticated non-admin with onboarding complete.
 *   - Unauthenticated       → /login
 *   - Admin                 → /admin (admins skip farmer experience)
 *   - cache=true            → render children (fast path)
 *   - cache=false           → server reconcile (one /onboarding/status call)
 *      - server says true   → flip cache, render children
 *      - server says false  → /onboarding
 *      - server unreachable → /onboarding (safe default — better to ask
 *        than mistakenly let a user past the gate)
 */
export function FarmerRoute({ children }) {
  const user = getCurrentUser();
  const location = useLocation();
  const cached = getOnboardingComplete();

  // Reconcile state machine: "ok" (proceed), "checking" (fetch in flight),
  // "redirect" (server confirmed incomplete or unreachable).
  const [reconcile, setReconcile] = useState(cached ? "ok" : "checking");

  useEffect(() => {
    if (cached || !user || isAdmin()) return undefined;
    let cancelled = false;
    fetch("/api/v1/onboarding/status", { headers: { ...authHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const complete = body?.data?.onboarding_complete === true;
        setOnboardingComplete(complete);
        setReconcile(complete ? "ok" : "redirect");
      })
      .catch(() => { if (!cancelled) setReconcile("redirect"); });
    return () => { cancelled = true; };
  }, [cached, user]);

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }
  if (cached) {
    return children;
  }
  if (reconcile === "checking") {
    // Render nothing while we ask the server. The wait is one small JSON
    // round-trip and only happens on cache miss.
    return null;
  }
  if (reconcile === "redirect") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

/**
 * Guard for the /onboarding page itself.
 *   - Unauthenticated           → /login
 *   - Admin                     → /admin
 *   - Already onboarded         → /home (skip wizard)
 */
export function OnboardingRoute({ children }) {
  const user = getCurrentUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }
  if (getOnboardingComplete()) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

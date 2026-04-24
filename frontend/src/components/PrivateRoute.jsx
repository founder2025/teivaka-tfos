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
 */

import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, isAdmin, getOnboardingComplete } from "../utils/auth";

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
 *   - Onboarding incomplete → /onboarding
 */
export function FarmerRoute({ children }) {
  const user = getCurrentUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }
  if (!getOnboardingComplete()) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

/**
 * Guard for the /onboarding page itself.
 *   - Unauthenticated           → /login
 *   - Admin                     → /admin
 *   - Already onboarded         → /community (skip wizard)
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

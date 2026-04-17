/**
 * auth.js — JWT decode + role helpers
 *
 * Single source of truth for role checking on the frontend.
 * Never stores role in localStorage separately — always reads from JWT
 * to prevent client-side role spoofing.
 */

export const ROLE_ADMIN   = "ADMIN";
export const ROLE_FARMER  = "FARMER";
export const ROLE_FOUNDER = "FOUNDER";
export const ROLE_MANAGER = "MANAGER";
export const ROLE_WORKER  = "WORKER";
export const ROLE_VIEWER  = "VIEWER";

/**
 * Decode JWT payload WITHOUT verifying signature.
 * Signature verification is done server-side on every API call.
 * This is only used for UI rendering decisions.
 */
export function decodeToken(token) {
  if (!token) return null;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getStoredTokens() {
  return {
    access:  localStorage.getItem("tfos_access_token"),
    refresh: localStorage.getItem("tfos_refresh_token"),
  };
}

export function setStoredTokens(access, refresh) {
  localStorage.setItem("tfos_access_token", access);
  if (refresh) localStorage.setItem("tfos_refresh_token", refresh);
}

export function clearStoredTokens() {
  localStorage.removeItem("tfos_access_token");
  localStorage.removeItem("tfos_refresh_token");
}

export function getCurrentUser() {
  const { access } = getStoredTokens();
  if (!access) return null;
  const payload = decodeToken(access);
  if (!payload) return null;

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    clearStoredTokens();
    return null;
  }
  return payload;
}

export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === ROLE_ADMIN;
}

export function isFarmer() {
  const user = getCurrentUser();
  return user?.role !== ROLE_ADMIN && !!user;
}

export function isAuthenticated() {
  return !!getCurrentUser();
}

/** Auth header for fetch calls */
export function authHeader() {
  const { access } = getStoredTokens();
  return access ? { Authorization: `Bearer ${access}` } : {};
}

// ---------------------------------------------------------------------------
// Onboarding state
// Stored separately in localStorage so it survives token refreshes without
// requiring a backend round-trip. Upgraded to a JWT claim in a later sprint.
// ---------------------------------------------------------------------------

export function getOnboardingComplete() {
  return localStorage.getItem("tfos_onboarding_complete") === "true";
}

export function setOnboardingComplete() {
  localStorage.setItem("tfos_onboarding_complete", "true");
}

/** Called on logout — clear everything including onboarding flag */
const _originalClearStoredTokens = clearStoredTokens;
export function clearAllAuth() {
  localStorage.removeItem("tfos_access_token");
  localStorage.removeItem("tfos_refresh_token");
  localStorage.removeItem("tfos_onboarding_complete");
}

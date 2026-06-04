/**
 * tisIdentity.js - single source of truth for the identity TIS bridge calls
 * carry. Replaces the legacy hardcoded U-CODY / F001 constants across every TIS
 * surface so concurrent farmers no longer collide on the founder identity.
 */
import { getCurrentUser } from "./auth";

const FARM_KEY = "tfos_current_farm_id";

export function getCurrentFarmId() {
  try {
    return (typeof window !== "undefined" && window.localStorage.getItem(FARM_KEY)) || null;
  } catch {
    return null;
  }
}

export function tisIdentityBody() {
  const user = getCurrentUser();
  const userId = user?.sub || user?.user_id || "anon";
  const farmId = getCurrentFarmId();
  return {
    user_id: userId,
    farm_id: farmId,
    session_id: `tfos-web-${userId}${farmId ? "-" + farmId : ""}`,
  };
}

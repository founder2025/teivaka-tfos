/**
 * SoloShell — full-viewport chrome for Solo mode (MBI Part 19).
 *
 * No top bar, no left rail, no bottom nav, no FAB. Cream background,
 * a single child surface centered. Renders <Outlet /> so future Solo
 * sub-routes (e.g. /solo/done celebration screen) compose inside the
 * same chrome.
 *
 * Auth-gated upstream by <PrivateRoute>; this component does not gate.
 *
 * Phase A1b: bounces non-SOLO users back to /home so a GROWTH/COMMERCIAL
 * user typing /solo in the URL bar (or a FOUNDER who Resets the override
 * while on /solo) returns to their proper surface.
 */
import { Navigate, Outlet } from "react-router-dom";

import { useEffectiveMode } from "../hooks/useEffectiveMode";

const C = {
  cream: "#F8F3E9",
};

export default function SoloShell() {
  const { effective: effectiveMode, override, setOverride, isFounder } = useEffectiveMode();

  // While effectiveMode is still null (cold cache, /auth/me in flight)
  // we render the shell without redirecting — once it resolves we'll
  // either keep rendering (SOLO) or bounce (otherwise).
  if (effectiveMode && effectiveMode !== "SOLO") {
    return <Navigate to="/home" replace />;
  }

  // FOUNDER trap-door: if the override pinned us to SOLO, give a one-tap
  // way back. SoloShell has no chrome by design, so without this badge
  // there's no UI affordance to clear the override from inside /solo.
  // Visible only to FOUNDER + when an override is active. Non-FOUNDER
  // users (override silently ignored) and unoverridden FOUNDER both
  // see nothing — Solo's chromeless purity preserved for real users.
  const showDebugBadge = isFounder && !!override;
  function handleReset() {
    setOverride(null);
    window.location.href = "/farm";
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{
        height: "100vh",
        width: "100vw",
        background: C.cream,
        overflow: "hidden",
      }}
    >
      {showDebugBadge && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            padding: "6px 10px",
            background: "#BF9000",
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            borderRadius: 6,
            zIndex: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>DEBUG: viewing as {override}</span>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.5)",
              color: "#FFFFFF",
              padding: "2px 8px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            RESET
          </button>
        </div>
      )}
      <Outlet />
    </div>
  );
}

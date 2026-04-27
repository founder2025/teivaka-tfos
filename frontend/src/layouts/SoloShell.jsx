/**
 * SoloShell — full-viewport chrome for Solo mode (MBI Part 19).
 *
 * No top bar, no left rail, no bottom nav, no FAB. Cream background,
 * a single child surface centered. Renders <Outlet /> so future Solo
 * sub-routes (e.g. /solo/done celebration screen) compose inside the
 * same chrome.
 *
 * Auth-gated upstream by <PrivateRoute>; this component does not gate.
 */
import { Outlet } from "react-router-dom";

const C = {
  cream: "#F8F3E9",
};

export default function SoloShell() {
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
      <Outlet />
    </div>
  );
}

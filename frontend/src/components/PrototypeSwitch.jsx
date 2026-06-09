/**
 * PrototypeSwitch.jsx — founder/admin-only floating toggle into the design
 * prototype (/prototype). Rendered globally (App.jsx, inside the router) so it
 * appears on the live app's pages; the prototype viewer has its own "Switch to
 * live app" button for the way back.
 *
 * Hidden for everyone except ADMIN / ENTERPRISE_ADMIN / FOUNDER (hasRole >=
 * ADMIN), and on the public/auth pages so it never clutters the real landing
 * or login. Positioned bottom-LEFT to avoid the TIS widget (bottom-right).
 */
import { useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { hasRole } from "../utils/roles";

const HIDE_EXACT = new Set([
  "/", "/login", "/register", "/403",
  "/forgot-password", "/reset-password", "/verify-email",
]);

export default function PrototypeSwitch() {
  const loc = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  if (!user || !hasRole(user.role, "ADMIN")) return null;
  if (loc.pathname.startsWith("/prototype")) return null;
  if (HIDE_EXACT.has(loc.pathname)) return null;

  return (
    <button
      onClick={() => navigate("/prototype")}
      title="Founder/admin: open the design prototype (mock data)"
      style={{
        position: "fixed", left: 12, bottom: 12, zIndex: 1000,
        background: "#5C4033", color: "#fff", border: "1px solid #BF9000",
        borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 700,
        cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        fontFamily: "system-ui",
      }}
    >
      ◧ Prototype
    </button>
  );
}

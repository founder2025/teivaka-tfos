/**
 * Forbidden.jsx — 403 Access Denied
 * Shown when a non-admin tries to access an admin route, or vice versa.
 */

import { useNavigate } from "react-router-dom";
import { isAdmin } from "../utils/auth";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0" };

export default function Forbidden() {
  const navigate = useNavigate();
  // Route them back somewhere sensible
  const home = isAdmin() ? "/admin" : "/home";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold mb-2"
          style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Access Denied
        </h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          You don't have permission to view this page. If you think this is a
          mistake, contact your administrator.
        </p>
        <button onClick={() => navigate(home)}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm transition-all"
          style={{ background: C.green }}>
          ← Go Back
        </button>
      </div>
    </div>
  );
}

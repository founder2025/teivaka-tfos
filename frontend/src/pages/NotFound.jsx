/**
 * NotFound.jsx — 404 Page Not Found
 */

import { useNavigate } from "react-router-dom";
import { isAdmin, isAuthenticated } from "../utils/auth";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0" };

export default function NotFound() {
  const navigate = useNavigate();

  function goHome() {
    if (!isAuthenticated()) navigate("/login");
    else if (isAdmin()) navigate("/admin");
    else navigate("/community");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🌾</div>
        <h1 className="text-2xl font-bold mb-2"
          style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Page Not Found
        </h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This page doesn't exist or may have been moved.
          Head back to where the crops are growing.
        </p>
        <button onClick={goHome}
          className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm transition-all"
          style={{ background: C.green }}>
          ← Go Home
        </button>
      </div>
    </div>
  );
}

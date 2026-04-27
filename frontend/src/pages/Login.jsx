/**
 * Login.jsx — TFOS Login Page
 *
 * POST /api/v1/auth/login (OAuth2PasswordRequestForm)
 * On success:
 *   - Stores access + refresh tokens in localStorage
 *   - Redirects admin  → /admin
 *   - Redirects farmer (onboarded)     → /community
 *   - Redirects farmer (not onboarded) → /onboarding
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { setStoredTokens, setOnboardingComplete, getOnboardingComplete } from "../utils/auth";

const C = {
  soil:   "#2C1A0E",
  green:  "#3D8C40",
  cream:  "#F5EFE0",
  gold:   "#D4A017",
  border: "#E0D5C0",
};

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || null;

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("username", email.toLowerCase().trim());
      body.append("password", password);

      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Invalid email or password.");
        return;
      }

      const data = await res.json();
      setStoredTokens(data.access_token, data.refresh_token);

      // Stash the derived mode for useEffectiveMode and the SOLO redirect
      // below. Login response carries `mode` per Phase A1b-pre.
      if (data.mode) {
        try { localStorage.setItem("tfos_mode", data.mode); } catch { /* noop */ }
      }

      // Redirect based on role
      if (data.role === "ADMIN") {
        navigate("/admin", { replace: true });
        return;
      }

      // Farmer: ask the server whether onboarding is complete (tenant.tenants
      // .onboarded_at) and reconcile the local cache. Falls back to the
      // existing local cache on transient failure rather than forcing a
      // healthy user back through onboarding.
      let onboardingComplete = getOnboardingComplete();
      try {
        const statusRes = await fetch("/api/v1/onboarding/status", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (statusRes.ok) {
          const statusBody = await statusRes.json();
          const flag = statusBody?.data?.onboarding_complete;
          if (typeof flag === "boolean") {
            onboardingComplete = flag;
            setOnboardingComplete(flag);
          }
        }
      } catch {
        /* keep cached value on network error */
      }

      // Mode-aware default: SOLO mode lands at /solo (no chrome, single
      // task card per MBI Part 19). Everyone else lands at /home. Deep-link
      // intent ("from") wins over the mode default if present.
      let destination;
      if (from && from !== "/login" && from !== "/register") {
        destination = from;
      } else if (!onboardingComplete) {
        destination = "/onboarding";
      } else if (data.mode === "SOLO") {
        destination = "/solo";
      } else {
        destination = "/home";
      }

      navigate(destination, { replace: true });

    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>

      {/* Header */}
      <div className="text-center py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <span className="font-bold text-xl" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Teivaka
          </span>
        </Link>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-sm p-8" style={{ border: `1px solid ${C.border}` }}>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-1"
                style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Welcome back
              </h1>
              <p className="text-sm text-gray-500">Sign in to your Teivaka account</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: C.border, fontFamily: "'Lora', Georgia, serif" }}
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: C.soil }}>Password</label>
                  <Link to="/forgot-password"
                    className="text-xs hover:underline"
                    style={{ color: C.green }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full border rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: C.border, fontFamily: "'Lora', Georgia, serif" }}
                  />
                  <button type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 mt-2"
                style={{ background: C.green }}>
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </form>

            {/* Register link */}
            <p className="text-center text-sm text-gray-500 mt-6">
              New to Teivaka?{" "}
              <Link to="/register" className="font-medium hover:underline" style={{ color: C.green }}>
                Create an account
              </Link>
            </p>

          </div>

          {/* Pacific tagline */}
          <p className="text-center text-xs text-gray-400 mt-6">
            Connecting Pacific Island farmers 🌏
          </p>
        </div>
      </div>
    </div>
  );
}

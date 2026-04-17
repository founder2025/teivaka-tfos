import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0" };

function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function complexityError(pw) {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter";
  if (!/\d/.test(pw)) return "Password must contain a number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw)) return "Password must contain a special character";
  return null;
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.cream }}>
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center" style={{ border: `1px solid ${C.border}` }}>
          <div className="text-4xl mb-3">🌿</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: C.soil }}>Teivaka</h1>
          <p className="text-red-600 font-medium mb-4">This link is invalid or has expired.</p>
          <Link to="/forgot-password" className="inline-block px-5 py-2.5 rounded-lg text-white font-semibold" style={{ backgroundColor: C.green }}>
            Request a new reset link
          </Link>
          <p className="text-sm mt-4">
            <Link to="/login" className="hover:underline" style={{ color: C.green }}>Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const pwErr = complexityError(pw);
    if (pwErr) { setError(pwErr); return; }
    if (pw !== confirm) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Unable to reset password. The link may have expired.");
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.cream }}>
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8" style={{ border: `1px solid ${C.border}` }}>
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🌿</div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Teivaka</h1>
          <p className="text-sm mt-1" style={{ color: C.soil, opacity: 0.7 }}>Set a new password</p>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-medium" style={{ color: C.soil }}>Password reset successfully.</p>
            <p className="text-sm mt-1" style={{ color: C.soil, opacity: 0.7 }}>Redirecting to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">⚠ {error}</div>
            )}

            <div>
              <label htmlFor="pw" className="block text-sm font-medium mb-1" style={{ color: C.soil }}>New Password</label>
              <div className="relative">
                <input
                  id="pw"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2"
                  style={{ borderColor: C.border }}
                  placeholder="Enter new password"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium mb-1" style={{ color: C.soil }}>Confirm Password</label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2"
                  style={{ borderColor: C.border }}
                  placeholder="Re-enter new password"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>

            <ul className="text-xs space-y-0.5 pl-4 list-disc" style={{ color: C.soil, opacity: 0.7 }}>
              <li>At least 8 characters</li>
              <li>One uppercase letter</li>
              <li>One number</li>
              <li>One special character (!@#$%^&* etc.)</li>
            </ul>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg text-white font-semibold transition-opacity disabled:opacity-60"
              style={{ backgroundColor: C.green }}>
              {loading ? "Resetting…" : "Reset Password →"}
            </button>

            <p className="text-center text-sm">
              <Link to="/login" className="hover:underline" style={{ color: C.green }}>Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

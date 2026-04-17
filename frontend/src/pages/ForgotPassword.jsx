import { useState } from "react";
import { Link } from "react-router-dom";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0" };

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (!res.ok && res.status !== 200) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Unable to send reset email. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.cream, fontFamily: "'Lora', Georgia, serif" }}>
      <div className="text-center py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <span className="font-bold text-xl" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>Teivaka</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-sm p-8" style={{ border: `1px solid ${C.border}` }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Reset your password
              </h1>
              <p className="text-sm text-gray-500">
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            {sent ? (
              <div className="text-center">
                <div className="text-4xl mb-3">📧</div>
                <p className="text-sm text-gray-700 mb-4">
                  If an account exists for <strong>{email}</strong>, a reset link is on its way.
                  Check your inbox (and spam folder).
                </p>
                <Link to="/login" className="font-medium hover:underline" style={{ color: C.green }}>
                  ← Back to sign in
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-5 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.soil }}>Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: C.border, fontFamily: "'Lora', Georgia, serif" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 mt-2"
                    style={{ background: C.green }}>
                    {loading ? "Sending…" : "Send reset link →"}
                  </button>
                </form>
                <p className="text-center text-sm text-gray-500 mt-6">
                  Remembered it?{" "}
                  <Link to="/login" className="font-medium hover:underline" style={{ color: C.green }}>
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

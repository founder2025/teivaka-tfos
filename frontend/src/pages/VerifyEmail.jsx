import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0" };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (state !== "success") return;
    const t = setTimeout(() => navigate("/login", { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [state, navigate]);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This link is missing its verification token. Please use the link from your email.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setState("success");
          setMessage(data.message || "Email verified. You can now sign in.");
        } else {
          setState("error");
          setMessage(data.detail || "We couldn't verify your email. The link may have expired.");
        }
      } catch {
        if (cancelled) return;
        setState("error");
        setMessage("Unable to reach the server. Please check your connection and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

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
          <div className="bg-white rounded-3xl shadow-sm p-8 text-center" style={{ border: `1px solid ${C.border}` }}>
            {state === "loading" && (
              <>
                <div className="text-4xl mb-3">⏳</div>
                <h1 className="text-xl font-semibold" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Verifying your email…
                </h1>
              </>
            )}

            {state === "success" && (
              <>
                <div className="text-5xl mb-3">✅</div>
                <h1 className="text-2xl font-bold mb-2" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Email verified
                </h1>
                <p className="text-sm text-gray-600 mb-2">{message}</p>
                <p className="text-xs text-gray-400">Redirecting to sign in in 2 seconds…</p>
              </>
            )}

            {state === "error" && (
              <>
                <div className="text-5xl mb-3">⚠️</div>
                <h1 className="text-2xl font-bold mb-2" style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Verification failed
                </h1>
                <p className="text-sm text-gray-600 mb-6">{message}</p>
                <Link to="/login"
                  className="inline-block w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: C.green }}>
                  Back to sign in
                </Link>
                <p className="text-xs text-gray-400 mt-4">
                  If the link expired, request a new one from the sign-in page.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

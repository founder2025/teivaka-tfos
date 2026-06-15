/**
 * Waitlist.jsx — public launch-waitlist signup + shareable QR.
 *
 * Posts to /api/v1/waitlist/join (public, idempotent). On success shows the QR
 * (served from /api/v1/waitlist/qr.png) so it can be shared/printed at events.
 * Brand light theme; no auth required.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download } from "lucide-react";

const T = {
  cream: "var(--cream)", paper: "var(--paper)", soil: "var(--soil)",
  green: "var(--green)", greenDk: "var(--green-dk)", greenTint: "var(--green-tint)",
  line: "var(--line)", muted: "var(--muted)", red: "var(--red)",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const COUNTRIES = [
  ["FJ", "Fiji"], ["WS", "Samoa"], ["TO", "Tonga"], ["VU", "Vanuatu"],
  ["SB", "Solomon Islands"], ["PG", "Papua New Guinea"], ["KI", "Kiribati"],
  ["NZ", "New Zealand"], ["AU", "Australia"], ["OT", "Other"],
];
const ROLES = ["Farmer", "Buyer / Trader", "Supplier / Service provider", "Banker / Investor", "Government / NGO", "Other"];

const QR_URL = "/api/v1/waitlist/qr.png";

export default function Waitlist() {
  const [f, setF] = useState({ name: "", email: "", country: "FJ", role: "Farmer" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [msg, setMsg] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending"); setMsg("");
    try {
      let anon = null;
      try { anon = localStorage.getItem("teivaka_anon_id"); } catch { /* ignore */ }
      const res = await fetch("/api/v1/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, anonymous_id: anon }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg((d.detail && (Array.isArray(d.detail) ? d.detail[0]?.msg : d.detail)) || "Something went wrong — please try again.");
        return;
      }
      setState("done");
      setMsg(d.message || "You're on the list!");
    } catch {
      setState("error");
      setMsg("Couldn't reach the server — please try again in a moment.");
    }
  }

  const input = {
    width: "100%", padding: "11px 13px", borderRadius: 12, fontSize: 15,
    border: `1px solid ${T.line}`, background: T.cream, color: T.soil, fontFamily: FONT,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.cream, fontFamily: FONT }}>
      <div className="text-center py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
        <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 64, width: "auto", display: "block", margin: "0 auto" }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-7 sm:p-8" style={{ background: T.paper, border: `1px solid ${T.line}`, boxShadow: "0 4px 16px rgba(92,64,51,0.10)" }}>

            {state !== "done" ? (
              <>
                <div className="text-center">
                  <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: T.greenDk, background: T.greenTint, padding: "4px 12px", borderRadius: 999 }}>
                    Launching soon
                  </span>
                  <h1 className="mt-3" style={{ fontSize: 26, fontWeight: 800, color: T.soil, lineHeight: 1.2 }}>
                    Join the launch waitlist
                  </h1>
                  <p className="mt-2" style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.55 }}>
                    Transform idle land into wealth. Be first to know when Teivaka — Fiji's AI-powered
                    agriculture ecosystem — opens to your area.
                  </p>
                </div>

                <form onSubmit={submit} className="mt-6 flex flex-col gap-3.5">
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: T.soil }}>Your name</label>
                    <input style={{ ...input, marginTop: 5 }} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sera Naidu" required />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: T.soil }}>Email</label>
                    <input style={{ ...input, marginTop: 5 }} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: T.soil }}>Country</label>
                      <select style={{ ...input, marginTop: 5 }} value={f.country} onChange={(e) => set("country", e.target.value)}>
                        {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: T.soil }}>I am a…</label>
                      <select style={{ ...input, marginTop: 5 }} value={f.role} onChange={(e) => set("role", e.target.value)}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  {state === "error" && <p style={{ fontSize: 13, color: T.red }}>{msg}</p>}

                  <button type="submit" disabled={state === "sending"}
                    className="mt-1 w-full py-3.5 rounded-xl font-semibold"
                    style={{ background: T.green, color: "#fff", fontSize: 15.5, cursor: state === "sending" ? "default" : "pointer", opacity: state === "sending" ? 0.7 : 1 }}>
                    {state === "sending" ? "Joining…" : "Join the waitlist →"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.greenTint, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Check size={30} strokeWidth={2.75} color={T.greenDk} />
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: T.soil }}>You're on the list!</h1>
                <p className="mt-2" style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.55 }}>{msg}</p>

                <div className="mt-6 rounded-xl p-4" style={{ background: T.cream, border: `1px solid ${T.line}` }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.soil }}>Spread the word</p>
                  <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Scan or share this code to invite another farmer.</p>
                  <img src={QR_URL} alt="Waitlist QR code" width={180} height={180}
                    style={{ display: "block", margin: "14px auto 0", borderRadius: 12, border: `1px solid ${T.line}`, background: "#fff" }} />
                  <a href={QR_URL} download="teivaka-waitlist-qr.png"
                    className="mt-3 inline-flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl font-medium"
                    style={{ background: T.paper, color: T.greenDk, border: `1px solid ${T.line}`, fontSize: 14 }}>
                    <Download size={15} /> Download QR
                  </a>
                </div>
              </div>
            )}

            <div className="mt-6 pt-5 text-center" style={{ borderTop: `1px solid ${T.line}` }}>
              <Link to="/" className="font-medium hover:underline" style={{ color: T.muted, fontSize: 13.5 }}>← Back to teivaka.com</Link>
            </div>
          </div>
          <p className="text-center text-xs mt-5" style={{ color: T.muted }}>Building the operating system for Pacific agriculture 🌏</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Waitlist.jsx — public launch-waitlist signup + shareable QR.
 *
 * Submits to POST /api/v1/waitlist/join (public, idempotent on email). Each
 * signup is stored as a shared.attribution_events row (event_type
 * 'waitlist_signup') AND emailed to the team via Resend. On success this page
 * shows a shareable QR (served from /api/v1/waitlist/qr.png).
 *
 * Brand light theme; scoped .wl styles for consistent inputs + focus states.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, ShieldCheck } from "lucide-react";

const COUNTRIES = [
  ["FJ", "Fiji"], ["WS", "Samoa"], ["TO", "Tonga"], ["VU", "Vanuatu"],
  ["SB", "Solomon Islands"], ["PG", "Papua New Guinea"], ["KI", "Kiribati"],
  ["NZ", "New Zealand"], ["AU", "Australia"], ["OT", "Other"],
];
const ROLES = ["Farmer", "Buyer / Trader", "Supplier / Service provider", "Banker / Investor", "Government / NGO", "Other"];

const QR_URL = "/api/v1/waitlist/qr.png";

const WL_CSS = `
.wl{min-height:100vh;display:flex;flex-direction:column;background:var(--cream);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:var(--soil)}
.wl-top{text-align:center;padding:22px 16px;border-bottom:1px solid var(--line)}
.wl-top img{height:58px;width:auto;display:block;margin:0 auto}
.wl-main{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px 44px}
.wl-wrap{width:100%;max-width:460px}
.wl-card{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:34px 30px;
  box-shadow:0 10px 30px rgba(92,64,51,0.10)}
@media (max-width:480px){.wl-card{padding:28px 22px}}
.wl-head{text-align:center}
.wl-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
  color:var(--green-dk);background:var(--green-tint);padding:5px 14px;border-radius:999px}
.wl-title{font-size:27px;font-weight:800;color:var(--soil);line-height:1.18;margin:14px 0 0;letter-spacing:-0.3px}
.wl-sub{color:var(--muted);font-size:14.5px;line-height:1.55;margin:10px 0 0}
.wl-form{margin-top:26px;display:flex;flex-direction:column;gap:16px;text-align:left}
.wl-field label{display:block;font-size:12.5px;font-weight:600;color:var(--soil);margin-bottom:6px}
.wl-input{width:100%;height:48px;padding:0 14px;border:1.5px solid var(--line);border-radius:12px;
  background:var(--cream);color:var(--soil);font-size:15px;font-family:inherit;box-sizing:border-box;
  transition:border-color .15s,box-shadow .15s}
.wl-input::placeholder{color:#a59a86}
.wl-input:focus{outline:none;border-color:var(--green);box-shadow:0 0 0 3px rgba(106,168,79,0.18)}
select.wl-input{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:40px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237A6E5C' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 13px center}
.wl-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:430px){.wl-row{grid-template-columns:1fr}}
.wl-btn{width:100%;height:52px;border:none;border-radius:12px;background:var(--green);color:#fff;
  font-size:16px;font-weight:700;cursor:pointer;margin-top:4px;transition:background .15s,transform .05s}
.wl-btn:hover{background:var(--green-dk)}
.wl-btn:active{transform:translateY(1px)}
.wl-btn:disabled{opacity:.65;cursor:default}
.wl-trust{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--muted);margin-top:14px}
.wl-err{font-size:13px;color:var(--red);margin:2px 0 0}
.wl-back{display:block;text-align:center;margin-top:24px;padding-top:18px;border-top:1px solid var(--line);
  font-size:13.5px;color:var(--muted);text-decoration:none}
.wl-back:hover{text-decoration:underline}
.wl-tag{text-align:center;font-size:12px;color:var(--muted);margin-top:18px}
.wl-check{width:64px;height:64px;border-radius:50%;background:var(--green-tint);display:flex;
  align-items:center;justify-content:center;margin:0 auto 16px}
.wl-qrcard{margin-top:22px;background:var(--cream);border:1px solid var(--line);border-radius:16px;padding:20px;text-align:center}
.wl-qr{width:184px;height:184px;border-radius:14px;border:1px solid var(--line);background:#fff;display:block;margin:14px auto 0}
.wl-dl{margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;height:46px;
  border:1.5px solid var(--line);border-radius:12px;background:var(--paper);color:var(--green-dk);
  font-size:14px;font-weight:600;text-decoration:none}
.wl-dl:hover{border-color:var(--green)}
`;

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

  return (
    <div className="wl">
      <style>{WL_CSS}</style>

      <div className="wl-top">
        <img src="/teivaka_logo.png" alt="Teivaka" />
      </div>

      <div className="wl-main">
        <div className="wl-wrap">
          <div className="wl-card">

            {state !== "done" ? (
              <>
                <div className="wl-head">
                  <span className="wl-badge">Launching soon</span>
                  <h1 className="wl-title">Join the launch waitlist</h1>
                  <p className="wl-sub">Transform idle land into wealth. Be first to know when Teivaka — Fiji's AI-powered agriculture ecosystem — opens to your area.</p>
                </div>

                <form className="wl-form" onSubmit={submit}>
                  <div className="wl-field">
                    <label htmlFor="wl-name">Your name</label>
                    <input id="wl-name" className="wl-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sera Naidu" required />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-email">Email</label>
                    <input id="wl-email" className="wl-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" required />
                  </div>
                  <div className="wl-row">
                    <div className="wl-field">
                      <label htmlFor="wl-country">Country</label>
                      <select id="wl-country" className="wl-input" value={f.country} onChange={(e) => set("country", e.target.value)}>
                        {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    </div>
                    <div className="wl-field">
                      <label htmlFor="wl-role">I am a…</label>
                      <select id="wl-role" className="wl-input" value={f.role} onChange={(e) => set("role", e.target.value)}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  {state === "error" && <p className="wl-err">{msg}</p>}

                  <button type="submit" className="wl-btn" disabled={state === "sending"}>
                    {state === "sending" ? "Joining…" : "Join the waitlist →"}
                  </button>
                  <div className="wl-trust">
                    <ShieldCheck size={14} strokeWidth={2} /> No spam — we'll only email you about the launch.
                  </div>
                </form>
              </>
            ) : (
              <div style={{ textAlign: "center" }}>
                <div className="wl-check"><Check size={32} strokeWidth={2.75} color="var(--green-dk)" /></div>
                <h1 className="wl-title">You're on the list!</h1>
                <p className="wl-sub">{msg}</p>

                <div className="wl-qrcard">
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--soil)", margin: 0 }}>Spread the word</p>
                  <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 0" }}>Scan or share this code to invite another farmer.</p>
                  <img className="wl-qr" src={QR_URL} alt="Waitlist QR code" width={184} height={184} />
                  <a className="wl-dl" href={QR_URL} download="teivaka-waitlist-qr.png"><Download size={15} /> Download QR</a>
                </div>
              </div>
            )}

            <Link to="/" className="wl-back">← Back to teivaka.com</Link>
          </div>
          <p className="wl-tag">Building the operating system for Pacific agriculture 🌏</p>
        </div>
      </div>
    </div>
  );
}

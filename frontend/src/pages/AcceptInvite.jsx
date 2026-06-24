/** AcceptInvite — /accept/:token (public). The invitee's landing from the
 *  WhatsApp invitation: shows who invited them, their role and scope, then
 *  creates their account INSIDE the inviter's tenant. New accounts only. */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Shield, Check } from "lucide-react";

const C = { soil: "var(--soil)", cream: "var(--cream)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", red: "var(--red)" };

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ full_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/team/invites/${token}/public`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.detail || "Invitation not found"); return j.data; })
      .then((d) => { setInv(d); setF((s) => ({ ...s, full_name: d.invitee_name || "" })); })
      .catch((e) => setErr(String(e.message || e)));
  }, [token]);

  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/v1/team/invites/${token}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail || `Couldn't accept (${r.status})`);
      setDone(true);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 13px", fontSize: 14, marginBottom: 10, boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 14, padding: 26, width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <Shield size={20} style={{ color: C.green }} />
          <strong style={{ color: C.soil, fontSize: 18 }}>Teivaka team invitation</strong>
        </div>

        {err && !inv && <p style={{ color: C.red, fontSize: 14 }}>{err}</p>}
        {!inv && !err && <p style={{ color: C.muted, fontSize: 14 }}>Checking your invitation…</p>}

        {inv && inv.status !== "PENDING" && (
          <p style={{ color: C.muted, fontSize: 14 }}>
            This invitation is {inv.status.toLowerCase()}. Ask {inv.inviter || "the sender"} to send a new one.
          </p>
        )}

        {done ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <Check size={34} style={{ color: C.greenDk }} />
            <p style={{ color: C.soil, fontSize: 14.5, fontWeight: 600 }}>You're in. Your account is ready.</p>
            <button onClick={() => navigate("/login")} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sign in</button>
          </div>
        ) : inv && inv.status === "PENDING" && (
          <>
            <p style={{ color: C.soil, fontSize: 14, lineHeight: 1.6 }}>
              <strong>{inv.inviter || "A Teivaka member"}</strong> invited you to join their farm team as <strong>{inv.role_label}</strong> ({inv.scope_label}).
              Create your login to accept.
            </p>
            <input style={inp} value={f.full_name} placeholder="Your full name" onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            <input style={inp} type="email" value={f.email} placeholder="Your email" onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input style={inp} type="password" value={f.password} placeholder="Choose a password (8+ characters)" onChange={(e) => setF({ ...f, password: e.target.value })} />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
            <button onClick={accept} disabled={busy || !f.email.includes("@") || f.password.length < 8}
              style={{ width: "100%", background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Creating your account…" : "Accept & create account"}
            </button>
            <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginTop: 12 }}>
              By joining you're covered by the <a href="/covenant" style={{ color: C.greenDk }}>Data Ownership Covenant</a> — you can revoke your participation anytime.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * SponsorPortal — PUBLIC, read-only impact dashboard for one sponsor, reached by
 * an unguessable token: /sponsor/:token. No login. Mirrors the data a sponsor
 * (bank/ministry/NGO) would otherwise be sent as a screenshot. Backed by the
 * allowlisted GET /api/v1/sponsor-portal/{token}.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const C = {
  soil: "#3a2e22", green: "#2e7d32", greenDk: "#1b5e20", muted: "#7a6f63",
  line: "#e6ddcf", cream: "#f7f2e8", paper: "#fffdf8",
};

const stat = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", flex: 1, minWidth: 160 };

function fmtMoney(n) { return "FJD " + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

export default function SponsorPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    // Keep this page out of search indexes.
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex,nofollow"; document.head.appendChild(m);
    fetch(`/api/v1/sponsor-portal/${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.detail || "This sponsor link is not active."); return j; })
      .then((j) => setData(j?.data || null))
      .catch((e) => setErr(String(e.message || e)));
    return () => { try { document.head.removeChild(m); } catch { /* noop */ } };
  }, [token]);

  const wrap = { minHeight: "100vh", background: C.cream, color: C.soil, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };
  const inner = { maxWidth: 880, margin: "0 auto", padding: "32px 20px 56px" };

  if (err) return (
    <div style={wrap}><div style={{ ...inner, textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.greenDk }}>Teivaka</div>
      <p style={{ color: C.muted, marginTop: 16 }}>{err}</p>
    </div></div>
  );
  if (!data) return (
    <div style={wrap}><div style={{ ...inner, textAlign: "center", paddingTop: 80, color: C.muted }}>Loading impact…</div></div>
  );

  const { org, counts, monthly_value_fjd, annual_value_fjd, redeemed_farmers } = data;

  return (
    <div style={wrap}>
      <div style={inner}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.greenDk, letterSpacing: "0.02em" }}>TEIVAKA</div>
          <div style={{ fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sponsor Impact</div>
        </div>
        <h1 style={{ margin: "4px 0 2px", fontSize: 28, color: C.soil }}>{org.name}</h1>
        <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>
          {org.kind} · sponsoring the <strong style={{ color: C.soil }}>{org.granted_tier}</strong> plan at {fmtMoney(org.price_per_seat_fjd)}/farmer/month
        </p>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "22px 0" }}>
          <div style={stat}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, letterSpacing: "0.05em" }}>Farmers sponsored</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: C.greenDk, lineHeight: 1.1 }}>{counts.redeemed || 0}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{counts.available || 0} seats still available</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, letterSpacing: "0.05em" }}>Committed / month</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: C.soil, lineHeight: 1.1 }}>{fmtMoney(monthly_value_fjd)}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{fmtMoney(annual_value_fjd)} / year</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, letterSpacing: "0.05em" }}>Seats issued</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: C.soil, lineHeight: 1.1 }}>{counts.issued || 0}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{counts.revoked || 0} revoked</div>
          </div>
        </div>

        {/* Anonymous activation timeline — privacy-safe (no farmer identities) */}
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
          <strong style={{ color: C.soil, fontSize: 15 }}>Activation timeline</strong>
          {(!redeemed_farmers || redeemed_farmers.length === 0) ? (
            <p style={{ color: C.muted, fontSize: 13.5, marginTop: 10 }}>No seats redeemed yet — codes you’ve shared will appear here as farmers activate them.</p>
          ) : (
            <>
              <p style={{ color: C.muted, fontSize: 12.5, margin: "6px 0 10px" }}>{redeemed_farmers.length} farmer{redeemed_farmers.length === 1 ? "" : "s"} activated their sponsored access. Identities are kept private.</p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead><tr>{["", "Activated"].map((h) => (
                    <th key={h} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "7px 8px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
                  <tbody>
                    {redeemed_farmers.map((f, i) => (
                      <tr key={i}>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>Sponsored farmer #{redeemed_farmers.length - i}</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{f.redeemed_at ? String(f.redeemed_at).slice(0, 10) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", color: C.muted, fontSize: 12, marginTop: 28 }}>
          Live data from Teivaka · teivaka.com · This is a private link — please don’t share it publicly.
        </p>
      </div>
    </div>
  );
}

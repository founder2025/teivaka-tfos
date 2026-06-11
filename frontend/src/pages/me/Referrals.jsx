/** Referrals — /me/referrals. Prototype openReferralDashboard parity:
 *  code + copy code/link + WhatsApp/email share + QR, real stat tiles,
 *  honest reward note (rewards launch with payments — never faked),
 *  and the real list of farmers you brought in with status pills. */
import { useEffect, useState } from "react";
import { Copy, Check, Gift, Share2, Mail } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

function StatTile({ n, label }) {
  return (
    <div style={{ flex: 1, minWidth: 110, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.soil }}>{n}</div>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

export default function Referrals() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(null);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    getJSON("/api/v1/me/referral").then((r) => setData(r?.data ?? r)).catch(() => setData({}));
    let url;
    (async () => {
      try {
        const t = localStorage.getItem("tfos_access_token");
        const r = await fetch("/api/v1/me/referral/qr", { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) { url = URL.createObjectURL(await r.blob()); setQr(url); }
      } catch { /* QR optional */ }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  const code = data?.my_code;
  const url = data?.share_links?.whatsapp || "https://teivaka.com";
  const shareText = data?.share_links?.copy_text || (code ? `Join Teivaka with my code ${code} -> ${url}` : `Join Teivaka -> ${url}`);
  const copy = (what, text) => { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1800); }); };
  const btn = { display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${C.line}`, background: "#fff", color: C.soil, borderRadius: 8, padding: "9px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600 };

  return (
    <MeShell title="Referrals" subtitle="Invite farmers, buyers and partners — your network is your reward.">
      <div style={{ ...card, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, color: C.muted }}>Your code</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.1em", color: C.greenDk, fontFamily: "ui-monospace, Menlo, monospace", margin: "2px 0 12px" }}>{data == null ? "…" : (code || "—")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button style={btn} onClick={() => copy("code", code || "")}>{copied === "code" ? <Check size={14} /> : <Copy size={14} />}Copy code</button>
            <button style={btn} onClick={() => copy("link", url)}>{copied === "link" ? <Check size={14} /> : <Copy size={14} />}Copy link</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a style={{ ...btn, textDecoration: "none" }} href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><Share2 size={14} />Share on WhatsApp</a>
            <a style={{ ...btn, textDecoration: "none" }} href={`mailto:?subject=${encodeURIComponent("Join me on Teivaka")}&body=${encodeURIComponent(shareText)}`}><Mail size={14} />Share by email</a>
          </div>
        </div>
        {qr && (
          <div style={{ textAlign: "center" }}>
            <img src={qr} alt="Referral QR" style={{ width: 132, height: 132, borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff" }} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Scan to join</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatTile n={data?.referred_count ?? 0} label="Joined" />
        <StatTile n={data?.verified_count ?? 0} label="Verified" />
        <StatTile n={data?.farming_count ?? 0} label="Farming now" />
        <StatTile n={data?.rewards_earned_months ?? 0} label="Rewards earned" />
      </div>

      <div style={{ ...card, background: C.cream }}>
        <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5, marginBottom: 4 }}><Gift size={14} style={{ verticalAlign: "-2px", color: C.green }} /> What you earn</div>
        <div style={{ fontSize: 12.5, color: C.soil, lineHeight: 1.55 }}>
          Referral rewards activate when Teivaka payments go live — every farmer you bring in is tracked from today,
          so your rewards count from your very first invite. Nothing here is estimated or faked.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: C.soil, fontSize: 14, marginBottom: 10 }}>Farmers you brought in</div>
        {data == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
          : !(data.referred || []).length ? (
            <div style={{ color: C.muted, fontSize: 13 }}>No one has joined with your code yet. Share it and your first reward starts here.</div>
          ) : data.referred.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{p.full_name}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>Joined {p.joined_at ? new Date(p.joined_at).toLocaleDateString() : "—"}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 11px", background: p.farming_now ? "rgba(106,168,79,0.14)" : "rgba(191,144,0,0.12)", color: p.farming_now ? C.greenDk : "#8a6a00" }}>
                {p.farming_now ? "Farming now" : p.verified ? "Joined" : "Just joined"}
              </span>
            </div>
          ))}
      </div>

      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Coming soon — when a farmer you bring in gets a bank loan using their Teivaka record, you share in that too.
      </p>
    </MeShell>
  );
}

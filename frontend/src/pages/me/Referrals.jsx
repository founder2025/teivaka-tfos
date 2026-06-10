/** Referrals — /me/referrals. Real referral code + share link from /api/v1/me/referral. */
import { useEffect, useState } from "react";
import { Copy, Check, Gift } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

export default function Referrals() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getJSON("/api/v1/me/referral").then((r) => setData(r?.data ?? r)).catch(() => setData({})); }, []);

  const code = data?.my_code;
  const shareText = data?.share_links?.copy_text || (code ? `Join Teivaka with my code ${code}` : "Join Teivaka");
  const url = data?.share_links?.whatsapp || "https://teivaka.com";
  const copy = () => { navigator.clipboard?.writeText(shareText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); };

  return (
    <MeShell title="Referrals" subtitle="Invite farmers, buyers and partners to Teivaka.">
      <div style={{ ...card, textAlign: "center" }}>
        <Gift size={28} style={{ color: C.green }} />
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Your referral code</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.08em", color: C.soil, margin: "4px 0" }}>{data == null ? "…" : (code || "—")}</div>
        <div style={{ fontSize: 13, color: C.greenDk, fontWeight: 700 }}>{data?.referred_count ?? 0} joined with your code</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Share link</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ flex: 1, minWidth: 200, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: C.soil, wordBreak: "break-all" }}>{url}</code>
          <button onClick={copy} className="btn btn-primary" style={{ display: "inline-flex", gap: 6, alignItems: "center", background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
            {copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy invite</>}
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" style={{ color: C.greenDk, fontSize: 13, fontWeight: 600 }}>Share on WhatsApp →</a>
        </div>
      </div>
    </MeShell>
  );
}

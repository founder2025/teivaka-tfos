/**
 * InviteCard — the attributed growth loop in the Feed aside (Phase 1).
 * One tap invites a farmer/buyer/worker via WhatsApp using the caller's referral
 * link; they land on the public Landing → Register prefilled with attribution.
 */
import { UserPlus } from "lucide-react";
import { inviteViaWhatsApp } from "../../utils/whatsappShare";

export default function InviteCard({ compact }) {
  return (
    <div className="card" style={{ padding: 14, marginTop: compact ? 12 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <UserPlus size={15} style={{ color: "var(--green-dk)" }} />
        <strong style={{ fontSize: 13, color: "var(--soil)" }}>Grow your network</strong>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.45 }}>
        Invite a farmer, buyer or worker you know. They join with your link — you both grow.
      </div>
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => inviteViaWhatsApp()}>
        <UserPlus size={14} /> Invite via WhatsApp
      </button>
    </div>
  );
}

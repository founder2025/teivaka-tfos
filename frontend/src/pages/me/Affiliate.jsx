/** Affiliate program — /me/affiliate. Honest: no affiliate backend yet (founder-gated). */
import { Award } from "lucide-react";
import { C, card, MeShell } from "./_meCommon";

export default function Affiliate() {
  return (
    <MeShell title="Affiliate program" subtitle="Earn by bringing organisations onto Teivaka.">
      <div style={{ ...card, textAlign: "center", padding: "30px 20px" }}>
        <Award size={34} style={{ color: C.green }} />
        <h2 style={{ color: C.soil, margin: "10px 0 6px", fontSize: 18 }}>Coming soon</h2>
        <p style={{ color: C.muted, fontSize: 13.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
          The affiliate program — commission for referring banks, NGOs, cooperatives and buyers — is being set up.
          It isn't enabled yet, so there's nothing to track here. We'll switch this on and notify eligible members.
        </p>
      </div>
    </MeShell>
  );
}

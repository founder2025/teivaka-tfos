/** Affiliate console — /me/affiliate/console. Honest: no backend yet (founder-gated). */
import { BarChart3 } from "lucide-react";
import { C, card, MeShell } from "./_meCommon";

export default function AffiliateConsole() {
  return (
    <MeShell title="Affiliate console" subtitle="Track referrals, conversions and payouts." back="/me/affiliate">
      <div style={{ ...card, textAlign: "center", padding: "30px 20px" }}>
        <BarChart3 size={34} style={{ color: C.green }} />
        <h2 style={{ color: C.soil, margin: "10px 0 6px", fontSize: 18 }}>Not enabled yet</h2>
        <p style={{ color: C.muted, fontSize: 13.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
          The console (referral analytics, conversion funnel, payout ledger) activates once the affiliate program goes live.
          No data is shown because none is being tracked yet — we won't fabricate numbers.
        </p>
      </div>
    </MeShell>
  );
}

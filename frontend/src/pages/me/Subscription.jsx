/** Subscription — /me/subscription. Real current plan + tier ladder from the
 *  subscriptions backend. No fake checkout (Stripe/M-PAiSA pending). */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

export default function Subscription() {
  const [current, setCurrent] = useState(null);
  const [tiers, setTiers] = useState(null);

  useEffect(() => {
    getJSON("/api/v1/subscriptions/current").then((r) => setCurrent(r?.data ?? r)).catch(() => setCurrent({}));
    getJSON("/api/v1/subscriptions/tiers").then((r) => setTiers(r?.data ?? r ?? [])).catch(() => setTiers([]));
  }, []);

  const cur = (current?.subscription_tier || current?.tier || "").toUpperCase();
  const list = Array.isArray(tiers) ? tiers : (tiers?.tiers || []);

  return (
    <MeShell title="Subscription tier" subtitle="Your plan and what each tier includes.">
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ background: C.green, color: "#fff", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 6 }}>{cur || "—"}</span>
        <div style={{ fontSize: 13.5, color: C.soil }}>Your current plan{current?.subscription_status ? ` · ${current.subscription_status}` : ""}</div>
      </div>

      {list.length === 0 ? (
        <div style={{ ...card, color: C.muted }}>Tier details are loading or not available.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          {list.map((t) => {
            const code = (t.code || t.tier || t.name || "").toUpperCase();
            const isCur = code === cur;
            return (
              <div key={code} style={{ ...card, marginBottom: 0, borderColor: isCur ? C.green : C.line, borderWidth: isCur ? 2 : 1 }}>
                <div style={{ fontWeight: 700, color: C.soil, fontSize: 15 }}>{t.name || code}</div>
                {(t.price_fjd != null || t.price != null) && <div style={{ color: C.greenDk, fontWeight: 700, margin: "4px 0" }}>{t.price_fjd != null ? `FJD ${t.price_fjd}` : t.price}/mo</div>}
                {Array.isArray(t.features) && <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 12.5, color: C.soil }}>{t.features.map((f, i) => <li key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}><Check size={13} style={{ color: C.green, flexShrink: 0, marginTop: 2 }} />{f}</li>)}</ul>}
                {isCur && <div style={{ marginTop: 10, fontSize: 11.5, color: C.greenDk, fontWeight: 600 }}>Current plan</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ ...card, marginTop: 14, color: C.muted, fontSize: 12.5, background: C.cream }}>
        To upgrade or change plans, contact your Teivaka administrator. Online payments (Stripe / M-PAiSA) are being finalised — no charges are processed in-app yet.
      </div>
    </MeShell>
  );
}

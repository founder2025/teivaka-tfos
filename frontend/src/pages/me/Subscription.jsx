/** Subscription — /me/subscription. Prototype openTierPicker parity:
 *  billing strip, five tier cards (incl. Sponsored), current-tier highlight,
 *  and HONEST "Switch to X" — it files a tier-change request the admin
 *  approves after out-of-band payment. Nothing is ever charged in-app. */
import { useEffect, useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function send(method, url, body) {
  const t = localStorage.getItem("tfos_access_token");
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || `Request failed (${r.status})`);
  return j;
}

/* Prototype tier copy (openTierPicker), keyed to the backend's tier codes.
   Live numbers (price, limits) come from /subscriptions/tiers — copy is the
   prototype's; SPONSORED is a display tier granted by admin, never chosen. */
const TIER_CARDS = [
  { code: "FREE", desc: "One farm · essentials · try the platform",
    features: ["One farm", "Core record-keeping", "Public verify link", "TIS chat (limited)", "No Bank Evidence PDF"] },
  { code: "BASIC", desc: "Every serious farmer",
    features: ["More farms + team seats", "Unlimited records", "The Bank Evidence document", "Higher TIS limits", "M-PAiSA billing"] },
  { code: "PROFESSIONAL", desc: "Commercial growers, managers, contractors",
    features: ["Unlimited records + analytics", "More workers + partnerships", "Full reports & exports", "Bulk Bank Evidence", "Priority support"] },
  { code: "ENTERPRISE", desc: "Ministries, NGOs, banks, co-ops, exporters",
    features: ["Unlimited workers + teams", "API + webhooks", "White-label deployment", "Custom PDF templates", "Dedicated support + SLA"] },
  { code: "SPONSORED", desc: "Paid by your sponsor · ministry / NGO / bank", sponsored: true,
    features: ["Basic capability, no cost to you", "The Bank Evidence document", "Sponsor shown on your profile", "Your data always stays yours"] },
];

export default function Subscription() {
  const [current, setCurrent] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => {
    getJSON("/api/v1/subscriptions/current").then((r) => setCurrent(r?.data ?? r)).catch(() => setCurrent({}));
    getJSON("/api/v1/subscriptions/tiers").then((r) => setTiers(r?.data ?? r ?? {})).catch(() => setTiers({}));
    getJSON("/api/v1/subscriptions/requests/mine").then((r) => setReq(r?.data ?? null)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const cur = (current?.subscription_tier || "").toUpperCase();
  const status = current?.subscription_status || "Active";
  const pending = req?.status === "PENDING" ? req : null;

  const requestSwitch = async (code) => {
    setBusy(code);
    try {
      const r = await send("POST", "/api/v1/subscriptions/upgrade", { target_tier: code, payment_method: "MPAISA" });
      toast(r?.data?.message || "Tier change requested ✓", "success");
      load();
    } catch (e) { toast(String(e.message || e), "error"); } finally { setBusy(null); }
  };

  const tile = { flex: 1, minWidth: 140, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px" };

  return (
    <MeShell title="Your tier" subtitle="Tier is account-level — it covers your entire account and all farms inside it.">
      {/* Billing strip — honest values only */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Current plan</div><div style={{ fontWeight: 800, color: C.soil, fontSize: 16 }}>{cur || "—"}</div></div>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Payment</div><div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}><CreditCard size={13} style={{ verticalAlign: "-2px" }} /> M-PAiSA (manual)</div></div>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Status</div><div style={{ fontWeight: 700, color: C.greenDk, fontSize: 14 }}>{status}</div></div>
      </div>

      {pending && (
        <div style={{ ...card, background: "rgba(191,144,0,0.08)", border: "1px solid rgba(191,144,0,0.4)" }}>
          <div style={{ fontWeight: 700, color: "#8a6a00", fontSize: 13.5 }}>Tier change requested — {pending.target_tier}</div>
          <div style={{ fontSize: 12.5, color: C.soil }}>The Teivaka team will contact you to arrange payment. Nothing is charged in-app.</div>
        </div>
      )}
      {req?.status === "REJECTED" && req.reason && (
        <div style={{ ...card, background: "rgba(163,45,45,0.06)", border: "1px solid rgba(163,45,45,0.3)", fontSize: 12.5, color: C.soil }}>
          Your last request wasn't approved{req.reason ? ` — ${req.reason}` : ""}. You can request again.
        </div>
      )}

      {/* Tier cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px,1fr))", gap: 12 }}>
        {TIER_CARDS.map((t) => {
          const live = tiers?.[t.code] || {};
          const isCur = t.code === cur;
          const price = t.sponsored ? "FJD 0" : (live.price_fjd_monthly != null ? (live.price_fjd_monthly === 0 ? "FJD 0" : `FJD ${live.price_fjd_monthly}/mo`) : (t.code === "ENTERPRISE" ? "Contact team" : "—"));
          return (
            <div key={t.code} style={{ ...card, marginBottom: 0, display: "flex", flexDirection: "column", borderColor: isCur ? C.green : C.line, borderWidth: isCur ? 2 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, color: C.soil, fontSize: 15 }}>{live.name || t.code}</span>
                {isCur && <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(106,168,79,0.15)", color: C.greenDk, borderRadius: 999, padding: "3px 9px" }}>CURRENT</span>}
              </div>
              <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 6px" }}>{t.desc}</div>
              <div style={{ fontWeight: 800, color: C.greenDk, fontSize: 17, marginBottom: 8 }}>{price}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12.5, color: C.soil, flex: 1 }}>
                {t.features.map((f, i) => <li key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}><Check size={13} style={{ color: C.green, flexShrink: 0, marginTop: 2 }} />{f}</li>)}
              </ul>
              <div style={{ marginTop: 12 }}>
                {isCur ? (
                  <button disabled style={{ width: "100%", border: `1px solid ${C.line}`, background: C.cream, color: C.muted, borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700 }}><Check size={13} style={{ verticalAlign: "-2px" }} /> Current tier</button>
                ) : t.sponsored ? (
                  <button disabled style={{ width: "100%", border: `1px solid ${C.line}`, background: C.cream, color: C.muted, borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700 }}>By sponsorship</button>
                ) : (
                  <button disabled={Boolean(pending) || busy === t.code} onClick={() => requestSwitch(t.code)}
                    style={{ width: "100%", border: "none", background: pending ? C.line : C.green, color: pending ? C.muted : "#fff", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: pending ? "default" : "pointer" }}>
                    {busy === t.code ? "Requesting…" : `Switch to ${live.name || t.code}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...card, marginTop: 14, color: C.muted, fontSize: 12.5, background: C.cream }}>
        Switching files a request — the Teivaka team confirms payment (M-PAiSA) before any change takes effect. No charges are ever processed in-app.
        Need a ministry, NGO, or bank deployment? <a href="mailto:founder@teivaka.com" style={{ color: C.greenDk }}>Contact the team</a>.
      </div>
    </MeShell>
  );
}

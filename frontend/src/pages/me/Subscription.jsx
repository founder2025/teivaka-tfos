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
   Cards are fully driven by the admin-editable plans (/subscriptions/tiers):
   name, subtitle, price, badge and feature bullets all come from the DB — edit
   them in Admin Settings → Monetization, no deploy. SPONSORED is the only static
   card: it's a display tier granted via a sponsor code, never purchased here. */
const SPONSORED_CARD = {
  name: "Sponsored", description: "Paid by your sponsor · ministry / NGO / bank",
  features: ["Basic capability, no cost to you", "The Bank Evidence document", "Sponsor shown on your profile", "Your data always stays yours"],
};

export default function Subscription() {
  const [current, setCurrent] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sponsor, setSponsor] = useState(null);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const load = () => {
    getJSON("/api/v1/subscriptions/current").then((r) => setCurrent(r?.data ?? r)).catch(() => setCurrent({}));
    getJSON("/api/v1/subscriptions/tiers").then((r) => setTiers(r?.data ?? r ?? {})).catch(() => setTiers({}));
    getJSON("/api/v1/subscriptions/requests/mine").then((r) => setReq(r?.data ?? null)).catch(() => {});
    getJSON("/api/v1/sponsored-seats/mine").then((r) => setSponsor(r?.data ?? null)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const redeem = async () => {
    if (!code.trim()) { toast("Enter your sponsor code", "error"); return; }
    setRedeeming(true);
    try {
      const r = await send("POST", "/api/v1/sponsored-seats/redeem", { code: code.trim() });
      toast(`Sponsored by ${r?.data?.sponsor_name || "your sponsor"} — ${r?.data?.granted_tier} unlocked ✓`, "success");
      setCode(""); load();
    } catch (e) { toast(String(e.message || e), "error"); } finally { setRedeeming(false); }
  };

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

  const tile = { flex: 1, minWidth: 140, background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px" };

  return (
    <MeShell title="Your tier" subtitle="Tier is account-level — it covers your entire account and all farms inside it.">
      {/* Billing strip — honest values only */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Current plan</div><div style={{ fontWeight: 800, color: C.soil, fontSize: 16 }}>{cur || "—"}</div></div>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Payment</div><div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}><CreditCard size={13} style={{ verticalAlign: "-2px" }} /> M-PAiSA (manual)</div></div>
        <div style={tile}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Status</div><div style={{ fontWeight: 700, color: C.greenDk, fontSize: 14 }}>{status}</div></div>
      </div>

      {/* Sponsor code — redeem, or show active sponsorship */}
      {sponsor ? (
        <div style={{ ...card, background: "rgba(46,125,50,0.07)", border: "1px solid rgba(46,125,50,0.35)" }}>
          <div style={{ fontWeight: 800, color: C.greenDk, fontSize: 13.5 }}>Sponsored by {sponsor.sponsor_name}</div>
          <div style={{ fontSize: 12.5, color: C.soil }}>
            Your <strong>{sponsor.granted_tier}</strong> plan is paid for by your sponsor — no cost to you. Your data always stays yours.
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5, marginBottom: 4 }}>Have a sponsor code?</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>If a bank, ministry, or NGO is sponsoring your access, enter the code they gave you to unlock your funded plan free.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TVK-XXXXXXXX"
              style={{ flex: 1, minWidth: 200, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.04em", color: C.soil, background: "var(--paper)" }} />
            <button onClick={redeem} disabled={redeeming}
              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: redeeming ? 0.6 : 1 }}>
              {redeeming ? "Redeeming…" : "Redeem"}
            </button>
          </div>
        </div>
      )}

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

      {/* Tier cards — fully driven by the admin-editable plans, plus the static
          SPONSORED display card. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px,1fr))", gap: 12 }}>
        {tiers == null ? <div style={{ color: C.muted }}>Loading plans…</div> : (() => {
          const live = Object.entries(tiers)
            .filter(([, p]) => p && p.is_active !== false)
            .sort((a, b) => (a[1].sort_order ?? 0) - (b[1].sort_order ?? 0))
            .map(([code, p]) => ({ code, sponsored: false, ...p }));
          const cards = [...live, { code: "SPONSORED", sponsored: true, ...SPONSORED_CARD }];
          return cards.map((t) => {
            const isCur = t.code === cur;
            const price = t.sponsored ? "FJD 0" : (t.price_fjd_monthly === 0 ? "FJD 0" : (t.price_fjd_monthly != null ? `FJD ${t.price_fjd_monthly}/mo` : "—"));
            return (
              <div key={t.code} style={{ ...card, marginBottom: 0, display: "flex", flexDirection: "column", borderColor: isCur ? C.green : C.line, borderWidth: isCur ? 2 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: C.soil, fontSize: 15 }}>{t.name || t.code}</span>
                  {isCur && <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(106,168,79,0.15)", color: C.greenDk, borderRadius: 999, padding: "3px 9px" }}>CURRENT</span>}
                  {!isCur && t.badge && <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(191,144,0,0.15)", color: "#8a6a00", borderRadius: 999, padding: "3px 9px" }}>{t.badge}</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 6px" }}>{t.description || ""}</div>
                <div style={{ fontWeight: 800, color: C.greenDk, fontSize: 17, marginBottom: 8 }}>{price}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12.5, color: C.soil, flex: 1 }}>
                  {(t.features || []).map((f, i) => <li key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}><Check size={13} style={{ color: C.green, flexShrink: 0, marginTop: 2 }} />{f}</li>)}
                </ul>
                <div style={{ marginTop: 12 }}>
                  {isCur ? (
                    <button disabled style={{ width: "100%", border: `1px solid ${C.line}`, background: C.cream, color: C.muted, borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700 }}><Check size={13} style={{ verticalAlign: "-2px" }} /> Current tier</button>
                  ) : t.sponsored ? (
                    <button disabled style={{ width: "100%", border: `1px solid ${C.line}`, background: C.cream, color: C.muted, borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700 }}>By sponsorship</button>
                  ) : (
                    <button disabled={Boolean(pending) || busy === t.code} onClick={() => requestSwitch(t.code)}
                      style={{ width: "100%", border: "none", background: pending ? C.line : C.green, color: pending ? C.muted : "var(--paper)", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: pending ? "default" : "pointer" }}>
                      {busy === t.code ? "Requesting…" : `Switch to ${t.name || t.code}`}
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div style={{ ...card, marginTop: 14, color: C.muted, fontSize: 12.5, background: C.cream }}>
        Switching files a request — the Teivaka team confirms payment (M-PAiSA) before any change takes effect. No charges are ever processed in-app.
        Need a ministry, NGO, or bank deployment? <a href="mailto:founder@teivaka.com" style={{ color: C.greenDk }}>Contact the team</a>.
      </div>
    </MeShell>
  );
}

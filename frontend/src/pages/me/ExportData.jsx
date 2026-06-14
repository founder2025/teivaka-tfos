/** Export data — /me/data. Prototype exportMyData parity: shows the full
 *  inventory of what the export contains (real per-category counts) before
 *  downloading, then downloads the complete JSON (manifest + 13 categories).
 *  Covenant §1: your records are yours — no charge, no lock-in. */
import { useEffect, useState } from "react";
import { Download, Shield, Check, BarChart2 } from "lucide-react";
import { C, getJSON, send, card, MeShell } from "./_meCommon";

const INVENTORY_LABELS = [
  ["profile", "Profile"],
  ["farms", "Farms"],
  ["posts", "Posts"],
  ["replies", "Replies"],
  ["reactions_likes", "Reactions & likes"],
  ["saved_posts", "Saved posts"],
  ["following", "Following"],
  ["followers", "Followers"],
  ["farm_events", "Farm events"],
  ["cycles", "Cycles"],
  ["tasks", "Tasks"],
  ["lessons_completed", "Lessons completed"],
];

export default function ExportData() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [inv, setInv] = useState(null);

  // Aggregate-data consent (Covenant §3). null = still loading; available=false
  // when the backend hasn't shipped the consent ledger yet (migration-tolerant).
  const [consent, setConsent] = useState(null);
  const [conBusy, setConBusy] = useState(false);

  useEffect(() => {
    getJSON("/api/v1/me/export/inventory").then((r) => setInv(r.data || {})).catch(() => setInv({}));
    getJSON("/api/v1/me/consent").then((r) => setConsent(r.data ?? r)).catch(() => setConsent({ available: false }));
  }, []);

  const toggleConsent = async () => {
    if (!consent || conBusy) return;
    const next = !consent.aggregate_consent;
    setConBusy(true); setErr(null);
    try {
      const r = await send("POST", "/api/v1/me/consent", { aggregate_consent: next });
      setConsent({ ...(r.data ?? r), available: true });
    } catch (e) { setErr(String(e.userMessage || e.message || e)); } finally { setConBusy(false); }
  };

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await getJSON("/api/v1/me/export");
      const data = r.data ?? r;
      const uid = data?.manifest?.user_id || "me";
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `teivaka-data-export-${uid}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <MeShell title="Export your data" subtitle="Your records are yours.">
      <div style={{ ...card, background: C.cream, color: C.soil, fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Shield size={15} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
        <span>Your records are yours. Download a copy of everything linked to your account, anytime — no charge, no lock-in. (<a href="/covenant" style={{ color: C.greenDk }}>Data Ownership Covenant, Section 1</a>.)</span>
      </div>

      {/* Inventory — what the export contains, real counts (prototype .exp-list) */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {inv == null ? (
          <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>Counting your records…</div>
        ) : (
          INVENTORY_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 13.5, color: C.soil }}>
              <span>{label}</span>
              <strong style={{ color: C.greenDk }}>{key === "profile" ? "1 record" : (inv[key] ?? 0)}</strong>
            </div>
          ))
        )}
      </div>

      {/* Aggregate-data consent — Covenant §3. Opt-in, default off. Only farms
          whose owner turns this ON can ever enter an external aggregate, and even
          then only inside a k-anonymity group (≥10 farms), never identifiable. */}
      {consent && consent.available !== false && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <BarChart2 size={16} style={{ color: C.green, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.soil }}>Help build Pacific farm intelligence</div>
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 0" }}>
                When this is ON, your farm’s records may be included in <strong>anonymous, grouped</strong> statistics
                (e.g. “average cassava cycles per island”) shared with partners like the Ministry of Agriculture.
                Your name, location and any identifying detail are <strong>never</strong> shared, and figures only
                appear when at least 10 farms are grouped together. OFF by default — turning it off removes your
                farm from all future aggregates immediately. (<a href="/covenant" style={{ color: C.greenDk }}>Covenant, Section 3</a>.)
              </p>
            </div>
            <button onClick={toggleConsent} disabled={conBusy} role="switch" aria-checked={!!consent.aggregate_consent}
              title={consent.aggregate_consent ? "Sharing on — tap to turn off" : "Sharing off — tap to turn on"}
              style={{
                flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: "none", cursor: conBusy ? "wait" : "pointer",
                background: consent.aggregate_consent ? C.green : C.line, position: "relative", transition: "background .15s",
              }}>
              <span style={{
                position: "absolute", top: 3, left: consent.aggregate_consent ? 23 : 3, width: 20, height: 20,
                borderRadius: "50%", background: "var(--paper)", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s",
              }} />
            </button>
          </div>
        </div>
      )}

      <div style={{ ...card, textAlign: "center", padding: "24px 20px" }}>
        <button onClick={run} disabled={busy} style={{ display: "inline-flex", gap: 8, alignItems: "center", background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
          {busy ? "Preparing…" : done ? <><Check size={16} />Downloaded</> : <><Download size={16} />Download my data (JSON)</>}
        </button>
        {err && <div style={{ color: "#b3261e", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5, margin: "14px auto 0", maxWidth: 460 }}>
          Format: JSON — opens in any text editor or imports into a spreadsheet. Photos and videos are listed by reference; the original files remain retrievable from your account.
        </p>
      </div>
    </MeShell>
  );
}

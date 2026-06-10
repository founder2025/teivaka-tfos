/** Export data — /me/data. Real export: fetches the user's data and downloads it as JSON. */
import { useState } from "react";
import { Download, Shield, Check } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

export default function ExportData() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await getJSON("/api/v1/me/export");
      const blob = new Blob([JSON.stringify(r.data ?? r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `teivaka-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <MeShell title="Export data" subtitle="Your records are yours.">
      <div style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
        <Download size={32} style={{ color: C.green }} />
        <p style={{ color: C.soil, fontSize: 13.5, maxWidth: 480, margin: "12px auto", lineHeight: 1.6 }}>
          Download a machine-readable copy of everything linked to your account — your profile, farms and community posts —
          anytime, no charge, no lock-in.
        </p>
        <button onClick={run} disabled={busy} style={{ display: "inline-flex", gap: 8, alignItems: "center", background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "11px 18px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          {busy ? "Preparing…" : done ? <><Check size={16} />Downloaded</> : <><Download size={16} />Download my data</>}
        </button>
        {err && <div style={{ color: "#b3261e", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      </div>
      <div style={{ ...card, background: C.cream, color: C.muted, fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Shield size={15} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
        <span>Your records are yours — exported on request under the <a href="/covenant" style={{ color: C.greenDk }}>Data Ownership Covenant, Section 1</a>. Photos/videos are referenced by URL; originals stay where they were uploaded.</span>
      </div>
    </MeShell>
  );
}

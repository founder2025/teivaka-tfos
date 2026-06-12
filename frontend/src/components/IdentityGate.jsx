/**
 * IdentityGate.jsx — the progressive-verification "identity capture" screen.
 *
 * Shown when a high-value action (Bank-Evidence extraction, settlement, financial
 * matching) returns 403 IDENTITY_VERIFICATION_REQUIRED. Drives the REAL KYC flow
 * (app/routers/kyc.py): upload two documents -> submit a verification request ->
 * pending admin review. No mock: every call hits a live endpoint.
 *
 * Props: { action, onClose } — `action` is a short label of what the user tried.
 */
import { useRef, useState } from "react";

const T = {
  cream: "#F8F3E9", paper: "#FFFFFF", green: "#6AA84F", greenDk: "#4F8A37",
  greenTint: "#E8F0E0", soil: "#5C4033", line: "#E2D8C3", ink: "#2A2118",
  muted: "#7A6E5C", red: "#A32D2D", amber: "#BF9000",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function token() {
  try { return localStorage.getItem("tfos_access_token"); } catch { return null; }
}

export default function IdentityGate({ action = "this action", onClose }) {
  const [idDoc, setIdDoc] = useState(null);
  const [proofDoc, setProofDoc] = useState(null);
  const [state, setState] = useState("idle"); // idle | working | pending | error
  const [error, setError] = useState("");
  const idRef = useRef(null);
  const proofRef = useRef(null);

  async function uploadOne(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/me/verification/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b?.detail || "Upload failed");
    }
  }

  async function handleSubmit() {
    setError("");
    if (!idDoc || !proofDoc) { setError("Please attach both documents."); return; }
    setState("working");
    try {
      await uploadOne(idDoc);
      await uploadOne(proofDoc);
      const res = await fetch("/api/v1/me/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail || "Could not submit your verification request.");
      }
      setState("pending");
    } catch (e) {
      setState("error");
      setError(e.message || "Something went wrong. Please try again.");
    }
  }

  const fileRow = (label, file, ref, setter) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.soil, marginBottom: 6 }}>{label}</div>
      <button type="button" onClick={() => ref.current?.click()}
        style={{ width: "100%", textAlign: "left", border: `1px dashed ${file ? T.green : T.line}`,
          borderRadius: 12, padding: "12px 14px", background: file ? T.greenTint : T.paper,
          color: file ? T.greenDk : T.muted, cursor: "pointer", fontSize: 14, fontFamily: FONT }}>
        {file ? `📎 ${file.name}` : "Tap to attach a photo or PDF"}
      </button>
      <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
        onChange={(e) => setter(e.target.files?.[0] || null)} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(44,26,14,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: 440, background: T.paper, borderRadius: 18,
        border: `1px solid ${T.line}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 24 }}>
        {state === "pending" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🕓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.soil, margin: "0 0 8px" }}>Verification submitted</h2>
            <p style={{ fontSize: 14, color: T.muted, margin: "0 0 20px" }}>
              Your documents are under review. You'll get the green tick once approved — usually within a day.
              You can keep using the rest of the platform in the meantime.
            </p>
            <button onClick={onClose} style={{ width: "100%", padding: "12px", borderRadius: 12,
              background: T.green, color: "#fff", fontWeight: 600, border: "none", cursor: "pointer", fontFamily: FONT }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: T.soil, margin: 0 }}>Verify your identity</h2>
            </div>
            <p style={{ fontSize: 14, color: T.muted, margin: "0 0 18px" }}>
              {`To ${action}, we need to confirm who you are. Your account stays active — this only unlocks
              high-value actions. Attach a government ID and one proof document.`}
            </p>

            {fileRow("Government-issued ID", idDoc, idRef, setIdDoc)}
            {fileRow("Proof document (business cert, payslip, or selfie with ID)", proofDoc, proofRef, setProofDoc)}

            {error && (
              <p role="alert" style={{ fontSize: 13, color: T.red, margin: "4px 0 12px" }}>⚠ {error}</p>
            )}

            <button onClick={handleSubmit} disabled={state === "working"}
              style={{ width: "100%", padding: "12px", borderRadius: 12, background: T.green, color: "#fff",
                fontWeight: 600, border: "none", cursor: "pointer", opacity: state === "working" ? 0.6 : 1, fontFamily: FONT }}>
              {state === "working" ? "Submitting…" : "Submit for verification"}
            </button>
            <button onClick={onClose}
              style={{ width: "100%", padding: "10px", marginTop: 8, borderRadius: 12, background: "transparent",
                color: T.muted, fontWeight: 500, border: "none", cursor: "pointer", fontSize: 14, fontFamily: FONT }}>
              Maybe later
            </button>
          </>
        )}
      </div>
    </div>
  );
}

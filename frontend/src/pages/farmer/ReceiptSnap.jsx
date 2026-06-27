/**
 * ReceiptSnap.jsx — AI receipt/invoice capture (P1). Snap → TIS reads it → editable DRAFT
 * → farmer confirms → commits via /api/v1/cash-ledger (receipt hash-bound, audit-anchored).
 *
 * Human-in-the-loop by design: AI only PRE-FILLS; nothing is saved until the farmer taps Save.
 * If the read fails or confidence is low, it falls back to a pre-filled manual form — never a guess.
 */
import { useState } from "react";
import { Camera, X, RefreshCw, Sparkles, AlertTriangle, ShieldCheck } from "lucide-react";
import { send } from "../../utils/api";

const CATS = ["Seed", "Fertilizer", "Chemicals", "Feed", "Tools", "Equipment", "Fuel", "Repairs", "Freight", "Labour", "Sale", "Other"];
const todayFiji = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" });
function authHeader() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }

export default function ReceiptSnap({ farmId, onClose, onSaved }) {
  const [stage, setStage] = useState("pick");   // pick | analyzing | review | saving
  const [photoUrl, setPhotoUrl] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ type: "EXPENSE", amount: "", category: "Other", description: "", date: todayFiji() });

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(""); setStage("analyzing");
    let url = null;
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/v1/community/uploads", { method: "POST", headers: authHeader(), body: fd });
      const ub = await up.json().catch(() => null);
      url = ub?.data?.url || ub?.url;
      if (!up.ok || !url) throw new Error("upload");
      setPhotoUrl(url);
    } catch {
      setErr("Couldn't upload the photo. Check your connection and try again."); setStage("pick"); return;
    }
    try {
      const d = await send("POST", "/api/v1/receipts/analyze", { photo_url: url });
      const dr = d?.data || {};
      setDraft(dr);
      setForm({
        type: dr.direction === "INCOME" ? "INCOME" : "EXPENSE",
        amount: dr.total_fjd != null ? String(dr.total_fjd) : "",
        category: CATS.includes(dr.category) ? dr.category : "Other",
        description: dr.description || "",
        date: dr.date || todayFiji(),
      });
    } catch (ex) {
      // honest fallback: keep the uploaded photo, let the farmer fill it in manually
      setErr(ex?.userMessage || "TIS couldn't read this receipt — please fill it in below.");
    }
    setStage("review");
  };

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { setErr("Enter the amount."); return; }
    setStage("saving"); setErr("");
    try {
      await send("POST", "/api/v1/cash-ledger", {
        farm_id: farmId, transaction_date: form.date, transaction_type: form.type,
        category: form.category, description: form.description || form.category,
        amount_fjd: Number(form.amount), photo_url: photoUrl || undefined,
      });
      onSaved?.(); onClose?.();
    } catch (ex) { setErr(ex?.userMessage || ex?.message || "Couldn't save — try again."); setStage("review"); }
  };

  const conf = draft?.confidence;
  const lowConf = conf != null && conf < 0.6;
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 };

  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="overlay-head"><h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={16} />Snap a receipt</h2><button onClick={onClose} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">
          {stage === "pick" && (
            <label style={{ display: "block", border: "1.5px dashed var(--line)", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", color: "var(--muted)" }}>
              <Camera size={28} style={{ color: "var(--green-dk)" }} />
              <div style={{ fontWeight: 700, color: "var(--soil)", marginTop: 8 }}>Take or choose a photo of the receipt</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>TIS reads it and fills in the amount, category and date — you check it before saving.</div>
              <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
              {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>{err}</div>}
            </label>
          )}

          {stage === "analyzing" && (
            <div style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
              <RefreshCw size={26} className="animate-spin" style={{ color: "var(--green-dk)" }} />
              <div style={{ fontWeight: 600, color: "var(--soil)", marginTop: 10 }}>TIS is reading your receipt…</div>
            </div>
          )}

          {(stage === "review" || stage === "saving") && (
            <div style={{ display: "grid", gap: 10 }}>
              {photoUrl && <img src={photoUrl} alt="receipt" style={{ maxHeight: 140, borderRadius: 8, objectFit: "contain", alignSelf: "center", border: "1px solid var(--line)" }} />}
              {draft && !err && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "8px 10px", borderRadius: 8, background: lowConf ? "rgba(191,144,0,0.10)" : "var(--green-tint)", color: lowConf ? "var(--amber)" : "var(--green-dk)" }}>
                  {lowConf ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                  {lowConf ? "TIS isn't sure on this one — please check every field before saving." : "TIS read this from your receipt — check it's right, then save."}
                </div>
              )}
              {err && <div style={{ color: "var(--amber)", fontSize: 12.5, display: "flex", gap: 6 }}><AlertTriangle size={14} />{err}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setForm((f) => ({ ...f, type: "EXPENSE" }))} className={`btn btn-sm ${form.type === "EXPENSE" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }}>Money out</button>
                <button onClick={() => setForm((f) => ({ ...f, type: "INCOME" }))} className={`btn btn-sm ${form.type === "INCOME" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }}>Money in</button>
              </div>
              <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Amount (FJD)
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={inp} aria-label="Amount in FJD" /></label>
              <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Category
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inp} aria-label="Category">{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Description
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Crop Care — fertiliser" style={inp} aria-label="Description" /></label>
              <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Date
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={inp} aria-label="Date" /></label>
            </div>
          )}
        </div>
        {(stage === "review" || stage === "saving") && (
          <div className="overlay-foot">
            <button className="btn btn-secondary" onClick={onClose} disabled={stage === "saving"}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={stage === "saving"}>{stage === "saving" ? <><RefreshCw size={14} className="animate-spin" />Saving…</> : "Save to cashbook"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

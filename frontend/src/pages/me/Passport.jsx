/**
 * Passport.jsx — /me/passport — Agricultural Passport (TATI Phase 1).
 *
 * A living professional portfolio that auto-grows from TFOS activity — NOT a profile
 * form. Everything here is a PROJECTION of data the farmer already captured by managing
 * their farm (Golden Rule: never re-ask). The only editable fields are photo / bio /
 * languages. Trust shows an honest "Building" with the real evidence behind it (the
 * scored Trust Engine is Phase 2); sharing is Phase 3 (button present, honestly disabled).
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, MapPin, Sprout, AlertTriangle, RefreshCw, Pencil, Check, Clock,
  Mail, Phone, BadgeCheck, Share2, Sparkles, UserCheck,
} from "lucide-react";
import { C, getJSON, send } from "./_meCommon";
import { apiFetch } from "../../utils/api";
import { formatMoney } from "../../utils/money";
import Modal from "../../components/ui/Modal.jsx";

const fjd = (v) => formatMoney(v, { decimals: 0 }) ?? "FJD 0";
const toast = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };

function Brand() {
  const [ok, setOk] = useState(true);
  if (ok) return <img src="/teivaka-logo.png" alt="TEIVAKA" style={{ height: 24 }} onError={() => setOk(false)} />;
  return <span style={{ fontWeight: 800, letterSpacing: ".06em", color: C.soil }}>TEIVAKA</span>;
}
function Chip({ on, label, building }) {
  const color = on ? C.greenDk : building ? C.amber : C.muted;
  const bg = on ? "var(--green-tint)" : building ? "rgba(191,144,0,0.10)" : "var(--cream)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color, background: bg, border: `1px solid ${color}33`, borderRadius: 999, padding: "3px 9px" }}>
      {on ? <Check size={11} /> : building ? <Clock size={11} /> : null}{label}{building ? " · building" : ""}
    </span>
  );
}
function Stat({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, background: "var(--paper)" }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: C.soil }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>}
    </div>
  );
}

const BANDS = { Strong: C.greenDk, Established: C.green, Developing: C.amber, Building: C.muted };
const DIM_LABELS = {
  production: "Production", operations: "Operations", market: "Market", compliance: "Compliance",
  financial: "Financial record", evidence_completeness: "Evidence completeness",
  record_consistency: "Record consistency", identity: "Identity", farm: "Farm",
  verification_history: "Independent verification",
};

const ORDER = ["Building", "Developing", "Established", "Strong"];
const THRESH = { Building: 25, Developing: 50, Established: 75 };
function milestone(trust) {
  if (trust?.status !== "scored" || trust.overall_band === "Strong") return null;
  const nextBand = ORDER[ORDER.indexOf(trust.overall_band) + 1];
  const gap = (THRESH[trust.overall_band] || 25) - (trust.overall_score || 0);
  // the lowest dimension is the lever to pull
  const lowest = [...(trust.dimensions || [])].sort((a, b) => a.score - b.score)[0];
  const lever = lowest ? (DIM_LABELS[lowest.key] || lowest.key) : "more records";
  return `${Math.max(1, gap)} pts to ${nextBand} — your biggest lever is ${lever.toLowerCase()}`;
}
function fmtAsOf(iso) { try { return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }

function TrustHero({ trust, onView, onRefresh, refreshing }) {
  const scored = trust?.status === "scored";
  const b = scored ? trust.overall_band : "Building";
  const color = BANDS[b] || C.muted;
  const score = scored ? trust.overall_score : 0;
  const next = milestone(trust);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderLeft: `5px solid ${color}`, borderRadius: 14, padding: 16, background: "var(--paper)", marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width={64} height={64} viewBox="0 0 36 36" onClick={onView} role="img"
          aria-label={`Trust ${scored ? score + " out of 100" : "building"}, band ${b}`}
          style={{ cursor: "pointer", flexShrink: 0 }}>
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--cream)" strokeWidth="3.2" />
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round"
            strokeDasharray={`${scored ? score : 0} 100`} transform="rotate(-90 18 18)" />
          <text x="18" y="20.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>{scored ? score : "—"}</text>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Evidence &amp; Reliability Confidence</div>
          <div style={{ fontSize: 18, fontWeight: 800, color }}>{b}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{scored && trust.computed_at ? `as of ${fmtAsOf(trust.computed_at)}` : (trust?.note || "Builds from your records")}</div>
        </div>
        <button onClick={onRefresh} disabled={refreshing} title="Recompute" style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: 7, background: "var(--paper)" }}><RefreshCw size={14} /></button>
      </div>
      {next && <div style={{ marginTop: 10, fontSize: 12, color: C.greenDk, fontWeight: 600 }}>↑ {next}</div>}
      <div onClick={onView} style={{ marginTop: 8, fontSize: 11.5, color: C.muted, cursor: "pointer" }}>Tap the ring to see what drives it · not a lending decision</div>
    </div>
  );
}

function DimRow({ d }) {
  const color = BANDS[d.band] || C.muted;
  return (
    <div style={{ borderBottom: `1px solid ${C.line}`, padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{DIM_LABELS[d.key] || d.key}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{d.score} · {d.band}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--cream)", marginTop: 6, overflow: "hidden" }}><div style={{ width: `${d.score}%`, height: "100%", background: color }} /></div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{d.why}</div>
      {d.how_to_improve && <div style={{ fontSize: 11.5, color: C.greenDk, marginTop: 3 }}>↑ {d.how_to_improve}</div>}
    </div>
  );
}

function RefreshBtn({ onRefresh, refreshing }) {
  return (
    <button onClick={onRefresh} disabled={refreshing} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
      {refreshing ? "Refreshing…" : <><RefreshCw size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Refresh</>}
    </button>
  );
}

function Documents() {
  const [docs, setDocs] = useState(null);
  const [form, setForm] = useState({ doc_type: "LEASE", title: "", expiry_date: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const DT = [["LEASE", "Lease"], ["CERTIFICATE", "Certificate"], ["ID", "ID document"], ["CONTRACT", "Contract"], ["INSURANCE", "Insurance"], ["PERMIT", "Permit"], ["OTHER", "Other"]];
  const reload = useCallback(async () => { try { const d = await getJSON("/api/v1/documents"); setDocs(d?.data?.documents || []); } catch { setDocs([]); } }, []);
  useEffect(() => { reload(); }, [reload]);
  const upload = async () => {
    if (!file) { toast("Pick a file (PDF or image)"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("doc_type", form.doc_type);
      if (form.title) fd.append("title", form.title);
      if (form.expiry_date) fd.append("expiry_date", form.expiry_date);
      const r = await apiFetch("/api/v1/documents", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || "Upload failed");
      toast("Document added"); setFile(null); setForm({ doc_type: "LEASE", title: "", expiry_date: "" }); await reload();
    } catch (e) { toast(e.message || "Upload failed"); } finally { setBusy(false); }
  };
  const view = async (id, title) => {
    try {
      const r = await apiFetch(`/api/v1/documents/${id}/file`);
      if (!r.ok) { toast("Couldn't open"); return; }
      const b = await r.blob(); const url = URL.createObjectURL(b);
      window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast("Couldn't open"); }
  };
  const del = async (id) => { try { await send("DELETE", `/api/v1/documents/${id}`); await reload(); } catch (e) { toast(e.userMessage || e.message || "Couldn't delete"); } };
  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
        <strong style={{ color: C.soil, fontSize: 13.5 }}>Add a document</strong>
        <div style={{ fontSize: 12, color: C.muted, margin: "4px 0 8px" }}>Leases, certificates, IDs, contracts — PDF or image. Stored privately; you control who sees it.</div>
        <div style={{ display: "grid", gap: 8 }}>
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} style={{ ...inp, width: "auto", marginTop: 0 }}>{DT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title (optional)" style={{ ...inp, flex: 1, minWidth: 120, marginTop: 0 }} />
            <label style={{ fontSize: 11.5, color: C.muted }}>Expiry<input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} style={{ ...inp, width: 150 }} /></label>
          </div>
          <button onClick={upload} disabled={busy} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, justifySelf: "start" }}>{busy ? "Uploading…" : "Upload document"}</button>
        </div>
      </div>
      {docs === null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
        : docs.length === 0 ? <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, color: C.muted, fontSize: 13, textAlign: "center" }}>No documents yet. Add your lease, certificates or ID above — they stay private until you share them.</div>
        : docs.map((d) => (
          <div key={d.document_id} style={{ border: `1px solid ${d.expired ? "#e7c9c9" : C.line}`, borderRadius: 12, padding: 12, background: d.expired ? "#fdf3f3" : "var(--paper)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{d.title || d.doc_type} <span style={{ fontWeight: 500, color: C.muted, fontSize: 11.5 }}>· {d.doc_type.toLowerCase()}</span></div>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                {d.expiry_date ? <span style={{ color: d.expired ? "var(--red)" : d.expiring_soon ? C.amber : C.muted, fontWeight: d.expired || d.expiring_soon ? 700 : 400 }}>{d.expired ? "Expired" : d.expiring_soon ? "Expiring soon" : "Expires"} {d.expiry_date} · </span> : ""}
                {Math.round((d.byte_size || 0) / 1024)} KB · verified hash
              </div>
            </div>
            <button onClick={() => view(d.document_id, d.title)} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600 }}>View</button>
            <button onClick={() => del(d.document_id)} aria-label="Delete" style={{ border: `1px solid ${C.line}`, color: "var(--red)", borderRadius: 8, padding: "5px 8px", fontSize: 12 }}>✕</button>
          </div>
        ))}
    </div>
  );
}

function Reputation({ trust, rep, onRefresh, refreshing, onShare, onVerify }) {
  const scored = trust?.status === "scored";
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {scored ? (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={16} style={{ color: BANDS[trust.overall_band] || C.greenDk }} /><strong style={{ color: C.soil }}>Confidence · {trust.overall_score} · {trust.overall_band}</strong></div>
            <RefreshBtn onRefresh={onRefresh} refreshing={refreshing} />
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{trust.disclaimer}</div>
          <div style={{ marginTop: 8 }}>{(trust.dimensions || []).map((d) => <DimRow key={d.key} d={d} />)}</div>
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 12, padding: 14, background: "var(--cream)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ color: C.soil }}>Trust · Building</strong>
            <RefreshBtn onRefresh={onRefresh} refreshing={refreshing} />
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{trust?.note}</div>
        </div>
      )}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
        <strong style={{ color: C.soil, fontSize: 13.5 }}>Your records — the evidence behind your trust</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 10 }}>
          <Stat label="Seasons completed" value={rep.seasons_completed} />
          <Stat label="Production logged" value={`${Math.round(rep.verified_production_kg || 0).toLocaleString()} kg`} />
          <Stat label="Sales recorded" value={fjd(rep.total_sales_fjd)} />
          <Stat label="Photo evidence" value={rep.photo_evidence} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onVerify} style={{ border: `1px solid ${C.greenDk}`, color: C.greenDk, background: "var(--paper)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}><UserCheck size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Get verified</button>
        <button onClick={onShare} style={{ border: `1px solid ${C.greenDk}`, color: "var(--paper)", background: C.greenDk, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}><Share2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Share securely</button>
      </div>
    </div>
  );
}

function SummaryCard({ summary, busy, onGenerate, onAI }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginTop: 12, background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={15} style={{ color: C.greenDk }} /><strong style={{ color: C.soil, fontSize: 13.5 }}>Executive summary</strong></div>
        <button onClick={summary ? onAI : onGenerate} disabled={busy} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{busy ? "Working…" : summary ? "Refresh with AI" : "Generate"}</button>
      </div>
      {summary ? (
        <>
          <div style={{ fontSize: 13, color: C.soil, marginTop: 8, lineHeight: 1.55 }}>{summary.text}</div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>{summary.source === "ai" ? "AI-phrased · grounded in your records" : "Grounded summary from your records"}</div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>A 2-minute institutional read of your passport for a bank or buyer — built only from your real records.</div>
      )}
    </div>
  );
}

function AttestSheet({ open, onClose }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ claim_type: "FARM_OWNERSHIP", verifier_source: "EXTENSION_OFFICER", verifier_label: "", subject_label: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const reload = useCallback(async () => { try { const d = await getJSON("/api/v1/attestations"); setList(d?.data?.attestations || []); } catch { /* noop */ } }, []);
  useEffect(() => { if (open) { reload(); setCreated(null); } }, [open, reload]);
  const create = async () => {
    setBusy(true);
    try { const d = await send("POST", "/api/v1/attestations", form); setCreated(d?.data); await reload(); }
    catch (e) { toast(e.userMessage || e.message || "Couldn't create request"); } finally { setBusy(false); }
  };
  const copy = (url) => { try { navigator.clipboard.writeText(url); toast("Link copied"); } catch { /* noop */ } };
  const CLAIMS = [["FARM_OWNERSHIP", "I own / operate this farm"], ["LAND_BOUNDARY", "I farm this land"], ["IDENTITY", "I'm a real farmer"]];
  const SRC = [["EXTENSION_OFFICER", "Extension officer"], ["COOPERATIVE", "Cooperative"], ["LANDOWNER", "Landowner"], ["BUYER", "Buyer"], ["GOV_PROGRAMME", "Govt programme"]];
  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 };
  return (
    <Modal isOpen={open} onClose={onClose} title="Get verified" size="sm"
      footer={<><button onClick={onClose} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>Done</button><button onClick={create} disabled={busy} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>{busy ? "Creating…" : "Create request link"}</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, color: C.muted }}>Ask someone who knows your farm to confirm a fact. Their confirmation strengthens your verified reputation — independent confirmation counts far more than self-entry.</div>
        {created && (
          <div style={{ border: `1px solid ${C.green}`, background: "var(--green-tint)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 700 }}>Send this link to your verifier</div>
            <div style={{ fontSize: 11.5, color: C.soil, wordBreak: "break-all", fontFamily: "monospace", marginTop: 4 }}>{created.url}</div>
            <button onClick={() => copy(created.url)} style={{ border: `1px solid ${C.greenDk}`, color: C.greenDk, background: "var(--paper)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, marginTop: 6 }}>Copy link</button>
          </div>
        )}
        <label style={{ fontSize: 12.5, color: C.soil }}>What to confirm
          <select value={form.claim_type} onChange={(e) => setForm({ ...form, claim_type: e.target.value })} style={inp}>{CLAIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={{ fontSize: 12.5, color: C.soil }}>Who confirms it
          <select value={form.verifier_source} onChange={(e) => setForm({ ...form, verifier_source: e.target.value })} style={inp}>{SRC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={{ fontSize: 12.5, color: C.soil }}>Their name (optional)
          <input value={form.verifier_label} onChange={(e) => setForm({ ...form, verifier_label: e.target.value })} placeholder="e.g. Officer Mereani, Kadavu" style={inp} /></label>
        {list.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>YOUR REQUESTS</div>
            {list.map((a) => (
              <div key={a.request_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: C.soil }}>
                <span>{a.claim_type.replace(/_/g, " ").toLowerCase()} · {a.verifier_source.replace(/_/g, " ").toLowerCase()}</span>
                <span style={{ color: a.status === "CONFIRMED" ? C.greenDk : a.status === "DECLINED" ? "var(--red)" : C.muted, fontWeight: 600 }}>{a.status.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ShareSheet({ open, onClose }) {
  const [shares, setShares] = useState([]);
  // Evidence (photos/blocks) defaults ON for loan/buyer/insurer shares — proving yourself
  // IS the point of those links — and OFF for general shares. Still freely toggleable.
  const EVIDENCE_DEFAULT_AUD = ["LOAN", "BUYER", "INSURANCE"];
  const [form, setForm] = useState({ audience: "LOAN", share_reason: "", expiry_days: 30, password: "", one_time: false, evidence: true, documents: false });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // {url}
  const reload = useCallback(async () => { try { const d = await getJSON("/api/v1/shares"); setShares(d?.data?.shares || []); } catch { /* noop */ } }, []);
  useEffect(() => { if (open) { reload(); setCreated(null); } }, [open, reload]);
  const create = async () => {
    setBusy(true);
    try {
      const d = await send("POST", "/api/v1/shares", {
        audience: form.audience, share_reason: form.share_reason, one_time: form.one_time,
        expiry_days: Number(form.expiry_days) || 30, password: form.password || null,
        scope: { identity: true, reputation: true, trust: true, farm: true, evidence: form.evidence, documents: form.documents },
      });
      setCreated(d?.data); await reload();
    } catch (e) { toast(e.userMessage || e.message || "Couldn't create link"); } finally { setBusy(false); }
  };
  const revoke = async (id) => { try { await send("POST", `/api/v1/shares/${id}/revoke`); await reload(); toast("Link revoked"); } catch (e) { toast(e.userMessage || e.message || "Couldn't revoke"); } };
  const copy = (url) => { try { navigator.clipboard.writeText(url); toast("Link copied"); } catch { /* noop */ } };
  const AUD = [["LOAN", "Bank / loan"], ["BUYER", "Buyer"], ["INSURANCE", "Insurer"], ["GOVERNMENT", "Government"], ["INVESTOR", "Investor"], ["NGO", "NGO / partner"], ["OTHER", "Other"]];
  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 };
  return (
    <Modal isOpen={open} onClose={onClose} title="Share my passport securely" size="sm"
      footer={<><button onClick={onClose} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>Done</button><button onClick={create} disabled={busy} style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>{busy ? "Creating…" : "Create secure link"}</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        {created && (
          <div style={{ border: `1px solid ${C.green}`, background: "var(--green-tint)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 700, marginBottom: 4 }}>Secure link ready</div>
            <div style={{ fontSize: 11.5, color: C.soil, wordBreak: "break-all", fontFamily: "monospace" }}>{created.url}</div>
            <button onClick={() => copy(created.url)} style={{ border: `1px solid ${C.greenDk}`, color: C.greenDk, background: "var(--paper)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, marginTop: 6 }}>Copy link</button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <img src={`${created.url}/qr.png`} alt="Share QR" width={92} height={92} style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", padding: 4 }} />
              <div style={{ fontSize: 11, color: C.muted }}>Show or print this QR for an in-person loan or buyer meeting — they scan it to open your passport.</div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Expires {created.expires_at?.slice(0, 10)}. You'll see when it's opened, and you can revoke it any time below.</div>
          </div>
        )}
        <label style={{ fontSize: 12.5, color: C.soil }}>Who is this for?
          <select value={form.audience} onChange={(e) => { const a = e.target.value; setForm({ ...form, audience: a, evidence: EVIDENCE_DEFAULT_AUD.includes(a) }); }} style={inp}>{AUD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={{ fontSize: 12.5, color: C.soil }}>Reason (optional)
          <input value={form.share_reason} onChange={(e) => setForm({ ...form, share_reason: e.target.value })} placeholder="e.g. Loan application — BSP" style={inp} /></label>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ fontSize: 12.5, color: C.soil, flex: 1 }}>Expires in (days)
            <input type="number" min="1" max="365" value={form.expiry_days} onChange={(e) => setForm({ ...form, expiry_days: e.target.value })} style={inp} /></label>
          <label style={{ fontSize: 12.5, color: C.soil, flex: 1 }}>Password (optional)
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="leave blank for none" style={inp} /></label>
        </div>
        <label style={{ fontSize: 12.5, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={form.one_time} onChange={(e) => setForm({ ...form, one_time: e.target.checked })} />One-time link (opens once, then dies)</label>
        <label style={{ fontSize: 12.5, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.checked })} />Include photo &amp; block evidence{EVIDENCE_DEFAULT_AUD.includes(form.audience) ? <span style={{ color: C.green, fontWeight: 700 }}> · recommended</span> : null}</label>
        <label style={{ fontSize: 12.5, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={form.documents} onChange={(e) => setForm({ ...form, documents: e.target.checked })} />Include document details (titles/dates only, not files)</label>
        <div style={{ fontSize: 11, color: C.muted }}>The viewer sees your identity, reputation, trust and farm{form.evidence ? ", plus your field photos and blocks" : ""} — never your raw cash records or private notes. You own this share and can revoke it.</div>

        {shares.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>YOUR SHARES</div>
            {shares.map((s) => (
              <div key={s.session_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", color: C.soil }}>
                <span style={{ flex: 1, minWidth: 0 }}>{s.audience}{s.share_reason ? ` · ${s.share_reason}` : ""} <span style={{ color: C.muted }}>· {s.views} view{s.views === 1 ? "" : "s"} · {s.status}</span></span>
                {s.status === "active" && <button onClick={() => revoke(s.session_id)} style={{ border: `1px solid ${C.line}`, color: "var(--red)", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Revoke</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Passport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("overview");
  const [edit, setEdit] = useState(null); // {preferred_name, bio, languages}
  const [refreshing, setRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [attestOpen, setAttestOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [sumBusy, setSumBusy] = useState(false);

  const [expiring, setExpiring] = useState([]);
  const load = useCallback(async () => {
    setErr(false);
    try { const d = await getJSON("/api/v1/passport/me"); setData(d?.data || d); }
    catch { if (!data) setErr(true); }
    try { const e = await getJSON("/api/v1/documents/expiring"); setExpiring(e?.data?.documents || []); } catch { /* best-effort */ }
  }, [data]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const saveProfile = async () => {
    try {
      await send("PUT", "/api/v1/passport/me/profile", {
        preferred_name: edit.preferred_name || null, bio: edit.bio || null,
        languages: (edit.languages || "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast("Passport updated"); setEdit(null); await load();
    } catch (e) { toast(e.userMessage || e.message || "Couldn't save"); }
  };

  const saveTenure = async (farm_id, land_tenure) => {
    try {
      await send("PUT", `/api/v1/passport/me/farm/${farm_id}/tenure`, { land_tenure: land_tenure || null });
      toast("Land tenure saved"); await load();
    } catch (e) { toast(e.userMessage || e.message || "Couldn't save"); }
  };

  const refreshTrust = async () => {
    setRefreshing(true);
    try { await send("POST", "/api/v1/passport/me/trust/refresh"); await load(); }
    catch (e) { toast(e.userMessage || e.message || "Couldn't refresh trust"); }
    finally { setRefreshing(false); }
  };

  const genSummary = async (ai) => {
    setSumBusy(true);
    try {
      const d = ai ? await send("POST", "/api/v1/passport/me/summary/refresh")
                   : await getJSON("/api/v1/passport/me/summary");
      setSummary({ text: d?.data?.summary, source: d?.data?.source });
      if (d?.data?.note) toast(d.data.note);
    } catch (e) { toast(e.userMessage || e.message || "Couldn't generate summary"); }
    finally { setSumBusy(false); }
  };

  if (err && !data) return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <div style={{ border: "1px solid #e7c9c9", background: "#fdf3f3", borderRadius: 12, padding: 20, textAlign: "center" }}>
        <AlertTriangle size={20} style={{ color: "var(--red)" }} />
        <div style={{ fontSize: 13, color: C.soil, margin: "6px 0 10px" }}>Couldn't load your passport.</div>
        <button onClick={load} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}><RefreshCw size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Retry</button>
      </div>
    </div>
  );
  if (!data) return <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, color: C.muted }}>Loading your passport…</div>;

  const id = data.identity || {}; const rep = data.reputation || {}; const farms = data.farms || []; const v = id.verifications || {}; const profile = data.profile || {};
  const TABS = [["overview", "Overview"], ["farm", "Farm"], ["reputation", "Reputation"], ["documents", "Documents"]];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Brand />
        <span style={{ fontSize: 11, color: C.muted }}>Agricultural Passport</span>
      </div>

      {/* identity hero */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, background: "var(--paper)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", background: "var(--green-tint)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {id.photo_url ? <img src={id.photo_url} alt={id.preferred_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Sprout size={28} style={{ color: C.greenDk }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.soil }}>{id.preferred_name || "Your name"}</div>
            {id.legal_name && id.legal_name !== id.preferred_name && <div style={{ fontSize: 12, color: C.muted }}>{id.legal_name}</div>}
            <div style={{ fontSize: 11.5, color: C.muted, fontFamily: "monospace" }}>Farmer #{id.farmer_id}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShareOpen(true)} title="Share securely" style={{ border: `1px solid ${C.greenDk}`, background: C.greenDk, color: "var(--paper)", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}><Share2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Share</button>
            <button onClick={() => setEdit({ preferred_name: id.preferred_name || "", bio: id.bio || "", languages: (id.languages || []).join(", ") })} title="Edit name / bio / languages" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 7, color: C.muted, background: "var(--paper)" }}><Pencil size={14} /></button>
          </div>
        </div>
        {id.bio && <div style={{ fontSize: 13, color: C.soil, marginTop: 10, lineHeight: 1.5 }}>{id.bio}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          <Chip on={v.identity} building={!v.identity} label={v.identity ? "Identity verified" : "Identity · self-reported"} />
          <Chip on={v.farm} label="Farm" />
          <Chip on={v.email} label="Email" />
          <Chip on={v.phone} label="Phone" />
        </div>
      </div>

      {/* attention strip (PP-21) — expiring documents surfaced, not silent */}
      {expiring.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e8d27a", background: "#fff8e6", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#8a6d00", cursor: "pointer" }} onClick={() => setTab("documents")}>
          <AlertTriangle size={14} />{expiring.length} document{expiring.length === 1 ? "" : "s"} expiring soon — review in Documents
        </div>
      )}

      {/* ONE trust hero (PP-26) — band + score + as-of + next milestone */}
      <TrustHero trust={data.trust} onView={() => setTab("reputation")} onRefresh={refreshTrust} refreshing={refreshing} />

      {/* tabs */}
      <div role="tablist" style={{ display: "flex", gap: 8, margin: "14px 0 12px" }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ border: `1px solid ${tab === k ? C.greenDk : C.line}`, background: tab === k ? "var(--green)" : "var(--paper)", color: tab === k ? "var(--paper)" : C.soil, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <Stat label="Seasons completed" value={rep.seasons_completed} sub={`${rep.active_cycles} active now`} />
            <Stat label="Verified production" value={`${Math.round(rep.verified_production_kg || 0).toLocaleString()} kg`} sub={`${rep.harvest_records} harvests`} />
            <Stat label="Recorded sales" value={fjd(rep.total_sales_fjd)} sub={`${rep.sales_records} sales`} />
            <Stat label="On Teivaka since" value={id.member_since || "—"} sub={`${rep.photo_evidence} photos logged`} />
          </div>
          <SummaryCard summary={summary || data.summary} busy={sumBusy} onGenerate={() => genSummary(false)} onAI={() => genSummary(true)} />
        </>
      )}

      {tab === "farm" && (
        <div style={{ display: "grid", gap: 10 }}>
          {farms.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No farm set up yet.</div> : farms.map((f) => (
            <div key={f.farm_id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
              <div style={{ fontWeight: 700, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}><Sprout size={15} style={{ color: C.greenDk }} />{f.farm_name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{f.location ? `${f.location} · ` : ""}{f.area_ha} ha · {f.blocks} block{f.blocks === 1 ? "" : "s"}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, marginTop: 2 }}>{f.farm_id}</div>
              <label style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 8 }}>Land tenure <span>(shown to lenders)</span>
                <select value={f.land_tenure || ""} onChange={(e) => saveTenure(f.farm_id, e.target.value)} style={{ display: "block", marginTop: 4, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, width: "100%", maxWidth: 280 }}>
                  <option value="">— not set —</option>
                  {["iTaukei lease", "Freehold", "Crown/State lease", "Native reserve", "Customary (no lease)", "Other"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>
          ))}

          {(profile.crops?.length || profile.verticals?.length || profile.layers?.length) ? (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Farm Profile · what lenders see</div>
              {profile.crops?.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>What you grow</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{profile.crops.map((c) => <span key={c.name} style={{ background: "var(--green-tint)", color: C.greenDk, border: `1px solid ${C.green}`, borderRadius: 99, padding: "4px 10px", fontSize: 12.5, fontWeight: 600 }}>{c.name}{c.cycles > 1 ? ` ×${c.cycles}` : ""}</span>)}</div>
                </div>
              ) : null}
              {profile.verticals?.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Types of farming</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{profile.verticals.map((t) => <span key={t} style={{ background: "#FBF1DC", color: "#7A5B12", border: "1px solid #EBDCB6", borderRadius: 99, padding: "4px 10px", fontSize: 12.5, fontWeight: 600 }}>{t}</span>)}</div>
                </div>
              ) : null}
              {profile.layers?.length ? (
                <div>
                  <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Production focus</div>
                  {profile.layers.map((l) => <div key={l.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ fontWeight: 600, color: C.soil }}>{l.label}</span><span style={{ color: C.muted }}>{l.n} cycle{l.n === 1 ? "" : "s"}</span></div>)}
                </div>
              ) : null}
            </div>
          ) : null}

          <button onClick={() => navigate("/farm/locations")} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}><MapPin size={14} style={{ verticalAlign: -2, marginRight: 4 }} />View farm map &amp; blocks</button>
        </div>
      )}

      {tab === "reputation" && <Reputation trust={data.trust} rep={rep} onRefresh={refreshTrust} refreshing={refreshing} onShare={() => setShareOpen(true)} onVerify={() => setAttestOpen(true)} />}
      {tab === "documents" && <Documents />}

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
      <AttestSheet open={attestOpen} onClose={() => setAttestOpen(false)} />

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title="Edit passport details" size="sm"
        footer={<><button onClick={() => setEdit(null)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>Cancel</button><button onClick={saveProfile} style={{ border: `1px solid ${C.greenDk}`, color: "var(--paper)", background: C.greenDk, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>Save</button></>}>
        {edit && (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 12.5, color: C.soil }}>Preferred name
              <input value={edit.preferred_name} onChange={(e) => setEdit({ ...edit, preferred_name: e.target.value })} style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12.5, color: C.soil }}>Short bio
              <textarea rows={3} value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} placeholder="e.g. Cassava & eggplant grower, Kadavu — 6 seasons on Teivaka" style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12.5, color: C.soil }}>Languages (comma-separated)
              <input value={edit.languages} onChange={(e) => setEdit({ ...edit, languages: e.target.value })} placeholder="English, iTaukei, Fiji Hindi" style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 4 }} /></label>
            <div style={{ fontSize: 11, color: C.muted }}>Everything else on your passport is built automatically from your farm records — you never have to fill it in.</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

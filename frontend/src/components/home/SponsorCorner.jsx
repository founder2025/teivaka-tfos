/**
 * SponsorCorner — clearly-labelled sponsored placements on Home.
 * Real rows from /community/sponsors (country-targeted, rotated). Honest-empty
 * shows a "Become a sponsor" lead capture (real attribution_event). Every card
 * is marked SPONSORED; clicks are tracked and open the CTA safely in a new tab.
 * compact=true → horizontal strip for narrow screens.
 */
import { useEffect, useState } from "react";
import { Megaphone, ExternalLink, X } from "lucide-react";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const t = tok(); const r = await fetch(u, { method: "POST", headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(b ? { "Content-Type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); }
const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10, outline: "none", color: "var(--soil)", background: "#fff" };

function InquiryModal({ onClose }) {
  const [f, setF] = useState({ organisation: "", email: "", note: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.organisation.trim() && !f.email.trim()) { toast("Add your organisation or email so we can reach you.", "error"); return; }
    setBusy(true);
    try { await postJSON(`${API}/sponsors/inquiry`, f); toast("Thanks — our team will be in touch.", "success"); onClose(); }
    catch { toast("Couldn't send — please try again.", "error"); } finally { setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 420, maxWidth: "100%", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ color: "var(--soil)" }}>Become a sponsor</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>Tell us about your organisation and we'll reach out with placement options.</p>
        <input placeholder="Organisation" value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} style={inp} />
        <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} />
        <textarea placeholder="What would you like to promote?" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ ...inp, minHeight: 70 }} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send inquiry"}</button>
      </div>
    </div>
  );
}

export default function SponsorCorner({ compact = false }) {
  const [items, setItems] = useState(null);
  const [inquiry, setInquiry] = useState(false);
  useEffect(() => { getJSON(`${API}/sponsors?limit=4`).then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);
  const click = async (it) => {
    try { const r = await postJSON(`${API}/sponsors/${it.placement_id}/click`); const url = r?.data?.url || it.cta_url; if (url) window.open(url, "_blank", "noopener,noreferrer"); }
    catch { if (it.cta_url) window.open(it.cta_url, "_blank", "noopener,noreferrer"); }
  };
  if (items == null) return null; // don't flash an empty box while loading

  return (
    <div className="card" style={{ padding: 14, marginBottom: compact ? 0 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Megaphone size={15} style={{ color: "var(--green-dk)" }} />
        <span style={{ fontWeight: 800, fontSize: 13, color: "var(--soil)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sponsor Corner</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          Reach Fiji's farmers, buyers and co-ops — feature your organisation here.
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={() => setInquiry(true)}>Become a sponsor</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: 10, overflowX: compact ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
            {items.map((it) => (
              <div key={it.placement_id} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", minWidth: compact ? 240 : "auto", flexShrink: 0, background: "#fff" }}>
                {it.image_url && <img src={it.image_url} alt="" loading="lazy" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />}
                <div style={{ padding: "9px 11px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {it.sponsor_logo && <img src={it.sponsor_logo} alt="" loading="lazy" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }} />}
                    <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sponsor_name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", flexShrink: 0 }}>SPONSORED</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--soil)", lineHeight: 1.3 }}>{it.title}</div>
                  {it.blurb && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{it.blurb}</div>}
                  {it.cta_url && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => click(it)}>{it.cta_label || "Learn more"} <ExternalLink size={11} /></button>}
                </div>
              </div>
            ))}
          </div>
          {!compact && <button onClick={() => setInquiry(true)} style={{ marginTop: 10, width: "100%", background: "transparent", border: "none", color: "var(--green-dk)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Advertise here →</button>}
        </>
      )}
      {inquiry && <InquiryModal onClose={() => setInquiry(false)} />}
    </div>
  );
}

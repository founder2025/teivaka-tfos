/**
 * Promote — self-serve advertiser console (/me/promote).
 * Create a clearly-labelled paid ad (creative + duration with live price from
 * the admin rate card), submit for review; track your campaigns' status,
 * impressions, clicks and spend. No fake charges: an ad goes live only after
 * admin approval + payment confirmation (see status chips).
 */
import { useEffect, useMemo, useState } from "react";
import { Megaphone, ExternalLink } from "lucide-react";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const t = tok(); const r = await fetch(u, { method: "POST", headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify(b) }); if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || String(r.status)); } return r.json(); }
const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E8E2D4", muted: "#8A7B6F", red: "#D4442E", gold: "#BF9000" };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10, outline: "none", boxSizing: "border-box", color: C.soil, background: "#fff" };

const STATUS_CHIP = {
  PENDING_REVIEW: { label: "In review", bg: "#FBF3DC", fg: C.gold },
  APPROVED: { label: "Approved", bg: "#EAF5E5", fg: C.greenDk },
  PENDING_PAYMENT: { label: "Awaiting payment", bg: "#FBF3DC", fg: C.gold },
  ACTIVE: { label: "Live", bg: "#EAF5E5", fg: C.greenDk },
  REJECTED: { label: "Rejected", bg: "#FBE6E2", fg: C.red },
  PAUSED: { label: "Paused", bg: "#EFE9DC", fg: C.muted },
  ENDED: { label: "Ended", bg: "#EFE9DC", fg: C.muted },
  DRAFT: { label: "Draft", bg: "#EFE9DC", fg: C.muted },
};

export default function Promote() {
  const [rates, setRates] = useState([]);
  const [ads, setAds] = useState(null);
  const [f, setF] = useState({ title: "", blurb: "", sponsor_logo: "", image_url: "", cta_label: "", cta_url: "", billing_period: "WEEKLY", target_country: "" });
  const [busy, setBusy] = useState(false);

  const load = () => getJSON(`${API}/me/ads`).then((r) => setAds(r.data || [])).catch(() => setAds([]));
  useEffect(() => {
    getJSON(`${API}/ad-rates`).then((r) => setRates(r.data || [])).catch(() => setRates([]));
    load();
  }, []);

  const price = useMemo(() => {
    const r = rates.find((x) => x.surface === "HOME_RAIL" && x.billing_period === f.billing_period);
    return r ? r.price_fjd : null;
  }, [rates, f.billing_period]);

  const submit = async () => {
    if (!f.title.trim()) { toast("Give your ad a title.", "error"); return; }
    setBusy(true);
    try {
      await postJSON(`${API}/me/ads`, { ...f, surface: "HOME_RAIL" });
      toast("Ad submitted for review ✓", "success");
      setF({ title: "", blurb: "", sponsor_logo: "", image_url: "", cta_label: "", cta_url: "", billing_period: "WEEKLY", target_country: "" });
      load();
    } catch (e) { toast(String(e.message || e).includes("rate") ? "That duration isn't available right now." : "Couldn't submit — please try again.", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 820 }}>
          <div className="page-header">
            <div>
              <h1>Promote</h1>
              <p className="subtitle">Run a clearly-labelled ad on Teivaka — reach farmers, buyers and co-ops.</p>
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <Megaphone size={15} style={{ color: C.greenDk }} />
              <strong style={{ color: C.soil }}>New ad</strong>
            </div>
            <input placeholder="Headline / title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
            <textarea placeholder="Short blurb (what are you offering?)" value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value })} style={{ ...inp, minHeight: 60 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input placeholder="Logo image URL" value={f.sponsor_logo} onChange={(e) => setF({ ...f, sponsor_logo: e.target.value })} style={inp} />
              <input placeholder="Banner image URL" value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} style={inp} />
              <input placeholder="Button label (e.g. Shop now)" value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} style={inp} />
              <input placeholder="Button link (https://…)" value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} style={inp} />
              <input placeholder="Target country (blank = all)" value={f.target_country} onChange={(e) => setF({ ...f, target_country: e.target.value })} style={inp} />
              <select value={f.billing_period} onChange={(e) => setF({ ...f, billing_period: e.target.value })} style={inp}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
              <div style={{ fontSize: 13, color: C.soil }}>{price != null ? <>Price: <strong>FJD {price.toFixed(2)}</strong> / {f.billing_period.toLowerCase()}</> : "Price unavailable"}</div>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit for review"}</button>
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Ads are reviewed before they go live, and start once payment is confirmed. Every ad is shown labelled <strong>Sponsored</strong>.</p>
          </div>

          <div style={{ fontWeight: 700, color: C.soil, marginBottom: 10 }}>Your campaigns</div>
          {ads == null ? <div className="card" style={{ padding: 18, color: C.muted }}>Loading…</div>
            : ads.length === 0 ? <div className="card" style={{ padding: 22, color: C.muted, fontSize: 13, textAlign: "center" }}>No campaigns yet — create one above.</div>
              : ads.map((a) => {
                const chip = STATUS_CHIP[a.status] || STATUS_CHIP.DRAFT;
                return (
                  <div key={a.placement_id} className="card" style={{ padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    {a.image_url && <img src={a.image_url} alt="" style={{ width: 54, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.soil, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        {(a.billing_period || "").toLowerCase()} · {a.price_fjd != null ? `FJD ${Number(a.price_fjd).toFixed(2)}` : "—"} · {a.impressions} views · {a.clicks} clicks
                        {a.paid_through ? ` · runs to ${new Date(a.paid_through).toLocaleDateString()}` : ""}
                      </div>
                      {a.status === "REJECTED" && a.review_note && <div style={{ fontSize: 11.5, color: C.red, marginTop: 3 }}>Reason: {a.review_note}</div>}
                      {a.status === "PENDING_PAYMENT" && <div style={{ fontSize: 11.5, color: C.gold, marginTop: 3 }}>Approved — we'll confirm payment to start it.</div>}
                    </div>
                    <span style={{ background: chip.bg, color: chip.fg, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{chip.label}</span>
                    {a.status === "ACTIVE" && a.cta_url && <a href={a.cta_url} target="_blank" rel="noopener noreferrer" style={{ color: C.greenDk, display: "flex" }}><ExternalLink size={15} /></a>}
                  </div>
                );
              })}
        </div>
      </main>
    </div>
  );
}

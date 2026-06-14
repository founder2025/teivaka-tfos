/**
 * Promote — self-serve advertiser console (/me/promote).
 * Compose a clearly-labelled ad with a live preview, pick a duration, submit
 * for review, and track campaigns. No fake charges: an ad goes live only after
 * admin approval + payment confirmation. Reuses /uploads, /ad-rates, /me/ads
 * and mirrors the real SponsorCorner card in the preview (WYSIWYG).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, ExternalLink, ImagePlus, X, Copy, ShieldCheck, Check, Pause, Play, RefreshCw } from "lucide-react";
import { CATEGORIES } from "../../utils/personas";

const API = "/api/v1/community";
const tok = () => localStorage.getItem("tfos_access_token");
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function getJSON(u) { const t = tok(); const r = await fetch(u, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
async function postJSON(u, b) { const t = tok(); const r = await fetch(u, { method: "POST", headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify(b) }); if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || String(r.status)); } return r.json(); }
async function uploadFile(file) { const t = tok(); const fd = new FormData(); fd.append("file", file); const r = await fetch(`${API}/uploads`, { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", cream: "var(--cream)", muted: "var(--muted)", red: "var(--red)", gold: "var(--amber)" };
const PERIOD_DAYS = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 };
const PERIOD_LABEL = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };
const blankForm = { title: "", blurb: "", sponsor_logo: "", image_url: "", cta_label: "", cta_url: "", billing_period: "WEEKLY", target_country: "", target_account_type: "" };

const STATUS_CHIP = {
  PENDING_REVIEW: { label: "In review", bg: "#FBF3DC", fg: C.gold },
  APPROVED: { label: "Approved", bg: "var(--green-tint)", fg: C.greenDk },
  PENDING_PAYMENT: { label: "Awaiting payment", bg: "#FBF3DC", fg: C.gold },
  ACTIVE: { label: "Live", bg: "var(--green-tint)", fg: C.greenDk },
  REJECTED: { label: "Rejected", bg: "#FBE6E2", fg: C.red },
  PAUSED: { label: "Paused", bg: "#EFE9DC", fg: C.muted },
  ENDED: { label: "Ended", bg: "#EFE9DC", fg: C.muted },
  DRAFT: { label: "Draft", bg: "#EFE9DC", fg: C.muted },
};

const lbl = { display: "block", fontSize: 12.5, fontWeight: 700, color: C.soil, marginBottom: 4 };
const hint = { fontSize: 11, color: C.muted, marginTop: -6, marginBottom: 10 };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", color: C.soil, background: "var(--paper)", marginBottom: 12 };
const sectionTitle = { fontSize: 11, fontWeight: 800, color: C.greenDk, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" };

/* ---- a single image field (upload → preview) ----------------------------- */
function ImageField({ label, hintText, value, onChange, ratio }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setBusy(true);
    try { const up = await uploadFile(file); if (up?.data?.url) onChange(up.data.url); }
    catch (err) { const s = String(err); toast(s.includes("413") ? "Image too large (max 15 MB)." : s.includes("415") ? "Unsupported image type." : "Upload failed — try again.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={lbl}>{label}</span>
      <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      {value ? (
        <div style={{ position: "relative", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.cream }}>
          <img src={value} alt="" style={{ width: "100%", height: ratio === "wide" ? 96 : 80, objectFit: "cover", display: "block" }} />
          <button onClick={() => onChange("")} title="Remove" style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={busy} style={{ width: "100%", border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: "16px 10px", background: C.cream, color: C.muted, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontSize: 12 }}>
          <ImagePlus size={20} style={{ color: C.green }} />{busy ? "Uploading…" : "Upload image"}
        </button>
      )}
      {hintText && <div style={{ ...hint, marginTop: 6 }}>{hintText}</div>}
    </div>
  );
}

/* ---- live preview (mirrors the real SponsorCorner card) ------------------ */
function AdPreview({ f, sponsorName }) {
  return (
    <div className="card" style={{ padding: 14, position: "sticky", top: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Megaphone size={14} style={{ color: C.greenDk }} />
        <span style={{ fontWeight: 800, fontSize: 12, color: C.soil, textTransform: "uppercase", letterSpacing: "0.04em" }}>Live preview</span>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: "var(--paper)", maxWidth: 280 }}>
        {f.image_url && <img src={f.image_url} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />}
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            {f.sponsor_logo && <img src={f.sponsor_logo} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }} />}
            <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sponsorName || "Your business"}</span>
            <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", flexShrink: 0 }}>SPONSORED</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: C.soil, lineHeight: 1.3 }}>{f.title || "Your headline appears here"}</div>
          {f.blurb && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>{f.blurb}</div>}
          {(f.cta_url || f.cta_label) && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{f.cta_label || "Learn more"} <ExternalLink size={11} /></button>}
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>This is exactly how your ad appears in the Home <strong>Sponsor Corner</strong>.</p>
    </div>
  );
}

export default function Promote() {
  const [rates, setRates] = useState([]);
  const [ads, setAds] = useState(null);
  const [me, setMe] = useState(null);
  const [f, setF] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  const load = () => getJSON(`${API}/me/ads`).then((r) => setAds(r.data || [])).catch(() => setAds([]));
  useEffect(() => {
    getJSON(`${API}/ad-rates`).then((r) => setRates(r.data || [])).catch(() => setRates([]));
    getJSON("/api/v1/auth/me").then((r) => setMe(r?.data ?? r)).catch(() => {});
    load();
  }, []);

  const priceFor = (period) => { const r = rates.find((x) => x.surface === "HOME_RAIL" && x.billing_period === period); return r ? r.price_fjd : null; };
  const dailyRate = priceFor("DAILY");
  const price = priceFor(f.billing_period);

  const submit = async () => {
    if (!f.title.trim()) { toast("Add a headline so people know what you're promoting.", "error"); return; }
    if (f.cta_url && !/^https?:\/\//i.test(f.cta_url.trim())) { toast("Button link must start with http:// or https://", "error"); return; }
    setBusy(true);
    try {
      await postJSON(`${API}/me/ads`, { ...f, surface: "HOME_RAIL" });
      toast("Ad submitted for review ✓", "success");
      setF(blankForm);
      load();
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
    } catch (e) { toast(String(e.message || e).includes("rate") ? "That duration isn't available right now." : "Couldn't submit — please try again.", "error"); }
    finally { setBusy(false); }
  };

  const duplicate = (a) => {
    setF({ title: a.title || "", blurb: a.blurb || "", sponsor_logo: a.sponsor_logo || "", image_url: a.image_url || "", cta_label: a.cta_label || "", cta_url: a.cta_url || "", billing_period: a.billing_period && PERIOD_DAYS[a.billing_period] ? a.billing_period : "WEEKLY", target_country: a.target_country || "", target_account_type: a.target_account_type || "" });
    toast("Copied into the form — review and submit.", "success");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
  };

  const act = async (id, verb, okMsg) => {
    try { await postJSON(`${API}/me/ads/${id}/${verb}`, {}); toast(okMsg, "success"); load(); }
    catch (e) { toast(e.message || "Couldn't do that — try again.", "error"); }
  };

  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 1040 }}>
          <div className="page-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(106,168,79,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Megaphone size={23} style={{ color: C.greenDk }} />
              </span>
              <div>
                <h1 style={{ margin: 0 }}>Promote</h1>
                <p className="subtitle" style={{ margin: "2px 0 0" }}>Put your product or service in front of farmers, buyers and co-ops across Fiji.</p>
              </div>
            </div>
          </div>

          {/* form + live preview */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20, alignItems: "start" }} className="promote-grid">
            <div>
              {/* 1 — your ad */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={sectionTitle}>1 · Your ad</div>
                <span style={lbl}>Headline *</span>
                <input maxLength={70} placeholder="e.g. Quality dalo seedlings — bulk discounts" value={f.title} onChange={(e) => set("title", e.target.value)} style={{ ...inp, marginBottom: 4 }} />
                <div style={hint}>{70 - f.title.length} characters left · this is the first thing people see</div>
                <span style={lbl}>Short description</span>
                <textarea maxLength={160} placeholder="What are you offering? Keep it clear and honest." value={f.blurb} onChange={(e) => set("blurb", e.target.value)} style={{ ...inp, minHeight: 64, marginBottom: 4 }} />
                <div style={hint}>{160 - f.blurb.length} characters left</div>
              </div>

              {/* 2 — images */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={sectionTitle}>2 · Images</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <ImageField label="Logo" hintText="Square works best" value={f.sponsor_logo} onChange={(v) => set("sponsor_logo", v)} />
                  <ImageField label="Banner" hintText="Wide image, shown on top" value={f.image_url} onChange={(v) => set("image_url", v)} ratio="wide" />
                </div>
              </div>

              {/* 3 — call to action */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={sectionTitle}>3 · Button (optional)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><span style={lbl}>Button label</span><input placeholder="e.g. Shop now · Call us" value={f.cta_label} onChange={(e) => set("cta_label", e.target.value)} style={inp} /></div>
                  <div><span style={lbl}>Button link</span><input placeholder="https://…" value={f.cta_url} onChange={(e) => set("cta_url", e.target.value)} style={inp} /></div>
                </div>
              </div>

              {/* 4 — reach */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={sectionTitle}>4 · Where it shows</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <span style={lbl}>Target country</span>
                    <input placeholder="Blank = everyone (e.g. FJ)" value={f.target_country} onChange={(e) => set("target_country", e.target.value.toUpperCase())} maxLength={2} style={inp} />
                  </div>
                  <div>
                    <span style={lbl}>Who sees it</span>
                    <select value={f.target_account_type} onChange={(e) => set("target_account_type", e.target.value)} style={inp}>
                      <option value="">Everyone</option>
                      {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}s</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ ...hint, marginTop: -6 }}>Pick an audience to reach only that group (e.g. show input deals to Farmers). "Everyone" reaches your whole region.</div>
              </div>

              {/* 5 — duration + price */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={sectionTitle}>5 · Duration & price</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {["DAILY", "WEEKLY", "MONTHLY"].map((p) => {
                    const pr = priceFor(p);
                    const on = f.billing_period === p;
                    const perDay = pr != null ? pr / PERIOD_DAYS[p] : null;
                    const saves = (dailyRate != null && perDay != null && p !== "DAILY") ? Math.round((1 - perDay / dailyRate) * 100) : 0;
                    return (
                      <button key={p} onClick={() => set("billing_period", p)}
                        style={{ position: "relative", textAlign: "left", border: `1.5px solid ${on ? C.green : C.line}`, background: on ? "rgba(106,168,79,0.10)" : "var(--paper)", borderRadius: 12, padding: "12px 12px 14px", cursor: "pointer" }}>
                        {on && <span style={{ position: "absolute", top: 8, right: 8, color: C.green }}><Check size={15} /></span>}
                        <div style={{ fontWeight: 800, color: C.soil, fontSize: 13 }}>{PERIOD_LABEL[p]}</div>
                        <div style={{ fontWeight: 800, color: C.greenDk, fontSize: 17, marginTop: 4 }}>{pr != null ? `FJD ${pr.toFixed(2)}` : "—"}</div>
                        {perDay != null && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>≈ FJD {perDay.toFixed(2)}/day</div>}
                        {saves > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: C.greenDk, marginTop: 4, background: "rgba(106,168,79,0.14)", borderRadius: 6, padding: "1px 6px", display: "inline-block" }}>SAVE {saves}%</div>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, color: C.soil }}>Total: <strong style={{ fontSize: 16 }}>{price != null ? `FJD ${price.toFixed(2)}` : "—"}</strong> <span style={{ color: C.muted, fontSize: 12 }}>/ {f.billing_period.toLowerCase()}</span></div>
                  <button className="btn btn-primary" disabled={busy} onClick={submit} style={{ minWidth: 160 }}>{busy ? "Submitting…" : "Submit for review"}</button>
                </div>
              </div>

              {/* trust / how it works */}
              <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start", background: C.cream }}>
                <ShieldCheck size={18} style={{ color: C.greenDk, marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: C.soil, lineHeight: 1.55 }}>
                  <strong>How it works:</strong> Submit → our team reviews it → we confirm payment → it goes live, labelled <strong>Sponsored</strong>. Keep claims honest — no medical or crop-protection promises. You'll see status updates below.
                </div>
              </div>
            </div>

            {/* live preview (sticky on desktop) */}
            <AdPreview f={f} sponsorName={me?.full_name} />
          </div>

          {/* campaigns dashboard */}
          <div style={{ fontWeight: 800, color: C.soil, margin: "8px 0 12px", fontSize: 15 }}>Your campaigns</div>
          {ads == null ? <div className="card" style={{ padding: 18, color: C.muted }}>Loading…</div>
            : ads.length === 0 ? (
              <div className="card" style={{ padding: 28, color: C.muted, fontSize: 13.5, textAlign: "center" }}>
                <Megaphone size={30} style={{ color: C.green, opacity: 0.6, marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: C.soil, marginBottom: 3 }}>No campaigns yet</div>
                Create your first ad above — it takes a minute.
              </div>
            ) : ads.map((a) => {
              const chip = STATUS_CHIP[a.status] || STATUS_CHIP.DRAFT;
              return (
                <div key={a.placement_id} className="card" style={{ padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {a.image_url ? <img src={a.image_url} alt="" style={{ width: 56, height: 42, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 56, height: 42, borderRadius: 8, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Megaphone size={16} style={{ color: C.muted }} /></span>}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, color: C.soil, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {PERIOD_LABEL[a.billing_period] || (a.billing_period || "")} · {a.price_fjd != null ? `FJD ${Number(a.price_fjd).toFixed(2)}` : "—"} · {a.impressions} views · {a.clicks} clicks
                      {a.paid_through ? ` · runs to ${new Date(a.paid_through).toLocaleDateString()}` : ""}
                    </div>
                    {a.status === "REJECTED" && a.review_note && <div style={{ fontSize: 11.5, color: C.red, marginTop: 3 }}>Reason: {a.review_note}</div>}
                    {a.status === "PENDING_PAYMENT" && <div style={{ fontSize: 11.5, color: C.gold, marginTop: 3 }}>Approved — we'll confirm payment to start it.</div>}
                  </div>
                  <span style={{ background: chip.bg, color: chip.fg, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{chip.label}</span>
                  {a.status === "ACTIVE" && <button className="btn btn-secondary btn-sm" onClick={() => act(a.placement_id, "pause", "Ad paused")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Pause size={13} /> Pause</button>}
                  {a.status === "PAUSED" && <button className="btn btn-secondary btn-sm" onClick={() => act(a.placement_id, "resume", "Ad resumed")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Play size={13} /> Resume</button>}
                  {["PAUSED", "ENDED"].includes(a.status) && <button className="btn btn-secondary btn-sm" onClick={() => act(a.placement_id, "extend", "Sent for another period — we'll confirm payment")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><RefreshCw size={13} /> Extend</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => duplicate(a)} title="Copy into the form to re-run" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Copy size={13} /> Duplicate</button>
                  {a.status === "ACTIVE" && a.cta_url && <a href={a.cta_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Open <ExternalLink size={12} /></a>}
                </div>
              );
            })}
        </div>
      </main>
      <style>{`@media (max-width: 860px){ .promote-grid{ grid-template-columns: 1fr !important; } .promote-grid .card[style*="sticky"]{ position: static !important; } }`}</style>
    </div>
  );
}

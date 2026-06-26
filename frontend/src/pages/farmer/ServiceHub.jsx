/**
 * ServiceHub — Market › "Services" tab — audit-approved redesign (2026-06-26).
 * The ecosystem connector: get produce moved/stored, or earn filling jobs near you.
 *   My jobs (requester): post a job, track it, confirm done.
 *   Earn (provider): set a profile, see radius-matched jobs, claim them.
 * Backed by /api/v1/service-jobs + /api/v1/service-provider/profile (community.service_jobs).
 *
 * Redesign (audit SH1–SH27):
 *  · reads via utils/api + error/Retry/loading (SH1/SH2 — no silent empties); formatMoney (SH5)
 *  · requester-first: My jobs default + standalone Post-a-job (SH10/SH12); provider profile collapsed
 *  · validated CompletePriceModal — no window.prompt, no silent $0 (SH3); transparent 5% fee note
 *  · TfpShell + app card/button classes (SH6); drop redundant h1 (SH7); no emoji (SH4)
 *  · shared <Modal> Esc/focus; arrow-key tabs; page Ask AI (SH9); submit-locks
 * FILED (backend): book BOTH money legs to cash_ledger on completion (SH17 keystone — requester
 *  expense + provider income; today only a 5% provider fee accrues, neither leg booked), in-app
 *  contact + post-post status (SH11/SH24/SH25), map view (SH20), ratings (SH22), recurring/fleet
 *  (SH18), cold-chain record (SH19), fee settlement rail (SH25).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Snowflake, MapPin, Check, X, Sparkles, Plus, AlertTriangle, ChevronDown } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", cream: "var(--cream)", red: "var(--red)" };
const lbl = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, display: "block", marginBottom: 3 };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const emitToast = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };
const SVC = [["TRANSPORT", "Transport / delivery"], ["COLD_STORAGE", "Cold storage"], ["INPUT_DELIVERY", "Input delivery"], ["MACHINERY", "Machinery"], ["TOOLS", "Tools"], ["OTHER", "Other"]];
const svcLabel = (k) => (SVC.find((s) => s[0] === k) || [k, k])[1];
const STATUS_LABEL = { OPEN: "Open", CLAIMED: "Claimed", COMPLETED: "Done", CANCELLED: "Cancelled" };
const fjd = (n) => (n == null ? "—" : formatMoney(n, { decimals: 2 }));

// Shared modal: Esc-close, role=dialog, focus-on-open.
function Modal({ title, onClose, children, foot, maxWidth }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button onClick={onClose} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}
function ErrorCard({ msg, onRetry }) {
  return <div className="card" style={{ padding: 22, textAlign: "center", color: C.muted }}><div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 10 }}><AlertTriangle size={16} style={{ color: "var(--amber)" }} /><span style={{ fontWeight: 600, color: C.soil }}>{msg}</span></div><button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>;
}

function JobCard({ j, children }) {
  const Icon = j.service_type === "COLD_STORAGE" ? Snowflake : Truck;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon size={15} style={{ color: C.greenDk }} />
        <strong style={{ color: C.soil, fontSize: 13.5 }}>{j.title}</strong>
        <span style={pill("var(--cream)", C.greenDk)}>{svcLabel(j.service_type)}</span>
        <span style={pill(j.status === "OPEN" || j.status === "COMPLETED" ? "#eef7ee" : j.status === "CANCELLED" ? "#f3f3f3" : "var(--cream)", C.muted)}>{STATUS_LABEL[j.status] || j.status}</span>
        {j.distance_km != null && <span style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}><MapPin size={11} style={{ verticalAlign: "-1px" }} /> {j.distance_km} km</span>}
      </div>
      <div style={{ fontSize: 12.5, color: C.soil, marginTop: 6 }}>
        {j.produce_desc && <span>{j.produce_desc}{j.quantity_kg ? ` · ${j.quantity_kg} kg` : ""} · </span>}
        {j.pickup_location && <span>from <strong>{j.pickup_location}</strong> </span>}
        {j.dropoff_location && <span>→ <strong>{j.dropoff_location}</strong> </span>}
        {j.budget_fjd != null && <span>· budget {fjd(j.budget_fjd)}</span>}
      </div>
      {j.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{j.notes}</div>}
      {children && <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

export default function ServiceHub() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("requests");
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=none
  const [available, setAvailable] = useState(undefined);
  const [claimed, setClaimed] = useState(undefined);
  const [mine, setMine] = useState(undefined);
  const [errWork, setErrWork] = useState(false);
  const [errMine, setErrMine] = useState(false);
  const [showProvider, setShowProvider] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [completeFor, setCompleteFor] = useState(null);
  const [p, setP] = useState({ display_name: "", service_types: [], base_location: "", base_lat: "", base_lng: "", service_radius_km: 25, phone: "", capacity_note: "", is_active: true });

  const loadProfile = () => getJSON("/api/v1/service-provider/profile")
    .then((r) => { const d = r?.data; setProfile(d || null); if (d) setP((o) => ({ ...o, ...d, service_types: d.service_types || [], base_lat: d.base_lat ?? "", base_lng: d.base_lng ?? "" })); setShowProvider(!d); })
    .catch(() => { setProfile(null); setShowProvider(true); });
  const loadWork = () => { setErrWork(false);
    getJSON("/api/v1/service-jobs/available").then((r) => setAvailable(r?.data || [])).catch(() => { setAvailable([]); setErrWork(true); });
    getJSON("/api/v1/service-jobs/claimed").then((r) => setClaimed(r?.data || [])).catch(() => setClaimed([])); };
  const loadMine = () => { setErrMine(false); getJSON("/api/v1/service-jobs/mine").then((r) => setMine(r?.data || [])).catch(() => { setMine([]); setErrMine(true); }); };
  useEffect(() => { loadProfile(); loadWork(); loadMine(); }, []); // eslint-disable-line

  const saveProfile = async () => {
    try {
      await send("PUT", "/api/v1/service-provider/profile", {
        display_name: p.display_name || null, service_types: p.service_types,
        base_location: p.base_location || null, base_lat: p.base_lat === "" ? null : Number(p.base_lat),
        base_lng: p.base_lng === "" ? null : Number(p.base_lng), service_radius_km: Number(p.service_radius_km) || 25,
        phone: p.phone || null, capacity_note: p.capacity_note || null, is_active: p.is_active !== false });
      emitToast("Provider profile saved"); loadProfile(); loadWork();
    } catch (e) { emitToast(e?.userMessage || "Could not save profile"); }
  };
  const useMyGps = () => { if (!navigator.geolocation) return emitToast("No GPS available"); navigator.geolocation.getCurrentPosition((pos) => setP((o) => ({ ...o, base_lat: pos.coords.latitude.toFixed(6), base_lng: pos.coords.longitude.toFixed(6) })), () => emitToast("Couldn't get location")); };
  const toggleType = (t) => setP((o) => ({ ...o, service_types: o.service_types.includes(t) ? o.service_types.filter((x) => x !== t) : [...o.service_types, t] }));

  const act = async (url, ok) => { try { await send("POST", url); emitToast(ok); loadWork(); loadMine(); } catch (e) { emitToast(e?.userMessage || "Failed"); } };
  const claim = (id) => act(`/api/v1/service-jobs/${id}/claim`, "Job claimed");
  const cancel = (id) => act(`/api/v1/service-jobs/${id}/cancel`, "Job cancelled");
  const askAi = () => navigate("/tis?q=" + encodeURIComponent("How can I arrange affordable transport or cold storage for my farm produce?"));
  const onTabKey = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setTab((t) => (t === "requests" ? "work" : "requests")); } };

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 820 }}>
          <div className="page-header">
            <div className="subtitle">Connect the gaps — get produce moved or stored, or earn by filling jobs near you.</div>
            <div className="page-actions"><button className="btn btn-secondary" onClick={askAi}><Sparkles size={14} />Ask AI</button></div>
          </div>

          <div className="cycle-view-tabs" role="tablist" aria-label="Services views">
            <button role="tab" aria-selected={tab === "requests"} tabIndex={tab === "requests" ? 0 : -1} className={`task-tab ${tab === "requests" ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setTab("requests")} onKeyDown={onTabKey}>My jobs<span className="task-tab-count" style={{ fontSize: 10 }}>Get moved/stored</span></button>
            <button role="tab" aria-selected={tab === "work"} tabIndex={tab === "work" ? 0 : -1} className={`task-tab ${tab === "work" ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => setTab("work")} onKeyDown={onTabKey}>Earn<span className="task-tab-count" style={{ fontSize: 10 }}>Fill jobs near you</span></button>
          </div>

          {tab === "requests" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button className="btn btn-primary" onClick={() => setPostOpen(true)}><Plus size={14} />Post a job</button></div>
              {mine === undefined ? <div className="card" style={{ padding: 20, color: C.muted }}>Loading…</div>
                : errMine && mine.length === 0 ? <ErrorCard msg="Couldn't load your jobs." onRetry={loadMine} />
                : mine.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center" }}><div style={{ fontWeight: 700, color: C.soil }}>No jobs yet</div><div style={{ fontSize: 12.5, color: C.muted, margin: "6px auto 14px", maxWidth: 420, lineHeight: 1.5 }}>Post a transport or cold-storage job and nearby providers get notified. You can also start one from a sale (Buyers → order → Find transport).</div><button className="btn btn-primary" onClick={() => setPostOpen(true)}><Plus size={14} />Post a job</button></div>
                : mine.map((j) => (
                  <JobCard key={j.job_id} j={j}>
                    {j.status === "CLAIMED" && <button className="btn btn-primary btn-sm" onClick={() => setCompleteFor(j)}><Check size={13} style={{ verticalAlign: "-2px" }} /> Confirm done</button>}
                    {(j.status === "OPEN" || j.status === "CLAIMED") && <button className="btn btn-secondary btn-sm" style={{ color: C.red }} onClick={() => cancel(j.job_id)}><X size={13} style={{ verticalAlign: "-2px" }} /> Cancel</button>}
                    {j.status === "COMPLETED" && j.agreed_price_fjd != null && <span style={{ fontSize: 12.5, color: C.greenDk, fontWeight: 700 }}>Paid {fjd(j.agreed_price_fjd)}</span>}
                  </JobCard>
                ))}
            </>
          )}

          {tab === "work" && (
            <>
              <div className="card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
                <button onClick={() => setShowProvider((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", font: "inherit" }}>
                  <span style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>Your provider profile{profile ? "" : " — set up to start earning"}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{profile && !showProvider && <span style={{ fontSize: 11.5, color: C.muted }}>{(profile.service_types || []).length} service{(profile.service_types || []).length === 1 ? "" : "s"} · {profile.is_active !== false ? "available" : "off"}</span>}<ChevronDown size={16} style={{ transform: showProvider ? "rotate(180deg)" : "none", transition: "transform .15s", color: C.muted }} /></span>
                </button>
                {showProvider && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <p style={{ fontSize: 12, color: C.muted, margin: "0 0 10px" }}>Set what you offer and where — you'll see matching jobs within your radius.</p>
                    <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><span style={lbl}>Display name</span><input value={p.display_name || ""} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></div>
                      <div><span style={lbl}>Phone</span><input value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></div>
                    </div>
                    <span style={{ ...lbl, marginTop: 10 }}>Services you offer</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 10px" }}>
                      {SVC.map(([k, l]) => <button key={k} onClick={() => toggleType(k)} style={{ ...pill(p.service_types.includes(k) ? "#eef7ee" : "var(--cream)", p.service_types.includes(k) ? C.greenDk : C.muted), border: `1px solid ${p.service_types.includes(k) ? C.green : C.line}`, cursor: "pointer", padding: "5px 11px" }}>{l}</button>)}
                    </div>
                    <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
                      <div><span style={lbl}>Base location</span><input value={p.base_location || ""} onChange={(e) => setP({ ...p, base_location: e.target.value })} /></div>
                      <div><span style={lbl}>Lat</span><input value={p.base_lat} onChange={(e) => setP({ ...p, base_lat: e.target.value })} /></div>
                      <div><span style={lbl}>Lng</span><input value={p.base_lng} onChange={(e) => setP({ ...p, base_lng: e.target.value })} /></div>
                      <div><span style={lbl}>Radius km</span><input type="number" value={p.service_radius_km} onChange={(e) => setP({ ...p, service_radius_km: e.target.value })} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={useMyGps}><MapPin size={13} style={{ verticalAlign: "-2px" }} /> Use my GPS</button>
                      <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={p.is_active !== false} onChange={(e) => setP({ ...p, is_active: e.target.checked })} /> Available for jobs</label>
                      <button className="btn btn-primary btn-sm" onClick={saveProfile} style={{ marginLeft: "auto" }}>Save profile</button>
                    </div>
                  </div>
                )}
              </div>

              <strong style={{ color: C.soil, fontSize: 14 }}>Jobs near you</strong>
              <div style={{ marginTop: 8 }}>
                {available === undefined ? <div className="card" style={{ padding: 20, color: C.muted }}>Loading…</div>
                  : errWork && available.length === 0 ? <ErrorCard msg="Couldn't load nearby jobs." onRetry={loadWork} />
                  : available.length === 0 ? <div className="card" style={{ padding: 20, color: C.muted }}>No open jobs match your profile right now.</div>
                  : available.map((j) => <JobCard key={j.job_id} j={j}><button className="btn btn-primary btn-sm" onClick={() => claim(j.job_id)}>Claim job</button></JobCard>)}
              </div>

              {claimed && claimed.length > 0 && (
                <>
                  <strong style={{ color: C.soil, fontSize: 14, display: "block", marginTop: 16 }}>Jobs you've claimed</strong>
                  <div style={{ marginTop: 8 }}>{claimed.map((j) => <JobCard key={j.job_id} j={j} />)}</div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {postOpen && <PostJobModal onClose={() => setPostOpen(false)} onSaved={() => { loadMine(); setPostOpen(false); }} />}
      {completeFor && <CompletePriceModal job={completeFor} onClose={() => setCompleteFor(null)} onSaved={() => { loadMine(); setCompleteFor(null); }} />}
    </TfpShell>
  );
}

function PostJobModal({ onClose, onSaved }) {
  const [f, setF] = useState({ service_type: "TRANSPORT", title: "", produce_desc: "", quantity_kg: "", pickup_location: "", dropoff_location: "", needed_by: "", budget_fjd: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.title.trim()) { emitToast("Give the job a short title"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", "/api/v1/service-jobs", {
        service_type: f.service_type, title: f.title.trim(), produce_desc: f.produce_desc.trim() || null,
        quantity_kg: f.quantity_kg ? Number(f.quantity_kg) : null, pickup_location: f.pickup_location.trim() || null,
        dropoff_location: f.dropoff_location.trim() || null, needed_by: f.needed_by || null,
        budget_fjd: f.budget_fjd ? Number(f.budget_fjd) : null, notes: f.notes.trim() || null });
      emitToast("Job posted — nearby providers notified"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not post the job"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Post a job" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Posting…" : "Post job"}</button></>}>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Service</label><select value={f.service_type} onChange={set("service_type")}>{SVC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label>Title</label><input value={f.title} onChange={set("title")} placeholder="e.g. Deliver 80kg eggplant to Suva" /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>What (optional)</label><input value={f.produce_desc} onChange={set("produce_desc")} placeholder="produce / cargo" /></div>
        <div><label>Qty kg</label><input type="number" min="0" value={f.quantity_kg} onChange={set("quantity_kg")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>From (pickup)</label><input value={f.pickup_location} onChange={set("pickup_location")} placeholder="your farm / village" /></div>
        <div><label>To (drop-off)</label><input value={f.dropoff_location} onChange={set("dropoff_location")} placeholder="market / buyer" /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Needed by (optional)</label><input type="date" value={f.needed_by} onChange={set("needed_by")} /></div>
        <div><label>Budget FJD (optional)</label><input type="number" min="0" step="0.50" value={f.budget_fjd} onChange={set("budget_fjd")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Notes (optional)</label><textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

function CompletePriceModal({ job, onClose, onSaved }) {
  const [price, setPrice] = useState(job.agreed_price_fjd != null ? String(job.agreed_price_fjd) : (job.budget_fjd != null ? String(job.budget_fjd) : ""));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    const n = Number(price);
    if (!(n > 0)) { emitToast("Enter the price you paid the provider"); return; }
    lock.current = true; setBusy(true);
    try {
      await send("POST", `/api/v1/service-jobs/${encodeURIComponent(job.job_id)}/complete`, { agreed_price_fjd: n });
      emitToast("Job completed"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not complete the job"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title="Confirm done" onClose={onClose} maxWidth={440} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Confirm done"}</button></>}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>{job.title}. Enter the price you actually paid the provider.</div>
      <div className="form-row"><label>Price paid (FJD)</label><input type="number" min="0" step="0.50" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus /></div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>A 5% marketplace fee applies to the provider. (Posting this to your Cash book is on the roadmap.)</div>
    </Modal>
  );
}

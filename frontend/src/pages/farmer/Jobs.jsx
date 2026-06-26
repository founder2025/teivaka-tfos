/**
 * Jobs.jsx — Market › "Jobs" tab — Teivaka agri-sector employment marketplace (Phase 1).
 *
 * Any member posts roles (Hire) and any member finds + applies for work (Find work).
 * On HIRE the accepted applicant can be added to the employer's Labour page (tenant.workers)
 * — the jobs → hire → attendance → wages → Bank Evidence loop.
 *
 * Backed by /api/v1/job-listings + /worker-profile + /job-applications (community.* — members-only,
 * free at alpha). Built to platform standards: api.js (token refresh + humanized errors),
 * cached-on-error, formatMoney, Fiji time, shared a11y <Modal>, min-wage soft guard, no self-apply,
 * view-aware Ask AI, lucide-only, mobile-first.
 * FILED (fast-follow): notify matching seekers on post (in-app + WhatsApp); worker/employer
 * reliability; map view; ratings; offer letters; FNPF tracking; monetization.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, MapPin, X, Sparkles, Plus, AlertTriangle, ChevronDown, Check, Users } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { getJSON, send } from "../../utils/api";
import { getCurrentUser } from "../../utils/auth";
import { formatMoney } from "../../utils/money";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", cream: "var(--cream)", red: "var(--red)", amber: "var(--amber)" };
const lbl = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, display: "block", marginBottom: 3 };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const emitToast = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" });

const EMP = [["CASUAL", "Casual"], ["PERMANENT", "Permanent"], ["CONTRACT", "Contract"], ["SEASONAL", "Seasonal / harvest"], ["APPRENTICE", "Apprentice / trainee"]];
const EMP_LABEL = Object.fromEntries(EMP);
const SECTOR = [["FARM_LABOUR", "Farm labour"], ["AGRIBUSINESS", "Agri-business"], ["SUPPLIER", "Supplier"], ["PROCESSING", "Processing"], ["TRANSPORT", "Transport"], ["EXTENSION", "Extension / advisory"], ["OTHER", "Other"]];
const SECTOR_LABEL = Object.fromEntries(SECTOR);
const PERIOD = [["DAY", "per day"], ["HOUR", "per hour"], ["WEEK", "per week"], ["MONTH", "per month"], ["PIECE", "per piece"]];
const PERIOD_LABEL = Object.fromEntries(PERIOD);
const WORKER_TYPES = [["CASUAL", "Casual"], ["PERMANENT", "Permanent"], ["CONTRACT", "Contract"]];
const APP_STATUS = { APPLIED: "Applied", SHORTLISTED: "Shortlisted", ACCEPTED: "Accepted", DECLINED: "Declined", WITHDRAWN: "Withdrawn" };
const MIN_WAGE_HR = 4.0; // Fiji minimum wage (FJD/hr) — soft guard

function payText(l) {
  if (l.pay_negotiable || l.pay_rate_fjd == null) return "Negotiable";
  return `${formatMoney(l.pay_rate_fjd, { decimals: 0 })} ${PERIOD_LABEL[l.pay_period] || ""}`.trim();
}
function effHourly(rate, period) {
  const r = Number(rate) || 0; if (!r) return null;
  if (period === "HOUR") return r;
  if (period === "DAY") return r / 8;
  if (period === "WEEK") return r / 40;
  if (period === "MONTH") return r / 173;
  return null; // PIECE — can't infer
}

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
  return <div className="card" style={{ padding: 22, textAlign: "center", color: C.muted }}><div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 10 }}><AlertTriangle size={16} style={{ color: C.amber }} /><span style={{ fontWeight: 600, color: C.soil }}>{msg}</span></div><button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>;
}
function MinWageNote({ rate, period }) {
  const h = effHourly(rate, period);
  if (h == null || h >= MIN_WAGE_HR) return null;
  return <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.amber, marginTop: 6 }}><AlertTriangle size={12} />That's about {formatMoney(h, { decimals: 2 })}/hr — below Fiji minimum wage (FJD {MIN_WAGE_HR.toFixed(2)}/hr).</div>;
}

function ListingCard({ l, children }) {
  return (
    <div className="card" style={{ padding: 13, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Briefcase size={15} style={{ color: C.greenDk }} />
        <strong style={{ color: C.soil, fontSize: 14 }}>{l.role_title}</strong>
        <span style={pill("var(--cream)", C.greenDk)}>{EMP_LABEL[l.employment_type] || l.employment_type}</span>
        {l.sector && <span style={pill("var(--cream)", C.muted)}>{SECTOR_LABEL[l.sector] || l.sector}</span>}
        {l.status && l.status !== "OPEN" && <span style={pill("#f3f3f3", C.muted)}>{l.status}</span>}
        {l.distance_km != null && <span style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}><MapPin size={11} style={{ verticalAlign: "-1px" }} /> {l.distance_km} km</span>}
      </div>
      <div style={{ fontSize: 12.5, color: C.soil, marginTop: 6 }}>
        {l.poster_org_name && <span><strong>{l.poster_org_name}</strong> · </span>}
        {l.location && <span>{l.location} · </span>}
        <span>{payText(l)}</span>
        {l.positions > 1 && <span> · {l.positions} positions</span>}
      </div>
      {l.description && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{l.description}</div>}
      {(l.skills_required || []).length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>{l.skills_required.map((s) => <span key={s} style={pill("var(--cream)", C.muted)}>{s}</span>)}</div>}
      {l.start_date && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>Starts {String(l.start_date).slice(0, 10)}{l.duration_note ? ` · ${l.duration_note}` : ""}{l.apply_deadline ? ` · apply by ${String(l.apply_deadline).slice(0, 10)}` : ""}</div>}
      {children && <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>}
    </div>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const myId = getCurrentUser()?.sub;
  const [tab, setTab] = useState("find");
  const [empFilter, setEmpFilter] = useState("");
  const [regionQ, setRegionQ] = useState("");
  const [available, setAvailable] = useState(undefined);
  const [hasProfile, setHasProfile] = useState(true);
  const [myApps, setMyApps] = useState(undefined);
  const [mine, setMine] = useState(undefined);
  const [hireLoaded, setHireLoaded] = useState(false);
  const [errFind, setErrFind] = useState(false);
  const [errHire, setErrHire] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [postEdit, setPostEdit] = useState(null); // listing being edited (JA8)
  const [applyFor, setApplyFor] = useState(null);
  const [applicantsFor, setApplicantsFor] = useState(null);
  const [hireFor, setHireFor] = useState(null); // {listing, application}
  const [prof, setProf] = useState({ display_name: "", skills: [], experience_note: "", location: "", base_lat: "", base_lng: "", available_from: "", desired_types: [], phone: "", whatsapp: "", is_active: true });
  const [skillsText, setSkillsText] = useState("");

  const loadFind = () => {
    setErrFind(false);
    getJSON(`/api/v1/job-listings/available${empFilter ? `?employment_type=${empFilter}` : ""}`)
      .then((r) => { setAvailable(r?.data || []); setHasProfile(r?.has_profile !== false); }).catch(() => { setAvailable([]); setErrFind(true); });
    getJSON("/api/v1/my-applications").then((r) => setMyApps(r?.data || [])).catch(() => setMyApps([]));
  };
  const loadProfile = () => getJSON("/api/v1/worker-profile").then((r) => { const d = r?.data; if (d) { setProf((o) => ({ ...o, ...d, skills: d.skills || [], desired_types: d.desired_types || [], base_lat: d.base_lat ?? "", base_lng: d.base_lng ?? "", available_from: d.available_from ? String(d.available_from).slice(0, 10) : "" })); setSkillsText((d.skills || []).join(", ")); } }).catch(() => {}).finally(() => setProfileLoaded(true));
  // JBS2: "weak" = no profile OR a profile with no skills (only once loaded, to avoid a flash).
  const profileWeak = profileLoaded && (hasProfile === false || skillsText.trim() === "");
  const loadHire = () => { setErrHire(false); getJSON("/api/v1/job-listings/mine").then((r) => setMine(r?.data || [])).catch(() => { setMine([]); setErrHire(true); }); };
  useEffect(() => { loadProfile(); }, []); // eslint-disable-line
  useEffect(() => { loadFind(); }, [empFilter]); // eslint-disable-line  (single load; region filters client-side)
  const regionMatch = (l) => { const q = regionQ.trim().toLowerCase(); return !q || `${l.region || ""} ${l.location || ""}`.toLowerCase().includes(q); };
  const goTab = (t) => { setTab(t); if (t === "hire" && !hireLoaded) { loadHire(); setHireLoaded(true); } };

  const askAi = () => navigate("/tis?q=" + encodeURIComponent(tab === "hire" ? "How do I write a good job listing and hire reliable farm workers?" : "How do I find farm or agri-sector work near me and apply well?"));
  const onTabKey = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); goTab(tab === "find" ? "hire" : "find"); } };

  async function saveProfile() {
    try {
      await send("PUT", "/api/v1/worker-profile", {
        display_name: prof.display_name || null, skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
        experience_note: prof.experience_note || null, location: prof.location || null,
        base_lat: prof.base_lat === "" ? null : Number(prof.base_lat), base_lng: prof.base_lng === "" ? null : Number(prof.base_lng),
        available_from: prof.available_from || null, desired_types: prof.desired_types, phone: prof.phone || null,
        whatsapp: prof.whatsapp || null, is_active: prof.is_active !== false });
      emitToast("Profile saved"); setHasProfile(true); loadFind();
    } catch (e) { emitToast(e?.userMessage || "Could not save profile"); }
  }
  const toggleDesired = (t) => setProf((o) => ({ ...o, desired_types: o.desired_types.includes(t) ? o.desired_types.filter((x) => x !== t) : [...o.desired_types, t] }));
  const useMyGps = () => { if (!navigator.geolocation) return emitToast("No GPS on this device"); navigator.geolocation.getCurrentPosition((p) => setProf((o) => ({ ...o, base_lat: p.coords.latitude.toFixed(6), base_lng: p.coords.longitude.toFixed(6) })), () => emitToast("Couldn't get location")); };
  const withdraw = async (id) => { try { await send("PATCH", `/api/v1/job-applications/${id}/withdraw`); emitToast("Application withdrawn"); loadFind(); } catch (e) { emitToast(e?.userMessage || "Could not withdraw"); } };

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 860 }}>
          <div className="page-header">
            <div className="subtitle">Find agri-sector work near you, or post roles and hire — across the Teivaka network.</div>
            <div className="page-actions"><button className="btn btn-secondary" onClick={askAi}><Sparkles size={14} />Ask AI</button></div>
          </div>

          <div className="cycle-view-tabs" role="tablist" aria-label="Jobs views">
            <button role="tab" aria-selected={tab === "find"} tabIndex={tab === "find" ? 0 : -1} className={`task-tab ${tab === "find" ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => goTab("find")} onKeyDown={onTabKey}>Find work</button>
            <button role="tab" aria-selected={tab === "hire"} tabIndex={tab === "hire" ? 0 : -1} className={`task-tab ${tab === "hire" ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }} onClick={() => goTab("hire")} onKeyDown={onTabKey}>Hire</button>
          </div>

          {tab === "find" && (
            <>
              {/* seeker profile (collapsible) */}
              <div className="card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
                <button onClick={() => setShowProfile((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", font: "inherit" }}>
                  <span style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>Your work profile{hasProfile ? "" : " — add one to get distance-matched jobs"}</span>
                  <ChevronDown size={16} style={{ transform: showProfile ? "rotate(180deg)" : "none", transition: "transform .15s", color: C.muted }} />
                </button>
                {showProfile && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><span style={lbl}>Name</span><input value={prof.display_name || ""} onChange={(e) => setProf({ ...prof, display_name: e.target.value })} /></div>
                      <div><span style={lbl}>Location</span><input value={prof.location || ""} onChange={(e) => setProf({ ...prof, location: e.target.value })} /></div>
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}><span style={lbl}>Skills (comma-separated)</span><input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="e.g. planting, spraying, driving" /></div>
                    <span style={{ ...lbl, marginTop: 10 }}>Work you want</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 8px" }}>
                      {EMP.map(([k, l]) => <button key={k} onClick={() => toggleDesired(k)} style={{ ...pill(prof.desired_types.includes(k) ? "#eef7ee" : "var(--cream)", prof.desired_types.includes(k) ? C.greenDk : C.muted), border: `1px solid ${prof.desired_types.includes(k) ? C.green : C.line}`, cursor: "pointer", padding: "5px 11px" }}>{l}</button>)}
                    </div>
                    <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><span style={lbl}>Phone</span><input value={prof.phone || ""} onChange={(e) => setProf({ ...prof, phone: e.target.value })} /></div>
                      <div><span style={lbl}>Available from</span><input type="date" value={prof.available_from || ""} onChange={(e) => setProf({ ...prof, available_from: e.target.value })} /></div>
                    </div>
                    <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginTop: 8, alignItems: "end" }}>
                      <div><span style={lbl}>Lat (optional)</span><input value={prof.base_lat} onChange={(e) => setProf({ ...prof, base_lat: e.target.value })} /></div>
                      <div><span style={lbl}>Lng (optional)</span><input value={prof.base_lng} onChange={(e) => setProf({ ...prof, base_lng: e.target.value })} /></div>
                      <button className="btn btn-secondary btn-sm" onClick={useMyGps} style={{ marginBottom: 2 }}><MapPin size={12} style={{ verticalAlign: "-2px" }} /> Use my GPS</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><button className="btn btn-primary btn-sm" onClick={saveProfile}>Save profile</button></div>
                  </div>
                )}
              </div>

              {profileWeak && (
                <div className="card" style={{ padding: "10px 14px", marginBottom: 10, background: "#FBF4E6", border: `1px solid ${C.amber}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: C.soil }}>Add your skills so employers can assess you — it's what they see when you apply.</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowProfile(true)}>Complete profile</button>
                </div>
              )}
              <div className="gallery-filter-row" style={{ marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button className={`filter-pill ${empFilter === "" ? "active" : ""}`} onClick={() => setEmpFilter("")}>All</button>
                {EMP.map(([k, l]) => <button key={k} className={`filter-pill ${empFilter === k ? "active" : ""}`} onClick={() => setEmpFilter(k)}>{l}</button>)}
                <span style={{ flex: 1 }} />
                <input type="search" value={regionQ} onChange={(e) => setRegionQ(e.target.value)} placeholder="Region / town…" aria-label="Filter by region" style={{ padding: "6px 10px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 12.5, background: "var(--paper)", minWidth: 150 }} />
              </div>

              {available === undefined ? <div className="card" style={{ padding: 20, color: C.muted }}>Loading…</div>
                : errFind && available.length === 0 ? <ErrorCard msg="Couldn't load jobs." onRetry={loadFind} />
                : available.filter(regionMatch).length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: C.muted }}>No open jobs{empFilter || regionQ.trim() ? " match" : " right now"}.</div>
                : available.filter(regionMatch).map((l) => (
                  <ListingCard key={l.listing_id} l={l}>
                    {myId && String(l.poster_user_id) === String(myId) ? <span style={{ fontSize: 11.5, color: C.muted }}>Your listing</span>
                      : l.already_applied ? <span style={{ fontSize: 11.5, color: C.greenDk, fontWeight: 700 }}><Check size={12} style={{ verticalAlign: "-2px" }} /> Applied</span>
                      : <button className="btn btn-primary btn-sm" onClick={() => setApplyFor(l)}>Apply</button>}
                  </ListingCard>
                ))}

              {(myApps || []).length > 0 && (
                <>
                  <strong style={{ color: C.soil, fontSize: 14, display: "block", margin: "18px 0 8px" }}>My applications</strong>
                  {myApps.map((a) => (
                    <div key={a.application_id} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 6 }}>
                      <div><div style={{ fontWeight: 600, color: C.soil }}>{a.role_title}</div><div style={{ fontSize: 11.5, color: C.muted }}>{a.poster_org_name || ""}{a.location ? ` · ${a.location}` : ""} · {payText(a)}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={pill(a.status === "ACCEPTED" ? "#eef7ee" : a.status === "DECLINED" ? "#f3f3f3" : "var(--cream)", a.status === "ACCEPTED" ? C.greenDk : C.muted)}>{APP_STATUS[a.status] || a.status}</span>
                        {a.status === "ACCEPTED" && <span style={{ fontSize: 11.5, color: C.greenDk }}>Hired — confirm your start with {a.poster_org_name || "the employer"}</span>}
                        {(a.status === "APPLIED" || a.status === "SHORTLISTED") && <button className="btn btn-secondary btn-sm" onClick={() => withdraw(a.application_id)}>Withdraw</button>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {tab === "hire" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button className="btn btn-primary" onClick={() => setPostOpen(true)}><Plus size={14} />Post a job</button></div>
              {mine === undefined ? <div className="card" style={{ padding: 20, color: C.muted }}>Loading…</div>
                : errHire && mine.length === 0 ? <ErrorCard msg="Couldn't load your listings." onRetry={loadHire} />
                : mine.length === 0 ? <div className="card" style={{ padding: 28, textAlign: "center" }}><div style={{ fontWeight: 700, color: C.soil }}>No listings yet</div><div style={{ fontSize: 12.5, color: C.muted, margin: "6px auto 14px", maxWidth: 420, lineHeight: 1.5 }}>Post a role and members across the Teivaka network can apply. Hire someone and you can add them straight to your Labour page.</div><button className="btn btn-primary" onClick={() => setPostOpen(true)}><Plus size={14} />Post a job</button></div>
                : mine.map((l) => (
                  <ListingCard key={l.listing_id} l={l}>
                    <button className="btn btn-primary btn-sm" onClick={() => setApplicantsFor(l)}><Users size={13} style={{ verticalAlign: "-2px" }} /> Applicants ({l.applicant_count || 0})</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPostEdit(l)}>Edit</button>
                    {l.status === "OPEN" ? <button className="btn btn-secondary btn-sm" onClick={async () => { try { await send("PATCH", `/api/v1/job-listings/${l.listing_id}/status?status=CLOSED`); emitToast("Listing closed"); loadHire(); } catch (e) { emitToast(e?.userMessage || "Failed"); } }}>Close</button>
                      : <button className="btn btn-secondary btn-sm" onClick={async () => { try { await send("PATCH", `/api/v1/job-listings/${l.listing_id}/status?status=OPEN`); emitToast("Listing reopened"); loadHire(); } catch (e) { emitToast(e?.userMessage || "Failed"); } }}>Reopen</button>}
                  </ListingCard>
                ))}
            </>
          )}
        </div>
      </main>

      {applyFor && <ApplyModal listing={applyFor} weak={profileWeak} onClose={() => setApplyFor(null)} onSaved={() => { loadFind(); setApplyFor(null); }} />}
      {(postOpen || postEdit) && <PostListingModal edit={postEdit} onClose={() => { setPostOpen(false); setPostEdit(null); }} onSaved={() => { loadHire(); setPostOpen(false); setPostEdit(null); }} />}
      {applicantsFor && <ApplicantsModal listing={applicantsFor} onClose={() => setApplicantsFor(null)} onHire={(app) => { setHireFor({ listing: applicantsFor, application: app }); }} onChanged={loadHire} />}
      {hireFor && <HireModal listing={hireFor.listing} application={hireFor.application} onClose={() => setHireFor(null)} onSaved={() => { setHireFor(null); setApplicantsFor(null); loadHire(); }} />}
    </TfpShell>
  );
}

function ApplyModal({ listing, onClose, onSaved, weak }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { await send("POST", `/api/v1/job-listings/${listing.listing_id}/apply`, { cover_note: note.trim() || null }); emitToast("Application sent"); onSaved?.(); }
    catch (e) { emitToast(e?.userMessage || "Could not apply"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={`Apply — ${listing.role_title}`} onClose={onClose} maxWidth={460} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send application"}</button></>}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{listing.poster_org_name || "Employer"}{listing.location ? ` · ${listing.location}` : ""} · {payText(listing)}. Your work profile is shared with the employer; your contact is revealed only if they accept you.</div>
      {weak && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.amber, marginBottom: 10 }}><AlertTriangle size={12} />Your work profile has no skills yet — add some first so the employer can assess you.</div>}
      <div className="form-row"><label>Message to the employer (optional)</label><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you're a good fit, availability…" /></div>
    </Modal>
  );
}

function PostListingModal({ onClose, onSaved, edit }) {
  const e0 = edit || {};
  const [f, setF] = useState({
    role_title: e0.role_title || "", sector: e0.sector || "FARM_LABOUR", employment_type: e0.employment_type || "CASUAL",
    positions: String(e0.positions ?? "1"), location: e0.location || "", base_lat: e0.base_lat ?? "", base_lng: e0.base_lng ?? "",
    pay_rate_fjd: e0.pay_rate_fjd ?? "", pay_period: e0.pay_period || "DAY", pay_negotiable: !!e0.pay_negotiable,
    skills_required: (e0.skills_required || []).join(", "), experience_required: e0.experience_required || "",
    start_date: e0.start_date ? String(e0.start_date).slice(0, 10) : "", duration_note: e0.duration_note || "",
    description: e0.description || "", apply_deadline: e0.apply_deadline ? String(e0.apply_deadline).slice(0, 10) : "", poster_org_name: e0.poster_org_name || "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    if (lock.current) return;
    if (!f.role_title.trim()) { emitToast("Give the role a title"); return; }
    lock.current = true; setBusy(true);
    const body = {
      role_title: f.role_title.trim(), sector: f.sector, employment_type: f.employment_type, positions: Number(f.positions) || 1,
      location: f.location.trim() || null, base_lat: f.base_lat === "" ? null : Number(f.base_lat), base_lng: f.base_lng === "" ? null : Number(f.base_lng),
      pay_rate_fjd: f.pay_negotiable || !f.pay_rate_fjd ? null : Number(f.pay_rate_fjd), pay_period: f.pay_period, pay_negotiable: !!f.pay_negotiable,
      skills_required: f.skills_required.split(",").map((s) => s.trim()).filter(Boolean), experience_required: f.experience_required.trim() || null,
      start_date: f.start_date || null, duration_note: f.duration_note.trim() || null, description: f.description.trim() || null,
      apply_deadline: f.apply_deadline || null, poster_org_name: f.poster_org_name.trim() || null };
    try {
      if (edit) await send("PATCH", `/api/v1/job-listings/${encodeURIComponent(edit.listing_id)}`, body);
      else await send("POST", "/api/v1/job-listings", body);
      emitToast(edit ? "Listing updated" : "Job posted"); onSaved?.();
    } catch (e) { emitToast(e?.userMessage || (edit ? "Could not save" : "Could not post the job")); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={edit ? "Edit job" : "Post a job"} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : edit ? "Save" : "Post job"}</button></>}>
      {edit && edit.applicant_count > 0 && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.amber, marginBottom: 10 }}><AlertTriangle size={12} />{edit.applicant_count} {edit.applicant_count === 1 ? "person has" : "people have"} applied to the current terms — they won't be notified of changes.</div>}
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div><label>Role title</label><input value={f.role_title} onChange={set("role_title")} placeholder="e.g. Casual harvest hand" /></div>
        <div><label>Positions</label><input type="number" min="1" value={f.positions} onChange={set("positions")} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Sector</label><select value={f.sector} onChange={set("sector")}>{SECTOR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label>Employment type</label><select value={f.employment_type} onChange={set("employment_type")}>{EMP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginTop: 10 }}>
        <div><label>Pay (FJD)</label><input type="number" min="0" step="0.50" value={f.pay_rate_fjd} onChange={set("pay_rate_fjd")} disabled={f.pay_negotiable} /></div>
        <div><label>Period</label><select value={f.pay_period} onChange={set("pay_period")} disabled={f.pay_negotiable}>{PERIOD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><input type="checkbox" checked={f.pay_negotiable} onChange={(e) => setF((s) => ({ ...s, pay_negotiable: e.target.checked }))} />Negotiable</label></div>
      </div>
      {!f.pay_negotiable && <MinWageNote rate={f.pay_rate_fjd} period={f.pay_period} />}
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><label>Location</label><input value={f.location} onChange={set("location")} placeholder="village / town / region" /></div>
        <div><label>Employer / org (optional)</label><input value={f.poster_org_name} onChange={set("poster_org_name")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Skills (comma-separated, optional)</label><input value={f.skills_required} onChange={set("skills_required")} placeholder="e.g. spraying, driving" /></div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 10 }}>
        <div><label>Start date</label><input type="date" value={f.start_date} onChange={set("start_date")} /></div>
        <div><label>Duration</label><input value={f.duration_note} onChange={set("duration_note")} placeholder="e.g. 3 months" /></div>
        <div><label>Apply by</label><input type="date" value={f.apply_deadline} onChange={set("apply_deadline")} /></div>
      </div>
      <div className="form-row" style={{ marginTop: 10 }}><label>Description</label><textarea rows={3} value={f.description} onChange={set("description")} placeholder="The work, requirements, conditions…" /></div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>This listing is shared with members across the Teivaka network so they can apply.</div>
    </Modal>
  );
}

function ApplicantsModal({ listing, onClose, onHire, onChanged }) {
  const [rows, setRows] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const load = () => getJSON(`/api/v1/job-listings/${listing.listing_id}/applications`).then((r) => setRows(r?.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function decide(id, status) {
    if (busy) return; setBusy(true);
    try { await send("PATCH", `/api/v1/job-applications/${id}/decide?status=${status}`); emitToast(status === "SHORTLISTED" ? "Shortlisted" : "Declined"); load(); onChanged?.(); }
    catch (e) { emitToast(e?.userMessage || "Failed"); } finally { setBusy(false); }
  }
  async function shortlistAll() {
    if (busy) return; setBusy(true);
    let ok = 0, fail = 0;
    for (const a of (rows || []).filter((x) => x.status === "APPLIED")) {
      try { await send("PATCH", `/api/v1/job-applications/${a.application_id}/decide?status=SHORTLISTED`); ok++; }
      catch { fail++; } // JBS1: continue on individual failure, always refresh
    }
    emitToast(fail ? `Shortlisted ${ok}, ${fail} couldn't be updated` : `Shortlisted ${ok} applicant${ok === 1 ? "" : "s"}`);
    load(); onChanged?.(); setBusy(false);
  }
  const RANK = { SHORTLISTED: 0, APPLIED: 1, ACCEPTED: 2, DECLINED: 3 };
  const sorted = (rows || []).slice().sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const shown = sorted.slice(0, 100); // JBS5: cap the drawer; note if more
  const appliedCount = (rows || []).filter((x) => x.status === "APPLIED").length;
  return (
    <Modal title={`Applicants — ${listing.role_title}`} onClose={onClose} maxWidth={620} foot={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      {appliedCount > 1 && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><button className="btn btn-secondary btn-sm" onClick={shortlistAll} disabled={busy}>Shortlist all new ({appliedCount})</button></div>}
      {rows === undefined ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 12.5 }}>No applicants yet. They'll appear here as members apply.</div>
        : shown.map((a) => (
          <div key={a.application_id} className="card" style={{ padding: "10px 13px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: C.soil }}>{a.display_name || "Applicant"}</strong>
              <span style={pill(a.status === "ACCEPTED" ? "#eef7ee" : "var(--cream)", a.status === "ACCEPTED" ? C.greenDk : C.muted)}>{APP_STATUS[a.status] || a.status}</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{a.location || ""}{(a.skills || []).length ? ` · ${a.skills.join(", ")}` : ""}{a.available_from ? ` · from ${String(a.available_from).slice(0, 10)}` : ""}</div>
            {a.experience_note && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{a.experience_note}</div>}
            {a.cover_note && <div style={{ fontSize: 12, color: C.soil, marginTop: 4, fontStyle: "italic" }}>“{a.cover_note}”</div>}
            {a.status === "ACCEPTED" && (a.phone || a.whatsapp) && <div style={{ fontSize: 12, color: C.greenDk, marginTop: 4 }}>Contact: {a.phone || ""}{a.whatsapp ? ` · WhatsApp ${a.whatsapp}` : ""}</div>}
            {a.status !== "ACCEPTED" && a.status !== "DECLINED" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => onHire(a)}><Check size={13} style={{ verticalAlign: "-2px" }} /> Hire</button>
                {a.status !== "SHORTLISTED" && <button className="btn btn-secondary btn-sm" onClick={() => decide(a.application_id, "SHORTLISTED")} disabled={busy}>Shortlist</button>}
                <button className="btn btn-secondary btn-sm" style={{ color: C.red }} onClick={() => decide(a.application_id, "DECLINED")} disabled={busy}>Decline</button>
              </div>
            )}
          </div>
        ))}
      {rows && rows.length > 100 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Showing the first 100 applicants.</div>}
    </Modal>
  );
}

function HireModal({ listing, application, onClose, onSaved }) {
  const [farms, setFarms] = useState([]);
  const [addToLabour, setAddToLabour] = useState(true);
  const [farmId, setFarmId] = useState("");
  const [rate, setRate] = useState(listing.pay_period === "DAY" && listing.pay_rate_fjd ? String(listing.pay_rate_fjd) : "");
  const [wtype, setWtype] = useState("CASUAL");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { getJSON("/api/v1/farms").then((r) => { const fs = r?.data || r?.farms || []; setFarms(fs); if (fs[0]) setFarmId(fs[0].farm_id); }).catch(() => setFarms([])); }, []);
  async function submit() {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const r = await send("POST", `/api/v1/job-listings/${listing.listing_id}/hire`, {
        application_id: application.application_id, add_to_labour: addToLabour && !!farmId,
        farm_id: addToLabour ? farmId || null : null, daily_rate_fjd: addToLabour && rate ? Number(rate) : null, worker_type: wtype });
      if (r?.data?.worker_error) emitToast(`Hired — but couldn't add to Labour: ${r.data.worker_error}`);
      else if (r?.data?.worker) emitToast("Hired and added to your Labour workers");
      else emitToast("Applicant hired");
      onSaved?.();
    } catch (e) { emitToast(e?.userMessage || "Could not hire"); lock.current = false; } finally { setBusy(false); }
  }
  return (
    <Modal title={`Hire — ${application.display_name || "applicant"}`} onClose={onClose} maxWidth={480} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Hiring…" : "Confirm hire"}</button></>}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Accepts this applicant for <strong>{listing.role_title}</strong>. Their contact is then shared with you.{farms.length > 0 ? " Optionally add them straight to your Labour page as a worker." : ""}</div>
      {farms.length === 0
        ? <div style={{ fontSize: 11.5, color: C.muted }}>Add-to-Labour becomes available once you have a farm set up.</div>
        : <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.soil }}><input type="checkbox" checked={addToLabour} onChange={(e) => setAddToLabour(e.target.checked)} />Add to my Labour workers (attendance + wages)</label>}
      {farms.length > 0 && addToLabour && (
        <>
          <div className="form-row" style={{ marginTop: 10 }}><label>Farm</label><select value={farmId} onChange={(e) => setFarmId(e.target.value)}>{farms.length === 0 ? <option value="">No farms found</option> : farms.map((f) => <option key={f.farm_id} value={f.farm_id}>{f.farm_name || f.name || f.farm_id}</option>)}</select></div>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label>Daily rate (FJD)</label><input type="number" min="0" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div><label>Worker type</label><select value={wtype} onChange={(e) => setWtype(e.target.value)}>{WORKER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <MinWageNote rate={rate} period="DAY" />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Adding to Labour needs manager rights on that farm. If you don't have them, the hire still goes through — just add the worker later.</div>
        </>
      )}
    </Modal>
  );
}

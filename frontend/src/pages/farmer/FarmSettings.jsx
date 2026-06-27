/**
 * FarmSettings.jsx — /farm/settings — account + farm settings (prototype coreSettingsView).
 *
 * Redesign (audit-approved 2026-06-27):
 *  SET1  routes through api.js getJSON/send (token refresh + humanised errors); per-card loading /
 *        error states; Preference toggles are DISABLED until prefs load — no false-default writes.
 *  SET2  account-level cards (Account · Preferences · Team · Plan · Security · Governance · Data)
 *        render WITHOUT a farm; only farm-level cards (Farm setup · Land · Crops · Marketplace)
 *        need a selected farm. The page is split into "Your account" + "This farm".
 *  SET3  owner-only actions are hidden from WORKER/VIEWER; a 403 still surfaces a humanised error.
 *        (Backend: invites are now role-gated — only owner/manager, and only owners mint a Manager.)
 *  privacy  location-sharing carries a prominent consent callout + easy off (it is opt-OUT at the
 *        data layer, mig 164 DEFAULT true — the default-flip + backfill is a FILED Operator decision).
 *  +     real "Reset password" (POST /auth/forgot-password); revoke a pending invite; plan limits;
 *        a11y Modal (role=dialog + Esc + focus); formatMoney; sectioned to cut the 9-card wall.
 * FILED (backend/decision): share_location default→false + backfill (Operator consent call);
 *  member remove / role-change (no endpoint); PIN + device/session management (no endpoint);
 *  honest i18n (language pref doesn't translate the app yet, B42); composite /settings read.
 */
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Home, Users, Settings as Cog, Link as LinkIcon, Shield, Plus, Check, X, Copy, Layers, Sprout, Store, Download, Pencil, BadgeCheck, AlertTriangle, RefreshCw, Trash2, Lock } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";
import { getCurrentUser } from "../../utils/auth";
import { formatMoney } from "../../utils/money";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const errMsg = (e) => e?.userMessage || e?.message || "Something went wrong";
// Owner-only actions hidden from known sub-roles; server is the authority (humanised 403 if it bites).
function canManage() { const r = getCurrentUser()?.role; return !r || !["WORKER", "VIEWER"].includes(r); }
function useEsc(onClose) { useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]); }

// ── shared a11y modal ──────────────────────────────────────────────────────
function Modal({ title, onClose, children, foot, maxWidth = 440 }) {
  const ref = useRef(null);
  useEsc(onClose);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        {foot && <div className="overlay-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ── prototype atoms ─────────────────────────────────────────────────────────
function SectionHeader({ children }) { return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--muted)", margin: "6px 4px 8px" }}>{children}</div>; }
function SettingsCard({ icon: Icon, title, desc, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ color: "var(--green)" }}><Icon size={18} /></span>
        <div><div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{desc}</div></div>
      </div>
      <div style={{ padding: "4px 8px" }}>{children}</div>
    </div>
  );
}
function SRow({ label, sub, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 8px", borderBottom: "1px solid var(--cream-2)" }}>
      <div><div style={{ fontSize: 13.5, color: "var(--soil)", fontWeight: 500 }}>{label}</div>{sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{sub}</div>}</div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}
function Toggle({ on, onClick, busy, disabled }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} aria-pressed={!!on} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: disabled ? "not-allowed" : "pointer", background: on ? "var(--green)" : "var(--line)", position: "relative", transition: ".15s", opacity: (busy || disabled) ? 0.5 : 1 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "var(--paper)", transition: ".15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}
function Pills({ opts, cur, onPick, busy, disabled }) {
  return <div style={{ display: "flex", gap: 6 }}>{opts.map(([v, l]) => <button key={v} disabled={busy || disabled} className={`btn btn-sm ${cur === v ? "btn-primary" : "btn-secondary"}`} style={disabled ? { opacity: 0.5 } : null} onClick={() => onPick(v)}>{l}</button>)}</div>;
}
function CardError({ onRetry, label = "Couldn't load this" }) {
  return <div style={{ padding: "11px 8px", display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: 13 }}><AlertTriangle size={14} style={{ color: "var(--amber)" }} />{label} — <button style={{ background: "none", border: "none", color: "var(--green-dk)", cursor: "pointer", padding: 0 }} onClick={onRetry}>retry</button></div>;
}
function CardLoading() { return <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>Loading…</div>; }

// ── modals ───────────────────────────────────────────────────────────────
function EditFarmModal({ farm, onClose, onSaved }) {
  const [name, setName] = useState(farm?.farm_name || "");
  const [region, setRegion] = useState(farm?.location_name || "");
  const [area, setArea] = useState(farm?.land_area_ha ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    try { await send("PATCH", `/api/v1/farms/${encodeURIComponent(farm.farm_id)}`, { farm_name: name.trim() || null, location_name: region.trim() || null, land_area_ha: area === "" ? null : Number(area) }); emitToast("Saved · Farm profile updated"); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Edit farm profile" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <div className="form-row"><label>Farm name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-row"><label>Area / region</label><input value={region} onChange={(e) => setRegion(e.target.value)} /></div>
      <div className="form-row"><label>Land area (ha)</label><input type="number" step="0.01" min="0" value={area} onChange={(e) => setArea(e.target.value)} /></div>
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </Modal>
  );
}
function InviteModal({ farmId, canManager, onClose, onSaved }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [role, setRole] = useState("WORKER");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [sent, setSent] = useState(null);
  async function submit() {
    setBusy(true); setErr("");
    try { const b = await send("POST", "/api/v1/team/invites", { invitee_name: name.trim(), invitee_phone: phone.trim(), team_role: role, farm_scope: farmId || "ALL" }); setSent(b?.data || {}); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const roles = canManager ? [["WORKER", "Worker"], ["MANAGER", "Manager"]] : [["WORKER", "Worker"]];
  return (
    <Modal title="Invite a team member" onClose={onClose} foot={!sent ? <><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send invite"}</button></> : <button className="btn btn-primary" onClick={onClose}>Done</button>}>
      {!sent ? (
        <>
          <div className="form-row"><label>Name</label><input placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-row"><label>WhatsApp number</label><input placeholder="Their number" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="form-row"><label>Role</label><div style={{ display: "flex", gap: 6 }}>{roles.map(([v, l]) => <button key={v} className={`btn btn-sm ${role === v ? "btn-primary" : "btn-secondary"}`} onClick={() => setRole(v)}>{l}</button>)}</div>{!canManager && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Only the farm owner can invite a Manager.</div>}</div>
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}><Check size={14} style={{ color: "var(--green-dk)" }} /> Invite created for <strong>{name}</strong>. Send them the link — it expires in {sent.expires_days || 7} days.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {sent.whatsapp_link && <a className="btn btn-primary" href={sent.whatsapp_link} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
            {sent.accept_url && <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(sent.accept_url); emitToast("Invite link copied"); }}><Copy size={13} />Copy link</button>}
          </div>
        </>
      )}
    </Modal>
  );
}
function PlanModal({ current, onClose }) {
  const tiersQ = useQuery({ queryKey: ["sub-tiers"], queryFn: () => getJSON("/api/v1/subscriptions/tiers") });
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const tiers = tiersQ.data?.data || {};
  const curTier = current?.subscription_tier || "FREE";
  async function request(t) {
    setBusy(t); setErr("");
    try { await send("POST", "/api/v1/subscriptions/upgrade", { target_tier: t, billing_period: "MONTHLY", payment_method: "BANK_TRANSFER" }); emitToast(`Upgrade to ${t} requested · the team confirms it with you before anything changes`); onClose(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  }
  return (
    <Modal title="Manage plan" onClose={onClose} maxWidth={480} foot={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Current plan: <strong style={{ color: "var(--soil)" }}>{curTier}</strong>. Requesting a change creates a real request — nothing is charged in-app; the team confirms with you first.</div>
      {tiersQ.isError ? <CardError onRetry={() => tiersQ.refetch()} label="Couldn't load plans" /> : Object.entries(tiers).map(([key, t]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--cream-2)" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--soil)" }}>{t.name || key}{key === curTier && <span style={{ fontSize: 10.5, color: "var(--green-dk)", marginLeft: 6 }}>· current</span>}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.price_fjd_monthly != null ? formatMoney(t.price_fjd_monthly, { decimals: 0 }) + "/mo" : "Free"}{t.tis_daily_limit != null ? ` · ${t.tis_daily_limit} TIS/day` : ""}{t.farms_limit != null ? ` · ${t.farms_limit} farm${t.farms_limit === 1 ? "" : "s"}` : ""}</div>
          </div>
          {key !== curTier && <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => request(key)}>{busy === key ? "Requesting…" : "Request"}</button>}
        </div>
      ))}
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </Modal>
  );
}
function RenameModal({ title, label, current, areaLabel, area, endpoint, nameKey, areaKey, onClose, onSaved }) {
  const [name, setName] = useState(current || ""); const [areaVal, setAreaVal] = useState(area ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save() {
    if (!name.trim()) { setErr("A name is required."); return; }
    setBusy(true); setErr("");
    try { const body = { [nameKey]: name.trim() }; if (areaKey && areaVal !== "") body[areaKey] = Number(areaVal); await send("PATCH", endpoint, body); emitToast("Saved · change recorded in your audit chain"); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}><Shield size={11} /> The code/ID stays the same — only the name changes, everywhere it's referenced. Hash-chained.</div>
      <div className="form-row"><label>{label}</label><input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
      {areaKey && <div className="form-row"><label>{areaLabel}</label><input type="number" step="0.01" min="0" value={areaVal} onChange={(e) => setAreaVal(e.target.value)} /></div>}
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </Modal>
  );
}
function RelabelModal({ cycle, onClose, onSaved }) {
  const [label, setLabel] = useState(cycle.farmer_label || ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save() {
    if (!label.trim()) { setErr("Give it a name."); return; }
    setBusy(true); setErr("");
    try { await send("PATCH", `/api/v1/cycles/${encodeURIComponent(cycle.cycle_id)}/relabel`, { farmer_label: label.trim() }); emitToast("Saved · cycle label updated · hash-chained"); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Rename this crop run" onClose={onClose} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}><Shield size={11} /> Your own friendly name for this cycle. The crop type + cycle ID stay fixed.</div>
      <div className="form-row"><label>Your name for it</label><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={64} placeholder={cycle.production_name || "Crop run"} /></div>
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </Modal>
  );
}
function ListingModal({ farmId, onClose, onSaved }) {
  const [title, setTitle] = useState(""); const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [grade, setGrade] = useState(""); const [neg, setNeg] = useState(true); const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save() {
    if (!title.trim()) { setErr("Give your listing a title."); return; }
    setBusy(true); setErr("");
    try { await send("POST", "/api/v1/community/listings", { farm_id: farmId, category: "PRODUCE", listing_title: title.trim(), listing_description: desc.trim() || null, quantity_available_kg: qty === "" ? null : Number(qty), price_per_kg_fjd: price === "" ? null : Number(price), price_basis: "kg", negotiable: neg, grade: grade.trim() || null }); emitToast("Listed · your produce is now on the marketplace"); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="List produce for sale" onClose={onClose} maxWidth={460} foot={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Listing…" : "List it"}</button></>}>
      <div className="form-row"><label>What are you selling?</label><input placeholder="e.g. Fresh eggplant, Grade A" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label>Quantity (kg)</label><input type="number" min="0" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><label>Price (FJD/kg)</label><input type="number" min="0" step="0.1" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
      </div>
      <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
        <div><label>Grade (optional)</label><input value={grade} onChange={(e) => setGrade(e.target.value)} /></div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--soil)" }}><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} /> Price negotiable</label>
      </div>
      <div className="form-row"><label>Notes (optional)</label><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </Modal>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
function FarmSettingsInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const manage = canManage();
  const [editFarm, setEditFarm] = useState(false);
  const [invite, setInvite] = useState(false);
  const [plan, setPlan] = useState(false);
  const [busyPref, setBusyPref] = useState(false);
  const [renameWhat, setRenameWhat] = useState(null);
  const [relabel, setRelabel] = useState(null);
  const [listFor, setListFor] = useState(false);

  // account-level (no farm required)
  const teamQ = useQuery({ queryKey: ["set-team"], queryFn: () => getJSON("/api/v1/me/team"), retry: 1 });
  const invitesQ = useQuery({ queryKey: ["set-invites"], queryFn: () => getJSON("/api/v1/team/invites"), retry: 1 });
  const prefsQ = useQuery({ queryKey: ["set-prefs"], queryFn: () => getJSON("/api/v1/me/prefs"), retry: 1 });
  const subQ = useQuery({ queryKey: ["set-sub"], queryFn: () => getJSON("/api/v1/subscriptions/current"), retry: 1 });
  const recordsQ = useQuery({ queryKey: ["set-records"], queryFn: () => getJSON("/api/v1/me/records"), retry: 1 });
  const chainQ = useQuery({ queryKey: ["set-chain"], queryFn: () => getJSON("/api/v1/me/chain-status"), retry: 1 });
  const verifQ = useQuery({ queryKey: ["set-verif"], queryFn: () => getJSON("/api/v1/me/verification"), retry: 1 });
  // farm-level (lazy on farm)
  const farmQ = useQuery({ queryKey: ["set-farm", farmId], queryFn: () => getJSON(`/api/v1/farms/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 1 });
  const cyclesQ = useQuery({ queryKey: ["set-cycles", farmId], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`), enabled: !!farmId, retry: 1 });
  const flocksQ = useQuery({ queryKey: ["set-flocks", farmId], queryFn: () => getJSON(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`), enabled: !!farmId, retry: 1 });
  const wxQ = useQuery({ queryKey: ["set-wx", farmId], queryFn: () => getJSON(`/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`).catch(() => ({ data: [] })), enabled: !!farmId });
  const zonesQ = useQuery({ queryKey: ["set-zones", farmId], queryFn: () => getJSON(`/api/v1/zones?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 1 });
  const puQ = useQuery({ queryKey: ["set-pu", farmId], queryFn: () => getJSON(`/api/v1/production-units?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 1 });
  // Marketplace listings live in the farm section — don't fetch them until a farm is selected (speed).
  const listingsQ = useQuery({ queryKey: ["set-listings", farmId], queryFn: () => getJSON("/api/v1/community/listings?mine=true"), enabled: !!farmId, retry: 1 });

  const farm = farmQ.data?.data || {};
  const team = teamQ.data?.data ?? [];
  const pendingInvites = (invitesQ.data?.data ?? []).filter((i) => (i.status || "PENDING").toUpperCase() === "PENDING");
  const prefs = prefsQ.data?.data ?? {};
  const prefsReady = prefsQ.isSuccess && !prefsQ.isError;
  const cyclesRaw = cyclesQ.data?.data; const cyclesList = Array.isArray(cyclesRaw) ? cyclesRaw : cyclesRaw?.cycles ?? [];
  const liveCrops = new Set(cyclesList.filter((c) => ["ACTIVE", "HARVESTING"].includes(c.cycle_status || c.status)).map((c) => c.production_id || c.crop));
  const flocks = flocksQ.data?.data ?? [];
  const entCount = liveCrops.size + (Array.isArray(flocks) ? flocks.length : 0);
  const sub = subQ.data?.data || {};
  const records = recordsQ.data?.data ?? [];
  const chain = chainQ.data?.data || {};
  const weatherLive = (wxQ.data?.data ?? []).length > 0;
  const waConnected = !!prefs.whatsapp_number;
  const zones = zonesQ.data?.data ?? [];
  const blocks = puQ.data?.data ?? [];
  const listings = (listingsQ.data?.data ?? []).filter((l) => String(l.listing_status || "").toUpperCase() === "ACTIVE");
  const verif = verifQ.data?.data ?? {};
  const shareOn = prefs.share_location !== false;

  async function patchMe(body) {
    setBusyPref(true);
    try { await send("PATCH", "/api/v1/me", body); emitToast("Saved · Preference updated"); qc.invalidateQueries({ queryKey: ["set-prefs"] }); }
    catch (e) { emitToast(errMsg(e)); } finally { setBusyPref(false); }
  }
  const roleChip = (m) => { const r = m.role === "FOUNDER" ? "OWNER" : (m.team_role || m.role || "WORKER").toUpperCase(); return <span style={{ fontSize: 11, fontWeight: 700, color: r === "OWNER" ? "var(--green-dk)" : "var(--muted)", letterSpacing: ".5px" }}>{r}</span>; };
  async function revokeInvite(id) {
    try { await send("POST", `/api/v1/team/invites/${encodeURIComponent(id)}/cancel`, {}); emitToast("Invite revoked"); qc.invalidateQueries({ queryKey: ["set-invites"] }); }
    catch (e) { emitToast(errMsg(e)); }
  }
  async function closeListing(id) {
    try { await send("PATCH", `/api/v1/community/listings/${encodeURIComponent(id)}/close`, {}); emitToast("Listing withdrawn"); qc.invalidateQueries({ queryKey: ["set-listings"] }); }
    catch (e) { emitToast(errMsg(e)); }
  }
  async function exportData() {
    try { const b = await getJSON("/api/v1/me/export"); const blob = new Blob([JSON.stringify(b?.data ?? b, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `tfos-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); emitToast("Your data exported"); }
    catch (e) { emitToast(`Export failed: ${errMsg(e)}`); }
  }
  async function resetPassword() {
    const email = getCurrentUser()?.email;
    if (!email) { navigate("/forgot-password"); return; }
    try { await send("POST", "/api/v1/auth/forgot-password", { email }); emitToast(`Password reset link sent to ${email}`); }
    catch { emitToast("Couldn't start a reset — try the Forgot password page."); }
  }
  const cycleName = (c) => c.farmer_label || c.production_name || c.crop || "Crop run";

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Settings</h1><div className="subtitle">Your account, your farm, and how TFOS works for you</div></div>
            <div className="page-actions">
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate(`/tis?q=${encodeURIComponent("Explain my TFOS settings — team roles, what each plan includes, and whether sharing my farm location is safe.")}`)}><Cog size={13} />Ask TIS</button>
              <FarmSelector />
            </div>
          </div>

          <SectionHeader>Your account</SectionHeader>

          {/* Preferences — toggles disabled until prefs load (no false-default write) */}
          <SettingsCard icon={Cog} title="Preferences" desc="Units, language, notifications and privacy">
            {prefsQ.isLoading ? <CardLoading /> : prefsQ.isError ? <CardError onRetry={() => prefsQ.refetch()} label="Couldn't load preferences" /> : (
              <>
                <SRow label="Weight units" right={<Pills disabled={!prefsReady} busy={busyPref} opts={[["kg", "kg"], ["lb", "lb"]]} cur={prefs.pref_weight || "kg"} onPick={(v) => patchMe({ pref_weight: v })} />} />
                <SRow label="Money" sub="Fijian dollar" right={<Pills disabled busy={busyPref} opts={[["FJD", "FJD"]]} cur={prefs.pref_currency || "FJD"} onPick={() => {}} />} />
                <SRow label="Language" sub="Translation is rolling out — your choice is saved" right={<Pills disabled={!prefsReady} busy={busyPref} opts={[["en", "English"], ["fj", "iTaukei"], ["hi", "Hindi"]]} cur={prefs.preferred_language || "en"} onPick={(v) => patchMe({ preferred_language: v })} />} />
                <SRow label="WhatsApp alerts" sub="Get alerts on WhatsApp" right={<Toggle disabled={!prefsReady} busy={busyPref} on={!!prefs.notify_whatsapp} onClick={() => patchMe({ notify_whatsapp: !prefs.notify_whatsapp })} />} />
                <SRow label="Task reminders" right={<Toggle disabled={!prefsReady} busy={busyPref} on={!!prefs.notify_tasks} onClick={() => patchMe({ notify_tasks: !prefs.notify_tasks })} />} />
                <SRow label="Weather alerts" right={<Toggle disabled={!prefsReady} busy={busyPref} on={!!prefs.notify_weather} onClick={() => patchMe({ notify_weather: !prefs.notify_weather })} />} />
                {/* Privacy: location sharing — prominent consent + easy off */}
                <div style={{ padding: "11px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div><div style={{ fontSize: 13.5, color: "var(--soil)", fontWeight: 500 }}>Show my farm on the network map</div><div style={{ fontSize: 12, color: shareOn ? "var(--amber)" : "var(--muted)", marginTop: 1 }}>{shareOn ? "ON — verified buyers, farmers and service providers can see your farm's location + distance to you." : "OFF — your location is private; you won't appear on the network map."}</div></div>
                    <Toggle disabled={!prefsReady} busy={busyPref} on={shareOn} onClick={() => patchMe({ share_location: !shareOn })} />
                  </div>
                  {shareOn && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", gap: 5, alignItems: "flex-start" }}><Shield size={11} style={{ flexShrink: 0, marginTop: 1 }} />Only verified members ever see it. Turn off any time to stay hidden.</div>}
                </div>
              </>
            )}
          </SettingsCard>

          {/* Team */}
          <SettingsCard icon={Users} title="Team" desc="Members across your account · roles control what they can do (invites can be scoped to one farm)">
            {teamQ.isLoading ? <CardLoading /> : teamQ.isError ? <CardError onRetry={() => teamQ.refetch()} label="Couldn't load your team" /> : (
              <>
                {team.map((m) => (
                  <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                    <span style={{ fontSize: 13.5, color: "var(--soil)" }}>{m.full_name || m.email}{m.is_you ? <span style={{ color: "var(--muted)", fontSize: 11.5 }}> · you</span> : null}</span>
                    {roleChip(m)}
                  </div>
                ))}
                {pendingInvites.map((i) => (
                  <div key={i.invite_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                    <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{i.invitee_name} <span style={{ fontSize: 11.5 }}>· invited, pending</span></span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", letterSpacing: ".5px" }}>{(i.team_role || "WORKER").toUpperCase()}</span>{manage && <button className="btn btn-sm btn-secondary" title="Revoke invite" onClick={() => revokeInvite(i.invite_id)}><Trash2 size={11} /></button>}</span>
                  </div>
                ))}
                <SRow label="Permissions" sub="Owner: full access · Manager: runs farms · Worker: logs events + sees tasks" right={<span style={{ fontSize: 12, color: "var(--muted)" }}>By role</span>} />
                {manage && <div style={{ padding: 8 }}><button className="btn btn-sm btn-primary" onClick={() => setInvite(true)}><Plus size={11} /> Invite member</button></div>}
              </>
            )}
          </SettingsCard>

          {/* Plan */}
          <SettingsCard icon={LinkIcon} title="Plan & connections" desc="Billing, integrations and security">
            <SRow label="Billing" sub={subQ.isError ? "Couldn't load plan" : `Current plan: ${sub.subscription_tier || "—"}${sub.subscription_status ? ` · ${sub.subscription_status}` : ""}${sub.trial_ends_at ? ` · trial ends ${String(sub.trial_ends_at).slice(0, 10)}` : ""}`}
              right={manage ? <button className="btn btn-sm btn-secondary" onClick={() => setPlan(true)}>Manage plan</button> : <span style={{ fontSize: 12, color: "var(--muted)" }}>{sub.subscription_tier || "—"}</span>} />
            <SRow label="M-PAiSA" sub="Mobile money payments" right={<button className="btn btn-sm btn-secondary" onClick={() => emitToast("M-PAiSA — merchant registration with Vodafone is in progress. Connect goes live the day it clears.")}>In progress</button>} />
            <SRow label="WhatsApp" sub={waConnected ? `Alerts and messages · ${prefs.whatsapp_number}` : "Alerts and messages"} right={waConnected ? <button className="btn btn-sm btn-secondary" style={{ color: "var(--green-dk)" }} onClick={() => navigate("/me")}><Check size={11} /> Connected</button> : <button className="btn btn-sm btn-primary" onClick={() => navigate("/me")}>Connect</button>} />
            <SRow label="Weather service" sub="Live forecasts" right={weatherLive ? <span style={{ fontSize: 12, color: "var(--green-dk)", fontWeight: 600 }}><Check size={11} /> Connected</span> : <span style={{ fontSize: 12, color: "var(--muted)" }}>Pending</span>} />
            <SRow label="Reset password" sub="We email you a secure reset link" right={<button className="btn btn-sm btn-secondary" onClick={resetPassword}>Reset</button>} />
            <SRow label="PIN & devices" sub="App PIN and signed-in devices" right={<span style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Lock size={11} />Coming soon</span>} />
          </SettingsCard>

          {/* Governance */}
          <SettingsCard icon={Shield} title="Governance" desc="Your tamper-proof record of everything logged">
            {recordsQ.isLoading ? <CardLoading /> : recordsQ.isError ? <CardError onRetry={() => recordsQ.refetch()} label="Couldn't load your records" /> : records.length === 0
              ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>Your audit log builds as you log events. Every action gets a tamper-proof record here.</div>
              : records.slice(0, 6).map((e, i) => <SRow key={i} label={e.event_type || "Event"} sub={`${String(e.occurred_at || "").slice(0, 16).replace("T", " ")} · ${e.entity_type || "record"}`} right={<span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--green-dk)" }}>{String(e.audit_hash || "").slice(-8) || "—"}</span>} />)}
            <div style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>
              {chain.events_in_chain != null ? `${chain.events_in_chain} events in your chain · each hash-linked and tamper-proof` : (chainQ.isError ? "Chain status unavailable" : "Chain status loading…")}
              {chain.integrity_ok === false && <span style={{ color: "var(--red)", fontWeight: 600 }}> · {chain.chain_break_count} integrity break{chain.chain_break_count === 1 ? "" : "s"} — contact support</span>}
              {chain.integrity_ok === true && <span style={{ color: "var(--green-dk)" }}> · integrity verified</span>}
            </div>
          </SettingsCard>

          {/* Data & verification */}
          <SettingsCard icon={BadgeCheck} title="Data & verification" desc="Your verification status and a copy of your records">
            <SRow label="Identity verification" sub={verif.kyc_verified ? "Verified" : verif.request ? `Status: ${verif.request.status}` : "Not started"} right={verif.kyc_verified ? <span style={{ fontSize: 12, color: "var(--green-dk)", fontWeight: 600 }}><Check size={11} /> Verified</span> : <button className="btn btn-sm btn-secondary" onClick={() => navigate("/me/verification")}>{verif.request ? "View" : "Verify"}</button>} />
            <SRow label="Export my data" sub="Download a JSON copy of your profile, farms and records" right={<button className="btn btn-sm btn-secondary" onClick={exportData}><Download size={11} /> Export</button>} />
          </SettingsCard>

          <SectionHeader>This farm</SectionHeader>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm above to manage its profile, land, crop names and listings.</div> : (
            <>
              <SettingsCard icon={Home} title="Farm setup" desc="Your farm details and what you run">
                {farmQ.isLoading ? <CardLoading /> : farmQ.isError ? <CardError onRetry={() => farmQ.refetch()} label="Couldn't load this farm" /> : (
                  <>
                    <SRow label="Farm profile" sub={`${farm.farm_name || "—"} · ${farm.location_name || "—"}${farm.land_area_ha ? ` · ${farm.land_area_ha} ha` : ""}`}
                      right={manage ? <button className="btn btn-sm btn-secondary" onClick={() => setEditFarm(true)}>Edit</button> : null} />
                    <SRow label="Enterprises" sub={`${entCount} on this farm`} right={<button className="btn btn-sm btn-secondary" onClick={() => navigate("/farm/enterprises")}>Manage</button>} />
                  </>
                )}
              </SettingsCard>

              <SettingsCard icon={Layers} title="Land & structure" desc="Rename your zones and blocks — the code stays, the name updates everywhere">
                {(zonesQ.isLoading || puQ.isLoading) ? <CardLoading /> : (zonesQ.isError || puQ.isError) ? <CardError onRetry={() => { zonesQ.refetch(); puQ.refetch(); }} /> : (zones.length === 0 && blocks.length === 0) ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>No zones or blocks yet. Add them in Locations; rename them here any time.</div> : (
                  <>
                    {zones.map((z) => <SRow key={z.zone_id} label={z.zone_name || "Zone"} sub={`Zone · ${z.zone_id}${z.area_ha ? ` · ${z.area_ha} ha` : ""}`} right={<button className="btn btn-sm btn-secondary" title="Rename zone" onClick={() => setRenameWhat({ title: "Rename zone", label: "Zone name", current: z.zone_name, areaLabel: "Area (ha)", area: z.area_ha, endpoint: `/api/v1/zones/${encodeURIComponent(z.zone_id)}`, nameKey: "zone_name", areaKey: "area_ha", key: ["set-zones", farmId] })}><Pencil size={11} /></button>} />)}
                    {blocks.map((b) => <SRow key={b.pu_id} label={b.farmer_label || b.pu_name || "Block"} sub={`Block${b.area_sqm ? ` · ${b.area_sqm} m²` : ""}`} right={<button className="btn btn-sm btn-secondary" title="Rename block" onClick={() => setRenameWhat({ title: "Rename block", label: "Block name", current: b.pu_name, areaLabel: "Area (m²)", area: b.area_sqm, endpoint: `/api/v1/production-units/${encodeURIComponent(b.pu_id)}`, nameKey: "pu_name", areaKey: "area_sqm", key: ["set-pu", farmId] })}><Pencil size={11} /></button>} />)}
                  </>
                )}
              </SettingsCard>

              <SettingsCard icon={Sprout} title="Crop run names" desc="Give each cycle a friendly name — the crop type stays fixed">
                {cyclesQ.isLoading ? <CardLoading /> : cyclesQ.isError ? <CardError onRetry={() => cyclesQ.refetch()} /> : cyclesList.length === 0 ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>No cycles yet. Plant a cycle in Production, then name it here.</div> : cyclesList.slice(0, 20).map((c) => <SRow key={c.cycle_id} label={cycleName(c)} sub={`${c.production_name || c.crop || ""}${c.cycle_status || c.status ? ` · ${c.cycle_status || c.status}` : ""}`} right={<button className="btn btn-sm btn-secondary" title="Rename cycle" onClick={() => setRelabel(c)}><Pencil size={11} /></button>} />)}
              </SettingsCard>

              <SettingsCard icon={Store} title="Marketplace" desc="Sell your produce — list it straight from your farm">
                <div style={{ padding: 8 }}><button className="btn btn-sm btn-primary" onClick={() => setListFor(true)}><Plus size={11} /> List produce for sale</button></div>
                {listingsQ.isError ? <CardError onRetry={() => listingsQ.refetch()} /> : listings.length === 0 ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>Nothing listed right now. List surplus produce and buyers across the network can see it.</div> : listings.map((l) => <SRow key={l.listing_id} label={l.listing_title} sub={`${l.quantity_available_kg ? `${l.quantity_available_kg}kg` : ""}${l.price_per_kg_fjd ? ` · ${formatMoney(l.price_per_kg_fjd, { decimals: 0 })}/kg` : ""}${l.negotiable ? " · negotiable" : ""}`} right={<button className="btn btn-sm btn-secondary" onClick={() => closeListing(l.listing_id)}>Withdraw</button>} />)}
              </SettingsCard>
            </>
          )}

          {editFarm && farm.farm_id && <EditFarmModal farm={farm} onClose={() => setEditFarm(false)} onSaved={() => { setEditFarm(false); qc.invalidateQueries({ queryKey: ["set-farm", farmId] }); }} />}
          {invite && <InviteModal farmId={farmId} canManager={manage} onClose={() => setInvite(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["set-invites"] })} />}
          {plan && <PlanModal current={sub} onClose={() => setPlan(false)} />}
          {renameWhat && <RenameModal {...renameWhat} onClose={() => setRenameWhat(null)} onSaved={() => { qc.invalidateQueries({ queryKey: renameWhat.key }); setRenameWhat(null); }} />}
          {relabel && <RelabelModal cycle={relabel} onClose={() => setRelabel(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["set-cycles", farmId] }); setRelabel(null); }} />}
          {listFor && <ListingModal farmId={farmId} onClose={() => setListFor(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["set-listings"] }); setListFor(false); }} />}
        </div>
      </main>
    </TfpShell>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function FarmSettings() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <FarmSettingsInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

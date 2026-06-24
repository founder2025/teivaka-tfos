/**
 * FarmSettings.jsx — /farm/settings — PIXEL-EXACT prototype coreSettingsView.
 *
 * Five cards, every row real:
 *   Farm setup   GET /farms/{id} → Edit modal → PATCH /farms/{id}
 *                Enterprises count from live cycles + flocks → Manage → /farm/enterprises
 *   Team         GET /me/team (real members + roles) + pending GET /team/invites;
 *                Invite member → POST /team/invites → WhatsApp deep-link + copy URL
 *   Preferences  GET /me/prefs → pills/toggles → PATCH /me
 *                (pref_weight, pref_currency, preferred_language, notify_*)
 *   System       M-PAiSA honest "registration in progress" (Q8 — no fake connect);
 *                WhatsApp connected = real whatsapp_number; Weather connected =
 *                live forecast rows; Billing → real tier + upgrade request flow
 *                (POST /subscriptions/upgrade → admin approval); Security =
 *                prototype "coming soon" toast (prototype-exact).
 *   Governance   GET /me/records (last 6 hash-chained events) +
 *                GET /me/chain-status (real integrity check, break count surfaced).
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Home, Users, Settings as Cog, Link as LinkIcon, Shield, Plus, Check, X, Copy, Map as MapIcon, Layers, Sprout, Store, Download, Pencil, BadgeCheck } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
async function get(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function send(url, method, body) {
  const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof b?.detail === "string" ? b.detail : b?.detail?.message || `HTTP ${r.status}`);
  return b;
}

// ── prototype settingsCard / settingsRow / toggle / pills, verbatim shape ──
function SettingsCard({ icon: Icon, title, desc, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ color: "var(--green)" }}><Icon size={18} /></span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{desc}</div>
        </div>
      </div>
      <div style={{ padding: "4px 8px" }}>{children}</div>
    </div>
  );
}
function SRow({ label, sub, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 8px", borderBottom: "1px solid var(--cream-2)" }}>
      <div>
        <div style={{ fontSize: 13.5, color: "var(--soil)", fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}
function Toggle({ on, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: on ? "var(--green)" : "var(--line)", position: "relative", transition: ".15s", opacity: busy ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "var(--paper)", transition: ".15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}
function Pills({ opts, cur, onPick, busy }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {opts.map(([v, l]) => <button key={v} disabled={busy} className={`btn btn-sm ${cur === v ? "btn-primary" : "btn-secondary"}`} onClick={() => onPick(v)}>{l}</button>)}
    </div>
  );
}

// ── Edit farm profile modal (real PATCH /farms/{id}) ───────────────────────
function EditFarmModal({ farm, onClose, onSaved }) {
  const [name, setName] = useState(farm?.farm_name || "");
  const [region, setRegion] = useState(farm?.location_name || "");
  const [area, setArea] = useState(farm?.land_area_ha ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    try {
      await send(`/api/v1/farms/${encodeURIComponent(farm.farm_id)}`, "PATCH", {
        farm_name: name.trim() || null,
        location_name: region.trim() || null,
        land_area_ha: area === "" ? null : Number(area),
      });
      emitToast("Saved · Farm profile updated");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 440 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Edit farm profile</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="form-row"><label>Farm name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-row"><label>Area / region</label><input value={region} onChange={(e) => setRegion(e.target.value)} /></div>
          <div className="form-row"><label>Land area (ha)</label><input type="number" step="0.01" min="0" value={area} onChange={(e) => setArea(e.target.value)} /></div>
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Invite member modal (real POST /team/invites) ──────────────────────────
function InviteModal({ farmId, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("WORKER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(null); // {whatsapp_link, accept_url}
  async function submit() {
    setBusy(true); setErr("");
    try {
      const b = await send("/api/v1/team/invites", "POST", { invitee_name: name.trim(), invitee_phone: phone.trim(), team_role: role, farm_scope: farmId || "ALL" });
      setSent(b?.data || {});
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 440 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Invite a team member</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        {!sent ? (
          <>
            <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="form-row"><label>Name</label><input placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="form-row"><label>WhatsApp number</label><input placeholder="Their number" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="form-row">
                <label>Role</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["WORKER", "Worker"], ["MANAGER", "Manager"]].map(([v, l]) => (
                    <button key={v} className={`btn btn-sm ${role === v ? "btn-primary" : "btn-secondary"}`} onClick={() => setRole(v)}>{l}</button>
                  ))}
                </div>
              </div>
              {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
            </div>
            <div className="overlay-foot">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send invite"}</button>
            </div>
          </>
        ) : (
          <>
            <div className="overlay-body">
              <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}><Check size={14} style={{ color: "var(--green-dk)" }} /> Invite created for <strong>{name}</strong>. Send them the link — it expires in {sent.expires_days || 7} days. They appear as a member once they accept.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {sent.whatsapp_link && <a className="btn btn-primary" href={sent.whatsapp_link} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
                {sent.accept_url && <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(sent.accept_url); emitToast("Invite link copied"); }}><Copy size={13} />Copy link</button>}
              </div>
            </div>
            <div className="overlay-foot"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Manage plan modal (real upgrade-request flow) ──────────────────────────
function PlanModal({ current, onClose }) {
  const tiersQ = useQuery({ queryKey: ["sub-tiers"], queryFn: () => get("/api/v1/subscriptions/tiers") });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const tiers = tiersQ.data?.data || {};
  const curTier = current?.subscription_tier || "FREE";
  async function request(t) {
    setBusy(t); setErr("");
    try {
      await send("/api/v1/subscriptions/upgrade", "POST", { target_tier: t, billing_period: "MONTHLY", payment_method: "BANK_TRANSFER" });
      emitToast(`Upgrade to ${t} requested · the team confirms it with you before anything changes`);
      onClose();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(""); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 480 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Manage plan</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>Current plan: <strong style={{ color: "var(--soil)" }}>{curTier}</strong>. Requesting a change creates a real request — nothing is charged in-app; the team confirms with you first.</div>
          {Object.entries(tiers).map(([key, t]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--cream-2)" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--soil)" }}>{t.name || key}{key === curTier && <span style={{ fontSize: 10.5, color: "var(--green-dk)", marginLeft: 6 }}>· current</span>}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.price_fjd_monthly != null ? `FJD ${t.price_fjd_monthly}/month` : ""}{t.description ? ` · ${t.description}` : ""}</div>
              </div>
              {key !== curTier && <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => request(key)}>{busy === key ? "Requesting…" : "Request"}</button>}
            </div>
          ))}
          {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
        <div className="overlay-foot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// ── Rename modal (zones, blocks) — names/labels only, stable IDs preserved ──
function RenameModal({ title, label, current, areaLabel, area, endpoint, nameKey, areaKey, onClose, onSaved }) {
  const [name, setName] = useState(current || "");
  const [areaVal, setAreaVal] = useState(area ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!name.trim()) { setErr("A name is required."); return; }
    setBusy(true); setErr("");
    try {
      const body = { [nameKey]: name.trim() };
      if (areaKey && areaVal !== "") body[areaKey] = Number(areaVal);
      await send(endpoint, "PATCH", body);
      emitToast("Saved · change recorded in your audit chain");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 440 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{title}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}><Shield size={11} /> The code/ID stays the same — only the name changes, and it updates everywhere this is referenced. The edit is hash-chained.</div>
          <div className="form-row"><label>{label}</label><input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
          {areaKey && <div className="form-row"><label>{areaLabel}</label><input type="number" step="0.01" min="0" value={areaVal} onChange={(e) => setAreaVal(e.target.value)} /></div>}
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Cycle relabel modal (farmer_label only; cycle_id + production_id stay) ──
function RelabelModal({ cycle, onClose, onSaved }) {
  const [label, setLabel] = useState(cycle.farmer_label || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!label.trim()) { setErr("Give it a name."); return; }
    setBusy(true); setErr("");
    try {
      await send(`/api/v1/cycles/${encodeURIComponent(cycle.cycle_id)}/relabel`, "PATCH", { farmer_label: label.trim() });
      emitToast("Saved · cycle label updated · hash-chained");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 440 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Rename this crop run</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}><Shield size={11} /> Your own friendly name for this cycle — e.g. "Eggplant by the mango tree". The crop type and cycle ID stay fixed; this just makes it easy to recognise.</div>
          <div className="form-row"><label>Your name for it</label><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={64} placeholder={cycle.production_name || cycle.cycle_id} /></div>
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Marketplace listing modal (create from the farm pillar) ────────────────
function ListingModal({ farmId, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [grade, setGrade] = useState("");
  const [neg, setNeg] = useState(true);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!title.trim()) { setErr("Give your listing a title."); return; }
    setBusy(true); setErr("");
    try {
      await send("/api/v1/community/listings", "POST", {
        farm_id: farmId, category: "PRODUCE", listing_title: title.trim(),
        listing_description: desc.trim() || null,
        quantity_available_kg: qty === "" ? null : Number(qty),
        price_per_kg_fjd: price === "" ? null : Number(price),
        price_basis: "kg", negotiable: neg, grade: grade.trim() || null,
      });
      emitToast("Listed · your produce is now on the marketplace");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>List produce for sale</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Listing…" : "List it"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
function FarmSettingsInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [editFarm, setEditFarm] = useState(false);
  const [invite, setInvite] = useState(false);
  const [plan, setPlan] = useState(false);
  const [busyPref, setBusyPref] = useState(false);
  const [renameWhat, setRenameWhat] = useState(null);  // {title,label,current,...,endpoint,nameKey,areaKey}
  const [relabel, setRelabel] = useState(null);        // cycle row
  const [listFor, setListFor] = useState(false);

  const farmQ = useQuery({ queryKey: ["set-farm", farmId], queryFn: () => get(`/api/v1/farms/${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const teamQ = useQuery({ queryKey: ["set-team"], queryFn: () => get("/api/v1/me/team") });
  const invitesQ = useQuery({ queryKey: ["set-invites"], queryFn: () => get("/api/v1/team/invites").catch(() => ({ data: [] })) });
  const prefsQ = useQuery({ queryKey: ["set-prefs"], queryFn: () => get("/api/v1/me/prefs") });
  const cyclesQ = useQuery({ queryKey: ["set-cycles", farmId], queryFn: () => get(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`).catch(() => ({ data: [] })), enabled: !!farmId });
  const flocksQ = useQuery({ queryKey: ["set-flocks", farmId], queryFn: () => get(`/api/v1/flocks?farm_id=${encodeURIComponent(farmId)}&is_active=true`).catch(() => ({ data: [] })), enabled: !!farmId });
  const subQ = useQuery({ queryKey: ["set-sub"], queryFn: () => get("/api/v1/subscriptions/current") });
  const recordsQ = useQuery({ queryKey: ["set-records"], queryFn: () => get("/api/v1/me/records") });
  const chainQ = useQuery({ queryKey: ["set-chain"], queryFn: () => get("/api/v1/me/chain-status") });
  const wxQ = useQuery({ queryKey: ["set-wx", farmId], queryFn: () => get(`/api/v1/weather/forecast/${encodeURIComponent(farmId)}?range=daily`).catch(() => ({ data: [] })), enabled: !!farmId });
  const zonesQ = useQuery({ queryKey: ["set-zones", farmId], queryFn: () => get(`/api/v1/zones?farm_id=${encodeURIComponent(farmId)}`).catch(() => ({ data: [] })), enabled: !!farmId });
  const puQ = useQuery({ queryKey: ["set-pu", farmId], queryFn: () => get(`/api/v1/production-units?farm_id=${encodeURIComponent(farmId)}`).catch(() => ({ data: [] })), enabled: !!farmId });
  const listingsQ = useQuery({ queryKey: ["set-listings"], queryFn: () => get("/api/v1/community/listings?mine=true").catch(() => ({ data: [] })) });
  const verifQ = useQuery({ queryKey: ["set-verif"], queryFn: () => get("/api/v1/me/verification").catch(() => ({ data: {} })) });

  const farm = farmQ.data?.data || farmQ.data || {};
  const team = teamQ.data?.data ?? [];
  const pendingInvites = (invitesQ.data?.data ?? []).filter((i) => (i.status || "PENDING").toUpperCase() === "PENDING");
  const prefs = prefsQ.data?.data ?? {};
  const cyclesRaw = cyclesQ.data?.data;
  const cyclesList = Array.isArray(cyclesRaw) ? cyclesRaw : cyclesRaw?.cycles ?? [];
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
  const allCycles = cyclesList;
  const listings = (listingsQ.data?.data ?? []).filter((l) => String(l.listing_status || "").toUpperCase() === "ACTIVE");
  const verif = verifQ.data?.data ?? {};

  async function patchMe(body) {
    setBusyPref(true);
    try {
      await send("/api/v1/me", "PATCH", body);
      emitToast("Saved · Preference updated");
      qc.invalidateQueries({ queryKey: ["set-prefs"] });
    } catch (e) { emitToast(`Could not save: ${e.message || e}`); } finally { setBusyPref(false); }
  }

  const roleChip = (m) => {
    const r = m.role === "FOUNDER" ? "OWNER" : (m.team_role || m.role || "WORKER").toUpperCase();
    return <span style={{ fontSize: 11, fontWeight: 700, color: r === "OWNER" ? "var(--green-dk)" : "var(--muted)", letterSpacing: ".5px" }}>{r}</span>;
  };

  async function closeListing(id) {
    try { await send(`/api/v1/community/listings/${encodeURIComponent(id)}/close`, "PATCH", {}); emitToast("Listing withdrawn"); qc.invalidateQueries({ queryKey: ["set-listings"] }); }
    catch (e) { emitToast(`Could not withdraw: ${e.message || e}`); }
  }
  async function exportData() {
    try {
      const b = await get("/api/v1/me/export");
      const blob = new Blob([JSON.stringify(b?.data ?? b, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `tfos-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
      emitToast("Your data exported");
    } catch (e) { emitToast(`Export failed: ${e.message || e}`); }
  }
  const cycleName = (c) => c.farmer_label || c.production_name || c.crop || c.cycle_id;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Settings</h1><div className="subtitle">Your farm, your team, and how TFOS works for you</div></div>
            <div className="page-actions"><FarmSelector /></div>
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to manage its settings.</div> : (
            <>
              {/* ── Farm setup ── */}
              <SettingsCard icon={Home} title="Farm setup" desc="Your farm details and what you run">
                <SRow label="Farm profile"
                  sub={`${farm.farm_name || "—"} · ${farm.location_name || "—"}${farm.location_island ? ` · ${farm.location_island}` : ""}${farm.land_area_ha ? ` · ${farm.land_area_ha} ha` : ""}`}
                  right={<button className="btn btn-sm btn-secondary" onClick={() => setEditFarm(true)}>Edit</button>} />
                <SRow label="Enterprises" sub={`${entCount} on this farm`}
                  right={<button className="btn btn-sm btn-secondary" onClick={() => navigate("/farm/enterprises")}>Manage</button>} />
              </SettingsCard>

              {/* ── Team ── */}
              <SettingsCard icon={Users} title="Team" desc="Who can use this farm and what they can do">
                {team.map((m) => (
                  <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                    <span style={{ fontSize: 13.5, color: "var(--soil)" }}>{m.full_name || m.email}{m.is_you ? <span style={{ color: "var(--muted)", fontSize: 11.5 }}> · you</span> : null}</span>
                    {roleChip(m)}
                  </div>
                ))}
                {pendingInvites.map((i) => (
                  <div key={i.invite_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                    <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{i.invitee_name} <span style={{ fontSize: 11.5 }}>· invited, pending</span></span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", letterSpacing: ".5px" }}>{(i.team_role || "WORKER").toUpperCase()}</span>
                  </div>
                ))}
                <SRow label="Permissions" sub="Owner: full access · Worker: log events and view tasks"
                  right={<span style={{ fontSize: 12, color: "var(--muted)" }}>By role</span>} />
                <div style={{ padding: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setInvite(true)}><Plus size={11} /> Invite member</button>
                </div>
              </SettingsCard>

              {/* ── Preferences ── */}
              <SettingsCard icon={Cog} title="Preferences" desc="Units, language, and notifications">
                <SRow label="Weight units" right={<Pills busy={busyPref} opts={[["kg", "kg"], ["lb", "lb"]]} cur={prefs.pref_weight || "kg"} onPick={(v) => patchMe({ pref_weight: v })} />} />
                <SRow label="Money" sub="Fijian dollar" right={<Pills busy={busyPref} opts={[["FJD", "FJD"]]} cur={prefs.pref_currency || "FJD"} onPick={(v) => patchMe({ pref_currency: v })} />} />
                <SRow label="Language" right={<Pills busy={busyPref} opts={[["en", "English"], ["fj", "iTaukei"], ["hi", "Hindi"]]} cur={prefs.preferred_language || "en"} onPick={(v) => patchMe({ preferred_language: v })} />} />
                <SRow label="WhatsApp alerts" sub="Get alerts on WhatsApp" right={<Toggle busy={busyPref} on={!!prefs.notify_whatsapp} onClick={() => patchMe({ notify_whatsapp: !prefs.notify_whatsapp })} />} />
                <SRow label="Task reminders" right={<Toggle busy={busyPref} on={!!prefs.notify_tasks} onClick={() => patchMe({ notify_tasks: !prefs.notify_tasks })} />} />
                <SRow label="Weather alerts" right={<Toggle busy={busyPref} on={!!prefs.notify_weather} onClick={() => patchMe({ notify_weather: !prefs.notify_weather })} />} />
                <SRow
                  label="Show my location to verified members"
                  sub={
                    prefs.share_location === false
                      ? "Hidden — you won't appear on the network map."
                      : prefs.location_share_ack
                        ? "Verified buyers, farmers and service providers can see your farm on the network map with the distance to you. Turn off to hide."
                        : "Lets verified members find you on the network map with the distance to you. We only ever show your location to verified members. Turn off any time to stay hidden."
                  }
                  right={<Toggle busy={busyPref} on={prefs.share_location !== false} onClick={() => patchMe({ share_location: !(prefs.share_location !== false) })} />}
                />
              </SettingsCard>

              {/* ── Structure (zones + blocks) ── */}
              <SettingsCard icon={Layers} title="Land & structure" desc="Rename your zones and blocks — the code stays, the name updates everywhere">
                {zones.length === 0 && blocks.length === 0 && <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>No zones or blocks on this farm yet. Add them in Locations; rename them here any time.</div>}
                {zones.map((z) => (
                  <SRow key={z.zone_id} label={z.zone_name || z.zone_id}
                    sub={`Zone · ${z.zone_id}${z.area_ha ? ` · ${z.area_ha} ha` : ""}`}
                    right={<button className="btn btn-sm btn-secondary" title="Rename zone" onClick={() => setRenameWhat({ title: "Rename zone", label: "Zone name", current: z.zone_name, areaLabel: "Area (ha)", area: z.area_ha, endpoint: `/api/v1/zones/${encodeURIComponent(z.zone_id)}`, nameKey: "zone_name", areaKey: "area_ha", key: ["set-zones", farmId] })}><Pencil size={11} /></button>} />
                ))}
                {blocks.map((b) => (
                  <SRow key={b.pu_id} label={b.farmer_label || b.pu_name || b.pu_id}
                    sub={`Block${b.area_sqm ? ` · ${b.area_sqm} m²` : ""}`}
                    right={<button className="btn btn-sm btn-secondary" title="Rename block" onClick={() => setRenameWhat({ title: "Rename block", label: "Block name", current: b.pu_name, areaLabel: "Area (m²)", area: b.area_sqm, endpoint: `/api/v1/production-units/${encodeURIComponent(b.pu_id)}`, nameKey: "pu_name", areaKey: "area_sqm", key: ["set-pu", farmId] })}><Pencil size={11} /></button>} />
                ))}
              </SettingsCard>

              {/* ── Crop run labels ── */}
              <SettingsCard icon={Sprout} title="Crop run names" desc="Give each cycle a friendly name — the crop type stays fixed">
                {allCycles.length === 0 && <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>No cycles yet. Plant a cycle in Production, then name it here so it's easy to recognise.</div>}
                {allCycles.slice(0, 20).map((c) => (
                  <SRow key={c.cycle_id} label={cycleName(c)}
                    sub={`${c.production_name || c.crop || ""}${c.cycle_status || c.status ? ` · ${c.cycle_status || c.status}` : ""}`}
                    right={<button className="btn btn-sm btn-secondary" title="Rename cycle" onClick={() => setRelabel(c)}><Pencil size={11} /></button>} />
                ))}
              </SettingsCard>

              {/* ── System ── */}
              <SettingsCard icon={LinkIcon} title="System" desc="Connections, billing, and security">
                <SRow label="M-PAiSA" sub="Mobile money payments"
                  right={<button className="btn btn-sm btn-secondary" onClick={() => emitToast("M-PAiSA — merchant registration with Vodafone is in progress. Connect goes live the day it clears; nothing to set up on your side.")}>In progress</button>} />
                <SRow label="WhatsApp" sub={waConnected ? `Alerts and messages · ${prefs.whatsapp_number}` : "Alerts and messages"}
                  right={waConnected
                    ? <button className="btn btn-sm btn-secondary" style={{ color: "var(--green-dk)" }} onClick={() => navigate("/me")}><Check size={11} /> Connected</button>
                    : <button className="btn btn-sm btn-primary" onClick={() => navigate("/me")}>Connect</button>} />
                <SRow label="Weather service" sub="Live forecasts"
                  right={weatherLive
                    ? <button className="btn btn-sm btn-secondary" style={{ color: "var(--green-dk)" }} onClick={() => emitToast("Weather feed is live — 7-day forecast updating automatically for this farm.")}><Check size={11} /> Connected</button>
                    : <button className="btn btn-sm btn-secondary" onClick={() => emitToast("The forecast feed populates automatically on its next scheduled fetch for this farm — nothing to set up.")}>Pending</button>} />
                <SRow label="Billing" sub={`Current plan: ${sub.subscription_tier || "—"}${sub.subscription_status ? ` · ${sub.subscription_status}` : ""}`}
                  right={<button className="btn btn-sm btn-secondary" onClick={() => setPlan(true)}>Manage plan</button>} />
                <SRow label="Security" sub="PIN and signed-in devices"
                  right={<button className="btn btn-sm btn-secondary" onClick={() => emitToast("Security — PIN setup coming soon")}>Set up</button>} />
              </SettingsCard>

              {/* ── Governance ── */}
              <SettingsCard icon={Shield} title="Governance" desc="Your tamper-proof record of everything logged">
                {records.length === 0
                  ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>Your audit log builds as you log events. Every action gets a tamper-proof record here.</div>
                  : records.slice(0, 6).map((e, i) => (
                    <SRow key={i} label={e.event_type || "Event"}
                      sub={`${String(e.occurred_at || "").slice(0, 16).replace("T", " ")} · ${e.entity_type || "record"}`}
                      right={<span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--green-dk)" }}>{String(e.audit_hash || "").slice(-8) || "—"}</span>} />
                  ))}
                <div style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>
                  {chain.events_in_chain != null ? `${chain.events_in_chain} events in your chain · each one hash-linked and tamper-proof` : "Chain status loading…"}
                  {chain.integrity_ok === false && <span style={{ color: "var(--red)", fontWeight: 600 }}> · {chain.chain_break_count} integrity break{chain.chain_break_count === 1 ? "" : "s"} detected — contact support</span>}
                  {chain.integrity_ok === true && <span style={{ color: "var(--green-dk)" }}> · integrity verified</span>}
                </div>
              </SettingsCard>

              {/* ── Marketplace ── */}
              <SettingsCard icon={Store} title="Marketplace" desc="Sell your produce — list it straight from your farm">
                <div style={{ padding: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setListFor(true)}><Plus size={11} /> List produce for sale</button>
                </div>
                {listings.length === 0
                  ? <div style={{ padding: "11px 8px", color: "var(--muted)", fontSize: 13 }}>Nothing listed right now. List surplus produce and buyers across the network can see it.</div>
                  : listings.map((l) => (
                    <SRow key={l.listing_id} label={l.listing_title}
                      sub={`${l.quantity_available_kg ? `${l.quantity_available_kg}kg` : ""}${l.price_per_kg_fjd ? ` · FJD ${l.price_per_kg_fjd}/kg` : ""}${l.negotiable ? " · negotiable" : ""}`}
                      right={<button className="btn btn-sm btn-secondary" onClick={() => closeListing(l.listing_id)}>Withdraw</button>} />
                  ))}
              </SettingsCard>

              {/* ── Data & account ── */}
              <SettingsCard icon={BadgeCheck} title="Data & verification" desc="Your verification status and a copy of your records">
                <SRow label="Identity verification"
                  sub={verif.kyc_verified ? "Verified" : verif.request ? `Status: ${verif.request.status}` : "Not started"}
                  right={verif.kyc_verified
                    ? <span style={{ fontSize: 12, color: "var(--green-dk)", fontWeight: 600 }}><Check size={11} /> Verified</span>
                    : <button className="btn btn-sm btn-secondary" onClick={() => navigate("/me/verification")}>{verif.request ? "View" : "Verify"}</button>} />
                <SRow label="Export my data" sub="Download a JSON copy of your profile, farms and records"
                  right={<button className="btn btn-sm btn-secondary" onClick={exportData}><Download size={11} /> Export</button>} />
              </SettingsCard>
            </>
          )}

          {editFarm && farm.farm_id && <EditFarmModal farm={farm} onClose={() => setEditFarm(false)} onSaved={() => { setEditFarm(false); qc.invalidateQueries({ queryKey: ["set-farm", farmId] }); }} />}
          {invite && <InviteModal farmId={farmId} onClose={() => setInvite(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["set-invites"] })} />}
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

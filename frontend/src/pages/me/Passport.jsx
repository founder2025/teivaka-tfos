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
  Mail, Phone, BadgeCheck, Share2,
} from "lucide-react";
import { C, getJSON, send } from "./_meCommon";
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

function TrustHeadline({ trust, onView }) {
  const scored = trust?.status === "scored";
  const b = scored ? trust.overall_band : "Building";
  const color = BANDS[b] || C.muted;
  return (
    <div onClick={onView} style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: 14, marginTop: 12, background: "var(--paper)", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><BadgeCheck size={16} style={{ color }} /><strong style={{ color: C.soil }}>Evidence &amp; Reliability Confidence</strong></div>
        <span style={{ fontWeight: 800, color }}>{scored ? `${trust.overall_score} · ${b}` : "Building"}</span>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{scored ? "Tap to see what drives it — and how to raise it." : (trust?.note || "Builds automatically from your records.")}</div>
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

function Reputation({ trust, rep, onRefresh, refreshing, onShare }) {
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
      <button onClick={onShare} style={{ border: `1px solid ${C.greenDk}`, color: "var(--paper)", background: C.greenDk, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}><Share2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Share my passport securely</button>
    </div>
  );
}

function ShareSheet({ open, onClose }) {
  const [shares, setShares] = useState([]);
  const [form, setForm] = useState({ audience: "LOAN", share_reason: "", expiry_days: 30, password: "", one_time: false });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // {url}
  const reload = useCallback(async () => { try { const d = await getJSON("/api/v1/shares"); setShares(d?.data?.shares || []); } catch { /* noop */ } }, []);
  useEffect(() => { if (open) { reload(); setCreated(null); } }, [open, reload]);
  const create = async () => {
    setBusy(true);
    try {
      const d = await send("POST", "/api/v1/shares", { ...form, expiry_days: Number(form.expiry_days) || 30, password: form.password || null });
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
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Expires {created.expires_at?.slice(0, 10)}. You'll see when it's opened, and you can revoke it any time below.</div>
          </div>
        )}
        <label style={{ fontSize: 12.5, color: C.soil }}>Who is this for?
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={inp}>{AUD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
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
        <div style={{ fontSize: 11, color: C.muted }}>The viewer sees your identity, reputation, trust and farm — never your raw cash records or private notes. You own this share and can revoke it.</div>

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

  const load = useCallback(async () => {
    setErr(false);
    try { const d = await getJSON("/api/v1/passport/me"); setData(d?.data || d); }
    catch { if (!data) setErr(true); }
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

  const refreshTrust = async () => {
    setRefreshing(true);
    try { await send("POST", "/api/v1/passport/me/trust/refresh"); await load(); }
    catch (e) { toast(e.userMessage || e.message || "Couldn't refresh trust"); }
    finally { setRefreshing(false); }
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

  const id = data.identity || {}; const rep = data.reputation || {}; const farms = data.farms || []; const v = id.verifications || {};
  const TABS = [["overview", "Overview"], ["farm", "Farm"], ["reputation", "Reputation"]];

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
          <button onClick={() => setEdit({ preferred_name: id.preferred_name || "", bio: id.bio || "", languages: (id.languages || []).join(", ") })} title="Edit name / bio / languages" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 7, color: C.muted, background: "var(--paper)" }}><Pencil size={14} /></button>
        </div>
        {id.bio && <div style={{ fontSize: 13, color: C.soil, marginTop: 10, lineHeight: 1.5 }}>{id.bio}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          <Chip on={v.identity} building={!v.identity} label="Identity verified" />
          <Chip on={v.farm} label="Farm" />
          <Chip on={v.email} label="Email" />
          <Chip on={v.phone} label="Phone" />
        </div>
      </div>

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
          <TrustHeadline trust={data.trust} onView={() => setTab("reputation")} />
        </>
      )}

      {tab === "farm" && (
        <div style={{ display: "grid", gap: 10 }}>
          {farms.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No farm set up yet.</div> : farms.map((f) => (
            <div key={f.farm_id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
              <div style={{ fontWeight: 700, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}><Sprout size={15} style={{ color: C.greenDk }} />{f.farm_name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{f.location ? `${f.location} · ` : ""}{f.area_ha} ha · {f.blocks} block{f.blocks === 1 ? "" : "s"}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, marginTop: 2 }}>{f.farm_id}</div>
            </div>
          ))}
          <button onClick={() => navigate("/farm/locations")} style={{ border: `1px solid ${C.line}`, color: C.greenDk, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}><MapPin size={14} style={{ verticalAlign: -2, marginRight: 4 }} />View farm map &amp; blocks</button>
        </div>
      )}

      {tab === "reputation" && <Reputation trust={data.trust} rep={rep} onRefresh={refreshTrust} refreshing={refreshing} onShare={() => setShareOpen(true)} />}

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />

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

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

export default function Passport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("overview");
  const [edit, setEdit] = useState(null); // {preferred_name, bio, languages}

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
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 12, padding: 14, marginTop: 12, background: "var(--cream)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><BadgeCheck size={16} style={{ color: C.amber }} /><strong style={{ color: C.soil }}>Trust · Building</strong></div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{data.trust?.note}</div>
          </div>
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

      {tab === "reputation" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "var(--paper)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={16} style={{ color: C.greenDk }} /><strong style={{ color: C.soil }}>Your verified reputation</strong></div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Built automatically from your farming records — every one is hash-stamped and tamper-evident.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 12 }}>
              <Stat label="Seasons completed" value={rep.seasons_completed} />
              <Stat label="Production logged" value={`${Math.round(rep.verified_production_kg || 0).toLocaleString()} kg`} />
              <Stat label="Sales recorded" value={fjd(rep.total_sales_fjd)} />
              <Stat label="Photo evidence" value={rep.photo_evidence} />
            </div>
          </div>
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 12, padding: 14, background: "var(--cream)" }}>
            <strong style={{ color: C.soil, fontSize: 13.5 }}>What strengthens your reputation</strong>
            <ul style={{ margin: "8px 0 0 16px", fontSize: 12.5, color: C.soil, lineHeight: 1.7 }}>
              <li>Completing growing seasons with logged harvests</li>
              <li>Recording sales and repeat buyers</li>
              <li>Keeping compliance (withholding periods) clean</li>
              <li>Adding photos &amp; GPS to your field events</li>
              <li>Independent verification (extension officer, cooperative, buyer) — coming soon</li>
            </ul>
          </div>
          <button disabled title="Secure sharing arrives in the next release" style={{ border: `1px solid ${C.line}`, color: C.muted, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, opacity: 0.65 }}><Share2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Share my passport (secure sharing coming soon)</button>
        </div>
      )}

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

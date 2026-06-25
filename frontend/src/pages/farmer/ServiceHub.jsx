/**
 * ServiceHub — /farm/services. The ecosystem connector.
 *  • Find work (providers): set your provider profile, see nearby OPEN jobs, claim them.
 *  • My requests (farmers): jobs you posted (e.g. "deliver this sale"), confirm done.
 * Backed by /api/v1/service-jobs + /api/v1/service-provider/profile.
 */
import { useEffect, useState } from "react";
import { Truck, Snowflake, MapPin, Check, X } from "lucide-react";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", cream: "var(--cream)", red: "var(--red)" };
const card = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const inp = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%", boxSizing: "border-box", background: C.paper, color: C.soil };
const btn = { background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const lbl = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, display: "block", marginBottom: 3 };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const tok = () => { try { return localStorage.getItem("tfos_access_token") || ""; } catch { return ""; } };
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const getJSON = (u) => fetch(u, { headers: H() }).then((r) => r.json());
const SVC = [["TRANSPORT", "Transport / delivery"], ["COLD_STORAGE", "Cold storage"], ["INPUT_DELIVERY", "Input delivery"], ["MACHINERY", "Machinery"], ["TOOLS", "Tools"], ["OTHER", "Other"]];
const svcLabel = (k) => (SVC.find((s) => s[0] === k) || [k, k])[1];
const fjd = (n) => (n == null ? "—" : "FJD " + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));

function JobCard({ j, children }) {
  const Icon = j.service_type === "COLD_STORAGE" ? Snowflake : Truck;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon size={15} style={{ color: C.greenDk }} />
        <strong style={{ color: C.soil, fontSize: 13.5 }}>{j.title}</strong>
        <span style={pill("var(--cream)", C.greenDk)}>{svcLabel(j.service_type)}</span>
        <span style={pill(j.status === "OPEN" ? "#eef7ee" : j.status === "COMPLETED" ? "#eef7ee" : j.status === "CANCELLED" ? "#f3f3f3" : "var(--cream)", C.muted)}>{j.status}</span>
        {j.distance_km != null && <span style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}><MapPin size={11} style={{ verticalAlign: "-1px" }} /> {j.distance_km} km</span>}
      </div>
      <div style={{ fontSize: 12.5, color: C.soil, marginTop: 6 }}>
        {j.produce_desc && <span>{j.produce_desc}{j.quantity_kg ? ` · ${j.quantity_kg} kg` : ""} · </span>}
        {j.pickup_location && <span>from <strong>{j.pickup_location}</strong> </span>}
        {j.dropoff_location && <span>→ <strong>{j.dropoff_location}</strong> </span>}
        {j.budget_fjd != null && <span>· budget {fjd(j.budget_fjd)}</span>}
      </div>
      {j.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{j.notes}</div>}
      {children && <div style={{ marginTop: 10, display: "flex", gap: 8 }}>{children}</div>}
    </div>
  );
}

export default function ServiceHub() {
  const [tab, setTab] = useState("work");
  const [profile, setProfile] = useState(null);
  const [available, setAvailable] = useState(null);
  const [claimed, setClaimed] = useState(null);
  const [mine, setMine] = useState(null);
  const [p, setP] = useState({ display_name: "", service_types: [], base_location: "", base_lat: "", base_lng: "", service_radius_km: 25, phone: "", capacity_note: "", is_active: true });

  const loadProfile = () => getJSON("/api/v1/service-provider/profile").then((r) => { const d = r?.data; setProfile(d); if (d) setP({ ...p, ...d, service_types: d.service_types || [], base_lat: d.base_lat ?? "", base_lng: d.base_lng ?? "" }); }).catch(() => setProfile(null));
  const loadWork = () => { getJSON("/api/v1/service-jobs/available").then((r) => setAvailable(r?.data || [])).catch(() => setAvailable([])); getJSON("/api/v1/service-jobs/claimed").then((r) => setClaimed(r?.data || [])).catch(() => setClaimed([])); };
  const loadMine = () => getJSON("/api/v1/service-jobs/mine").then((r) => setMine(r?.data || [])).catch(() => setMine([]));
  useEffect(() => { loadProfile(); loadWork(); loadMine(); }, []); // eslint-disable-line

  const saveProfile = async () => {
    try {
      const r = await fetch("/api/v1/service-provider/profile", { method: "PUT", headers: H(), body: JSON.stringify({
        display_name: p.display_name || null, service_types: p.service_types,
        base_location: p.base_location || null, base_lat: p.base_lat === "" ? null : Number(p.base_lat),
        base_lng: p.base_lng === "" ? null : Number(p.base_lng), service_radius_km: Number(p.service_radius_km) || 25,
        phone: p.phone || null, capacity_note: p.capacity_note || null, is_active: p.is_active !== false }) });
      if (!r.ok) throw new Error(); toast("Provider profile saved ✓", "success"); loadProfile(); loadWork();
    } catch { toast("Could not save profile", "error"); }
  };
  const useMyGps = () => { if (!navigator.geolocation) return toast("No GPS available", "error"); navigator.geolocation.getCurrentPosition((pos) => setP((o) => ({ ...o, base_lat: pos.coords.latitude.toFixed(6), base_lng: pos.coords.longitude.toFixed(6) })), () => toast("Couldn't get location", "error")); };
  const toggleType = (t) => setP((o) => ({ ...o, service_types: o.service_types.includes(t) ? o.service_types.filter((x) => x !== t) : [...o.service_types, t] }));

  const act = async (url, ok) => { try { const r = await fetch(url, { method: "POST", headers: H() }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || ""); toast(ok, "success"); loadWork(); loadMine(); } catch (e) { toast(String(e.message || "Failed"), "error"); } };
  const claim = (id) => act(`/api/v1/service-jobs/${id}/claim`, "Job claimed ✓");
  const cancel = (id) => act(`/api/v1/service-jobs/${id}/cancel`, "Job cancelled");
  const complete = async (id) => {
    const price = window.prompt("Confirm done. What price did you pay the provider (FJD)?");
    if (price == null) return;
    try { const r = await fetch(`/api/v1/service-jobs/${id}/complete`, { method: "POST", headers: H(), body: JSON.stringify({ agreed_price_fjd: Number(price) || 0 }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || ""); toast("Job completed ✓", "success"); loadMine(); } catch (e) { toast(String(e.message || "Failed"), "error"); }
  };

  const TabBtn = ({ id, children }) => <button onClick={() => setTab(id)} style={{ background: tab === id ? C.green : "transparent", color: tab === id ? "#fff" : C.soil, border: `1px solid ${tab === id ? C.green : C.line}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{children}</button>;

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, color: C.soil, margin: "0 0 4px" }}>Service hub</h1>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 14px" }}>Connect the gaps — get your produce moved or stored, or earn by filling jobs near you.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TabBtn id="work">Find work</TabBtn>
        <TabBtn id="requests">My requests</TabBtn>
      </div>

      {tab === "work" && (
        <>
          <div style={card}>
            <strong style={{ color: C.soil, fontSize: 14 }}>Your provider profile</strong>
            <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 10px" }}>Set what you offer and where — you'll see matching jobs within your radius.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><span style={lbl}>Display name</span><input value={p.display_name || ""} onChange={(e) => setP({ ...p, display_name: e.target.value })} style={inp} /></div>
              <div><span style={lbl}>Phone</span><input value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} style={inp} /></div>
            </div>
            <span style={lbl}>Services you offer</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 10px" }}>
              {SVC.map(([k, l]) => <button key={k} onClick={() => toggleType(k)} style={{ ...pill(p.service_types.includes(k) ? "#eef7ee" : "var(--cream)", p.service_types.includes(k) ? C.greenDk : C.muted), border: `1px solid ${p.service_types.includes(k) ? C.green : C.line}`, cursor: "pointer", padding: "5px 11px" }}>{l}</button>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><span style={lbl}>Base location</span><input value={p.base_location || ""} onChange={(e) => setP({ ...p, base_location: e.target.value })} style={inp} /></div>
              <div><span style={lbl}>Lat</span><input value={p.base_lat} onChange={(e) => setP({ ...p, base_lat: e.target.value })} style={inp} /></div>
              <div><span style={lbl}>Lng</span><input value={p.base_lng} onChange={(e) => setP({ ...p, base_lng: e.target.value })} style={inp} /></div>
              <div><span style={lbl}>Radius km</span><input type="number" value={p.service_radius_km} onChange={(e) => setP({ ...p, service_radius_km: e.target.value })} style={inp} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={useMyGps} style={{ ...btn, background: C.paper, color: C.soil, border: `1px solid ${C.line}` }}><MapPin size={13} style={{ verticalAlign: "-2px" }} /> Use my GPS</button>
              <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={p.is_active !== false} onChange={(e) => setP({ ...p, is_active: e.target.checked })} /> Available for jobs</label>
              <button onClick={saveProfile} style={{ ...btn, marginLeft: "auto" }}>Save profile</button>
            </div>
          </div>

          <strong style={{ color: C.soil, fontSize: 14 }}>Jobs near you</strong>
          <div style={{ marginTop: 8 }}>
            {available == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
              : available.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No open jobs match your profile right now.</div>
              : available.map((j) => <JobCard key={j.job_id} j={j}><button onClick={() => claim(j.job_id)} style={btn}>Claim job</button></JobCard>)}
          </div>

          {claimed && claimed.length > 0 && (
            <>
              <strong style={{ color: C.soil, fontSize: 14 }}>Jobs you've claimed</strong>
              <div style={{ marginTop: 8 }}>{claimed.map((j) => <JobCard key={j.job_id} j={j} />)}</div>
            </>
          )}
        </>
      )}

      {tab === "requests" && (
        <div style={{ marginTop: 4 }}>
          {mine == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
            : mine.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No service requests yet. Post one from an order (Buyers → order → "Find transport"), or they'll appear here.</div>
            : mine.map((j) => (
              <JobCard key={j.job_id} j={j}>
                {j.status === "CLAIMED" && <button onClick={() => complete(j.job_id)} style={btn}><Check size={13} style={{ verticalAlign: "-2px" }} /> Confirm done</button>}
                {(j.status === "OPEN" || j.status === "CLAIMED") && <button onClick={() => cancel(j.job_id)} style={{ ...btn, background: C.paper, color: C.red, border: `1px solid ${C.line}` }}><X size={13} style={{ verticalAlign: "-2px" }} /> Cancel</button>}
                {j.status === "COMPLETED" && j.agreed_price_fjd != null && <span style={{ fontSize: 12.5, color: C.greenDk, fontWeight: 700 }}>Paid {fjd(j.agreed_price_fjd)}</span>}
              </JobCard>
            ))}
        </div>
      )}
    </div>
  );
}

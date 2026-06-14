/**
 * AdminSponsors — manage Sponsor Corner placements (admin only).
 * Create / pause / activate / delete; see live impressions + clicks.
 * Backs the right-rail SponsorCorner on Home with real data.
 */
import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

const API = "/api/v1/community/admin/sponsors";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const blank = { sponsor_name: "", title: "", blurb: "", sponsor_logo: "", image_url: "", cta_label: "", cta_url: "", priority: 0, target_country: "", target_vertical: "", starts_at: "", ends_at: "", status: "ACTIVE" };
const inp = { width: "100%", border: "1px solid #E5DCC9", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" };

export default function AdminSponsors() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(API, { headers: authHeader() }).then((r) => r.json()).then((d) => setRows(d?.data || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!f.sponsor_name.trim() || !f.title.trim()) { toast("Sponsor name and title are required.", "error"); return; }
    setBusy(true);
    const body = { ...f };
    Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
    body.sponsor_name = f.sponsor_name; body.title = f.title;
    body.priority = Number(f.priority) || 0;
    try {
      const r = await fetch(API, { method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      toast("Placement created ✓", "success"); setF(blank); load();
    } catch { toast("Couldn't create placement", "error"); } finally { setBusy(false); }
  };

  const patch = async (id, fields) => {
    try { await fetch(`${API}/${id}`, { method: "PATCH", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(fields) }); load(); }
    catch { toast("Update failed", "error"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this placement?")) return;
    try { await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeader() }); load(); } catch { toast("Delete failed", "error"); }
  };
  const act = async (id, verb, body) => {
    try { const r = await fetch(`${API}/${id}/${verb}`, { method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); if (!r.ok) throw new Error(); load(); }
    catch { toast(`Couldn't ${verb}`, "error"); }
  };
  const approve = (id) => act(id, "approve");
  const reject = (id) => { const note = window.prompt("Reason for rejection (shown to the advertiser):"); if (note === null) return; act(id, "reject", { note }); };
  const markPaid = (id) => { const ref = window.prompt("Payment reference (invoice / M-PAiSA ref) — optional:") || ""; act(id, "mark-paid", { payment_ref: ref }); };

  // rate card
  const [rates, setRates] = useState(null);
  const loadRates = useCallback(() => { fetch(`/api/v1/community/admin/ad-rates`, { headers: authHeader() }).then((r) => r.json()).then((d) => setRates(d?.data || [])).catch(() => setRates([])); }, []);
  useEffect(() => { loadRates(); }, [loadRates]);
  const saveRate = async (id, price_fjd, active) => {
    try { await fetch(`/api/v1/community/admin/ad-rates/${id}`, { method: "PATCH", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ price_fjd: Number(price_fjd), active }) }); toast("Rate saved ✓", "success"); loadRates(); }
    catch { toast("Couldn't save rate", "error"); }
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 4px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#5C4033", marginBottom: 4 }}>Sponsor Corner</h1>
        <p style={{ fontSize: 13, color: "#8A8678", marginBottom: 18 }}>Sponsored placements shown on the Home feed right rail. Country target empty = everyone.</p>

        <div style={{ background: "#fff", border: "1px solid #E5DCC9", borderRadius: 12, padding: 16, marginBottom: 22 }}>
          <div style={{ fontWeight: 700, color: "#5C4033", marginBottom: 12 }}>New placement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input placeholder="Sponsor name *" value={f.sponsor_name} onChange={(e) => setF({ ...f, sponsor_name: e.target.value })} style={inp} />
            <input placeholder="Title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          </div>
          <textarea placeholder="Blurb" value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value })} style={{ ...inp, minHeight: 56 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input placeholder="Sponsor logo URL" value={f.sponsor_logo} onChange={(e) => setF({ ...f, sponsor_logo: e.target.value })} style={inp} />
            <input placeholder="Banner image URL" value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} style={inp} />
            <input placeholder="CTA label (e.g. Learn more)" value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} style={inp} />
            <input placeholder="CTA URL (https://…)" value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} style={inp} />
            <input placeholder="Target country (e.g. FJ) — blank = all" value={f.target_country} onChange={(e) => setF({ ...f, target_country: e.target.value })} style={inp} />
            <input type="number" placeholder="Priority (higher = first)" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} style={inp} />
            <label style={{ fontSize: 11, color: "#8A8678" }}>Starts<input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} style={inp} /></label>
            <label style={{ fontSize: 11, color: "#8A8678" }}>Ends<input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} style={inp} /></label>
          </div>
          <button onClick={create} disabled={busy} style={{ background: "#6AA84F", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating…" : "Create placement"}</button>
        </div>

        <div style={{ fontWeight: 700, color: "#5C4033", marginBottom: 10 }}>Rate card (FJD) — self-serve ad prices</div>
        <div style={{ background: "#fff", border: "1px solid #E5DCC9", borderRadius: 10, padding: "10px 14px", marginBottom: 22, display: "flex", flexWrap: "wrap", gap: 16 }}>
          {rates == null ? <span style={{ color: "#8A8678", fontSize: 13 }}>Loading…</span>
            : rates.map((rt) => (
              <div key={rt.rate_id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#8A8678", textTransform: "capitalize", minWidth: 56 }}>{rt.billing_period.toLowerCase()}</span>
                <input type="number" defaultValue={rt.price_fjd} onBlur={(e) => { if (Number(e.target.value) !== rt.price_fjd) saveRate(rt.rate_id, e.target.value, rt.active); }} style={{ width: 80, border: "1px solid #E5DCC9", borderRadius: 6, padding: "5px 8px", fontSize: 13 }} />
                <label style={{ fontSize: 11, color: "#8A8678", display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={rt.active} onChange={(e) => saveRate(rt.rate_id, rt.price_fjd, e.target.checked)} /> on</label>
              </div>
            ))}
        </div>

        <div style={{ fontWeight: 700, color: "#5C4033", marginBottom: 10 }}>Placements & ad requests</div>
        {rows == null ? <div style={{ color: "#8A8678" }}>Loading…</div>
          : rows.length === 0 ? <div style={{ color: "#8A8678", fontSize: 13 }}>No placements yet.</div>
            : rows.map((r) => {
              const selfServe = !!r.owner_user_id;
              return (
                <div key={r.placement_id} style={{ background: "#fff", border: `1px solid ${r.status === "PENDING_REVIEW" ? "#BF9000" : "#E5DCC9"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {r.sponsor_logo && <img src={r.sponsor_logo} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#5C4033", fontSize: 14 }}>{r.title} {selfServe && <span style={{ fontSize: 10, fontWeight: 700, color: "#3E7B1F", background: "#EAF5E5", borderRadius: 4, padding: "1px 6px", marginLeft: 6 }}>SELF-SERVE</span>}</div>
                    <div style={{ fontSize: 12, color: "#8A8678" }}>
                      {r.sponsor_name}{r.target_country ? ` · ${r.target_country}` : " · all"} · {r.status}{selfServe ? ` · ${(r.billing_period || "").toLowerCase()} · FJD ${r.price_fjd != null ? Number(r.price_fjd).toFixed(2) : "—"} · ${r.payment_status}` : ""} · {r.impressions} views · {r.clicks} clicks
                    </div>
                  </div>
                  {r.status === "PENDING_REVIEW" && <>
                    <button onClick={() => approve(r.placement_id)} style={{ background: "#6AA84F", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Approve</button>
                    <button onClick={() => reject(r.placement_id)} style={{ background: "transparent", border: "1px solid #BF9000", color: "#BF9000", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Reject</button>
                  </>}
                  {r.status === "PENDING_PAYMENT" && <button onClick={() => markPaid(r.placement_id)} style={{ background: "#3E7B1F", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Mark paid → activate</button>}
                  {["ACTIVE", "PAUSED", "ENDED"].includes(r.status) && (
                    <select value={r.status} onChange={(e) => patch(r.placement_id, { status: e.target.value })} style={{ border: "1px solid #E5DCC9", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="ENDED">Ended</option>
                    </select>
                  )}
                  <button onClick={() => del(r.placement_id)} style={{ background: "transparent", border: "1px solid #D4442E", color: "#D4442E", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Delete</button>
                </div>
              );
            })}
      </div>
    </AdminLayout>
  );
}

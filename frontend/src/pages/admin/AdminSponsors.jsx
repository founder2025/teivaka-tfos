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

        <div style={{ fontWeight: 700, color: "#5C4033", marginBottom: 10 }}>Placements</div>
        {rows == null ? <div style={{ color: "#8A8678" }}>Loading…</div>
          : rows.length === 0 ? <div style={{ color: "#8A8678", fontSize: 13 }}>No placements yet. Create one above — it appears in the Home Sponsor Corner immediately.</div>
            : rows.map((r) => (
              <div key={r.placement_id} style={{ background: "#fff", border: "1px solid #E5DCC9", borderRadius: 10, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                {r.sponsor_logo && <img src={r.sponsor_logo} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#5C4033", fontSize: 14 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "#8A8678" }}>{r.sponsor_name}{r.target_country ? ` · ${r.target_country}` : " · all"} · priority {r.priority} · {r.impressions} views · {r.clicks} clicks</div>
                </div>
                <select value={r.status} onChange={(e) => patch(r.placement_id, { status: e.target.value })} style={{ border: "1px solid #E5DCC9", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="ENDED">Ended</option>
                </select>
                <button onClick={() => del(r.placement_id)} style={{ background: "transparent", border: "1px solid #D4442E", color: "#D4442E", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Delete</button>
              </div>
            ))}
      </div>
    </AdminLayout>
  );
}

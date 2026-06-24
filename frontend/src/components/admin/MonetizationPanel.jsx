/**
 * MonetizationPanel — admin-editable pricing, discount codes, and referral
 * settings. All values are the live source of truth (DB, migration 170 +
 * community.affiliate_settings); editing here changes what every user sees with
 * no deploy. FOUNDER/ADMIN only (the endpoints enforce it server-side too).
 */
import { useEffect, useState } from "react";
import { getJSON, send } from "../../utils/api";
import { DollarSign, Ticket, Users, Plus, Trash2, Save } from "lucide-react";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", red: "var(--red)" };
const card = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const inp = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, width: "100%", boxSizing: "border-box", background: C.paper, color: C.soil };
const lbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, display: "block", marginBottom: 3 };
const btn = { background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

function PlanRow({ tier, plan, onSaved }) {
  const [p, setP] = useState(plan);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP((o) => ({ ...o, [k]: v }));
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      await send("PUT", `/api/v1/subscriptions/admin/plans/${tier}`, {
        name: p.name, badge: p.badge || null,
        price_fjd_monthly: num(p.price_fjd_monthly), price_fjd_annual: num(p.price_fjd_annual),
        tis_daily_limit: num(p.tis_daily_limit), farms_limit: num(p.farms_limit), users_limit: num(p.users_limit),
        is_active: p.is_active !== false,
      });
      toast(`${tier} saved ✓`, "success"); onSaved?.();
    } catch (e) { toast(e.userMessage || e.message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <strong style={{ color: C.soil, fontSize: 14 }}>{tier}</strong>
        <input value={p.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Display name" style={{ ...inp, width: 160 }} />
        <input value={p.badge || ""} onChange={(e) => set("badge", e.target.value)} placeholder="Badge (e.g. Most popular)" style={{ ...inp, width: 180 }} />
        <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
          <input type="checkbox" checked={p.is_active !== false} onChange={(e) => set("is_active", e.target.checked)} /> Active
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        <div><span style={lbl}>FJD / month</span><input type="number" value={p.price_fjd_monthly ?? ""} onChange={(e) => set("price_fjd_monthly", e.target.value)} style={inp} /></div>
        <div><span style={lbl}>FJD / year</span><input type="number" value={p.price_fjd_annual ?? ""} onChange={(e) => set("price_fjd_annual", e.target.value)} style={inp} /></div>
        <div><span style={lbl}>TIS / day</span><input type="number" value={p.tis_daily_limit ?? ""} onChange={(e) => set("tis_daily_limit", e.target.value)} style={inp} /></div>
        <div><span style={lbl}>Farms (−1=∞)</span><input type="number" value={p.farms_limit ?? ""} onChange={(e) => set("farms_limit", e.target.value)} style={inp} /></div>
        <div><span style={lbl}>Users (−1=∞)</span><input type="number" value={p.users_limit ?? ""} onChange={(e) => set("users_limit", e.target.value)} style={inp} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={save} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}><Save size={13} />{busy ? "Saving…" : "Save plan"}</button>
      </div>
    </div>
  );
}

export default function MonetizationPanel() {
  const [plans, setPlans] = useState(null);
  const [discounts, setDiscounts] = useState(null);
  const [nd, setNd] = useState({ code: "", kind: "PERCENT", value: 10, applies_to: "", max_uses: "", expires_at: "", note: "" });
  const [ref, setRef] = useState(null);

  const loadPlans = () => getJSON("/api/v1/subscriptions/admin/plans").then((r) => setPlans(r?.data || {})).catch(() => setPlans({}));
  const loadDiscounts = () => getJSON("/api/v1/subscriptions/admin/discounts").then((r) => setDiscounts(r?.data || [])).catch(() => setDiscounts([]));
  const loadRef = () => getJSON("/api/v1/affiliate/admin/overview").then((r) => setRef(r?.data?.settings || {})).catch(() => setRef({}));

  useEffect(() => { loadPlans(); loadDiscounts(); loadRef(); }, []);

  const addDiscount = async () => {
    if (!nd.code.trim()) { toast("Enter a code", "error"); return; }
    try {
      await send("POST", "/api/v1/subscriptions/admin/discounts", {
        code: nd.code.trim().toUpperCase(), kind: nd.kind, value: Number(nd.value) || 0,
        applies_to: nd.applies_to.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        max_uses: nd.max_uses === "" ? null : Number(nd.max_uses),
        expires_at: nd.expires_at || null, note: nd.note || null, is_active: true,
      });
      toast("Discount saved ✓", "success");
      setNd({ code: "", kind: "PERCENT", value: 10, applies_to: "", max_uses: "", expires_at: "", note: "" });
      loadDiscounts();
    } catch (e) { toast(e.userMessage || e.message, "error"); }
  };
  const delDiscount = async (code) => {
    try { await send("DELETE", `/api/v1/subscriptions/admin/discounts/${encodeURIComponent(code)}`); toast("Deleted", "success"); loadDiscounts(); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };
  const saveRef = async (patch) => {
    try { const r = await send("PATCH", "/api/v1/affiliate/admin/settings", patch); setRef(r?.data || ref); toast("Referral settings saved ✓", "success"); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };

  return (
    <>
      {/* ── Plan pricing ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <DollarSign size={16} style={{ color: C.greenDk }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Plan pricing & limits</strong>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
          Live source of truth — edits here change every pricing screen instantly, no deploy. Set a limit to <strong>−1</strong> for unlimited.
        </p>
        {plans == null ? <div style={{ color: C.muted }}>Loading…</div>
          : Object.keys(plans).length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No plans yet — run migration 170 on the server, then reload.</div>
          : Object.entries(plans).sort((a, b) => (a[1].sort_order ?? 0) - (b[1].sort_order ?? 0))
              .map(([tier, plan]) => <PlanRow key={tier} tier={tier} plan={plan} onSaved={loadPlans} />)}
      </div>

      {/* ── Discount codes ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ticket size={16} style={{ color: C.greenDk }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Discount codes</strong>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>Percent-off or flat FJD-off codes. Leave “applies to” blank for all plans; blank uses for unlimited.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 1fr 90px 130px auto", gap: 8, alignItems: "end", marginBottom: 12 }}>
          <div><span style={lbl}>Code</span><input value={nd.code} onChange={(e) => setNd({ ...nd, code: e.target.value })} placeholder="HARVEST25" style={inp} /></div>
          <div><span style={lbl}>Type</span>
            <select value={nd.kind} onChange={(e) => setNd({ ...nd, kind: e.target.value })} style={inp}>
              <option value="PERCENT">% off</option><option value="FLAT">FJD off</option>
            </select>
          </div>
          <div><span style={lbl}>Value</span><input type="number" value={nd.value} onChange={(e) => setNd({ ...nd, value: e.target.value })} style={inp} /></div>
          <div><span style={lbl}>Applies to (tiers)</span><input value={nd.applies_to} onChange={(e) => setNd({ ...nd, applies_to: e.target.value })} placeholder="BASIC,PROFESSIONAL" style={inp} /></div>
          <div><span style={lbl}>Max uses</span><input type="number" value={nd.max_uses} onChange={(e) => setNd({ ...nd, max_uses: e.target.value })} placeholder="∞" style={inp} /></div>
          <div><span style={lbl}>Expires</span><input type="date" value={nd.expires_at} onChange={(e) => setNd({ ...nd, expires_at: e.target.value })} style={inp} /></div>
          <button onClick={addDiscount} style={btn}><Plus size={13} />Add</button>
        </div>
        {discounts == null ? <div style={{ color: C.muted }}>Loading…</div>
          : discounts.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No discount codes yet.</div>
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead><tr>{["Code", "Type", "Value", "Applies to", "Used", "Expires", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
                <tbody>
                  {discounts.map((d) => (
                    <tr key={d.code}>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, fontWeight: 700, color: C.soil }}>{d.code}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{d.kind === "PERCENT" ? "% off" : "FJD off"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.greenDk, fontWeight: 700 }}>{d.kind === "PERCENT" ? `${d.value}%` : `$${d.value}`}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{(d.applies_to || []).length ? d.applies_to.join(", ") : "All"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{d.used_count || 0}{d.max_uses ? ` / ${d.max_uses}` : ""}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{d.expires_at ? String(d.expires_at).slice(0, 10) : "—"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>
                        <button onClick={() => delDiscount(d.code)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* ── Referral / affiliate ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Users size={16} style={{ color: C.greenDk }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Referral programme</strong>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>Commission paid to referrers and the discount the referred user gets. Applies platform-wide.</p>
        {ref == null ? <div style={{ color: C.muted }}>Loading…</div> : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ fontSize: 12.5, color: C.soil, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={ref.enabled !== false} onChange={(e) => saveRef({ enabled: e.target.checked })} /> Programme enabled
            </label>
            <div><span style={lbl}>Referrer commission %</span>
              <input type="number" defaultValue={ref.global_pct ?? 10} onBlur={(e) => saveRef({ global_pct: Number(e.target.value) })} style={{ ...inp, width: 130 }} /></div>
            <div><span style={lbl}>Referred-user discount %</span>
              <input type="number" defaultValue={ref.referred_discount_pct ?? 10} onBlur={(e) => saveRef({ referred_discount_pct: Number(e.target.value) })} style={{ ...inp, width: 150 }} /></div>
            <span style={{ fontSize: 11.5, color: C.muted }}>Changes save when you click away from the field.</span>
          </div>
        )}
      </div>
    </>
  );
}

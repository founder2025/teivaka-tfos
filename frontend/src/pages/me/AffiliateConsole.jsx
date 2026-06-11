/** AffiliateConsole — /me/affiliate/console (founder/admin). Prototype
 *  openAffiliateConsole parity, honest: real KPI totals, searchable roster
 *  with per-affiliate rate/status controls, and program settings. Charts
 *  arrive when there's data worth charting — numbers first, no decoration. */
import { useEffect, useState } from "react";
import { Shield, Search } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

const API = "/api/v1/affiliate";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function send(method, url, body) {
  const t = localStorage.getItem("tfos_access_token");
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || `Request failed (${r.status})`);
  return j;
}

const ST_COLOR = { ACTIVE: "#3E7B1F", PAUSED: "#bf9000", PENDING: "#8A8678", REJECTED: "#A32D2D" };

function Kpi({ n, label, color }) {
  return (
    <div style={{ flex: 1, minWidth: 110, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || C.soil }}>{n}</div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export default function AffiliateConsole() {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");

  const load = () => getJSON(`${API}/admin/overview`).then((r) => setData(r.data))
    .catch((e) => { if (e.status === 403) setDenied(true); setData({ totals: {}, roster: [], settings: {} }); });
  useEffect(() => { load(); }, []);

  const setRate = async (a) => {
    const v = window.prompt(`Override rate %% for ${a.full_name} (blank = use global ${data?.settings?.global_pct}%)`, a.override_pct ?? "");
    if (v === null) return;
    try {
      await send("PATCH", `${API}/admin/${a.user_id}/rate`, { override_pct: v.trim() === "" ? null : Number(v) });
      toast("Rate updated ✓", "success"); load();
    } catch (e) { toast(String(e.message || e), "error"); }
  };
  const setStatus = async (a, st) => {
    try { await send("PATCH", `${API}/admin/${a.user_id}/status`, { status: st }); toast(`${a.full_name}: ${st.toLowerCase()} ✓`, "success"); load(); }
    catch (e) { toast(String(e.message || e), "error"); }
  };
  const saveSettings = async (patch) => {
    try { const r = await send("PATCH", `${API}/admin/settings`, patch); setData((d) => ({ ...d, settings: r.data })); toast("Program settings saved ✓", "success"); }
    catch (e) { toast(String(e.message || e), "error"); }
  };

  if (denied) return <MeShell title="Affiliate console" subtitle="Founder only"><div style={{ ...card, color: C.muted }}>The console is for the founder account.</div></MeShell>;
  if (data == null) return <MeShell title="Affiliate console" subtitle="Loading…"><div style={card}>Loading…</div></MeShell>;

  const t = data.totals || {};
  const roster = (data.roster || []).filter((a) => !q.trim() || `${a.full_name} ${a.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const s = data.settings || {};
  const fjd = (n) => `FJD ${Number(n || 0).toFixed(2)}`;

  return (
    <MeShell title="Affiliate console" subtitle="Founder only — the whole program at a glance.">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <Kpi n={t.affiliates ?? 0} label="Affiliates" />
        <Kpi n={t.active ?? 0} label="Active" />
        <Kpi n={t.signups ?? 0} label="Sign-ups" />
        <Kpi n={t.conversions ?? 0} label="Subscribed" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Kpi n={fjd(t.accrued_fjd)} label="Commission accrued" color={C.greenDk} />
        <Kpi n={fjd(t.paid_fjd)} label="Paid out" />
        <Kpi n={fjd(t.outstanding_fjd)} label="Outstanding" color="#bf9000" />
        <Kpi n={fjd(t.revenue_fjd)} label="Revenue driven" color={C.greenDk} />
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px" }}>
          <Search size={14} style={{ color: C.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search affiliates by name or code"
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: C.soil }} />
        </div>
        {!roster.length ? <div style={{ color: C.muted, fontSize: 13 }}>No affiliates{q ? " match" : " yet — they enroll from /me/affiliate"}.</div>
          : roster.map((a) => (
            <div key={a.user_id} style={{ borderBottom: `1px solid ${C.line}`, padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <span style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{a.full_name}</span>
                  <span style={{ fontSize: 11.5, color: C.muted, fontFamily: "ui-monospace, Menlo, monospace" }}> · {a.code}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: ST_COLOR[a.status] || C.muted, borderRadius: 999, padding: "3px 9px" }}>{a.status}</span>
                <span style={{ fontSize: 12, color: C.soil }}>{a.effective_pct}%{a.override_pct != null ? " (set)" : ""}</span>
                <span style={{ fontSize: 12, color: C.soil }}>{a.conversions} subscribed</span>
                <strong style={{ color: C.greenDk, fontSize: 12.5 }}>{fjd(a.earned_fjd)}</strong>
                <span style={{ color: "#bf9000", fontSize: 12.5 }}>{fjd(a.outstanding_fjd)} owed</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setRate(a)}>Set rate</button>
                {a.status === "ACTIVE"
                  ? <button className="btn btn-sm btn-secondary" style={{ color: "#bf9000" }} onClick={() => setStatus(a, "PAUSED")}>Pause</button>
                  : <button className="btn btn-sm btn-secondary" style={{ color: C.greenDk }} onClick={() => setStatus(a, "ACTIVE")}>Activate</button>}
              </div>
            </div>
          ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Shield size={15} style={{ color: "#bf9000" }} />
          <strong style={{ color: C.soil, fontSize: 14 }}>Program settings</strong>
          <span style={{ fontSize: 11, color: C.muted }}>· founder only</span>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, cursor: "pointer", fontSize: 13.5, color: C.soil }}>
          <input type="checkbox" checked={Boolean(s.enabled)} onChange={(e) => saveSettings({ enabled: e.target.checked })} style={{ width: 17, height: 17 }} />
          Program enabled (off = enrolment and accrual pause)
        </label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13.5, color: C.soil }}>
          <span>Global rate
            <input type="number" min="0" max="100" defaultValue={s.global_pct} onBlur={(e) => Number(e.target.value) !== s.global_pct && saveSettings({ global_pct: Number(e.target.value) })}
              style={{ width: 64, marginLeft: 6, border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 8px" }} />%
          </span>
          <span>Referred discount
            <input type="number" min="0" max="100" defaultValue={s.referred_discount_pct} onBlur={(e) => Number(e.target.value) !== s.referred_discount_pct && saveSettings({ referred_discount_pct: Number(e.target.value) })}
              style={{ width: 64, marginLeft: 6, border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 8px" }} />%
          </span>
          <span>Basis
            <select value={s.basis || "ONE_OFF"} onChange={(e) => saveSettings({ basis: e.target.value })} style={{ marginLeft: 6, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 8px" }}>
              <option value="ONE_OFF">One-off</option><option value="RECURRING">Recurring</option>
            </select>
          </span>
          <span>Payout
            <select value={s.payout_mode || "CREDIT"} onChange={(e) => saveSettings({ payout_mode: e.target.value })} style={{ marginLeft: 6, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 8px" }}>
              <option value="CREDIT">Credit</option><option value="CASH">Cash</option>
            </select>
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10, marginBottom: 0 }}>
          Commissions accrue automatically when you approve a referred member's paid tier change. Payouts open with the payment rail.
        </p>
      </div>
    </MeShell>
  );
}

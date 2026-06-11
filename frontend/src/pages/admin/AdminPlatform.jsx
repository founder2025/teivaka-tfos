/**
 * AdminPlatform — /admin/platform. Platform controls: per-pillar feature
 * flags (kill switches, audit-stamped), admin grant/revoke (hash-chained),
 * and quick links to every settings surface.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Link } from "react-router-dom";
import { Shield, Power } from "lucide-react";
import { getJSON, send } from "../../utils/api";

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E6E1D6", muted: "#8A8678", cream: "#F8F3E9", red: "#A32D2D" };
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

export default function AdminPlatform() {
  const [flags, setFlags] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [email, setEmail] = useState("");

  const load = () => {
    getJSON("/api/v1/admin/platform/flags").then((r) => setFlags(r.data || [])).catch(() => setFlags([]));
    getJSON("/api/v1/admin/platform/admins").then((r) => setAdmins(r.data || [])).catch(() => setAdmins([]));
  };
  useEffect(() => { load(); }, []);

  const flip = async (f) => {
    if (f.enabled && !window.confirm(`Turn OFF "${f.flag}" for every user? The pillar shows a maintenance notice until re-enabled.`)) return;
    try { await send("PATCH", "/api/v1/admin/platform/flags", { flag: f.flag, enabled: !f.enabled }); toast(`${f.flag}: ${!f.enabled ? "ON" : "OFF"}`, "success"); load(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  const grant = async (enabled, em) => {
    try { await send("PATCH", "/api/v1/admin/platform/admins", { user_email: em, enabled }); toast(enabled ? "Admin access granted — hash-chained ✓" : "Admin access revoked", "success"); setEmail(""); load(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };

  return (
    <AdminLayout>
      <h1 style={{ margin: "0 0 14px", fontSize: 22, color: C.soil }}>Platform controls</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <Power size={16} style={{ color: C.red }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Feature flags — pillar kill switches</strong>
        </div>
        {flags == null ? <div style={{ color: C.muted }}>Loading…</div>
          : flags.map((f) => (
            <div key={f.flag} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5, fontFamily: "ui-monospace, Menlo, monospace" }}>{f.flag}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{f.note}</div>
              </div>
              <button onClick={() => flip(f)}
                style={{ width: 50, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: f.enabled ? C.green : C.line }}>
                <span style={{ position: "absolute", top: 3, left: f.enabled ? 27 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
              </button>
            </div>
          ))}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10, marginBottom: 0 }}>
          A disabled pillar shows users an honest "temporarily unavailable" notice. Gating today covers the Home and Classroom surfaces; remaining pillar enforcement is tracked work.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <Shield size={16} style={{ color: "#BF9000" }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Admin access — trusted figures</strong>
        </div>
        {admins == null ? <div style={{ color: C.muted }}>Loading…</div>
          : admins.map((a) => (
            <div key={a.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{a.full_name}</span>
                <span style={{ fontSize: 12, color: C.muted }}> · {a.email} · {a.role}</span>
              </div>
              {a.role === "ADMIN" && (
                <button onClick={() => grant(false, a.email)} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.red, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Revoke</button>
              )}
            </div>
          ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={email} placeholder="Trusted member's email" onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1, minWidth: 200, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13.5 }} />
          <button onClick={() => email.trim() && grant(true, email.trim())}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Grant admin</button>
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, marginBottom: 0 }}>Every grant and revoke is hash-chained into audit.events. The founder role itself is never changed from here.</p>
      </div>

      <div style={card}>
        <strong style={{ color: C.soil, fontSize: 15 }}>All settings surfaces</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {[["/admin/classroom", "Classroom settings"], ["/me/affiliate/console", "Affiliate program"], ["/admin/requests", "Tier requests"], ["/admin/settings", "Platform settings"], ["/admin/task-engine", "Task engine"]].map(([to, label]) => (
            <Link key={to} to={to} style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.soil, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>{label}</Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

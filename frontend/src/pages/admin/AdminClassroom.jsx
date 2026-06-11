/**
 * AdminClassroom — /admin/classroom. The Classroom control panel:
 * "Teach on Teivaka" application queue (approve/reject), current authors
 * (revoke), platform settings (applications open, monetization on/off,
 * payment instructions shown on locked masterclasses), and the manual
 * access-grant tool — the working payment path until Stripe/M-PAiSA lands.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getJSON, send } from "../../utils/api";
import Avatar from "../../components/ui/Avatar";

const API = "/api/v1/classroom";
const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E6E1D6", muted: "#8A8678", red: "#A32D2D" };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 };
const h2 = { fontSize: 15, fontWeight: 700, color: C.soil, marginBottom: 12 };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };

function Queue() {
  const [rows, setRows] = useState(null);
  const [reason, setReason] = useState({});
  const load = () => getJSON(`${API}/admin/author-requests?status=PENDING`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const decide = async (rid, action) => {
    try {
      await send("POST", `${API}/admin/author-requests/${rid}/${action}`, action === "reject" ? { reason: reason[rid] || "" } : undefined);
      toast(action === "approve" ? "Author approved — they can build courses now ✓" : "Application rejected", "success");
      load();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Teach on Teivaka — applications {rows ? `(${rows.length})` : ""}</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No pending applications.</div>
        : rows.map((r) => (
          <div key={r.request_id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <Avatar src={r.avatar_url} name={r.full_name} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{r.full_name} {r.kyc_verified ? "✅" : "⚠️ no green tick"}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{r.email} · {r.profession || "member"} · applied {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.soil, marginBottom: 4 }}><strong>Expertise:</strong> {r.expertise}</div>
            {r.credentials && <div style={{ fontSize: 13, color: C.soil, marginBottom: 4 }}><strong>Credentials:</strong> {r.credentials}</div>}
            {r.topics && <div style={{ fontSize: 13, color: C.soil, marginBottom: 8 }}><strong>Would teach:</strong> {r.topics}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-sm btn-primary" onClick={() => decide(r.request_id, "approve")}>Approve</button>
              <input value={reason[r.request_id] || ""} placeholder="Rejection reason (sent to applicant)" onChange={(e) => setReason({ ...reason, [r.request_id]: e.target.value })}
                style={{ ...inp, flex: 1, minWidth: 180, marginBottom: 0, width: "auto" }} />
              <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => decide(r.request_id, "reject")}>Reject</button>
            </div>
          </div>
        ))}
    </div>
  );
}

function Authors() {
  const [rows, setRows] = useState(null);
  const load = () => getJSON(`${API}/admin/authors`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const revoke = async (u) => {
    if (!window.confirm(`Revoke authoring for ${u.full_name}? Their existing courses stay live.`)) return;
    try { await send("PATCH", `${API}/admin/users/${u.user_id}/course-author?enabled=false`); toast("Authoring revoked", "success"); load(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Current authors {rows ? `(${rows.length})` : ""}</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No partner authors yet — admins can always build.</div>
        : rows.map((a) => (
          <div key={a.user_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{a.full_name}</span>
              <span style={{ fontSize: 12, color: C.muted }}> · {a.email} · {a.course_count} course{a.course_count === 1 ? "" : "s"}</span>
            </div>
            <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => revoke(a)}>Revoke</button>
          </div>
        ))}
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { getJSON(`${API}/settings`).then((r) => setS(r.data)).catch(() => setS(null)); }, []);
  const save = async (patch) => {
    try { const r = await send("PATCH", `${API}/admin/settings`, patch); setS(r.data); toast("Settings saved ✓", "success"); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  if (!s) return <div style={card}><div style={h2}>Classroom settings</div><div style={{ color: C.muted }}>Loading…</div></div>;
  const Toggle = ({ field, label, hint }) => (
    <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={Boolean(s[field])} onChange={(e) => save({ [field]: e.target.checked })} style={{ width: 18, height: 18 }} />
      <span>
        <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: C.muted }}>{hint}</span>
      </span>
    </label>
  );
  return (
    <div style={card}>
      <div style={h2}>Classroom settings</div>
      <Toggle field="applications_open" label="Author applications open" hint="Members with the green tick can apply to teach. Off = the Apply card disappears." />
      <Toggle field="monetization_enabled" label="Monetization enabled" hint="Off = every course opens free regardless of pricing (useful for launch promos)." />
      <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5, marginBottom: 4 }}>Payment instructions (shown on locked masterclasses)</div>
      <textarea defaultValue={s.payment_instructions} style={{ ...inp, minHeight: 80 }} id="pay-instr" />
      <button className="btn btn-sm btn-primary" onClick={() => save({ payment_instructions: document.getElementById("pay-instr").value })}>Save instructions</button>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
        No payment processor is wired yet (Stripe/M-PAiSA pending) — these instructions plus the grant tool below are the honest path. Entitlements are PSP-ready.
      </div>
    </div>
  );
}

function GrantTool() {
  const [courses, setCourses] = useState([]);
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState("");
  useEffect(() => { getJSON(`${API}/courses`).then((r) => setCourses((r.data || []).filter((c) => (c.pricing || "FREE") !== "FREE"))).catch(() => {}); }, []);
  const grant = async () => {
    if (!email.trim() || !courseId) { toast("Email and course are both required", "error"); return; }
    try {
      await send("POST", `${API}/admin/entitlements`, { user_email: email.trim(), course_id: courseId });
      toast("Access granted — the learner has been notified ✓", "success");
      setEmail("");
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Grant masterclass access</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>After a payment lands (M-PAiSA receipt, bank transfer), unlock the course here.</div>
      <input style={inp} value={email} placeholder="Learner's email" onChange={(e) => setEmail(e.target.value)} />
      <select style={inp} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        <option value="">Pick a paid course…</option>
        {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.title} ({c.pricing === "ONE_TIME" ? `FJD ${c.price_fjd || "?"}` : c.required_tier})</option>)}
      </select>
      <button className="btn btn-sm btn-primary" onClick={grant}>Grant access</button>
    </div>
  );
}

export default function AdminClassroom() {
  return (
    <AdminLayout>
      <Queue />
      <Authors />
      <Settings />
      <GrantTool />
    </AdminLayout>
  );
}

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
const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", red: "var(--red)" };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 };
const h2 = { fontSize: 15, fontWeight: 700, color: C.soil, marginBottom: 12 };
const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };

function StatusTabs({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {["PENDING", "APPROVED", "REJECTED"].map((s) => (
        <button key={s} onClick={() => onChange(s)}
          style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${value === s ? C.greenDk : C.line}`, background: value === s ? C.green : "var(--paper)", color: value === s ? "var(--paper)" : C.muted }}>
          {s}
        </button>
      ))}
    </div>
  );
}

function Queue() {
  const [rows, setRows] = useState(null);
  const [reason, setReason] = useState({});
  const [status, setStatus] = useState("PENDING");
  const load = () => getJSON(`${API}/admin/author-requests?status=${status}`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  /* eslint-disable-next-line */
  useEffect(() => { setRows(null); load(); }, [status]);
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
      <StatusTabs value={status} onChange={setStatus} />
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No {status.toLowerCase()} applications.</div>
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
            {status === "PENDING" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-sm btn-primary" onClick={() => decide(r.request_id, "approve")}>Approve</button>
                <input value={reason[r.request_id] || ""} placeholder="Rejection reason (sent to applicant)" onChange={(e) => setReason({ ...reason, [r.request_id]: e.target.value })}
                  style={{ ...inp, flex: 1, minWidth: 180, marginBottom: 0, width: "auto" }} />
                <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => decide(r.request_id, "reject")}>Reject</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.muted }}>Decided {r.decided_at ? new Date(r.decided_at).toLocaleDateString() : ""}{r.reason ? ` · reason: ${r.reason}` : ""}</div>
            )}
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

function LibraryQueue() {
  const [rows, setRows] = useState(null);
  const [reason, setReason] = useState({});
  const [open, setOpen] = useState(null);
  const load = () => getJSON(`${API}/admin/library-submissions?status=PENDING`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const decide = async (sid, action) => {
    try {
      await send("POST", `${API}/admin/library-submissions/${sid}/${action}`, action === "reject" ? { reason: reason[sid] || "" } : undefined);
      toast(action === "approve" ? "Guide is live in the Library ✓" : "Guide rejected", "success");
      load();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Library — field-guide submissions {rows ? `(${rows.length})` : ""}</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No guides waiting for review.</div>
        : rows.map((s) => (
          <div key={s.submission_id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{s.title} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>· {s.category} · by {s.full_name}</span></div>
            {s.summary && <div style={{ fontSize: 12.5, color: C.muted, margin: "3px 0" }}>{s.summary}</div>}
            <button className="btn btn-sm btn-secondary" style={{ margin: "6px 0" }} onClick={() => setOpen(open === s.submission_id ? null : s.submission_id)}>
              {open === s.submission_id ? "Hide content" : "Read full guide"}
            </button>
            {open === s.submission_id && <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: C.soil, background: "#fafaf6", border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>{s.content_md}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-sm btn-primary" onClick={() => decide(s.submission_id, "approve")}>Approve — publish to Library</button>
              <input value={reason[s.submission_id] || ""} placeholder="Rejection reason (sent to author)" onChange={(e) => setReason({ ...reason, [s.submission_id]: e.target.value })}
                style={{ ...inp, flex: 1, minWidth: 180, marginBottom: 0, width: "auto" }} />
              <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => decide(s.submission_id, "reject")}>Reject</button>
            </div>
          </div>
        ))}
    </div>
  );
}

function Entitlements() {
  const [rows, setRows] = useState(null);
  const load = () => getJSON(`${API}/admin/entitlements`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const revoke = async (e) => {
    if (!window.confirm(`Revoke ${e.full_name}'s access to "${e.course_title}"?`)) return;
    try { await send("DELETE", `${API}/admin/entitlements/${e.course_id}/${e.user_id}`); toast("Access revoked", "success"); load(); }
    catch (err) { toast(`${err.userMessage || err.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Masterclass access — who has what {rows ? `(${rows.length})` : ""}</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No granted entitlements yet.</div>
        : rows.map((e) => (
          <div key={`${e.course_id}-${e.user_id}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{e.full_name}</span>
              <span style={{ fontSize: 12, color: C.muted }}> · {e.email} → <strong>{e.course_title}</strong> · {e.source} · {new Date(e.created_at).toLocaleDateString()}</span>
            </div>
            <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => revoke(e)}>Revoke</button>
          </div>
        ))}
    </div>
  );
}

function ReviewModeration() {
  const [rows, setRows] = useState(null);
  const load = () => getJSON(`${API}/admin/ratings`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.full_name}'s review on "${r.course_title}"?`)) return;
    try { await send("DELETE", `${API}/admin/ratings/${r.course_id}/${r.user_id}`); toast("Review deleted", "success"); load(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Course reviews — moderation {rows ? `(${rows.length})` : ""}</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No reviews yet.</div>
        : rows.map((r) => (
          <div key={`${r.course_id}-${r.user_id}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)} {r.full_name}</span>
              <span style={{ fontSize: 12, color: C.muted }}> on {r.course_title} · {new Date(r.created_at).toLocaleDateString()}</span>
              {r.review && <div style={{ fontSize: 12.5, color: C.soil, marginTop: 2 }}>{r.review}</div>}
            </div>
            <button className="btn btn-sm btn-secondary" style={{ color: C.red }} onClick={() => remove(r)}>Delete</button>
          </div>
        ))}
    </div>
  );
}

function FeaturePins() {
  const [rows, setRows] = useState(null);
  const load = () => getJSON(`${API}/courses`).then((r) => setRows((r.data || []).filter((c) => c.status === "PUBLISHED"))).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const toggle = async (c) => {
    try { await send("PATCH", `${API}/courses/${c.course_id}`, { featured: !c.featured }); toast(!c.featured ? "Featured — pinned first on the Classroom ✓" : "Unpinned", "success"); load(); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div style={card}>
      <div style={h2}>Featured courses — pinned first on the Classroom</div>
      {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No published courses yet.</div>
        : rows.map((c) => (
          <label key={c.course_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
            <input type="checkbox" checked={Boolean(c.featured)} onChange={() => toggle(c)} style={{ width: 17, height: 17 }} />
            <span style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{c.title}</span>
            <span style={{ fontSize: 12, color: C.muted }}>· {c.author_name || "—"} · {c.learners_count || 0} learning</span>
          </label>
        ))}
    </div>
  );
}

export default function AdminClassroom() {
  return (
    <AdminLayout>
      <Queue />
      <LibraryQueue />
      <Authors />
      <FeaturePins />
      <Entitlements />
      <ReviewModeration />
      <Settings />
      <GrantTool />
    </AdminLayout>
  );
}

/** AdminRequests — /admin/requests. Tier change queue: approve (applies the
 *  REAL tenant tier after out-of-band payment) or reject with a reason. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getJSON, send } from "../../utils/api";

const C = { soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", line: "#E6E1D6", muted: "#8A8678", red: "#A32D2D" };
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

export default function AdminRequests() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("PENDING");
  const [reason, setReason] = useState({});
  const load = () => getJSON(`/api/v1/subscriptions/admin/requests?status_filter=${status}`).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  /* eslint-disable-next-line */
  useEffect(() => { setRows(null); load(); }, [status]);
  const decide = async (rid, action) => {
    try {
      await send("POST", `/api/v1/subscriptions/admin/requests/${rid}/${action}`, action === "reject" ? { reason: reason[rid] || "" } : undefined);
      toast(action === "approve" ? "Approved — tier applied for real ✓" : "Rejected", "success"); load();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <AdminLayout>
      <h1 style={{ margin: "0 0 14px", fontSize: 22, color: C.soil }}>Tier change requests</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${status === s ? C.greenDk : C.line}`, background: status === s ? C.green : "#fff", color: status === s ? "#fff" : C.muted }}>{s}</button>
        ))}
      </div>
      <div style={card}>
        {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
          : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13.5 }}>No {status.toLowerCase()} requests.</div>
          : rows.map((r) => (
            <div key={r.request_id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{r.full_name} <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>· {r.email}</span></div>
              <div style={{ fontSize: 12.5, color: C.soil, margin: "3px 0 8px" }}>
                {r.current_tier} → <strong>{r.target_tier}</strong> · {r.billing_period} · {r.payment_method} · {new Date(r.created_at).toLocaleString()}
                {r.notes ? ` · "${r.notes}"` : ""}{r.reason ? ` · reason: ${r.reason}` : ""}
              </div>
              {status === "PENDING" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={() => decide(r.request_id, "approve")} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Approve — payment confirmed</button>
                  <input value={reason[r.request_id] || ""} placeholder="Rejection reason (sent to the member)" onChange={(e) => setReason({ ...reason, [r.request_id]: e.target.value })}
                    style={{ flex: 1, minWidth: 180, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 11px", fontSize: 12.5 }} />
                  <button onClick={() => decide(r.request_id, "reject")} style={{ background: "#fff", color: C.red, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>Reject</button>
                </div>
              )}
            </div>
          ))}
      </div>
    </AdminLayout>
  );
}

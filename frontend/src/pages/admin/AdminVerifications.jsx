/**
 * AdminVerifications — /admin/verifications. KYC review queue: view the
 * (private, admin-gated) ID + selfie, approve -> green tick, or reject with a
 * note. Files are fetched with the auth header (blob -> objectURL) because
 * <img> can't send Authorization.
 */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { getJSON, send, apiFetch } from "../../utils/api";
import Avatar from "../../components/ui/Avatar";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", red: "var(--red)" };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

function Docs({ rid }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let revoke = [];
    (async () => {
      for (const kind of ["id", "selfie"]) {
        try {
          const r = await apiFetch(`/api/v1/admin/verifications/${rid}/file/${kind}`);
          if (!r.ok) continue;
          const u = URL.createObjectURL(await r.blob());
          revoke.push(u);
          setUrls((m) => ({ ...m, [kind]: u }));
        } catch { /* shown as missing */ }
      }
    })();
    return () => revoke.forEach((u) => URL.revokeObjectURL(u));
  }, [rid]);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
      {["id", "selfie"].map((k) => (
        <div key={k} style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>{k === "id" ? "Government ID" : "Selfie"}</div>
          {urls[k]
            ? <a href={urls[k]} target="_blank" rel="noreferrer"><img src={urls[k]} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fafafa" }} /></a>
            : <div style={{ padding: 20, fontSize: 12, color: C.muted, border: `1px dashed ${C.line}`, borderRadius: 8, textAlign: "center" }}>Loading / unavailable</div>}
        </div>
      ))}
    </div>
  );
}

export default function AdminVerifications() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("PENDING");
  const [open, setOpen] = useState(null);   // request_id with docs expanded
  const [busy, setBusy] = useState(null);
  const load = () => getJSON(`/api/v1/admin/verifications?status_filter=${filter}`).then((r) => setRows(r.data || [])).catch((e) => { setRows([]); toast(e.userMessage || e.message, "error"); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const review = async (rid, action) => {
    let note = null;
    if (action === "reject") {
      note = window.prompt("Reason shown to the user (e.g. 'ID photo unreadable — please retake'):");
      if (note == null) return;
    }
    setBusy(rid);
    try {
      await send("POST", `/api/v1/admin/verifications/${rid}/${action}`, { note });
      toast(action === "approve" ? "Approved ✓ — green tick granted" : "Rejected — user notified on next visit", "success");
      load();
    } catch (e) { toast(`Couldn't ${action}: ${e.userMessage || e.message}`, "error"); }
    finally { setBusy(null); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: 20, maxWidth: 860 }}>
        <h1 style={{ margin: "0 0 4px", color: C.soil, fontSize: 22 }}>Verification queue</h1>
        <p style={{ margin: "0 0 14px", color: C.muted, fontSize: 13.5 }}>KYC review — approve grants the Teivaka green tick platform-wide.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["PENDING", "APPROVED", "REJECTED", "ALL"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === f ? C.greenDk : C.line}`, background: filter === f ? C.green : "var(--paper)", color: filter === f ? "var(--paper)" : C.soil }}>{f}</button>
          ))}
        </div>
        {rows == null ? <div style={{ color: C.muted }}>Loading…</div>
          : rows.length === 0 ? <div style={{ color: C.muted, padding: 16, background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 10 }}>No {filter.toLowerCase()} requests.</div>
          : rows.map((r) => (
            <div key={r.request_id} style={{ background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Avatar src={r.avatar_url} name={r.full_name} size={36} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, color: C.soil, fontSize: 14 }}>{r.full_name}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{r.email} · {r.country || "—"} · {(r.account_type || "").toLowerCase()} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: r.status === "PENDING" ? "rgba(191,144,0,.15)" : r.status === "APPROVED" ? "rgba(106,168,79,.15)" : "rgba(163,45,45,.12)", color: r.status === "PENDING" ? "var(--amber)" : r.status === "APPROVED" ? C.greenDk : C.red }}>{r.status}</span>
                <button onClick={() => setOpen(open === r.request_id ? null : r.request_id)} style={{ border: `1px solid ${C.line}`, background: "var(--paper)", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" }}>{open === r.request_id ? "Hide documents" : "View documents"}</button>
              </div>
              {open === r.request_id && <Docs rid={r.request_id} />}
              {r.note && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Note: {r.note}</div>}
              {r.status === "PENDING" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button disabled={busy === r.request_id} onClick={() => review(r.request_id, "approve")} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Approve — grant green tick</button>
                  <button disabled={busy === r.request_id} onClick={() => review(r.request_id, "reject")} style={{ background: "var(--paper)", color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reject…</button>
                </div>
              )}
            </div>
          ))}
      </div>
    </AdminLayout>
  );
}

/**
 * AdminBilling — turn accrued platform fees into collectible invoices (admin only).
 * Outstanding charges per account (marketplace fees + unpaid sponsorships) →
 * generate an invoice → send → mark paid (flips the source rows) / void (releases).
 */
import { useState, useEffect, useCallback, Fragment } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";
import { formatMoney } from "../../utils/money";

const API = "/api/v1/admin/billing";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const fjd = (v) => formatMoney(v);

const STATUS_COLOR = { DRAFT: "#9a8c6a", SENT: "#2563eb", PAID: "var(--green-dk)", VOID: "#b91c1c" };
const btn = { padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--soil)" };
const cell = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "left" };

async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method, headers: { ...authHeader(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || "Request failed");
  return d;
}

export default function AdminBilling() {
  const [outstanding, setOutstanding] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [expanded, setExpanded] = useState(null);   // invoice_id -> lines
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/outstanding`, { headers: authHeader() }).then((r) => r.json()).then((d) => setOutstanding(d?.data || [])).catch(() => setOutstanding([]));
    fetch(`${API}/invoices`, { headers: authHeader() }).then((r) => r.json()).then((d) => setInvoices(d?.data || [])).catch(() => setInvoices([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async (acct) => {
    if (!window.confirm(`Generate an invoice for ${acct.account_label || acct.tenant_id} — ${fjd(acct.total_fjd)}?`)) return;
    setBusy(true);
    try { const d = await call("POST", "/invoices/generate", { tenant_id: acct.tenant_id }); toast(`Invoice ${d.data.invoice_id} created (${fjd(d.data.total_fjd)})`, "success"); load(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const setEmail = async (acct) => {
    const v = window.prompt(`Billing email for ${acct.account_label || "this account"} (blank = use owner: ${acct.effective_email || "none on file"})`, acct.billing_email_override || "");
    if (v === null) return;
    try { await call("PUT", `/accounts/${acct.tenant_id}/email`, { email: v || null }); toast("Billing email updated ✓", "success"); load(); }
    catch (e) { toast(e.message, "error"); }
  };
  const action = async (inv, verb, payload) => {
    setBusy(true);
    try { await call("POST", `/invoices/${inv.invoice_id}/${verb}`, payload); toast(`${inv.invoice_id} → ${verb}`, "success"); load(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const pay = (inv) => { const ref = window.prompt("Payment reference (M-PAiSA / bank ref, optional)", ""); if (ref === null) return; action(inv, "pay", { payment_ref: ref || null }); };
  const sendInvoice = async (inv) => {
    setBusy(true);
    try {
      const { data: r } = await call("POST", `/invoices/${inv.invoice_id}/send`, {});
      toast(r.emailed ? `Sent ✓ — emailed to ${r.email_to}` : `Marked SENT — email not delivered (${r.reason || "unknown"})`, r.emailed ? "success" : "error");
      load();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const pdf = async (inv) => {
    try {
      const r = await fetch(`${API}/invoices/${inv.invoice_id}/pdf`, { headers: authHeader() });
      if (!r.ok) throw new Error("Couldn't load PDF");
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, "error"); }
  };
  const toggle = async (inv) => {
    if (expanded?.id === inv.invoice_id) { setExpanded(null); return; }
    try { const d = await call("GET", `/invoices/${inv.invoice_id}`); setExpanded({ id: inv.invoice_id, lines: d.data.lines }); }
    catch (e) { toast(e.message, "error"); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: 20, maxWidth: 1100 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--soil)", marginBottom: 4 }}>Billing & Invoices</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>Roll up accrued marketplace fees + unpaid sponsorships into collectible invoices.</p>

        {/* Outstanding */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--soil)", margin: "8px 0 8px" }}>Outstanding by account</h2>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 26 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--cream)" }}>
              <th style={cell}>Account</th><th style={cell}>Marketplace</th><th style={cell}>Sponsorships</th><th style={cell}>Total</th><th style={cell}>Billing email</th><th style={cell}></th>
            </tr></thead>
            <tbody>
              {outstanding === null && <tr><td style={cell} colSpan={6}>Loading…</td></tr>}
              {outstanding?.length === 0 && <tr><td style={cell} colSpan={6}>No outstanding charges — all caught up.</td></tr>}
              {outstanding?.map((a) => (
                <tr key={a.tenant_id}>
                  <td style={cell}>{a.account_label || a.tenant_id.slice(0, 8)}</td>
                  <td style={cell}>{fjd(a.marketplace_fjd)} <span style={{ color: "var(--muted)", fontSize: 11 }}>({a.fee_count})</span></td>
                  <td style={cell}>{fjd(a.sponsor_fjd)} <span style={{ color: "var(--muted)", fontSize: 11 }}>({a.sponsor_count})</span></td>
                  <td style={{ ...cell, fontWeight: 700 }}>{fjd(a.total_fjd)}</td>
                  <td style={cell}>
                    <span style={{ color: a.effective_email ? "var(--soil)" : "#b91c1c", fontSize: 12 }}>{a.effective_email || "none on file"}</span>
                    {a.billing_email_override && <span title="custom billing email" style={{ color: "var(--green-dk)", fontSize: 10, marginLeft: 4 }}>•custom</span>}
                    <button style={{ ...btn, padding: "2px 7px", marginLeft: 6, fontSize: 11 }} onClick={() => setEmail(a)}>Edit</button>
                  </td>
                  <td style={cell}><button disabled={busy} style={{ ...btn, borderColor: "var(--green-dk)", color: "var(--green-dk)" }} onClick={() => generate(a)}>Generate invoice</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invoices */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--soil)", margin: "8px 0 8px" }}>Invoices</h2>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--cream)" }}>
              <th style={cell}>Invoice</th><th style={cell}>Account</th><th style={cell}>Total</th><th style={cell}>Status</th><th style={cell}>Due</th><th style={cell}>Actions</th>
            </tr></thead>
            <tbody>
              {invoices === null && <tr><td style={cell} colSpan={6}>Loading…</td></tr>}
              {invoices?.length === 0 && <tr><td style={cell} colSpan={6}>No invoices yet.</td></tr>}
              {invoices?.map((inv) => (
                <Fragment key={inv.invoice_id}>
                  <tr>
                    <td style={{ ...cell, cursor: "pointer", fontWeight: 600 }} onClick={() => toggle(inv)}>{inv.invoice_id}</td>
                    <td style={cell}>{inv.account_label || String(inv.tenant_id).slice(0, 8)}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{fjd(inv.total_fjd)}</td>
                    <td style={{ ...cell, color: STATUS_COLOR[inv.status], fontWeight: 700 }}>{inv.status}</td>
                    <td style={cell}>{inv.due_date || "—"}</td>
                    <td style={cell}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={btn} onClick={() => pdf(inv)}>PDF</button>
                        {inv.status === "DRAFT" && <button disabled={busy} style={btn} onClick={() => sendInvoice(inv)}>Send</button>}
                        {["DRAFT", "SENT"].includes(inv.status) && <button disabled={busy} style={{ ...btn, borderColor: "var(--green-dk)", color: "var(--green-dk)" }} onClick={() => pay(inv)}>Mark paid</button>}
                        {inv.status !== "PAID" && inv.status !== "VOID" && <button disabled={busy} style={{ ...btn, color: "#b91c1c" }} onClick={() => { if (window.confirm("Void this invoice? Charges return to outstanding.")) action(inv, "void"); }}>Void</button>}
                      </div>
                    </td>
                  </tr>
                  {expanded?.id === inv.invoice_id && (
                    <tr>
                      <td style={{ ...cell, background: "var(--cream)" }} colSpan={6}>
                        {expanded.lines.map((l, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
                            <span style={{ color: "var(--soil)" }}>{l.description}</span><span style={{ fontWeight: 600 }}>{fjd(l.amount_fjd)}</span>
                          </div>
                        ))}
                        {inv.payment_ref && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Paid ref: {inv.payment_ref}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

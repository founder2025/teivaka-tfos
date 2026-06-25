/**
 * Payments.jsx — /farm/payments — Phase 0 non-custodial payments cockpit.
 *
 * Capture what you owe (inputs, labour) and what you're owed, generate a manual
 * payment instruction (reference), and confirm it once paid out-of-band via your
 * own M-PAiSA / bank / cash. Confirmation records it in cash flow (one cash_ledger
 * row + CASH_LOGGED audit) — Teivaka never holds or moves the money.
 */
import { useEffect, useState, useCallback } from "react";
import TfpShell from "../../components/farm/TfpShell";
import { formatMoney } from "../../utils/money";

const API = "/api/v1/payments";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const fjd = (v) => formatMoney(v);
const auth = () => { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; };

async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: auth(), body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || "Request failed");
  return d;
}

const CATS = ["INPUTS", "LABOUR", "SUBSCRIPTION", "SALE", "COMMISSION", "OTHER"];
const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box", background: "var(--paper)", color: "var(--soil)" };
const btn = { padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--soil)" };
const primary = { ...btn, borderColor: "var(--green-dk)", color: "var(--green-dk)" };
const ST = { OPEN: "#9a8c6a", INSTRUCTED: "#2563eb", SETTLED: "var(--green-dk)", CANCELLED: "#b91c1c" };

export default function Payments() {
  const [sum, setSum] = useState(null);
  const [payables, setPayables] = useState(null);
  const [methods, setMethods] = useState([]);
  const [tab, setTab] = useState("COLLECT");
  const [form, setForm] = useState({ amount_fjd: "", category: "INPUTS", counterparty_label: "", due_date: "" });
  const [showMethods, setShowMethods] = useState(false);
  const [mform, setMform] = useState({ method_type: "WALLET", label: "", masked_identifier: "" });

  const load = useCallback(() => {
    fetch(`${API}/summary`, { headers: auth() }).then((r) => r.json()).then((d) => setSum(d?.data)).catch(() => setSum(null));
    fetch(`${API}/payables`, { headers: auth() }).then((r) => r.json()).then((d) => setPayables(d?.data || [])).catch(() => setPayables([]));
    fetch(`${API}/methods`, { headers: auth() }).then((r) => r.json()).then((d) => setMethods(d?.data || [])).catch(() => setMethods([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const amt = Number(form.amount_fjd);
    if (!amt || amt <= 0) { toast("Enter an amount", "error"); return; }
    try {
      await call("POST", "/payables", { direction: tab, amount_fjd: amt, category: form.category, counterparty_label: form.counterparty_label || null, due_date: form.due_date || null });
      toast(tab === "COLLECT" ? "Bill to pay added ✓" : "Money owed to you added ✓", "success");
      setForm({ amount_fjd: "", category: "INPUTS", counterparty_label: "", due_date: "" }); load();
    } catch (e) { toast(e.message, "error"); }
  };
  const instruct = async (p) => {
    const def = methods.find((m) => m.is_default) || methods[0];
    try {
      const d = await call("POST", `/payables/${p.obligation_id}/instruct`, { payment_method_id: def?.method_id || null });
      toast(d.data.instruction?.text || `Reference ${d.data.provider_ref}`, "success");
      load();
    } catch (e) { toast(e.message, "error"); }
  };
  const confirm = async (p) => {
    const ref = window.prompt("Payment reference from M-PAiSA / bank / receipt (optional)", "");
    if (ref === null) return;
    // find the latest transaction for this obligation via instruct response is gone; confirm by re-instructing is wrong.
    try {
      const list = await call("GET", `/transactions?obligation_id=${p.obligation_id}`);
      const tx = (list.data || []).find((t) => t.state !== "CONFIRMED") || (list.data || [])[0];
      if (!tx) { toast("Generate an instruction first", "error"); return; }
      const d = await call("POST", `/transactions/${tx.txn_id}/confirm`, { confirmation_ref: ref || null });
      toast(`Recorded in cash flow ✓ ${d.data.audit_hash ? "· verifiable" : ""}`, "success");
      load();
    } catch (e) { toast(e.message, "error"); }
  };
  const cancel = async (p) => { if (!window.confirm("Cancel this item?")) return; try { await call("POST", `/payables/${p.obligation_id}/cancel`); load(); } catch (e) { toast(e.message, "error"); } };

  const addMethod = async () => {
    if (!mform.label.trim()) { toast("Give the method a name", "error"); return; }
    try { await call("POST", "/methods", { provider: "MANUAL", method_type: mform.method_type, label: mform.label.trim(), masked_identifier: mform.masked_identifier || null }); toast("Method added ✓", "success"); setMform({ method_type: "WALLET", label: "", masked_identifier: "" }); load(); }
    catch (e) { toast(e.message, "error"); }
  };
  const archiveMethod = async (m) => { if (!window.confirm(`Remove ${m.label}?`)) return; try { await call("DELETE", `/methods/${m.method_id}`); load(); } catch (e) { toast(e.message, "error"); } };

  const rows = (payables || []).filter((p) => p.direction === tab);

  return (
    <TfpShell>
      <div style={{ padding: 16, maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--soil)" }}>Payments</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 14px" }}>
          You authorise and pay through your own M-PAiSA, bank or cash — Teivaka only records it in your cash flow.
        </p>

        {/* summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--paper)" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>To pay</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--soil)" }}>{fjd(sum?.to_pay?.outstanding)}</div>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--paper)" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>To receive</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--green-dk)" }}>{fjd(sum?.to_receive?.outstanding)}</div>
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["COLLECT", "Money I owe"], ["RECEIVE", "Owed to me"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn, fontWeight: 700, ...(tab === k ? { background: "var(--green)", color: "var(--paper)", borderColor: "var(--green-dk)" } : {}) }}>{label}</button>
          ))}
          <button onClick={() => setShowMethods((s) => !s)} style={{ ...btn, marginLeft: "auto" }}>Payment methods ({methods.length})</button>
        </div>

        {/* methods */}
        {showMethods && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 14, background: "var(--cream)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...inp, width: "auto" }} value={mform.method_type} onChange={(e) => setMform({ ...mform, method_type: e.target.value })}>
                <option value="WALLET">Wallet (M-PAiSA/MyCash)</option><option value="BANK">Bank</option><option value="CARD">Card</option>
              </select>
              <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="Name, e.g. My M-PAiSA" value={mform.label} onChange={(e) => setMform({ ...mform, label: e.target.value })} />
              <input style={{ ...inp, width: 140 }} placeholder="Last 4 / masked" value={mform.masked_identifier} onChange={(e) => setMform({ ...mform, masked_identifier: e.target.value })} />
              <button style={primary} onClick={addMethod}>Add</button>
            </div>
            <div style={{ marginTop: 8 }}>
              {methods.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No methods yet — add the wallet or bank you pay with.</span>}
              {methods.map((m) => (
                <div key={m.method_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", color: "var(--soil)" }}>
                  <span>{m.label} {m.masked_identifier ? `· ${m.masked_identifier}` : ""} <span style={{ color: "var(--muted)" }}>({m.method_type})</span></span>
                  <button style={{ ...btn, padding: "1px 7px", fontSize: 11 }} onClick={() => archiveMethod(m)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* add form */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 14, background: "var(--paper)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...inp, width: 110 }} type="number" min="0" step="0.01" placeholder="Amount" value={form.amount_fjd} onChange={(e) => setForm({ ...form, amount_fjd: e.target.value })} />
            <select style={{ ...inp, width: "auto" }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder={tab === "COLLECT" ? "Pay who? (supplier/worker)" : "From who?"} value={form.counterparty_label} onChange={(e) => setForm({ ...form, counterparty_label: e.target.value })} />
            <input style={{ ...inp, width: 150 }} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <button style={primary} onClick={create}>Add</button>
          </div>
        </div>

        {/* list */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--paper)" }}>
          {payables === null && <div style={{ padding: 14, fontSize: 13 }}>Loading…</div>}
          {payables !== null && rows.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Nothing here yet.</div>}
          {rows.map((p) => (
            <div key={p.obligation_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14 }}>{fjd(p.amount_fjd)} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>· {p.category}</span></div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.counterparty_label || "—"}{p.due_date ? ` · due ${p.due_date}` : ""}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: ST[p.status] }}>{p.status}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {p.status === "OPEN" && <button style={primary} onClick={() => instruct(p)}>Generate instruction</button>}
                {p.status === "INSTRUCTED" && <button style={primary} onClick={() => confirm(p)}>Confirm paid</button>}
                {["OPEN", "INSTRUCTED"].includes(p.status) && <button style={{ ...btn, color: "#b91c1c" }} onClick={() => cancel(p)}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TfpShell>
  );
}

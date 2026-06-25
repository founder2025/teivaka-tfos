/**
 * MarketplaceFeesPanel — admin control for marketplace transaction fees.
 * Edit the % per category and watch accrued platform revenue. Fees accrue on
 * flagged marketplace sales as a receivable (the platform doesn't hold funds) —
 * collected out-of-band; mark rows invoiced/paid/waived here.
 */
import { useEffect, useState } from "react";
import { getJSON, send } from "../../utils/api";
import { Percent, Save, FileText } from "lucide-react";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", cream: "var(--cream)" };
const card = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const inp = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, width: 90, boxSizing: "border-box", background: C.paper, color: C.soil };
const btn = { background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const fjd = (n) => "FJD " + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function RateRow({ r, onSaved }) {
  const [pct, setPct] = useState(r.fee_pct);
  const [active, setActive] = useState(r.is_active !== false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await send("PUT", `/api/v1/admin/marketplace-fees/rates/${r.category}`, { fee_pct: Number(pct), is_active: active }); toast(`${r.category} saved ✓`, "success"); onSaved?.(); }
    catch (e) { toast(e.userMessage || e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ flex: 1 }}><strong style={{ color: C.soil, fontSize: 13.5 }}>{r.label}</strong> <span style={{ color: C.muted, fontSize: 11 }}>({r.category})</span></div>
      <input type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} style={inp} /> <span style={{ color: C.muted, fontSize: 12 }}>%</span>
      <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button onClick={save} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}><Save size={12} />Save</button>
    </div>
  );
}

export default function MarketplaceFeesPanel() {
  const [rates, setRates] = useState(null);
  const [led, setLed] = useState(null);

  const loadRates = () => getJSON("/api/v1/admin/marketplace-fees/rates").then((r) => setRates(r?.data || [])).catch(() => setRates([]));
  const loadLedger = () => getJSON("/api/v1/admin/marketplace-fees/ledger").then((r) => setLed(r?.data || { summary: {}, rows: [] })).catch(() => setLed({ summary: {}, rows: [] }));
  useEffect(() => { loadRates(); loadLedger(); }, []);

  const setStatus = async (id, status) => {
    try { await send("PATCH", `/api/v1/admin/marketplace-fees/ledger/${id}`, { status }); toast(`Marked ${status}`, "success"); loadLedger(); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };

  const s = led?.summary || {};
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Percent size={16} style={{ color: C.greenDk }} />
        <strong style={{ color: C.soil, fontSize: 15 }}>Marketplace transaction fees</strong>
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
        Fees accrue on sales flagged as marketplace transactions (the farmer's own cash record is untouched).
        This is the platform's receivable — collect out-of-band, then mark rows invoiced / paid.
      </p>

      {/* Rates */}
      {rates == null ? <div style={{ color: C.muted }}>Loading rates…</div>
        : rates.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No rates — run migration 177 on the server, then reload.</div>
        : rates.map((r) => <RateRow key={r.category} r={r} onSaved={loadRates} />)}

      {/* Revenue summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
        {[["This month", s.this_month_fjd], ["Accrued (uninvoiced)", s.accrued_fjd], ["Invoiced", s.invoiced_fjd], ["Collected", s.paid_fjd], ["Total", s.total_fjd]].map(([k, v]) => (
          <div key={k} style={{ flex: 1, minWidth: 120, background: C.cream, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", color: C.muted, letterSpacing: "0.04em" }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.greenDk }}>{fjd(v)}</div>
          </div>
        ))}
      </div>

      {/* Recent ledger */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 8px" }}>
        <FileText size={14} style={{ color: C.greenDk }} /><strong style={{ color: C.soil, fontSize: 13.5 }}>Recent fees</strong>
      </div>
      {led == null ? <div style={{ color: C.muted }}>Loading…</div>
        : (led.rows || []).length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No fees accrued yet — they appear when a marketplace sale is marked paid.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr>{["Order", "Category", "Gross", "%", "Fee", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
              <tbody>
                {led.rows.map((f) => (
                  <tr key={f.id}>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, fontFamily: "monospace", color: C.soil }}>{f.order_id || "—"}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{f.category}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{fjd(f.gross_amount_fjd)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{f.fee_pct}%</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, fontWeight: 700, color: C.greenDk }}>{fjd(f.fee_amount_fjd)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}><span style={pill(f.status === "PAID" ? "#eef7ee" : f.status === "WAIVED" ? "#f3f3f3" : "var(--cream)", f.status === "PAID" ? C.greenDk : C.muted)}>{f.status}</span></td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>
                      {f.status !== "PAID" && <button onClick={() => setStatus(f.id, f.status === "ACCRUED" ? "INVOICED" : "PAID")} style={{ ...btn, padding: "3px 8px", fontSize: 11 }}>{f.status === "ACCRUED" ? "Invoice" : "Mark paid"}</button>}
                      {f.status !== "WAIVED" && f.status !== "PAID" && <button onClick={() => setStatus(f.id, "WAIVED")} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: C.muted, cursor: "pointer", marginLeft: 5 }}>Waive</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

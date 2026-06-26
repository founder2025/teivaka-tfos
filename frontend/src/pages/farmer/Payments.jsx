/**
 * Payments.jsx — /farm/payments (Money tab) — Phase 0 non-custodial cockpit.
 *
 * Capture what you owe (COLLECT) / are owed (RECEIVE), then settle in ONE flow:
 * the Settle modal generates the instruction, shows the reference persistently,
 * picks the rail, captures a confirmation reference, and books it — one
 * cash_ledger row + CASH_LOGGED audit. Teivaka never holds or moves the money.
 *
 * Optimize pass (ST-P1…P19): farm-context wrapper (no crash); allSettled load so one
 * flaky call can't blank the page; current-farm selector + per-row farm so booking is
 * visible AND adopted items can be settled (closes the multi-farm dead-end); real
 * method chooser; friendly labels; active/done toggle + search; arrow-key tabs;
 * AI query enriched with real numbers; userMessage on errors; honest "recorded" toast.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Lock, Sparkles, Plus, Star, Trash2, AlertTriangle,
  RefreshCw, CheckCircle2, CreditCard, X, Sprout, Search,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import Modal from "../../components/ui/Modal.jsx";
import { formatMoney } from "../../utils/money";
import { apiFetch } from "../../utils/api";
import { useCurrentFarm, CurrentFarmProvider } from "../../context/CurrentFarmContext";

const API = "/api/v1/payments";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const fjd = (v) => formatMoney(v);
const errMsg = (e) => e?.userMessage || e?.message || "Something went wrong";
const fijiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" });

// api.js (token auto-refresh) BUT keeps the 423 PIN-lock and never swallows errors.
async function pcall(method, path, body) {
  const r = await apiFetch(`${API}${path}`, { method, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 423 && !path.startsWith("/security")) {
    try { window.dispatchEvent(new CustomEvent("tfos:payments-locked")); } catch { /* noop */ }
    const e = new Error("Locked — enter your PIN"); e.locked = true; throw e;
  }
  if (!r.ok) { const e = new Error(d?.detail || "Request failed"); e.status = r.status; throw e; }
  return d;
}
async function fetchFarms() {
  const r = await apiFetch("/api/v1/farms");
  if (!r.ok) throw new Error("farms"); return (await r.json())?.farms ?? [];
}

// One-tap rails for Fiji — tapping pre-fills the name + maps to the right type.
// Covers wallet / bank / card; "Other" is free-text so ANY method is supported.
const PROVIDERS = [
  { name: "M-PAiSA", type: "WALLET" }, { name: "MyCash", type: "WALLET" }, { name: "Digicel Money", type: "WALLET" },
  { name: "BSP", type: "BANK" }, { name: "ANZ", type: "BANK" }, { name: "Westpac", type: "BANK" }, { name: "HFC Bank", type: "BANK" }, { name: "Bred Bank", type: "BANK" },
  { name: "Visa", type: "CARD" }, { name: "Mastercard", type: "CARD" },
  { name: "Other", type: "WALLET" },
];
const idHint = (t) => (t === "WALLET" ? "Phone number (optional)" : t === "BANK" ? "Acc. last 4 (optional)" : "Card last 4 (optional)");
const CATS = ["INPUTS", "LABOUR", "SUBSCRIPTION", "SALE", "COMMISSION", "OTHER"];
const CAT_LABEL = { INPUTS: "Inputs", LABOUR: "Labour", SUBSCRIPTION: "Subscription", SALE: "Sale", COMMISSION: "Commission", OTHER: "Other", SERVICE: "Service" };
const catLabel = (c) => CAT_LABEL[c] || (c ? c[0] + c.slice(1).toLowerCase() : "Other");
const statusLabel = (p, dir) => {
  if (p.status === "SETTLED") return dir === "COLLECT" ? "Paid" : "Received";
  if (p.status === "CANCELLED") return "Cancelled";
  return dir === "COLLECT" ? "To pay" : "To receive";
};
const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box", background: "var(--paper)", color: "var(--soil)" };
const btn = { padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--soil)" };
const primary = { ...btn, borderColor: "var(--green-dk)", color: "var(--green-dk)" };

function ErrorCard({ msg, onRetry }) {
  return (
    <div style={{ border: "1px solid #e7c9c9", background: "#fdf3f3", borderRadius: 12, padding: 16, textAlign: "center", margin: "12px 0" }}>
      <AlertTriangle size={20} style={{ color: "#b91c1c" }} />
      <div style={{ fontSize: 13, color: "var(--soil)", margin: "6px 0 10px" }}>{msg || "Couldn't load Payments."}</div>
      <button style={primary} onClick={onRetry}><RefreshCw size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Retry</button>
    </div>
  );
}
function DegradedBanner({ onRetry }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8a6d00", background: "#fff8e6", border: "1px solid #e8d27a", borderRadius: 10, padding: "7px 10px", margin: "10px 0" }}>
      <AlertTriangle size={14} /> Showing your last loaded data — couldn't refresh.
      <button style={{ ...btn, padding: "2px 8px", fontSize: 11, marginLeft: "auto" }} onClick={onRetry}>Retry</button>
    </div>
  );
}

function PaymentsInner() {
  const navigate = useNavigate();
  const { farmId, setFarmId } = useCurrentFarm();
  const [sum, setSum] = useState(null);
  const [payables, setPayables] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [methods, setMethods] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [farms, setFarms] = useState([]);
  const [tab, setTab] = useState("COLLECT");
  const [form, setForm] = useState({ amount_fjd: "", category: "INPUTS", counterparty_label: "", due_date: "" });
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showMethods, setShowMethods] = useState(false);
  const [mform, setMform] = useState({ method_type: "WALLET", label: "", masked_identifier: "", is_default: false, picked: null });
  const [loadErr, setLoadErr] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const busy = useRef(false);
  // PIN gate
  const [gate, setGate] = useState("loading");   // loading | setup | enter | locked | open
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  const [gateMsg, setGateMsg] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpw, setFpw] = useState(""); const [fpin, setFpin] = useState("");
  // settle + cancel
  const [settle, setSettle] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    const [s, p, m, c, f] = await Promise.allSettled([
      pcall("GET", "/summary"), pcall("GET", "/payables"),
      pcall("GET", "/methods"), pcall("GET", "/counterparties"), fetchFarms(),
    ]);
    if ([s, p, m, c].some((r) => r.status === "rejected" && r.reason?.locked)) return; // gate takes over
    if (s.status === "fulfilled") setSum(s.value?.data || null);
    if (m.status === "fulfilled") setMethods(m.value?.data || []);
    if (c.status === "fulfilled") setCounterparties(c.value?.data || []);
    if (f.status === "fulfilled") setFarms(f.value || []);
    if (p.status === "fulfilled") {
      setPayables(p.value?.data || []); setLoadErr(false);
      setDegraded(s.status === "rejected"); // payments loaded but a companion call didn't
    } else if (payables == null) { setLoadErr(true); } else { setDegraded(true); }
    pcall("GET", "/suggestions").then((sg) => setSuggestions(sg?.data || [])).catch(() => { /* best-effort */ });
  }, [payables]);

  const checkGate = useCallback(async () => {
    try {
      const s = (await pcall("GET", "/security/status")).data;
      setHasPin(!!s.pin_set);
      if (s.locked) { setGate("locked"); setGateMsg("Too many attempts — locked. Try again shortly."); }
      else if (s.unlocked) { setGate("open"); load(); }
      else if (s.pin_set) { setGate("enter"); }
      else { setGate("open"); load(); }
    } catch {
      setHasPin(false); setGate("open"); load(); // server still enforces; a 423 flips us to unlock
    }
  }, [load]);
  useEffect(() => { checkGate(); }, [checkGate]);
  useEffect(() => {
    const onLocked = () => { setGate("enter"); setGateMsg("Session expired — enter your PIN again."); };
    window.addEventListener("tfos:payments-locked", onLocked);
    return () => window.removeEventListener("tfos:payments-locked", onLocked);
  }, []);
  // Auto-pick a farm so booking always has a target (single-farm = silent, multi = selector).
  useEffect(() => { if (!farmId && farms.length) setFarmId(farms[0].farm_id); }, [farms, farmId, setFarmId]);

  const submitGate = async () => {
    setGateMsg("");
    try {
      if (gate === "setup") {
        if (pin !== pin2) { setGateMsg("PINs don't match"); return; }
        await pcall("POST", "/security/set-pin", { pin }); setHasPin(true); toast("Payments PIN set", "success");
      } else { await pcall("POST", "/security/unlock", { pin }); }
      setPin(""); setPin2(""); setGate("open"); load();
    } catch (e) { setGateMsg(e.message || "Incorrect PIN"); if ((e.message || "").toLowerCase().includes("locked")) setGate("locked"); }
  };
  const resetPin = async () => {
    if (!fpw || !fpin) { toast("Enter your password and a new PIN", "error"); return; }
    try { await pcall("POST", "/security/reset", { password: fpw, new_pin: fpin }); toast("PIN reset", "success"); setHasPin(true); setForgotOpen(false); setFpw(""); setFpin(""); setGate("open"); load(); }
    catch (e) { toast(errMsg(e), "error"); }
  };
  const lockNow = async () => { try { await pcall("POST", "/security/lock"); } catch { /* noop */ } setGate("enter"); };

  const create = async () => {
    if (busy.current) return;
    const amt = Number(form.amount_fjd);
    if (!amt || amt <= 0) { toast("Enter an amount", "error"); return; }
    busy.current = true;
    try {
      await pcall("POST", "/payables", { direction: tab, amount_fjd: amt, category: form.category, counterparty_label: form.counterparty_label || null, due_date: form.due_date || null, farm_id: farmId || null });
      toast(tab === "COLLECT" ? "Bill to pay added" : "Money owed to you added", "success");
      setForm({ amount_fjd: "", category: "INPUTS", counterparty_label: "", due_date: "" }); await load();
    } catch (e) { toast(errMsg(e), "error"); } finally { busy.current = false; }
  };

  const openSettle = async (p) => {
    if (busy.current) return; busy.current = true;
    try {
      let txn = (await pcall("GET", `/transactions?obligation_id=${p.obligation_id}`)).data?.find((t) => t.state === "INITIATED");
      if (!txn) {
        const def = methods.find((m) => m.is_default) || methods[0];
        const d = await pcall("POST", `/payables/${p.obligation_id}/instruct`, { payment_method_id: def?.method_id || null });
        txn = { txn_id: d.data.txn_id, provider_ref: d.data.provider_ref, instruction_payload: d.data.instruction, state: "INITIATED" };
      }
      const def = methods.find((m) => m.is_default) || methods[0];
      setSettle({ payable: p, txn, methodId: def?.method_id || "", ref: "" });
    } catch (e) { toast(errMsg(e), "error"); } finally { busy.current = false; }
  };
  const confirmSettle = async () => {
    if (busy.current || !settle) return; busy.current = true;
    try {
      const d = await pcall("POST", `/transactions/${settle.txn.txn_id}/confirm`, { confirmation_ref: settle.ref || null, payment_method_id: settle.methodId || null, farm_id: farmId || null });
      const booked = d.data?.recorded_in_cashflow;
      toast(booked ? `Recorded in cash flow${d.data.audit_hash ? " · verifiable" : ""}` : "Payment recorded · verifiable", "success");
      setSettle(null); await load();
    } catch (e) {
      if (e.status === 409 && /already confirmed/i.test(e.message || "")) { toast("Already recorded", "success"); setSettle(null); await load(); }
      else { toast(errMsg(e), "error"); }
    } finally { busy.current = false; }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    try { await pcall("POST", `/payables/${cancelTarget.obligation_id}/cancel`); setCancelTarget(null); await load(); }
    catch (e) { toast(errMsg(e), "error"); }
  };
  const adopt = async (s) => { try { await pcall("POST", "/payables/adopt", { source_type: s.source_type, source_id: s.source_id, farm_id: farmId || null }); toast("Added to payments", "success"); await load(); } catch (e) { toast(errMsg(e), "error"); } };

  const addMethod = async () => {
    if (busy.current) return;
    if (!mform.label.trim()) { toast("Give the method a name", "error"); return; }
    busy.current = true;
    try {
      await pcall("POST", "/methods", { provider: "MANUAL", method_type: mform.method_type, label: mform.label.trim(), masked_identifier: mform.masked_identifier || null, is_default: mform.is_default });
      toast("Method added", "success"); setMform({ method_type: "WALLET", label: "", masked_identifier: "", is_default: false, picked: null }); await load();
      if (!hasPin) { setShowMethods(false); setPin(""); setPin2(""); setGateMsg(""); setGate("setup"); }
    } catch (e) { toast(errMsg(e), "error"); } finally { busy.current = false; }
  };
  const archiveMethod = async (m) => { try { await pcall("DELETE", `/methods/${m.method_id}`); await load(); } catch (e) { toast(errMsg(e), "error"); } };

  const askAI = () => {
    const q = tab === "COLLECT"
      ? `I owe ${fjd(sum?.to_pay?.outstanding) || "FJD 0"} in total${overdueTotal > 0 ? `, of which ${fjd(overdueTotal)} is overdue` : ""}. Which bills should I pay first to protect my farm cash flow?`
      : `I am owed ${fjd(sum?.to_receive?.outstanding) || "FJD 0"}. How do I follow up to collect money owed to me?`;
    navigate(`/tis?q=${encodeURIComponent(q)}`);
  };

  const today = fijiToday();
  const overdueOf = (p) => (["OPEN", "INSTRUCTED"].includes(p.status) && p.due_date && p.due_date < today);
  const daysTo = (d) => Math.round((new Date(d) - new Date(today)) / 86400000);
  const farmName = (id) => farms.find((f) => f.farm_id === id)?.farm_name || null;
  const overdueTotal = (payables || []).filter((p) => p.direction === "COLLECT" && overdueOf(p)).reduce((t, p) => t + (p.amount_fjd || 0), 0);
  const atCap = (payables || []).length >= 300;
  const q = query.trim().toLowerCase();
  let rows = (payables || []).filter((p) => p.direction === tab);
  if (!showDone) rows = rows.filter((p) => ["OPEN", "INSTRUCTED"].includes(p.status));
  if (q) rows = rows.filter((p) => (p.counterparty_label || "").toLowerCase().includes(q) || catLabel(p.category).toLowerCase().includes(q));
  rows = rows.slice().sort((a, b) => (overdueOf(b) - overdueOf(a)) || ((a.status === "OPEN") === (b.status === "OPEN") ? 0 : a.status === "OPEN" ? -1 : 1));
  const sugg = suggestions.filter((s) => s.direction === tab);
  const TAB_KEYS = ["COLLECT", "RECEIVE"];
  const onTabKey = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const i = TAB_KEYS.indexOf(tab); setTab(TAB_KEYS[(i + (e.key === "ArrowRight" ? 1 : 1)) % 2]); } };

  // ───────────── PIN gate ─────────────
  if (gate !== "open") {
    const setup = gate === "setup"; const locked = gate === "locked";
    return (
      <TfpShell>
        <div style={{ maxWidth: 360, margin: "48px auto", padding: 24, border: "1px solid var(--line)", borderRadius: 16, background: "var(--paper)", textAlign: "center" }}>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
            <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--green-tint)", display: "grid", placeItems: "center", color: "var(--green-dk)" }}>{locked ? <Lock size={22} /> : <ShieldCheck size={22} />}</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--soil)" }}>{locked ? "Payments locked" : setup ? "Secure your Payments" : "Enter your PIN"}</h2>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 16px" }}>{locked ? "Too many attempts. Try again in a few minutes." : setup ? "Set a 4–6 digit PIN. You'll enter it to open Payments on this device." : "This area is protected. Enter your payments PIN to continue."}</p>
          {gate === "loading" && <div style={{ fontSize: 13, color: "var(--muted)" }}>Checking…</div>}
          {!locked && gate !== "loading" && (
            <>
              <input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && !setup && submitGate()} placeholder="PIN" style={{ ...inp, textAlign: "center", letterSpacing: 6, fontSize: 20, marginBottom: 10 }} />
              {setup && <input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitGate()} placeholder="Confirm PIN" style={{ ...inp, textAlign: "center", letterSpacing: 6, fontSize: 20, marginBottom: 10 }} />}
              {gateMsg && <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{gateMsg}</div>}
              <button style={{ ...primary, width: "100%", padding: "10px", fontSize: 14 }} onClick={submitGate}>{setup ? "Set PIN & open" : "Unlock"}</button>
              {!setup && <button style={{ ...btn, border: "none", marginTop: 10, color: "var(--green-dk)" }} onClick={() => setForgotOpen(true)}>Forgot PIN?</button>}
              {setup && <button style={{ ...btn, border: "none", marginTop: 10, color: "var(--muted)" }} onClick={() => { setPin(""); setPin2(""); setGateMsg(""); setGate("open"); load(); }}>Not now</button>}
            </>
          )}
          {locked && <button style={{ ...btn, marginTop: 8 }} onClick={checkGate}>Try again</button>}
        </div>
        <Modal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} title="Reset your PIN" size="sm" footer={<><button style={btn} onClick={() => setForgotOpen(false)}>Cancel</button><button style={primary} onClick={resetPin}>Reset PIN</button></>}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Account password<input type="password" value={fpw} onChange={(e) => setFpw(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12.5, color: "var(--soil)" }}>New 4–6 digit PIN<input type="password" inputMode="numeric" maxLength={6} value={fpin} onChange={(e) => setFpin(e.target.value.replace(/\D/g, ""))} style={{ ...inp, marginTop: 4, letterSpacing: 4 }} /></label>
          </div>
        </Modal>
      </TfpShell>
    );
  }

  // ───────────── hub ─────────────
  return (
    <TfpShell>
      <div style={{ padding: 16, maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, flex: 1, minWidth: 180 }}>You pay through your own M-PAiSA, bank or cash — Teivaka records it and makes it verifiable.</p>
          {/* booking farm — visible + switchable (ST-P6/P15/P2) */}
          {farms.length > 1 ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}><Sprout size={13} style={{ color: "var(--green-dk)" }} />Books to
              <select value={farmId || ""} onChange={(e) => setFarmId(e.target.value)} style={{ ...inp, width: "auto", padding: "4px 8px", fontWeight: 700 }}>{farms.map((f) => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}</select>
            </label>
          ) : farms.length === 1 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}><Sprout size={13} style={{ color: "var(--green-dk)" }} />Books to <strong style={{ color: "var(--soil)" }}>{farms[0].farm_name}</strong></span>
          ) : null}
          <button style={btn} onClick={askAI} aria-label="Ask AI about your payments"><Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Ask AI</button>
          {hasPin && <button onClick={lockNow} title="Lock Payments" style={btn}><Lock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Lock</button>}
        </div>

        {!hasPin && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 14, borderRadius: 12, border: "1px solid #e8d27a", background: "#fff8e6" }}>
            <Lock size={18} style={{ color: "#8a6d00" }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--soil)" }}>Protect this section with a PIN so only you can open it on this device.</div>
            <button style={primary} onClick={() => { setPin(""); setPin2(""); setGateMsg(""); setGate("setup"); }}>Set a PIN</button>
          </div>
        )}

        {loadErr && <ErrorCard msg="Couldn't load your payments." onRetry={load} />}
        {degraded && <DegradedBanner onRetry={load} />}

        {/* summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--paper)" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>To pay</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--soil)" }}>{fjd(sum?.to_pay?.outstanding) || "—"}</div>
          </div>
          <div style={{ border: `1px solid ${overdueTotal > 0 ? "#e7c9c9" : "var(--line)"}`, borderRadius: 12, padding: 12, background: overdueTotal > 0 ? "#fdf3f3" : "var(--paper)" }}>
            <div style={{ fontSize: 11.5, color: overdueTotal > 0 ? "#b91c1c" : "var(--muted)" }}>Overdue to pay</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: overdueTotal > 0 ? "#b91c1c" : "var(--soil)" }}>{fjd(overdueTotal)}</div>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--paper)" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>To receive</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--green-dk)" }}>{fjd(sum?.to_receive?.outstanding) || "—"}</div>
          </div>
        </div>

        {/* tabs (arrow-key nav) + methods */}
        <div role="tablist" aria-label="Payments direction" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[["COLLECT", "Money I owe"], ["RECEIVE", "Owed to me"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onKeyDown={onTabKey} onClick={() => setTab(k)} style={{ ...btn, fontWeight: 700, ...(tab === k ? { background: "var(--green)", color: "var(--paper)", borderColor: "var(--green-dk)" } : {}) }}>{label}</button>
          ))}
          <button onClick={() => setShowMethods((s) => !s)} style={{ ...btn, marginLeft: "auto" }}><CreditCard size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Methods ({methods.length})</button>
        </div>

        {/* methods — one-tap provider quick-picks (supports every rail) */}
        {showMethods && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 14, background: "var(--cream)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--soil)" }}>Add a wallet, bank or card you pay from</div>
            <div style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 8px", lineHeight: 1.45 }}>You pay from these yourself; Teivaka records and bank-verifies each payment. Charging directly in-app (M-PAiSA / card) is coming once each rail is switched on.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: mform.picked ? 12 : 0 }}>
              {PROVIDERS.map((pv) => {
                const sel = mform.picked === pv.name;
                return (
                  <button key={pv.name} onClick={() => setMform({ method_type: pv.type, label: pv.name === "Other" ? "" : pv.name, masked_identifier: "", is_default: mform.is_default, picked: pv.name })}
                    style={{ ...btn, padding: "5px 11px", ...(sel ? { background: "var(--green)", color: "var(--paper)", borderColor: "var(--green-dk)" } : {}) }}>{pv.name}</button>
                );
              })}
            </div>
            {mform.picked && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {mform.picked === "Other" && (
                  <>
                    <select style={{ ...inp, width: "auto" }} value={mform.method_type} onChange={(e) => setMform({ ...mform, method_type: e.target.value })}><option value="WALLET">Mobile wallet</option><option value="BANK">Bank</option><option value="CARD">Card</option></select>
                    <input autoFocus style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="Name, e.g. Vodafone M-PAiSA" value={mform.label} onChange={(e) => setMform({ ...mform, label: e.target.value })} />
                  </>
                )}
                {mform.picked !== "Other" && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--soil)" }}>{mform.label}</span>}
                <input style={{ ...inp, width: 170 }} placeholder={idHint(mform.method_type)} value={mform.masked_identifier} onChange={(e) => setMform({ ...mform, masked_identifier: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addMethod()} />
                <label style={{ fontSize: 12, color: "var(--soil)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={mform.is_default} onChange={(e) => setMform({ ...mform, is_default: e.target.checked })} />Default</label>
                <button style={primary} onClick={addMethod}><Plus size={13} style={{ verticalAlign: -2 }} />Add {mform.picked === "Other" ? "method" : mform.label}</button>
                <button style={{ ...btn, border: "none", color: "var(--muted)" }} onClick={() => setMform({ method_type: "WALLET", label: "", masked_identifier: "", is_default: false, picked: null })}>Clear</button>
              </div>
            )}
            <div style={{ marginTop: mform.picked ? 12 : 8, paddingTop: methods.length ? 8 : 0, borderTop: methods.length ? "1px solid var(--line)" : "none" }}>
              {methods.length === 0 && !mform.picked && <span style={{ fontSize: 12, color: "var(--muted)" }}>Tap a provider above — or "Other" for anything not listed.</span>}
              {methods.map((m) => (
                <div key={m.method_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", color: "var(--soil)" }}>
                  <span>{m.is_default && <Star size={11} fill="var(--green-dk)" stroke="var(--green-dk)" style={{ verticalAlign: -1, marginRight: 4 }} />}{m.label} {m.masked_identifier ? `· ${m.masked_identifier}` : ""} <span style={{ color: "var(--muted)" }}>({m.method_type === "WALLET" ? "wallet" : m.method_type === "BANK" ? "bank" : "card"})</span></span>
                  <button style={{ ...btn, padding: "1px 7px", fontSize: 11 }} onClick={() => archiveMethod(m)} aria-label={`Remove ${m.label}`}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* add form */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 14, background: "var(--paper)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...inp, width: 110 }} type="number" min="0" step="0.01" placeholder="Amount" value={form.amount_fjd} onChange={(e) => setForm({ ...form, amount_fjd: e.target.value })} onKeyDown={(e) => e.key === "Enter" && create()} />
            <select style={{ ...inp, width: "auto" }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
            <input list="cp-list" style={{ ...inp, flex: 1, minWidth: 140 }} placeholder={tab === "COLLECT" ? "Pay who? (supplier/worker)" : "From who?"} value={form.counterparty_label} onChange={(e) => setForm({ ...form, counterparty_label: e.target.value })} />
            <datalist id="cp-list">{counterparties.slice(0, 50).map((c) => <option key={c.counterparty_id} value={c.name} />)}</datalist>
            <input style={{ ...inp, width: 150 }} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <button style={primary} onClick={create}><Plus size={13} style={{ verticalAlign: -2 }} />Add</button>
          </div>
        </div>

        {/* suggestions */}
        {sugg.length > 0 && (
          <div style={{ border: "1px dashed var(--green-dk)", borderRadius: 12, padding: 10, marginBottom: 14, background: "var(--cream)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green-dk)", marginBottom: 6 }}>Suggested from your activity {tab === "COLLECT" ? "(bills to pay)" : "(money owed to you)"}</div>
            {sugg.map((s) => (
              <div key={`${s.source_type}-${s.source_id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5 }}>{fjd(s.amount_fjd)}</span><span style={{ fontSize: 12, color: "var(--muted)" }}> · {s.counterparty_label} · {s.detail}</span></div>
                <button style={primary} onClick={() => adopt(s)}><Plus size={13} style={{ verticalAlign: -2 }} />Add</button>
              </div>
            ))}
          </div>
        )}

        {/* search + done toggle (commercial scale) */}
        {(payables || []).filter((p) => p.direction === tab).length > 6 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ position: "relative", flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--muted)" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search who or category" style={{ ...inp, paddingLeft: 28 }} />
            </span>
            <label style={{ fontSize: 12, color: "var(--soil)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show settled</label>
          </div>
        )}

        {/* list */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--paper)" }}>
          {payables === null && !loadErr && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>Loading…</div>}
          {payables !== null && rows.length === 0 && !loadErr && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>{q ? "No matches." : tab === "COLLECT" ? "No bills to pay. Add one above." : "No money owed to you yet."}</div>}
          {rows.map((p) => {
            const od = overdueOf(p); const d = p.due_date ? daysTo(p.due_date) : null; const fn = farms.length > 1 ? farmName(p.farm_id) : null;
            return (
              <div key={p.obligation_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)", background: od ? "#fdf3f3" : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14 }}>{fjd(p.amount_fjd)} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>· {catLabel(p.category)}</span></div>
                  <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.counterparty_label || "—"}{fn ? ` · ${fn}` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: od ? "#b91c1c" : p.status === "SETTLED" ? "var(--green-dk)" : "var(--muted)" }}>{od ? `Overdue ${Math.abs(d)}d` : statusLabel(p, tab)}</span>
                  {!od && d != null && ["OPEN", "INSTRUCTED"].includes(p.status) && <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{d === 0 ? "due today" : d > 0 ? `due in ${d}d` : ""}</div>}
                  {p.status === "SETTLED" && <div style={{ fontSize: 10.5, color: "var(--green-dk)" }}>verifiable</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {["OPEN", "INSTRUCTED"].includes(p.status) && <button style={primary} onClick={() => openSettle(p)}>{tab === "COLLECT" ? "Mark paid" : "Mark received"}</button>}
                  {["OPEN", "INSTRUCTED"].includes(p.status) && <button style={{ ...btn, color: "#b91c1c", padding: "6px 8px" }} onClick={() => setCancelTarget(p)} aria-label="Cancel item"><X size={13} /></button>}
                </div>
              </div>
            );
          })}
          {atCap && <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)", background: "var(--cream)" }}>Showing your latest 300 items. Totals above cover everything.</div>}
        </div>
      </div>

      {/* SETTLE modal */}
      <Modal isOpen={!!settle} onClose={() => setSettle(null)} size="sm"
        title={settle ? `${settle.payable.direction === "COLLECT" ? "Mark paid" : "Mark received"} · ${fjd(settle.payable.amount_fjd)}` : ""}
        footer={settle ? <><button style={btn} onClick={() => setSettle(null)}>Cancel</button><button style={primary} onClick={confirmSettle}><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{settle.payable.direction === "COLLECT" ? "Confirm paid" : "Confirm received"}</button></> : null}>
        {settle && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{settle.payable.direction === "COLLECT" ? "To" : "From"}: <strong style={{ color: "var(--soil)" }}>{settle.payable.counterparty_label || "—"}</strong></div>
            {methods.length > 1 && (
              <label style={{ fontSize: 12.5, color: "var(--soil)" }}>{settle.payable.direction === "COLLECT" ? "Paid from" : "Received into"}
                <select style={{ ...inp, marginTop: 4 }} value={settle.methodId} onChange={(e) => setSettle({ ...settle, methodId: e.target.value })}>{methods.map((m) => <option key={m.method_id} value={m.method_id}>{m.label}{m.is_default ? " (default)" : ""}</option>)}</select></label>
            )}
            <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, background: "var(--cream)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green-dk)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Payment instruction</div>
              <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.5 }}>{settle.txn?.instruction_payload?.text || `Pay ${fjd(settle.payable.amount_fjd)} to ${settle.payable.counterparty_label || "the payee"}.`}</div>
              {settle.txn?.provider_ref && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Reference: <strong style={{ color: "var(--soil)" }}>{settle.txn.provider_ref}</strong></div>}
            </div>
            <label style={{ fontSize: 12.5, color: "var(--soil)" }}>Confirmation reference <span style={{ color: "var(--muted)" }}>(from M-PAiSA / bank / receipt)</span>
              <input style={{ ...inp, marginTop: 4 }} value={settle.ref} onChange={(e) => setSettle({ ...settle, ref: e.target.value })} placeholder="e.g. MP-882193" /></label>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Books it into {farmName(farmId) ? <strong>{farmName(farmId)}</strong> : "your farm"} cash flow and the hash-chained Bank Evidence record.</div>
          </div>
        )}
      </Modal>

      {/* cancel confirm */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} size="sm" title="Cancel this item?" footer={<><button style={btn} onClick={() => setCancelTarget(null)}>Keep it</button><button style={{ ...btn, color: "#b91c1c", borderColor: "#e7c9c9" }} onClick={doCancel}>Cancel item</button></>}>
        {cancelTarget && <div style={{ fontSize: 13, color: "var(--soil)" }}>{fjd(cancelTarget.amount_fjd)} · {catLabel(cancelTarget.category)}{cancelTarget.counterparty_label ? ` · ${cancelTarget.counterparty_label}` : ""}. This removes it from your payments list.</div>}
      </Modal>
    </TfpShell>
  );
}

// Provide the farm context this page consumes (sibling CashLedger does the same).
export default function Payments() {
  return (
    <CurrentFarmProvider>
      <PaymentsInner />
    </CurrentFarmProvider>
  );
}

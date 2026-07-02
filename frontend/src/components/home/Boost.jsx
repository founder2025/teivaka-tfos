/**
 * Boost — WH4 "Promotions" tab in Work & hire. A trust-earning member features one of
 * their own OPEN postings (job or service) for a fixed window; it then sorts to the top
 * of Find work / Earn with a "Featured" label. Trust-gated, capped at one active — no
 * payment faked (paid boost lands with the payment rail). Real data from /promotions/mine.
 */
import { useEffect, useState } from "react";
import { Megaphone, Rocket, X, ShieldCheck } from "lucide-react";
import { getJSON, send } from "../../utils/api";

const C = { soil: "var(--soil)", greenDk: "var(--green-dk)", muted: "var(--muted)", line: "var(--line)", cream: "var(--cream)", amber: "var(--amber)", red: "var(--red)" };
const emitToast = (m) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); } catch { /* noop */ } };
const TYPE_LABEL = { JOB_LISTING: "Job", SERVICE_JOB: "Service" };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const daysLeft = (iso) => { if (!iso) return ""; const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); return d > 0 ? `${d} day${d === 1 ? "" : "s"} left` : "expiring"; };

export default function Boost() {
  const [data, setData] = useState(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const load = () => getJSON("/api/v1/promotions/mine")
    .then((r) => setData(r?.data || { eligible: false, active: [], featurable: [] }))
    .catch(() => setData({ eligible: false, active: [], featurable: [] }));
  useEffect(() => { load(); }, []);

  const feature = async (it) => {
    if (busy) return; setBusy(true);
    try { await send("POST", "/api/v1/promotions/feature", { target_type: it.target_type, target_id: it.target_id }); emitToast("Featured — it's now top of the list"); load(); }
    catch (e) { emitToast(e?.userMessage || "Couldn't feature that"); } finally { setBusy(false); }
  };
  const remove = async (p) => {
    if (busy) return; setBusy(true);
    try { await send("DELETE", `/api/v1/promotions/feature/${p.placement_id}`); emitToast("Feature removed"); load(); }
    catch (e) { emitToast(e?.userMessage || "Couldn't remove that"); } finally { setBusy(false); }
  };

  const Header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <Rocket size={17} style={{ color: C.greenDk }} />
      <strong style={{ color: C.soil, fontSize: 15 }}>Boost your postings</strong>
    </div>
  );
  const sub = <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Feature a job or service so it appears at the top of the network, marked <em>Featured</em>.</div>;

  if (data === undefined) return <div className="card" style={{ padding: 20, color: C.muted }}>Loading…</div>;

  if (!data.eligible) {
    return (
      <div className="card" style={{ padding: 18 }}>
        {Header}{sub}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FBF4E6", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "12px 14px" }}>
          <ShieldCheck size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: C.soil, lineHeight: 1.5 }}>
            Featuring is for <strong>ID-verified</strong> and <strong>Trusted</strong> members — it keeps the top spots credible.
            Verify your ID and build a real track record (logged activity, completed sales &amp; jobs) to unlock it.
          </div>
        </div>
      </div>
    );
  }

  const atCap = (data.active || []).length >= (data.max_active || 1);
  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>{Header}{sub}
        {(data.active || []).length === 0
          ? <div style={{ fontSize: 12.5, color: C.muted }}>Nothing featured right now. Pick one of your postings below.</div>
          : (data.active || []).map((p) => (
            <div key={p.placement_id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", background: "#eef7ee" }}>
              <span style={pill("var(--green-dk)", "#fff")}><Rocket size={11} style={{ verticalAlign: "-1px" }} /> Featured</span>
              <strong style={{ color: C.soil, fontSize: 13.5 }}>{p.title || p.target_id}</strong>
              <span style={pill(C.cream, C.muted)}>{TYPE_LABEL[p.target_type] || p.target_type}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>{daysLeft(p.featured_until)}</span>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto", color: C.red }} disabled={busy} onClick={() => remove(p)}><X size={13} style={{ verticalAlign: "-2px" }} /> Remove</button>
            </div>
          ))}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <strong style={{ color: C.soil, fontSize: 14 }}>Your postings</strong>
        {atCap && <div style={{ fontSize: 11.5, color: C.muted, margin: "6px 0 2px" }}>You can feature one at a time — remove the current feature to boost another.</div>}
        <div style={{ marginTop: 10 }}>
          {(data.featurable || []).length === 0
            ? <div style={{ fontSize: 12.5, color: C.muted }}>No open postings to feature. Post a job or service first, then boost it here.</div>
            : (data.featurable || []).map((it) => (
              <div key={`${it.target_type}-${it.target_id}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                <strong style={{ color: C.soil, fontSize: 13 }}>{it.title || it.target_id}</strong>
                <span style={pill(C.cream, C.muted)}>{TYPE_LABEL[it.target_type] || it.target_type}</span>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled={busy || atCap} onClick={() => feature(it)}><Rocket size={13} style={{ verticalAlign: "-2px" }} /> Feature {data.days || 7} days</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

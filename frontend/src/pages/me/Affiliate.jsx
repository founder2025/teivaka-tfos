/** Affiliate — /me/affiliate. Prototype openAffiliateDashboard parity, honest:
 *  enroll → your referral code becomes commission-bearing; commissions ACCRUE
 *  on real approved tier changes; payouts wait for the payment rail and the
 *  page says so. Link taps aren't tracked yet — shown as such, never faked. */
import { useEffect, useState } from "react";
import { Award, Copy, Check, Share2 } from "lucide-react";
import { C, getJSON, card, MeShell } from "./_meCommon";

const API = "/api/v1/affiliate";
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
async function send(method, url, body) {
  const t = localStorage.getItem("tfos_access_token");
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || `Request failed (${r.status})`);
  return j;
}

function Tile({ n, label }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.soil }}>{n}</div>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export default function Affiliate() {
  const [data, setData] = useState(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => getJSON(`${API}/me`).then((r) => { setData(r.data); setCode(r.data?.code || ""); }).catch(() => setData({}));
  useEffect(() => { load(); }, []);

  const enroll = async () => {
    setBusy(true);
    try { await send("POST", `${API}/enroll`); toast("You're an affiliate — share your link ✓", "success"); load(); }
    catch (e) { toast(String(e.message || e), "error"); } finally { setBusy(false); }
  };
  const saveCode = async () => {
    try { await send("PATCH", `${API}/code`, { code }); toast("Code saved ✓", "success"); load(); }
    catch (e) { toast(String(e.message || e), "error"); }
  };
  const copy = () => { navigator.clipboard?.writeText(data?.link || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); };

  if (data == null) return <MeShell title="Affiliate program" subtitle="Loading…"><div style={card}>Loading…</div></MeShell>;

  if (!data.enrolled) {
    return (
      <MeShell title="Become a Teivaka affiliate" subtitle="Share Teivaka in your posts and videos.">
        <div style={card}>
          <p style={{ color: C.soil, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
            When someone joins with your link and subscribes, you earn a reward — and they get a discount to start.
          </p>
          <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <strong style={{ color: C.soil, fontSize: 13.5 }}>How it works</strong>
            <div style={{ fontSize: 12.5, color: C.soil, marginTop: 4, lineHeight: 1.6 }}>
              1. Get your own link in one tap.<br />
              2. Share it in your content.<br />
              3. Earn {data.settings?.global_pct ?? 10}% when someone you bring in subscribes.
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={enroll}><Award size={14} />{busy ? "Enrolling…" : "Get my link"}</button>
        </div>
      </MeShell>
    );
  }

  if (data.status === "PAUSED" || data.status === "REJECTED") {
    return (
      <MeShell title="Affiliate program" subtitle="Account status">
        <div style={{ ...card, textAlign: "center", color: C.muted }}>Your affiliate account is paused. Contact Teivaka to reactivate it.</div>
      </MeShell>
    );
  }

  const s = data.stats || {};
  return (
    <MeShell title="Affiliate program" subtitle="Your link, your reach, your commissions — tracked from day one.">
      <div style={card}>
        <div style={{ fontSize: 12.5, color: C.muted }}>Your affiliate link</div>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", color: C.greenDk, fontWeight: 700, fontSize: 14.5, wordBreak: "break-all", margin: "4px 0 10px" }}>{data.link}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button className="btn btn-sm btn-secondary" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}Copy link</button>
          <a className="btn btn-sm btn-secondary" style={{ textDecoration: "none" }} href={`https://wa.me/?text=${encodeURIComponent(`Join Teivaka — the farm platform that makes your record bankable: ${data.link}`)}`} target="_blank" rel="noreferrer"><Share2 size={13} />Share</a>
        </div>
        <div style={{ fontSize: 12.5, color: C.muted }}>Your code (you can edit this)</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input value={code} maxLength={16} onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ flex: 1, maxWidth: 220, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "ui-monospace, Menlo, monospace", textTransform: "uppercase" }} />
          <button className="btn btn-sm btn-primary" onClick={saveCode}>Save code</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Tile n={s.clicks == null ? "—" : s.clicks} label="Link taps" />
        <Tile n={s.signups ?? 0} label="Joined" />
        <Tile n={s.conversions ?? 0} label="Subscribed" />
        <Tile n={`FJD ${(s.earned_fjd ?? 0).toFixed(2)}`} label="Earned" />
      </div>
      {s.clicks == null && <p style={{ fontSize: 11.5, color: C.muted, marginTop: -6 }}>Link taps aren't tracked yet — joins and subscriptions are the real numbers.</p>}

      <div style={{ ...card, background: C.cream }}>
        <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>Your reward rate</div>
        <div style={{ fontSize: 11.5, color: C.muted }}>Set by Teivaka · {data.settings?.basis === "RECURRING" ? "recurring" : "one-off"} · paid as {data.settings?.payout_mode === "CASH" ? "cash" : "credit"}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.greenDk, marginTop: 6 }}>{data.effective_pct}%</div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: C.soil, fontSize: 14, marginBottom: 10 }}>Your commissions</div>
        {!(data.ledger || []).length ? (
          <div style={{ color: C.muted, fontSize: 13 }}>No commission yet. Share your link to start earning.</div>
        ) : data.ledger.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: C.soil, fontSize: 13.5 }}>{l.referee_name || "A member"}</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>{l.tier} · {l.pct}% · {l.status.toLowerCase()} · {new Date(l.created_at).toLocaleDateString()}</div>
            </div>
            <strong style={{ color: C.greenDk }}>FJD {Number(l.amount_fjd).toFixed(2)}</strong>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Payouts open once Teivaka payments go live. Until then your earnings are tracked and held safely.
      </p>
    </MeShell>
  );
}

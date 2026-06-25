/**
 * SponsoredSeatsPanel — admin management for Sponsored Farmer Seats (Product 5).
 * Create a sponsoring org, mint redemption codes, watch redemptions + revenue,
 * revoke seats. FOUNDER/ADMIN only (endpoints enforce it). Codes are the money
 * path: a farmer enters one to receive the funded plan free.
 */
import { useEffect, useState } from "react";
import { getJSON, send } from "../../utils/api";
import { HeartHandshake, Plus, Ticket, Copy, Ban, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", paper: "var(--paper)", red: "var(--red)" };
const card = { background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const inp = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, width: "100%", boxSizing: "border-box", background: C.paper, color: C.soil };
const lbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, display: "block", marginBottom: 3 };
const btn = { background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const pill = (bg, fg) => ({ display: "inline-block", background: bg, color: fg, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 });
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };
const KINDS = ["NGO", "BANK", "MINISTRY", "COOP", "CORPORATE", "OTHER"];
const TIERS = [["BASIC", "Farm Pro"], ["PROFESSIONAL", "Farm Business"], ["FREE", "Free"]];

function OrgCard({ org, onChanged }) {
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(null);
  const [n, setN] = useState(10);
  const [fresh, setFresh] = useState(null);   // last-issued code batch
  const [busy, setBusy] = useState(false);

  const loadSeats = () => getJSON(`/api/v1/admin/sponsored-seats/orgs/${org.id}/seats`).then((r) => setSeats(r?.data || [])).catch(() => setSeats([]));
  useEffect(() => { if (open && seats == null) loadSeats(); }, [open]); // eslint-disable-line

  const issue = async () => {
    setBusy(true);
    try {
      const r = await send("POST", `/api/v1/admin/sponsored-seats/orgs/${org.id}/issue`, { count: Number(n) || 1 });
      setFresh(r?.data?.codes || []);
      toast(`Issued ${r?.data?.issued} seat${r?.data?.issued === 1 ? "" : "s"} ✓`, "success");
      setSeats(null); if (open) loadSeats(); onChanged?.();
    } catch (e) { toast(e.userMessage || e.message, "error"); } finally { setBusy(false); }
  };
  const revoke = async (id) => {
    if (!window.confirm("Revoke this seat? If it was redeemed, the farmer reverts to their previous plan.")) return;
    try { await send("POST", `/api/v1/admin/sponsored-seats/seats/${id}/revoke`); toast("Seat revoked", "success"); loadSeats(); onChanged?.(); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };
  const copy = (txt) => { try { navigator.clipboard.writeText(txt); toast("Copied ✓", "success"); } catch { /* noop */ } };

  const portalUrl = org.portal_token ? `${window.location.origin}/sponsor/${org.portal_token}` : null;
  const rotate = async () => {
    if (!window.confirm("Rotate the portal link? The old link will stop working immediately.")) return;
    try { await send("POST", `/api/v1/admin/sponsored-seats/orgs/${org.id}/rotate-portal`); toast("New portal link generated", "success"); onChanged?.(); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };
  const togglePortal = async () => {
    try { await send("PATCH", `/api/v1/admin/sponsored-seats/orgs/${org.id}`, { portal_enabled: !(org.portal_enabled !== false) }); toast("Portal updated", "success"); onChanged?.(); }
    catch (e) { toast(e.userMessage || e.message, "error"); }
  };

  const redeemed = Number(org.seats_redeemed || 0);
  const monthly = redeemed * Number(org.price_per_seat_fjd || 0);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: C.soil, display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14 }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{org.name}
        </button>
        <span style={pill("var(--cream)", C.greenDk)}>{org.kind}</span>
        <span style={{ fontSize: 12, color: C.muted }}>grants <strong style={{ color: C.soil }}>{org.granted_tier}</strong> · ${Number(org.price_per_seat_fjd).toFixed(0)}/seat/mo</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5 }}>
          <span style={pill("#eef7ee", C.greenDk)}>{redeemed} redeemed</span>{" "}
          <span style={{ color: C.muted }}>{org.seats_available || 0} open · {org.seats_issued || 0} issued</span>
        </span>
        <span style={{ fontWeight: 800, color: C.greenDk, fontSize: 13 }}>${monthly.toFixed(0)}/mo</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ width: 110 }}><span style={lbl}>Seats to mint</span><input type="number" min="1" value={n} onChange={(e) => setN(e.target.value)} style={inp} /></div>
        <button onClick={issue} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}><Plus size={13} />{busy ? "Minting…" : "Mint codes"}</button>
        {fresh && fresh.length > 0 && (
          <button onClick={() => copy(fresh.join("\n"))} style={{ ...btn, background: C.paper, color: C.soil, border: `1px solid ${C.line}` }}><Copy size={13} />Copy {fresh.length} new code{fresh.length === 1 ? "" : "s"}</button>
        )}
      </div>
      {fresh && fresh.length > 0 && (
        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12.5, color: C.soil, background: "var(--cream)", borderRadius: 8, padding: "8px 10px", wordBreak: "break-all" }}>
          {fresh.join("  ·  ")}
        </div>
      )}

      {/* Self-serve sponsor portal link */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap", fontSize: 12.5 }}>
        <span style={{ color: C.muted }}>Sponsor portal:</span>
        {portalUrl ? (
          <>
            <code style={{ background: "var(--cream)", borderRadius: 6, padding: "3px 7px", color: org.portal_enabled !== false ? C.soil : C.muted, textDecoration: org.portal_enabled !== false ? "none" : "line-through", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{portalUrl}</code>
            <button onClick={() => copy(portalUrl)} title="Copy link" style={{ background: "none", border: "none", cursor: "pointer", color: C.greenDk }}><Copy size={14} /></button>
            <a href={portalUrl} target="_blank" rel="noreferrer" title="Open" style={{ color: C.greenDk }}><ExternalLink size={14} /></a>
            <button onClick={rotate} title="Rotate link" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><RefreshCw size={14} /></button>
            <button onClick={togglePortal} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: org.portal_enabled !== false ? C.red : C.greenDk }}>
              {org.portal_enabled !== false ? "Disable" : "Enable"}
            </button>
          </>
        ) : <span style={{ color: C.muted }}>run migration 174 to enable</span>}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {seats == null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading seats…</div>
            : seats.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No seats minted yet.</div>
            : (
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead><tr>{["Code", "Status", "Redeemed by", "When", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "5px 8px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
                <tbody>
                  {seats.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontFamily: "monospace", fontWeight: 700, color: C.soil, cursor: "pointer" }} onClick={() => copy(s.code)} title="Copy">{s.code}</td>
                      <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}` }}>
                        <span style={pill(s.status === "REDEEMED" ? "#eef7ee" : s.status === "REVOKED" ? "#fbeaea" : "var(--cream)", s.status === "REDEEMED" ? C.greenDk : s.status === "REVOKED" ? C.red : C.muted)}>{s.status}</span>
                      </td>
                      <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{s.redeemed_farmer_name || s.redeemed_farm_label || "—"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}`, color: C.muted }}>{s.redeemed_at ? String(s.redeemed_at).slice(0, 10) : "—"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: `1px solid ${C.line}` }}>
                        {s.status !== "REVOKED" && <button onClick={() => revoke(s.id)} title="Revoke" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}><Ban size={15} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}

export default function SponsoredSeatsPanel() {
  const [orgs, setOrgs] = useState(null);
  const [no, setNo] = useState({ name: "", kind: "NGO", granted_tier: "BASIC", price_per_seat_fjd: 10, contact_email: "" });

  const load = () => getJSON("/api/v1/admin/sponsored-seats/orgs").then((r) => setOrgs(r?.data || [])).catch(() => setOrgs([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!no.name.trim()) { toast("Enter an organisation name", "error"); return; }
    try {
      await send("POST", "/api/v1/admin/sponsored-seats/orgs", {
        name: no.name.trim(), kind: no.kind, granted_tier: no.granted_tier,
        price_per_seat_fjd: Number(no.price_per_seat_fjd) || 0, contact_email: no.contact_email || null,
      });
      toast("Sponsor created ✓", "success");
      setNo({ name: "", kind: "NGO", granted_tier: "BASIC", price_per_seat_fjd: 10, contact_email: "" });
      load();
    } catch (e) { toast(e.userMessage || e.message, "error"); }
  };

  const totalMonthly = (orgs || []).reduce((a, o) => a + Number(o.seats_redeemed || 0) * Number(o.price_per_seat_fjd || 0), 0);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <HeartHandshake size={16} style={{ color: C.greenDk }} />
        <strong style={{ color: C.soil, fontSize: 15 }}>Sponsored Farmer Seats</strong>
        {totalMonthly > 0 && <span style={{ marginLeft: "auto", fontWeight: 800, color: C.greenDk, fontSize: 13 }}>${totalMonthly.toFixed(0)}/mo committed</span>}
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
        An org (bank / ministry / NGO) sponsors farmer seats; each minted code lets a farmer redeem the funded plan free.
        <strong> Billing is out-of-band</strong> (invoice the sponsor) — this manages codes, redemptions, and committed value.
      </p>

      {/* New sponsor */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 1fr 0.7fr 1.2fr auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
        <div><span style={lbl}>Organisation</span><input value={no.name} onChange={(e) => setNo({ ...no, name: e.target.value })} placeholder="Fiji Development Bank" style={inp} /></div>
        <div><span style={lbl}>Kind</span><select value={no.kind} onChange={(e) => setNo({ ...no, kind: e.target.value })} style={inp}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        <div><span style={lbl}>Grants plan</span><select value={no.granted_tier} onChange={(e) => setNo({ ...no, granted_tier: e.target.value })} style={inp}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><span style={lbl}>$/seat/mo</span><input type="number" value={no.price_per_seat_fjd} onChange={(e) => setNo({ ...no, price_per_seat_fjd: e.target.value })} style={inp} /></div>
        <div><span style={lbl}>Contact email</span><input value={no.contact_email} onChange={(e) => setNo({ ...no, contact_email: e.target.value })} placeholder="optional" style={inp} /></div>
        <button onClick={create} style={btn}><Plus size={13} />Add</button>
      </div>

      {orgs == null ? <div style={{ color: C.muted }}>Loading…</div>
        : orgs.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}><Ticket size={13} style={{ verticalAlign: "-2px" }} /> No sponsors yet — add one above, then mint codes.</div>
        : orgs.map((o) => <OrgCard key={o.id} org={o} onChanged={load} />)}
    </div>
  );
}

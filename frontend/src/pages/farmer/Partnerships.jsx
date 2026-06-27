/**
 * Partnerships.jsx — /farm/partnerships — the farm's people + land & profit-share.
 *
 * Land & profit-share  GET /partnerships/agreement (farms.profit_share_*, shown only with a
 *   real rate — Inviolable #9) + per-cycle splits GET /profit-share. "Edit/New agreement" →
 *   POST /partnerships/agreement (PARTNERSHIP_CREATED, hash-chained).
 * Network (5 groups / 14 types): GET /partners (tenant.farm_partners, farm-scoped). Add →
 *   POST /partners (PARTNER_ADDED). Edit/Delete → PATCH /partners/{id} (delete = soft
 *   is_active:false, preserves the audit row). Buyers/Suppliers link out (counts are
 *   tenant-wide → labelled "across your farms").
 *
 * Redesign (audit-approved 2026-06-27):
 *  PN1  real loading + error/retry states (getJSON/send, token refresh) — never silent-empty
 *  PN2  buyer/supplier counts honestly labelled tenant-wide
 *  PN3  distribution date reads the real column (calculated_at)
 *  PN4  delete a partner (soft-delete via PATCH is_active:false, confirmed)
 *  +    land agreement elevated; "Edit agreement" when one exists (no fake "add multiple");
 *       groups collapse to a one-line summary (no wall of "None added yet"); network
 *       completeness glance; tap-to-call / WhatsApp; a11y modals (role/Esc); formatMoney.
 *  Honest: the split archive copy states how splits are actually created — auto-calc-on-close
 *  is a filed backend keystone, not faked here.
 */
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Map as MapIcon, Plus, X, Pencil, Trash2, Phone, MessageCircle, Shield, Truck,
  ShoppingBag, ArrowRight, Star, DollarSign, Banknote, FlaskConical, Leaf, Award, BookOpen,
  ChevronDown, ChevronRight, AlertTriangle, RefreshCw,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, send } from "../../utils/api";
import { formatMoney } from "../../utils/money";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const fjd = (v) => formatMoney(Number(v ?? 0), { decimals: 0 });
const fdate = (iso) => (iso ? String(iso).slice(0, 10) : "—");
const telHref = (p) => { const d = (p || "").replace(/[^\d+]/g, ""); return d ? `tel:${d}` : null; };
const waHref = (p) => { const d = (p || "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : null; };
function useEsc(onClose) { useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]); }

const PARTNER_GROUPS = [
  { id: "government", name: "Government", icon: Shield, desc: "Ministries and extension officers who back your farm.",
    types: [{ id: "ministries", name: "Ministries", icon: Shield }, { id: "extension", name: "Extension officers", icon: BookOpen }] },
  { id: "commercial", name: "Commercial", icon: Truck, desc: "The people who buy from you and supply you.",
    types: [{ id: "buyers", name: "Buyers", icon: ShoppingBag, link: "/farm/market" }, { id: "suppliers", name: "Suppliers", icon: Truck, link: "/farm/resources" }, { id: "exporters", name: "Exporters", icon: ArrowRight }] },
  { id: "finance", name: "Finance", icon: DollarSign, desc: "Banks, investors and lenders behind your growth.",
    types: [{ id: "investors", name: "Investors", icon: Star }, { id: "banks", name: "Banks", icon: DollarSign }, { id: "microfinance", name: "Microfinance", icon: Banknote }] },
  { id: "support", name: "Support services", icon: FlaskConical, desc: "Vets, agronomists and advisors who keep your farm healthy.",
    types: [{ id: "vets", name: "Vets", icon: FlaskConical }, { id: "agronomists", name: "Agronomists", icon: Leaf }, { id: "advisors", name: "Advisors", icon: Award }] },
  { id: "development", name: "Development", icon: Users, desc: "NGOs, cooperatives and farmer groups you belong to.",
    types: [{ id: "ngos", name: "NGOs", icon: Users }, { id: "coops", name: "Cooperatives", icon: Users }, { id: "groups", name: "Farmer groups", icon: Users }] },
];

function ErrorCard({ onRetry, label = "Couldn't load this" }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 700, color: "var(--soil)" }}>{label}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>A loading problem, not missing data. Try again.</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={onRetry}><RefreshCw size={13} aria-hidden />Retry</button>
        </div>
      </div>
    </div>
  );
}
function SkeletonCard() { return <div className="card" style={{ height: 76, marginBottom: 14, background: "var(--paper)" }} aria-busy="true" />; }

// ── Add / edit partner ───────────────────────────────────────────────
function PartnerModal({ farmId, group, type, edit, onClose, onSaved }) {
  useEsc(onClose);
  const [name, setName] = useState(edit?.name || "");
  const [phone, setPhone] = useState(edit?.phone || "");
  const [notes, setNotes] = useState(edit?.notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const singular = type.name.replace(/s$/, "");
  async function save() {
    if (!name.trim()) { setErr("Add a name first."); return; }
    setBusy(true); setErr("");
    try {
      if (edit) {
        await send("PATCH", `/api/v1/partners/${encodeURIComponent(edit.partner_id)}`, { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null });
        emitToast(`Saved · ${name.trim()} updated`);
      } else {
        await send("POST", "/api/v1/partners", { farm_id: farmId, partner_group: group.id, partner_type: type.id, name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null });
        emitToast(`Partner saved · ${name.trim()} added to your ${type.name}`);
      }
      onSaved();
    } catch (e) { setErr(e?.userMessage || String(e?.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-label={edit ? `Edit ${singular}` : `Add ${singular}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{edit ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="form-row"><label>Name</label><input placeholder="Who is this?" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-row"><label>Phone (optional)</label><input placeholder="Their number" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="form-row"><label>Notes (optional)</label><input placeholder="What they help with" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ───────────────────────────────────────────────────
function DeleteConfirm({ partner, onClose, onDone }) {
  useEsc(onClose);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try { await send("PATCH", `/api/v1/partners/${encodeURIComponent(partner.partner_id)}`, { is_active: false }); emitToast(`Removed · ${partner.name}`); onDone(); }
    catch (e) { setErr(e?.userMessage || "Couldn't remove — try again."); setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 420 }} role="dialog" aria-modal="true" aria-label="Remove partner" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Remove this partner?</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body"><div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.6 }}>Remove <strong>{partner.name}</strong> from your network. The original record stays on your audit chain; it just leaves your active list.</div>{err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{err}</div>}</div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" style={{ background: "var(--red)" }} disabled={busy} onClick={go}>{busy ? "Removing…" : "Remove"}</button></div>
      </div>
    </div>
  );
}

// ── New / edit agreement ─────────────────────────────────────────────
function AgreementModal({ farmId, existing, onClose, onSaved }) {
  useEsc(onClose);
  const [party, setParty] = useState(existing?.party || "");
  const [rate, setRate] = useState(existing?.rate_pct ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!party.trim() || rate === "" || Number(rate) <= 0 || Number(rate) >= 100) { setErr("Partner name and a rate between 0 and 100 are required."); return; }
    setBusy(true); setErr("");
    try {
      await send("POST", "/api/v1/partnerships/agreement", { farm_id: farmId, profit_share_party: party.trim(), profit_share_rate_pct: Number(rate), notes: notes.trim() || null });
      emitToast("Agreement recorded · PARTNERSHIP_CREATED · hash-chained");
      onSaved();
    } catch (e) { setErr(e?.userMessage || String(e?.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-label={existing ? "Edit agreement" : "New agreement"} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{existing ? "Edit agreement" : "New agreement"}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6 }}><Shield size={11} /> {existing ? "Updates" : "Creates"} a PARTNERSHIP_CREATED audit event. The profit-share rate goes on your farm record and drives every per-cycle split. Use the exact figure from your agreement — this is a contractual number. Each farm holds one land agreement; saving replaces the current rate.</div>
          <div className="form-row"><label>Partner (landowner)</label><input placeholder="Who is the agreement with?" value={party} onChange={(e) => setParty(e.target.value)} /></div>
          <div className="form-row"><label>Profit-share rate (%)</label><input type="number" min="1" max="99" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="form-row"><label>Ratification notes (if off-platform agreement)</label><textarea rows={2} placeholder="Original agreement context — e.g. verbal 2024-03-15, lease 2-year term" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : existing ? "Save" : "Create partnership"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Distribution archive ─────────────────────────────────────────────
function AgreementDetail({ agreement, distQ, onClose, onEdit }) {
  useEsc(onClose);
  const navigate = useNavigate();
  const distributions = distQ.data || [];
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-label="Partnership detail" onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Partnership — {agreement.party || "Landowner"}</h2><button className="overlay-close" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "var(--soil)", marginBottom: 14 }}>
            <div><span style={{ color: "var(--muted)", fontSize: 10.5 }}>PARTNER</span><br />{agreement.party || "—"}</div>
            <div><span style={{ color: "var(--muted)", fontSize: 10.5 }}>RATE</span><br />{agreement.rate_pct}% net profit</div>
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Distribution archive · per closed cycle</div>
          {distQ.isError ? <ErrorCard onRetry={() => distQ.refetch()} label="Couldn't load distributions" />
            : distributions.length === 0
              ? <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>No splits recorded yet. A landowner split is calculated from a cycle's net profit when that cycle's split is run — splits you've recorded appear here.</div>
              : distributions.map((p, i) => (
                <div key={p.share_id || i} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <strong style={{ color: "var(--soil)" }}>{p.production_name || p.cycle_name || "Crop run"}</strong>
                    <span style={{ color: "var(--muted)" }}>{fdate(p.calculated_at || p.calculation_date || p.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                    <span>Net profit <strong style={{ color: "var(--soil)" }}>{fjd(p.net_profit_fjd)}</strong></span>
                    <span>Landowner <strong style={{ color: "var(--green-dk)" }}>{fjd(p.landowner_share_fjd)}</strong></span>
                    <span>You keep <strong style={{ color: "var(--soil)" }}>{fjd(p.operator_share_fjd)}</strong></span>
                    {p.payment_status ? <span style={{ marginLeft: "auto", color: "var(--muted)" }}>{p.payment_status}</span> : null}
                  </div>
                </div>
              ))}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={() => navigate(`/tis?q=${encodeURIComponent(`Is a ${agreement.rate_pct}% net profit-share with my landowner a fair, standard arrangement for leased land in Fiji?`)}`)}>Ask TIS</button>
          <button className="btn btn-secondary" onClick={onEdit}><Pencil size={13} />Edit agreement</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
function PartnershipsInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [addFor, setAddFor] = useState(null);
  const [editPartner, setEditPartner] = useState(null);
  const [delPartner, setDelPartner] = useState(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeDetail, setAgreeDetail] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [pq, setPq] = useState("");
  const term = pq.trim().toLowerCase();
  const matchP = (p) => !term || `${p.name} ${p.notes || ""}`.toLowerCase().includes(term);

  const partnersQ = useQuery({ queryKey: ["pn-partners", farmId], enabled: !!farmId, retry: 1, queryFn: () => getJSON(`/api/v1/partners?farm_id=${encodeURIComponent(farmId)}`).then((r) => r.data || []) });
  const agreementQ = useQuery({ queryKey: ["pn-agree", farmId], enabled: !!farmId, retry: 1, queryFn: () => getJSON(`/api/v1/partnerships/agreement?farm_id=${encodeURIComponent(farmId)}`).then((r) => r.data?.agreement || null) });
  // lazy: only fetch splits when an agreement exists (the only place they're shown)
  const distQ = useQuery({ queryKey: ["pn-dist", farmId], enabled: !!farmId && !!agreementQ.data, retry: 1, queryFn: () => getJSON(`/api/v1/profit-share?farm_id=${encodeURIComponent(farmId)}`).then((r) => r.data || []) });
  const buyersQ = useQuery({ queryKey: ["pn-buyers"], retry: 1, queryFn: () => getJSON("/api/v1/customers").then((r) => (r.data || []).length) });
  const suppliersQ = useQuery({ queryKey: ["pn-suppliers"], retry: 1, queryFn: () => getJSON("/api/v1/suppliers").then((r) => (r.data || []).length) });

  const partners = partnersQ.data ?? [];
  const agreement = agreementQ.data ?? null;
  const distributions = distQ.data ?? [];

  const byType = {};
  partners.forEach((p) => { (byType[p.partner_type] = byType[p.partner_type] || []).push(p); });
  const countFor = (t) => (t.id === "buyers" ? (buyersQ.data ?? null) : t.id === "suppliers" ? (suppliersQ.data ?? null) : (byType[t.id] || []).length);
  // group total + completeness count ONLY the farm's own partners — NOT the tenant-wide
  // buyers/suppliers link-types (PX-1: those would inflate Commercial / "N of 5 active").
  const groupTotal = (g) => g.types.reduce((n, t) => n + (t.link ? 0 : (byType[t.id] || []).length), 0);
  const groupsActive = PARTNER_GROUPS.filter((g) => groupTotal(g) > 0).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["pn-partners", farmId] });
  const updatedAt = Math.max(0, ...[partnersQ, agreementQ].map((q) => q.dataUpdatedAt || 0));
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-FJ", { hour: "2-digit", minute: "2-digit", timeZone: "Pacific/Fiji" }) : null;

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Partnerships</h1><div className="subtitle">Everyone you work with{updatedLabel ? ` · updated ${updatedLabel}` : ""}</div></div>
            <div className="page-actions"><FarmSelector /></div>
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its network.</div> : (
            <>
              {/* ── Land & profit-share (elevated) ── */}
              {agreementQ.isError ? <ErrorCard onRetry={() => agreementQ.refetch()} label="Couldn't load your land agreement" /> : (
                <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid var(--amber)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: "var(--amber)" }}><MapIcon size={18} /></span>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--soil)" }}>Land &amp; profit-share</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Your landowner agreement and how profit is shared</div>
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => setAgreeOpen(true)}><Plus size={12} /> {agreement ? "Edit agreement" : "New agreement"}</button>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    {agreementQ.isLoading && !agreementQ.data ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
                      : !agreement ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No land agreement recorded yet. Add your landowner profit-share to bring it into your record.</div>
                      : (
                        <div className="partnership-card" role="button" tabIndex={0} onClick={() => setAgreeDetail(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAgreeDetail(true); } }} style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ color: "var(--soil)" }}>{agreement.party || "Landowner"}</strong>
                            <span style={{ fontSize: 12, color: "var(--green-dk)", fontWeight: 600 }}>{agreement.rate_pct}% net profit</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{distributions.length > 0 ? `${distributions.length} split${distributions.length === 1 ? "" : "s"} recorded · tap for the archive` : "No splits recorded yet · tap to see how splits work"}</div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* ── Network ── */}
              {partnersQ.isError ? <ErrorCard onRetry={() => partnersQ.refetch()} label="Couldn't load your network" />
                : partnersQ.isLoading && !partnersQ.data ? <><SkeletonCard /><SkeletonCard /></>
                : (
                  <>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 2px 10px" }}>Network · <strong style={{ color: "var(--soil)" }}>{groupsActive} of {PARTNER_GROUPS.length}</strong> groups active. Add the people and groups you work with — each builds your record.</div>
                    {partners.length > 6 && (
                      <div className="form-row" style={{ marginBottom: 10 }}>
                        <input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Find a partner by name or note…" aria-label="Search partners" />
                      </div>
                    )}
                    {PARTNER_GROUPS.map((g) => {
                      const total = groupTotal(g);
                      // during a search, hide groups with no matching partner; otherwise default-open when populated
                      const groupHasMatch = g.types.some((t) => !t.link && (byType[t.id] || []).some(matchP));
                      if (term && !groupHasMatch) return null;
                      const isOpen = term ? true : (openGroups[g.id] ?? (total > 0));
                      return (
                        <div className="card" key={g.id} style={{ marginBottom: 12 }}>
                          <button onClick={() => setOpenGroups((s) => ({ ...s, [g.id]: !isOpen }))} aria-expanded={isOpen}
                            style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "13px 16px", background: "none", border: "none", borderBottom: isOpen ? "1px solid var(--line)" : "none", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ color: "var(--green)" }}><g.icon size={18} /></span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: "var(--soil)" }}>{g.name}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.desc}</div>
                            </div>
                            <span style={{ fontSize: 12, color: total ? "var(--green-dk)" : "var(--muted)", fontWeight: 600 }}>{total || "—"}</span>
                            <span style={{ color: "var(--muted)" }}>{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                          </button>
                          {isOpen && (
                            <div style={{ padding: "6px 8px" }}>
                              {g.types.map((t) => {
                                const n = countFor(t);
                                const list = (byType[t.id] || []).filter(matchP);
                                if (term && (t.link || list.length === 0)) return null;   // search: only matching people rows
                                return (
                                  <div key={t.id}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                                      <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                                        <span style={{ color: "var(--soil-2)" }}><t.icon size={15} /></span>
                                        <span style={{ fontSize: 13.5, color: "var(--soil)", fontWeight: 500 }}>{t.name}</span>
                                      </span>
                                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <span style={{ fontSize: 12.5, color: n ? "var(--soil)" : "var(--muted)" }}>{t.link ? (n != null ? `${n} · across your farms` : "—") : (list.length ? `${list.length} added` : "None added yet")}</span>
                                        {t.link
                                          ? <button className="btn btn-sm btn-secondary" onClick={() => navigate(t.link)}>Manage</button>
                                          : <button className="btn btn-sm btn-secondary" onClick={() => setAddFor({ group: g, type: t })}><Plus size={11} /> Add</button>}
                                      </div>
                                    </div>
                                    {!t.link && list.map((p) => (
                                      <div key={p.partner_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 8px 7px 32px", borderBottom: "1px solid var(--cream-2)", background: "var(--cream-2)" }}>
                                        <div style={{ fontSize: 12.5, color: "var(--soil)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}{p.notes ? <span style={{ color: "var(--muted)", fontSize: 11.5 }}> · {p.notes}</span> : null}</div>
                                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                                          {p.phone && telHref(p.phone) && <a className="btn btn-sm btn-secondary" href={telHref(p.phone)} title={`Call ${p.phone}`} aria-label={`Call ${p.name}`}><Phone size={11} /></a>}
                                          {p.phone && waHref(p.phone) && <a className="btn btn-sm btn-secondary" href={waHref(p.phone)} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${p.name}`}><MessageCircle size={11} /></a>}
                                          <button className="btn btn-sm btn-secondary" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setEditPartner({ group: g, type: t, edit: p })}><Pencil size={11} /></button>
                                          <button className="btn btn-sm btn-secondary" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => setDelPartner(p)}><Trash2 size={11} /></button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
            </>
          )}

          {addFor && <PartnerModal farmId={farmId} group={addFor.group} type={addFor.type} onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); refresh(); }} />}
          {editPartner && <PartnerModal farmId={farmId} group={editPartner.group} type={editPartner.type} edit={editPartner.edit} onClose={() => setEditPartner(null)} onSaved={() => { setEditPartner(null); refresh(); }} />}
          {delPartner && <DeleteConfirm partner={delPartner} onClose={() => setDelPartner(null)} onDone={() => { setDelPartner(null); refresh(); }} />}
          {agreeOpen && <AgreementModal farmId={farmId} existing={agreement} onClose={() => setAgreeOpen(false)} onSaved={() => { setAgreeOpen(false); qc.invalidateQueries({ queryKey: ["pn-agree", farmId] }); }} />}
          {agreeDetail && agreement && <AgreementDetail agreement={agreement} distQ={distQ} onClose={() => setAgreeDetail(false)} onEdit={() => { setAgreeDetail(false); setAgreeOpen(true); }} />}
        </div>
      </main>
    </TfpShell>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Partnerships() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <PartnershipsInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

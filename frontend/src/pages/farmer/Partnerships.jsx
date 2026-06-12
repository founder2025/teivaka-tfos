/**
 * Partnerships.jsx — /farm/partnerships — PIXEL-EXACT prototype corePartnershipsView.
 *
 * Land & profit-share  GET /partnerships/agreement (farms.profit_share_* — shown
 *   only when a real rate is on record, Inviolable #9) + per-cycle distribution
 *   rows from GET /profit-share. "New agreement" → POST /partnerships/agreement
 *   (PARTNERSHIP_CREATED, hash-chained). Agreement card opens a detail modal with
 *   the real distribution archive.
 *
 * The 5 network groups (Government / Commercial / Finance / Support / Development,
 *   14 types):
 *   - Buyers     count = real customers → Manage → /farm/buyers
 *   - Suppliers  count = real tenant.suppliers → Manage → /farm/inventory
 *   - all others GET /partners (tenant.farm_partners) · "+ Add" → POST /partners
 *     (PARTNER_ADDED, hash-chained) · rows with partners expand to the real list
 *     with an Edit pencil → PATCH /partners/{id}.
 * Honest-empty everywhere ("None added yet") — nothing fabricated.
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Map as MapIcon, Plus, X, Pencil, Shield, Truck, ShoppingBag, ArrowRight,
  Star, DollarSign, Banknote, FlaskConical, Leaf, Award, BookOpen,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
async function get(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function send(url, method, body) {
  const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof b?.detail === "string" ? b.detail : b?.detail?.message || `HTTP ${r.status}`);
  return b;
}
function fjd(v) { const n = Number(v ?? 0); return `FJD ${n.toLocaleString("en-FJ", { maximumFractionDigits: 0 })}`; }
function fdate(iso) { if (!iso) return "—"; return String(iso).slice(0, 10); }

// Exact prototype PARTNER_GROUPS (ids, names, descs, types).
const PARTNER_GROUPS = [
  { id: "government", name: "Government", icon: Shield, desc: "Ministries and extension officers who back your farm.",
    types: [{ id: "ministries", name: "Ministries", icon: Shield }, { id: "extension", name: "Extension officers", icon: BookOpen }] },
  { id: "commercial", name: "Commercial", icon: Truck, desc: "The people who buy from you and supply you.",
    types: [{ id: "buyers", name: "Buyers", icon: ShoppingBag, link: "/farm/buyers" }, { id: "suppliers", name: "Suppliers", icon: Truck, link: "/farm/inventory" }, { id: "exporters", name: "Exporters", icon: ArrowRight }] },
  { id: "finance", name: "Finance", icon: DollarSign, desc: "Banks, investors and lenders behind your growth.",
    types: [{ id: "investors", name: "Investors", icon: Star }, { id: "banks", name: "Banks", icon: DollarSign }, { id: "microfinance", name: "Microfinance", icon: Banknote }] },
  { id: "support", name: "Support services", icon: FlaskConical, desc: "Vets, agronomists and advisors who keep your farm healthy.",
    types: [{ id: "vets", name: "Vets", icon: FlaskConical }, { id: "agronomists", name: "Agronomists", icon: Leaf }, { id: "advisors", name: "Advisors", icon: Award }] },
  { id: "development", name: "Development", icon: Users, desc: "NGOs, cooperatives and farmer groups you belong to.",
    types: [{ id: "ngos", name: "NGOs", icon: Users }, { id: "coops", name: "Cooperatives", icon: Users }, { id: "groups", name: "Farmer groups", icon: Users }] },
];

// ── Add / edit partner modal (real POST/PATCH /partners) ───────────────────
function PartnerModal({ farmId, group, type, edit, onClose, onSaved }) {
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
        await send(`/api/v1/partners/${encodeURIComponent(edit.partner_id)}`, "PATCH", { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null });
        emitToast(`Saved · ${name.trim()} updated`);
      } else {
        await send("/api/v1/partners", "POST", { farm_id: farmId, partner_group: group.id, partner_type: type.id, name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null });
        emitToast(`Partner saved · ${name.trim()} added to your ${type.name}`);
      }
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{edit ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
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

// ── New agreement modal (real POST /partnerships/agreement) ────────────────
function AgreementModal({ farmId, existing, onClose, onSaved }) {
  const [party, setParty] = useState(existing?.party || "");
  const [rate, setRate] = useState(existing?.rate_pct ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!party.trim() || rate === "" || Number(rate) <= 0 || Number(rate) >= 100) { setErr("Partner name and a rate between 0 and 100 are required."); return; }
    setBusy(true); setErr("");
    try {
      await send("/api/v1/partnerships/agreement", "POST", { farm_id: farmId, profit_share_party: party.trim(), profit_share_rate_pct: Number(rate), notes: notes.trim() || null });
      emitToast("Agreement recorded · PARTNERSHIP_CREATED · hash-chained");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>{existing ? "Edit agreement" : "New agreement"}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6 }}><Shield size={11} /> Creates a PARTNERSHIP_CREATED audit event. The profit-share rate goes on your farm record and drives every per-cycle split calculation. Use the exact figure from your agreement — this is a contractual number.</div>
          <div className="form-row"><label>Partner (landowner)</label><input placeholder="Who is the agreement with?" value={party} onChange={(e) => setParty(e.target.value)} /></div>
          <div className="form-row"><label>Profit-share rate (%)</label><input type="number" min="1" max="99" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="form-row"><label>Ratification notes (if offplatform agreement)</label><textarea rows={2} placeholder="Original agreement context — e.g. verbal 2024-03-15, lease 2-year term" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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

// ── Agreement detail modal (real distribution archive) ─────────────────────
function AgreementDetail({ agreement, distributions, onClose, onEdit }) {
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 620 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="overlay-head"><h2>Partnership — {agreement.party || "Landowner"}</h2><button className="overlay-close" onClick={onClose}><X size={14} /></button></div>
        <div className="overlay-body">
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Agreement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "var(--soil)", marginBottom: 14 }}>
            <div><span style={{ color: "var(--muted)", fontSize: 10.5 }}>PARTNER</span><br />{agreement.party || "—"}</div>
            <div><span style={{ color: "var(--muted)", fontSize: 10.5 }}>RATE</span><br />{agreement.rate_pct}% net profit</div>
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 6 }}>Distribution archive · per closed cycle</div>
          {distributions.length === 0
            ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No distributions calculated yet. Splits are computed per cycle when a cycle closes with revenue on record.</div>
            : distributions.map((p, i) => (
              <div key={p.share_id || i} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <strong style={{ color: "var(--soil)" }}>{p.production_name || p.cycle_name || p.cycle_id}</strong>
                  <span style={{ color: "var(--muted)" }}>{fdate(p.calculation_date || p.created_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12 }}>
                  <span>Net profit <strong style={{ color: "var(--soil)" }}>{fjd(p.net_profit_fjd)}</strong></span>
                  <span>Landowner <strong style={{ color: "var(--green-dk)" }}>{fjd(p.landowner_share_fjd)}</strong></span>
                  <span>You keep <strong style={{ color: "var(--soil)" }}>{fjd(p.operator_share_fjd)}</strong></span>
                  <span style={{ marginLeft: "auto", color: "var(--muted)" }}>{p.payment_status}</span>
                </div>
              </div>
            ))}
        </div>
        <div className="overlay-foot">
          <button className="btn btn-secondary" onClick={onEdit}><Pencil size={13} />Edit agreement</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
function PartnershipsInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { farmId } = useCurrentFarm();
  const [addFor, setAddFor] = useState(null);      // {group, type}
  const [editPartner, setEditPartner] = useState(null); // {group, type, edit}
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeDetail, setAgreeDetail] = useState(false);
  const [expanded, setExpanded] = useState({});    // typeId → bool

  const partnersQ = useQuery({ queryKey: ["pn-partners", farmId], queryFn: () => get(`/api/v1/partners?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const agreementQ = useQuery({ queryKey: ["pn-agree", farmId], queryFn: () => get(`/api/v1/partnerships/agreement?farm_id=${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const distQ = useQuery({ queryKey: ["pn-dist", farmId], queryFn: () => get(`/api/v1/profit-share?farm_id=${encodeURIComponent(farmId)}`).catch(() => ({ data: [] })), enabled: !!farmId });
  const buyersQ = useQuery({ queryKey: ["pn-buyers", farmId], queryFn: () => get("/api/v1/customers").catch(() => ({ data: [] })) });
  const suppliersQ = useQuery({ queryKey: ["pn-suppliers"], queryFn: () => get("/api/v1/suppliers").catch(() => ({ data: [] })) });

  const partners = partnersQ.data?.data ?? [];
  const agreement = agreementQ.data?.data?.agreement || null;
  const distributions = distQ.data?.data ?? [];
  const buyersN = (buyersQ.data?.data ?? []).length;
  const suppliersN = (suppliersQ.data?.data ?? []).length;

  const byType = {};
  partners.forEach((p) => { (byType[p.partner_type] = byType[p.partner_type] || []).push(p); });
  const countFor = (t) => (t.id === "buyers" ? buyersN : t.id === "suppliers" ? suppliersN : (byType[t.id] || []).length);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["pn-partners", farmId] }); };

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Partnerships</h1><div className="subtitle">Everyone you work with — the people and organisations behind your farm</div></div>
            <div className="page-actions"><FarmSelector /></div>
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its network.</div> : (
            <>
              <div className="card" style={{ padding: "14px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }}><Users size={16} /></span>
                <div style={{ fontSize: 13, color: "var(--soil)", lineHeight: 1.5 }}>Your farm network in one place. Add the people and groups you work with — each one builds your record. Buyers link to your Buyers page; banks and investors connect to your Bank Evidence.</div>
              </div>

              {/* ── Land & profit-share ── */}
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "var(--amber)" }}><MapIcon size={18} /></span>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--soil)" }}>Land &amp; profit-share</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Your landowner agreements and how profit is shared</div>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => setAgreeOpen(true)}><Plus size={12} /> New agreement</button>
                </div>
                <div style={{ padding: "12px 16px" }}>
                  {!agreement
                    ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No land agreement recorded yet. Add your landowner profit-share to bring it into your record.</div>
                    : (
                      <div className="partnership-card" onClick={() => setAgreeDetail(true)} style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ color: "var(--soil)" }}>{agreement.party || "Landowner"}</strong>
                          <span style={{ fontSize: 12, color: "var(--green-dk)", fontWeight: 600 }}>{agreement.rate_pct}% net profit</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{distributions.length} distribution{distributions.length === 1 ? "" : "s"} calculated · per closed cycle</div>
                      </div>
                    )}
                </div>
              </div>

              {/* ── The 5 network groups ── */}
              {PARTNER_GROUPS.map((g) => (
                <div className="card" key={g.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--green)" }}><g.icon size={18} /></span>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--soil)" }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.desc}</div>
                    </div>
                  </div>
                  <div style={{ padding: "6px 8px" }}>
                    {g.types.map((t) => {
                      const n = countFor(t);
                      const list = byType[t.id] || [];
                      const expandable = !t.link && list.length > 0;
                      return (
                        <div key={t.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: "1px solid var(--cream-2)" }}>
                            <div style={{ display: "flex", gap: 9, alignItems: "center", cursor: expandable ? "pointer" : "default" }}
                              onClick={() => expandable && setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}>
                              <span style={{ color: "var(--soil-2)" }}><t.icon size={15} /></span>
                              <span style={{ fontSize: 13.5, color: "var(--soil)", fontWeight: 500 }}>{t.name}</span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 12.5, color: n > 0 ? "var(--soil)" : "var(--muted)" }}>{n > 0 ? `${n} added` : "None added yet"}</span>
                              {t.link
                                ? <button className="btn btn-sm btn-secondary" onClick={() => navigate(t.link)}>Manage</button>
                                : <button className="btn btn-sm btn-secondary" onClick={() => setAddFor({ group: g, type: t })}><Plus size={11} /> Add</button>}
                            </div>
                          </div>
                          {expandable && expanded[t.id] && list.map((p) => (
                            <div key={p.partner_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px 7px 32px", borderBottom: "1px solid var(--cream-2)", background: "var(--cream-2)" }}>
                              <div style={{ fontSize: 12.5, color: "var(--soil)" }}>{p.name}{p.phone ? <span style={{ color: "var(--muted)" }}> · {p.phone}</span> : null}{p.notes ? <span style={{ color: "var(--muted)", fontSize: 11.5 }}> · {p.notes}</span> : null}</div>
                              <button className="btn btn-sm btn-secondary" title="Edit" onClick={() => setEditPartner({ group: g, type: t, edit: p })}><Pencil size={11} /></button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {addFor && <PartnerModal farmId={farmId} group={addFor.group} type={addFor.type} onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); refresh(); }} />}
          {editPartner && <PartnerModal farmId={farmId} group={editPartner.group} type={editPartner.type} edit={editPartner.edit} onClose={() => setEditPartner(null)} onSaved={() => { setEditPartner(null); refresh(); }} />}
          {agreeOpen && <AgreementModal farmId={farmId} existing={agreement} onClose={() => setAgreeOpen(false)} onSaved={() => { setAgreeOpen(false); qc.invalidateQueries({ queryKey: ["pn-agree", farmId] }); }} />}
          {agreeDetail && agreement && <AgreementDetail agreement={agreement} distributions={distributions} onClose={() => setAgreeDetail(false)} onEdit={() => { setAgreeDetail(false); setAgreeOpen(true); }} />}
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

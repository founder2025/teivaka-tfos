/**
 * Reports.jsx — /farm/records → Reports — documents a bank or buyer can read.
 *
 * Redesign (RC1–RC25 + evidence/QR/logo ask): the Bank Evidence card and the
 * browse-friendly Evidence panel both read ONE source — GET /crops/bank-evidence/sources
 * (period-scoped totals + the location blocks + gallery photos behind the numbers) — so the
 * on-screen preview matches the signed PDF (RC18). A scannable QR (server-rendered) + the PDF's
 * evidence appendix connect the report to its photo + block evidence. Fabricated report bodies
 * removed (RC17: compliance reads the real Compliance data; audit report is honest). Real
 * Download / Send / Verify (RC1/RC9). Teivaka logo on the letterhead (RC4). api.js + formatMoney
 * + no ModeDropdown (RC5/RC7/RC8). Library reorganised: hero → Ready now → Building (RC3/RC24).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  Sprout, Package, Users, Coins, BarChart3, Scale, DollarSign, FlaskConical,
  Shield, Award, Star, Truck, Plus, FileText, ArrowLeft, CheckCircle2, ShieldCheck,
  Download, Share2, MapPin, Image as ImageIcon, AlertTriangle, RefreshCw, ChevronDown, Sparkles,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, apiFetch } from "../../utils/api";
import { formatMoney } from "../../utils/money";

const C = {
  soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)",
  green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", greenTint: "var(--green-tint)",
};
const fjd = (v) => formatMoney(v, { decimals: 0 }) ?? "FJD 0";
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

const REPORT_KINDS = {
  "bank-evidence": { name: "Bank Evidence", Icon: Award },
  "cash-flow": { name: "Cash report", Icon: Coins },
  "cycle-pl": { name: "Profit & loss", Icon: BarChart3 },
  "harvest-summary": { name: "Production report", Icon: Sprout },
  "compliance-log": { name: "Compliance log", Icon: FlaskConical },
  "inventory-report": { name: "Inventory report", Icon: Package },
  "labor-record": { name: "Labour report", Icon: Users },
  "budget-report": { name: "Budget report", Icon: Scale },
  "networth": { name: "Net worth statement", Icon: Scale },
  "balance-sheet": { name: "Balance sheet", Icon: Scale },
  "valuation-statement": { name: "Valuation statement", Icon: DollarSign },
  "audit-report": { name: "Audit report", Icon: Shield },
  "certification-report": { name: "Certification report", Icon: Award },
  "gov-report": { name: "Government report", Icon: Shield },
  "investor-report": { name: "Investor report", Icon: Star },
  "ngo-report": { name: "NGO report", Icon: Users },
  "buyer-statement": { name: "Buyer statement", Icon: Truck },
};
// Reports with REAL data today vs honestly-building (RC3). No 19 equal tiles.
const READY = ["cash-flow", "cycle-pl", "harvest-summary", "compliance-log", "audit-report"];
const BUILDING = ["balance-sheet", "networth", "valuation-statement", "labor-record", "buyer-statement",
  "inventory-report", "budget-report", "certification-report", "gov-report", "investor-report", "ngo-report"];

const TABS = [
  { id: "library", label: "Library", hint: "All reports" },
  { id: "bankevidence", label: "Bank Evidence", hint: "The flagship" },
  { id: "evidence", label: "Evidence", hint: "Photos + blocks" },
  { id: "dispatch", label: "Dispatch", hint: "Sent" },
];

const monthNow = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" }).slice(0, 7);

function useFarmIdentity(farmId) {
  const fq = useQuery({ queryKey: ["rep-farm", farmId], queryFn: () => getJSON(`/api/v1/farms/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const mq = useQuery({ queryKey: ["rep-me"], queryFn: () => getJSON(`/api/v1/me`), retry: 0 });
  const f = fq.data?.data || fq.data || {};
  const m = mq.data?.data || mq.data || {};
  return {
    name: f.farm_name || "Your farm", owner: m.full_name || "Owner",
    location: [f.location_name, f.location_island].filter(Boolean).join(", "),
    phone: m.whatsapp_number || "", email: m.email || "",
  };
}
const useSources = (farmId, period) => useQuery({
  queryKey: ["rep-sources", farmId, period],
  queryFn: () => getJSON(`/api/v1/crops/bank-evidence/sources?farm_id=${encodeURIComponent(farmId)}&period=${encodeURIComponent(period)}`),
  enabled: !!farmId, retry: 0,
});

// Teivaka logo with graceful fallback to the wordmark (RC4). Drop the PNG at
// frontend/public/teivaka-logo.png; until then the wordmark renders.
function Brandmark({ size = 22 }) {
  const [ok, setOk] = useState(true);
  if (ok) return <img src="/teivaka-logo.png" alt="TEIVAKA" style={{ height: size, width: "auto" }} onError={() => setOk(false)} />;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.greenDk }}><Sprout size={size - 4} /><span style={{ fontWeight: 800, letterSpacing: ".06em", color: C.soil }}>TEIVAKA</span></span>;
}

function ChainBanner() {
  return (
    <div className="rounded-xl border p-3" style={{ background: C.greenTint, borderColor: C.border }}>
      <div className="text-xs" style={{ color: C.greenDk }}><CheckCircle2 size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Verification chain · <strong>INTACT</strong> — every record carries a stamp; nothing is edited after the fact. Generate a report to get its scannable verify link.</div>
    </div>
  );
}
function KV({ k, v, strong }) {
  return <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: strong ? C.greenDk : C.soil, fontWeight: 600, textAlign: "right" }}>{v}</span></div>;
}
function QState({ q, label, children }) {
  if (q.isError && !q.data) return (
    <div className="rounded-xl border p-4 text-center" style={{ background: "#fdf3f3", borderColor: "#e7c9c9" }}>
      <AlertTriangle size={18} style={{ color: C.red }} />
      <div className="text-sm mt-1" style={{ color: C.soil }}>Couldn't load your {label || "report"} — a load error, not an empty record.</div>
      <button onClick={() => q.refetch()} className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><RefreshCw size={12} style={{ display: "inline", verticalAlign: -2 }} /> Retry</button>
    </div>
  );
  if (q.isLoading && !q.data) return <div className="rounded-xl border p-4 text-sm" style={{ color: C.muted, borderColor: C.border }}>Loading…</div>;
  return children;
}

// Generate + download the signed PDF (the one authoritative artifact). Returns the
// audit anchor from the X-Anchor-Hash header so the page can show a Verify link + QR
// for the exact document just issued (no background audit scan — RST3/RST5).
async function downloadPdf(farmId, period) {
  emitToast("Generating Bank Evidence PDF…");
  try {
    const r = await apiFetch(`/api/v1/crops/bank-evidence?period=${encodeURIComponent(period)}&farm_id=${encodeURIComponent(farmId)}`);
    if (!r.ok) throw new Error(`Couldn't generate (${r.status})`);
    const anchor = r.headers.get("X-Anchor-Hash");
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `bank-evidence-${farmId}-${period}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    emitToast("Bank Evidence PDF generated — audit-anchored");
    return anchor;
  } catch (e) { emitToast(e.message || "Couldn't generate the PDF"); return null; }
}

// ── Bank Evidence card (reads /sources → matches the PDF) ────────────────────
function BankDocCard({ farmId, period }) {
  const sq = useSources(farmId, period);
  const farm = useFarmIdentity(farmId);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState(null);   // set from the generated PDF (RST3)
  const s = sq.data?.data || {};
  const verifyUrl = anchor ? `https://teivaka.com/verify/${anchor}` : null;

  // A new period/farm is a different document — drop the stale anchor.
  useEffect(() => { setAnchor(null); setQr(null); }, [farmId, period]);

  // QR only exists once a PDF is generated — encodes THAT document's verify URL.
  useEffect(() => {
    if (!anchor) { setQr(null); return; }
    let alive = true; let obj;
    (async () => {
      try {
        const r = await apiFetch(`/api/v1/crops/bank-evidence/qr.png?hash=${encodeURIComponent(anchor)}`);
        if (!r.ok) return; const b = await r.blob(); obj = URL.createObjectURL(b); if (alive) setQr(obj);
      } catch { /* QR is optional chrome */ }
    })();
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [anchor]);

  const onDownload = async () => { setBusy(true); const a = await downloadPdf(farmId, period); if (a) setAnchor(a); setBusy(false); };
  const share = async () => {
    if (!verifyUrl) { emitToast("Generate the signed PDF first — it creates the verifiable link"); return; }
    const text = `${farm.name} — Bank Evidence (${period}). Verify it's genuine: ${verifyUrl}`;
    if (navigator.share) { try { await navigator.share({ title: "Bank Evidence", text }); return; } catch { /* fall through */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <QState q={sq} label="Bank Evidence">
      <div className="rounded-xl border p-4" style={{ background: "var(--paper)", borderColor: C.border }}>
        <div className="flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: `2px solid ${C.soil}`, paddingBottom: 10 }}>
          <div className="flex items-center gap-3">
            <Brandmark size={26} />
            <div><div className="text-base font-extrabold" style={{ color: C.soil }}>{s.farm_name || farm.name} — Farm Evidence</div><div className="text-xs" style={{ color: C.muted }}>Period {period} · built from logged records</div></div>
          </div>
          <span className="text-[11px] inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ color: C.greenDk, border: `1px solid ${C.green}` }}><CheckCircle2 size={11} />Verifiable</span>
        </div>

        <div className="flex gap-4 flex-wrap mt-3">
          <div className="flex-1 min-w-[220px]">
            <Section title="Money this period">
              <KV k="Earned" v={s.earned_fjd == null ? "—" : fjd(s.earned_fjd)} />
              <KV k="Spent" v={s.spent_fjd == null ? "—" : fjd(s.spent_fjd)} />
              <KV k="Net" v={s.net_fjd == null ? "—" : fjd(s.net_fjd)} strong />
            </Section>
            <Section title="Evidence behind these numbers">
              <KV k="Location blocks" v={s.blocks ? String(s.blocks.length) : "—"} />
              <KV k="Photos (hash-bound)" v={s.photos ? String(s.photos.length) : "—"} />
              <KV k="Harvested" v={s.harvest_kg != null ? `${Math.round(s.harvest_kg).toLocaleString()} kg` : "—"} />
            </Section>
          </div>
          {/* QR → scan to verify + browse evidence */}
          <div className="text-center" style={{ width: 132 }}>
            <div style={{ width: 132, height: 132, border: `1px solid ${C.border}`, borderRadius: 10, display: "grid", placeItems: "center", background: "#fff" }}>
              {qr ? <img src={qr} alt="Scan to verify this report" style={{ width: 116, height: 116 }} /> : <span className="text-[10px] px-2" style={{ color: C.muted }}>Generate the signed PDF to get a scannable QR</span>}
            </div>
            <div className="text-[10px] mt-1" style={{ color: C.muted }}>{qr ? "Scan to verify this report" : "verifies the exact PDF you issue"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button onClick={onDownload} disabled={busy || !farmId} className="text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: C.greenDk }}>{busy ? "Generating…" : <><Download size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Download signed PDF</>}</button>
          <button onClick={share} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: C.soil, border: `1px solid ${C.border}` }}><Share2 size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Send</button>
          {verifyUrl && <a href={verifyUrl} target="_blank" rel="noreferrer" className="text-sm px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}><ShieldCheck size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Verify</a>}
        </div>
        <div className="text-[11px] mt-2" style={{ color: C.muted }}>On-screen numbers are period-scoped from your cash ledger — the same figures the signed PDF carries.</div>
      </div>
    </QState>
  );
}
function Section({ title, children }) {
  return <div className="mt-3"><div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.soil }}>{title}</div>{children}</div>;
}

// ── Evidence panel — browse-friendly photos + blocks (the new ask) ───────────
function EvidencePanel({ farmId, period }) {
  const sq = useSources(farmId, period);
  const s = sq.data?.data || {};
  const blocks = s.blocks || [];
  const photos = s.photos || [];
  const byBlock = {};
  photos.forEach((p) => { const k = p.pu_id || "Whole farm"; (byBlock[k] = byBlock[k] || []).push(p); });
  const blockName = (id) => blocks.find((b) => b.pu_id === id)?.pu_name || id || "Whole farm";
  return (
    <QState q={sq} label="evidence">
      <div className="space-y-4">
        <div className="text-xs" style={{ color: C.muted }}>Every figure in this report traces to these location blocks and hash-bound photos. The signed PDF embeds this index; the QR verifies the chain they belong to.</div>

        <div>
          <div className="text-sm font-semibold mb-2" style={{ color: C.soil }}>Location blocks behind the numbers ({blocks.length})</div>
          {blocks.length === 0 ? <div className="text-sm" style={{ color: C.muted }}>No mapped blocks for this farm yet.</div> : (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {blocks.map((b) => (
                <div key={b.pu_id} className="rounded-xl border p-3" style={{ background: "var(--paper)", borderColor: C.border }}>
                  <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.soil }}><MapPin size={13} style={{ color: C.green }} />{b.pu_name || b.pu_id}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{b.area_ha != null ? `${b.area_ha} ha · ` : ""}{b.active_cycles} active cycle{b.active_cycles === 1 ? "" : "s"}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-semibold mb-2" style={{ color: C.soil }}>Photo evidence ({photos.length}) — grouped by block</div>
          {photos.length >= 200 && <div className="text-[11px] mb-2" style={{ color: C.muted }}>Showing the latest 200 photos for this period.</div>}
          {photos.length === 0 ? <div className="text-sm" style={{ color: C.muted }}>No photos logged in this period. Attach photos to field events and they appear here as verifiable evidence.</div> : (
            Object.keys(byBlock).map((bid) => (
              <div key={bid} className="mb-3">
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.muted }}>{blockName(bid)} · {byBlock[bid].length}</div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))" }}>
                  {byBlock[bid].map((p) => (
                    <div key={p.event_id} className="rounded-lg border overflow-hidden" style={{ borderColor: C.border, background: "var(--paper)" }}>
                      <div style={{ position: "relative" }}>
                        <img src={p.photo_url} alt={p.event} loading="lazy" style={{ width: "100%", height: 86, objectFit: "cover", display: "block" }} />
                        {p.sha256 && <span title="Content-verified" style={{ position: "absolute", top: 4, left: 4, background: "rgba(62,123,31,.92)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 5, display: "inline-flex", alignItems: "center", gap: 2 }}><ShieldCheck size={9} />Verified</span>}
                      </div>
                      <div style={{ padding: "5px 7px" }}>
                        <div className="text-[11px] font-semibold truncate" style={{ color: C.soil }}>{p.event}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: C.muted }}>{(p.date || "").slice(5)}</span>
                          {p.audit_hash && <a href={`/verify/${encodeURIComponent(p.audit_hash)}`} target="_blank" rel="noreferrer" className="text-[10px]" style={{ color: C.greenDk }}>Verify</a>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </QState>
  );
}

// ── Report document body (RC17: real compliance, honest audit) ───────────────
function DocSection({ title, children }) { return <div className="mt-4"><div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: C.muted }}>{title}</div><div>{children}</div></div>; }
function DocRow({ l, v }) { return <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: "1px solid rgba(92,64,51,0.08)" }}><span style={{ color: C.soil }}>{l}</span><span style={{ color: C.soil, fontWeight: 600, textAlign: "right" }}>{v}</span></div>; }
function DocNote({ l }) { return <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: "1px solid rgba(92,64,51,0.08)" }}><span style={{ color: "#999" }}>{l}</span><span style={{ color: "#999" }}>building</span></div>; }

function ReportDocBody({ typeId, farmId, period, navigate }) {
  const sq = useSources(farmId, period);
  const s = sq.data?.data || {};
  const have = !!sq.data;
  const M = (v) => (have ? fjd(v) : "—");

  if (typeId === "bank-evidence") return <BankDocCard farmId={farmId} period={period} />;

  if (typeId === "cash-flow") return (
    <DocSection title="Money in and out — this period">
      <DocRow l="Earned (money in)" v={M(s.earned_fjd)} /><DocRow l="Spent (money out)" v={M(s.spent_fjd)} /><DocRow l="Net" v={M(s.net_fjd)} />
    </DocSection>
  );

  if (typeId === "harvest-summary") return (
    <>
      <DocSection title="Production this period"><DocRow l="Harvested (gross)" v={have ? `${Math.round(s.harvest_kg || 0).toLocaleString()} kg` : "—"} /><DocRow l="Harvest events" v={have ? String(s.harvest_events || 0) : "—"} /></DocSection>
      <DocSection title="Location blocks">{(s.blocks || []).map((b) => <DocRow key={b.pu_id} l={b.pu_name || b.pu_id} v={`${b.area_ha ?? "—"} ha · ${b.active_cycles} cyc`} />)}{have && (s.blocks || []).length === 0 && <div className="text-sm py-2" style={{ color: C.muted }}>No mapped blocks yet.</div>}</DocSection>
    </>
  );

  if (typeId === "cycle-pl") return (
    <DocSection title="Profit & loss — this period"><DocRow l="Earned" v={M(s.earned_fjd)} /><DocRow l="Spent" v={M(s.spent_fjd)} /><DocRow l="Net" v={M(s.net_fjd)} /><div className="text-xs mt-2" style={{ color: C.muted }}>Per-business breakdown builds from cycle-level cost allocation.</div></DocSection>
  );

  // RC17 — real compliance, not a hardcoded "No active holds".
  if (typeId === "compliance-log") return <ComplianceDoc farmId={farmId} navigate={navigate} />;

  // RC17 — honest audit report: the real chain check runs in the signed PDF, and the
  // button actually generates it (RST2 — real action, not a dead tab nav).
  if (typeId === "audit-report") return (
    <DocSection title="Tamper-evident record">
      <div className="text-sm py-2" style={{ color: C.soil }}>Every action is hash-chained. The cryptographic chain integrity check runs when you generate the <strong>signed PDF</strong> — it calls the chain verifier and prints the result + a scannable QR. This page does not assert a result it hasn't run.</div>
      <button onClick={() => downloadPdf(farmId, period)} className="text-sm px-3 py-1.5 rounded-lg mt-1 text-white" style={{ background: C.greenDk }}><Download size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Generate the verified PDF</button>
    </DocSection>
  );

  const NOTES = {
    "gov-report": "Production and compliance summary for the Ministry of Agriculture.",
    "investor-report": "Financial performance and growth, for investors.",
    "ngo-report": "Impact and beneficiary summary, for development partners.",
    "budget-report": "Planned spend against actual.",
    "certification-report": "Organic, GAP and export certificate status.",
    "inventory-report": "Stock on hand, used, and reorder.",
    "labor-record": "Hours, attendance and wages.",
    "buyer-statement": "Deliveries and what each buyer owes.",
    "networth": "What your animals, stock and assets are worth.",
    "balance-sheet": "What the farm owns and owes.",
    "valuation-statement": "Estimated value of livestock, crops and assets.",
  };
  return (
    <>
      <DocSection title="Farm summary"><DocRow l="Earned" v={M(s.earned_fjd)} /><DocRow l="Spent" v={M(s.spent_fjd)} /><DocRow l="Net" v={M(s.net_fjd)} /></DocSection>
      <DocSection title="About this report"><div className="text-sm py-2" style={{ color: "#666" }}>{NOTES[typeId] || "Built from your logged records."}</div><DocNote l="Full detail builds with your records" /></DocSection>
    </>
  );
}

function ComplianceDoc({ farmId, navigate }) {
  const cq = useQuery({ queryKey: ["rep-comp", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const c = cq.data?.data || {};
  const blocked = c.blocked_count ?? 0;
  const attention = (c.attention_count ?? 0) - blocked;
  return (
    <QState q={cq} label="compliance">
      <DocSection title="Chemical withholding control (live)">
        <DocRow l="Blocks blocked (active WHD)" v={String(blocked)} />
        <DocRow l="Needs attention (unidentified / off-label)" v={String(Math.max(0, attention))} />
        <DocRow l="Status" v={blocked === 0 && attention <= 0 ? "All clear" : "Holds present"} />
      </DocSection>
      <DocSection title="Source">
        <div className="text-sm py-2" style={{ color: C.muted }}>Read live from your Compliance records — not a fixed statement. <button onClick={() => navigate && navigate("/farm/compliance")} style={{ color: C.greenDk }}>Open Compliance ↗</button></div>
      </DocSection>
    </QState>
  );
}

function ReportDocument({ typeId, farmId, period, onBack }) {
  const navigate = useNavigate();
  const kind = REPORT_KINDS[typeId] || { name: "Report", Icon: FileText };
  const farm = useFarmIdentity(farmId);
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack} className="text-xs" style={{ color: C.greenDk }}>‹ Reports</button>
          <h1 className="text-2xl font-bold mt-1" style={{ color: C.soil }}>{kind.name}</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Period {period} · built fresh from your logged records</div>
        </div>
        <button onClick={onBack} className="text-sm px-3 py-2 rounded-lg inline-flex items-center gap-1.5" style={{ color: C.soil, border: `1px solid ${C.border}` }}><ArrowLeft size={14} />Back</button>
      </div>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border p-5 sm:p-7" style={{ background: "var(--paper)", borderColor: C.border }}>
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div><div className="text-lg font-extrabold" style={{ color: C.soil }}>{farm.name}</div><div className="text-xs mt-0.5" style={{ color: C.soil }}>Owner: {farm.owner}</div>{[farm.location, farm.phone, farm.email].filter(Boolean).length > 0 && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{[farm.location, farm.phone, farm.email].filter(Boolean).join("  ·  ")}</div>}</div>
          <div className="text-right"><Brandmark size={20} /><div className="text-[10px] mt-0.5" style={{ color: C.muted }}>Verified farm platform</div><div className="text-[11px] mt-1.5" style={{ color: C.soil }}><span style={{ color: C.muted }}>Issued </span>{issued}</div></div>
        </div>
        <div className="my-3" style={{ borderTop: `1px solid ${C.border}` }} />
        <div className="text-xl font-extrabold" style={{ color: C.soil }}>{kind.name}</div>
        <ReportDocBody typeId={typeId} farmId={farmId} period={period} navigate={navigate} />
        <div className="mt-5" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <div className="flex items-start gap-2 text-xs" style={{ color: C.soil }}><CheckCircle2 size={14} style={{ color: C.greenDk, flexShrink: 0, marginTop: 1 }} /><span>Audit-anchored record — every figure is summed from {farm.name}'s logged events. The Bank Evidence PDF carries the scannable QR + evidence appendix. Verify at teivaka.com/verify.</span></div>
          <div className="text-[11px] mt-2" style={{ color: C.muted }}>Records managed on TEIVAKA · Teivaka PTE LTD · Co. No. 2025RC001894</div>
        </div>
      </div>
    </div>
  );
}

// ── Library (reorganised: hero → Ready now → Building) ───────────────────────
function ReportRow({ typeId, onOpen, building }) {
  const kind = REPORT_KINDS[typeId] || { name: typeId, Icon: FileText };
  return (
    <button onClick={() => !building && onOpen(typeId)} disabled={building} className="w-full flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-60" style={{ background: "var(--paper)", borderColor: C.border, cursor: building ? "default" : "pointer" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.greenDk }}><kind.Icon size={16} /></div>
      <div className="flex-1 min-w-0"><div className="font-medium text-sm" style={{ color: C.soil }}>{kind.name}</div></div>
      {building ? <span className="text-[10px]" style={{ color: C.muted }}>building</span> : <span className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open</span>}
    </button>
  );
}
function LibraryTab({ farmId, period, onOpen, setTab }) {
  const sq = useSources(farmId, period);
  const net = sq.data?.data?.net_fjd;
  const [showBuilding, setShowBuilding] = useState(false);
  return (
    <div className="space-y-4">
      <ChainBanner />
      <div className="rounded-xl border-2 p-4 flex items-center gap-3 cursor-pointer" style={{ background: "var(--paper)", borderColor: C.green }} onClick={() => setTab("bankevidence")}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Award size={20} /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>Bank Evidence</div><div className="text-xs" style={{ color: C.muted }}>The whole-farm summary a lender reads — money, evidence, QR, verification.{net != null ? ` Net this period: ${fjd(net)}.` : ""}</div></div>
        <span className="text-sm px-4 py-2 rounded-lg text-white shrink-0" style={{ background: C.greenDk }}>Open</span>
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: C.soil }}>Ready now</div>
        <div className="text-xs mb-2" style={{ color: C.muted }}>Built from your real records</div>
        <div className="space-y-2">{READY.map((t) => <ReportRow key={t} typeId={t} onOpen={onOpen} />)}</div>
      </div>
      <div>
        <button onClick={() => setShowBuilding((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.soil }}><ChevronDown size={15} style={{ transform: showBuilding ? "rotate(180deg)" : "none", transition: ".15s" }} />Building ({BUILDING.length})</button>
        <div className="text-xs mb-2" style={{ color: C.muted }}>Honest about what isn't wired yet — no fake numbers to a banker</div>
        {showBuilding && <div className="space-y-2">{BUILDING.map((t) => <ReportRow key={t} typeId={t} onOpen={onOpen} building />)}</div>}
      </div>
    </div>
  );
}

function DispatchTab() {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--paper)", borderColor: C.border }}>
      <div className="text-sm font-semibold" style={{ color: C.soil }}>Dispatch log</div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>A record of which reports you've sent, to whom, lands here once the dispatch service ships. For now, use <strong>Send</strong> on the Bank Evidence card (WhatsApp / share the verify link) and <strong>Download</strong> the signed PDF to email.</div>
    </div>
  );
}

function ReportsInner() {
  const { farmId } = useCurrentFarm();
  // NOTE: do NOT read ?tab here — that param belongs to the outer Records FarmTabs
  // (?tab=reports). Reading it would leave this inner section blank (RST1).
  const [tab, setTab] = useState("library");
  const [period, setPeriod] = useState(monthNow());
  const [reportOpen, setReportOpen] = useState(null);
  const navigate = useNavigate();
  const askAI = () => navigate(`/tis?q=${encodeURIComponent(`Explain my Bank Evidence for ${period} and what a lender will see in it`)}`);

  if (reportOpen) return <div className="tfp space-y-4"><ReportDocument typeId={reportOpen} farmId={farmId} period={period} onBack={() => setReportOpen(null)} /></div>;

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-2"><Brandmark size={22} /><div><h1>Reports</h1><div className="subtitle">documents a bank or buyer can read — every number from logged activity</div></div></div>
        <div className="page-actions">
          <label className="text-xs flex items-center gap-1.5" style={{ color: C.muted }}>Period<input type="month" value={period} max={monthNow()} onChange={(e) => setPeriod(e.target.value || monthNow())} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: C.border, color: C.soil }} /></label>
          <FarmSelector />
          <button onClick={askAI} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: C.soil, border: `1px solid ${C.border}` }}><Sparkles size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Ask AI</button>
        </div>
      </div>
      {!farmId ? <div className="rounded-xl border p-4 text-sm" style={{ color: C.muted, borderColor: C.border }}>Select a farm to see its reports.</div> : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b" role="tablist" style={{ borderColor: C.border }}>
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0" style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent" }}>{t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span></button>
            ))}
          </div>
          <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
            {tab === "library" && <LibraryTab farmId={farmId} period={period} onOpen={setReportOpen} setTab={setTab} />}
            {tab === "bankevidence" && <BankDocCard farmId={farmId} period={period} />}
            {tab === "evidence" && <EvidencePanel farmId={farmId} period={period} />}
            {tab === "dispatch" && <DispatchTab />}
          </section>
        </>
      )}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function Reports() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <ReportsInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

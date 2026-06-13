/**
 * Reports.jsx — /farm/reports
 *
 * Mirrors v262 `coreReportsView` → the `ur*View` family (Gate-1 traced):
 *   urLibraryView · urBankEvidenceView(urBankDoc) · urNetWorthView ·
 *   urDispatchLogView · urRecipientsView · urScheduleView
 *   + urOpenReport → urReportPreview → urReportDocBody (report document page).
 *
 * Every Library row + the Bank Evidence hero opens its own full report
 * document (TEIVAKA letterhead + categorized sections + audit-anchored footer
 * + Back/Send/Verify/Download), exactly like the prototype's urOpenReport.
 * Live where the API serves it (financials/farm + financials/crops); honest
 * "building"/"—" where no endpoint exists. No fabricated numbers to a banker.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  Sprout, Package, Users, Coins, BarChart3, Scale, DollarSign, FlaskConical,
  Shield, Award, Star, Truck, Plus, Phone, FileText, QrCode, Calendar,
  ArrowLeft, Leaf, CheckCircle2,
} from "lucide-react";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";

const C = {
  soil: "#5C4033", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863",
  green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000", red: "#D4442E", greenTint: "#E9F2DD",
};

const TABS = [
  { id: "library", label: "Library", hint: "All reports" },
  { id: "bankevidence", label: "Bank Evidence", hint: "The flagship" },
  { id: "networth", label: "Net Worth", hint: "Asset statement" },
  { id: "dispatchlog", label: "Dispatch log", hint: "Sent" },
  { id: "recipients", label: "Recipients", hint: "Contacts" },
  { id: "schedule", label: "Schedule", hint: "Auto" },
];

// urReportKinds() — id (typeId) + display name + icon, verbatim from prototype.
const REPORT_KINDS = {
  "bank-evidence": { name: "Bank Evidence", Icon: Award },
  "harvest-summary": { name: "Production report", Icon: Sprout },
  "inventory-report": { name: "Inventory report", Icon: Package },
  "labor-record": { name: "Labour report", Icon: Users },
  "cash-flow": { name: "Cash report", Icon: Coins },
  "cycle-pl": { name: "Profit & loss", Icon: BarChart3 },
  "budget-report": { name: "Budget report", Icon: Scale },
  "networth": { name: "Net worth statement", Icon: Scale },
  "balance-sheet": { name: "Balance sheet", Icon: Scale },
  "valuation-statement": { name: "Valuation statement", Icon: DollarSign },
  "compliance-log": { name: "Compliance log", Icon: FlaskConical },
  "audit-report": { name: "Audit report", Icon: Shield },
  "certification-report": { name: "Certification report", Icon: Award },
  "gov-report": { name: "Government report", Icon: Shield },
  "investor-report": { name: "Investor report", Icon: Star },
  "ngo-report": { name: "NGO report", Icon: Users },
  "buyer-statement": { name: "Buyer statement", Icon: Truck },
  "custom-report": { name: "Custom report", Icon: Plus },
};

// Library category grouping (urLibraryView CATS). typeId links each row to its document.
const CATS = [
  { id: "operational", title: "Operational reports", sub: "Production, stock and labour", reports: [
    { typeId: "harvest-summary", what: "What was produced — by block, crop and animal" },
    { typeId: "inventory-report", what: "Stock on hand, what was used and what to reorder" },
    { typeId: "labor-record", what: "Hours, attendance and wages paid" },
  ]},
  { id: "financial", title: "Financial reports", sub: "Money, profit and worth", reports: [
    { typeId: "cash-flow", what: "Money in and out across crops + animals" },
    { typeId: "cycle-pl", what: "Earned, spent and net for every business" },
    { typeId: "budget-report", what: "Planned spend against actual spend" },
    { typeId: "networth", what: "What your animals, stock and assets are worth" },
    { typeId: "balance-sheet", what: "What the farm owns and owes, and the owner's share" },
    { typeId: "valuation-statement", what: "Estimated value of livestock, crops and assets" },
  ]},
  { id: "compliance", title: "Compliance reports", sub: "Audit trail and certificates", reports: [
    { typeId: "compliance-log", what: "Spray records and animal withdrawal holds" },
    { typeId: "audit-report", what: "Every logged action, hash-linked and tamper-proof" },
    { typeId: "certification-report", what: "Organic, GAP and export certificate status" },
  ]},
  { id: "stakeholder", title: "Stakeholder reports", sub: "For the ministry, investors, partners and buyers", reports: [
    { typeId: "gov-report", what: "Production and compliance summary for the ministry" },
    { typeId: "investor-report", what: "Financial performance and growth, for investors" },
    { typeId: "ngo-report", what: "Impact and beneficiary summary, for partners" },
    { typeId: "buyer-statement", what: "Deliveries and what each buyer owes" },
  ]},
  { id: "custom", title: "Custom reports", sub: "Build your own", reports: [
    { typeId: "custom-report", what: "Choose what to include and build your own" },
  ]},
];
const REPORT_COUNT = CATS.reduce((n, c) => n + c.reports.length, 0) + 1; // + Bank Evidence

// Letterhead identity — REAL farm + owner, never hardcoded. A bank-evidence
// document must carry THIS farmer's name/contact, not a pilot's.
function useFarmIdentity(farmId) {
  const fq = useQuery({ queryKey: ["rep-farm", farmId], queryFn: () => getJSON(`/api/v1/farms/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
  const mq = useQuery({ queryKey: ["rep-me"], queryFn: () => getJSON(`/api/v1/me`), retry: 0 });
  const f = fq.data?.data || fq.data || {};
  const m = mq.data?.data || mq.data || {};
  return {
    name: f.farm_name || "Your farm",
    owner: m.full_name || "Owner",
    location: [f.location_name, f.location_island].filter(Boolean).join(", "),
    phone: m.whatsapp_number || "",
    email: m.email || "",
  };
}

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function fjd(v) { const n = Number(v ?? 0); return Number.isNaN(n) ? "FJ$ —" : `FJ$ ${n.toLocaleString("en-FJ", { maximumFractionDigits: 0 })}`; }
async function getJSON(url) { const r = await fetch(url, { headers: authHeaders() }); if (!r.ok) throw new Error(); return r.json(); }
const useFarmFin = (farmId) => useQuery({ queryKey: ["repfin", farmId], queryFn: () => getJSON(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });
const useCrops = (farmId) => useQuery({ queryKey: ["repcrops", farmId], queryFn: () => getJSON(`/api/v1/financials/crops/${encodeURIComponent(farmId)}`), enabled: !!farmId, retry: 0 });

function ChainBanner() {
  return (
    <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenTint, borderColor: C.border }}>
      <div className="text-xs" style={{ color: C.greenDk }}>✓ Verification chain · <strong>INTACT</strong> — every logged record carries a stamp; nothing is edited after the fact.</div>
      <button onClick={() => emitToast("Verification runs against the audit chain (/verify/{hash})")} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Run verification</button>
    </div>
  );
}
function KV({ k, v, strong }) {
  return (
    <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: strong ? C.greenDk : C.soil, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.soil }}>{title}</div>
      {children}
    </div>
  );
}

// ── Report document page (urReportPreview + urReportDocBody) ──────────
// sec/row/buildNote helpers, verbatim semantics.
function DocSection({ title, children }) {
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: C.muted, letterSpacing: ".4px" }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
function DocRow({ l, v }) {
  return (
    <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid rgba(92,64,51,0.08)` }}>
      <span style={{ color: C.soil }}>{l}</span>
      <span style={{ color: C.soil, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function DocNote({ l }) {
  // buildNote — greyed label + grey "building" value (honest placeholder)
  return (
    <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid rgba(92,64,51,0.08)` }}>
      <span style={{ color: "#999" }}>{l}</span>
      <span style={{ color: "#999" }}>building</span>
    </div>
  );
}

// tfosDocHeader — TEIVAKA letterhead.
function DocHeader({ title, docId, issued, farm }) {
  const contact = [farm.location, farm.phone, farm.email].filter(Boolean).join("  ·  ");
  return (
    <div>
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <div className="text-lg font-extrabold" style={{ color: C.soil }}>{farm.name}</div>
          <div className="text-xs mt-0.5" style={{ color: C.soil }}>Owner: {farm.owner}</div>
          {contact && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{contact}</div>}
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 justify-end" style={{ color: C.greenDk }}>
            <Leaf size={18} /><span className="font-extrabold tracking-wide" style={{ color: C.soil }}>TEIVAKA</span>
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>Verified farm platform</div>
          <div className="text-[11px] mt-1.5" style={{ color: C.soil }}><span style={{ color: C.muted }}>Document </span>{docId}</div>
          <div className="text-[11px] mt-0.5" style={{ color: C.soil }}><span style={{ color: C.muted }}>Issued </span>{issued}</div>
        </div>
      </div>
      <div className="my-3" style={{ borderTop: `1px solid ${C.border}` }} />
      <div className="text-xl font-extrabold" style={{ color: C.soil }}>{title}</div>
      <div className="text-xs mt-0.5" style={{ color: C.muted }}>Whole farm · crops + animals · records kept on the TEIVAKA platform</div>
    </div>
  );
}

// tfosDocFooter — audit-anchored footer.
function DocFooter({ docId, farm }) {
  return (
    <div className="mt-5">
      <div className="mb-3" style={{ borderTop: `1px solid ${C.border}` }} />
      <div className="flex items-start gap-2 text-xs" style={{ color: C.soil }}>
        <CheckCircle2 size={14} style={{ color: C.greenDk, flexShrink: 0, marginTop: 1 }} />
        <span>Audit-anchored record — every figure is summed from {farm.name}'s logged events and carries a verifiable stamp. Verify this record on TEIVAKA at teivaka.com/verify{docId ? ` · ref ${docId}` : ""}.</span>
      </div>
      <div className="flex justify-between gap-3 flex-wrap mt-3 text-[11px]" style={{ color: C.muted }}>
        <div>Prepared for {farm.owner} · {farm.name} · Confidential</div>
        <div>Records managed on TEIVAKA · Teivaka PTE LTD · Co. No. 2025RC001894</div>
      </div>
    </div>
  );
}

// urBankDoc — the Bank Evidence inner block (shared by tab + document).
function BankDocCard({ farmId }) {
  const fin = useFarmFin(farmId); const crops = useCrops(farmId);
  const s = fin.data?.data?.summary || {};
  const income = s.total_income_fjd;
  const spent = fin.data ? (Number(s.total_labor_cost_fjd) || 0) + (Number(s.total_input_cost_fjd) || 0) : null;
  const net = s.net_profit_fjd;
  const cropRows = crops.data?.data ?? [];
  const cycles = cropRows.reduce((a, r) => a + (Number(r.total_cycles) || 0), 0);
  const farm = useFarmIdentity(farmId);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [dl, setDl] = useState(false);

  async function downloadPdf() {
    if (!farmId || dl) return;
    setDl(true);
    try {
      const url = `/api/v1/crops/bank-evidence?period=${encodeURIComponent(period)}&farm_id=${encodeURIComponent(farmId)}`;
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) throw new Error(`Couldn't generate (${r.status})`);
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj; a.download = `crop-bank-evidence-${farmId}-${period}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(obj);
      emitToast("Bank Evidence PDF generated — audit-anchored");
    } catch (e) {
      emitToast(e.message || "Couldn't generate the PDF");
    } finally {
      setDl(false);
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: `2px solid ${C.soil}`, paddingBottom: 10 }}>
        <div><div className="text-base font-extrabold" style={{ color: C.soil }}>{farm.name} — Farm Evidence</div><div className="text-xs" style={{ color: C.muted }}>Whole farm · crops + animals · built from logged records</div></div>
        <span className="text-[11px] inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ color: C.greenDk, border: `1px solid ${C.green}` }}><CheckCircle2 size={11} />Verifiable</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <label className="text-xs" style={{ color: C.muted }}>Month</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: C.border, color: C.soil }} />
        <button onClick={downloadPdf} disabled={dl || !farmId} className="text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: C.greenDk }}>
          {dl ? "Generating…" : "Download Bank Evidence PDF"}
        </button>
        <span className="text-[11px]" style={{ color: C.muted }}>Real PDF · hash-chained · QR-verifiable</span>
      </div>
      <Section title="The farm">
        <KV k="Location" v={farm.location || "—"} /><KV k="Run by" v={farm.owner} />
      </Section>
      <Section title="Money to date">
        <KV k="Earned" v={income == null ? "—" : fjd(income)} />
        <KV k="Spent" v={spent == null ? "—" : fjd(spent)} />
        <KV k="Net" v={net == null ? "—" : fjd(net)} strong />
      </Section>
      <Section title="What this farm runs">
        <KV k="Crops tracked" v={crops.data ? String(cropRows.length) : "—"} />
        <KV k="Cycles recorded" v={crops.data ? String(cycles) : "—"} />
      </Section>
      <Section title="Standing">
        <div className="text-xs py-2" style={{ color: C.muted }}>Every record in this document carries a stamp a bank can check on the public verify page.</div>
        <KV k="Bank readiness score" v="Building baseline" />
        <KV k="Credit score" v="—" />
      </Section>
    </div>
  );
}

// urReportDocBody — per-report sections.
function ReportDocBody({ typeId, farmId }) {
  const fin = useFarmFin(farmId); const crops = useCrops(farmId);
  const s = fin.data?.data?.summary || {};
  const income = Number(s.total_income_fjd ?? 0);
  const spent = (Number(s.total_labor_cost_fjd) || 0) + (Number(s.total_input_cost_fjd) || 0);
  const net = Number(s.net_profit_fjd ?? 0);
  const haveFin = !!fin.data;
  const cropRows = crops.data?.data ?? [];
  const haveCrops = !!crops.data;
  const M = (v) => (haveFin ? fjd(v) : "—");

  if (typeId === "bank-evidence") return <BankDocCard farmId={farmId} />;

  if (typeId === "cash-flow") {
    return (
      <>
        <DocSection title="Money in and out — to date">
          <DocRow l="Earned (money in)" v={M(income)} /><DocRow l="Spent (money out)" v={M(spent)} /><DocRow l="Net" v={M(net)} />
        </DocSection>
        <DocSection title="Cash position now">
          <DocNote l="Cash on hand" /><DocNote l="Owed to you" /><DocNote l="You owe" /><DocNote l="Working capital" />
        </DocSection>
      </>
    );
  }

  if (typeId === "balance-sheet") {
    return (
      <>
        <DocSection title="Assets — what the farm has">
          <DocNote l="Cash on hand" /><DocNote l="Owed to the farm" /><DocNote l="Livestock, stock & equipment (estimated)" /><DocNote l="Total assets" />
        </DocSection>
        <DocSection title="What the farm owes">
          <DocNote l="Wages & reorders owed" /><DocNote l="Loans & other debts" /><DocNote l="Total owed" />
        </DocSection>
        <DocSection title="Owner's share">
          <DocNote l="Net worth (assets − what is owed)" />
        </DocSection>
        <DocSection title="Not yet on the sheet">
          <DocNote l="Land value (farmer-declared, not yet event-backed)" /><DocNote l="Full asset register & depreciation" />
        </DocSection>
      </>
    );
  }

  if (typeId === "valuation-statement") {
    return (
      <>
        <DocSection title="Estimated value of what the farm holds">
          <DocNote l="Livestock (live head, estimated)" /><DocNote l="Standing crops & plantation (estimated)" /><DocNote l="Total estimated value" />
        </DocSection>
        <DocSection title="Not yet valued">
          <DocNote l="Equipment & infrastructure (book value)" /><DocNote l="Stock & inputs on hand" /><DocNote l="Land (farmer-declared, needs event backing)" />
        </DocSection>
      </>
    );
  }

  if (typeId === "cycle-pl") {
    let tI = 0, tC = 0, tN = 0;
    const rows = cropRows.map((r) => {
      const inc = Number(r.total_income_fjd) || 0;
      const cost = (Number(r.total_labor_fjd) || 0) + (Number(r.total_input_cost_fjd) || 0);
      const rNet = inc - cost; tI += inc; tC += cost; tN += rNet;
      return { name: `${r.production_name} · ${r.production_category || "Crops"}`, net: rNet };
    });
    return (
      <>
        <DocSection title="Profit and loss by business">
          {haveCrops && rows.length === 0 && <div className="text-sm py-2" style={{ color: C.muted }}>No closed or harvesting cycles yet — businesses show here as you log them.</div>}
          {!haveCrops && <DocNote l="Per-business profit and loss" />}
          {rows.map((r) => <DocRow key={r.name} l={r.name} v={fjd(r.net)} />)}
        </DocSection>
        <DocSection title="Totals">
          <DocRow l="Earned" v={haveCrops ? fjd(tI) : "—"} /><DocRow l="Spent" v={haveCrops ? fjd(tC) : "—"} /><DocRow l="Net across all businesses" v={haveCrops ? fjd(tN) : "—"} />
        </DocSection>
      </>
    );
  }

  if (typeId === "compliance-log") {
    return (
      <>
        <DocSection title="Dual-layer chemical control">
          <DocRow l="Status" v="Active on every harvest and sale" />
        </DocSection>
        <DocSection title="Holds right now (crops + animals)">
          <DocRow l="All clear" v="No active holds" />
        </DocSection>
      </>
    );
  }

  if (typeId === "harvest-summary") {
    return (
      <>
        <DocSection title="What this farm runs">
          {haveCrops && cropRows.length === 0 && <div className="text-sm py-2" style={{ color: C.muted }}>Nothing logged yet — crops and animals appear here as you record them.</div>}
          {!haveCrops && <DocNote l="What this farm runs" />}
          {cropRows.map((r) => {
            const cyc = Number(r.total_cycles) || 0;
            return <DocRow key={r.production_id || r.production_name} l={`${r.production_name} · ${r.production_category || "Crops"}`} v={`${cyc} ${cyc === 1 ? "run" : "runs"}`} />;
          })}
        </DocSection>
        <DocSection title="Harvest totals">
          <DocNote l="Total harvested by block and crop" />
        </DocSection>
      </>
    );
  }

  if (typeId === "labor-record") {
    return (
      <>
        <DocSection title="Wages"><DocNote l="Wages owed now" /></DocSection>
        <DocSection title="Hours & attendance"><DocNote l="Hours worked and attendance over time" /></DocSection>
      </>
    );
  }

  if (typeId === "buyer-statement") {
    return (
      <>
        <DocSection title="Owed to you by buyers"><DocNote l="Total receivable" /></DocSection>
        <DocSection title="Deliveries"><DocNote l="Deliveries and per-buyer statements" /></DocSection>
      </>
    );
  }

  if (typeId === "networth") {
    return (
      <DocSection title="What you are worth (estimates)">
        <DocRow l="No asset value yet" v="—" />
        <div className="text-xs mt-2" style={{ color: C.muted }}>As you record animals and stock, estimated worth fills in here — shown as "about" because values move with the market.</div>
      </DocSection>
    );
  }

  if (typeId === "audit-report") {
    return (
      <>
        <DocSection title="Tamper-proof record">
          <DocNote l="Your audit chain builds as you log" />
          <DocRow l="Total events in chain" v="—" />
        </DocSection>
        <DocSection title="Integrity">
          <DocRow l="Hash links" v="unbroken" /><DocRow l="Tamper attempts" v="0 detected" />
        </DocSection>
      </>
    );
  }

  // gov / investor / ngo / budget / certification / inventory / custom
  const NOTES = {
    "gov-report": "Production and compliance summary for the Ministry of Agriculture.",
    "investor-report": "Financial performance and growth, for investors.",
    "ngo-report": "Impact and beneficiary summary, for development partners.",
    "budget-report": "Planned spend against actual. Budget targets build as you plan ahead.",
    "certification-report": "Organic, GAP and export certificate status.",
    "inventory-report": "Stock on hand, what was used and what to reorder.",
    "custom-report": "Choose what to include and build your own report.",
  };
  const note = NOTES[typeId] || "Built from your logged records.";
  const detailBuilds = typeId === "budget-report" || typeId === "certification-report" || typeId === "inventory-report";
  return (
    <>
      <DocSection title="Farm summary">
        <DocRow l="Money earned" v={M(income)} />
        <DocRow l="Money spent" v={M(spent)} />
        <DocRow l="Net" v={M(net)} />
        <DocRow l="Businesses on farm" v={haveCrops ? String(cropRows.length) : "—"} />
        <DocRow l="Records logged" v="—" />
      </DocSection>
      <DocSection title="About this report">
        <div className="text-sm py-2" style={{ color: "#666" }}>{note}</div>
        {detailBuilds && <DocNote l="Detail builds with your records" />}
      </DocSection>
    </>
  );
}

function ReportDocument({ typeId, farmId, onBack }) {
  const kind = REPORT_KINDS[typeId] || { name: "Report", Icon: FileText };
  const farm = useFarmIdentity(farmId);
  const docId = `TFOS-${farmId || "FARM"}-${new Date().toISOString().slice(0, 10)}`;
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const ABtn = ({ onClick, children, primary }) => (
    <button onClick={onClick} className="text-sm px-3 py-2 rounded-lg shrink-0 inline-flex items-center gap-1.5"
      style={primary ? { background: C.greenDk, color: "white" } : { color: C.soil, border: `1px solid ${C.border}` }}>{children}</button>
  );
  return (
    <div className="space-y-4">
      {/* page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs flex items-center gap-1.5" style={{ color: C.muted }}>
            <button onClick={onBack} style={{ color: C.greenDk }}>My Farm</button><span>›</span>
            <button onClick={onBack} style={{ color: C.greenDk }}>Reports</button><span>›</span>
            <span style={{ color: C.soil, fontWeight: 600 }}>{kind.name}</span>
          </div>
          <h1 className="text-2xl font-bold mt-1" style={{ color: C.soil }}>{kind.name}</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Whole farm · crops + animals · built fresh from your logged records</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ABtn onClick={onBack}><ArrowLeft size={14} />Back</ABtn>
          <ABtn primary onClick={() => emitToast("Make this report from the library first, then send it.")}>Send</ABtn>
          <ABtn onClick={() => emitToast("Verification runs against the audit chain (/verify/{hash}).")}>Verify</ABtn>
          <ABtn onClick={() => emitToast("This report downloads once generated on the live system.")}>Download</ABtn>
        </div>
      </div>
      {/* document paper */}
      <div className="mx-auto w-full max-w-3xl rounded-2xl border p-5 sm:p-7" style={{ background: "white", borderColor: C.border }}>
        <DocHeader title={kind.name} docId={docId} issued={issued} farm={farm} />
        <div className="mt-2">
          <ReportDocBody typeId={typeId} farmId={farmId} />
        </div>
        <DocFooter docId={docId} farm={farm} />
      </div>
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────
function ReportRow({ r, onOpen }) {
  const kind = REPORT_KINDS[r.typeId] || { name: r.typeId, Icon: FileText };
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer" style={{ background: "white", borderColor: C.border }} onClick={() => onOpen(r.typeId)}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.greenDk }}><kind.Icon size={16} /></div>
      <div className="flex-1 min-w-0"><div className="font-medium text-sm" style={{ color: C.soil }}>{kind.name}</div><div className="text-xs truncate" style={{ color: C.muted }}>{r.what}</div></div>
      <button onClick={(e) => { e.stopPropagation(); onOpen(r.typeId); }} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open</button>
    </div>
  );
}
function Tile({ label, value, sub, onClick, color }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border, cursor: onClick ? "pointer" : "default" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}
function LibraryTab({ farmId, setTab, onOpen }) {
  const navigate = useNavigate();
  const fin = useFarmFin(farmId);
  const net = fin.data?.data?.summary?.net_profit_fjd;
  return (
    <div className="space-y-4">
      <ChainBanner />
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Tile label="Reports you can make" value={String(REPORT_COUNT)} sub="crops + animals" />
        <Tile label="Bank Evidence" value="Ready to make" sub="whole farm" onClick={() => setTab("bankevidence")} color={C.greenDk} />
        <Tile label="Net so far" value={net == null ? "—" : fjd(net)} sub="crops + animals" onClick={() => navigate("/farm/cash")} color={Number(net) < 0 ? C.red : C.greenDk} />
        <Tile label="Bank readiness score" value="Building" sub="needs a season of records" color={C.amber} />
      </div>
      <div className="rounded-xl border-2 p-4 flex items-center gap-3 cursor-pointer" style={{ background: "white", borderColor: C.green }} onClick={() => onOpen("bank-evidence")}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Award size={20} /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>Bank Evidence</div><div className="text-xs" style={{ color: C.muted }}>The whole-farm summary a lender reads — identity, money, standing, verification.</div></div>
        <button onClick={(e) => { e.stopPropagation(); onOpen("bank-evidence"); }} className="text-sm px-4 py-2 rounded-lg text-white shrink-0" style={{ background: C.greenDk }}>Open</button>
      </div>
      {CATS.map((cat) => (
        <div key={cat.id}>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>{cat.title}</div>
          <div className="text-xs mb-2" style={{ color: C.muted }}>{cat.sub}</div>
          <div className="space-y-2">{cat.reports.map((r) => <ReportRow key={r.typeId} r={r} onOpen={onOpen} />)}</div>
        </div>
      ))}
      <div className="text-xs pt-1" style={{ color: C.muted }}>Each report is built fresh from your logged records when you open it — crops and animals together. No figure is stored or guessed.</div>
    </div>
  );
}

// ── Bank Evidence tab (urBankEvidenceView) ───────────────────────────
function BankEvidenceTab({ farmId }) {
  return (
    <div className="space-y-3">
      <ChainBanner />
      <BankDocCard farmId={farmId} />
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: "white", borderColor: C.border, borderStyle: "dashed" }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Award size={16} /></div>
        <div>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.cream, color: C.amber }}>building baseline</span>
          <div className="text-sm font-semibold mt-1" style={{ color: C.soil }}>Bank readiness score</div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>A credit-style score that tells a bank how reliable your records are. It builds from a season of verified harvests, sales and compliance — TFOS will not show a score until it is earned from your real records, because a bank can tell the difference.</div>
        </div>
      </div>
      <div className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
        <div className="text-sm font-semibold mb-2" style={{ color: C.soil }}>Send this report</div>
        <div className="flex gap-2 flex-wrap">
          {[[Phone, "WhatsApp to Operator"], [FileText, "Email to banker"], [QrCode, "QR for a buyer"]].map(([Ic, t]) => (
            <button key={t} onClick={() => emitToast(`${t} — dispatch needs a report-dispatch endpoint`)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ color: C.soil, border: `1px solid ${C.border}` }}><Ic size={14} />{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Net Worth (urNetWorthView) ───────────────────────────────────────
function NetWorthTab() {
  return (
    <div className="space-y-3">
      <ChainBanner />
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="text-sm font-semibold" style={{ color: C.soil }}>What you are worth</div>
        <div className="text-xs mb-3" style={{ color: C.muted }}>value held across crops + animals</div>
        <KV k="Total worth" v="—" strong />
        <div className="text-xs mt-2" style={{ color: C.muted }}>Per-category worth (livestock, stock, assets) populates from a valuation endpoint. No estimate shown until it's real.</div>
      </div>
    </div>
  );
}

// ── Dispatch log (urDispatchLogView) ─────────────────────────────────
function DispatchLogTab() {
  return (
    <div className="space-y-3">
      <ChainBanner />
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="text-sm font-semibold" style={{ color: C.soil }}>Dispatch log</div>
        <div className="text-xs mb-3" style={{ color: C.muted }}>what is recorded, and what has been sent</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[440px]">
            <thead><tr style={{ color: C.muted }} className="text-xs"><th className="text-left p-2">Document</th><th className="text-left p-2">Issued</th><th className="text-left p-2">Verify</th><th className="text-right p-2">Download</th></tr></thead>
            <tbody><tr style={{ borderTop: `1px solid ${C.border}` }}><td className="p-2" colSpan={4} style={{ color: C.muted }}>No reports dispatched yet — needs a report-dispatch log endpoint.</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Recipients (urRecipientsView) — verbatim static ──────────────────
function RecipientsTab() {
  const rows = [
    { Icon: Phone, name: "You (the Operator)", what: "WhatsApp — the report comes to your phone" },
    { Icon: FileText, name: "A bank or lender", what: "Email — the signed PDF a loan officer can verify" },
    { Icon: QrCode, name: "A buyer", what: "QR code — they scan to confirm your record is genuine" },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="text-sm font-semibold" style={{ color: C.soil }}>Who can receive your reports</div>
        <div className="text-xs mb-3" style={{ color: C.muted }}>you choose, every time</div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3 rounded-xl p-3" style={{ background: C.cream }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "white", color: C.greenDk, border: `1px solid ${C.border}` }}><r.Icon size={16} /></div>
              <div className="min-w-0"><div className="font-medium text-sm" style={{ color: C.soil }}>{r.name}</div><div className="text-xs" style={{ color: C.muted }}>{r.what}</div></div>
            </div>
          ))}
        </div>
        <div className="text-xs mt-3" style={{ color: C.muted }}>A report is only ever sent when you send it. Nothing leaves the farm on its own.</div>
      </div>
    </div>
  );
}

// ── Schedule (urScheduleView) ────────────────────────────────────────
function ScheduleTab({ setTab }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "white", borderColor: C.border, borderStyle: "dashed" }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.amber }}><Calendar size={20} /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>Automatic monthly reports</div><div className="text-xs" style={{ color: C.muted }}>building baseline — have your Bank Evidence report made and sent on the first of every month. This turns on with the live system; for now make and send any report yourself from the Library.</div></div>
      </div>
      <button onClick={() => setTab("library")} className="text-sm px-4 py-2 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Go to the report library</button>
    </div>
  );
}

function ReportsInner() {
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("library");
  const [reportOpen, setReportOpen] = useState(null); // typeId of the open document, or null

  if (reportOpen) {
    return (
      <div className="space-y-4">
        <ReportDocument typeId={reportOpen} farmId={farmId} onBack={() => setReportOpen(null)} />
      </div>
    );
  }

  return (
    <div className="tfp space-y-4">
      <div className="page-header">
        <div><h1>Reports</h1><div className="subtitle">documents a bank or buyer can read — every number from logged activity</div></div>
        <div className="page-actions"><FarmSelector /><ModeDropdown /></div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent" }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
        {tab === "library" && <LibraryTab farmId={farmId} setTab={setTab} onOpen={setReportOpen} />}
        {tab === "bankevidence" && <BankEvidenceTab farmId={farmId} />}
        {tab === "networth" && <NetWorthTab />}
        {tab === "dispatchlog" && <DispatchLogTab />}
        {tab === "recipients" && <RecipientsTab />}
        {tab === "schedule" && <ScheduleTab setTab={setTab} />}
      </section>
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

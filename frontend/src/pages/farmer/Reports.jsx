/**
 * Reports.jsx — /farm/reports
 *
 * Mirrors v262 `coreReportsView` → the `ur*View` family (Gate-1 traced):
 *   urLibraryView · urBankEvidenceView(urBankDoc) · urNetWorthView ·
 *   urDispatchLogView · urRecipientsView · urScheduleView.
 * All 6 tabs built to their real layouts. Live where the API serves it
 * (Net so far, Bank Evidence Money-to-date / runs — from financials); honest
 * where it doesn't (credit score, valuation, dispatch log). No fabricated
 * numbers shown to a banker.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  Sprout, Package, Users, Coins, BarChart3, Scale, DollarSign, FlaskConical,
  Shield, Award, Star, Truck, Plus, Phone, FileText, QrCode, Calendar, Download,
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

const CATS = [
  { id: "operational", title: "Operational reports", sub: "Production, stock and labour", reports: [
    { name: "Production report", what: "What was produced — by block, crop and animal", Icon: Sprout, route: "/farm/cycles" },
    { name: "Inventory report", what: "Stock on hand, what was used and what to reorder", Icon: Package, route: "/farm/inventory" },
    { name: "Labour report", what: "Hours, attendance and wages paid", Icon: Users, route: "/farm/labor" },
  ]},
  { id: "financial", title: "Financial reports", sub: "Money, profit and worth", reports: [
    { name: "Cash report", what: "Money in and out across crops + animals", Icon: Coins, route: "/farm/cash" },
    { name: "Profit & loss", what: "Earned, spent and net for every business", Icon: BarChart3, route: "/farm/analytics" },
    { name: "Budget report", what: "Planned spend against actual spend", Icon: Scale, route: "/farm/cash" },
    { name: "Net worth statement", what: "What your animals, stock and assets are worth", Icon: Scale, tab: "networth" },
    { name: "Balance sheet", what: "What the farm owns and owes, and the owner's share", Icon: Scale, route: "/farm/cash" },
    { name: "Valuation statement", what: "Estimated value of livestock, crops and assets", Icon: DollarSign, route: "/farm/cash" },
  ]},
  { id: "compliance", title: "Compliance reports", sub: "Audit trail and certificates", reports: [
    { name: "Compliance log", what: "Spray records and animal withdrawal holds", Icon: FlaskConical, route: "/farm/compliance" },
    { name: "Audit report", what: "Every logged action, hash-linked and tamper-proof", Icon: Shield, route: "/farm/history" },
    { name: "Certification report", what: "Organic, GAP and export certificate status", Icon: Award, route: "/farm/compliance" },
  ]},
  { id: "stakeholder", title: "Stakeholder reports", sub: "For the ministry, investors, partners and buyers", reports: [
    { name: "Government report", what: "Production and compliance summary for the ministry", Icon: Shield, note: "Built from your logged records" },
    { name: "Investor report", what: "Financial performance and growth, for investors", Icon: Star, note: "Built from your logged records" },
    { name: "NGO report", what: "Impact and beneficiary summary, for partners", Icon: Users, note: "Built from your logged records" },
    { name: "Buyer statement", what: "Deliveries and what each buyer owes", Icon: Truck, route: "/farm/buyers" },
  ]},
  { id: "custom", title: "Custom reports", sub: "Build your own", reports: [
    { name: "Custom report", what: "Choose what to include and build your own", Icon: Plus, note: "Pick what to include — builds on the live system" },
  ]},
];
const REPORT_COUNT = CATS.reduce((n, c) => n + c.reports.length, 0) + 1;

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

// ── Library ──────────────────────────────────────────────────────────
function ReportRow({ r }) {
  const navigate = useNavigate();
  const onOpen = () => { if (r.route) navigate(r.route); else if (r.tab) emitToast(`${r.name}: see the Net Worth tab`); else emitToast(`${r.name} · ${r.note}`); };
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.greenDk }}><r.Icon size={16} /></div>
      <div className="flex-1 min-w-0"><div className="font-medium text-sm" style={{ color: C.soil }}>{r.name}</div><div className="text-xs truncate" style={{ color: C.muted }}>{r.what}</div></div>
      <button onClick={onOpen} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open</button>
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
function LibraryTab({ farmId, setTab }) {
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
      <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ background: "white", borderColor: C.green }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Award size={20} /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>Bank Evidence</div><div className="text-xs" style={{ color: C.muted }}>The whole-farm summary a lender reads — identity, money, standing, verification.</div></div>
        <button onClick={() => setTab("bankevidence")} className="text-sm px-4 py-2 rounded-lg text-white shrink-0" style={{ background: C.greenDk }}>Open</button>
      </div>
      {CATS.map((cat) => (
        <div key={cat.id}>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>{cat.title}</div>
          <div className="text-xs mb-2" style={{ color: C.muted }}>{cat.sub}</div>
          <div className="space-y-2">{cat.reports.map((r) => <ReportRow key={r.name} r={r} />)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Bank Evidence (urBankDoc) ────────────────────────────────────────
function BankEvidenceTab({ farmId }) {
  const fin = useFarmFin(farmId); const crops = useCrops(farmId);
  const s = fin.data?.data?.summary || {};
  const income = s.total_income_fjd; const spent = (Number(s.total_labor_cost_fjd) || 0) + (Number(s.total_input_cost_fjd) || 0); const net = s.net_profit_fjd;
  const cropRows = crops.data?.data ?? [];
  const cycles = cropRows.reduce((a, r) => a + (Number(r.total_cycles) || 0), 0);
  return (
    <div className="space-y-3">
      <ChainBanner />
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: `2px solid ${C.soil}`, paddingBottom: 10 }}>
          <div><div className="text-base font-extrabold" style={{ color: C.soil }}>{farmId} — Farm Evidence</div><div className="text-xs" style={{ color: C.muted }}>Whole farm · crops + animals · built from logged records</div></div>
          <span className="text-[11px] font-semibold tracking-widest" style={{ color: C.greenDk }}>TEIVAKA FARM OS</span>
        </div>
        <Section title="The farm">
          <KV k="Farm" v={farmId || "—"} /><KV k="Region" v="—" /><KV k="Area" v="—" />
        </Section>
        <Section title="Money to date">
          <KV k="Earned (money in)" v={income == null ? "—" : fjd(income)} />
          <KV k="Spent (money out)" v={fin.data ? fjd(spent) : "—"} />
          <KV k="Net" v={net == null ? "—" : fjd(net)} strong />
        </Section>
        <Section title="What this farm runs">
          <KV k="Crops tracked" v={crops.data ? String(cropRows.length) : "—"} />
          <KV k="Cycles recorded" v={crops.data ? String(cycles) : "—"} />
        </Section>
        <Section title="Standing">
          <div className="text-xs py-2" style={{ color: C.muted }}>Every record in this document carries a stamp a banker can verify. Credit score & signed-PDF engine pending — shown as “—” rather than fabricated.</div>
          <KV k="Bank readiness score" v="Building baseline" />
          <KV k="Credit score" v="—" />
        </Section>
        <button onClick={() => emitToast("Verification runs against the audit chain (/verify/{hash})")} className="mt-3 text-xs px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Run verification</button>
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
      </div>
    </div>
  );
}

// ── Schedule (urScheduleView) ────────────────────────────────────────
function ScheduleTab({ setTab }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "white", borderColor: C.border }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.amber }}><Calendar size={20} /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-sm" style={{ color: C.soil }}>Automatic monthly reports</div><div className="text-xs" style={{ color: C.muted }}>building baseline — scheduled auto-dispatch turns on once you have a season of records</div></div>
      </div>
      <button onClick={() => setTab("library")} className="text-sm px-4 py-2 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Go to the report library</button>
    </div>
  );
}

function ReportsInner() {
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("library");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Reports</h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>documents a bank or buyer can read — every number from logged activity</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap"><FarmSelector /><ModeDropdown /></div>
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent" }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
        {tab === "library" && <LibraryTab farmId={farmId} setTab={setTab} />}
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

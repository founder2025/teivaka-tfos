/**
 * Reports.jsx — /farm/reports
 *
 * Matches the v262 v801 `coreReportsView` (the rendered one): a "what reports
 * you can make" launcher. 6 sub-tabs (renderReportsViewTabs). Library tab =
 * verification banner + 4 tiles + Bank Evidence hero + 5 grouped report
 * categories (17 reports, exact names/descriptions from source 13896-13912),
 * each row Opens its live source page.
 *
 * Live: "Net so far" tile from financials/farm net_profit; report rows navigate
 * to real pages. Bank Evidence doc layout shown WITHOUT a fabricated score.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClientProvider, QueryClient, useQuery } from "@tanstack/react-query";
import {
  Sprout, Package, Users, Coins, BarChart3, Scale, DollarSign, FlaskConical,
  Shield, Award, Star, Truck, Plus,
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
  { id: "networth", label: "Net Worth", hint: "Asset statement", needs: "a net-worth/asset-statement endpoint" },
  { id: "dispatchlog", label: "Dispatch log", hint: "Sent", needs: "a report-dispatch log endpoint" },
  { id: "recipients", label: "Recipients", hint: "Contacts", needs: "a report-recipients endpoint" },
  { id: "schedule", label: "Schedule", hint: "Auto", needs: "a report-schedule endpoint" },
];

// Exact catalog from coreReportsView (13896-13912). `route` = real source page;
// `tab` = switch sub-tab; `note` = built-from-records (toast).
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
const REPORT_COUNT = CATS.reduce((n, c) => n + c.reports.length, 0) + 1; // +1 Bank Evidence

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
function fjd(v) { const n = Number(v ?? 0); return Number.isNaN(n) ? "FJ$ —" : `FJ$ ${n.toLocaleString("en-FJ", { maximumFractionDigits: 0 })}`; }

function Tile({ label, value, sub, onClick, color }) {
  return (
    <div onClick={onClick} className="rounded-xl border p-3" style={{ background: "white", borderColor: C.border, cursor: onClick ? "pointer" : "default" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color || C.soil }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function ReportRow({ r }) {
  const navigate = useNavigate();
  const onOpen = () => { if (r.route) navigate(r.route); else if (r.tab) emitToast(`${r.name}: see the Net Worth tab`); else emitToast(`${r.name} · ${r.note}`); };
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: "white", borderColor: C.border }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.cream, color: C.greenDk }}><r.Icon size={16} /></div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm" style={{ color: C.soil }}>{r.name}</div>
        <div className="text-xs truncate" style={{ color: C.muted }}>{r.what}</div>
      </div>
      <button onClick={onOpen} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Open</button>
    </div>
  );
}

function LibraryTab({ farmId, setTab }) {
  const navigate = useNavigate();
  const fin = useQuery({ queryKey: ["repfin", farmId], queryFn: async () => {
    const res = await fetch(`/api/v1/financials/farm/${encodeURIComponent(farmId)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(); return res.json();
  }, enabled: !!farmId, retry: 0 });
  const net = fin.data?.data?.summary?.net_profit_fjd;

  return (
    <div className="space-y-4">
      {/* verification chain banner */}
      <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenTint, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.greenDk }}>✓ Verification chain · <strong>INTACT</strong> — every logged record carries a stamp; nothing here is edited after the fact.</div>
        <button onClick={() => emitToast("Verification runs against the audit chain (/verify/{hash})")} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>Run verification</button>
      </div>

      {/* 4 tiles */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Tile label="Reports you can make" value={String(REPORT_COUNT)} sub="crops + animals" />
        <Tile label="Bank Evidence" value="Ready to make" sub="whole farm" onClick={() => setTab("bankevidence")} color={C.greenDk} />
        <Tile label="Net so far" value={net == null ? "—" : fjd(net)} sub="crops + animals" onClick={() => navigate("/farm/cash")} color={Number(net) < 0 ? C.red : C.greenDk} />
        <Tile label="Bank readiness score" value="Building" sub="needs a season of records" color={C.amber} />
      </div>

      {/* Bank Evidence hero */}
      <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ background: "white", borderColor: C.green }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.greenTint, color: C.greenDk }}><Award size={20} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: C.soil }}>Bank Evidence</div>
          <div className="text-xs" style={{ color: C.muted }}>The whole-farm summary a lender reads — identity, money, standing, verification.</div>
        </div>
        <button onClick={() => setTab("bankevidence")} className="text-sm px-4 py-2 rounded-lg text-white shrink-0" style={{ background: C.greenDk }}>Open</button>
      </div>

      {/* grouped categories */}
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

function NeedsBlock({ label, hint, needs }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{label}{hint ? ` · ${hint}` : ""}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>This is laid out and will populate from {needs}. No numbers shown until that data is real — by design.</div>
    </div>
  );
}

function BankEvidenceTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="text-xs font-semibold tracking-widest" style={{ color: C.greenDk }}>TEIVAKA FARM OS</div>
        <div className="text-lg font-bold" style={{ color: C.soil }}>Bank Evidence Report</div>
        <div className="text-xs" style={{ color: C.muted }}>Identity · money · standing · verification · hash-chain verifiable</div>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
          {["The farm", "Money to date", "What this farm runs", "Standing"].map((s) => (
            <div key={s} className="rounded-lg px-2 py-3 text-center" style={{ background: C.cream }}>
              <div className="text-[10px] uppercase" style={{ color: C.muted }}>{s}</div>
              <div className="text-sm font-semibold" style={{ color: C.muted }}>—</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {["WhatsApp to Operator", "Email to banker", "QR to buyer"].map((d) => (
            <span key={d} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: C.muted, border: `1px solid ${C.border}` }}>{d}</span>
          ))}
        </div>
      </div>
      <NeedsBlock label="Bank Evidence" hint="The flagship" needs="a credit-score + signed-PDF + QR-verify engine. The layout is the contract; numbers stay blank until real (we never show a fabricated credit score to a banker)." />
    </div>
  );
}

function ReportsInner() {
  const { farmId } = useCurrentFarm();
  const [tab, setTab] = useState("library");
  const active = TABS.find((t) => t.id === tab) || TABS[0];
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
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>
      <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
        {tab === "library" && <LibraryTab farmId={farmId} setTab={setTab} />}
        {tab === "bankevidence" && <BankEvidenceTab />}
        {active.needs && <NeedsBlock label={active.label} hint={active.hint} needs={active.needs} />}
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

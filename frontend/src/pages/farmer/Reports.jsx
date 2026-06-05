/**
 * Reports.jsx — /farm/reports  (replaces ComingSoon)
 *
 * Team design system + v262 Reports surface — exact 6 sub-tabs (confirmed from
 * renderReportsViewTabs): Library · Bank Evidence · Net Worth · Dispatch log ·
 * Recipients · Schedule.
 *
 * Live where the API serves it; honest structured cards (no fabricated numbers)
 * elsewhere — Bank Evidence shows the doc LAYOUT but NOT a fake credit score.
 *   Library: 8 report types. CSV downloads (real, auth blob) for Cash flow /
 *     Cycle P&L / Labor via /exports; view-summary for CoKG / Harvest via
 *     /reports generators. Bank Evidence / Chemical / Buyer = honest empty.
 *   Bank Evidence/Net Worth/Dispatch/Recipients/Schedule: layout + honest note.
 */
import { useState } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import ModeDropdown from "../../components/farm/ModeDropdown";
import MetricCard from "../../components/farm/MetricCard";

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

// 8 report types. csv = real export download; view = generator summary; else honest.
const REPORT_TYPES = [
  { id: "bankevidence", name: "Bank Evidence", note: "credit score + signed PDF — needs a bank-evidence endpoint" },
  { id: "cokg", name: "CoKG analysis", view: "reports/cokg" },
  { id: "compliance", name: "Chemical compliance log", note: "needs a compliance-log report endpoint" },
  { id: "harvest", name: "Harvest summary", view: "reports/harvest" },
  { id: "cashflow", name: "Cash flow statement", csv: "exports/financials" },
  { id: "cyclepl", name: "Cycle P&L", csv: "exports/cycles" },
  { id: "labor", name: "Labor record", csv: "exports/labor" },
  { id: "buyer", name: "Buyer statement", note: "needs a buyer-statement endpoint" },
];

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

async function downloadCsv(base, farmId, label) {
  try {
    const res = await fetch(`/api/v1/${base}/${encodeURIComponent(farmId)}.csv`, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${label.replace(/\s+/g, "_").toLowerCase()}_${farmId}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    emitToast(`${label} downloaded`);
  } catch { emitToast(`Could not generate ${label}`); }
}

function NeedsBlock({ label, hint, needs }) {
  return (
    <div className="rounded-xl py-8 px-4 text-center" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-medium" style={{ color: C.soil }}>{label}{hint ? ` · ${hint}` : ""}</div>
      <div className="text-xs mt-1 max-w-md mx-auto" style={{ color: C.muted }}>
        This is laid out and will populate from {needs}. No numbers shown until that data is real — by design.
      </div>
    </div>
  );
}

function ReportTypeCard({ rt, farmId }) {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const live = !!(rt.csv || rt.view);

  async function view() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/${rt.view}/${encodeURIComponent(farmId)}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const body = await res.json();
      const obj = body?.data ?? body;
      // pull top-level numeric fields as headline tiles (generic, won't break)
      const nums = Object.entries(obj).filter(([, v]) => typeof v === "number").slice(0, 6);
      setSummary(nums.length ? nums : [["result", "fetched ✓"]]);
    } catch { emitToast(`Could not generate ${rt.name}`); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl p-3 border" style={{ background: "white", borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-sm" style={{ color: C.soil }}>{rt.name}</div>
          <div className="text-[11px]" style={{ color: C.muted }}>{rt.note || (rt.csv ? "CSV export" : "summary generator")}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: live ? C.greenDk : C.muted, background: live ? C.greenTint : C.cream, border: `1px solid ${C.border}` }}>{live ? "Live" : "Needs backend"}</span>
          {rt.csv && <button onClick={() => downloadCsv(rt.csv, farmId, rt.name)} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: C.greenDk }}>Download CSV</button>}
          {rt.view && <button onClick={view} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>{busy ? "…" : "View summary"}</button>}
        </div>
      </div>
      {summary && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 mt-3">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-lg px-2 py-2" style={{ background: C.cream }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{k.replace(/_/g, " ")}</div>
              <div className="text-sm font-semibold" style={{ color: C.soil }}>{typeof v === "number" ? v.toLocaleString() : String(v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryTab({ farmId }) {
  const liveCount = REPORT_TYPES.filter((r) => r.csv || r.view).length;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <MetricCard label="Report types" value={String(REPORT_TYPES.length)} sub="catalog" />
        <MetricCard label="Generatable" value={String(liveCount)} sub="live now" />
        <MetricCard label="Bank Evidence" phase="needs endpoint" />
      </div>
      <div className="space-y-2">
        {REPORT_TYPES.map((rt) => <ReportTypeCard key={rt.id} rt={rt} farmId={farmId} />)}
      </div>
    </div>
  );
}

function BankEvidenceTab() {
  return (
    <div className="space-y-3">
      {/* doc layout — letterhead + sections, no fabricated score */}
      <div className="rounded-xl border p-4" style={{ background: "white", borderColor: C.border }}>
        <div className="text-xs font-semibold tracking-widest" style={{ color: C.greenDk }}>TEIVAKA FARM OS</div>
        <div className="text-lg font-bold" style={{ color: C.soil }}>Bank Evidence Report</div>
        <div className="text-xs" style={{ color: C.muted }}>Credit factors · FICO-analog · hash-chain verifiable</div>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
          {["Farm profile", "Harvest record", "Record length", "Credit score"].map((s) => (
            <div key={s} className="rounded-lg px-2 py-3 text-center" style={{ background: C.cream }}>
              <div className="text-[10px] uppercase" style={{ color: C.muted }}>{s}</div>
              <div className="text-sm font-semibold" style={{ color: C.muted }}>—</div>
            </div>
          ))}
        </div>
      </div>
      <NeedsBlock label="Bank Evidence" hint="The flagship" needs="a credit-score + signed-PDF + QR-verify endpoint. The layout is the contract; the numbers stay blank until the engine is real (we never show a fabricated credit score to a banker)." />
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
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>Evidence-output engine · Bank Evidence · dispatch</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap"><FarmSelector /><ModeDropdown /></div>

      {/* hash-chain integrity banner */}
      <div className="rounded-xl border p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenTint, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.greenDk }}>
          🔗 Hash-chain integrity — every report is anchored to <code>audit.events</code>.
        </div>
        <span className="text-[11px]" style={{ color: C.muted }}>Banker verify by record: <code>/verify/&#123;hash&#125;</code></span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap flex flex-col items-start shrink-0"
            style={{ color: tab === t.id ? C.greenDk : C.muted, borderBottom: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent", opacity: t.needs ? 0.6 : 1 }}>
            {t.label}<span className="text-[10px]" style={{ color: C.muted }}>{t.hint}</span>
          </button>
        ))}
      </div>

      <section className="bg-white rounded-2xl px-3 py-4 sm:px-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.soil }}>{active.label} · {active.hint}</div>
        {tab === "library" && <LibraryTab farmId={farmId} />}
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

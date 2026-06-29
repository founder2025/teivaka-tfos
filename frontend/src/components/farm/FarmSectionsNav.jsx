/**
 * FarmSectionsNav.jsx — compact "jump to any farm section" grid.
 *
 * Prod's farm experience is dashboard-centric (no persistent sidebar), so this
 * makes every farm_unified surface reachable from the Overview — satisfying the
 * Sidebar Completion Rule (every surface reachable from an entry point). All 20
 * routes are verified to exist; no dead links.
 */
import { useNavigate } from "react-router-dom";
import {
  Eye, Clock, CheckSquare, Crosshair, Layers, Sprout, Package, Users, Truck,
  DollarSign, Wrench, MapPin, ShieldCheck, BarChart3, FileText, Cloud,
  BookOpen, Image as ImageIcon, Share2, Settings, Handshake, Wallet,
} from "lucide-react";

const C = { soil: "var(--soil)", greenDk: "var(--green-dk)", border: "var(--line)", muted: "var(--muted)", panel: "var(--paper)", cream: "var(--cream)" };

// Grouped in natural farming order — Plan → Grow → Sell → Prove → Improve →
// Account. Same 22 real routes (no dead links); page merges into tabs happen
// per-destination during the audit, then old routes redirect into their group.
// Consolidated to ~12 destinations (merges land as tabbed pages: Money, Market,
// Records, Insights, Resources). Natural farming order.
const GROUPS = [
  ["Plan", [["Overview", "/farm", Eye], ["Tasks", "/farm/tasks", CheckSquare], ["Weather", "/farm/weather", Cloud]]],
  ["Grow", [["Enterprises", "/farm/enterprises", Layers], ["Production", "/farm/cycles", Sprout], ["Resources", "/farm/resources", Package]]],
  ["Sell", [["Buyers", "/farm/market", Truck], ["Money", "/farm/money", Wallet]]],
  ["Prove", [["Compliance", "/farm/compliance", ShieldCheck], ["Records", "/farm/records", FileText]]],
  ["Improve", [["Insights", "/farm/insights", BarChart3]]],
  ["Account", [["Library", "/farm/library", BookOpen], ["Partnerships", "/farm/partnerships", Share2], ["Settings", "/farm/settings", Settings]]],
];

export default function FarmSectionsNav() {
  const navigate = useNavigate();
  return (
    <section className="rounded-2xl px-4 py-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.soil }}>Go to any farm section</h2>
      <div className="space-y-3">
        {GROUPS.map(([group, items]) => (
          <div key={group}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.muted }}>{group}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
              {items.map(([label, to, Icon]) => (
                <button key={to} onClick={() => navigate(to)}
                  className="rounded-xl border p-2 flex flex-col items-center gap-1 hover:brightness-95"
                  style={{ borderColor: C.border, background: C.cream }}>
                  <Icon size={16} style={{ color: C.greenDk }} />
                  <span className="text-[11px] text-center leading-tight" style={{ color: C.soil }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

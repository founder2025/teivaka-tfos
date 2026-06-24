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
  BookOpen, Image as ImageIcon, Share2, Settings,
} from "lucide-react";

const C = { soil: "var(--soil)", greenDk: "var(--green-dk)", border: "var(--line)", muted: "var(--muted)", panel: "var(--paper)", cream: "var(--cream)" };

const SECTIONS = [
  ["Overview", "/farm", Eye],
  ["History", "/farm/history", Clock],
  ["Tasks", "/farm/tasks", CheckSquare],
  ["Decisions", "/farm/decisions", Crosshair],
  ["Enterprises", "/farm/enterprises", Layers],
  ["Production", "/farm/cycles", Sprout],
  ["Inventory", "/farm/inventory", Package],
  ["Labor", "/farm/labor", Users],
  ["Buyers", "/farm/buyers", Truck],
  ["Cash", "/farm/cash", DollarSign],
  ["Equipment", "/farm/equipment", Wrench],
  ["Locations", "/farm/locations", MapPin],
  ["Compliance", "/farm/compliance", ShieldCheck],
  ["Analytics", "/farm/analytics", BarChart3],
  ["Reports", "/farm/reports", FileText],
  ["Weather", "/farm/weather", Cloud],
  ["Library", "/farm/library", BookOpen],
  ["Gallery", "/farm/gallery", ImageIcon],
  ["Partnerships", "/farm/partnerships", Share2],
  ["Settings", "/farm/settings", Settings],
];

export default function FarmSectionsNav() {
  const navigate = useNavigate();
  return (
    <section className="rounded-2xl px-4 py-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: C.soil }}>Farm sections</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {SECTIONS.map(([label, to, Icon]) => (
          <button key={to} onClick={() => navigate(to)}
            className="rounded-xl border p-2 flex flex-col items-center gap-1 hover:brightness-95"
            style={{ borderColor: C.border, background: C.cream }}>
            <Icon size={16} style={{ color: C.greenDk }} />
            <span className="text-[11px] text-center leading-tight" style={{ color: C.soil }}>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

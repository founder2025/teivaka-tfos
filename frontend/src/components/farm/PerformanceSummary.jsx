/**
 * PerformanceSummary.jsx — Production "Best standing / Needs attention" section.
 *
 * Prototype shows ranked cycle performance. Production exposes per-cycle
 * financials (GET /cycles/{id}/financials) but NO ranked-comparison endpoint,
 * so we do not fabricate a ranking. This renders an honest placeholder until a
 * comparison endpoint exists. Structure matches the prototype so the real data
 * drops in without layout change.
 */
import { BarChart3 } from "lucide-react";

const C = { soil: "#5C4033", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF" };

export default function PerformanceSummary() {
  return (
    <section className="rounded-2xl px-4 py-4 mt-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} style={{ color: C.muted }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>
          Performance
        </h2>
      </div>
      <div className="text-center py-6 text-sm" style={{ color: C.muted }}>
        Cycle comparison appears once you have closed crop runs with cost and
        harvest data. It ranks your strongest and weakest runs by cost-per-kg.
      </div>
    </section>
  );
}

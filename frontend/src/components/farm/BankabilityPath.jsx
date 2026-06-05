/**
 * BankabilityPath.jsx — "How this farm becomes bankable" — the moat story.
 * Static 4-step strip. No data dependency. Mirrors the MyFarm prototype.
 */
import { useNavigate } from "react-router-dom";
import { Plus, Link2, Shield, FileText } from "lucide-react";

const C = {
  soil:   "#5C4033",
  muted:  "#8A7B6F",
  line:   "#E2D8C3",
  paper:  "#FFFFFF",
  green:  "#6AA84F",
  greenDk:"#3E7B1F",
};

const STEPS = [
  { n: 1, Icon: Plus,     title: "Log the work",  desc: "Every task becomes a timestamped record — farm, block, crop, who did it.", to: "/farm/tasks" },
  { n: 2, Icon: Link2,    title: "Audit chain",   desc: "Each record links to the one before it. Nothing changes quietly.",         to: "/farm/compliance" },
  { n: 3, Icon: Shield,   title: "Public verify", desc: "A lender scans a code and checks the records themselves.",                  to: "/me/verify" },
  { n: 4, Icon: FileText, title: "Bank record",   desc: "A bank-ready record built from real work — not typed in.",                 to: "/farm/reports" },
];

export default function BankabilityPath() {
  const navigate = useNavigate();
  return (
    <section className="rounded-2xl px-4 py-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 mb-1">
        <Shield size={15} style={{ color: C.greenDk }} strokeWidth={1.9} />
        <h2 className="text-sm font-semibold" style={{ color: C.soil }}>How this farm becomes bankable</h2>
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>
        Four steps turn daily work into a record a bank can trust. Tap any step.
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {STEPS.map(({ n, Icon, title, desc, to }) => (
          <button
            key={n}
            type="button"
            onClick={() => navigate(to)}
            className="text-left rounded-xl p-3 flex flex-col gap-1.5 transition-colors"
            style={{ background: C.paper, border: `1px solid ${C.line}`, cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.green; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex items-center justify-center rounded-full text-white"
                style={{ width: 22, height: 22, background: C.green, fontSize: 12, fontWeight: 800 }}
              >
                {n}
              </span>
              <Icon size={15} style={{ color: C.greenDk }} strokeWidth={1.9} />
            </div>
            <div style={{ fontWeight: 700, color: C.soil, fontSize: 13.5 }}>{title}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>{desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

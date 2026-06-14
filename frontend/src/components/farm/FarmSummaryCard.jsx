/**
 * FarmSummaryCard.jsx — prototype "Farm summary" section.
 * PH1 placeholder values; Phase 2 wires score + capital tiles to real data.
 */
import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";

const C = { paper:"var(--paper)", green:"var(--green)", greenDk:"var(--green-dk)", soil:"var(--soil)",
  red:"var(--red)", line:"var(--line)", muted:"var(--muted)" };

const SUMMARY = {
  score: 84, grade: "Strong", businesses: 6, onHold: 2,
  snaps: [
    { label:"Production", value:"5 active", sub:"cycles & groups", go:"/farm/cycles" },
    { label:"Cash", value:"FJD 12,400", sub:"net so far", color:C.greenDk, go:"/farm/cash" },
    { label:"Inventory", value:"Building", sub:"stock value", color:C.muted, go:"/farm/inventory" },
    { label:"Labour", value:"3 · 96h", sub:"team this week", go:"/farm/labor" },
    { label:"Compliance", value:"2 on hold", sub:"do not sell", color:C.red, go:"/farm/compliance" },
    { label:"Weather", value:"Live", sub:"see forecast", go:"/farm/weather" },
  ],
};

export default function FarmSummaryCard() {
  const nav = useNavigate();
  const d = SUMMARY;
  return (
    <section className="rounded-2xl px-4 py-4" style={{ background:C.paper, border:`1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={15} style={{ color:C.greenDk }} strokeWidth={1.9} />
        <h3 className="text-sm font-semibold" style={{ color:C.soil }}>Farm summary</h3>
        <span className="text-xs" style={{ color:C.muted }}>· Your whole farm at a glance</span>
      </div>
      <div className="rounded-xl flex items-center gap-5 p-4 mb-3" style={{ border:`1px solid ${C.line}` }}>
        <div className="text-center" style={{ minWidth:80 }}>
          <div style={{ fontSize:34, fontWeight:800, lineHeight:1, color:C.green }}>{d.score}</div>
          <div className="text-xs" style={{ color:C.muted, marginTop:2 }}>/ 100</div>
        </div>
        <div>
          <div style={{ fontWeight:800, color:C.soil, fontSize:16 }}>Farm health: {d.grade}</div>
          <div className="text-xs mt-0.5" style={{ color:C.muted }}>Across {d.businesses} businesses · {d.onHold} things on hold</div>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        {d.snaps.map((s)=>(
          <button key={s.label} onClick={()=>nav(s.go)} className="text-left rounded-xl p-2.5" style={{ border:`1px solid ${C.line}`, cursor:"pointer" }}
            onMouseEnter={(e)=>{e.currentTarget.style.borderColor=C.green;}} onMouseLeave={(e)=>{e.currentTarget.style.borderColor=C.line;}}>
            <div className="text-[10px] font-semibold tracking-wider" style={{ color:C.muted }}>{s.label}</div>
            <div className="font-bold" style={{ fontSize:15, color:s.color||C.soil }}>{s.value}</div>
            <div className="text-[11px]" style={{ color:C.muted }}>{s.sub}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

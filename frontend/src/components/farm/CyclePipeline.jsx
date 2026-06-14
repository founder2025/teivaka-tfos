import { useNavigate } from "react-router-dom";
import { GitBranch, ArrowRight, ChevronRight } from "lucide-react";
const C={paper:"var(--paper)",green:"var(--green)",greenDk:"var(--green-dk)",soil:"var(--soil)",amber:"var(--amber)",red:"var(--red)",line:"var(--line)",muted:"var(--muted)",cream:"var(--cream)"};
const S=[{label:"Planning",n:1},{label:"Planted",n:2},{label:"Growing",n:2},{label:"Harvesting",n:1},{label:"Closing",n:0}];
export default function CyclePipeline(){const nav=useNavigate();return(
<section className="rounded-2xl px-4 py-4" style={{background:C.paper,border:`1px solid ${C.line}`}}>
<div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><GitBranch size={15} style={{color:C.greenDk}}/><h3 className="text-sm font-semibold" style={{color:C.soil}}>Cycle pipeline</h3></div><button onClick={()=>nav("/farm/cycles")} className="text-xs flex items-center gap-1" style={{color:C.greenDk}}>View all cycles<ChevronRight size={12}/></button></div>
<div className="flex items-center gap-1 flex-wrap">{S.map((s,i)=>(<div key={s.label} className="flex items-center gap-1"><button onClick={()=>nav("/farm/cycles")} className="text-center rounded-xl px-3 py-2" style={{border:`1px solid ${C.line}`,minWidth:74}}><div style={{fontSize:20,fontWeight:800,color:C.greenDk}}>{s.n}</div><div className="text-[11px]" style={{color:C.muted}}>{s.label}</div></button>{i<S.length-1&&<ArrowRight size={12} style={{color:C.muted}}/>}</div>))}</div></section>);}

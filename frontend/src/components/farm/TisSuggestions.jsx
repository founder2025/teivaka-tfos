import { useNavigate } from "react-router-dom";
import { Bell, Sparkles, ChevronRight } from "lucide-react";
const C={paper:"var(--paper)",green:"var(--green)",greenDk:"var(--green-dk)",soil:"var(--soil)",amber:"var(--amber)",red:"var(--red)",line:"var(--line)",muted:"var(--muted)",cream:"var(--cream)"};
const T=["Your eggplant block is ready to harvest — log it to lock the record.","Cash is ahead of plan — good time to restock seed."];
export default function TisSuggestions(){const nav=useNavigate();return(
<section className="rounded-2xl px-4 py-4" style={{background:C.paper,border:`1px solid ${C.line}`}}>
<div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Bell size={15} style={{color:C.greenDk}}/><h3 className="text-sm font-semibold" style={{color:C.soil}}>TIS suggestions</h3></div><button onClick={()=>nav("/tis")} className="text-xs flex items-center gap-1" style={{color:C.greenDk}}>More from TIS<ChevronRight size={12}/></button></div>
<div className="flex flex-col gap-2">{T.map((s,i)=>(<div key={i} className="flex items-start gap-2 text-[13px] rounded-xl p-2.5" style={{border:`1px solid ${C.line}`,color:C.soil}}><Sparkles size={14} style={{color:C.green,marginTop:2}}/>{s}</div>))}</div></section>);}

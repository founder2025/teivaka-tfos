import { useNavigate } from "react-router-dom";
import { ListTodo, ChevronRight } from "lucide-react";
const C={paper:"#FFFFFF",green:"#6AA84F",greenDk:"#3E7B1F",soil:"#5C4033",amber:"#BF9000",red:"#A32D2D",line:"#E2D8C3",muted:"#8A7B6F",cream:"#F8F3E9"};
const D=[{crop:"Eggplant",cycle:"Crops",title:"Spray due — block 3",due:"Today · withholding ends",sev:"high"},{crop:"Tomato",cycle:"Crops",title:"Harvest window opens",due:"Today",sev:"normal"},{crop:"Goats",cycle:"Animals",title:"Weigh-in scheduled",due:"This week",sev:"normal"}];
export default function PriorityCards(){const nav=useNavigate();return(
<section className="rounded-2xl px-4 py-4" style={{background:C.paper,border:`1px solid ${C.line}`}}>
<div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><ListTodo size={15} style={{color:C.greenDk}}/><h3 className="text-sm font-semibold" style={{color:C.soil}}>Today's priorities</h3></div><button onClick={()=>nav("/farm/tasks")} className="text-xs flex items-center gap-1" style={{color:C.greenDk}}>View all tasks<ChevronRight size={12}/></button></div>
<div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>{D.map((p,i)=>(
<div key={i} className="rounded-xl p-3" style={{border:`1px solid ${p.sev==="high"?C.red:C.line}`,borderLeft:`3px solid ${p.sev==="high"?C.red:C.green}`}}>
<div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:C.cream,color:C.greenDk}}>{p.crop}</span><span className="text-[10px]" style={{color:C.muted}}>{p.cycle}</span></div>
<div className="text-sm font-semibold" style={{color:C.soil}}>{p.title}</div><div className="text-[11px] mb-2" style={{color:C.muted}}>{p.due}</div>
<div className="flex gap-1.5"><button className="text-[11px] font-semibold px-2.5 py-1 rounded text-white" style={{background:C.green}} onClick={()=>nav("/farm/tasks")}>DONE</button><button className="text-[11px] px-2.5 py-1 rounded" style={{border:`1px solid ${C.line}`,color:C.soil}} onClick={()=>nav("/farm/tasks")}>SKIP</button></div>
</div>))}</div></section>);}

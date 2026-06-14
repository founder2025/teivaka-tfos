import { useNavigate } from "react-router-dom";
import { Plus, Sprout, ArrowRight, DollarSign, ListTodo, Users, Camera } from "lucide-react";
const C={paper:"var(--paper)",green:"var(--green)",greenDk:"var(--green-dk)",soil:"var(--soil)",amber:"var(--amber)",red:"var(--red)",line:"var(--line)",muted:"var(--muted)",cream:"var(--cream)"};
const A=[{label:"Harvest",icon:Sprout,a:"/farm/harvest/new"},{label:"Cash in",icon:ArrowRight,a:"/farm/cash"},{label:"Expense",icon:DollarSign,a:"/farm/cash"},{label:"Field event",icon:ListTodo,a:"/farm/field-events?new=1"},{label:"Labor",icon:Users,a:"/farm/labor"},{label:"Photo",icon:Camera,a:"/farm/gallery"}];
export default function QuickActions(){const nav=useNavigate();return(
<section className="rounded-2xl px-4 py-4" style={{background:C.paper,border:`1px solid ${C.line}`}}>
<div className="flex items-center gap-2 mb-3"><Plus size={15} style={{color:C.greenDk}}/><h3 className="text-sm font-semibold" style={{color:C.soil}}>Quick actions</h3></div>
<div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))"}}>{A.map((q)=>{const Ic=q.icon;return(<button key={q.label} onClick={()=>nav(q.a)} className="flex flex-col items-center gap-1.5 rounded-xl py-3" style={{border:`1px solid ${C.line}`,cursor:"pointer"}}><Ic size={16} style={{color:C.greenDk}}/><span className="text-[12px]" style={{color:C.soil}}>{q.label}</span></button>);})}</div></section>);}

/**
 * FarmSelector.jsx — rich farm switcher matching MyFarm prototype.
 * Real data: GET /api/v1/farms (list+stats), GET /api/v1/auth/me (tenant+role).
 * Switch farm = setFarmId. Add/Manage/Switch buttons present (wired in later steps).
 * Add another farm is FOUNDER-only (backend require_role FOUNDER).
 */
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentFarm } from "../../context/CurrentFarmContext";
import { Map, ChevronDown, Leaf, Check, Plus, Settings, Repeat } from "lucide-react";

const C = { paper:"#FFFFFF", green:"#6AA84F", greenDk:"#3E7B1F", soil:"#5C4033",
  muted:"#8A7B6F", line:"#E2D8C3", cream:"#F8F3E9" };

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return { "Content-Type":"application/json", ...(t?{Authorization:`Bearer ${t}`}:{}) };
}
async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`farms ${res.status}`);
  const b = await res.json();
  return b?.farms ?? b?.data?.farms ?? [];
}
async function fetchMe() {
  const res = await fetch("/api/v1/auth/me", { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}
function area(ha) {
  if (ha == null) return "—";
  const n = Number(ha);
  return isNaN(n) ? "—" : `${n.toFixed(2)} ha`;
}

export default function FarmSelector() {
  const { farmId, setFarmId } = useCurrentFarm();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const { data: farms = [], isLoading } = useQuery({ queryKey:["farms"], queryFn: fetchFarms });
  const { data: me } = useQuery({ queryKey:["auth-me"], queryFn: fetchMe });

  useEffect(() => {
    if (farms.length && !farms.some((f)=>f.farm_id===farmId)) setFarmId(farms[0].farm_id);
  }, [farms, farmId, setFarmId]);

  useEffect(() => {
    function onDoc(e){ if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (isLoading) return <span className="text-sm" style={{ color:C.muted }}>Loading farms…</span>;
  if (!farms.length) return <span className="text-sm" style={{ color:C.muted }}>No farms yet</span>;

  const current = farms.find((f)=>f.farm_id===farmId) || farms[0];
  const tenantName = me?.tenant_name || me?.tenant?.name || "Teivaka";
  const tier = (me?.subscription_tier || me?.tier || "").toString().toUpperCase();
  const role = (me?.role || "OWNER").toString().toUpperCase();
  const isFounder = role === "FOUNDER";
  const pill = [current.farm_id, current.farm_name, current.location_island].filter(Boolean).join(" · ");

  function pickFarm(fid){ setFarmId(fid); setOpen(false); }

  return (
    <div className="relative inline-block" ref={wrapRef} style={{ minWidth: 220 }}>
      <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-2 w-full text-left rounded-xl px-3 py-2"
        style={{ background:C.paper, border:`1px solid ${C.line}`, cursor:"pointer" }}>
        <Map size={14} style={{ color:C.greenDk }} />
        <span className="text-sm font-semibold flex-1 truncate" style={{ color:C.soil }}>{pill}</span>
        <ChevronDown size={14} style={{ color:C.muted, transform: open?"rotate(180deg)":"none", transition:"transform .15s" }} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 rounded-2xl overflow-hidden" style={{ background:C.paper, border:`1px solid ${C.line}`, minWidth:300, boxShadow:"0 8px 28px rgba(0,0,0,.12)" }}>
          <div className="px-3 py-2.5" style={{ borderBottom:`1px solid ${C.line}`, background:C.cream }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider" style={{ color:C.muted }}>TENANT</span>
              <span className="text-sm font-bold" style={{ color:C.soil }}>{tenantName}</span>
              {tier && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background:C.green }}>{tier}</span>}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color:C.muted }}>Your role: <strong style={{ color:C.soil }}>{role}</strong> · access to {farms.length} farm{farms.length===1?"":"s"}</div>
          </div>

          <div className="py-1" style={{ maxHeight:320, overflowY:"auto" }}>
            {farms.map((f)=>{ const active = f.farm_id===current.farm_id; return (
              <button key={f.farm_id} onClick={()=>pickFarm(f.farm_id)} className="flex items-center gap-2.5 w-full text-left px-3 py-2.5"
                style={{ background: active?C.cream:"transparent", cursor:"pointer", borderLeft:`3px solid ${active?C.green:"transparent"}` }}
                onMouseEnter={(e)=>{ if(!active) e.currentTarget.style.background=C.cream; }} onMouseLeave={(e)=>{ if(!active) e.currentTarget.style.background="transparent"; }}>
                <div className="flex items-center justify-center rounded-lg" style={{ width:30, height:30, background:C.paper, border:`1px solid ${C.line}` }}><Leaf size={15} style={{ color:C.greenDk }}/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color:C.soil }}>{f.farm_name||f.farm_id}{active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background:C.green, color:C.paper }}>current</span>}</div>
                  <div className="text-[11px]" style={{ color:C.muted }}>{[f.farm_id, f.location_island||f.location_name].filter(Boolean).join(" · ")}</div>
                  <div className="text-[11px] flex gap-2.5 mt-0.5" style={{ color:C.muted }}>
                    <span>{f.active_cycles ?? 0} active cycle{(f.active_cycles===1)?"":"s"}</span>
                    <span>{area(f.land_area_ha)}</span>
                    {f.open_alerts>0 && <span style={{ color:"#A32D2D" }}>{f.open_alerts} alert{f.open_alerts===1?"":"s"}</span>}
                  </div>
                </div>
                {active && <Check size={15} style={{ color:C.green }} />}
              </button>
            ); })}
          </div>

          <div className="py-1" style={{ borderTop:`1px solid ${C.line}` }}>
            {isFounder && (
              <button onClick={()=>window.dispatchEvent(new CustomEvent("tfos:add-farm"))} className="flex items-center gap-2 w-full text-left px-3 py-2 text-[13px]" style={{ color:C.soil, cursor:"pointer" }}
                onMouseEnter={(e)=>e.currentTarget.style.background=C.cream} onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
                <Plus size={14} style={{ color:C.greenDk }} /> Add another farm
              </button>
            )}
            <button onClick={()=>window.dispatchEvent(new CustomEvent("tfos:manage-farms"))} className="flex items-center gap-2 w-full text-left px-3 py-2 text-[13px]" style={{ color:C.soil, cursor:"pointer" }}
              onMouseEnter={(e)=>e.currentTarget.style.background=C.cream} onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
              <Settings size={14} style={{ color:C.greenDk }} /> Manage farms
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FarmSelector.jsx — rich farm switcher matching MyFarm prototype.
 * Real data: GET /api/v1/farms (list+stats), GET /api/v1/auth/me (tenant+role).
 * Switch farm = setFarmId. Add/Manage/Switch buttons present (wired in later steps).
 * Add another farm is FOUNDER-only (backend require_role FOUNDER).
 */
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentFarm } from "../../context/CurrentFarmContext";
import { Map, ChevronDown, Leaf, Check, Plus, Settings, Repeat, X } from "lucide-react";

const C = { paper:"#FFFFFF", green:"#6AA84F", greenDk:"#3E7B1F", soil:"#5C4033",
  muted:"#8A7B6F", line:"#E2D8C3", cream:"#F8F3E9" };

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return { "Content-Type":"application/json", ...(t?{Authorization:`Bearer ${t}`}:{}) };
}
function jwtRole() {
  try {
    const t = localStorage.getItem("tfos_access_token");
    if (!t) return "";
    const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return (payload.role || "").toString().toUpperCase();
  } catch { return ""; }
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
async function createFarm(payload) {
  const res = await fetch("/api/v1/farms", { method:"POST", headers: authHeaders(), body: JSON.stringify(payload) });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body?.detail || `Create failed (${res.status})`);
  return body;
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
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ farm_id:"", farm_name:"", location_name:"", location_island:"", land_area_ha:"", notes:"" });
  const [formErr, setFormErr] = useState("");
  const addMut = useMutation({
    mutationFn: (p) => createFarm(p),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey:["farms"] });
      setShowAdd(false);
      setForm({ farm_id:"", farm_name:"", location_name:"", location_island:"", land_area_ha:"", notes:"" });
      setFormErr("");
      const newId = created?.farm_id || created?.farm?.farm_id;
      if (newId) setFarmId(newId);
    },
    onError: (e) => setFormErr(String(e.message || "Could not create farm")),
  });
  function submitAdd() {
    if (!form.farm_id.trim() || !form.farm_name.trim()) { setFormErr("Farm ID and name are required."); return; }
    setFormErr("");
    addMut.mutate({
      farm_id: form.farm_id.trim(),
      farm_name: form.farm_name.trim(),
      location_name: form.location_name.trim() || null,
      location_island: form.location_island.trim() || null,
      land_area_ha: form.land_area_ha ? Number(form.land_area_ha) : null,
      notes: form.notes.trim() || null,
    });
  }

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
  const role = (jwtRole() || me?.role || "OWNER").toString().toUpperCase();
  const systemRole = jwtRole();
  const isFounder = systemRole === "FOUNDER";
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
              <button onClick={()=>{ setOpen(false); setShowAdd(true); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-[13px]" style={{ color:C.soil, cursor:"pointer" }}
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

      {showAdd && (
        <div onClick={()=>setShowAdd(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} className="rounded-2xl" style={{ background:C.paper, width:"100%", maxWidth:420, border:`1px solid ${C.line}`, overflow:"hidden" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom:`1px solid ${C.line}`, background:C.cream }}>
              <div className="flex items-center gap-2"><Plus size={15} style={{ color:C.greenDk }}/><strong style={{ color:C.soil, fontSize:15 }}>Add another farm</strong></div>
              <button onClick={()=>setShowAdd(false)} style={{ cursor:"pointer", color:C.muted, background:"none", border:"none" }}><X size={16}/></button>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              <Field label="Farm ID *" hint="Short code, e.g. F003" value={form.farm_id} onChange={(v)=>setForm(f=>({...f,farm_id:v}))} />
              <Field label="Farm name *" value={form.farm_name} onChange={(v)=>setForm(f=>({...f,farm_name:v}))} />
              <Field label="Location" value={form.location_name} onChange={(v)=>setForm(f=>({...f,location_name:v}))} />
              <Field label="Island / province" value={form.location_island} onChange={(v)=>setForm(f=>({...f,location_island:v}))} />
              <Field label="Land area (hectares)" type="number" value={form.land_area_ha} onChange={(v)=>setForm(f=>({...f,land_area_ha:v}))} />
              <Field label="Notes" value={form.notes} onChange={(v)=>setForm(f=>({...f,notes:v}))} />
              {formErr && <div className="text-[12px] px-2 py-1.5 rounded" style={{ background:"#FBEAEA", color:"#A32D2D" }}>{formErr}</div>}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop:`1px solid ${C.line}` }}>
              <button onClick={()=>setShowAdd(false)} className="text-[13px] px-3 py-1.5 rounded-lg" style={{ border:`1px solid ${C.line}`, color:C.soil, cursor:"pointer" }}>Cancel</button>
              <button onClick={submitAdd} disabled={addMut.isPending} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background:C.green, cursor:"pointer", opacity:addMut.isPending?0.6:1 }}>{addMut.isPending?"Creating…":"Create farm"}</button>
            </div>
          </div>
        </div>
      )}
        </div>
  );
}


function Field({ label, hint, value, onChange, type="text" }) {
  return (
    <label style={{ display:"block" }}>
      <span style={{ fontSize:11, fontWeight:600, color:"#8A7B6F" }}>{label}</span>
      <input type={type} value={value} onChange={(e)=>onChange(e.target.value)}
        className="w-full rounded-lg px-2.5 py-1.5 mt-0.5"
        style={{ border:"1px solid #E2D8C3", fontSize:13, color:"#5C4033", outline:"none" }} />
      {hint && <span style={{ fontSize:10, color:"#8A7B6F" }}>{hint}</span>}
    </label>
  );
}
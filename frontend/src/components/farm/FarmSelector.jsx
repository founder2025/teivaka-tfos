/**
 * FarmSelector — rich farm switcher popover (prototype style).
 *
 * Trigger shows the current farm; the popover lists every farm in the tenant as a
 * card (name, id, island, active cycles, zones, area) and switches on click. Adds
 * a farm via the modal (server auto-mints the id). Selection lives in
 * CurrentFarmContext (localStorage). Only functional actions are shown — no dead
 * "switch tenant" stub (Sidebar Completion Rule).
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, Check, Sprout } from "lucide-react";

import { useCurrentFarm } from "../../context/CurrentFarmContext";
import { getCurrentUser } from "../../utils/auth";
import Modal from "../ui/Modal.jsx";

const C = { soil: "#5C4033", border: "#E6DED0", muted: "#8A7863", green: "#6AA84F", greenDk: "#3E7B1F", cream: "#F8F3E9", paper: "#FCFAF5", greenTint: "#E9F2DD" };

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const acres = (ha) => (ha == null ? null : `${(Number(ha) * 2.47105).toFixed(2)} acres`);
function roleLabel(r) {
  if (r === "FOUNDER" || r === "ENTERPRISE_ADMIN") return "OWNER";
  return (r || "MEMBER").replace(/_/g, " ");
}

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json())?.farms ?? [];
}

export default function FarmSelector() {
  const { farmId, setFarmId } = useCurrentFarm();
  const qc = useQueryClient();
  const { data: farms = [], isLoading } = useQuery({ queryKey: ["farms"], queryFn: fetchFarms, staleTime: 5 * 60_000 });
  const role = getCurrentUser()?.role;

  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [island, setIsland] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (farms.length && !farms.some((f) => f.farm_id === farmId)) setFarmId(farms[0].farm_id);
  }, [farms, farmId, setFarmId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = farms.find((f) => f.farm_id === farmId);

  async function createFarm() {
    if (!name.trim()) { emitToast("Give the farm a name"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/farms", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ farm_name: name.trim(), location_island: island.trim() || null }),
      });
      if (res.status === 403) { emitToast("Only the farm owner can add farms"); return; }
      if (!res.ok) throw new Error();
      const row = await res.json();
      await qc.invalidateQueries({ queryKey: ["farms"] });
      setFarmId(row.farm_id);
      emitToast(`Farm "${row.farm_name}" added`);
      setAddOpen(false); setOpen(false); setName(""); setIsland("");
    } catch { emitToast("Couldn't create the farm"); }
    finally { setBusy(false); }
  }

  if (isLoading) return <div className="inline-flex rounded-lg animate-pulse" style={{ background: "#EFE7D6", height: 38, width: 220 }} />;

  return (
    <div className="relative inline-block" ref={wrapRef}>
      {/* Trigger */}
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F]"
        style={{ background: "white", color: C.soil, border: `1px solid ${C.border}`, minWidth: 200 }}>
        <Sprout size={15} style={{ color: C.greenDk }} />
        <span className="flex-1 truncate text-left">
          {current ? <>{current.farm_id} · {current.farm_name}{current.location_island ? ` · ${current.location_island}` : ""}</> : "Select farm…"}
        </span>
        <ChevronDown size={15} style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 mt-1.5 rounded-2xl shadow-xl z-[1500] overflow-hidden"
          style={{ width: 320, background: "white", border: `1px solid ${C.border}` }}>
          <div className="px-3.5 py-2.5" style={{ background: C.paper, borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>Your farms</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.greenTint, color: C.greenDk }}>{roleLabel(role)}</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>Access to {farms.length} farm{farms.length === 1 ? "" : "s"}</div>
          </div>

          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {farms.map((f) => {
              const sel = f.farm_id === farmId;
              return (
                <button key={f.farm_id} onClick={() => { setFarmId(f.farm_id); setOpen(false); }}
                  className="w-full text-left flex items-start gap-2.5 rounded-xl p-2.5 hover:brightness-[0.98]"
                  style={{ background: sel ? C.greenTint : "transparent", border: `1px solid ${sel ? C.green : "transparent"}` }}>
                  <span className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: sel ? C.green : C.cream }}>
                    <Sprout size={15} style={{ color: sel ? "white" : C.greenDk }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate" style={{ color: C.soil }}>{f.farm_name}</span>
                      {sel && <Check size={13} style={{ color: C.greenDk }} />}
                    </span>
                    <span className="block text-[11px]" style={{ color: C.muted }}>{f.farm_id}{f.location_island ? ` · ${f.location_island}` : ""}</span>
                    <span className="block text-[11px] mt-0.5" style={{ color: C.muted }}>
                      {(f.active_cycles ?? 0)} active cycle{f.active_cycles === 1 ? "" : "s"}
                      {f.zone_count != null ? ` · ${f.zone_count} zone${f.zone_count === 1 ? "" : "s"}` : ""}
                      {acres(f.land_area_ha) ? ` · ${acres(f.land_area_ha)}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => setAddOpen(true)}
              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold hover:brightness-95"
              style={{ color: C.greenDk }}>
              <Plus size={15} />Add another farm
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add farm" size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setAddOpen(false)} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={createFarm} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add farm</button>
        </div>}>
        <div className="space-y-3">
          <label className="block text-sm" style={{ color: C.soil }}>Farm name
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createFarm(); }}
              placeholder="e.g. Riverside Farm" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Island / area (optional)
            <input value={island} onChange={(e) => setIsland(e.target.value)} placeholder="e.g. Viti Levu"
              className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <p className="text-xs" style={{ color: C.muted }}>A farm id is assigned automatically. Map its boundary and blocks in Locations.</p>
        </div>
      </Modal>
    </div>
  );
}

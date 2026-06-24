/**
 * FarmsManage.jsx — /farm/manage
 *
 * Manage every farm in the tenant: edit (name / island / area), archive
 * (is_active=false, reversible) and delete (only when the farm has no zones,
 * blocks or cycles — else archive). All canonical: rename here propagates by id
 * everywhere. Tenant-scoped.
 */
import { useState } from "react";
import { QueryClientProvider, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sprout, Pencil, Archive, ArchiveRestore, Trash2, Plus, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import Modal from "../../components/ui/Modal.jsx";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)", green: "var(--green)", greenDk: "var(--green-dk)", red: "var(--red)", paper: "var(--cream-2)", greenTint: "var(--green-tint)" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" }; }
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const acres = (ha) => (ha == null ? "—" : `${(Number(ha) * 2.47105).toFixed(2)} acres`);
function cropLabel(f) {
  const n = f.crop_types || 0, names = f.crop_names || [];
  if (n === 0) return null;
  if (n === 1) return names[0] || "1 crop";
  return `Mixed · ${n} crops`;
}
async function getFarms() { const r = await fetch("/api/v1/farms", { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return (await r.json())?.farms ?? []; }

function EditModal({ farm, onClose, onSaved }) {
  const [name, setName] = useState(farm?.farm_name || "");
  const [island, setIsland] = useState(farm?.location_island || "");
  const [area, setArea] = useState(farm?.land_area_ha ?? "");
  const [busy, setBusy] = useState(false);
  if (!farm) return null;
  async function save() {
    if (!name.trim()) { emitToast("Name can't be empty"); return; }
    setBusy(true);
    try {
      const body = { farm_name: name.trim(), location_island: island.trim() || null };
      if (area !== "" && !Number.isNaN(Number(area))) body.land_area_ha = Number(area);
      const r = await fetch(`/api/v1/farms/${encodeURIComponent(farm.farm_id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      emitToast("Farm updated"); onSaved?.(); onClose?.();
    } catch { emitToast("Couldn't update the farm"); } finally { setBusy(false); }
  }
  return (
    <Modal isOpen onClose={onClose} title={`Edit ${farm.farm_name}`} size="sm"
      footer={<div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Save</button>
      </div>}>
      <div className="space-y-3">
        <label className="block text-sm" style={{ color: C.soil }}>Farm name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Island / area
          <input value={island} onChange={(e) => setIsland(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <label className="block text-sm" style={{ color: C.soil }}>Land area (hectares)
          <input type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
        <p className="text-xs" style={{ color: C.muted }}>Renaming here updates this farm everywhere it appears.</p>
      </div>
    </Modal>
  );
}

function ManageInner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { farmId, setFarmId } = useCurrentFarm();
  const { data: farms = [], isLoading } = useQuery({ queryKey: ["farms"], queryFn: getFarms });
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["farms"] });

  async function setArchived(farm, archived) {
    try {
      const r = await fetch(`/api/v1/farms/${encodeURIComponent(farm.farm_id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ is_active: !archived }) });
      if (!r.ok) throw new Error();
      emitToast(archived ? "Farm archived" : "Farm restored"); refresh();
    } catch { emitToast("Couldn't update the farm"); }
  }
  async function doDelete(farm) {
    try {
      const r = await fetch(`/api/v1/farms/${encodeURIComponent(farm.farm_id)}`, { method: "DELETE", headers: authHeaders() });
      if (r.status === 409) { const e = await r.json().catch(() => ({})); emitToast(e.detail || "Farm has data — archive it instead"); setConfirmDel(null); return; }
      if (!r.ok) throw new Error();
      emitToast("Farm deleted");
      if (farm.farm_id === farmId) { const left = farms.filter((f) => f.farm_id !== farm.farm_id); setFarmId(left[0]?.farm_id || null); }
      setConfirmDel(null); refresh();
    } catch { emitToast("Couldn't delete the farm"); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Manage farms</h1>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Edit, archive or delete your farms · names update everywhere</div>
        </div>
        <button onClick={() => navigate("/farm/locations")} className={`text-sm px-3 py-2 rounded-lg flex items-center gap-1.5 ${FOCUS}`} style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>
          <MapPin size={14} />Map a farm
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border p-6" style={{ borderColor: C.border, background: "var(--paper)" }}>Loading farms…</div>
      ) : farms.length === 0 ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: C.border, background: "var(--paper)", color: C.muted }}>No farms yet. Add one from the farm switcher.</div>
      ) : (
        <div className="space-y-2">
          {farms.map((f) => {
            const archived = f.is_active === false;
            return (
              <div key={f.farm_id} className="rounded-2xl border p-3.5 flex items-start gap-3" style={{ borderColor: C.border, background: "var(--paper)", opacity: archived ? 0.6 : 1 }}>
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: f.farm_id === farmId ? C.green : C.cream }}>
                  <Sprout size={17} style={{ color: f.farm_id === farmId ? "var(--paper)" : C.greenDk }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: C.soil }}>{f.farm_name}</span>
                    {f.farm_id === farmId && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.greenTint, color: C.greenDk }}>current</span>}
                    {archived && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.cream, color: C.muted }}>archived</span>}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{[f.location_island, cropLabel(f)].filter(Boolean).join(" · ")}</div>
                  <div className="text-[11px]" style={{ color: C.muted }}>{(f.active_cycles ?? 0)} active cycle{f.active_cycles === 1 ? "" : "s"} · {(f.member_count ?? 0)} member{f.member_count === 1 ? "" : "s"} · {(f.zone_count ?? 0)} zone{f.zone_count === 1 ? "" : "s"} · {acres(f.land_area_ha)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEdit(f)} title="Edit" className={`p-2 rounded-lg ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}><Pencil size={14} /></button>
                  <button onClick={() => setArchived(f, !archived)} title={archived ? "Restore" : "Archive"} className={`p-2 rounded-lg ${FOCUS}`} style={{ color: C.soil, border: `1px solid ${C.border}` }}>
                    {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                  <button onClick={() => setConfirmDel(f)} title="Delete" className={`p-2 rounded-lg ${FOCUS}`} style={{ color: C.red, border: `1px solid ${C.border}` }}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs" style={{ color: C.muted }}>Delete only works on an empty farm (no zones, blocks or cycles). Otherwise archive it — archived farms stay for the record and can be restored.</p>

      {edit && <EditModal farm={edit} onClose={() => setEdit(null)} onSaved={refresh} />}

      {confirmDel && (
        <Modal isOpen onClose={() => setConfirmDel(null)} title={`Delete ${confirmDel.farm_name}?`} size="sm"
          footer={<div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
            <button onClick={() => doDelete(confirmDel)} className="px-4 py-2 rounded-lg text-white" style={{ background: C.red }}>Delete farm</button>
          </div>}>
          <p className="text-sm" style={{ color: C.soil }}>This permanently removes <strong>{confirmDel.farm_name}</strong> ({confirmDel.farm_id}) and its map. It only works if the farm has no zones, blocks or cycles — otherwise archive it instead.</p>
        </Modal>
      )}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });
export default function FarmsManage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <ManageInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

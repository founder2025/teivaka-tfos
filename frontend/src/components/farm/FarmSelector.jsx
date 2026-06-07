/**
 * FarmSelector — dropdown of all farms in the user's tenant + "Add farm".
 *
 * Selection is held in CurrentFarmContext (localStorage-backed). On mount,
 * if the persisted id is missing or invalid, falls back to the first farm.
 * Add farm mints a real tenant.farms record (server auto-assigns the id),
 * refreshes the list, and switches to the new farm.
 */
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useCurrentFarm } from "../../context/CurrentFarmContext";
import ThemedSelect from "../inputs/ThemedSelect.jsx";
import Modal from "../ui/Modal.jsx";

const C = { soil: "#5C4033", border: "#E6DED0", muted: "#8A7863", greenDk: "#3E7B1F", cream: "#F8F3E9" };

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

async function fetchFarms() {
  const res = await fetch("/api/v1/farms", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body?.farms ?? [];
}

export default function FarmSelector() {
  const { farmId, setFarmId } = useCurrentFarm();
  const qc = useQueryClient();
  const { data: farms = [], isLoading } = useQuery({ queryKey: ["farms"], queryFn: fetchFarms, staleTime: 5 * 60_000 });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [island, setIsland] = useState("");
  const [busy, setBusy] = useState(false);

  // Fall back to first farm if persisted id is gone (effect, not render-phase).
  useEffect(() => {
    if (farms.length && !farms.some((f) => f.farm_id === farmId)) setFarmId(farms[0].farm_id);
  }, [farms, farmId, setFarmId]);

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
      setFarmId(row.farm_id);            // instant switch to the new farm
      emitToast(`Farm "${row.farm_name}" added`);
      setOpen(false); setName(""); setIsland("");
    } catch { emitToast("Couldn't create the farm"); }
    finally { setBusy(false); }
  }

  const options = farms.map((f) => {
    const parts = [];
    if (f.farm_name) parts.push(f.farm_name);
    if (f.location_island) parts.push(f.location_island);
    return { value: f.farm_id, label: parts.length ? parts.join(" · ") : f.farm_id };
  });

  return (
    <div className="inline-flex items-center gap-1.5">
      {isLoading ? (
        <div className="inline-flex items-center rounded-lg animate-pulse" style={{ background: "#EFE7D6", height: 36, width: 180 }} />
      ) : farms.length === 0 ? (
        <span className="text-sm" style={{ color: C.muted }}>No farms yet</span>
      ) : (
        <div className="inline-block" style={{ minWidth: 180 }}>
          <ThemedSelect value={farmId || ""} onChange={(v) => setFarmId(v)} options={options} placeholder="Select farm…" />
        </div>
      )}
      <button onClick={() => setOpen(true)} title="Add farm"
        className="inline-flex items-center justify-center rounded-lg hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6AA84F]"
        style={{ width: 36, height: 36, color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}>
        <Plus size={16} />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add farm" size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg" style={{ color: C.muted }}>Cancel</button>
          <button onClick={createFarm} disabled={busy} className="px-4 py-2 rounded-lg text-white" style={{ background: C.greenDk, opacity: busy ? 0.6 : 1 }}>Add farm</button>
        </div>}>
        <div className="space-y-3">
          <label className="block text-sm" style={{ color: C.soil }}>Farm name
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createFarm(); }}
              placeholder="e.g. Riverside Farm" className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <label className="block text-sm" style={{ color: C.soil }}>Island / area (optional)
            <input value={island} onChange={(e) => setIsland(e.target.value)} placeholder="e.g. Viti Levu"
              className="mt-1 w-full px-3 py-2 rounded-lg border" style={{ borderColor: C.border }} /></label>
          <p className="text-xs" style={{ color: C.muted }}>A farm id is assigned automatically. You can map its boundary and blocks in Locations.</p>
        </div>
      </Modal>
    </div>
  );
}

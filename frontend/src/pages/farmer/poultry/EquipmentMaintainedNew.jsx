/**
 * EquipmentMaintainedNew - Phase 6.3-22. Equipment maintenance logging.
 * flock_id OPTIONAL (whole-farm equipment via toggle).
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const EQUIPMENT_TYPES = [
  { value: 'FEEDER',      label: 'Feeder' },
  { value: 'WATERER',     label: 'Waterer' },
  { value: 'HEATING',     label: 'Heating' },
  { value: 'VENTILATION', label: 'Ventilation' },
  { value: 'LIGHTING',    label: 'Lighting' },
  { value: 'NEST_BOX',    label: 'Nest box' },
  { value: 'FENCING',     label: 'Fencing' },
  { value: 'OTHER',       label: 'Other' },
];

const MAINTENANCE_TYPES = [
  { value: 'REPAIR',      label: 'Repair' },
  { value: 'CLEANING',    label: 'Cleaning' },
  { value: 'REPLACEMENT', label: 'Replacement' },
  { value: 'INSPECTION',  label: 'Inspection' },
  { value: 'CALIBRATION', label: 'Calibration' },
];

const PERFORMED_BY = [
  { value: 'OWNER',            label: 'Owner' },
  { value: 'WORKER',           label: 'Worker' },
  { value: 'EXTERNAL_SERVICE', label: 'External service' },
];

const Schema = z.object({
  equipment_type: z.enum(['FEEDER', 'WATERER', 'HEATING', 'VENTILATION', 'LIGHTING', 'NEST_BOX', 'FENCING', 'OTHER']),
  maintenance_type: z.enum(['REPAIR', 'CLEANING', 'REPLACEMENT', 'INSPECTION', 'CALIBRATION']),
  cost_fjd: z.number().positive().optional(),
  performed_by: z.enum(['OWNER', 'WORKER', 'EXTERNAL_SERVICE']),
  notes: z.string().max(500).optional(),
});

function extractList(res, ...paths) {
  if (!res) return [];
  for (const p of paths) {
    const parts = p.split('.'); let cur = res;
    for (const x of parts) { if (cur == null) break; cur = cur[x]; }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

function Inner() {
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState(null);
  const [wholeFarm, setWholeFarm] = useState(true);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [equipmentType, setEquipmentType] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('');
  const [costFjd, setCostFjd] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'EQUIPMENT_MAINTAINED',
    successMessage: 'Maintenance logged ✓',
    onSuccess: () => setTimeout(() => navigate('/farm'), 800),
  });

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const farmsRes = await apiClient.get('/farms');
        const fl = extractList(farmsRes, 'data.items', 'data', 'farms');
        if (fl.length === 0) throw new Error('No farms found.');
        if (c) return;
        setFarmId(fl[0].farm_id);
        const [puRes, flRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setLoading(false);
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  const visibleFlocks = useMemo(() => puId ? flocks.filter(f => f.current_pu_id === puId) : flocks, [flocks, puId]);
  useEffect(() => { setFlockId(''); }, [puId]);
  useEffect(() => { if (wholeFarm) { setFlockId(''); setPuId(''); } }, [wholeFarm]);
  const ready = !!farmId && (wholeFarm || !!flockId);

  async function submit() {
    setErrs({});
    const costNum = costFjd.trim() === '' ? undefined : parseFloat(costFjd);
    const candidate = {
      equipment_type: equipmentType,
      maintenance_type: maintenanceType,
      cost_fjd: costNum !== undefined && isNaN(costNum) ? undefined : costNum,
      performed_by: performedBy,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      equipment_type: candidate.equipment_type,
      maintenance_type: candidate.maintenance_type,
      performed_by: candidate.performed_by,
    };
    if (candidate.cost_fjd !== undefined) payload.cost_fjd = candidate.cost_fjd;
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log equipment maintenance</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>{loading ? 'Loading...' : (farmId || '—')}</div></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={wholeFarm} onChange={e => setWholeFarm(e.target.checked)} />
              <span>Whole-farm equipment (no specific flock)</span>
            </label>
            {!wholeFarm && (
              <>
                <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (filter)</label>
                  <select value={puId} onChange={e => setPuId(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                    <option value="">— Show all —</option>
                    {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>)}
                  </select></div>
                <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
                  <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: !flockId && farmId ? C.amber : C.border }}>
                    <option value="">Pick a flock…</option>
                    {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
                  </select></div>
              </>
            )}
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Maintenance</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Equipment type *</label>
              <select value={equipmentType} onChange={e => setEquipmentType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.equipment_type ? C.red : C.border }}>
                <option value="">Pick equipment…</option>
                {EQUIPMENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.equipment_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.equipment_type}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Maintenance type *</label>
              <select value={maintenanceType} onChange={e => setMaintenanceType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.maintenance_type ? C.red : C.border }}>
                <option value="">Pick maintenance type…</option>
                {MAINTENANCE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.maintenance_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.maintenance_type}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cost (FJD) — optional</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={costFjd} onChange={e => setCostFjd(e.target.value)} placeholder="25.50"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.cost_fjd ? C.red : C.border }} />
              {errs.cost_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cost_fjd}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Performed by *</label>
              <select value={performedBy} onChange={e => setPerformedBy(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.performed_by ? C.red : C.border }}>
                <option value="">Pick…</option>
                {PERFORMED_BY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.performed_by && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.performed_by}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="What was done?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log maintenance'}
        </button>
      </div>
    </div>
  );
}

export default function EquipmentMaintainedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

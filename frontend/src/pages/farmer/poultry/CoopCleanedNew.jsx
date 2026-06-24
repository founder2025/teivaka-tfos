/**
 * CoopCleanedNew - Phase 6.3-12. Coop cleaning + disinfection logging.
 * flock_id REQUIRED. disinfectant_id (optional) FK to POULTRY_DISINFECTANT library.
 * Biosecurity foundational event.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const CLEANING_METHODS = [
  { value: 'WATER_RINSE',         label: 'Water rinse only' },
  { value: 'DISINFECTANT_SPRAY',  label: 'Disinfectant spray' },
  { value: 'FULL_DEEP_CLEAN',     label: 'Full deep clean' },
  { value: 'DRY_SWEEP',           label: 'Dry sweep' },
];

const CLEANER_ROLES = [
  { value: 'OWNER',     label: 'Owner' },
  { value: 'WORKER',    label: 'Worker' },
  { value: 'FAMILY',    label: 'Family member' },
  { value: 'EXTERNAL',  label: 'External (hired)' },
];

const Schema = z.object({
  cleaning_method: z.enum(['WATER_RINSE', 'DISINFECTANT_SPRAY', 'FULL_DEEP_CLEAN', 'DRY_SWEEP']),
  disinfectant_id: z.string().uuid().optional(),
  area_cleaned_m2: z.number().positive().max(10000).optional(),
  cleaner_role: z.enum(['OWNER', 'WORKER', 'FAMILY', 'EXTERNAL']),
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
  const [searchParams] = useSearchParams();
  const prefillFlockId = searchParams.get('flock_id');
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState(prefillFlockId || '');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [disinfectants, setDisinfectants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [cleaningMethod, setCleaningMethod] = useState('');
  const [disinfectantId, setDisinfectantId] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [cleanerRole, setCleanerRole] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'COOP_CLEANED',
    successMessage: 'Cleaning logged ✓',
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
        const [puRes, flRes, disRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_DISINFECTANT&is_active=true').catch(() => ({ data: [] })),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setDisinfectants(extractList(disRes, 'data.items', 'data'));
        setLoading(false);
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  const visibleFlocks = useMemo(() => puId ? flocks.filter(f => f.current_pu_id === puId) : flocks, [flocks, puId]);
  useEffect(() => { setFlockId(''); }, [puId]);
  const ready = !!farmId && !!flockId;
  const showDisinfectant = cleaningMethod === 'DISINFECTANT_SPRAY' || cleaningMethod === 'FULL_DEEP_CLEAN';

  async function submit() {
    setErrs({});
    const candidate = {
      cleaning_method: cleaningMethod,
      disinfectant_id: disinfectantId || undefined,
      area_cleaned_m2: areaM2 === '' ? undefined : parseFloat(areaM2),
      cleaner_role: cleanerRole,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      cleaning_method: candidate.cleaning_method,
      cleaner_role: candidate.cleaner_role,
    };
    if (candidate.disinfectant_id) payload.disinfectant_id = candidate.disinfectant_id;
    if (candidate.area_cleaned_m2 !== undefined) payload.area_cleaned_m2 = candidate.area_cleaned_m2;
    if (candidate.notes) payload.notes = candidate.notes;
    mutation.mutate({
      anchors: { farm_id: farmId, pu_id: puId || null, cycle_id: null, flock_id: flockId },
      payload,
    });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log coop cleaning</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>{loading ? 'Loading...' : (farmId || '—')}</div></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (filter)</label>
              <select value={puId} onChange={e => setPuId(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                <option value="">— Show all —</option>
                {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || "Block"}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
              <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: !flockId && farmId ? C.amber : C.border }}>
                <option value="">Pick a flock…</option>
                {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
              </select></div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Cleaning</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How cleaned? *</label>
              <select value={cleaningMethod} onChange={e => setCleaningMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.cleaning_method ? C.red : C.border }}>
                <option value="">Pick a method…</option>
                {CLEANING_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.cleaning_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cleaning_method}</div>}
            </div>
            {showDisinfectant && (
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Disinfectant used (optional)</label>
                <select value={disinfectantId} onChange={e => setDisinfectantId(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.disinfectant_id ? C.red : C.border }}>
                  <option value="">— None / not specified —</option>
                  {disinfectants.map(d => <option key={d.library_id} value={d.library_id}>{d.name}</option>)}
                </select>
                {errs.disinfectant_id && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.disinfectant_id}</div>}
              </div>
            )}
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Area cleaned (m²) — optional</label>
              <input type="number" inputMode="decimal" value={areaM2} onChange={e => setAreaM2(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 40"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.area_cleaned_m2 ? C.red : C.border }} />
              {errs.area_cleaned_m2 && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.area_cleaned_m2}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Who cleaned? *</label>
              <select value={cleanerRole} onChange={e => setCleanerRole(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.cleaner_role ? C.red : C.border }}>
                <option value="">Pick a role…</option>
                {CLEANER_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.cleaner_role && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cleaner_role}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="Anything else worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log cleaning'}
        </button>
      </div>
    </div>
  );
}

export default function CoopCleanedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

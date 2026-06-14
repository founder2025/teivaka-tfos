/**
 * HealthObservationNew — Phase 6.3-9. Symptom-based flock health logging.
 * flock_id REQUIRED. No side effect (Future Phase 6.6 triggers compliance alerts from SEVERE).
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { completeLinkedTask } from '../../../utils/taskBridge';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const SEVERITY_OPTIONS = [
  { value: 'MILD',     label: 'Mild — a few birds noticed',                color: 'var(--amber)' },
  { value: 'MODERATE', label: 'Moderate — needs attention',                color: '#D97A1A' },
  { value: 'SEVERE',   label: 'Severe — many sick or dying (blocks sales)', color: 'var(--red)' },
  { value: 'CLEARED',  label: 'Cleared — flock is healthy now',            color: 'var(--green)' },
];

const SYMPTOMS = [
  { value: 'COUGHING',           label: 'Coughing' },
  { value: 'SNEEZING',           label: 'Sneezing' },
  { value: 'DIARRHEA',           label: 'Diarrhea' },
  { value: 'LETHARGY',           label: 'Lethargy / weak' },
  { value: 'REDUCED_APPETITE',   label: 'Eating less' },
  { value: 'REDUCED_PRODUCTION', label: 'Laying fewer eggs' },
  { value: 'SWELLING',           label: 'Swelling' },
  { value: 'NASAL_DISCHARGE',    label: 'Runny nose' },
  { value: 'EYE_DISCHARGE',      label: 'Watery / sticky eyes' },
  { value: 'FEATHER_LOSS',       label: 'Feather loss' },
  { value: 'LIMPING',            label: 'Limping' },
  { value: 'OTHER',              label: 'Other' },
];

const Schema = z.object({
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'CLEARED']),
  symptoms: z.array(z.string()),
  qty_affected: z.number().int().min(1).max(1000000),
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
  const prefillSeverity = searchParams.get('prefill_severity');
  const prefillFlockId = searchParams.get('flock_id');
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState(prefillFlockId || '');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [severity, setSeverity] = useState(
    prefillSeverity && ['MILD', 'MODERATE', 'SEVERE', 'CLEARED'].includes(prefillSeverity) ? prefillSeverity : ''
  );
  const [symptoms, setSymptoms] = useState([]);
  const [qtyAffected, setQtyAffected] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'HEALTH_OBSERVATION',
    successMessage: 'Health logged ✓',
    onSuccess: () => { completeLinkedTask(); setTimeout(() => navigate('/farm'), 800); },
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
  const selectedFlock = useMemo(() => flocks.find(f => f.flock_id === flockId), [flocks, flockId]);
  useEffect(() => { setFlockId(''); }, [puId]);
  const ready = !!farmId && !!flockId;

  function toggleSymptom(value) {
    setSymptoms(prev => prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]);
  }

  async function submit() {
    setErrs({});
    const candidate = {
      severity,
      symptoms,
      qty_affected: qtyAffected === '' ? NaN : parseInt(qtyAffected, 10),
      notes: notes.trim() || undefined,
    };
    if (candidate.severity !== 'CLEARED' && (!candidate.symptoms || candidate.symptoms.length === 0)) {
      setErrs({ symptoms: 'Pick at least one sign' });
      return;
    }
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = { severity: candidate.severity, symptoms: candidate.symptoms, qty_affected: candidate.qty_affected };
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
        <h1 className="text-base font-semibold">Log health</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>{loading ? 'Loading...' : (farmId || '—')}</div></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (filter)</label>
              <select value={puId} onChange={e => setPuId(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>
                <option value="">— Show all —</option>
                {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
              <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: !flockId && farmId ? C.amber : C.border }}>
                <option value="">Pick a flock…</option>
                {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
              </select></div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Symptoms</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How serious? *</label>
              <div className="space-y-2">
                {SEVERITY_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer" style={{ background: severity === opt.value ? '#FFF8F0' : '#fff', borderColor: severity === opt.value ? opt.color : C.border }}>
                    <input type="radio" name="severity" value={opt.value} checked={severity === opt.value} onChange={() => setSeverity(opt.value)} />
                    <span className="text-sm" style={{ color: opt.color, fontWeight: severity === opt.value ? 600 : 400 }}>{opt.label}</span>
                  </label>
                ))}
              </div>
              {errs.severity && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.severity}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>What signs? {severity !== 'CLEARED' && '* (pick one or more)'}</label>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOMS.map(s => (
                  <label key={s.value} className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm" style={{ background: symptoms.includes(s.value) ? '#E8F0E2' : '#fff', borderColor: symptoms.includes(s.value) ? C.green : C.border }}>
                    <input type="checkbox" checked={symptoms.includes(s.value)} onChange={() => toggleSymptom(s.value)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              {errs.symptoms && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.symptoms}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How many birds affected? *</label>
              <input type="number" inputMode="numeric" value={qtyAffected} onChange={e => setQtyAffected(e.target.value)} min={1} placeholder="e.g. 3"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.qty_affected ? C.red : C.border }} />
              {selectedFlock && <div className="text-xs mt-1" style={{ color: C.muted }}>Flock has {selectedFlock.current_count} birds.</div>}
              {errs.qty_affected && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_affected}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} placeholder="When did it start? Any other details?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log health'}
        </button>
      </div>
    </div>
  );
}

export default function HealthObservationNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

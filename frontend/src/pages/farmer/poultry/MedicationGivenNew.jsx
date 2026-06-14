/**
 * MedicationGivenNew — 129 catalog forensic ADD.
 * Medicine/dewormer given to a flock. flock_id REQUIRED.
 * Withholding days (meat/eggs) recorded per administration — the regulator-grade
 * half lives behind "More detail" so the everyday log stays 3 fields.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const ROUTES = [
  { value: 'DRINKING_WATER', label: 'In drinking water' },
  { value: 'FEED', label: 'In feed' },
  { value: 'ORAL', label: 'By mouth' },
  { value: 'INJECTION', label: 'Injection' },
  { value: 'SPRAY', label: 'Spray' },
  { value: 'OTHER', label: 'Other' },
];

const Schema = z.object({
  medication_name: z.string().min(2).max(120),
  route: z.enum(['DRINKING_WATER', 'FEED', 'ORAL', 'INJECTION', 'SPRAY', 'OTHER']),
  given_date: z.string().min(10),
  reason: z.string().max(200).optional(),
  dose: z.string().max(80).optional(),
  withholding_days_meat: z.number().int().min(0).max(365).optional(),
  withholding_days_eggs: z.number().int().min(0).max(365).optional(),
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
const todayISO = () => new Date().toISOString().slice(0, 10);

function Inner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [farmId, setFarmId] = useState(null);
  const [flockId, setFlockId] = useState(searchParams.get('flock_id') || '');
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [name, setName] = useState('');
  const [route, setRoute] = useState('DRINKING_WATER');
  const [givenDate, setGivenDate] = useState(todayISO());
  const [more, setMore] = useState(false);
  const [reason, setReason] = useState('');
  const [dose, setDose] = useState('');
  const [whdMeat, setWhdMeat] = useState('');
  const [whdEggs, setWhdEggs] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'MEDICATION_GIVEN',
    successMessage: 'Medication logged ✓',
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
        const flRes = await apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`);
        if (c) return;
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setLoading(false);
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  const ready = !!farmId && !!flockId;
  const hasWhd = whdMeat !== '' || whdEggs !== '';

  async function submit() {
    setErrs({});
    const candidate = {
      medication_name: name.trim(),
      route,
      given_date: givenDate,
      reason: reason.trim() || undefined,
      dose: dose.trim() || undefined,
      withholding_days_meat: whdMeat === '' ? undefined : parseInt(whdMeat, 10),
      withholding_days_eggs: whdEggs === '' ? undefined : parseInt(whdEggs, 10),
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {};
    for (const [k, v] of Object.entries(candidate)) if (v !== undefined) payload[k] = v;
    mutation.mutate({ anchors: { farm_id: farmId, pu_id: null, cycle_id: null, flock_id: flockId }, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Medication given</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Which birds</div>
          <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: !flockId && farmId ? C.amber : C.border }}>
            <option value="">Pick a flock…</option>
            {flocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
          </select>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Medication</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>What did you give? *</label>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Amprolium, dewormer"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.medication_name ? C.red : C.border }} />
              {errs.medication_name && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.medication_name}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How was it given? *</label>
              <select value={route} onChange={e => setRoute(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: C.border }}>
                {ROUTES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Date *</label>
              <input type="date" value={givenDate} onChange={e => setGivenDate(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: C.border }} />
            </div>
            <button type="button" onClick={() => setMore(m => !m)} className="text-sm font-medium" style={{ color: C.green }}>
              {more ? '− Less detail' : '+ More detail (dose, hold days, notes)'}
            </button>
            {more && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>What it treats</label>
                  <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="e.g. worms, coccidiosis" className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Dose (as on the label)</label>
                  <input value={dose} onChange={e => setDose(e.target.value)} maxLength={80} placeholder="e.g. 5ml per litre, 3 days" className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: C.muted }}>Hold days — meat</label>
                    <input type="number" inputMode="numeric" min={0} max={365} value={whdMeat} onChange={e => setWhdMeat(e.target.value)} placeholder="days" className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: C.muted }}>Hold days — eggs</label>
                    <input type="number" inputMode="numeric" min={0} max={365} value={whdEggs} onChange={e => setWhdEggs(e.target.value)} placeholder="days" className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                </div>
              </div>
            )}
            {hasWhd && (
              <div className="text-xs px-3 py-2 rounded-md" style={{ background: 'rgba(191,144,0,0.08)', color: C.soil, border: `1px solid ${C.amber}` }}>
                Hold days are written into your permanent record — don't sell meat/eggs from this flock until they pass.
              </div>
            )}
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log medication'}
        </button>
      </div>
    </div>
  );
}

export default function MedicationGivenNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

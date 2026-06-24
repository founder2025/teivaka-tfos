/**
 * WaterConsumedNew - Phase 6.3-14. Coop-scoped hydration tracking.
 * flock_id REQUIRED.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const SOURCES = [
  { value: 'TANK',   label: 'Tank' },
  { value: 'TAP',    label: 'Tap / mains' },
  { value: 'WELL',   label: 'Well' },
  { value: 'RAIN',   label: 'Rainwater' },
  { value: 'OTHER',  label: 'Other' },
];

const PERIODS = [
  { value: 'DAILY',    label: 'Daily' },
  { value: 'WEEKLY',   label: 'Weekly' },
  { value: 'MONTHLY',  label: 'Monthly' },
];

const Schema = z.object({
  qty_litres: z.number().positive().max(100000),
  source: z.enum(['TANK', 'TAP', 'WELL', 'RAIN', 'OTHER']),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
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
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [qtyLitres, setQtyLitres] = useState('');
  const [source, setSource] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'WATER_CONSUMED',
    successMessage: 'Water logged ✓',
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
  const ready = !!farmId && !!flockId;

  async function submit() {
    setErrs({});
    const candidate = {
      qty_litres: qtyLitres === '' ? NaN : parseFloat(qtyLitres),
      source,
      period,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      qty_litres: candidate.qty_litres,
      source: candidate.source,
      period: candidate.period,
    };
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
        <h1 className="text-base font-semibold">Log water consumed</h1>
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
                {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
              <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: !flockId && farmId ? C.amber : C.border }}>
                <option value="">Pick a flock…</option>
                {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
              </select></div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Water</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How much? (litres) *</label>
              <input type="number" inputMode="decimal" value={qtyLitres} onChange={e => setQtyLitres(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 75"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.qty_litres ? C.red : C.border }} />
              {errs.qty_litres && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_litres}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Source *</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.source ? C.red : C.border }}>
                <option value="">Pick a source…</option>
                {SOURCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.source && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.source}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Period *</label>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.period ? C.red : C.border }}>
                <option value="">Pick a period…</option>
                {PERIODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.period && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.period}</div>}
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
          {mutation.isPending ? 'Logging…' : 'Log water'}
        </button>
      </div>
    </div>
  );
}

export default function WaterConsumedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

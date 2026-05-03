/**
 * LitterChangedNew - Phase 6.3-11. Litter/bedding replacement logging.
 * flock_id REQUIRED. Biosecurity foundational event.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000', red: '#A32D2D', border: '#E6DED0', muted: '#8A8678' };

const LITTER_TYPES = [
  { value: 'WOOD_SHAVINGS',   label: 'Wood shavings' },
  { value: 'RICE_HUSK',       label: 'Rice husk' },
  { value: 'SAWDUST',         label: 'Sawdust' },
  { value: 'STRAW',           label: 'Straw' },
  { value: 'OTHER',           label: 'Other' },
];

const DISPOSAL_OPTIONS = [
  { value: 'COMPOSTED',         label: 'Composted' },
  { value: 'BURNED',            label: 'Burned' },
  { value: 'BURIED',            label: 'Buried' },
  { value: 'SPREAD_ON_FIELD',   label: 'Spread on field' },
  { value: 'OTHER',             label: 'Other' },
];

const Schema = z.object({
  litter_type: z.enum(['WOOD_SHAVINGS', 'RICE_HUSK', 'SAWDUST', 'STRAW', 'OTHER']),
  qty_kg: z.number().positive().max(10000),
  area_covered_m2: z.number().positive().max(10000).optional(),
  removed_litter_disposal: z.enum(['COMPOSTED', 'BURNED', 'BURIED', 'SPREAD_ON_FIELD', 'OTHER']),
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
  const [litterType, setLitterType] = useState('');
  const [qtyKg, setQtyKg] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [disposal, setDisposal] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'LITTER_CHANGED',
    successMessage: 'Litter change logged ✓',
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
      litter_type: litterType,
      qty_kg: qtyKg === '' ? NaN : parseFloat(qtyKg),
      area_covered_m2: areaM2 === '' ? undefined : parseFloat(areaM2),
      removed_litter_disposal: disposal,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      litter_type: candidate.litter_type,
      qty_kg: candidate.qty_kg,
      removed_litter_disposal: candidate.removed_litter_disposal,
    };
    if (candidate.area_covered_m2 !== undefined) payload.area_covered_m2 = candidate.area_covered_m2;
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
        <h1 className="text-base font-semibold">Log litter change</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Litter</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Litter type *</label>
              <select value={litterType} onChange={e => setLitterType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.litter_type ? C.red : C.border }}>
                <option value="">Pick a type…</option>
                {LITTER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.litter_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.litter_type}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How much? (kg) *</label>
              <input type="number" inputMode="decimal" value={qtyKg} onChange={e => setQtyKg(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 50"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.qty_kg ? C.red : C.border }} />
              {errs.qty_kg && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_kg}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Area covered (m²) — optional</label>
              <input type="number" inputMode="decimal" value={areaM2} onChange={e => setAreaM2(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 40"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.area_covered_m2 ? C.red : C.border }} />
              {errs.area_covered_m2 && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.area_covered_m2}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>What happened to old litter? *</label>
              <select value={disposal} onChange={e => setDisposal(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.removed_litter_disposal ? C.red : C.border }}>
                <option value="">Pick disposal…</option>
                {DISPOSAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.removed_litter_disposal && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.removed_litter_disposal}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} placeholder="Anything else worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log litter change'}
        </button>
      </div>
    </div>
  );
}

export default function LitterChangedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

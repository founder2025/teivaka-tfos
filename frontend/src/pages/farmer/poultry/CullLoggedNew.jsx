/**
 * CullLoggedNew - Phase 6.3-16. Intentional bird removal (culling).
 * flock_id REQUIRED. Distinct from natural MORTALITY_LOGGED.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000', red: '#A32D2D', border: '#E6DED0', muted: '#8A8678' };

const REASONS = [
  { value: 'DISEASE',          label: 'Disease' },
  { value: 'INJURY',           label: 'Injury' },
  { value: 'POOR_PRODUCTION',  label: 'Poor production' },
  { value: 'END_OF_CYCLE',     label: 'End of cycle' },
  { value: 'OVERCROWDING',     label: 'Overcrowding' },
  { value: 'OTHER',            label: 'Other' },
];

const DISPOSAL_METHODS = [
  { value: 'BURIED',     label: 'Buried' },
  { value: 'BURNED',     label: 'Burned' },
  { value: 'COMPOSTED',  label: 'Composted' },
  { value: 'RENDERING',  label: 'Rendering plant' },
  { value: 'OTHER',      label: 'Other' },
];

const CLEARED_BY_OPTIONS = [
  { value: 'OWNER',             label: 'Owner' },
  { value: 'VET',               label: 'Vet' },
  { value: 'EXTENSION_OFFICER', label: 'Extension officer' },
  { value: 'WORKER',            label: 'Worker' },
];

const Schema = z.object({
  qty_culled: z.number().int().positive().max(100000000),
  reason: z.enum(['DISEASE', 'INJURY', 'POOR_PRODUCTION', 'END_OF_CYCLE', 'OVERCROWDING', 'OTHER']),
  disposal_method: z.enum(['BURIED', 'BURNED', 'COMPOSTED', 'RENDERING', 'OTHER']),
  cleared_by: z.enum(['OWNER', 'VET', 'EXTENSION_OFFICER', 'WORKER']),
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
  const [qtyCulled, setQtyCulled] = useState('');
  const [reason, setReason] = useState('');
  const [disposalMethod, setDisposalMethod] = useState('');
  const [clearedBy, setClearedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'CULL_LOGGED',
    successMessage: 'Cull logged ✓',
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
  const selectedFlock = useMemo(() => flocks.find(f => f.flock_id === flockId), [flocks, flockId]);
  useEffect(() => { setFlockId(''); }, [puId]);
  const ready = !!farmId && !!flockId;

  async function submit() {
    setErrs({});
    const candidate = {
      qty_culled: qtyCulled === '' ? NaN : parseInt(qtyCulled, 10),
      reason,
      disposal_method: disposalMethod,
      cleared_by: clearedBy,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      qty_culled: candidate.qty_culled,
      reason: candidate.reason,
      disposal_method: candidate.disposal_method,
      cleared_by: candidate.cleared_by,
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
        <h1 className="text-base font-semibold">Log cull</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Cull</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How many birds culled? *</label>
              <input type="number" inputMode="numeric" value={qtyCulled} onChange={e => setQtyCulled(e.target.value)} min={1} step={1} placeholder="e.g. 3"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.qty_culled ? C.red : C.border }} />
              {selectedFlock && <div className="text-xs mt-1" style={{ color: C.muted }}>Flock has {selectedFlock.current_count} birds.</div>}
              {errs.qty_culled && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_culled}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Reason *</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.reason ? C.red : C.border }}>
                <option value="">Pick a reason…</option>
                {REASONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.reason && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.reason}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Disposal method *</label>
              <select value={disposalMethod} onChange={e => setDisposalMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.disposal_method ? C.red : C.border }}>
                <option value="">Pick a method…</option>
                {DISPOSAL_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.disposal_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.disposal_method}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cleared by *</label>
              <select value={clearedBy} onChange={e => setClearedBy(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.cleared_by ? C.red : C.border }}>
                <option value="">Pick…</option>
                {CLEARED_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.cleared_by && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cleared_by}</div>}
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
          {mutation.isPending ? 'Logging…' : 'Log cull'}
        </button>
      </div>
    </div>
  );
}

export default function CullLoggedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

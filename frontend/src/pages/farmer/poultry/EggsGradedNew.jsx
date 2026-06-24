/**
 * EggsGradedNew - Phase 6.3-20. Grade collected eggs by quality category.
 * flock_id REQUIRED. Subtotals (A + B + cracked + dirty) MUST equal total_qty.
 * Optional unit_price_fjd_grade_a/b feed Bank Evidence pricing.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const Schema = z.object({
  total_qty: z.number().int().positive(),
  grade_a_qty: z.number().int().nonnegative(),
  grade_b_qty: z.number().int().nonnegative(),
  cracked_qty: z.number().int().nonnegative(),
  dirty_qty: z.number().int().nonnegative(),
  unit_price_fjd_grade_a: z.number().positive().optional(),
  unit_price_fjd_grade_b: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
}).refine(
  d => d.grade_a_qty + d.grade_b_qty + d.cracked_qty + d.dirty_qty === d.total_qty,
  { message: 'Subtotals must equal total', path: ['total_qty'] }
);

function extractList(res, ...paths) {
  if (!res) return [];
  for (const p of paths) {
    const parts = p.split('.'); let cur = res;
    for (const x of parts) { if (cur == null) break; cur = cur[x]; }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

function toIntOrZero(v) {
  if (v === '' || v == null) return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function Inner() {
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [totalQty, setTotalQty] = useState('');
  const [gradeAQty, setGradeAQty] = useState('');
  const [gradeBQty, setGradeBQty] = useState('');
  const [crackedQty, setCrackedQty] = useState('');
  const [dirtyQty, setDirtyQty] = useState('');
  const [priceA, setPriceA] = useState('');
  const [priceB, setPriceB] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'EGGS_GRADED',
    successMessage: 'Eggs graded ✓',
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

  const subtotalsLive = toIntOrZero(gradeAQty) + toIntOrZero(gradeBQty) + toIntOrZero(crackedQty) + toIntOrZero(dirtyQty);
  const totalLive = toIntOrZero(totalQty);
  const subtotalsMatch = totalLive > 0 && subtotalsLive === totalLive;

  const ready = !!farmId && !!flockId && subtotalsMatch;

  async function submit() {
    setErrs({});
    const candidate = {
      total_qty: toIntOrZero(totalQty),
      grade_a_qty: toIntOrZero(gradeAQty),
      grade_b_qty: toIntOrZero(gradeBQty),
      cracked_qty: toIntOrZero(crackedQty),
      dirty_qty: toIntOrZero(dirtyQty),
      unit_price_fjd_grade_a: priceA.trim() === '' ? undefined : parseFloat(priceA),
      unit_price_fjd_grade_b: priceB.trim() === '' ? undefined : parseFloat(priceB),
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      total_qty: candidate.total_qty,
      grade_a_qty: candidate.grade_a_qty,
      grade_b_qty: candidate.grade_b_qty,
      cracked_qty: candidate.cracked_qty,
      dirty_qty: candidate.dirty_qty,
    };
    if (candidate.unit_price_fjd_grade_a !== undefined) payload.unit_price_fjd_grade_a = candidate.unit_price_fjd_grade_a;
    if (candidate.unit_price_fjd_grade_b !== undefined) payload.unit_price_fjd_grade_b = candidate.unit_price_fjd_grade_b;
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
        <h1 className="text-base font-semibold">Grade eggs</h1>
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
        <section style={{ opacity: !!flockId ? 1 : 0.4, pointerEvents: !!flockId ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Counts</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Total eggs graded *</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={totalQty} onChange={e => setTotalQty(e.target.value)} placeholder="100"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.total_qty ? C.red : C.border }} />
              {errs.total_qty && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.total_qty}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Grade A *</label>
                <input type="number" inputMode="numeric" min="0" step="1" value={gradeAQty} onChange={e => setGradeAQty(e.target.value)} placeholder="0"
                  className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.grade_a_qty ? C.red : C.border }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Grade B *</label>
                <input type="number" inputMode="numeric" min="0" step="1" value={gradeBQty} onChange={e => setGradeBQty(e.target.value)} placeholder="0"
                  className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.grade_b_qty ? C.red : C.border }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Cracked *</label>
                <input type="number" inputMode="numeric" min="0" step="1" value={crackedQty} onChange={e => setCrackedQty(e.target.value)} placeholder="0"
                  className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.cracked_qty ? C.red : C.border }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Dirty *</label>
                <input type="number" inputMode="numeric" min="0" step="1" value={dirtyQty} onChange={e => setDirtyQty(e.target.value)} placeholder="0"
                  className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.dirty_qty ? C.red : C.border }} />
              </div>
            </div>
            <div className="px-3 py-2 rounded-md border text-sm font-mono" style={{ background: subtotalsMatch ? '#EAF6E2' : '#FDECEA', borderColor: subtotalsMatch ? C.green : C.red, color: subtotalsMatch ? C.green : C.red }}>
              Subtotal {subtotalsLive} / Total {totalLive || '—'} {subtotalsMatch ? '✓' : (totalLive > 0 ? `(off by ${subtotalsLive - totalLive})` : '')}
            </div>
          </div>
        </section>
        <section style={{ opacity: !!flockId ? 1 : 0.4, pointerEvents: !!flockId ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Pricing (optional)</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Price per Grade A egg (FJD)</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={priceA} onChange={e => setPriceA(e.target.value)} placeholder="0.65"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.unit_price_fjd_grade_a ? C.red : C.border }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Price per Grade B egg (FJD)</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={priceB} onChange={e => setPriceB(e.target.value)} placeholder="0.45"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.unit_price_fjd_grade_b ? C.red : C.border }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="Anything worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log graded eggs'}
        </button>
      </div>
    </div>
  );
}

export default function EggsGradedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

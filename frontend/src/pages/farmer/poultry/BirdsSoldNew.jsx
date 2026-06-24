/**
 * BirdsSoldNew — Phase 6.3-8. Birds sold (live/dressed/end-of-lay).
 * flock_id REQUIRED. DECREMENTS current_count same-tx.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const SALE_TYPES = [
  { value: 'LIVE_BIRD',       label: 'Live bird' },
  { value: 'DRESSED',         label: 'Dressed (slaughtered)' },
  { value: 'EGGS_LAYER_END',  label: 'End-of-lay hens' },
];

const Schema = z.object({
  qty_sold: z.number().int().min(1).max(1000000),
  sale_type: z.enum(['LIVE_BIRD', 'DRESSED', 'EGGS_LAYER_END']),
  total_revenue_fjd: z.string().regex(/^\d+(\.\d{1,2})?$/),
  buyer_id: z.string().uuid().optional(),
  price_per_bird_fjd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [qtySold, setQtySold] = useState('');
  const [saleType, setSaleType] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [pricePerBird, setPricePerBird] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [saleDate, setSaleDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'BIRDS_SOLD',
    successMessage: 'Birds sold ✓',
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
        const [puRes, flRes, buyerRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_BUYER&is_active=true'),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setBuyers(extractList(buyerRes, 'data.items', 'data'));
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
      qty_sold: qtySold === '' ? NaN : parseInt(qtySold, 10),
      sale_type: saleType,
      total_revenue_fjd: totalRevenue,
      buyer_id: buyerId === '' ? undefined : buyerId,
      price_per_bird_fjd: pricePerBird === '' ? undefined : pricePerBird,
      sale_date: saleDate,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    if (selectedFlock && candidate.qty_sold > selectedFlock.current_count) {
      setErrs({ qty_sold: `Flock only has ${selectedFlock.current_count} birds.` });
      return;
    }
    const payload = { qty_sold: candidate.qty_sold, sale_type: candidate.sale_type, total_revenue_fjd: candidate.total_revenue_fjd, sale_date: candidate.sale_date };
    if (candidate.buyer_id) payload.buyer_id = candidate.buyer_id;
    if (candidate.price_per_bird_fjd) payload.price_per_bird_fjd = candidate.price_per_bird_fjd;
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
        <h1 className="text-base font-semibold">Sell birds</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Sale</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>How many birds *</label>
              <input type="number" inputMode="numeric" value={qtySold} onChange={e => setQtySold(e.target.value)} min={1} placeholder="e.g. 50"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.qty_sold ? C.red : C.border }} />
              {selectedFlock && <div className="text-xs mt-1" style={{ color: C.muted }}>Flock has {selectedFlock.current_count} birds.</div>}
              {errs.qty_sold && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_sold}</div>}</div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Sale type *</label>
              <select value={saleType} onChange={e => setSaleType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.sale_type ? C.red : C.border }}>
                <option value="">Pick a type…</option>
                {SALE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {errs.sale_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.sale_type}</div>}</div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Total revenue (FJD) *</label>
              <input type="text" inputMode="decimal" value={totalRevenue} onChange={e => setTotalRevenue(e.target.value)} placeholder="e.g. 250.00"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.total_revenue_fjd ? C.red : C.border }} />
              {errs.total_revenue_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.total_revenue_fjd}</div>}</div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Date sold *</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Buyer (optional)</label>
              <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                <option value="">— Not specified —</option>
                {buyers.map(b => <option key={b.library_id} value={b.library_id}>{b.name}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Price per bird (FJD, optional)</label>
              <input type="text" inputMode="decimal" value={pricePerBird} onChange={e => setPricePerBird(e.target.value)} placeholder="e.g. 5.00"
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log sale'}
        </button>
      </div>
    </div>
  );
}

export default function BirdsSoldNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

/**
 * EggsSoldNew — Phase 6.3-7. Eggs sold revenue tracking.
 * flock_id OPTIONAL. No side effect.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const Schema = z.object({
  qty_eggs: z.number().int().min(1).max(1000000),
  total_revenue_fjd: z.string().regex(/^\d+(\.\d{1,2})?$/),
  buyer_id: z.string().uuid().optional(),
  price_fjd_per_dozen: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
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
  const [disposition, setDisposition] = useState('SOLD'); // 129: sold / given away-home use
  const [qtyEggs, setQtyEggs] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [pricePerDozen, setPricePerDozen] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [saleDate, setSaleDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'EGGS_SOLD',
    successMessage: 'Sale logged ✓',
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
  useEffect(() => { setFlockId(''); }, [puId]);
  const ready = !!farmId;

  async function submit() {
    setErrs({});
    const given = disposition === 'GIVEN';
    const candidate = {
      qty_eggs: qtyEggs === '' ? NaN : parseInt(qtyEggs, 10),
      total_revenue_fjd: given ? '0' : totalRevenue,
      buyer_id: buyerId === '' ? undefined : buyerId,
      price_fjd_per_dozen: pricePerDozen === '' ? undefined : pricePerDozen,
      sale_date: saleDate,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = { qty_eggs: candidate.qty_eggs, total_revenue_fjd: candidate.total_revenue_fjd, sale_date: candidate.sale_date, disposition };
    if (candidate.buyer_id) payload.buyer_id = candidate.buyer_id;
    if (candidate.price_fjd_per_dozen) payload.price_fjd_per_dozen = candidate.price_fjd_per_dozen;
    if (candidate.notes) payload.notes = candidate.notes;
    mutation.mutate({
      anchors: { farm_id: farmId, pu_id: puId || null, cycle_id: null, flock_id: flockId || null },
      payload,
    });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Eggs out</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>{loading ? 'Loading...' : (farmId || '—')}</div></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (optional)</label>
              <select value={puId} onChange={e => setPuId(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                <option value="">— Whole farm —</option>
                {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock (optional)</label>
              <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                <option value="">— No specific flock —</option>
                {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
              </select></div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Eggs out</div>
          <div className="space-y-3">
            <div className="flex gap-2">
              {[['SOLD', 'Sold'], ['GIVEN', 'Given away / home use']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setDisposition(v)} className="flex-1 px-3 py-2.5 rounded-md border text-sm font-medium"
                  style={{ background: disposition === v ? C.green : '#fff', color: disposition === v ? '#fff' : C.soil, borderColor: disposition === v ? C.green : C.border }}>{l}</button>
              ))}
            </div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>How many eggs *</label>
              <input type="number" inputMode="numeric" value={qtyEggs} onChange={e => setQtyEggs(e.target.value)} min={1} placeholder="e.g. 120"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.qty_eggs ? C.red : C.border }} />
              {errs.qty_eggs && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_eggs}</div>}</div>
            {disposition === 'SOLD' && (
              <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Total revenue (FJD) *</label>
                <input type="text" inputMode="decimal" value={totalRevenue} onChange={e => setTotalRevenue(e.target.value)} placeholder="e.g. 30.00"
                  className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.total_revenue_fjd ? C.red : C.border }} />
                {errs.total_revenue_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.total_revenue_fjd}</div>}</div>
            )}
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Date sold *</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
            {disposition === 'SOLD' && (<>
              <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Buyer (optional)</label>
                <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                  <option value="">— Not specified —</option>
                  {buyers.map(b => <option key={b.library_id} value={b.library_id}>{b.name}</option>)}
                </select></div>
              <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Price per dozen (FJD, optional)</label>
                <input type="text" inputMode="decimal" value={pricePerDozen} onChange={e => setPricePerDozen(e.target.value)} placeholder="e.g. 3.00"
                  className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
            </>)}
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} /></div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : disposition === 'GIVEN' ? 'Log eggs given' : 'Log sale'}
        </button>
      </div>
    </div>
  );
}

export default function EggsSoldNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

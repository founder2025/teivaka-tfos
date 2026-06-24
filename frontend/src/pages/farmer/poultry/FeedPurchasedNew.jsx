/**
 * FeedPurchasedNew - Phase 6.3-13. Feed purchase economics + Bank Evidence input.
 * flock_id OPTIONAL (farm-wide purchase pattern per Section 4a.4).
 * feed_id REQUIRED FK to POULTRY_FEED. supplier_id OPTIONAL FK to POULTRY_SUPPLIER.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const PAYMENT_METHODS = [
  { value: 'CASH',     label: 'Cash' },
  { value: 'MPAISA',   label: 'M-PAiSA' },
  { value: 'CHEQUE',   label: 'Cheque' },
  { value: 'CREDIT',   label: 'Credit (pay later)' },
  { value: 'OTHER',    label: 'Other' },
];

const Schema = z.object({
  feed_id: z.string().uuid(),
  qty_kg: z.number().positive().max(100000),
  cost_fjd: z.number().positive().max(1000000),
  supplier_id: z.string().uuid().optional(),
  payment_method: z.enum(['CASH', 'MPAISA', 'CHEQUE', 'CREDIT', 'OTHER']),
  invoice_ref: z.string().max(60).optional(),
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
  const [wholeFarm, setWholeFarm] = useState(!prefillFlockId);
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [feedId, setFeedId] = useState('');
  const [qtyKg, setQtyKg] = useState('');
  const [costFjd, setCostFjd] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'FEED_PURCHASED',
    successMessage: 'Feed purchase logged ✓',
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
        const [puRes, flRes, feedRes, suppRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_FEED&is_active=true').catch(() => ({ data: [] })),
          apiClient.get('/farm-libraries?library_type=POULTRY_SUPPLIER&is_active=true').catch(() => ({ data: [] })),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setFeeds(extractList(feedRes, 'data.items', 'data'));
        setSuppliers(extractList(suppRes, 'data.items', 'data'));
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
    const candidate = {
      feed_id: feedId,
      qty_kg: qtyKg === '' ? NaN : parseFloat(qtyKg),
      cost_fjd: costFjd === '' ? NaN : parseFloat(costFjd),
      supplier_id: supplierId || undefined,
      payment_method: paymentMethod,
      invoice_ref: invoiceRef.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      feed_id: candidate.feed_id,
      qty_kg: candidate.qty_kg,
      cost_fjd: candidate.cost_fjd,
      payment_method: candidate.payment_method,
    };
    if (candidate.supplier_id) payload.supplier_id = candidate.supplier_id;
    if (candidate.invoice_ref) payload.invoice_ref = candidate.invoice_ref;
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log feed purchase</h1>
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
              <span>Whole-farm purchase (no specific flock)</span>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Purchase</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Feed type *</label>
              <select value={feedId} onChange={e => setFeedId(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.feed_id ? C.red : C.border }}>
                <option value="">Pick a feed…</option>
                {feeds.map(f => <option key={f.library_id} value={f.library_id}>{f.name}</option>)}
              </select>
              {errs.feed_id && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.feed_id}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Quantity (kg) *</label>
              <input type="number" inputMode="decimal" value={qtyKg} onChange={e => setQtyKg(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 250"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.qty_kg ? C.red : C.border }} />
              {errs.qty_kg && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_kg}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cost (FJD) *</label>
              <input type="number" inputMode="decimal" value={costFjd} onChange={e => setCostFjd(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 487.50"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: "var(--paper)", borderColor: errs.cost_fjd ? C.red : C.border }} />
              {errs.cost_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cost_fjd}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Supplier (optional)</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.supplier_id ? C.red : C.border }}>
                <option value="">— Not specified —</option>
                {suppliers.map(s => <option key={s.library_id} value={s.library_id}>{s.name}</option>)}
              </select>
              {errs.supplier_id && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.supplier_id}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Payment method *</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.payment_method ? C.red : C.border }}>
                <option value="">Pick a method…</option>
                {PAYMENT_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.payment_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.payment_method}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Invoice / receipt ref (optional)</label>
              <input type="text" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} maxLength={60} placeholder="e.g. INV-2026-0042"
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: errs.invoice_ref ? C.red : C.border }} />
              {errs.invoice_ref && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.invoice_ref}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="Anything else worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log purchase'}
        </button>
      </div>
    </div>
  );
}

export default function FeedPurchasedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

/**
 * FeedReceivedNew — Phase 6.3-4 fifth farmer-usable POULTRY feature.
 *
 * POST /api/v1/events with event_type=FEED_RECEIVED.
 * flock_id + pu_id OPTIONAL. feed_type_id REQUIRED. supplier_id OPTIONAL.
 * No side effect on flock count. No automatic cash_ledger entry.
 *
 * Per-page QueryClientProvider wrap (Strike #26).
 * extractList() defensive helper (Strike #27).
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const C = {
  soil:   'var(--soil)',
  cream:  'var(--cream)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  red:    'var(--red)',
  border: '#E6DED0',
  muted:  'var(--muted)',
};

const FeedSchema = z.object({
  feed_type_id: z.string().uuid(),
  qty_kg: z.string().regex(/^\d+(\.\d{1,3})?$/).refine((v) => parseFloat(v) > 0, 'Must be > 0'),
  supplier_id: z.string().uuid().optional(),
  cost_fjd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  batch_number: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

function extractList(res, ...keyPaths) {
  if (!res) return [];
  for (const path of keyPaths) {
    const parts = path.split('.');
    let cur = res;
    for (const p of parts) {
      if (cur == null) break;
      cur = cur[p];
    }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function FeedReceivedNewInner() {
  const navigate = useNavigate();

  // Anchors (all optional except farm)
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');

  // Lookups
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [feedTypes, setFeedTypes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  // Payload
  const [feedTypeId, setFeedTypeId] = useState('');
  const [qtyKg, setQtyKg] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [costFjd, setCostFjd] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useEventMutation({
    eventType: 'FEED_RECEIVED',
    successMessage: 'Feed delivery logged ✓',
    onSuccess: () => setTimeout(() => navigate('/farm'), 800),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const farmsRes = await apiClient.get('/farms');
        const farmsList = extractList(farmsRes, 'data.items', 'data', 'farms');
        if (farmsList.length === 0) throw new Error('No farms found.');
        const firstFarm = farmsList[0];
        if (cancelled) return;
        setFarmId(firstFarm.farm_id);

        const [pusRes, flocksRes, feedRes, supplierRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${firstFarm.farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_FEED&is_active=true'),
          apiClient.get('/farm-libraries?library_type=POULTRY_SUPPLIER&is_active=true'),
        ]);
        if (cancelled) return;

        const pusList = extractList(pusRes, 'data.items', 'data');
        setPus(pusList.filter((pu) => pu.farm_id === firstFarm.farm_id));
        setFlocks(extractList(flocksRes, 'data.items', 'data'));
        setFeedTypes(extractList(feedRes, 'data.items', 'data'));
        setSuppliers(extractList(supplierRes, 'data.items', 'data'));
        setLoadingAnchors(false);
      } catch (e) {
        if (!cancelled) {
          setAnchorError(e.message || 'Could not load farm data');
          setLoadingAnchors(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleFlocks = useMemo(() => {
    if (!puId) return flocks;
    return flocks.filter((f) => f.current_pu_id === puId);
  }, [flocks, puId]);

  useEffect(() => {
    setFlockId('');
  }, [puId]);

  const anchorsReady = !!farmId;

  async function handleSubmit() {
    setFieldErrors({});
    const candidate = {
      feed_type_id: feedTypeId,
      qty_kg: qtyKg,
      supplier_id: supplierId === '' ? undefined : supplierId,
      cost_fjd: costFjd === '' ? undefined : costFjd,
      delivery_date: deliveryDate,
      batch_number: batchNumber.trim() === '' ? undefined : batchNumber.trim(),
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };

    const parsed = FeedSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    const anchors = {
      farm_id: farmId,
      pu_id: puId || null,
      cycle_id: null,
      flock_id: flockId || null,
    };
    const payload = {
      feed_type_id: candidate.feed_type_id,
      qty_kg: candidate.qty_kg,
      delivery_date: candidate.delivery_date,
    };
    if (candidate.supplier_id) payload.supplier_id = candidate.supplier_id;
    if (candidate.cost_fjd) payload.cost_fjd = candidate.cost_fjd;
    if (candidate.batch_number) payload.batch_number = candidate.batch_number;
    if (candidate.notes) payload.notes = candidate.notes;

    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>
          ← Cancel
        </button>
        <h1 className="text-base font-semibold">Feed delivery</h1>
        <div className="w-12" />
      </div>

      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        {/* Anchors */}
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>
                {loadingAnchors ? 'Loading...' : (farmId || '—')}
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (optional)</label>
              <select value={puId} onChange={(e) => setPuId(e.target.value)} disabled={loadingAnchors}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}>
                <option value="">— Whole farm —</option>
                {pus.map((pu) => (
                  <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || pu.pu_id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Flock (optional)</label>
              <select value={flockId} onChange={(e) => setFlockId(e.target.value)} disabled={loadingAnchors}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}>
                <option value="">— No specific flock —</option>
                {visibleFlocks.map((f) => (
                  <option key={f.flock_id} value={f.flock_id}>
                    {f.flock_label} ({f.current_count} birds)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Payload */}
        <section style={{ opacity: anchorsReady ? 1 : 0.4, pointerEvents: anchorsReady ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>What feed</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Feed type *</label>
              <select value={feedTypeId} onChange={(e) => setFeedTypeId(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: fieldErrors.feed_type_id ? C.red : C.border }}>
                <option value="">Pick a feed type…</option>
                {feedTypes.map((f) => (
                  <option key={f.library_id} value={f.library_id}>{f.name}</option>
                ))}
              </select>
              {feedTypes.length === 0 && !loadingAnchors && (
                <div className="text-xs mt-1" style={{ color: C.amber }}>No feed types. Add one in Settings → Library.</div>
              )}
              {fieldErrors.feed_type_id && <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.feed_type_id}</div>}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Quantity (kg) *</label>
              <input type="text" inputMode="decimal" value={qtyKg} onChange={(e) => setQtyKg(e.target.value)}
                placeholder="e.g. 50.5"
                className="w-full px-3 py-3 rounded-md border text-lg"
                style={{ background: '#fff', borderColor: fieldErrors.qty_kg ? C.red : C.border }} />
              {fieldErrors.qty_kg && <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.qty_kg}</div>}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Date received *</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: fieldErrors.delivery_date ? C.red : C.border }} />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Supplier (optional)</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}>
                <option value="">— Not specified —</option>
                {suppliers.map((s) => (
                  <option key={s.library_id} value={s.library_id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cost (FJD, optional)</label>
              <input type="text" inputMode="decimal" value={costFjd} onChange={(e) => setCostFjd(e.target.value)}
                placeholder="e.g. 125.75"
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: fieldErrors.cost_fjd ? C.red : C.border }} />
              {fieldErrors.cost_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.cost_fjd}</div>}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Batch number (optional)</label>
              <input type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} maxLength={100}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }} />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }} />
            </div>
          </div>
        </section>

        {anchorError && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>
            {anchorError}
          </div>
        )}
        {mutation.isError && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>
            {mutation.error?.message || 'Submit failed.'}
          </div>
        )}

        <button onClick={handleSubmit}
          disabled={!anchorsReady || mutation.isPending || loadingAnchors || feedTypes.length === 0}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{
            background: (!anchorsReady || mutation.isPending || feedTypes.length === 0) ? '#A8C997' : C.green,
            color: '#fff',
            opacity: (!anchorsReady || mutation.isPending || feedTypes.length === 0) ? 0.7 : 1,
          }}>
          {mutation.isPending ? 'Logging…' : 'Log feed delivery'}
        </button>
      </div>
    </div>
  );
}

export default function FeedReceivedNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeedReceivedNewInner />
    </QueryClientProvider>
  );
}

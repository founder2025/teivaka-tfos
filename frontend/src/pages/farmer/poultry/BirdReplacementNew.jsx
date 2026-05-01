/**
 * BirdReplacementNew — Phase 6.3-6. Adds birds to existing flock.
 * flock_id REQUIRED. INCREMENTS flock.current_count same-tx (mirror MORTALITY).
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000', red: '#A32D2D', border: '#E6DED0', muted: '#8A8678' };

const REASONS = [
  { value: 'REPLACEMENT', label: 'Replacement (after deaths)' },
  { value: 'EXPANSION',   label: 'Expansion (growing flock)' },
  { value: 'RECOVERY',    label: 'Recovery (returned escapees)' },
];

const Schema = z.object({
  qty_added: z.number().int().min(1).max(1000000),
  reason: z.enum(['REPLACEMENT', 'EXPANSION', 'RECOVERY']),
  cost_fjd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  supplier_id: z.string().uuid().optional(),
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
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [qtyAdded, setQtyAdded] = useState('');
  const [reason, setReason] = useState('');
  const [costFjd, setCostFjd] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'BIRD_REPLACEMENT',
    successMessage: 'Birds added ✓',
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
        const [puRes, flRes, supRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_SUPPLIER&is_active=true'),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setSuppliers(extractList(supRes, 'data.items', 'data'));
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
      qty_added: qtyAdded === '' ? NaN : parseInt(qtyAdded, 10),
      reason,
      cost_fjd: costFjd === '' ? undefined : costFjd,
      supplier_id: supplierId === '' ? undefined : supplierId,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = { qty_added: candidate.qty_added, reason: candidate.reason };
    if (candidate.cost_fjd) payload.cost_fjd = candidate.cost_fjd;
    if (candidate.supplier_id) payload.supplier_id = candidate.supplier_id;
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
        <h1 className="text-base font-semibold">Add birds</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Adding</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>How many birds *</label>
              <input type="number" inputMode="numeric" value={qtyAdded} onChange={e => setQtyAdded(e.target.value)} min={1} placeholder="e.g. 5"
                className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.qty_added ? C.red : C.border }} />
              {selectedFlock && <div className="text-xs mt-1" style={{ color: C.muted }}>Flock currently has {selectedFlock.current_count} birds. After: {selectedFlock.current_count + (parseInt(qtyAdded || '0', 10) || 0)}.</div>}
              {errs.qty_added && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_added}</div>}</div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Reason *</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.reason ? C.red : C.border }}>
                <option value="">Pick a reason…</option>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {errs.reason && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.reason}</div>}</div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Cost (FJD, optional)</label>
              <input type="text" inputMode="decimal" value={costFjd} onChange={e => setCostFjd(e.target.value)} placeholder="e.g. 25.00"
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Supplier (optional)</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>
                <option value="">— Not specified —</option>
                {suppliers.map(s => <option key={s.library_id} value={s.library_id}>{s.name}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} /></div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Adding…' : 'Add birds'}
        </button>
      </div>
    </div>
  );
}

export default function BirdReplacementNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

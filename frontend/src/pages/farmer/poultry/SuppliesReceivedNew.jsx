/**
 * SuppliesReceivedNew - Phase 6.3-24. Supply-chain receipt logging.
 * flock_id OPTIONAL (whole-farm via toggle). Bank Evidence cashflow input.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const SUPPLY_TYPES = [
  { value: 'BEDDING',        label: 'Bedding' },
  { value: 'EQUIPMENT',      label: 'Equipment' },
  { value: 'MEDICAL',        label: 'Medical' },
  { value: 'CLEANING',       label: 'Cleaning' },
  { value: 'FEED_ADDITIVES', label: 'Feed additives' },
  { value: 'PACKAGING',      label: 'Packaging' },
  { value: 'OTHER',          label: 'Other' },
];

const UNITS = [
  { value: 'KG',    label: 'kg' },
  { value: 'L',     label: 'L' },
  { value: 'UNITS', label: 'Units' },
  { value: 'BAGS',  label: 'Bags' },
  { value: 'BOXES', label: 'Boxes' },
];

const Schema = z.object({
  supply_type: z.enum(['BEDDING', 'EQUIPMENT', 'MEDICAL', 'CLEANING', 'FEED_ADDITIVES', 'PACKAGING', 'OTHER']),
  qty_received: z.number().positive(),
  unit: z.enum(['KG', 'L', 'UNITS', 'BAGS', 'BOXES']),
  cost_fjd: z.number().nonnegative().optional(),
  supplier_name: z.string().max(100).optional(),
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
  const [wholeFarm, setWholeFarm] = useState(true);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [supplyType, setSupplyType] = useState('');
  const [qtyReceived, setQtyReceived] = useState('');
  const [unit, setUnit] = useState('');
  const [costFjd, setCostFjd] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'SUPPLIES_RECEIVED',
    successMessage: 'Supplies logged ✓',
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
  useEffect(() => { if (wholeFarm) { setFlockId(''); setPuId(''); } }, [wholeFarm]);
  const ready = !!farmId && (wholeFarm || !!flockId);

  async function submit() {
    setErrs({});
    const qtyNum = parseFloat(qtyReceived);
    const costNum = costFjd.trim() === '' ? undefined : parseFloat(costFjd);
    const candidate = {
      supply_type: supplyType,
      qty_received: isNaN(qtyNum) ? undefined : qtyNum,
      unit,
      cost_fjd: costNum !== undefined && isNaN(costNum) ? undefined : costNum,
      supplier_name: supplierName.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      supply_type: candidate.supply_type,
      qty_received: candidate.qty_received,
      unit: candidate.unit,
    };
    if (candidate.cost_fjd !== undefined) payload.cost_fjd = candidate.cost_fjd;
    if (candidate.supplier_name) payload.supplier_name = candidate.supplier_name;
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log supplies received</h1>
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
                    {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || "Block"}</option>)}
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Supply</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Supply type *</label>
              <select value={supplyType} onChange={e => setSupplyType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.supply_type ? C.red : C.border }}>
                <option value="">Pick a type…</option>
                {SUPPLY_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.supply_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.supply_type}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Quantity *</label>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={qtyReceived} onChange={e => setQtyReceived(e.target.value)} placeholder="50.000"
                  className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.qty_received ? C.red : C.border }} />
                {errs.qty_received && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_received}</div>}
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Unit *</label>
                <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.unit ? C.red : C.border }}>
                  <option value="">…</option>
                  {UNITS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {errs.unit && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.unit}</div>}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cost (FJD) — optional</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={costFjd} onChange={e => setCostFjd(e.target.value)} placeholder="85.00"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.cost_fjd ? C.red : C.border }} />
              {errs.cost_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.cost_fjd}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Supplier name (optional)</label>
              <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} maxLength={100} placeholder="e.g. Suva Agro Supplies"
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: errs.supplier_name ? C.red : C.border }} />
              {errs.supplier_name && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.supplier_name}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="Anything worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log supplies'}
        </button>
      </div>
    </div>
  );
}

export default function SuppliesReceivedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

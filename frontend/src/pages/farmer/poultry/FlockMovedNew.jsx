/**
 * FlockMovedNew - Phase 6.3-21. Flock movement between coops/locations.
 * flock_id REQUIRED. Captures from/to + qty + reason + method.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const REASONS = [
  { value: 'SPACE',       label: 'Space (overcrowding)' },
  { value: 'SEPARATION',  label: 'Separation (group split)' },
  { value: 'AGE_BAND',    label: 'Age band' },
  { value: 'QUARANTINE',  label: 'Quarantine (suspected disease)' },
  { value: 'MAINTENANCE', label: 'Coop maintenance' },
  { value: 'OTHER',       label: 'Other' },
];

const MOVE_METHODS = [
  { value: 'CARRIED', label: 'Carried by hand' },
  { value: 'HERDED',  label: 'Herded on foot' },
  { value: 'CRATED',  label: 'Crated/transported' },
];

const Schema = z.object({
  from_location: z.string().min(1).max(100),
  to_location: z.string().min(1).max(100),
  qty_moved: z.number().int().positive(),
  reason: z.enum(['SPACE', 'SEPARATION', 'AGE_BAND', 'QUARANTINE', 'MAINTENANCE', 'OTHER']),
  move_method: z.enum(['CARRIED', 'HERDED', 'CRATED']),
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
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [qtyMoved, setQtyMoved] = useState('');
  const [reason, setReason] = useState('');
  const [moveMethod, setMoveMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'FLOCK_MOVED',
    successMessage: 'Flock movement logged ✓',
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
    const qtyNum = parseInt(qtyMoved, 10);
    const candidate = {
      from_location: fromLocation.trim(),
      to_location: toLocation.trim(),
      qty_moved: isNaN(qtyNum) ? undefined : qtyNum,
      reason,
      move_method: moveMethod,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      from_location: candidate.from_location,
      to_location: candidate.to_location,
      qty_moved: candidate.qty_moved,
      reason: candidate.reason,
      move_method: candidate.move_method,
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
        <h1 className="text-base font-semibold">Move flock</h1>
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
                {pus.map(pu => <option key={pu.pu_id} value={pu.pu_id}>{pu.farmer_label || pu.pu_name || "Block"}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
              <select value={flockId} onChange={e => setFlockId(e.target.value)} disabled={loading} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: !flockId && farmId ? C.amber : C.border }}>
                <option value="">Pick a flock…</option>
                {visibleFlocks.map(f => <option key={f.flock_id} value={f.flock_id}>{f.flock_label} ({f.current_count} birds)</option>)}
              </select></div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Movement</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>From location *</label>
              <input type="text" value={fromLocation} onChange={e => setFromLocation(e.target.value)} maxLength={100} placeholder="e.g. Coop A"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.from_location ? C.red : C.border }} />
              {errs.from_location && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.from_location}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>To location *</label>
              <input type="text" value={toLocation} onChange={e => setToLocation(e.target.value)} maxLength={100} placeholder="e.g. Coop B (quarantine)"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.to_location ? C.red : C.border }} />
              {errs.to_location && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.to_location}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Birds moved *</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={qtyMoved} onChange={e => setQtyMoved(e.target.value)} placeholder="12"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.qty_moved ? C.red : C.border }} />
              {errs.qty_moved && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_moved}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Reason *</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.reason ? C.red : C.border }}>
                <option value="">Pick a reason…</option>
                {REASONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.reason && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.reason}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Move method *</label>
              <select value={moveMethod} onChange={e => setMoveMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.move_method ? C.red : C.border }}>
                <option value="">Pick a method…</option>
                {MOVE_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.move_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.move_method}</div>}
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
          {mutation.isPending ? 'Logging…' : 'Log movement'}
        </button>
      </div>
    </div>
  );
}

export default function FlockMovedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

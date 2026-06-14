/**
 * MortalityLoggedNew — Phase 6.3-2b third farmer-usable POULTRY feature.
 *
 * POST /api/v1/events with event_type=MORTALITY_LOGGED. Backend decrements
 * tenant.flocks.current_count by qty_dead in same transaction.
 *
 * flock_id is REQUIRED (unlike EGGS_COLLECTED).
 * cause must be one of DISEASE, PREDATION, INJURY, UNKNOWN, OLD_AGE, OTHER.
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

const CAUSES = [
  { value: 'DISEASE',   label: 'Disease / sickness' },
  { value: 'PREDATION', label: 'Predator attack' },
  { value: 'INJURY',    label: 'Injury / accident' },
  { value: 'OLD_AGE',   label: 'Old age' },
  { value: 'UNKNOWN',   label: 'Unknown' },
  { value: 'OTHER',     label: 'Other' },
];

const MortalitySchema = z.object({
  qty_dead: z.number().int().min(1).max(1000000),
  cause: z.enum(['DISEASE', 'PREDATION', 'INJURY', 'UNKNOWN', 'OLD_AGE', 'OTHER']),
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

function MortalityLoggedNewInner() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');

  // Lookups
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  // Payload
  const [qtyDead, setQtyDead] = useState('');
  const [cause, setCause] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // 129 catalog forensic: MORTALITY_INVESTIGATED left the (+) grid — the natural
  // follow-up path is straight from logging the death. Ask, then route.
  const mutation = useEventMutation({
    eventType: 'MORTALITY_LOGGED',
    successMessage: 'Mortality logged ✓',
    onSuccess: () => setTimeout(() => {
      const investigate = window.confirm('Logged. Do you want to record an investigation of this death now? (cause, findings, actions)');
      navigate(investigate ? '/farm/poultry/mortality/investigated' : '/farm');
    }, 400),
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

        const [pusRes, flocksRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${firstFarm.farm_id}&is_active=true`),
        ]);
        if (cancelled) return;

        const pusList = extractList(pusRes, 'data.items', 'data');
        const onFarmPus = pusList.filter((pu) => pu.farm_id === firstFarm.farm_id);
        const flocksList = extractList(flocksRes, 'data.items', 'data');

        setPus(onFarmPus);
        setFlocks(flocksList);
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

  const selectedFlock = useMemo(() => flocks.find((f) => f.flock_id === flockId), [flocks, flockId]);

  useEffect(() => {
    setFlockId('');
  }, [puId]);

  // Anchors ready: needs farm + flock (unlike EggsNew, mortality REQUIRES flock)
  const anchorsReady = !!farmId && !!flockId;

  async function handleSubmit() {
    setFieldErrors({});
    const candidate = {
      qty_dead: qtyDead === '' ? NaN : parseInt(qtyDead, 10),
      cause,
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };

    const parsed = MortalitySchema.safeParse(candidate);
    if (!parsed.success) {
      const errs = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    // Soft warning if qty_dead exceeds current_count (server will hard-block)
    if (selectedFlock && candidate.qty_dead > selectedFlock.current_count) {
      setFieldErrors({ qty_dead: `Flock only has ${selectedFlock.current_count} birds.` });
      return;
    }

    const anchors = {
      farm_id: farmId,
      pu_id: puId || null,
      cycle_id: null,
      flock_id: flockId,
    };
    const payload = { qty_dead: candidate.qty_dead, cause: candidate.cause };
    if (candidate.notes) payload.notes = candidate.notes;

    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>
          ← Cancel
        </button>
        <h1 className="text-base font-semibold">Log mortality</h1>
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
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (optional filter)</label>
              <select
                value={puId}
                onChange={(e) => setPuId(e.target.value)}
                disabled={loadingAnchors}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}
              >
                <option value="">— Show all flocks —</option>
                {pus.map((pu) => (
                  <option key={pu.pu_id} value={pu.pu_id}>
                    {pu.farmer_label || pu.pu_name || pu.pu_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Flock *</label>
              <select
                value={flockId}
                onChange={(e) => setFlockId(e.target.value)}
                disabled={loadingAnchors}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: !flockId && farmId ? C.amber : C.border }}
              >
                <option value="">Pick a flock…</option>
                {visibleFlocks.map((f) => (
                  <option key={f.flock_id} value={f.flock_id}>
                    {f.flock_label} ({f.current_count} birds)
                  </option>
                ))}
              </select>
              {flocks.length === 0 && !loadingAnchors && (
                <div className="text-xs mt-1" style={{ color: C.amber }}>
                  No active flocks. Add one with 'Flock placed' first.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Payload */}
        <section style={{ opacity: anchorsReady ? 1 : 0.4, pointerEvents: anchorsReady ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>How many died</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Number dead *</label>
              <input
                type="number"
                inputMode="numeric"
                value={qtyDead}
                onChange={(e) => setQtyDead(e.target.value)}
                min={1}
                max={selectedFlock?.current_count || 1000000}
                placeholder="e.g. 3"
                className="w-full px-3 py-3 rounded-md border text-lg"
                style={{ background: '#fff', borderColor: fieldErrors.qty_dead ? C.red : C.border }}
              />
              {selectedFlock && (
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  Flock has {selectedFlock.current_count} birds.
                </div>
              )}
              {fieldErrors.qty_dead && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.qty_dead}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Cause *</label>
              <select
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: fieldErrors.cause ? C.red : C.border }}
              >
                <option value="">Pick a cause…</option>
                {CAUSES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {fieldErrors.cause && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.cause}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}
              />
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

        <button
          onClick={handleSubmit}
          disabled={!anchorsReady || mutation.isPending || loadingAnchors || flocks.length === 0}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{
            background: (!anchorsReady || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green,
            color: '#fff',
            opacity: (!anchorsReady || mutation.isPending || flocks.length === 0) ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? 'Logging…' : 'Log mortality'}
        </button>
      </div>
    </div>
  );
}

export default function MortalityLoggedNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <MortalityLoggedNewInner />
    </QueryClientProvider>
  );
}

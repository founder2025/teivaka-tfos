/**
 * VaccinationGivenNew — Phase 6.3-3 fourth farmer-usable POULTRY feature.
 *
 * POST /api/v1/events with event_type=VACCINATION_GIVEN.
 * flock_id REQUIRED. vaccine_id REQUIRED (from POULTRY_VACCINE library).
 * No side effect on flock count.
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
  soil:   '#5C4033',
  cream:  '#F8F3E9',
  green:  '#6AA84F',
  amber:  '#BF9000',
  red:    '#A32D2D',
  border: '#E6DED0',
  muted:  '#8A8678',
};

const ROUTES = [
  { value: 'DRINKING_WATER', label: 'In drinking water' },
  { value: 'INJECTION',      label: 'Injection' },
  { value: 'EYE_DROP',       label: 'Eye drop' },
  { value: 'SPRAY',          label: 'Spray' },
  { value: 'OTHER',          label: 'Other' },
];

const VaccinationSchema = z.object({
  vaccine_id: z.string().uuid(),
  qty_doses: z.number().int().min(1).max(1000000).optional(),
  route: z.enum(['DRINKING_WATER', 'INJECTION', 'EYE_DROP', 'SPRAY', 'OTHER']),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

function VaccinationGivenNewInner() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState('');

  // Lookups
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [vaccines, setVaccines] = useState([]);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  // Payload
  const [vaccineId, setVaccineId] = useState('');
  const [qtyDoses, setQtyDoses] = useState('');
  const [route, setRoute] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useEventMutation({
    eventType: 'VACCINATION_GIVEN',
    successMessage: 'Vaccination logged ✓',
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

        const [pusRes, flocksRes, vaccinesRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${firstFarm.farm_id}&is_active=true`),
          apiClient.get('/farm-libraries?library_type=POULTRY_VACCINE&is_active=true'),
        ]);
        if (cancelled) return;

        const pusList = extractList(pusRes, 'data.items', 'data');
        const onFarmPus = pusList.filter((pu) => pu.farm_id === firstFarm.farm_id);
        const flocksList = extractList(flocksRes, 'data.items', 'data');
        const vaccinesList = extractList(vaccinesRes, 'data.items', 'data');

        setPus(onFarmPus);
        setFlocks(flocksList);
        setVaccines(vaccinesList);
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

  // Auto-fill qty_doses with flock current_count when flock changes (if not already set)
  useEffect(() => {
    if (selectedFlock && qtyDoses === '') {
      setQtyDoses(String(selectedFlock.current_count));
    }
  }, [selectedFlock]);

  const anchorsReady = !!farmId && !!flockId;

  async function handleSubmit() {
    setFieldErrors({});
    const candidate = {
      vaccine_id: vaccineId,
      qty_doses: qtyDoses === '' ? undefined : parseInt(qtyDoses, 10),
      route,
      next_due_date: nextDueDate === '' ? undefined : nextDueDate,
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };

    const parsed = VaccinationSchema.safeParse(candidate);
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
      flock_id: flockId,
    };
    const payload = {
      vaccine_id: candidate.vaccine_id,
      route: candidate.route,
    };
    if (candidate.qty_doses !== undefined) payload.qty_doses = candidate.qty_doses;
    if (candidate.next_due_date) payload.next_due_date = candidate.next_due_date;
    if (candidate.notes) payload.notes = candidate.notes;

    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>
          ← Cancel
        </button>
        <h1 className="text-base font-semibold">Log vaccination</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>What vaccine</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Vaccine *</label>
              <select
                value={vaccineId}
                onChange={(e) => setVaccineId(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: fieldErrors.vaccine_id ? C.red : C.border }}
              >
                <option value="">Pick a vaccine…</option>
                {vaccines.map((v) => (
                  <option key={v.library_id} value={v.library_id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {vaccines.length === 0 && !loadingAnchors && (
                <div className="text-xs mt-1" style={{ color: C.amber }}>
                  No vaccines available. Add one in Settings → Library first.
                </div>
              )}
              {fieldErrors.vaccine_id && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.vaccine_id}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How given *</label>
              <select
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: fieldErrors.route ? C.red : C.border }}
              >
                <option value="">Pick a method…</option>
                {ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {fieldErrors.route && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.route}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How many doses</label>
              <input
                type="number"
                inputMode="numeric"
                value={qtyDoses}
                onChange={(e) => setQtyDoses(e.target.value)}
                min={1}
                max={1000000}
                placeholder={selectedFlock ? `Default: ${selectedFlock.current_count}` : ''}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: '#fff', borderColor: fieldErrors.qty_doses ? C.red : C.border }}
              />
              <div className="text-xs mt-1" style={{ color: C.muted }}>
                Auto-filled from flock size. Override if different.
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Next due date (optional)</label>
              <input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: '#fff', borderColor: C.border }}
              />
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
          disabled={!anchorsReady || mutation.isPending || loadingAnchors || flocks.length === 0 || vaccines.length === 0}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{
            background: (!anchorsReady || mutation.isPending || flocks.length === 0 || vaccines.length === 0) ? '#A8C997' : C.green,
            color: '#fff',
            opacity: (!anchorsReady || mutation.isPending || flocks.length === 0 || vaccines.length === 0) ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? 'Logging…' : 'Log vaccination'}
        </button>
      </div>
    </div>
  );
}

export default function VaccinationGivenNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <VaccinationGivenNewInner />
    </QueryClientProvider>
  );
}

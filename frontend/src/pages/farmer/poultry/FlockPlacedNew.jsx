/**
 * FlockPlacedNew — Phase 6.3-1 second farmer-usable POULTRY feature.
 *
 * Calls POST /api/v1/flocks (resource endpoint). Backend emits FLOCK_PLACED audit.
 * Per-page QueryClientProvider wrap (Strike #26).
 * Defensive extractList() helper for endpoint envelope variance (Strike #27).
 *
 * Endpoints consumed:
 *  - GET /api/v1/farms              → {farms: [...], total}
 *  - GET /api/v1/production-units   → {data: [...]}
 *  - GET /api/v1/farm-libraries?library_type=POULTRY_BREED&is_active=true
 *                                    → {status, data: {items: [...]}, meta}
 *  - POST /api/v1/flocks            → {status, data: {flock_id, audit_event_id, audit_hash, ...}, meta}
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import CapacityCalc from '../../../components/farm/CapacityCalc.jsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const C = {
  soil:   'var(--soil)',
  cream:  'var(--cream)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  red:    'var(--red)',
  border: 'var(--line)',
  muted:  'var(--muted)',
};

const FLOCK_TYPES = [
  { value: 'LAYER',         label: 'Layer (eggs)' },
  { value: 'BROILER',       label: 'Broiler (meat)' },
  { value: 'DUAL_PURPOSE',  label: 'Dual purpose' },
  { value: 'BREEDER',       label: 'Breeder' },
];

const FlockPlacedSchema = z.object({
  flock_label: z.string().min(1).max(255),
  breed_id: z.string().uuid(),
  placed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  placed_count: z.number().int().min(1).max(1000000),
  flock_type: z.enum(['LAYER', 'BROILER', 'DUAL_PURPOSE', 'BREEDER']),
  notes: z.string().max(500).optional(),
});

/**
 * Defensive list extraction across TFOS endpoint envelope variance.
 *   /farms              → {farms: [...], total}
 *   /farm-libraries     → {status, data: {items: [...]}, meta}
 *   /production-units   → {data: [...]}
 */
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

function FlockPlacedNewInner() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');

  // Lookups
  const [pus, setPus] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  // Payload
  const [flockLabel, setFlockLabel] = useState('');
  const [breedId, setBreedId] = useState('');
  const [placedDate, setPlacedDate] = useState(todayISO());
  const [placedCount, setPlacedCount] = useState('');
  const [flockType, setFlockType] = useState('LAYER');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Submit mutation: POST /api/v1/flocks
  const mutation = useMutation({
    mutationFn: async (body) => {
      const result = await apiClient.post('/flocks', body);
      return result.data;
    },
    onSuccess: (data) => {
      const hash = data?.audit_hash;
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: 'Flock added ✓', type: 'success', hash },
      }));
      setTimeout(() => navigate('/farm'), 800);
    },
    onError: (err) => {
      const msg = err?.message || 'Could not add flock';
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: msg, type: 'error' },
      }));
    },
  });

  // Load farms → first farm → PUs → POULTRY_BREEDs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const farmsRes = await apiClient.get('/farms');
        const farmsList = extractList(farmsRes, 'farms', 'data.items', 'data');
        if (farmsList.length === 0) throw new Error('No farms found.');
        const firstFarm = farmsList[0];
        if (cancelled) return;
        setFarmId(firstFarm.farm_id);

        const [pusRes, breedsRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get('/farm-libraries?library_type=POULTRY_BREED&is_active=true'),
        ]);
        if (cancelled) return;

        const allPus = extractList(pusRes, 'data', 'data.items', 'production_units');
        const onFarmPus = allPus.filter(
          (pu) => pu.farm_id === firstFarm.farm_id && pu.is_active !== false,
        );
        const breedsList = extractList(breedsRes, 'data.items', 'data');

        setPus(onFarmPus);
        setBreeds(breedsList);
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

  const anchorsReady = !!farmId;

  async function handleSubmit() {
    setFieldErrors({});
    const candidate = {
      flock_label: flockLabel.trim(),
      breed_id: breedId,
      placed_date: placedDate,
      placed_count: placedCount === '' ? NaN : parseInt(placedCount, 10),
      flock_type: flockType,
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };

    const parsed = FlockPlacedSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    const body = {
      farm_id: farmId,
      flock_label: candidate.flock_label,
      breed_id: candidate.breed_id,
      placed_date: candidate.placed_date,
      placed_count: candidate.placed_count,
      flock_type: candidate.flock_type,
    };
    if (puId) body.current_pu_id = puId;
    if (candidate.notes) body.notes = candidate.notes;

    mutation.mutate(body);
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>
          ← Cancel
        </button>
        <h1 className="text-base font-semibold">Add a flock</h1>
        <div className="w-12" />
      </div>

      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        {/* Anchors */}
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }}>
                {loadingAnchors ? 'Loading…' : (farmId || '—')}
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Coop (optional)</label>
              <select
                value={puId}
                onChange={(e) => setPuId(e.target.value)}
                disabled={loadingAnchors}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: "var(--paper)", borderColor: C.border }}
              >
                <option value="">— Not assigned to a coop yet —</option>
                {pus.map((pu) => (
                  <option key={pu.pu_id} value={pu.pu_id}>
                    {pu.farmer_label || pu.pu_name || pu.pu_id}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selPu = pus.find((p) => p.pu_id === puId);
              const aha = selPu?.area_sqm ? Number(selPu.area_sqm) / 10000 : null;
              if (!aha) return null;
              return (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: 'var(--cream-2)' }}>
                  <CapacityCalc areaHa={aha} unit="m2" compact />
                </div>
              );
            })()}
          </div>
        </section>

        {/* Payload */}
        <section style={{ opacity: anchorsReady ? 1 : 0.4, pointerEvents: anchorsReady ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Flock details</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Name *</label>
              <input
                type="text"
                value={flockLabel}
                onChange={(e) => setFlockLabel(e.target.value)}
                maxLength={255}
                placeholder="e.g. Layer batch May 2026"
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: "var(--paper)", borderColor: fieldErrors.flock_label ? C.red : C.border }}
              />
              {fieldErrors.flock_label && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.flock_label}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Breed *</label>
              <select
                value={breedId}
                onChange={(e) => setBreedId(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: "var(--paper)", borderColor: fieldErrors.breed_id ? C.red : C.border }}
              >
                <option value="">Pick a breed…</option>
                {breeds.map((b) => (
                  <option key={b.library_id} value={b.library_id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {fieldErrors.breed_id && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.breed_id}</div>
              )}
              {breeds.length === 0 && !loadingAnchors && (
                <div className="text-xs mt-1" style={{ color: C.amber }}>
                  No breeds available. Add a breed in Settings → Library first.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Type *</label>
              <select
                value={flockType}
                onChange={(e) => setFlockType(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: "var(--paper)", borderColor: C.border }}
              >
                {FLOCK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Date placed *</label>
              <input
                type="date"
                value={placedDate}
                onChange={(e) => setPlacedDate(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base"
                style={{ background: "var(--paper)", borderColor: fieldErrors.placed_date ? C.red : C.border }}
              />
              {fieldErrors.placed_date && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.placed_date}</div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>How many birds *</label>
              <input
                type="number"
                inputMode="numeric"
                value={placedCount}
                onChange={(e) => setPlacedCount(e.target.value)}
                min={1}
                max={1000000}
                placeholder="e.g. 250"
                className="w-full px-3 py-3 rounded-md border text-lg"
                style={{ background: "var(--paper)", borderColor: fieldErrors.placed_count ? C.red : C.border }}
              />
              {fieldErrors.placed_count && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.placed_count}</div>
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
                style={{ background: "var(--paper)", borderColor: C.border }}
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
          disabled={!anchorsReady || mutation.isPending || loadingAnchors || breeds.length === 0}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{
            background: (!anchorsReady || mutation.isPending || breeds.length === 0) ? '#A8C997' : C.green,
            color: '#fff',
            opacity: (!anchorsReady || mutation.isPending || breeds.length === 0) ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? 'Adding…' : 'Add flock'}
        </button>
      </div>
    </div>
  );
}

export default function FlockPlacedNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <FlockPlacedNewInner />
    </QueryClientProvider>
  );
}

/**
 * EggsNew — Phase 6.2-5 first farmer-usable POULTRY feature.
 *
 * Universal Event Form Contract (Doctrine 4a.4): farm + coop + flock anchors,
 * gated payload section, Zod client validation, useEventMutation submit,
 * audit hash badge in success toast.
 *
 * Endpoints consumed (response shapes vary by endpoint, see extractList):
 *  - GET /api/v1/farms              → {farms: [...], total}
 *  - GET /api/v1/production-units   → {data: [...]} (data is array of PU rows)
 *  - GET /api/v1/flocks?farm_id=X   → {status, data: {items: [...]}, meta}
 *  - POST /api/v1/events            → via useEventMutation('EGGS_COLLECTED')
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

// QueryClient mounted per-page (precedent: CashLedger.jsx, FieldEventNew.jsx,
// SoloTaskCard.jsx). FarmerShell does not provide a global QueryClientProvider.
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

// Defensive extractor — TFOS API responses vary by endpoint. Unwrap to an array.
function extractList(body, ...keys) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(body[k])) return body[k];
  }
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  return [];
}

// Client-side schema mirrors backend EggsCollectedPayload (Pydantic).
// Backend remains source of truth; client validates for UX, not security.
const EggsCollectedSchema = z.object({
  qty_eggs: z.number().int().min(0).max(100000),
  grade_medium: z.number().int().min(0).optional(),
  grade_large: z.number().int().min(0).optional(),
  grade_small: z.number().int().min(0).optional(),
  broken_eggs: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

function EggsNewInner() {
  const navigate = useNavigate();

  // Anchors
  const [farmId, setFarmId] = useState(null);
  const [puId, setPuId] = useState('');
  const [wholeCoop, setWholeCoop] = useState(false);
  const [flockId, setFlockId] = useState('');

  // Lookup data
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  // Payload
  const [qtyEggs, setQtyEggs] = useState('');
  const [gradeMedium, setGradeMedium] = useState('');
  const [gradeLarge, setGradeLarge] = useState('');
  const [gradeSmall, setGradeSmall] = useState('');
  const [brokenEggs, setBrokenEggs] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useEventMutation({
    eventType: 'EGGS_COLLECTED',
    successMessage: 'Eggs logged ✓',
    onSuccess: () => {
      setTimeout(() => navigate('/farm'), 800);
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const farmsRes = await apiClient.get('/farms');
        const farmsList = extractList(farmsRes, 'farms');
        if (farmsList.length === 0) {
          throw new Error('No farms found for this account.');
        }
        const firstFarm = farmsList[0];
        if (cancelled) return;
        setFarmId(firstFarm.farm_id);

        const [pusRes, flocksRes] = await Promise.all([
          apiClient.get('/production-units'),
          apiClient.get(`/flocks?farm_id=${firstFarm.farm_id}&is_active=true`),
        ]);
        if (cancelled) return;

        const allPus = extractList(pusRes, 'production_units', 'data');
        const farmPus = allPus.filter((p) => p.farm_id === firstFarm.farm_id && p.is_active !== false);
        const flocksList = extractList(flocksRes, 'items');

        setPus(farmPus);
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
    if (wholeCoop) return flocks;
    if (!puId) return [];
    return flocks.filter((f) => f.current_pu_id === puId);
  }, [flocks, puId, wholeCoop]);

  useEffect(() => {
    setFlockId('');
  }, [puId, wholeCoop]);

  const anchorsReady = !!farmId && (wholeCoop || !!puId);

  function buildPayload() {
    const grade = {};
    if (gradeMedium !== '') grade.medium = parseInt(gradeMedium, 10);
    if (gradeLarge  !== '') grade.large  = parseInt(gradeLarge, 10);
    if (gradeSmall  !== '') grade.small  = parseInt(gradeSmall, 10);
    const payload = { qty_eggs: parseInt(qtyEggs, 10) };
    if (Object.keys(grade).length) payload.grade_breakdown = grade;
    if (brokenEggs !== '') payload.broken_eggs = parseInt(brokenEggs, 10);
    if (notes.trim()) payload.notes = notes.trim();
    return payload;
  }

  async function handleSubmit() {
    setFieldErrors({});

    const candidate = {
      qty_eggs: qtyEggs === '' ? NaN : parseInt(qtyEggs, 10),
      grade_medium: gradeMedium === '' ? undefined : parseInt(gradeMedium, 10),
      grade_large:  gradeLarge  === '' ? undefined : parseInt(gradeLarge, 10),
      grade_small:  gradeSmall  === '' ? undefined : parseInt(gradeSmall, 10),
      broken_eggs:  brokenEggs  === '' ? undefined : parseInt(brokenEggs, 10),
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };

    const parsed = EggsCollectedSchema.safeParse(candidate);
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
      pu_id: wholeCoop ? null : puId,
      cycle_id: null,
      flock_id: flockId || null,
    };

    mutation.mutate({ anchors, payload: buildPayload() });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>
          ← Cancel
        </button>
        <h1 className="text-base font-semibold">Log eggs</h1>
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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={wholeCoop}
                onChange={(e) => setWholeCoop(e.target.checked)}
                disabled={loadingAnchors}
              />
              <span>Whole-farm event (no specific coop)</span>
            </label>

            {!wholeCoop && (
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Coop</label>
                <select
                  value={puId}
                  onChange={(e) => setPuId(e.target.value)}
                  disabled={loadingAnchors}
                  className="w-full px-3 py-2 rounded-md border text-sm"
                  style={{ background: "var(--paper)", borderColor: C.border }}
                >
                  <option value="">Pick a coop…</option>
                  {pus.map((pu) => (
                    <option key={pu.pu_id} value={pu.pu_id}>
                      {pu.farmer_label || pu.pu_name || pu.pu_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>
                Flock {!wholeCoop && puId ? '(in this coop)' : '(optional)'}
              </label>
              <select
                value={flockId}
                onChange={(e) => setFlockId(e.target.value)}
                disabled={!anchorsReady || loadingAnchors}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: "var(--paper)", borderColor: C.border }}
              >
                <option value="">— No specific flock —</option>
                {visibleFlocks.map((f) => (
                  <option key={f.flock_id} value={f.flock_id}>
                    {f.flock_label} ({f.flock_id})
                  </option>
                ))}
              </select>
              {!wholeCoop && puId && visibleFlocks.length === 0 && !loadingAnchors && (
                <div className="text-xs mt-1" style={{ color: C.amber }}>
                  No active flocks in this coop yet. You can still log without a flock.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Payload — gated by anchors */}
        <section style={{ opacity: anchorsReady ? 1 : 0.4, pointerEvents: anchorsReady ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>How many</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Total eggs *</label>
              <input
                type="number"
                inputMode="numeric"
                value={qtyEggs}
                onChange={(e) => setQtyEggs(e.target.value)}
                min={0}
                max={100000}
                className="w-full px-3 py-3 rounded-md border text-lg"
                style={{ background: "var(--paper)", borderColor: fieldErrors.qty_eggs ? C.red : C.border }}
                placeholder="e.g. 142"
              />
              {fieldErrors.qty_eggs && (
                <div className="text-xs mt-1" style={{ color: C.red }}>{fieldErrors.qty_eggs}</div>
              )}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer py-1" style={{ color: C.muted }}>Sort by size (optional)</summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Medium</label>
                  <input type="number" inputMode="numeric" value={gradeMedium} onChange={(e) => setGradeMedium(e.target.value)} min={0} className="w-full px-2 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Large</label>
                  <input type="number" inputMode="numeric" value={gradeLarge} onChange={(e) => setGradeLarge(e.target.value)} min={0} className="w-full px-2 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Small</label>
                  <input type="number" inputMode="numeric" value={gradeSmall} onChange={(e) => setGradeSmall(e.target.value)} min={0} className="w-full px-2 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} />
                </div>
              </div>
            </details>

            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Broken (optional)</label>
              <input
                type="number"
                inputMode="numeric"
                value={brokenEggs}
                onChange={(e) => setBrokenEggs(e.target.value)}
                min={0}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ background: "var(--paper)", borderColor: C.border }}
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
          disabled={!anchorsReady || mutation.isPending || loadingAnchors}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{
            background: (!anchorsReady || mutation.isPending) ? '#A8C997' : C.green,
            color: '#fff',
            opacity: (!anchorsReady || mutation.isPending) ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? 'Logging…' : 'Log eggs'}
        </button>
      </div>
    </div>
  );
}

export default function EggsNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <EggsNewInner />
    </QueryClientProvider>
  );
}

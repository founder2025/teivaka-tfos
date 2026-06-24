/**
 * VisitorLoggedNew - Phase 6.3-17. Farm visitor entry log.
 * flock_id OPTIONAL (whole-farm visit pattern per Section 4a.4).
 * Biosecurity foundational event for outbreak traceability.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const VISITOR_TYPES = [
  { value: 'BUYER',             label: 'Buyer' },
  { value: 'SUPPLIER',          label: 'Supplier' },
  { value: 'VET',               label: 'Vet' },
  { value: 'EXTENSION_OFFICER', label: 'Extension officer' },
  { value: 'INSPECTOR',         label: 'Inspector' },
  { value: 'OTHER_FARMER',      label: 'Other farmer' },
  { value: 'FAMILY',            label: 'Family' },
  { value: 'OTHER',             label: 'Other' },
];

const PURPOSES = [
  { value: 'DELIVERY',     label: 'Delivery' },
  { value: 'PURCHASE',     label: 'Purchase' },
  { value: 'VETERINARY',   label: 'Veterinary' },
  { value: 'INSPECTION',   label: 'Inspection' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'SOCIAL',       label: 'Social' },
  { value: 'OTHER',        label: 'Other' },
];

const Schema = z.object({
  visitor_type: z.enum(['BUYER', 'SUPPLIER', 'VET', 'EXTENSION_OFFICER', 'INSPECTOR', 'OTHER_FARMER', 'FAMILY', 'OTHER']),
  purpose: z.enum(['DELIVERY', 'PURCHASE', 'VETERINARY', 'INSPECTION', 'CONSULTATION', 'SOCIAL', 'OTHER']),
  arrival_time: z.string().min(1),
  departure_time: z.string().optional(),
  vehicle_disinfected: z.boolean(),
  boots_disinfected: z.boolean(),
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

function localNowIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [visitorType, setVisitorType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [arrivalTime, setArrivalTime] = useState(localNowIso());
  const [departureTime, setDepartureTime] = useState('');
  const [vehicleDisinfected, setVehicleDisinfected] = useState(false);
  const [bootsDisinfected, setBootsDisinfected] = useState(false);
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'VISITOR_LOGGED',
    successMessage: 'Visitor logged ✓',
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
    const candidate = {
      visitor_type: visitorType,
      purpose,
      arrival_time: arrivalTime,
      departure_time: departureTime || undefined,
      vehicle_disinfected: vehicleDisinfected,
      boots_disinfected: bootsDisinfected,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      visitor_type: candidate.visitor_type,
      purpose: candidate.purpose,
      arrival_time: new Date(candidate.arrival_time).toISOString(),
      vehicle_disinfected: candidate.vehicle_disinfected,
      boots_disinfected: candidate.boots_disinfected,
    };
    if (candidate.departure_time) payload.departure_time = new Date(candidate.departure_time).toISOString();
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log farm visitor</h1>
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
              <span>Whole-farm visit (no specific flock)</span>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Visitor</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Who? *</label>
              <select value={visitorType} onChange={e => setVisitorType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.visitor_type ? C.red : C.border }}>
                <option value="">Pick a visitor type…</option>
                {VISITOR_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.visitor_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.visitor_type}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Purpose *</label>
              <select value={purpose} onChange={e => setPurpose(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.purpose ? C.red : C.border }}>
                <option value="">Pick a purpose…</option>
                {PURPOSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.purpose && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.purpose}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Arrival time *</label>
              <input type="datetime-local" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: errs.arrival_time ? C.red : C.border }} />
              {errs.arrival_time && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.arrival_time}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Departure time (optional)</label>
              <input type="datetime-local" value={departureTime} onChange={e => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: errs.departure_time ? C.red : C.border }} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={vehicleDisinfected} onChange={e => setVehicleDisinfected(e.target.checked)} />
              <span>Vehicle disinfected on entry</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={bootsDisinfected} onChange={e => setBootsDisinfected(e.target.checked)} />
              <span>Boots / footwear disinfected on entry</span>
            </label>
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
          {mutation.isPending ? 'Logging…' : 'Log visitor'}
        </button>
      </div>
    </div>
  );
}

export default function VisitorLoggedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

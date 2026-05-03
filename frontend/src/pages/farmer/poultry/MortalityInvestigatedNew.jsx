/**
 * MortalityInvestigatedNew - Phase 6.3-15. Flock mortality investigation.
 * flock_id REQUIRED. Captures suspected cause + investigation method + findings.
 * Optional mortality_event_id soft-links to a prior MORTALITY_LOGGED audit event.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000', red: '#A32D2D', border: '#E6DED0', muted: '#8A8678' };

const SUSPECTED_CAUSES = [
  { value: 'DISEASE',       label: 'Disease' },
  { value: 'PREDATOR',      label: 'Predator attack' },
  { value: 'HEAT_STRESS',   label: 'Heat stress' },
  { value: 'FEED_RELATED',  label: 'Feed-related' },
  { value: 'INJURY',        label: 'Injury' },
  { value: 'UNKNOWN',       label: 'Unknown' },
  { value: 'OTHER',         label: 'Other' },
];

const INVESTIGATION_METHODS = [
  { value: 'VISUAL_INSPECTION',           label: 'Visual inspection' },
  { value: 'NECROPSY',                    label: 'Necropsy (post-mortem)' },
  { value: 'VET_CONSULTATION',            label: 'Vet consultation' },
  { value: 'LAB_TEST',                    label: 'Lab test' },
  { value: 'EXTERNAL_EXAMINATION_ONLY',   label: 'External examination only' },
];

const Schema = z.object({
  suspected_cause: z.enum(['DISEASE', 'PREDATOR', 'HEAT_STRESS', 'FEED_RELATED', 'INJURY', 'UNKNOWN', 'OTHER']),
  investigation_method: z.enum(['VISUAL_INSPECTION', 'NECROPSY', 'VET_CONSULTATION', 'LAB_TEST', 'EXTERNAL_EXAMINATION_ONLY']),
  findings: z.string().min(1).max(500),
  action_taken: z.string().max(300).optional(),
  mortality_event_id: z.string().uuid().optional(),
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
  const prefillMortalityEventId = searchParams.get('mortality_event_id');
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState(prefillFlockId || '');
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [suspectedCause, setSuspectedCause] = useState('');
  const [investigationMethod, setInvestigationMethod] = useState('');
  const [findings, setFindings] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [mortalityEventId, setMortalityEventId] = useState(prefillMortalityEventId || '');
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'MORTALITY_INVESTIGATED',
    successMessage: 'Investigation logged ✓',
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
    const candidate = {
      suspected_cause: suspectedCause,
      investigation_method: investigationMethod,
      findings: findings.trim(),
      action_taken: actionTaken.trim() || undefined,
      mortality_event_id: mortalityEventId.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      suspected_cause: candidate.suspected_cause,
      investigation_method: candidate.investigation_method,
      findings: candidate.findings,
    };
    if (candidate.action_taken) payload.action_taken = candidate.action_taken;
    if (candidate.mortality_event_id) payload.mortality_event_id = candidate.mortality_event_id;
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
        <h1 className="text-base font-semibold">Investigate mortality</h1>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Investigation</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Suspected cause *</label>
              <select value={suspectedCause} onChange={e => setSuspectedCause(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.suspected_cause ? C.red : C.border }}>
                <option value="">Pick a cause…</option>
                {SUSPECTED_CAUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.suspected_cause && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.suspected_cause}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Investigation method *</label>
              <select value={investigationMethod} onChange={e => setInvestigationMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.investigation_method ? C.red : C.border }}>
                <option value="">Pick a method…</option>
                {INVESTIGATION_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.investigation_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.investigation_method}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Findings *</label>
              <textarea value={findings} onChange={e => setFindings(e.target.value)} maxLength={500} rows={3} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: errs.findings ? C.red : C.border }} placeholder="What did you observe?" />
              {errs.findings && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.findings}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Action taken (optional)</label>
              <textarea value={actionTaken} onChange={e => setActionTaken(e.target.value)} maxLength={300} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: errs.action_taken ? C.red : C.border }} placeholder="What did you do in response?" />
              {errs.action_taken && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.action_taken}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Linked mortality event ID (optional, UUID)</label>
              <input type="text" value={mortalityEventId} onChange={e => setMortalityEventId(e.target.value)} placeholder="e.g. 951f6638-2cb4-4d11-..."
                className="w-full px-3 py-2 rounded-md border text-sm font-mono" style={{ background: '#fff', borderColor: errs.mortality_event_id ? C.red : C.border }} />
              {errs.mortality_event_id && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.mortality_event_id}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} placeholder="Anything else worth noting?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading || flocks.length === 0} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending || flocks.length === 0) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending || flocks.length === 0) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log investigation'}
        </button>
      </div>
    </div>
  );
}

export default function MortalityInvestigatedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

/**
 * IncidentReportedNew - Phase 6.3-23. Risk-management incident logging.
 * flock_id OPTIONAL (whole-farm via toggle).
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: 'var(--line)', muted: 'var(--muted)' };

const INCIDENT_TYPES = [
  { value: 'PREDATOR_ATTACK',    label: 'Predator attack' },
  { value: 'THEFT',              label: 'Theft' },
  { value: 'ESCAPE',             label: 'Escape' },
  { value: 'INJURY',             label: 'Injury' },
  { value: 'STRUCTURAL_DAMAGE',  label: 'Structural damage' },
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment failure' },
  { value: 'UTILITY_OUTAGE',     label: 'Utility outage' },
  { value: 'OTHER',              label: 'Other' },
];

const SEVERITIES = [
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const Schema = z.object({
  incident_type: z.enum(['PREDATOR_ATTACK', 'THEFT', 'ESCAPE', 'INJURY', 'STRUCTURAL_DAMAGE', 'EQUIPMENT_FAILURE', 'UTILITY_OUTAGE', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  birds_affected_qty: z.number().int().nonnegative().optional(),
  estimated_loss_fjd: z.number().nonnegative().optional(),
  requires_followup: z.boolean(),
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
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [birdsAffected, setBirdsAffected] = useState('');
  const [estimatedLoss, setEstimatedLoss] = useState('');
  const [requiresFollowup, setRequiresFollowup] = useState(false);
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'INCIDENT_REPORTED',
    successMessage: 'Incident logged ✓',
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
    const birdsNum = birdsAffected.trim() === '' ? undefined : parseInt(birdsAffected, 10);
    const lossNum = estimatedLoss.trim() === '' ? undefined : parseFloat(estimatedLoss);
    const candidate = {
      incident_type: incidentType,
      severity,
      birds_affected_qty: birdsNum !== undefined && isNaN(birdsNum) ? undefined : birdsNum,
      estimated_loss_fjd: lossNum !== undefined && isNaN(lossNum) ? undefined : lossNum,
      requires_followup: requiresFollowup,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      incident_type: candidate.incident_type,
      severity: candidate.severity,
      requires_followup: candidate.requires_followup,
    };
    if (candidate.birds_affected_qty !== undefined) payload.birds_affected_qty = candidate.birds_affected_qty;
    if (candidate.estimated_loss_fjd !== undefined) payload.estimated_loss_fjd = candidate.estimated_loss_fjd;
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Report incident</h1>
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
              <span>Whole-farm incident (no specific flock)</span>
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
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Incident</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Type *</label>
              <select value={incidentType} onChange={e => setIncidentType(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.incident_type ? C.red : C.border }}>
                <option value="">Pick a type…</option>
                {INCIDENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.incident_type && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.incident_type}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Severity *</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.severity ? C.red : C.border }}>
                <option value="">Pick severity…</option>
                {SEVERITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.severity && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.severity}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Birds affected (optional)</label>
              <input type="number" inputMode="numeric" min="0" step="1" value={birdsAffected} onChange={e => setBirdsAffected(e.target.value)} placeholder="0"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.birds_affected_qty ? C.red : C.border }} />
              {errs.birds_affected_qty && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.birds_affected_qty}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Estimated loss (FJD) — optional</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={estimatedLoss} onChange={e => setEstimatedLoss(e.target.value)} placeholder="45.00"
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: errs.estimated_loss_fjd ? C.red : C.border }} />
              {errs.estimated_loss_fjd && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.estimated_loss_fjd}</div>}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={requiresFollowup} onChange={e => setRequiresFollowup(e.target.checked)} />
              <span>Requires followup action</span>
            </label>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: "var(--paper)", borderColor: C.border }} placeholder="What happened?" />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log incident'}
        </button>
      </div>
    </div>
  );
}

export default function IncidentReportedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

/**
 * PestControlAppliedNew - Phase 6.3-18. Pest control measures applied.
 * flock_id OPTIONAL (whole-farm pest control allowed).
 * At least one of chemical_id / non_chemical_method must be provided.
 * chemical_id is TEXT FK to shared.chemical_library.chemical_id (e.g. 'CHEM-001').
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { useEventMutation } from '../../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const PEST_TARGETS = [
  { value: 'RODENTS',     label: 'Rodents (rats, mice)' },
  { value: 'FLIES',       label: 'Flies' },
  { value: 'MITES',       label: 'Mites' },
  { value: 'LICE',        label: 'Lice' },
  { value: 'COCKROACHES', label: 'Cockroaches' },
  { value: 'OTHER',       label: 'Other' },
];

const NON_CHEMICAL_METHODS = [
  { value: 'TRAPS',             label: 'Traps' },
  { value: 'PHYSICAL_REMOVAL',  label: 'Physical removal' },
  { value: 'PREDATOR_BIRDS',    label: 'Predator birds' },
  { value: 'OTHER',             label: 'Other' },
];

const UNITS = [
  { value: 'GRAMS', label: 'Grams' },
  { value: 'ML',    label: 'ml' },
  { value: 'ITEMS', label: 'Items' },
];

const APPLICATOR_ROLES = [
  { value: 'OWNER',                 label: 'Owner' },
  { value: 'WORKER',                label: 'Worker' },
  { value: 'EXTERNAL_PEST_CONTROL', label: 'External pest control service' },
];

const Schema = z.object({
  pest_target: z.enum(['RODENTS', 'FLIES', 'MITES', 'LICE', 'COCKROACHES', 'OTHER']),
  chemical_id: z.string().max(64).optional(),
  non_chemical_method: z.enum(['TRAPS', 'PHYSICAL_REMOVAL', 'PREDATOR_BIRDS', 'OTHER']).optional(),
  qty_used: z.number().positive().optional(),
  unit: z.enum(['GRAMS', 'ML', 'ITEMS']).optional(),
  area_treated_m2: z.number().positive().optional(),
  applicator_role: z.enum(['OWNER', 'WORKER', 'EXTERNAL_PEST_CONTROL']),
  notes: z.string().max(500).optional(),
}).refine(d => !!d.chemical_id || !!d.non_chemical_method, {
  message: 'Pick a chemical or a non-chemical method (or both).',
  path: ['method_required'],
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
  const [puId, setPuId] = useState('');
  const [flockId, setFlockId] = useState(prefillFlockId || '');
  const [wholeFarm, setWholeFarm] = useState(!prefillFlockId);
  const [pus, setPus] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [methodKind, setMethodKind] = useState('CHEMICAL');
  const [pestTarget, setPestTarget] = useState('');
  const [chemicalId, setChemicalId] = useState('');
  const [nonChemicalMethod, setNonChemicalMethod] = useState('');
  const [qtyUsed, setQtyUsed] = useState('');
  const [unit, setUnit] = useState('');
  const [areaM2, setAreaM2] = useState('');
  // 129 field-test fix: smart default (owner applies it themselves in the common
  // case); the detail fields live behind one "More detail" fold.
  const [applicatorRole, setApplicatorRole] = useState('OWNER');
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: 'PEST_CONTROL_APPLIED',
    successMessage: 'Pest control logged ✓',
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
        const [puRes, flRes, chemRes] = await Promise.all([
          apiClient.get('/production-units').catch(() => ({ data: [] })),
          apiClient.get(`/flocks?farm_id=${fl[0].farm_id}&is_active=true`),
          apiClient.get('/chemicals').catch(() => ({ data: [] })),
        ]);
        if (c) return;
        setPus(extractList(puRes, 'data.items', 'data').filter(p => p.farm_id === fl[0].farm_id));
        setFlocks(extractList(flRes, 'data.items', 'data'));
        setChemicals(extractList(chemRes, 'data.items', 'data', 'chemicals'));
        setLoading(false);
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  const visibleFlocks = useMemo(() => puId ? flocks.filter(f => f.current_pu_id === puId) : flocks, [flocks, puId]);
  useEffect(() => { setFlockId(''); }, [puId]);
  useEffect(() => { if (wholeFarm) { setFlockId(''); setPuId(''); } }, [wholeFarm]);
  useEffect(() => {
    if (methodKind === 'CHEMICAL') setNonChemicalMethod('');
    if (methodKind === 'NON_CHEMICAL') { setChemicalId(''); setQtyUsed(''); setUnit(''); }
  }, [methodKind]);
  const ready = !!farmId && (wholeFarm || !!flockId);
  const showChemical = methodKind === 'CHEMICAL' || methodKind === 'BOTH';
  const showNonChemical = methodKind === 'NON_CHEMICAL' || methodKind === 'BOTH';

  async function submit() {
    setErrs({});
    const candidate = {
      pest_target: pestTarget,
      chemical_id: showChemical && chemicalId ? chemicalId : undefined,
      non_chemical_method: showNonChemical && nonChemicalMethod ? nonChemicalMethod : undefined,
      qty_used: qtyUsed === '' ? undefined : parseFloat(qtyUsed),
      unit: unit || undefined,
      area_treated_m2: areaM2 === '' ? undefined : parseFloat(areaM2),
      applicator_role: applicatorRole,
      notes: notes.trim() || undefined,
    };
    const parsed = Schema.safeParse(candidate);
    if (!parsed.success) {
      const e = {};
      for (const i of parsed.error.issues) if (i.path[0]) e[i.path[0]] = i.message;
      setErrs(e); return;
    }
    const payload = {
      pest_target: candidate.pest_target,
      applicator_role: candidate.applicator_role,
    };
    if (candidate.chemical_id) payload.chemical_id = candidate.chemical_id;
    if (candidate.non_chemical_method) payload.non_chemical_method = candidate.non_chemical_method;
    if (candidate.qty_used !== undefined) payload.qty_used = candidate.qty_used;
    if (candidate.unit) payload.unit = candidate.unit;
    if (candidate.area_treated_m2 !== undefined) payload.area_treated_m2 = candidate.area_treated_m2;
    if (candidate.notes) payload.notes = candidate.notes;
    const anchors = { farm_id: farmId, pu_id: wholeFarm ? null : (puId || null), cycle_id: null };
    if (!wholeFarm && flockId) anchors.flock_id = flockId;
    mutation.mutate({ anchors, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Log pest control</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Where</div>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: C.muted }}>Farm</label>
              <div className="px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>{loading ? 'Loading...' : (farmId || '—')}</div></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={wholeFarm} onChange={e => setWholeFarm(e.target.checked)} />
              <span>Whole-farm pest control (no specific flock)</span>
            </label>
            {!wholeFarm && (
              <>
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
              </>
            )}
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Pest control</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Target pest *</label>
              <select value={pestTarget} onChange={e => setPestTarget(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.pest_target ? C.red : C.border }}>
                <option value="">Pick a target…</option>
                {PEST_TARGETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.pest_target && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.pest_target}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Method *</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'CHEMICAL', label: 'Chemical' },
                  { v: 'NON_CHEMICAL', label: 'Non-chemical' },
                  { v: 'BOTH', label: 'Both' },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm" style={{ background: methodKind === o.v ? '#E8F0E2' : '#fff', borderColor: methodKind === o.v ? C.green : C.border }}>
                    <input type="radio" name="methodKind" value={o.v} checked={methodKind === o.v} onChange={() => setMethodKind(o.v)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {showChemical && (
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Chemical {methodKind === 'CHEMICAL' ? '*' : '(optional)'}</label>
                <select value={chemicalId} onChange={e => setChemicalId(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.chemical_id ? C.red : C.border }}>
                  <option value="">— Pick a chemical —</option>
                  {chemicals.map(ch => <option key={ch.chemical_id} value={ch.chemical_id}>{ch.chem_name || ch.chemical_id} ({ch.chemical_id})</option>)}
                </select>
                {errs.chemical_id && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.chemical_id}</div>}
              </div>
            )}
            {showNonChemical && (
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Non-chemical method {methodKind === 'NON_CHEMICAL' ? '*' : '(optional)'}</label>
                <select value={nonChemicalMethod} onChange={e => setNonChemicalMethod(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.non_chemical_method ? C.red : C.border }}>
                  <option value="">— Pick a method —</option>
                  {NON_CHEMICAL_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {errs.non_chemical_method && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.non_chemical_method}</div>}
              </div>
            )}
            {errs.method_required && <div className="text-xs" style={{ color: C.red }}>{errs.method_required}</div>}
            <button type="button" onClick={() => setMore(m => !m)} className="text-sm font-medium" style={{ color: C.green }}>
              {more ? '− Less detail' : '+ More detail (amount, area, who applied, notes)'}
            </button>
            {more && (<>
              {showChemical && (
                <>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: C.muted }}>Quantity used (optional)</label>
                    <input type="number" inputMode="decimal" value={qtyUsed} onChange={e => setQtyUsed(e.target.value)} min={0.001} step={0.001} placeholder="e.g. 50"
                      className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.qty_used ? C.red : C.border }} />
                    {errs.qty_used && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.qty_used}</div>}
                  </div>
                  {qtyUsed !== '' && (
                    <div>
                      <label className="block text-xs mb-1" style={{ color: C.muted }}>Unit</label>
                      <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.unit ? C.red : C.border }}>
                        <option value="">— Pick a unit —</option>
                        {UNITS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Area treated (m²) — optional</label>
                <input type="number" inputMode="decimal" value={areaM2} onChange={e => setAreaM2(e.target.value)} min={0.01} step={0.01} placeholder="e.g. 40"
                  className="w-full px-3 py-3 rounded-md border text-lg" style={{ background: '#fff', borderColor: errs.area_treated_m2 ? C.red : C.border }} />
                {errs.area_treated_m2 && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.area_treated_m2}</div>}
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Who applied it</label>
                <select value={applicatorRole} onChange={e => setApplicatorRole(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.applicator_role ? C.red : C.border }}>
                  {APPLICATOR_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {errs.applicator_role && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.applicator_role}</div>}
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} placeholder="Anything else worth noting?" />
              </div>
            </>)}
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : 'Log pest control'}
        </button>
      </div>
    </div>
  );
}

export default function PestControlAppliedNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

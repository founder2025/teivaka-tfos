/**
 * LivestockEventNew — /farm/livestock/log?type=X — 129 catalog forensic ADD
 * (Operator-ratified Option A livestock pack).
 *
 * One dispatcher for the 8 livestock event types: LIVESTOCK_BIRTH, MORTALITY,
 * ACQUIRED, SALE, VACCINATION, MILK_COLLECTED, ANIMAL_MOVED, BREEDING_LOGGED.
 * Cattle (dairy + meat), goats, sheep. 3-4 essential fields up front per the
 * 60-second field standard; everything else behind "More detail". Every submit
 * → polymorphic /events → tenant.livestock_events + one hash-chained audit row.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { useEventMutation } from '../../utils/useEventMutation';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

const SPECIES = [
  { value: 'CATTLE', label: 'Cattle' }, { value: 'GOAT', label: 'Goat' },
  { value: 'SHEEP', label: 'Sheep' }, { value: 'PIG', label: 'Pig' },
  { value: 'HORSE', label: 'Horse' }, { value: 'OTHER', label: 'Other' },
];

// Per-type config: title, the date field name, essential fields, more-detail fields.
const TYPES = {
  LIVESTOCK_BIRTH: {
    title: 'Animal born', verb: 'Log birth', dateKey: 'birth_date',
    fields: [{ k: 'qty_born', label: 'How many born? *', type: 'int', req: true }],
    more: [{ k: 'qty_alive', label: 'How many alive now?', type: 'int' }],
  },
  LIVESTOCK_MORTALITY: {
    title: 'Animal died', verb: 'Log death', dateKey: 'death_date',
    fields: [
      { k: 'qty_dead', label: 'How many died? *', type: 'int', req: true },
      { k: 'cause', label: 'Cause *', type: 'pick', req: true, opts: [['UNKNOWN', "Don't know"], ['DISEASE', 'Sickness'], ['PREDATION', 'Predator / dogs'], ['INJURY', 'Injury'], ['BIRTHING', 'Birthing'], ['OLD_AGE', 'Old age'], ['OTHER', 'Other']] },
    ],
    more: [],
  },
  LIVESTOCK_ACQUIRED: {
    title: 'New animals', verb: 'Log animals', dateKey: 'acquired_date',
    fields: [{ k: 'qty', label: 'How many? *', type: 'int', req: true }],
    more: [
      { k: 'cost_fjd', label: 'What did they cost? (FJD)', type: 'dec' },
      { k: 'source', label: 'Who / where from?', type: 'text' },
    ],
  },
  LIVESTOCK_SALE: {
    title: 'Animals sold', verb: 'Log sale', dateKey: 'sale_date',
    fields: [
      { k: 'qty', label: 'How many sold? *', type: 'int', req: true },
      { k: 'total_revenue_fjd', label: 'Money received (FJD) *', type: 'dec', req: true },
    ],
    more: [{ k: 'buyer_name', label: 'Who bought them?', type: 'text' }],
  },
  VACCINATION: {
    title: 'Animal vaccination', verb: 'Log vaccination', dateKey: 'given_date',
    fields: [{ k: 'vaccine_name', label: 'Vaccine name *', type: 'text', req: true }],
    more: [
      { k: 'qty_animals', label: 'How many animals?', type: 'int' },
      { k: 'withholding_days_meat', label: 'Hold days — meat', type: 'int' },
      { k: 'withholding_days_milk', label: 'Hold days — milk', type: 'int' },
      { k: 'next_due_date', label: 'Next dose due', type: 'date' },
    ],
  },
  MILK_COLLECTED: {
    title: 'Milk collected', verb: 'Log milk', dateKey: 'collected_date',
    fields: [
      { k: 'qty_litres', label: 'How many litres? *', type: 'dec', req: true },
      { k: 'session', label: 'When? *', type: 'pick', req: true, opts: [['MORNING', 'Morning'], ['EVENING', 'Evening'], ['FULL_DAY', 'Whole day']] },
    ],
    more: [],
  },
  ANIMAL_MOVED: {
    title: 'Animals moved', verb: 'Log move', dateKey: 'moved_date',
    fields: [{ k: 'to_location', label: 'Moved to where? *', type: 'text', req: true }],
    more: [
      { k: 'qty', label: 'How many?', type: 'int' },
      { k: 'from_location', label: 'From where?', type: 'text' },
      { k: 'reason', label: 'Why? (fresh grass, weaning…)', type: 'text' },
    ],
  },
  BREEDING_LOGGED: {
    title: 'Breeding / mating', verb: 'Log breeding', dateKey: 'breeding_date',
    fields: [
      { k: 'method', label: 'What happened? *', type: 'pick', req: true, opts: [['NATURAL', 'Mated naturally'], ['AI', 'AI (artificial)'], ['PREGNANCY_CHECK', 'Pregnancy check']] },
    ],
    more: [
      { k: 'sire_ref', label: 'Bull / buck (tag or name)', type: 'text' },
      { k: 'result', label: 'Result', type: 'pick', opts: [['MATED', 'Mated'], ['PREGNANT', 'Pregnant'], ['NOT_PREGNANT', 'Not pregnant'], ['UNKNOWN', 'Not sure yet']] },
      { k: 'expected_due_date', label: 'Expected due date', type: 'date' },
    ],
  },
};

function extractList(res, ...paths) {
  if (!res) return [];
  for (const p of paths) {
    const parts = p.split('.'); let cur = res;
    for (const x of parts) { if (cur == null) break; cur = cur[x]; }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}
const todayISO = () => new Date().toISOString().slice(0, 10);

function Field({ f, val, onChange, err }) {
  const base = { background: '#fff', borderColor: err ? C.red : C.border };
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: C.muted }}>{f.label}</label>
      {f.type === 'pick' ? (
        <select value={val} onChange={e => onChange(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={base}>
          <option value="">Pick…</option>
          {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : f.type === 'date' ? (
        <input type="date" value={val} onChange={e => onChange(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={base} />
      ) : (
        <input type={f.type === 'text' ? 'text' : 'number'} inputMode={f.type === 'int' ? 'numeric' : f.type === 'dec' ? 'decimal' : undefined}
          value={val} onChange={e => onChange(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={base} />
      )}
      {err && <div className="text-xs mt-1" style={{ color: C.red }}>{err}</div>}
    </div>
  );
}

function Inner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const cfg = TYPES[type];

  const [farmId, setFarmId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);
  const [species, setSpecies] = useState(localStorage.getItem('tfos_last_species') || '');
  const [animalRef, setAnimalRef] = useState('');
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState({});
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState({});

  const mutation = useEventMutation({
    eventType: type || 'LIVESTOCK_BIRTH',
    successMessage: `${cfg ? cfg.title : 'Event'} logged ✓`,
    onSuccess: () => setTimeout(() => navigate('/farm'), 800),
  });

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const farmsRes = await apiClient.get('/farms');
        const fl = extractList(farmsRes, 'data.items', 'data', 'farms');
        if (fl.length === 0) throw new Error('No farms found.');
        if (!c) { setFarmId(fl[0].farm_id); setLoading(false); }
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  if (!cfg) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: C.cream, color: C.muted }}>Unknown animal event type.</div>;
  }

  const setV = (k, v) => setVals(s => ({ ...s, [k]: v }));
  const ready = !!farmId && !!species;

  function submit() {
    const e = {};
    if (!species) e.species = 'Pick the animal type.';
    for (const f of cfg.fields) {
      const v = vals[f.k];
      if (f.req && (v === undefined || v === '' || v === null)) e[f.k] = 'Required.';
    }
    if (!date) e.date = 'Required.';
    setErrs(e);
    if (Object.keys(e).length) return;

    const payload = { species, [cfg.dateKey]: date };
    if (animalRef.trim()) payload.animal_ref = animalRef.trim();
    if (notes.trim()) payload.notes = notes.trim();
    for (const f of [...cfg.fields, ...cfg.more]) {
      let v = vals[f.k];
      if (v === undefined || v === '') continue;
      if (f.type === 'int') v = parseInt(v, 10);
      if (f.type === 'dec') v = parseFloat(v);
      if (Number.isNaN(v)) continue;
      payload[f.k] = v;
    }
    localStorage.setItem('tfos_last_species', species);
    mutation.mutate({ anchors: { farm_id: farmId, pu_id: null, cycle_id: null, flock_id: null }, payload });
  }

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">{cfg.title}</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Which animals</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Animal type *</label>
              <select value={species} onChange={e => setSpecies(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.species ? C.red : (!species ? C.amber : C.border) }}>
                <option value="">Pick…</option>
                {SPECIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errs.species && <div className="text-xs mt-1" style={{ color: C.red }}>{errs.species}</div>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Tag / name / group (optional)</label>
              <input value={animalRef} onChange={e => setAnimalRef(e.target.value)} maxLength={80} placeholder="e.g. Brown cow, Pen 2"
                className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
            </div>
          </div>
        </section>
        <section style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none' }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>{cfg.title}</div>
          <div className="space-y-3">
            {cfg.fields.map(f => <Field key={f.k} f={f} val={vals[f.k] ?? ''} onChange={(v) => setV(f.k, v)} err={errs[f.k]} />)}
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-3 rounded-md border text-base" style={{ background: '#fff', borderColor: errs.date ? C.red : C.border }} />
            </div>
            {(cfg.more.length > 0 || true) && (
              <button type="button" onClick={() => setMore(m => !m)} className="text-sm font-medium" style={{ color: C.green }}>
                {more ? '− Less detail' : '+ More detail'}
              </button>
            )}
            {more && (
              <div className="space-y-3">
                {cfg.more.map(f => <Field key={f.k} f={f} val={vals[f.k] ?? ''} onChange={(v) => setV(f.k, v)} err={errs[f.k]} />)}
                <div>
                  <label className="block text-xs mb-1" style={{ color: C.muted }}>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="w-full px-3 py-2 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }} />
                </div>
              </div>
            )}
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {mutation.isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>{mutation.error?.message || 'Submit failed.'}</div>}
        <button onClick={submit} disabled={!ready || mutation.isPending || loading} className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: (!ready || mutation.isPending) ? '#A8C997' : C.green, color: '#fff', opacity: (!ready || mutation.isPending) ? 0.7 : 1 }}>
          {mutation.isPending ? 'Logging…' : cfg.verb}
        </button>
      </div>
    </div>
  );
}

export default function LivestockEventNew() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

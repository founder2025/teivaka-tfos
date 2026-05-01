/**
 * PoultryDashboard — Phase 6.7-1. Read-only KPI + recent events + per-flock cards.
 *
 * Single GET /api/v1/poultry/dashboard call. Defensive extractList helper.
 * Per-page QueryClientProvider wrap.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const C = { soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000', red: '#A32D2D', border: '#E6DED0', muted: '#8A8678' };

const EVENT_LABELS = {
  EGGS_COLLECTED: 'Eggs collected',
  EGGS_SOLD: 'Eggs sold',
  FLOCK_PLACED: 'Flock placed',
  MORTALITY_LOGGED: 'Mortality',
  VACCINATION_GIVEN: 'Vaccination',
  FEED_RECEIVED: 'Feed delivery',
  WEIGHT_CHECK: 'Weight check',
  BIRD_REPLACEMENT: 'Birds added',
  BIRDS_SOLD: 'Birds sold',
};

function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return then.toLocaleDateString();
}

function eventSummary(ev) {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case 'EGGS_COLLECTED': return `${p.qty_eggs || 0} eggs`;
    case 'EGGS_SOLD': return `${p.qty_eggs || 0} eggs sold for FJD ${p.total_revenue_fjd || 0}`;
    case 'MORTALITY_LOGGED': return `${p.qty_dead || 0} died (${p.cause || 'unknown'})`;
    case 'VACCINATION_GIVEN': return `${p.qty_doses || ''} doses, ${p.route || ''}`;
    case 'FEED_RECEIVED': return `${p.qty_kg || 0}kg received${p.cost_fjd ? `, FJD ${p.cost_fjd}` : ''}`;
    case 'WEIGHT_CHECK': return `Avg ${((p.avg_weight_g || 0) / 1000).toFixed(2)}kg (n=${p.sample_size || 0})`;
    case 'BIRD_REPLACEMENT': return `+${p.qty_added || 0} birds (${p.reason || ''})`;
    case 'BIRDS_SOLD': return `${p.qty_sold || 0} ${p.sale_type || ''} for FJD ${p.total_revenue_fjd || 0}`;
    case 'FLOCK_PLACED': return `${p.placed_count || 0} ${p.flock_type || ''} placed`;
    default: return '';
  }
}

function PoultryDashboardInner() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/poultry/dashboard');
        if (cancelled) return;
        setData(res?.data || null);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load dashboard');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const kpis = data?.kpis || {};
  const events = data?.recent_events || [];
  const flocks = data?.flock_cards || [];

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Back</button>
        <h1 className="text-base font-semibold">Poultry</h1>
        <div className="w-12" />
      </div>

      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        {loading && <div className="text-sm" style={{ color: C.muted }}>Loading…</div>}
        {error && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI tiles */}
            <section>
              <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>This week</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  <div className="text-xs" style={{ color: C.muted }}>Active flocks</div>
                  <div className="text-2xl font-semibold mt-1">{kpis.active_flocks}</div>
                </div>
                <div className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  <div className="text-xs" style={{ color: C.muted }}>Total birds</div>
                  <div className="text-2xl font-semibold mt-1">{kpis.total_birds}</div>
                </div>
                <div className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  <div className="text-xs" style={{ color: C.muted }}>Eggs (7d)</div>
                  <div className="text-2xl font-semibold mt-1">{kpis.eggs_this_week}</div>
                </div>
                <div className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  <div className="text-xs" style={{ color: C.muted }}>Mortality</div>
                  <div className="text-2xl font-semibold mt-1" style={{ color: kpis.mortality_rate_pct_7d > 5 ? C.red : C.soil }}>
                    {kpis.mortality_rate_pct_7d}%
                  </div>
                </div>
                <div className="col-span-2 px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  <div className="text-xs" style={{ color: C.muted }}>Revenue (7d)</div>
                  <div className="text-2xl font-semibold mt-1" style={{ color: C.green }}>FJD {kpis.revenue_fjd_this_week.toFixed(2)}</div>
                </div>
              </div>
            </section>

            {/* Per-flock cards */}
            <section>
              <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Active flocks</div>
              {flocks.length === 0 ? (
                <div className="text-sm py-4 text-center" style={{ color: C.muted }}>
                  No active flocks. Tap (+) on Farm to add one.
                </div>
              ) : (
                <div className="space-y-2">
                  {flocks.map(f => (
                    <div key={f.flock_id} className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{f.flock_label}</div>
                          <div className="text-xs mt-1" style={{ color: C.muted }}>
                            {f.flock_id} · {f.flock_type} · {f.lifecycle_status}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">{f.current_count}</div>
                          <div className="text-xs" style={{ color: C.muted }}>/ {f.placed_count} birds</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
                        <div>
                          <div className="text-xs" style={{ color: C.muted }}>Day</div>
                          <div className="text-sm font-medium">{f.days_since_placed}</div>
                        </div>
                        <div>
                          <div className="text-xs" style={{ color: C.muted }}>Eggs (7d)</div>
                          <div className="text-sm font-medium">{f.eggs_this_week}</div>
                        </div>
                        <div>
                          <div className="text-xs" style={{ color: C.muted }}>Lost (7d)</div>
                          <div className="text-sm font-medium" style={{ color: f.mortality_this_week > 0 ? C.red : C.soil }}>
                            {f.mortality_this_week}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent events */}
            <section>
              <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Recent activity</div>
              {events.length === 0 ? (
                <div className="text-sm py-4 text-center" style={{ color: C.muted }}>No events yet.</div>
              ) : (
                <div className="space-y-1">
                  {events.map(ev => (
                    <div key={ev.event_id} className="px-3 py-2 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{EVENT_LABELS[ev.event_type] || ev.event_type}</div>
                        <div className="text-xs" style={{ color: C.muted }}>{formatRelativeTime(ev.occurred_at)}</div>
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>{eventSummary(ev)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function PoultryDashboard() {
  return <QueryClientProvider client={queryClient}><PoultryDashboardInner /></QueryClientProvider>;
}

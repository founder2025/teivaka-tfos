/**
 * PoultryCompliance — Phase 6.6-3.
 * Surfaces active sale blocks per flock, upcoming clearances, recent audit.
 * Read-only page; all state changes happen via /farm/poultry/health/new etc.
 */
import { useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});
const C = { soil: 'var(--soil)', cream: 'var(--cream)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', border: '#E6DED0', muted: 'var(--muted)' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtRelativeDays(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function ActiveBlockCard({ block, navigate }) {
  const isVaccine = block.block_type === 'vaccine_withholding';
  const isHealth = block.block_type === 'severe_health';
  const accentColor = isHealth ? C.red : C.amber;
  return (
    <div className="rounded-md border p-4" style={{ background: '#fff', borderColor: accentColor, borderLeftWidth: 4 }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>{block.flock_id}</div>
          <div className="text-xs uppercase tracking-wide mt-1" style={{ color: accentColor }}>
            {isVaccine ? '◷ Vaccine withholding' : '⚠ Severe health'}
          </div>
        </div>
      </div>
      {isVaccine && (
        <div className="text-sm space-y-1" style={{ color: C.soil }}>
          <div><strong>Vaccine:</strong> {block.vaccine_name || '(unknown)'}</div>
          <div><strong>Given:</strong> {fmtDate(block.vaccinated_at)}</div>
          {block.eggs_clear_at && <div>Egg sales clear: <strong>{fmtDate(block.eggs_clear_at)}</strong> ({fmtRelativeDays(block.eggs_clear_at)})</div>}
          {block.meat_clear_at && <div>Meat sales clear: <strong>{fmtDate(block.meat_clear_at)}</strong> ({fmtRelativeDays(block.meat_clear_at)})</div>}
        </div>
      )}
      {isHealth && (
        <div className="text-sm space-y-1" style={{ color: C.soil }}>
          <div><strong>Observed:</strong> {fmtDate(block.observed_at)}</div>
          {Array.isArray(block.symptoms) && block.symptoms.length > 0 && <div><strong>Symptoms:</strong> {block.symptoms.join(', ')}</div>}
          {block.qty_affected != null && <div><strong>Birds affected:</strong> {block.qty_affected}</div>}
          <div className="mt-2"><strong>Blocks:</strong> egg sales, bird sales</div>
          <button
            onClick={() => navigate(`/farm/poultry/health/new?flock_id=${encodeURIComponent(block.flock_id)}&prefill_severity=CLEARED`)}
            className="mt-3 px-3 py-2 rounded-md text-sm font-medium"
            style={{ background: C.green, color: '#fff' }}
          >
            Log CLEARED →
          </button>
        </div>
      )}
    </div>
  );
}

function Inner() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['poultry-compliance'],
    queryFn: async () => {
      const res = await apiClient.get('/poultry/compliance');
      return res.data?.data || res.data || res;
    },
  });

  const summary = data?.summary || { active_block_count: 0, flocks_blocked: 0, upcoming_count: 0, recent_audit_count: 0 };
  const activeBlocks = data?.active_blocks || [];
  const upcoming = data?.upcoming_clearances || [];
  const recentAudit = data?.recent_audit || [];

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm')} className="text-sm" style={{ color: C.muted }}>← Back</button>
        <h1 className="text-base font-semibold">Compliance</h1>
        <button onClick={() => refetch()} className="text-sm" style={{ color: C.muted }}>↻</button>
      </div>
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-6">
        {isLoading && <div className="text-sm text-center py-12" style={{ color: C.muted }}>Loading compliance state…</div>}
        {isError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: '#FDECEA', color: C.red, border: `1px solid ${C.red}` }}>Failed to load compliance data: {error?.message}</div>}
        {!isLoading && !isError && (
          <>
            {activeBlocks.length === 0 ? (
              <div className="rounded-md border p-4 flex items-center gap-3" style={{ background: '#E8F0E2', borderColor: C.green }}>
                <div className="text-3xl" style={{ color: C.green }}>✓</div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.soil }}>All flocks clear</div>
                  <div className="text-xs" style={{ color: C.muted }}>No active compliance blocks. Sales unrestricted across all flocks.</div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border p-4" style={{ background: '#FFF8F0', borderColor: C.amber }}>
                <div className="text-sm font-semibold mb-1" style={{ color: C.soil }}>
                  {summary.active_block_count} active block{summary.active_block_count !== 1 ? 's' : ''} on {summary.flocks_blocked} flock{summary.flocks_blocked !== 1 ? 's' : ''}
                </div>
                <div className="text-xs" style={{ color: C.muted }}>Sales attempts on listed flocks will be blocked.</div>
              </div>
            )}

            {activeBlocks.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: C.muted }}>Active blocks</h2>
                <div className="space-y-3">
                  {activeBlocks.map((b, i) => <ActiveBlockCard key={`${b.flock_id}-${b.block_type}-${i}`} block={b} navigate={navigate} />)}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: C.muted }}>Clearing within 14 days</h2>
                <div className="rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  {upcoming.map((u, i) => (
                    <div key={i} className={`px-4 py-3 ${i < upcoming.length - 1 ? 'border-b' : ''}`} style={{ borderColor: C.border }}>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium" style={{ color: C.soil }}>{u.flock_id}</div>
                          <div className="text-xs" style={{ color: C.muted }}>{u.vaccine_name} · {u.sale_kind} sales</div>
                        </div>
                        <div className="text-right">
                          <div style={{ color: C.soil }}>{fmtDate(u.clear_at)}</div>
                          <div className="text-xs" style={{ color: C.muted }}>{fmtRelativeDays(u.clear_at)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {recentAudit.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: C.muted }}>Recent block attempts</h2>
                <div className="rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
                  {recentAudit.map((a, i) => (
                    <div key={i} className={`px-4 py-3 ${i < recentAudit.length - 1 ? 'border-b' : ''}`} style={{ borderColor: C.border }}>
                      <div className="flex items-start justify-between text-sm">
                        <div className="flex-1">
                          <div className="font-medium" style={{ color: C.soil }}>{a.flock_id || '(unknown flock)'}</div>
                          <div className="text-xs" style={{ color: C.muted }}>
                            Attempted {a.blocked_event_type} · {a.block_reason === 'severe_health_observation' ? 'severe health block' : 'vaccine withholding'}
                          </div>
                        </div>
                        <div className="text-xs text-right" style={{ color: C.muted }}>{fmtDate(a.occurred_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeBlocks.length === 0 && upcoming.length === 0 && recentAudit.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: C.muted }}>
                No compliance activity yet. Active blocks, upcoming clearances, and audit history will appear here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PoultryCompliance() {
  return <QueryClientProvider client={queryClient}><Inner /></QueryClientProvider>;
}

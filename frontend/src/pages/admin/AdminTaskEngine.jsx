/**
 * AdminTaskEngine.jsx — /admin/task-engine
 *
 * Task-engine health (cross-tenant). One observable view answering "is every
 * feeder alive, and is anything malformed?" Reads GET /admin/task-engine
 * (ADMIN-only). Per-source counts + last-produced/last-completed timestamps act
 * as feeder + worker liveness; invalid_rows surfaces orphaned/malformed tasks.
 * Pure observability — no writes. Dark admin chrome to match the other admin pages.
 */
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

// The feeders the platform expects to be alive. Anything in by_source but not
// here still renders (unknown source). Anything here but missing from by_source
// shows as "never produced" — a silent-feeder signal.
const KNOWN_SOURCES = [
  "automation", "decision", "weather", "rotation",
  "compliance", "cash", "market", "manual", "tis",
];

function ago(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function Stat({ label, value, tone }) {
  const color = tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

export default function AdminTaskEngine() {
  const [state, setState] = useState("loading"); // loading|ready|error
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await fetch("/api/v1/admin/task-engine", { headers: authHeader() });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bySource = data?.by_source || [];
  const seen = new Set(bySource.map((r) => r.source_module));
  // Merge known feeders so silent ones are visible as "never produced".
  const rows = [
    ...bySource,
    ...KNOWN_SOURCES.filter((s) => !seen.has(s)).map((s) => ({
      source_module: s, total: 0, open: 0, overdue: 0, completed: 0,
      last_created: null, last_completed: null, _silent: true,
    })),
  ].sort((a, b) => a.source_module.localeCompare(b.source_module));

  const totals = data?.totals || {};
  const invalid = data?.invalid_rows || 0;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">Task Engine Health</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Cross-tenant feeder liveness · last-produced timestamps · malformed-row check
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.generated_at && (
            <span className="text-xs text-gray-500">as of {ago(data.generated_at) || "now"}</span>
          )}
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-emerald-400 hover:brightness-110"
          >
            Refresh
          </button>
        </div>
      </div>

      {state === "error" && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-center">
          <p className="text-sm font-semibold text-white">Couldn't load task-engine health</p>
          <p className="text-xs text-gray-400 mt-1">Reads /admin/task-engine (ADMIN). Retry below.</p>
          <button onClick={load} className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:brightness-95">Retry</button>
        </div>
      )}

      {state === "loading" && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-10 text-center text-sm text-gray-400">
          Loading task-engine health…
        </div>
      )}

      {state === "ready" && (
        <>
          {/* Totals strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="Open" value={totals.open ?? 0} tone="ok" />
            <Stat label="Overdue" value={totals.overdue ?? 0} tone={totals.overdue > 0 ? "warn" : "ok"} />
            <Stat label="Completed" value={totals.completed ?? 0} tone="ok" />
            <Stat label="Skipped" value={totals.skipped ?? 0} tone="ok" />
            <Stat label="Expired" value={totals.expired ?? 0} tone="ok" />
            <Stat label="Total ever" value={totals.total ?? 0} tone="ok" />
          </div>

          {/* Invalid rows banner */}
          {invalid > 0 ? (
            <div className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 mb-4 flex items-center gap-3">
              <span className="text-2xl font-bold text-amber-400">{invalid}</span>
              <div>
                <div className="text-sm font-semibold text-amber-200">Malformed / orphaned task rows</div>
                <div className="text-xs text-amber-300/80">
                  Rows with null imperative, null farm_id, null source_module, or an invalid status. These should be 0 — investigate the producing feeder.
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2.5 mb-4 text-sm text-emerald-300">
              ✓ No malformed or orphaned task rows. Every task is well-formed and farm-scoped.
            </div>
          )}

          {/* Per-source table */}
          <div className="rounded-xl overflow-hidden border border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Feeder</th>
                  <th className="text-right px-3 py-2.5 font-medium">Open</th>
                  <th className="text-right px-3 py-2.5 font-medium">Overdue</th>
                  <th className="text-right px-3 py-2.5 font-medium">Completed</th>
                  <th className="text-right px-3 py-2.5 font-medium">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last produced</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source_module} className="border-t border-gray-800 text-gray-200">
                    <td className="px-4 py-2.5 font-medium">
                      {r.source_module}
                      {r._silent && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                          never produced
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{r.open}</td>
                    <td className={`px-3 py-2.5 text-right ${r.overdue > 0 ? "text-amber-400 font-semibold" : ""}`}>{r.overdue}</td>
                    <td className="px-3 py-2.5 text-right">{r.completed}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{r.total}</td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {r.last_created ? <span title={r.last_created}>{ago(r.last_created)}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {r.last_completed ? <span title={r.last_completed}>{ago(r.last_completed)}</span> : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            "Last produced" is a liveness proxy for each feeder — a feeder that should run daily but shows days ago is a silent-failure signal.
            Counts are platform-wide across every tenant.
          </p>

          {/* External alert delivery log (P3b) */}
          <NotificationsCard n={data?.notifications} />
        </>
      )}
    </AdminLayout>
  );
}

function NotificationsCard({ n }) {
  const channels = n?.by_channel || [];
  const everSent = (n?.totals?.total || 0) > 0;
  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold text-white mb-2">External alert delivery (WhatsApp / email)</h2>

      {!n?.enabled ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3 text-sm text-gray-400">
          Delivery log table not present in this environment yet (migration 086 not applied).
        </div>
      ) : (
        <>
          {/* PR.2 banner */}
          {!everSent ? (
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3 mb-3 text-sm text-gray-300">
              No alerts dispatched yet. Per <strong>PR.2</strong> the scheduled sweep stays off until a test alert is
              receipt-verified — fire <code className="text-emerald-400">send_task_alert_test</code> and confirm receipt in the real inbox/WhatsApp.
            </div>
          ) : !n?.last_receipt_confirmed ? (
            <div className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 mb-3 text-sm text-amber-200">
              Alerts have been sent, but <strong>no receipt has been confirmed</strong> (PR.2). Sender-side success is not delivery —
              confirm the message landed in a real inbox and set <code>receipt_confirmed_at</code> before trusting this path.
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2.5 mb-3 text-sm text-emerald-300">
              ✓ Receipt confirmed {ago(n.last_receipt_confirmed)} — alert path is receipt-verified (PR.2).
            </div>
          )}

          <div className="rounded-xl overflow-hidden border border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                  <th className="text-right px-3 py-2.5 font-medium">Sent</th>
                  <th className="text-right px-3 py-2.5 font-medium">Mock</th>
                  <th className="text-right px-3 py-2.5 font-medium">Failed</th>
                  <th className="text-right px-3 py-2.5 font-medium">Receipt ✓</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last sent</th>
                </tr>
              </thead>
              <tbody>
                {channels.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-3 text-gray-500 text-center">No deliveries logged.</td></tr>
                ) : channels.map((c) => (
                  <tr key={c.channel} className="border-t border-gray-800 text-gray-200">
                    <td className="px-4 py-2.5 font-medium">{c.channel}</td>
                    <td className="px-3 py-2.5 text-right">{c.sent}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{c.mock}</td>
                    <td className={`px-3 py-2.5 text-right ${c.failed > 0 ? "text-red-400 font-semibold" : ""}`}>{c.failed}</td>
                    <td className={`px-3 py-2.5 text-right ${c.receipt_confirmed > 0 ? "text-emerald-400" : "text-gray-500"}`}>{c.receipt_confirmed}</td>
                    <td className="px-4 py-2.5 text-gray-400">{c.last_sent ? ago(c.last_sent) : <span className="text-gray-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            "Sent" = provider accepted the request (HTTP 200 / message id). It is <strong>not</strong> proof of delivery — only a confirmed
            receipt counts (PR.2). Last test fired: {n?.last_test ? ago(n.last_test) : "never"}.
          </p>
        </>
      )}
    </div>
  );
}

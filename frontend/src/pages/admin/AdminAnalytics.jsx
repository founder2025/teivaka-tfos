/**
 * AdminAnalytics.jsx — /admin/analytics
 *
 * Platform growth line graph, signups by country, D1/D7/D30 retention,
 * engagement metrics (posts/comments/AI queries/KB reads per day),
 * subscription breakdown.
 */

import { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-white"}`}>{value ?? "—"}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SimpleBar({ data, labelKey, valueKey, color }) {
  if (!data || data.length === 0) return (
    <div className="text-gray-500 text-xs text-center py-6">No data available</div>
  );
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div className="space-y-1.5">
      {data.slice(0, 10).map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20 truncate shrink-0">{row[labelKey]}</span>
          <div className="flex-1 bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${color || "bg-amber-500"}`}
              style={{ width: `${max > 0 ? (row[valueKey] / max) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 w-8 text-right">{row[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/admin/analytics?days=${days}`, { headers: authHeader() })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  const totalSignups = data?.signups_daily?.reduce((s, d) => s + d.count, 0) || 0;
  const totalTIS = data?.tis_queries_daily?.reduce((s, d) => s + d.count, 0) || 0;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Platform Analytics</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                days === d ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-gray-700 text-gray-400 hover:text-white"
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label={`New Signups (${days}d)`}  value={totalSignups.toLocaleString()} color="text-emerald-400" />
        <MetricCard label={`TIS Queries (${days}d)`}  value={totalTIS.toLocaleString()}    color="text-cyan-400" />
        <MetricCard label="D1 Retention"  value="—"  sub="Requires session table" />
        <MetricCard label="D30 Retention" value="—"  sub="Requires session table" />
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-16">Loading analytics…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Signups daily */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">Daily Signups ({days}d)</h3>
            {data?.signups_daily?.length > 0 ? (
              <div className="flex items-end gap-1 h-24">
                {data.signups_daily.slice(-30).map((d, i) => {
                  const max = Math.max(...data.signups_daily.map(x => x.count));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end"
                      title={`${d.day}: ${d.count}`}>
                      <div className="w-full bg-amber-500 rounded-t"
                        style={{ height: `${max > 0 ? (d.count / max) * 80 : 2}px`, minHeight: "2px" }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500 text-xs text-center py-8">No signup data in range</div>
            )}
          </div>

          {/* Signups by country */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">Signups by Country</h3>
            <SimpleBar data={data?.signups_by_country} labelKey="country" valueKey="count" color="bg-emerald-500" />
          </div>

          {/* TIS queries daily */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">AI Queries per Day</h3>
            {data?.tis_queries_daily?.length > 0 ? (
              <div className="flex items-end gap-1 h-24">
                {data.tis_queries_daily.slice(-30).map((d, i) => {
                  const max = Math.max(...data.tis_queries_daily.map(x => x.count));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end"
                      title={`${d.day}: ${d.count}`}>
                      <div className="w-full bg-cyan-500 rounded-t"
                        style={{ height: `${max > 0 ? (d.count / max) * 80 : 2}px`, minHeight: "2px" }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500 text-xs text-center py-8">No TIS data in range</div>
            )}
          </div>

          {/* Subscription breakdown */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="font-semibold text-gray-200 mb-3">Subscription Breakdown</h3>
            <div className="space-y-2">
              {[
                { tier: "FREE",         color: "bg-gray-500" },
                { tier: "BASIC",        color: "bg-emerald-500" },
                { tier: "PROFESSIONAL", color: "bg-amber-500" },
                { tier: "ENTERPRISE",   color: "bg-blue-500" },
              ].map(({ tier, color }) => (
                <div key={tier} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="text-xs text-gray-300 w-28">{tier}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-2" />
                  <span className="text-xs text-gray-500">—</span>
                </div>
              ))}
              <p className="text-xs text-gray-600 mt-2">Connect to tenants.subscription_tier for live data</p>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

/**
 * AdminDashboard.jsx — /admin
 *
 * Layout:
 *   Row 1: Live stats strip (6 counters)
 *   Row 2: Alert cards (4 clickable)
 *   Row 3: Activity feed (with admin action buttons) + right panel charts
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

function StatCard({ label, value, icon, color }) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-3`}>
      <div className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? "—"}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function AlertCard({ label, count, icon, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-gray-800 border rounded-xl p-4 text-left hover:scale-105 transition-transform w-full ${
        count > 0 ? `border-${color}-500` : "border-gray-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span className={`text-2xl font-bold ${count > 0 ? `text-${color}-400` : "text-gray-500"}`}>
          {count ?? 0}
        </span>
      </div>
      <p className="text-sm text-gray-300 mt-1">{label}</p>
    </button>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/admin/dashboard", { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        setAlerts(d.alerts);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-white mb-5">Platform Dashboard</h1>

      {/* Live stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Total Farmers"    value={stats?.total_farmers}    icon="👨‍🌾" color="bg-emerald-900" />
        <StatCard label="Online Now"       value={stats?.online_now ?? "—"} icon="🟢" color="bg-green-900" />
        <StatCard label="New Today"        value={stats?.new_today}         icon="✨" color="bg-blue-900" />
        <StatCard label="Posts Today"      value={stats?.posts_today ?? "—"} icon="💬" color="bg-purple-900" />
        <StatCard label="AI Queries Today" value={stats?.ai_queries_today}  icon="🤖" color="bg-cyan-900" />
        <StatCard label="Farms Active"     value={stats?.farms_active}      icon="🌱" color="bg-lime-900" />
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <AlertCard label="Flagged Posts"    count={alerts?.flagged_posts}    icon="🚩" color="red"    onClick={() => navigate("/admin/content")} />
        <AlertCard label="Pending Approvals" count={alerts?.pending_kb}      icon="⏳" color="yellow" onClick={() => navigate("/admin/content")} />
        <AlertCard label="Reported Users"   count={alerts?.reported_users ?? 0} icon="⚠️" color="orange" onClick={() => navigate("/admin/users")} />
        <AlertCard label="Support Requests" count={alerts?.support_requests ?? 0} icon="🆘" color="blue" onClick={() => navigate("/admin/users")} />
      </div>

      {/* Main + right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity feed */}
        <div className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h2 className="font-semibold text-gray-200 mb-3">Recent Activity</h2>
          {loading ? (
            <div className="text-gray-500 text-sm py-8 text-center">Loading feed…</div>
          ) : (
            <div className="text-gray-400 text-sm py-8 text-center">
              Activity feed — connect community_posts table to populate
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Signup Trend (30d)</h3>
            <div className="text-gray-500 text-xs text-center py-6">
              Chart renders after analytics data loads
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Top Crops</h3>
            <div className="text-gray-500 text-xs text-center py-6">
              Crop data from harvest_log
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

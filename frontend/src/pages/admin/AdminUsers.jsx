/**
 * AdminUsers.jsx — /admin/users
 *
 * Full paginated user table with:
 *   - Filter bar (All / Online / New / Suspended / Banned / By Country)
 *   - Search box
 *   - Per-row actions: View, Message, Change Rank, Suspend, Ban, Verify
 *   - Bulk select → Suspend / Export CSV
 */

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

const STATUS_FILTERS = ["all", "active", "pending", "suspended", "banned"];

function StatusBadge({ status, verified }) {
  if (!verified) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900 text-yellow-300">Unverified</span>;
  const map = {
    active:    "bg-emerald-900 text-emerald-300",
    suspended: "bg-orange-900 text-orange-300",
    banned:    "bg-red-900 text-red-300",
  };
  const label = status || "active";
  return <span className={`px-2 py-0.5 rounded-full text-xs ${map[label] || map.active}`}>{label}</span>;
}

function RoleBadge({ role }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300 uppercase tracking-wide">
      {role}
    </span>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      page_size: 25,
      status_filter: filter,
      ...(search ? { search } : {}),
    });
    const res = await fetch(`/api/v1/admin/users?${params}`, { headers: authHeader() });
    const data = await res.json();
    setUsers(data.users || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, filter, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function userAction(userId, action) {
    if (!window.confirm(`${action} this user?`)) return;
    await fetch(`/api/v1/admin/users/${userId}/${action}`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Admin action" }),
    });
    fetchUsers();
  }

  async function verifyUser(userId) {
    await fetch(`/api/v1/admin/users/${userId}/verify`, {
      method: "POST",
      headers: authHeader(),
    });
    fetchUsers();
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.user_id)));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Users <span className="text-gray-500 text-sm font-normal ml-1">({total.toLocaleString()})</span></h1>
        <button
          disabled={selected.size === 0}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV ({selected.size})
        </button>
      </div>

      {/* Filter + search bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-amber-500 text-amber-950" : "text-gray-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wide">
                <th className="pl-4 pr-2 py-3 text-left w-8">
                  <input type="checkbox" checked={selected.size === users.length && users.length > 0}
                    onChange={selectAll} className="accent-amber-500" />
                </th>
                <th className="px-3 py-3 text-left">User</th>
                <th className="px-3 py-3 text-left">Role</th>
                <th className="px-3 py-3 text-left">Country</th>
                <th className="px-3 py-3 text-left">Joined</th>
                <th className="px-3 py-3 text-left">Last Active</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-500">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-500">No users found</td></tr>
              ) : users.map((u) => (
                <tr key={u.user_id} className="border-b border-gray-700/50 hover:bg-gray-750 transition-colors">
                  <td className="pl-4 pr-2 py-3">
                    <input type="checkbox" checked={selected.has(u.user_id)}
                      onChange={() => toggleSelect(u.user_id)} className="accent-amber-500" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center text-xs font-bold text-emerald-200">
                        {(u.first_name?.[0] || u.full_name?.[0] || "?").toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-medium">{u.full_name}</p>
                        <p className="text-gray-500 text-xs">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-3 py-3 text-gray-300">{u.country || "—"}</td>
                  <td className="px-3 py-3 text-gray-400 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-400 text-xs">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={u.is_active ? "active" : "suspended"} verified={u.email_verified} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {!u.email_verified && (
                        <button onClick={() => verifyUser(u.user_id)}
                          className="text-xs px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 text-blue-200">
                          Verify
                        </button>
                      )}
                      <button onClick={() => userAction(u.user_id, "suspend")}
                        className="text-xs px-2 py-1 rounded bg-orange-900 hover:bg-orange-800 text-orange-300">
                        Suspend
                      </button>
                      <button onClick={() => userAction(u.user_id, "ban")}
                        className="text-xs px-2 py-1 rounded bg-red-900 hover:bg-red-800 text-red-300">
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
          <span>Showing {users.length} of {total.toLocaleString()} users</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:text-white">
              ← Prev
            </button>
            <span className="px-3 py-1">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:text-white">
              Next →
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

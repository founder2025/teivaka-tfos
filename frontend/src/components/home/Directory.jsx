/**
 * Directory.jsx — cross-country people directory for the Home pillar.
 * Open discovery: search anyone (/api/v1/community/people) and follow/add them
 * (one-way, no consent). Renders inside .tfp. Real data, honest-empty.
 */
import { useEffect, useState } from "react";
import { Search, BadgeCheck, UserPlus, UserCheck } from "lucide-react";

const API = "/api/v1/community";
// Shared wrapper: token auto-refresh on 401 + truthful errors.
import { getJSON, send } from "../../utils/api";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

const PROF_LABEL = { farmer: "Farmer", buyer: "Buyer", banker: "Banker", business: "Business", service_provider: "Service Provider" };
const initials = (name) => (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

export default function Directory() {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);

  const load = (search) => {
    setPeople(null);
    getJSON(`${API}/people${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then((r) => setPeople(r.data || [])).catch(() => setPeople([]));
  };
  useEffect(() => { load(""); }, []);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); }, [q]);

  const toggleFollow = async (p) => {
    const next = !p.is_following;
    setPeople((list) => list.map((x) => x.user_id === p.user_id ? { ...x, is_following: next } : x));
    try {
      await send(next ? "POST" : "DELETE", `${API}/follow/${p.user_id}`);
      toast(next ? `Following ${p.full_name} ✓` : `Unfollowed ${p.full_name}`, "success");
    } catch (e) {
      setPeople((list) => list.map((x) => x.user_id === p.user_id ? { ...x, is_following: p.is_following } : x));
      toast(`Couldn't ${next ? "follow" : "unfollow"}: ${e.message || e}`, "error");
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
        <Search size={15} style={{ color: "var(--muted)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farmers, buyers, suppliers, bankers…"
          style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", color: "var(--soil)" }} />
      </div>

      {people == null ? <div style={{ color: "var(--muted)", padding: 14 }}>Loading…</div>
        : people.length === 0 ? <div style={{ color: "var(--muted)", padding: 14 }}>No people found{q ? ` for "${q}"` : " yet"}. As more users join your country's ecosystem, they appear here.</div>
        : (
          <table className="data-table">
            <tbody>
              <tr><th>Name</th><th>Type</th><th></th></tr>
              {people.map((p) => (
                <tr key={p.user_id}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span className="avatar-circle" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(p.full_name)}</span>
                      <span style={{ fontWeight: 600, color: "var(--soil)" }}>{p.full_name}</span>
                      {p.verified && <BadgeCheck size={14} style={{ color: "var(--green)" }} />}
                    </span>
                  </td>
                  <td><span className="pill grey">{PROF_LABEL[p.profession] || p.profession}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <button className={`btn btn-sm ${p.is_following ? "btn-secondary" : "btn-primary"}`} onClick={() => toggleFollow(p)}>
                      {p.is_following ? <><UserCheck size={13} />Following</> : <><UserPlus size={13} />Follow</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

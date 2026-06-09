/**
 * FarmSettings.jsx — /farm/settings — replaces the farm Settings gap.
 *
 * The prototype's coreSettingsView: Farm setup / Team / Preferences / Plan /
 * Audit. Real where data exists, honest links elsewhere:
 *   Farm setup  — GET /api/v1/farms (name, location, area) → Enterprises link
 *   Team        — GET /api/v1/workers count → Manage (Labor)
 *   Preferences — area unit persists to localStorage (real); language &
 *                 notifications managed in account (/me/settings) — not faked
 *   Plan        — subscription tier from the session token (real)
 *   Audit       — GET /me/chain-status (real chain integrity) → Farm History
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../utils/auth";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD",
  amber: "#BF9000", red: "#B00020", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

function Card({ title, sub, children }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="font-semibold" style={{ color: C.soil }}>{title}</div>
      {sub && <div className="text-xs mb-2" style={{ color: C.muted }}>{sub}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Row({ label, value, action }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0" style={{ borderColor: C.border }}>
      <div className="min-w-0">
        <div className="text-sm" style={{ color: C.soil }}>{label}</div>
        {value && <div className="text-xs truncate" style={{ color: C.muted }}>{value}</div>}
      </div>
      {action}
    </div>
  );
}
function LinkBtn({ children, onClick, primary }) {
  return <button onClick={onClick} className="text-sm font-semibold px-3 py-1.5 rounded-lg shrink-0"
    style={primary ? { background: C.greenDk, color: "#fff" } : { border: `1px solid ${C.border}`, color: C.soil, background: "#fff" }}>{children}</button>;
}

export default function FarmSettings() {
  const navigate = useNavigate();
  const farmId = (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || "";
  const [farm, setFarm] = useState(null);
  const [workers, setWorkers] = useState(null);
  const [chain, setChain] = useState(null);
  const [areaUnit, setAreaUnit] = useState(localStorage.getItem("tfos_area_unit") || "ha");
  const user = getCurrentUser() || {};
  const tier = user.tier || user.subscription_tier || "—";

  useEffect(() => {
    (async () => {
      const [f, w, c] = await Promise.allSettled([
        getJSON("/api/v1/farms"),
        farmId ? getJSON(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`) : Promise.resolve(null),
        getJSON("/api/v1/me/chain-status"),
      ]);
      const fl = f.status === "fulfilled" ? (f.value?.data?.farms || f.value?.data || []) : [];
      setFarm((Array.isArray(fl) ? fl : []).find((x) => x.farm_id === farmId) || (Array.isArray(fl) ? fl[0] : null) || null);
      setWorkers(w.status === "fulfilled" ? (w.value?.data || []) : []);
      setChain(c.status === "fulfilled" ? (c.value?.data || null) : null);
    })();
  }, [farmId]);

  function setUnit(u) { setAreaUnit(u); localStorage.setItem("tfos_area_unit", u); }

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Settings</h1>
        <div className="text-xs mt-0.5 mb-3" style={{ color: C.muted }}>Your farm, your team, and how TFOS works for you</div>

        <div className="space-y-3">
          <Card title="Farm setup" sub="Your farm details and what you run">
            <Row label="Farm" value={farm ? [farm.farm_name, farm.location_name || farm.location_island, farm.land_area_ha != null ? `${farm.land_area_ha} ha` : null].filter(Boolean).join(" · ") : "Loading…"}
              action={<LinkBtn onClick={() => navigate("/farms")}>Manage</LinkBtn>} />
            <Row label="Enterprises" value="Crops, livestock and more"
              action={<LinkBtn onClick={() => navigate("/farm/enterprises")}>Open</LinkBtn>} />
          </Card>

          <Card title="Team" sub="Who can use this farm and what they can do">
            <Row label="Workers" value={workers == null ? "Loading…" : `${workers.length} on this farm`}
              action={<LinkBtn onClick={() => navigate("/farm/labor")}>Manage</LinkBtn>} />
            <Row label="Permissions" value="Owner: full access · Worker: log events and view tasks" />
          </Card>

          <Card title="Preferences" sub="Units, language and notifications">
            <Row label="Area units"
              action={<div className="flex gap-1">
                {[["ha", "ha"], ["acres", "acres"]].map(([v, l]) => (
                  <button key={v} onClick={() => setUnit(v)} className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: areaUnit === v ? C.greenDk : "#fff", color: areaUnit === v ? "#fff" : C.soil, border: `1px solid ${C.border}` }}>{l}</button>
                ))}
              </div>} />
            <Row label="Language & notifications" value="WhatsApp alerts, reminders, language"
              action={<LinkBtn onClick={() => navigate("/me/settings")}>Account</LinkBtn>} />
          </Card>

          <Card title="Plan & security" sub="Your subscription and account security">
            <Row label="Current plan" value={`Tier: ${tier}`}
              action={<LinkBtn onClick={() => navigate("/me/settings")}>Manage</LinkBtn>} />
            <Row label="Security" value="PIN and signed-in devices — managed in your account"
              action={<LinkBtn onClick={() => navigate("/me/settings")}>Account</LinkBtn>} />
          </Card>

          <Card title="Audit trail" sub="Every action gets a tamper-proof record">
            <Row
              label="Verification chain"
              value={chain == null ? "Checking…" : chain.integrity_ok
                ? `INTACT — ${Number(chain.events_in_chain).toLocaleString()} records, none altered`
                : `ATTENTION — ${chain.chain_break_count} break(s) in ${Number(chain.events_in_chain).toLocaleString()} records`}
              action={<LinkBtn onClick={() => navigate("/farm/history")}>Open</LinkBtn>}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

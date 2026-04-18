/**
 * FarmDashboard.jsx — /farm (Phase 4b MVP Week 1).
 *
 * MVP contents only. No decision_signals (Phase 5).
 *   • Farm name + active cycle count (GET /api/v1/farms, takes first farm)
 *   • Today card: most recent harvest + most recent field event (harvest for now;
 *     field_events endpoint not surfaced in MVP)
 *   • Primary CTA: "Record harvest" → /farm/harvest/new
 *
 * Trial chip lives in TopAppBar — do NOT duplicate here.
 * Sub-components stay at module scope to avoid input focus loss.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  amber:  "#BF9000",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Card({ title, children, className = "" }) {
  return (
    <section
      className={`bg-white rounded-2xl px-4 py-4 ${className}`}
      style={{ border: `1px solid ${C.border}` }}
    >
      {title && (
        <h2 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: C.muted }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="text-xl font-bold mt-0.5" style={{ color: C.soil }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function Skeleton({ h = 16, w = "100%" }) {
  return (
    <div
      className="rounded animate-pulse"
      style={{ background: "#EFE7D6", height: h, width: w }}
    />
  );
}

export default function FarmDashboard() {
  const [farm, setFarm]       = useState(null);   // primary farm object
  const [harvest, setHarvest] = useState(null);   // latest harvest (or null)
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [farmsRes, harvestsRes] = await Promise.all([
          fetch("/api/v1/farms", { headers: authHeaders() }),
          fetch("/api/v1/harvests?limit=1&offset=0", { headers: authHeaders() }),
        ]);

        let nextFarm = null;
        if (farmsRes.ok) {
          const body = await farmsRes.json();
          if (Array.isArray(body?.farms) && body.farms.length > 0) {
            nextFarm = body.farms[0];
          }
        }

        let nextHarvest = null;
        if (harvestsRes.ok) {
          const body = await harvestsRes.json();
          if (Array.isArray(body?.harvests) && body.harvests.length > 0) {
            nextHarvest = body.harvests[0];
          }
        }

        if (!cancelled) {
          setFarm(nextFarm);
          setHarvest(nextHarvest);
          if (!farmsRes.ok && farmsRes.status !== 404) {
            setError(`Could not load farm (HTTP ${farmsRes.status}).`);
          }
        }
      } catch (e) {
        if (!cancelled) setError(`Network error: ${e.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const farmName     = farm?.farm_name || farm?.farm_code || "My farm";
  const activeCycles = Number(farm?.active_cycles ?? 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pt-1">
        <div className="text-xs font-medium" style={{ color: C.muted }}>Your farm</div>
        <h1 className="text-2xl font-bold mt-0.5" style={{ color: C.soil }}>
          {loading ? <Skeleton h={28} w="60%" /> : farmName}
        </h1>
      </div>

      {/* Stats card */}
      <Card title="Overview">
        {loading ? (
          <div className="flex gap-6">
            <Skeleton h={40} w={90} />
            <Skeleton h={40} w={90} />
          </div>
        ) : (
          <div className="flex gap-8 flex-wrap">
            <Stat label="Active cycles" value={activeCycles} sub={activeCycles === 0 ? "No crops in the ground yet" : undefined} />
            {farm?.island && <Stat label="Island" value={farm.island} />}
            {farm?.total_area_ha != null && <Stat label="Area (ha)" value={farm.total_area_ha} />}
          </div>
        )}
      </Card>

      {/* Today card */}
      <Card title="Today">
        {loading ? (
          <div className="space-y-2">
            <Skeleton h={14} w="40%" />
            <Skeleton h={14} w="70%" />
          </div>
        ) : harvest ? (
          <div>
            <div className="text-sm font-semibold" style={{ color: C.soil }}>
              Most recent harvest
            </div>
            <div className="text-sm mt-1" style={{ color: C.soil }}>
              {harvest.gross_yield_kg != null ? Number(harvest.gross_yield_kg).toFixed(2) : "—"} kg
              {harvest.grade ? ` · Grade ${harvest.grade}` : ""}
              {harvest.destination ? ` · ${harvest.destination}` : ""}
            </div>
            <div className="text-xs mt-0.5" style={{ color: C.muted }}>
              {formatDate(harvest.harvest_date)}
              {harvest.pu_id ? ` · ${harvest.pu_id}` : ""}
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: C.muted }}>
            No harvests logged yet. Use the button below to record your first one.
          </div>
        )}
      </Card>

      {error && (
        <Card>
          <div className="text-sm" style={{ color: C.amber }}>{error}</div>
        </Card>
      )}

      {/* Primary CTA */}
      <div>
        <Link
          to="/farm/harvest/new"
          className="block w-full text-center py-3 rounded-xl font-semibold text-white transition-colors"
          style={{ background: C.green }}
        >
          Record harvest
        </Link>
      </div>
    </div>
  );
}

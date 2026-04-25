/**
 * FarmDashboard.jsx — /farm Farm Overview content.
 *
 * Day 3b-Farm rebuild (sacred §280 dispensation, in scope).
 * Layout per locked prototype + Boss decisions:
 *   1. Page title (Farm overview)
 *   2. Header row: FarmSelector (left) + ModeDropdown (right)
 *   3. Top Task banner (full width)
 *   4. 10-card metric grid (responsive auto-fit)
 *      - 4 cards have live data: Active cycles, Open tasks, Open alerts,
 *        Total area
 *      - 6 are phase-tagged stubs (Phase 5 / Phase 6) — dimmed with a corner
 *        badge
 *   5. Active cycles section: header + NewCycleButton + table
 *
 * Hydration is client-side parallel React Query (no /farms/{id}/overview
 * endpoint built today). QueryClientProvider is scoped to this page so we
 * don't have to touch FarmerShell or App.jsx.
 *
 * Sub-components stay at module scope (Standing Rule 9). Trial chip lives in
 * TopAppBar — do NOT duplicate here.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import MetricCard       from "../../components/farm/MetricCard";
import TopTaskBanner    from "../../components/farm/TopTaskBanner";
import ActiveCyclesTable from "../../components/farm/ActiveCyclesTable";
import FarmSelector     from "../../components/farm/FarmSelector";
import ModeDropdown     from "../../components/farm/ModeDropdown";
import NewCycleButton   from "../../components/farm/NewCycleButton";
import NewCycleModal    from "../../components/farm/NewCycleModal";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
  muted:  "#8A7863",
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

async function fetchFarmDetail(farmId) {
  if (!farmId) return null;
  const res = await fetch(`/api/v1/farms/${encodeURIComponent(farmId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchActiveCyclesCount(farmId) {
  if (!farmId) return 0;
  const url = `/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&cycle_status=ACTIVE`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const cycles = body?.data?.cycles ?? body?.cycles ?? [];
  return cycles.length;
}

async function fetchOpenAlerts(farmId) {
  if (!farmId) return [];
  const url = `/api/v1/alerts?farm_id=${encodeURIComponent(farmId)}&status=OPEN`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return [];
  const body = await res.json();
  return body?.data?.alerts ?? body?.alerts ?? body?.data ?? [];
}

async function fetchTasksOpenCount() {
  const res = await fetch("/api/v1/tasks/next", { headers: authHeaders() });
  if (!res.ok) return 0;
  const body = await res.json();
  return body?.data ? 1 : 0;
}

function FarmOverview() {
  const { farmId } = useCurrentFarm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycleModalOpen, setCycleModalOpen] = useState(false);

  // Auto-open the cycle modal when LogSheet's "Start cycle" tile lands
  // here via /farm?action=new-cycle. Strip the param after opening so
  // refresh / back-button doesn't keep retriggering it.
  useEffect(() => {
    if (searchParams.get("action") === "new-cycle") {
      setCycleModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCycleCreated = () => {
    // Refresh everything that depends on cycle state.
    queryClient.invalidateQueries({ queryKey: ["cycles", farmId, "ACTIVE"] });
    queryClient.invalidateQueries({ queryKey: ["cycles-count", farmId, "ACTIVE"] });
    queryClient.invalidateQueries({ queryKey: ["farm", farmId] });
    queryClient.invalidateQueries({ queryKey: ["alerts", farmId, "OPEN"] });
    queryClient.invalidateQueries({ queryKey: ["tasks-open-count"] });
    queryClient.invalidateQueries({ queryKey: ["tasks-next"] });
    queryClient.invalidateQueries({ queryKey: ["production-units", farmId] });
  };

  const farmQuery = useQuery({
    queryKey: ["farm", farmId],
    queryFn: () => fetchFarmDetail(farmId),
    enabled: !!farmId,
  });
  const cyclesCountQuery = useQuery({
    queryKey: ["cycles-count", farmId, "ACTIVE"],
    queryFn: () => fetchActiveCyclesCount(farmId),
    enabled: !!farmId,
  });
  const alertsQuery = useQuery({
    queryKey: ["alerts", farmId, "OPEN"],
    queryFn: () => fetchOpenAlerts(farmId),
    enabled: !!farmId,
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks-open-count"],
    queryFn: fetchTasksOpenCount,
  });

  const farm         = farmQuery.data;
  const activeCycles = cyclesCountQuery.data ?? 0;
  const openAlerts   = (alertsQuery.data ?? []).length;
  const openTasks    = tasksQuery.data ?? 0;
  const areaHa       = farm?.land_area_ha;

  // Live cards (full opacity).
  const liveCards = [
    {
      label:   "Active cycles",
      value:   activeCycles,
      sub:     farm?.farm_name || (activeCycles ? "On this farm" : "None planted"),
      loading: cyclesCountQuery.isLoading,
    },
    {
      label:   "Open tasks",
      value:   openTasks,
      sub:     openTasks ? "1 ranked top" : "All caught up",
      loading: tasksQuery.isLoading,
    },
    {
      label:   "Open alerts",
      value:   openAlerts,
      sub:     openAlerts ? "Compliance / agronomy" : "No open alerts",
      loading: alertsQuery.isLoading,
    },
    {
      label:   "Total area",
      value:   areaHa != null ? `${Number(areaHa).toFixed(2)} ha` : "—",
      sub:     farm?.location_island || farm?.location_name || undefined,
      loading: farmQuery.isLoading,
    },
  ];

  // Phase-stub cards (dimmed, badge in corner).
  const stubCards = [
    { label: "Today's harvest",          value: "—", sub: "kg logged today",   phase: "Phase 5" },
    { label: "This week's revenue",      value: "—", sub: "FJD inflows",       phase: "Phase 6" },
    { label: "Cash runway",              value: "—", sub: "Days until empty", phase: "Phase 6" },
    { label: "Worker attendance",        value: "—", sub: "Today's check-ins", phase: "Phase 5" },
    { label: "Yield forecast vs actual", value: "—", sub: "Last cycle delta",  phase: "Phase 5" },
    { label: "Compliance score",         value: "—", sub: "WHD adherence",     phase: "Phase 5" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>
          Farm overview
        </h1>
        <div className="text-xs mt-0.5" style={{ color: C.muted }}>
          All-in-one farm health snapshot
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FarmSelector />
        <ModeDropdown />
      </div>

      <TopTaskBanner />

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {liveCards.map((c) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={c.value}
            sub={c.sub}
            loading={c.loading}
          />
        ))}
        {stubCards.map((c) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={c.value}
            sub={c.sub}
            phase={c.phase}
          />
        ))}
      </div>

      <section
        className="bg-white rounded-2xl px-4 py-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: C.soil }}
          >
            Active cycles
          </h2>
          <NewCycleButton
            disabled={!farmId}
            onClick={() => setCycleModalOpen(true)}
          />
        </div>
        <ActiveCyclesTable farmId={farmId} />
      </section>

      <NewCycleModal
        isOpen={cycleModalOpen}
        onClose={() => setCycleModalOpen(false)}
        onCreated={() => {
          handleCycleCreated();
          setCycleModalOpen(false);
        }}
        farmId={farmId}
      />
    </div>
  );
}

export default function FarmDashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <FarmOverview />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}

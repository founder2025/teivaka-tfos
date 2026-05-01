/**
 * GroupCatalogSection.jsx — settings section for per-farm group visibility.
 *
 * Per Catalog Redesign Doctrine Amendment v2 (commit 272f513): farmers
 * toggle which of the 11 catalog groups appear in their (+) menu. Universal
 * groups (Money, Notes, Other) shown at top with 'recommended' tag; 8
 * production groups below.
 *
 * Each toggle emits exactly ONE FARM_GROUP_TOGGLED audit row via the
 * Phase 5.5b PUT /api/v1/farms/{farm_id}/active-groups endpoint.
 *
 * Optimistic UI: state flips immediately, PUT call follows, revert-on-error.
 * Plain fetch (QueryClientProvider not in scope at FarmerShell mount).
 */
import React, { useEffect, useState } from "react";
import {
  Sprout, TreeDeciduous, PawPrint, Bird, Hexagon, Fish, Trees, Sparkles,
  Banknote, BookOpen, Boxes,
} from "lucide-react";

const GROUPS_DEF = [
  // Universal (top, marked recommended)
  { key: "MONEY",       label: "Money",         Icon: Banknote,       universal: true },
  { key: "NOTES",       label: "Notes",         Icon: BookOpen,       universal: true },
  { key: "OTHER",       label: "Other",         Icon: Boxes,          universal: true },
  // Production (below)
  { key: "CROPS",       label: "Crops",         Icon: Sprout },
  { key: "PERENNIALS",  label: "Trees & vines", Icon: TreeDeciduous },
  { key: "LIVESTOCK",   label: "Livestock",     Icon: PawPrint },
  { key: "POULTRY",     label: "Poultry",       Icon: Bird },
  { key: "APICULTURE",  label: "Bees",          Icon: Hexagon },
  { key: "AQUACULTURE", label: "Fish & sea",    Icon: Fish },
  { key: "FORESTRY",    label: "Forestry",      Icon: Trees },
  { key: "SPECIALTY",   label: "Specialty",     Icon: Sparkles },
];

const C = {
  cream:   "#F8F3E9",
  green:   "#6AA84F",
  greenDk: "#3F7427",
  soil:    "#5C4033",
  border:  "#E6E1D6",
  muted:   "#8A8678",
  red:     "#A32D2D",
  redBg:   "#FDECEA",
};

export default function GroupCatalogSection({ farmId, inlineMode = false, onStateChange }) {
  const [activeMap, setActiveMap] = useState({}); // catalog_group -> bool
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingKey, setPendingKey] = useState(null);

  useEffect(() => {
    if (!farmId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("tfos_access_token");
        const res = await fetch(`/api/v1/farms/${farmId}/active-groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const groups = j?.data?.groups || [];
        const map = {};
        groups.forEach(g => { map[g.catalog_group] = g.is_active; });
        if (alive) setActiveMap(map);
      } catch (e) {
        if (alive) setError(e.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [farmId]);

  async function toggleGroup(key) {
    if (pendingKey) return; // throttle one in-flight at a time
    const prev = !!activeMap[key];
    const next = !prev;
    // Phase 5.10e: snapshot prev/next maps as locals, drive both
    // setActiveMap and onStateChange from the same value. Original code used
    // closure activeMap for the callback which was technically stale (React
    // state updates async). Math worked today because [key]:value override
    // forces correctness, but pattern is a footgun if pendingKey throttle
    // ever loosens. Cheap insurance.
    const prevMap = activeMap;
    const nextMap = { ...prevMap, [key]: next };

    // Optimistic
    setActiveMap(nextMap);
    if (onStateChange) onStateChange(nextMap);
    setPendingKey(key);
    setError(null);

    try {
      const token = localStorage.getItem("tfos_access_token");
      const res = await fetch(`/api/v1/farms/${farmId}/active-groups`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groups: [{ catalog_group: key, is_active: next }],
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `HTTP ${res.status}`);
      }
    } catch (e) {
      // Revert on error — same prevMap snapshot
      setActiveMap(prevMap);
      if (onStateChange) onStateChange(prevMap);
      setError(e.message || "Could not save change. Try again.");
    } finally {
      setPendingKey(null);
    }
  }

  if (!farmId) {
    return (
      <section style={{ padding: 20, color: C.muted }}>
        <h3 style={{ marginBottom: 6, color: C.soil }}>Group catalog</h3>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          Create a farm first to choose which groups appear in (+).
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 6, color: C.soil }}>Group catalog</h3>
        <p style={{ marginTop: 0, color: C.muted, fontSize: 14 }}>Loading…</p>
      </section>
    );
  }

  return (
    <section style={{ padding: inlineMode ? 0 : 20 }}>
      {!inlineMode && (
        <>
          <h3 style={{ marginBottom: 6, color: C.soil, fontSize: 18 }}>Group catalog</h3>
          <p style={{ marginTop: 0, color: C.muted, fontSize: 14 }}>
            Choose what appears when you tap (+). You can change this anytime.
          </p>
        </>
      )}

      {error && (
        <div style={{
          background: C.redBg, color: C.red, padding: 10,
          borderRadius: 8, marginBottom: 12, fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {GROUPS_DEF.map(({ key, label, Icon, universal }) => {
          const isOn = !!activeMap[key];
          const isPending = pendingKey === key;
          return (
            <label
              key={key}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "white",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "12px 16px",
                opacity: isPending ? 0.55 : 1,
                cursor: isPending ? "wait" : "pointer",
                transition: "opacity 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Icon size={22} color={isOn ? C.green : C.soil} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.soil }}>{label}</div>
                  {!inlineMode && universal && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      Recommended for all farms
                    </div>
                  )}
                </div>
              </div>
              <span
                role="switch"
                aria-checked={isOn}
                aria-disabled={isPending}
                onClick={() => !isPending && toggleGroup(key)}
                onKeyDown={(e) => {
                  if (!isPending && (e.key === " " || e.key === "Enter")) {
                    e.preventDefault();
                    toggleGroup(key);
                  }
                }}
                tabIndex={isPending ? -1 : 0}
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: isOn ? C.green : "#CFCFCF",
                  transition: "background 0.18s ease",
                  cursor: isPending ? "wait" : "pointer",
                  opacity: isPending ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: isOn ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.18s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

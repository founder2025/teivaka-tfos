/**
 * MeSettings.jsx — /me/settings — farmer-facing settings page.
 *
 * Replaces the ComingSoon stub. First section is GroupCatalogSection
 * (per-farm catalog group toggles per Catalog Redesign Doctrine Amendment
 * v2, commit 272f513). Future phases add: account, notifications, billing.
 *
 * Single-farm assumption tonight: uses user's first farm. Multi-farm
 * operators get a farm picker in a later phase (filed: Sprint 6+).
 */
import React, { useEffect, useState } from "react";
import GroupCatalogSection from "../../components/settings/GroupCatalogSection";

const C = {
  cream:   "#F8F3E9",
  soil:    "#5C4033",
  muted:   "#8A8678",
  border:  "#E6E1D6",
};

export default function MeSettings() {
  const [farmId, setFarmId] = useState(null);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [farmsError, setFarmsError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFarms(true);
      setFarmsError(null);
      try {
        const token = localStorage.getItem("tfos_access_token");
        const res = await fetch("/api/v1/farms", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        // Try multiple shapes (some endpoints return { data: { farms: [] } },
        // some { data: [] }, some flat { farms: [] }).
        const farms = j?.data?.farms || j?.data || j?.farms || [];
        if (alive) {
          if (Array.isArray(farms) && farms.length > 0) {
            setFarmId(farms[0].farm_id);
          } else {
            setFarmId(null);
          }
        }
      } catch (e) {
        if (alive) setFarmsError(e.message || "Failed to load farms");
      } finally {
        if (alive) setLoadingFarms(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.cream }}>
      <header style={{
        padding: "24px 20px 12px",
        borderBottom: `1px solid ${C.border}`,
        background: "white",
      }}>
        <h1 style={{ margin: 0, color: C.soil, fontSize: 24 }}>Settings</h1>
        <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 14 }}>
          Customize your TFOS experience.
        </p>
      </header>

      <main style={{ padding: "12px 0 80px" }}>
        {farmsError && (
          <div style={{
            margin: "12px 20px", padding: 12,
            background: "#FDECEA", color: "#A32D2D", borderRadius: 8, fontSize: 14,
          }}>
            Couldn't load your farms: {farmsError}
          </div>
        )}
        {loadingFarms ? (
          <div style={{ padding: 20, color: C.muted, fontSize: 14 }}>Loading…</div>
        ) : (
          <GroupCatalogSection farmId={farmId} />
        )}
      </main>
    </div>
  );
}

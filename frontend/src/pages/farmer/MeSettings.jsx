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
  red:     "#A32D2D",
  redBg:   "#FDECEA",
};

// Covenant / app-store right-to-delete. Re-auth with password, confirm, then
// DELETE /api/v1/me anonymises the account and disables login. On success we
// clear tokens and bounce to the public landing.
function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const del = async () => {
    setErr(""); setBusy(true);
    try {
      const token = localStorage.getItem("tfos_access_token");
      const res = await fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ password, confirm: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Couldn't delete account (${res.status})`);
      }
      try { localStorage.removeItem("tfos_access_token"); localStorage.removeItem("tfos_refresh_token"); localStorage.removeItem("tfos_mode"); } catch { /* noop */ }
      window.location.replace("/?deleted=1");
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <section style={{ margin: "20px", padding: 16, background: "white", border: `1px solid ${C.red}`, borderRadius: 12 }}>
      <h2 style={{ margin: "0 0 4px", color: C.red, fontSize: 16 }}>Danger zone</h2>
      <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 13.5 }}>
        Delete your account. This anonymises your personal information, removes your community posts, and disables sign-in. Your farm's hash-chained audit records are kept (de-identified) so existing Bank Evidence stays verifiable. This cannot be undone.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: "white", color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Delete my account
        </button>
      ) : (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13.5, color: C.soil, marginBottom: 10, fontWeight: 600 }}>Confirm your password to permanently delete your account.</div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password" autoComplete="current-password"
            style={{ width: "100%", maxWidth: 320, padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={del} disabled={busy || !password} style={{ background: C.red, color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy || !password ? 0.5 : 1 }}>
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button onClick={() => { setOpen(false); setPassword(""); setErr(""); }} disabled={busy} style={{ background: "white", color: C.soil, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

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
        <DangerZone />
      </main>
    </div>
  );
}

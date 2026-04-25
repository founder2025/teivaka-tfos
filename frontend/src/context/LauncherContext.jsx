/**
 * LauncherContext — shared open/close + farmer mode for the Universal (+).
 *
 * Mounted in FarmerShell so the bottom-nav center button, the desktop
 * top-bar pill, and the Cmd/Ctrl+L shortcut all converge on one sheet.
 *
 * Mode is fetched once on mount from /api/v1/onboarding/status (which
 * exposes tenant.tenants.mode). Defaults to GROWTH until the call lands
 * — that's the most common path and matches Boss's tenant. Solo /
 * Commercial users see a 3-tile or full grid respectively once the
 * fetch resolves.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const LauncherContext = createContext(null);

export function LauncherProvider({ children }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("GROWTH");

  const open  = useCallback(() => setSheetOpen(true), []);
  const close = useCallback(() => setSheetOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tok = localStorage.getItem("tfos_access_token");
        if (!tok) return;
        const res = await fetch("/api/v1/onboarding/status", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const m = body?.data?.mode || body?.data?.tenant?.mode || body?.mode;
        if (!cancelled && typeof m === "string" && m) setMode(m.toUpperCase());
      } catch {
        // keep default GROWTH
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <LauncherContext.Provider value={{ sheetOpen, open, close, mode }}>
      {children}
    </LauncherContext.Provider>
  );
}

export function useLauncher() {
  const ctx = useContext(LauncherContext);
  if (!ctx) {
    throw new Error("useLauncher must be used inside LauncherProvider");
  }
  return ctx;
}

/**
 * LauncherContext — shared open/close state for the Universal (+) sheet.
 *
 * Mounted in FarmerShell so the bottom-nav center button, the desktop
 * top-bar pill, and the Cmd/Ctrl+L shortcut all converge on one sheet.
 *
 * (Farmer "mode" Solo/Growth/Commercial removed 2026-06-22 — the catalog no
 * longer tier-gates; every farmer sees the full (+). Differentiation is now
 * subscription tier + role, handled server-side.)
 */
import { createContext, useCallback, useContext, useState } from "react";

const LauncherContext = createContext(null);

export function LauncherProvider({ children }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Optional deep-link target: open the (+) pre-navigated to a specific
  // vertical/sub-flow/verb (and, for poultry, a pre-anchored flock) so a
  // dashboard quick-action can jump straight into the right capture form.
  // null => the normal full grid (every existing open() caller is unchanged).
  // Shape: { vertical, animalSub?, verbId?, itemId? }.
  const [target, setTarget] = useState(null);

  const open  = useCallback((t = null) => { setTarget(t || null); setSheetOpen(true); }, []);
  const close = useCallback(() => { setSheetOpen(false); setTarget(null); }, []);

  return (
    <LauncherContext.Provider value={{ sheetOpen, target, open, close }}>
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

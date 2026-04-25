/**
 * CurrentFarmContext — selected farm_id with localStorage persistence.
 *
 * Scoped to FarmDashboard for now. Promote to FarmerShell once another
 * page (Cycles, Harvests, Compliance) needs the same selection.
 */
import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "tfos_current_farm_id";
const CurrentFarmContext = createContext(null);

function readInitial() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function CurrentFarmProvider({ children }) {
  const [farmId, setFarmIdState] = useState(readInitial);

  const setFarmId = (id) => {
    setFarmIdState(id);
    if (typeof window === "undefined") return;
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage may be disabled (private mode) — fall back to memory only.
    }
  };

  return (
    <CurrentFarmContext.Provider value={{ farmId, setFarmId }}>
      {children}
    </CurrentFarmContext.Provider>
  );
}

export function useCurrentFarm() {
  const ctx = useContext(CurrentFarmContext);
  if (!ctx) {
    throw new Error("useCurrentFarm must be used inside CurrentFarmProvider");
  }
  return ctx;
}

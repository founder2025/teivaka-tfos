/**
 * OnboardingContext — wizard state with sessionStorage persistence.
 *
 * Each wizard sub-page (FarmBasics today, more in Phase 3+) wraps its
 * own subtree in OnboardingProvider. Cross-page persistence happens
 * through sessionStorage so back/refresh don't lose progress.
 *
 * Cleared on /onboarding/complete success (caller invokes reset()).
 */
import { createContext, useCallback, useContext, useState } from "react";

const STORAGE_KEY = "tfos_onboarding_state";

const initial = {
  farmName: "",
  totalAreaAcres: null,
  productionUnits: [], // future Phase 3
  livestock: [],       // future Phase 4
};

function readInitial() {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw);
    return { ...initial, ...parsed };
  } catch {
    return initial;
  }
}

function persist(state) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be disabled (private mode) — fall back to memory.
  }
}

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [state, setState] = useState(readInitial);

  const setField = useCallback((key, value) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setState(initial);
    if (typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ state, setField, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used inside OnboardingProvider");
  }
  return ctx;
}

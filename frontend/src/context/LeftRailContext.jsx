import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const LeftRailContext = createContext(null);

/**
 * LeftRailProvider — Nav v2.2 override (2026-04-25).
 *
 * The rail is hidden by default on every pillar. Consumers toggle it via
 * the hamburger in TopAppBar; LeftRail itself renders the close button and
 * click-outside behavior on mobile. Route-change auto-close is scoped to
 * mobile only: desktop treats the rail as a docked panel and keeps it open
 * across sub-nav clicks to avoid redundant re-opens.
 *
 * Drag-to-resize is deferred to Day 3c; width is a constant here for now.
 */
export function LeftRailProvider({ children }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      setOpen(false);
    }
  }, [pathname]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close  = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, setOpen, toggle, close, width: 220 }),
    [open, toggle, close],
  );

  return (
    <LeftRailContext.Provider value={value}>
      {children}
    </LeftRailContext.Provider>
  );
}

export function useLeftRail() {
  const ctx = useContext(LeftRailContext);
  if (!ctx) {
    // Allow consumers (e.g. LeftRail, Hamburger) to render safely outside
    // the provider during Storybook / test harness use.
    return { open: false, setOpen: () => {}, toggle: () => {}, close: () => {}, width: 220 };
  }
  return ctx;
}

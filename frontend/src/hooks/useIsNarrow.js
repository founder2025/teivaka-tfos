/**
 * useIsNarrow — true when the viewport is at/under `bp` px wide (default 760,
 * the tablet/phone threshold the shell uses for collapsing multi-column
 * layouts into single-column). SSR-safe; subscribes to matchMedia changes.
 */
import { useEffect, useState } from "react";

export function useIsNarrow(bp = 760) {
  const query = `(max-width: ${bp}px)`;
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mql = window.matchMedia(query);
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

export default useIsNarrow;

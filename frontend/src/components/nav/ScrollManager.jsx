import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * ScrollManager — per-session scroll memory (audit Slice 3).
 *
 * Restores window scroll on back/forward (navigationType POP), and scrolls to top
 * on a forward navigation (PUSH/REPLACE) — so a list you scrolled doesn't jump to
 * the top when you come back, and a fresh page always starts at the top.
 *
 * React Router's built-in <ScrollRestoration> requires the data router
 * (createBrowserRouter); the app uses <BrowserRouter>, so this does the same job.
 * Mounted once inside FarmerShell (which stays mounted across route changes), the
 * position map persists for the whole session. Renders nothing.
 */
export default function ScrollManager() {
  const { key } = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map());

  useEffect(() => {
    if (navType === "POP") {
      const y = positions.current.get(key) ?? 0;
      // rAF lets a lazy page paint enough height before we restore, else the
      // browser clamps the scroll to a not-yet-tall document.
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
    const onScroll = () => positions.current.set(key, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key, navType]);

  return null;
}

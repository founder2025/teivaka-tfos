/**
 * TfpShell.jsx — wrapper that activates the prototype's own stylesheet.
 *
 * PIXEL-EXACT RULE (Operator, 2026-06-10): farm surfaces must reproduce the
 * sacred v263 prototype pixel-for-pixel, wired to real backend data — not
 * re-styled in the app's design system. Wrap a surface's prototype-DOM (exact
 * classes from the prototype) in <TfpShell> and it renders with the prototype's
 * real CSS (scoped under .tfp in styles/prototype.css). The job per surface:
 * copy the prototype's exact markup → JSX, swap mock values for live API data.
 */
import "../../styles/prototype.css";

export default function TfpShell({ children, className = "" }) {
  return <div className={`tfp ${className}`}>{children}</div>;
}

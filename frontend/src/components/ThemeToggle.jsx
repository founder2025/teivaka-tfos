/**
 * ThemeToggle — System / Light / Dark segmented control. Themes itself via the
 * CSS tokens so it looks right in both modes.
 */
import { useEffect, useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { getThemePref, setThemePref } from "../utils/theme";

const OPTS = [["system", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]];

export default function ThemeToggle() {
  const [pref, setPref] = useState(getThemePref());
  useEffect(() => { const on = () => setPref(getThemePref()); window.addEventListener("tfos-theme-changed", on); return () => window.removeEventListener("tfos-theme-changed", on); }, []);
  const pick = (p) => { setPref(p); setThemePref(p); };
  return (
    <div style={{ display: "inline-flex", gap: 4, background: "var(--cream-2)", border: "1px solid var(--line)", borderRadius: 999, padding: 3 }}>
      {OPTS.map(([k, label, Icon]) => {
        const on = pref === k;
        return (
          <button key={k} onClick={() => pick(k)} aria-pressed={on}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 999, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: on ? 700 : 500, background: on ? "var(--paper)" : "transparent", color: on ? "var(--soil)" : "var(--muted)", boxShadow: on ? "var(--shadow)" : "none" }}>
            <Icon size={14} />{label}
          </button>
        );
      })}
    </div>
  );
}

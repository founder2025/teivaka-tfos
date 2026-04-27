/**
 * ModeDropdown — FOUNDER debug "View as" override (Phase A1b).
 *
 * Repurposed from the Day 3b decorative selector. Behavior splits on role:
 *
 *   FOUNDER       → ThemedSelect with Solo/Growth/Commercial + "Reset"
 *                   options. onChange writes sessionStorage override and
 *                   reloads to apply across the shell.
 *   non-FOUNDER   → static read-only badge showing the user's real mode.
 *                   No dropdown — MBI Part 19 forbids user-toggleable
 *                   mode preference.
 *
 * The override is session-scoped (sessionStorage), FOUNDER-gated by
 * useEffectiveMode, and never writes to tenant.tenants.mode.
 */
import { Bug } from "lucide-react";

import ThemedSelect from "../inputs/ThemedSelect.jsx";
import { useEffectiveMode } from "../../hooks/useEffectiveMode";

const C = {
  soil:   "#5C4033",
  border: "#E6DED0",
  muted:  "#8A7863",
  warn:   "#BF9000",
};

const RESET_VALUE = "__RESET";

const FOUNDER_OPTIONS = [
  { value: "SOLO",       label: "Solo (debug)" },
  { value: "GROWTH",     label: "Growth (debug)" },
  { value: "COMMERCIAL", label: "Commercial (debug)" },
  { value: RESET_VALUE,  label: "Reset to derived" },
];

export default function ModeDropdown() {
  const { real, override, setOverride, isFounder } = useEffectiveMode();

  // Non-FOUNDER: informational badge, no dropdown. Render nothing if we
  // don't yet know the real mode (cold cache before /auth/me lands).
  if (!isFounder) {
    if (!real) return null;
    return (
      <div
        className="uppercase"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.muted,
          padding: "4px 10px",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          letterSpacing: 0.6,
        }}
      >
        {real}
      </div>
    );
  }

  function handleChange(value) {
    if (value === RESET_VALUE) {
      setOverride(null);
    } else {
      setOverride(value);
    }
    // Full reload so layouts re-evaluate effective mode on next mount
    // (FarmerShell / SoloShell read it on mount and Navigate accordingly).
    window.location.reload();
  }

  const isOverridden = !!override && override !== real;
  const currentValue = override || RESET_VALUE;

  return (
    <div className="inline-flex items-center" style={{ gap: 6, minWidth: 180 }}>
      <Bug
        size={14}
        strokeWidth={2}
        style={{ color: isOverridden ? C.warn : C.muted }}
        aria-label="Debug override"
      />
      <ThemedSelect
        value={currentValue}
        onChange={handleChange}
        options={FOUNDER_OPTIONS}
        placeholder="View as"
      />
    </div>
  );
}

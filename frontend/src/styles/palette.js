/**
 * palette.js — TFOS palette source of truth (Phase 4.x.UX-1a, Day 1).
 *
 * Two dialects ship in production today:
 *   - PALETTE_FARM   warm soil/green farmer-shell theme (daily working surfaces)
 *   - PALETTE_DARK   deeper brand theme (auth, marketing, CommunityMap)
 *
 * Consumers receive a palette object as a prop and read tokens by semantic
 * name. The 50+ inline `const C = { ... }` declarations elsewhere in the
 * codebase are NOT migrated here yet — opportunistic migration only as each
 * file is touched. tailwind.config.js theme.extend stays empty (deferred to
 * UX-1c).
 *
 * Token naming is semantic, not visual:
 *   bg          page/control background
 *   text        primary text
 *   textMuted   secondary / hint / placeholder
 *   border      hairline 1px divider
 *   accent      primary action / focus ring
 *   accentTint  hover / highlight / selected-row background
 *   warn        non-blocking caution (amber/gold band)
 */

export const PALETTE_FARM = {
  bg:         "var(--cream)",
  text:       "var(--soil)",
  textMuted:  "var(--muted)",
  border:     "#E6DED0",
  accent:     "var(--green)",
  accentTint: "#E9F2DD",
  warn:       "var(--amber)",
};

export const PALETTE_DARK = {
  bg:         "var(--cream)",
  text:       "#2C1A0E",
  textMuted:  "var(--muted)",
  border:     "var(--line)",
  accent:     "var(--green)",
  accentTint: "#E6EFD4",
  warn:       "var(--amber)",
};

export default PALETTE_FARM;

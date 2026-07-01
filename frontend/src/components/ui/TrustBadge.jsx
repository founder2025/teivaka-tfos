/**
 * TrustBadge — the earned trust LEVEL shown wherever people are vetted (listings,
 * directory, feed authors). Trust Ladder Slice 2. Flat lucide icons (Teivaka's
 * icon system — never emoji).
 *
 * Renders ONLY earned tiers (TRUSTED / VERIFIED / ACTIVE). A NEW / missing level
 * renders nothing — an absent badge honestly reads as "not yet established", not
 * as a negative mark against a new farmer.
 */
import { ShieldCheck, BadgeCheck, Sprout } from "lucide-react";

const CFG = {
  TRUSTED:  { Icon: ShieldCheck, label: "Trusted",     bg: "rgba(106,168,79,.18)", fg: "#2f6b1f" },
  VERIFIED: { Icon: BadgeCheck,  label: "ID-verified", bg: "rgba(106,168,79,.14)", fg: "#2f6b1f" },
  ACTIVE:   { Icon: Sprout,      label: "Active",       bg: "rgba(31,41,55,.10)",   fg: "#1F2937" },
};

export default function TrustBadge({ level, size = 11, showLabel = true, style }) {
  const c = CFG[String(level || "").toUpperCase()];
  if (!c) return null;
  const { Icon } = c;
  return (
    <span title={`Trust: ${c.label}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, padding: showLabel ? "2px 8px" : "2px 4px", borderRadius: 6, lineHeight: 1.4, ...style }}>
      <Icon size={size} />{showLabel && c.label.toUpperCase()}
    </span>
  );
}

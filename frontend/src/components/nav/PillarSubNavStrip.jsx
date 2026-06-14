/**
 * PillarSubNavStrip.jsx — mobile/tablet sub-navigation for the four pillars
 * (Home / Classroom / Farm / TIS). Replaces the overlay LeftRail drawer at
 * <=1024px with a horizontal, scrollable pill tab strip rendered inline at the
 * top of the page content — the same pattern shipped on the profile page (/me).
 *
 * Single source of truth: PILLAR_SUB_NAV (shared with LeftRail). Active state,
 * locked-phase items, and the Tasks badge all mirror the desktop rail so the
 * two stay in lockstep. Renders nothing when the current route is not under a
 * known pillar (e.g. /me, /admin, /stub) — those surfaces own their own nav.
 */
import { NavLink, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { PILLAR_SUB_NAV } from "./pillarSubNavMap";
import { useTaskCount } from "../../hooks/useTaskCount";

const C = {
  soil:     "var(--soil)",
  greenDk:  "var(--green-dk)",
  green:    "var(--green)",
  border:   "var(--line)",
  muted:    "var(--muted)",
  activeBg: "rgba(106, 168, 79, 0.12)",
  red:      "var(--red)",
};

function resolveHref(item) {
  return item.phase ? `/stub/phase-${item.phase}` : item.path;
}

function currentPillarKey(pathname) {
  return Object.keys(PILLAR_SUB_NAV).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function StripItem({ item, badge, badgeOverdue }) {
  const Icon = item.icon;
  const href = resolveHref(item);
  const isPhase = Boolean(item.phase);
  // Pillar roots need exact matching so e.g. /farm isn't "active" on /farm/tasks.
  const endMatch =
    item.path === "/home" || item.path === "/farm" || item.path === "/tis" || item.path === "/classroom";

  return (
    <NavLink
      to={href}
      end={endMatch}
      style={({ isActive }) => {
        const on = isActive && !isPhase;
        return {
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 13px",
          minHeight: 44,
          borderRadius: 999,
          border: `1px solid ${on ? C.green : C.border}`,
          background: on ? C.activeBg : "var(--paper)",
          color: on ? C.greenDk : C.soil,
          fontSize: 13,
          fontWeight: on ? 700 : 500,
          whiteSpace: "nowrap",
          textDecoration: "none",
        };
      }}
    >
      <Icon size={15} strokeWidth={1.75} />
      <span>{item.label}</span>
      {badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 11, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
          background: badgeOverdue ? C.red : C.greenDk,
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
      {isPhase && <Lock size={12} style={{ opacity: 0.6 }} aria-label="Coming soon" />}
    </NavLink>
  );
}

export default function PillarSubNavStrip() {
  const { pathname } = useLocation();
  const pillarKey = currentPillarKey(pathname);
  const pillar = pillarKey ? PILLAR_SUB_NAV[pillarKey] : null;
  const taskCount = useTaskCount();

  if (!pillar) return null;

  return (
    <nav
      aria-label={`${pillar.label} sub-navigation`}
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "2px 0 10px",
        marginBottom: 4,
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {pillar.items.map((item) => (
        <StripItem
          key={item.path}
          item={item}
          badge={item.path === "/farm/tasks" ? taskCount.open : 0}
          badgeOverdue={item.path === "/farm/tasks" && taskCount.overdue > 0}
        />
      ))}
    </nav>
  );
}

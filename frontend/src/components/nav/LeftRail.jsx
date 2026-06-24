import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, X, ChevronDown } from "lucide-react";
import { PILLAR_SUB_NAV, FARM_NAV_GROUPS } from "./pillarSubNavMap";
import { useLeftRail } from "../../context/LeftRailContext";
import { useLauncher } from "../../context/LauncherContext";
import { useTaskCount } from "../../hooks/useTaskCount";

const C = {
  soil:     "var(--soil)",
  greenDk:  "var(--green-dk)",
  border:   "var(--line)",
  activeBg: "rgba(106, 168, 79, 0.08)",
  hoverBg:  "rgba(92, 64, 51, 0.04)",
  hoverBg2: "rgba(92, 64, 51, 0.06)",
};

const FARM_NAV_OPEN_KEY = "tfos_farmnav_open";

function useIsNarrow() {
  const get = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1024px)").matches;
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1024px)");
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

function resolveHref(item) {
  return item.phase ? `/stub/phase-${item.phase}` : item.path;
}

function currentPillarKey(pathname) {
  return Object.keys(PILLAR_SUB_NAV).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isPathActive(path, pathname) {
  if (path === "/farm" || path === "/home" || path === "/tis" || path === "/classroom") {
    return pathname === path;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

function RailItem({ item, onNavigate, badge, badgeOverdue }) {
  const Icon = item.icon;
  const href = resolveHref(item);
  const isPhase = Boolean(item.phase);
  const endMatch =
    item.path === "/home" || item.path === "/farm" || item.path === "/tis" || item.path === "/classroom";

  return (
    <NavLink
      to={href}
      end={endMatch}
      onClick={onNavigate}
      className="flex items-center"
      style={({ isActive }) => ({
        minHeight: 36,
        padding: item.sub ? "7px 12px" : "8px 12px",
        gap: 12,
        borderRadius: 6,
        color: isActive && !isPhase ? C.greenDk : C.soil,
        background: isActive && !isPhase ? C.activeBg : "transparent",
        fontSize: 14,
        transition: "background 120ms ease, color 120ms ease",
      })}
      onMouseEnter={(e) => {
        if (e.currentTarget.getAttribute("aria-current") !== "page") {
          e.currentTarget.style.background = C.hoverBg;
        }
      }}
      onMouseLeave={(e) => {
        if (e.currentTarget.getAttribute("aria-current") !== "page") {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon size={18} strokeWidth={1.75} style={{ color: "inherit", flexShrink: 0 }} />
      <span className="flex-1 truncate">
        <span className="block truncate">{item.label}</span>
        {item.sub && (
          <span className="block truncate" style={{ fontSize: 11, color: "var(--muted)" }}>{item.sub}</span>
        )}
      </span>
      {badge > 0 && (
        <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 11, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
          background: badgeOverdue ? "var(--red)" : "var(--green-dk)" }}>{badge > 99 ? "99+" : badge}</span>
      )}
      {isPhase && <Lock size={12} style={{ opacity: 0.6 }} aria-label="Coming soon" />}
    </NavLink>
  );
}

// Collapsible group: colored icon tile + label + sublabel + chevron. Children
// (real links) render only when open. A collapsed group surfaces a child badge
// (e.g. open tasks) on its header so it's never hidden.
function GroupSection({ entry, isOpen, onToggle, taskCount }) {
  const Icon = entry.icon;
  const hasTasks = entry.items.some((i) => i.path === "/farm/tasks");
  const headerBadge = !isOpen && hasTasks ? taskCount.open : 0;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center w-full text-left"
        style={{ minHeight: 40, padding: "6px 10px", gap: 10, borderRadius: 6, background: "transparent", color: C.soil }}
        onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--cream-2)", color: "var(--soil)",
          display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon size={16} strokeWidth={1.9} />
        </span>
        <span className="flex-1 truncate">
          <span className="block truncate" style={{ fontSize: 14, fontWeight: 600 }}>{entry.label}</span>
          <span className="block truncate" style={{ fontSize: 11, color: "var(--muted)" }}>{entry.sub}</span>
        </span>
        {headerBadge > 0 && (
          <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 11, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
            background: taskCount.overdue > 0 ? "var(--red)" : "var(--green-dk)" }}>{headerBadge > 99 ? "99+" : headerBadge}</span>
        )}
        <ChevronDown size={16} style={{ flexShrink: 0, color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }} />
      </button>
      {isOpen && (
        <div className="flex flex-col gap-0.5" style={{ paddingLeft: 14, marginTop: 2, marginBottom: 4 }}>
          {entry.items.map((item) => (
            <RailItem key={item.path} item={item}
              badge={item.path === "/farm/tasks" ? taskCount.open : 0}
              badgeOverdue={item.path === "/farm/tasks" && taskCount.overdue > 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAddRow({ entry, onClick }) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full text-left"
      style={{ minHeight: 40, padding: "7px 12px", gap: 12, borderRadius: 8, marginTop: 6,
        color: C.greenDk, background: `${entry.color}14`, border: `1px solid ${entry.color}33` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${entry.color}22`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${entry.color}14`; }}
    >
      <Icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span className="flex-1 truncate">
        <span className="block truncate" style={{ fontSize: 14, fontWeight: 600 }}>{entry.label}</span>
        <span className="block truncate" style={{ fontSize: 11, color: "var(--muted)" }}>{entry.sub}</span>
      </span>
    </button>
  );
}

function FarmGroupedNav({ pathname, taskCount, onQuickAdd }) {
  const activeGroupId = useMemo(() => {
    const g = FARM_NAV_GROUPS.find(
      (e) => e.kind === "group" && e.items.some((i) => isPathActive(i.path, pathname)),
    );
    return g?.id || null;
  }, [pathname]);

  // Default: only the active group open. Remembered across visits; the active
  // group is always force-expanded so you never land on a hidden page.
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FARM_NAV_OPEN_KEY) || "null");
      if (Array.isArray(saved)) return new Set(saved);
    } catch { /* noop */ }
    return new Set(activeGroupId ? [activeGroupId] : []);
  });

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)));
    }
  }, [activeGroupId]);

  useEffect(() => {
    try { localStorage.setItem(FARM_NAV_OPEN_KEY, JSON.stringify([...openGroups])); } catch { /* noop */ }
  }, [openGroups]);

  function toggleGroup(id) {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Farm sub-navigation">
      {FARM_NAV_GROUPS.map((entry) => {
        if (entry.kind === "quickadd") return <QuickAddRow key="quickadd" entry={entry} onClick={onQuickAdd} />;
        if (entry.kind === "group") {
          return (
            <GroupSection key={entry.id} entry={entry} taskCount={taskCount}
              isOpen={openGroups.has(entry.id)} onToggle={() => toggleGroup(entry.id)} />
          );
        }
        return <RailItem key={entry.path} item={entry} />;
      })}
    </nav>
  );
}

export default function LeftRail() {
  const { pathname } = useLocation();
  const pillarKey = currentPillarKey(pathname);
  const pillar = pillarKey ? PILLAR_SUB_NAV[pillarKey] : null;
  const { open, close, width } = useLeftRail();
  const { open: openLauncher } = useLauncher();
  const mobile = useIsNarrow();
  const taskCount = useTaskCount();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open || !mobile) return undefined;
    function onDocClick(e) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      const tgt = e.target.closest?.("button[aria-label^='Open navigation']");
      if (tgt) return;
      close();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile, close]);

  // On phones + tablets (<=1024px) the overlay drawer is replaced by the inline
  // PillarSubNavStrip rendered in FarmerShell — never render the drawer here.
  if (mobile || !pillar || !open) return null;

  const isFarm = pillarKey === "/farm";

  return (
    <aside
      ref={panelRef}
      className="fixed left-0 flex flex-col overflow-y-auto"
      style={{
        top: 56,
        bottom: 0,
        width,
        background: "var(--paper)",
        borderRight: `1px solid ${C.border}`,
        padding: "12px 8px",
        zIndex: 30,
        boxShadow: "none",
      }}
      aria-label={`${pillar.label} navigation`}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "2px 8px 6px 12px" }}
      >
        <span
          className="text-[13px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--muted)", letterSpacing: "0.04em" }}
        >
          {pillar.label}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Close navigation rail"
          className="flex items-center justify-center"
          style={{ width: 28, height: 28, borderRadius: 6, color: C.soil, background: "transparent" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {isFarm ? (
        <FarmGroupedNav pathname={pathname} taskCount={taskCount} onQuickAdd={openLauncher} />
      ) : (
        <nav className="flex flex-col gap-0.5" aria-label={`${pillar.label} sub-navigation`}>
          {pillar.items.map((item) => (
            <RailItem key={item.path} item={item}
              badge={item.path === "/farm/tasks" ? taskCount.open : 0}
              badgeOverdue={item.path === "/farm/tasks" && taskCount.overdue > 0} />
          ))}
        </nav>
      )}
    </aside>
  );
}

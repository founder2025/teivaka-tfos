import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Lock, Menu, ChevronRight, X } from "lucide-react";
import { PILLAR_SUB_NAV } from "./pillarSubNavMap";

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  tint:   "#EAF3DE",
  green:  "#6AA84F",
};

function resolveHref(item) {
  return item.phase ? `/stub/phase-${item.phase}` : item.path;
}

function currentPillarKey(pathname) {
  return Object.keys(PILLAR_SUB_NAV).find((p) =>
    pathname === p || pathname.startsWith(`${p}/`),
  );
}

function activeItemLabel(items, pathname) {
  const exact = items.find((i) => i.path === pathname);
  if (exact) return exact.label;
  const prefix = items
    .filter((i) => i.path !== "/" && pathname.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.label || null;
}

function RailItem({ item, onNavigate }) {
  const Icon = item.icon;
  const href = resolveHref(item);
  const isPhase = Boolean(item.phase);

  return (
    <NavLink
      to={href}
      end={item.path === "/home" || item.path === "/farm" || item.path === "/tis" || item.path === "/classroom"}
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors"
      style={({ isActive }) => ({
        color: C.soil,
        fontWeight: isActive && !isPhase ? 500 : 400,
        background: isActive && !isPhase ? C.tint : "transparent",
        borderLeft: isActive && !isPhase ? `3px solid ${C.green}` : "3px solid transparent",
        paddingLeft: 12,
      })}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
      onMouseLeave={(e) => {
        // NavLink drives active state via style fn on next render; for hover
        // exit we conservatively clear only when NOT the active path.
        if (e.currentTarget.getAttribute("aria-current") !== "page") {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {isPhase && <Lock size={12} style={{ opacity: 0.6 }} aria-label="Coming soon" />}
    </NavLink>
  );
}

function RailBody({ pillar, onNavigate, compact }) {
  return (
    <>
      <div
        className="px-4 pt-4 pb-2 text-base font-semibold"
        style={{ color: C.soil }}
      >
        {pillar.label}
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4" aria-label={`${pillar.label} sub-navigation`}>
        {pillar.items.map((item) => (
          <RailItem key={item.path} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      {compact && null}
    </>
  );
}

export default function LeftRail() {
  const { pathname } = useLocation();
  const pillarKey = currentPillarKey(pathname);
  const pillar = pillarKey ? PILLAR_SUB_NAV[pillarKey] : null;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  if (!pillar) return null;

  const activeLabel = activeItemLabel(pillar.items, pathname);

  return (
    <>
      {/* Tablet rail — 168px */}
      <aside
        className="hidden md:flex lg:hidden fixed left-0 z-30 flex-col overflow-y-auto"
        style={{
          top: 56,
          bottom: 0,
          width: 168,
          background: C.cream,
          borderRight: `1px solid ${C.border}`,
        }}
        aria-label={`${pillar.label} navigation`}
      >
        <RailBody pillar={pillar} />
      </aside>
      {/* Desktop rail — 200px */}
      <aside
        className="hidden lg:flex fixed left-0 z-30 flex-col overflow-y-auto"
        style={{
          top: 56,
          bottom: 0,
          width: 200,
          background: C.cream,
          borderRight: `1px solid ${C.border}`,
        }}
        aria-label={`${pillar.label} navigation`}
      >
        <RailBody pillar={pillar} />
      </aside>

      {/* Mobile breadcrumb + hamburger */}
      <div
        className="md:hidden sticky z-30 flex items-center gap-2 px-3 py-2 text-sm"
        style={{
          top: 48,
          background: C.cream,
          borderBottom: `1px solid ${C.border}`,
          color: C.soil,
        }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={`Open ${pillar.label} menu`}
          className="p-1 rounded-md"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <span className="font-semibold">{pillar.label}</span>
        {activeLabel && (
          <>
            <ChevronRight size={14} style={{ opacity: 0.6 }} />
            <span className="truncate">{activeLabel}</span>
          </>
        )}
      </div>

      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={`${pillar.label} navigation`}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)" }}
          />
          <div
            className="absolute left-0 top-0 bottom-0 flex flex-col overflow-y-auto"
            style={{
              width: 280,
              background: C.cream,
              borderRight: `1px solid ${C.border}`,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: C.border }}
            >
              <span className="font-semibold" style={{ color: C.soil }}>{pillar.label}</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="p-1 rounded-md"
                style={{ color: C.soil }}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex-1">
              <nav className="flex flex-col gap-0.5 px-2 py-3" aria-label={`${pillar.label} sub-navigation`}>
                {pillar.items.map((item) => {
                  const Icon = item.icon;
                  const href = resolveHref(item);
                  return (
                    <Link
                      key={item.path}
                      to={href}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 text-sm rounded-md"
                      style={{ color: C.soil }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.phase && <Lock size={12} style={{ opacity: 0.6 }} />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

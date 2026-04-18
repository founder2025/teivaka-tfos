/**
 * BottomNav.jsx — 5-tab fixed bottom navigation (mobile only, hidden ≥ md).
 *
 * Tabs:   Home (Users) · Classroom (BookOpen) · Farm (Tractor, center) · Tei (Sparkles) · Me (User)
 * Palette: inactive soil #5C4033, active green #6AA84F. No shadows beyond a hairline top border.
 *
 * Icons are inline lucide-style SVG (lucide-react is NOT installed in this repo; flagged to Cody).
 */
import { NavLink } from "react-router-dom";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  border: "#E6DED0",
  cream:  "#F8F3E9",
};

const STROKE = 1.75;

// ── Icons (module scope — never redefined during parent renders) ─────────────
function IconUsers({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconBookOpen({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function IconTractor({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h9l1 7" />
      <path d="M4 11V4" />
      <path d="M8 10V4" />
      <path d="M18 5c-.6 0-1 .4-1 1v5.6" />
      <path d="m10 11 11 .9c.6 0 .9.5.8 1.1l-.8 5h-1" />
      <circle cx="7" cy="15" r="5" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

function IconSparkles({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
      <path d="M5 14l.7 1.6L7.3 16l-1.6.7L5 18l-.7-1.3L2.7 16l1.6-.4L5 14z" />
    </svg>
  );
}

function IconUser({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const TABS = [
  { path: "/community", label: "Home",      Icon: IconUsers,    end: true  },
  { path: "/classroom", label: "Classroom", Icon: IconBookOpen, end: false },
  { path: "/farm",      label: "Farm",      Icon: IconTractor,  end: false, center: true },
  { path: "/tis",       label: "Tei",       Icon: IconSparkles, end: false },
  { path: "/me",        label: "Me",        Icon: IconUser,     end: false },
];

function NavItem({ tab }) {
  const { Icon, center } = tab;
  return (
    <NavLink
      to={tab.path}
      end={tab.end}
      className={({ isActive }) =>
        "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors select-none"
      }
      style={({ isActive }) => ({
        color: isActive ? C.green : C.soil,
      })}
    >
      <Icon size={center ? 28 : 22} />
      <span style={{ letterSpacing: 0.2 }}>{tab.label}</span>
    </NavLink>
  );
}

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: C.cream,
        borderTop: `1px solid ${C.border}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Primary"
    >
      <div className="flex items-stretch max-w-md mx-auto">
        {TABS.map((t) => <NavItem key={t.path} tab={t} />)}
      </div>
    </nav>
  );
}

export { TABS as FARMER_TABS };

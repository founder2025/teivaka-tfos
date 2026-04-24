/**
 * BottomNav.jsx — 4-tab + raised (+) mobile bottom nav (Nav v2.1 §6.8).
 *
 * Slots: [Home][Learn][(+)][Farm][TIS]. Me is removed (now the avatar
 * dropdown in the top bar). Icons come from lucide-react.
 */
import { NavLink } from "react-router-dom";
import { Users, BookOpen, Tractor, Sparkles } from "lucide-react";
import UniversalLogButton from "./UniversalLogButton";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  border: "#E6DED0",
  cream:  "#F8F3E9",
};

const LEFT_TABS = [
  { path: "/home",      label: "Home",  Icon: Users,    end: true  },
  { path: "/classroom", label: "Learn", Icon: BookOpen, end: false },
];

const RIGHT_TABS = [
  { path: "/farm", label: "Farm", Icon: Tractor,   end: false },
  { path: "/tis",  label: "TIS",  Icon: Sparkles,  end: false },
];

function NavItem({ tab }) {
  const { Icon } = tab;
  return (
    <NavLink
      to={tab.path}
      end={tab.end}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium select-none"
      style={({ isActive }) => ({ color: isActive ? C.green : C.soil })}
    >
      <Icon size={22} strokeWidth={1.75} />
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
        height: 64,
      }}
      aria-label="Primary"
    >
      <div className="flex items-stretch max-w-md mx-auto h-full relative">
        {LEFT_TABS.map((t) => <NavItem key={t.path} tab={t} />)}

        {/* Raised center (+) slot */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="absolute -top-3">
            <UniversalLogButton variant="center" />
          </div>
        </div>

        {RIGHT_TABS.map((t) => <NavItem key={t.path} tab={t} />)}
      </div>
    </nav>
  );
}

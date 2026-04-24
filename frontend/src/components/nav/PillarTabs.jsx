import { NavLink } from "react-router-dom";
import { Home, BookOpen, Tractor, Sparkles } from "lucide-react";

const C = {
  soil:      "#5C4033",
  greenDk:   "#3E7B1F",
  green:     "#6AA84F",
  activeBg:  "rgba(106, 168, 79, 0.08)",
  hoverBg:   "rgba(92, 64, 51, 0.04)",
};

const PILLARS = [
  { key: "home",      label: "Home",      to: "/home",      Icon: Home },
  { key: "classroom", label: "Classroom", to: "/classroom", Icon: BookOpen },
  { key: "farm",      label: "Farm",      to: "/farm",      Icon: Tractor },
  { key: "tis",       label: "TIS",       to: "/tis",       Icon: Sparkles },
];

export default function PillarTabs() {
  return (
    <nav className="flex items-center" aria-label="Primary">
      {PILLARS.map(({ key, label, to, Icon }) => (
        <NavLink
          key={key}
          to={to}
          end={to === "/home" || to === "/farm" || to === "/tis" || to === "/classroom"}
          className="flex flex-col items-center justify-center"
          style={({ isActive }) => ({
            padding: "8px 14px",
            minWidth: 92,
            height: 56,
            color: isActive ? C.greenDk : C.soil,
            borderBottom: `2px solid ${isActive ? C.green : "transparent"}`,
            background: isActive ? C.activeBg : "transparent",
            transition: "all 150ms ease",
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
          <Icon size={20} strokeWidth={2} style={{ marginBottom: 2 }} />
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1 }}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

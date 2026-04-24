import { NavLink } from "react-router-dom";

const C = {
  soil:  "#5C4033",
  green: "#6AA84F",
  tint:  "#EAF3DE",
};

const PILLARS = [
  { path: "/home",      label: "Home" },
  { path: "/classroom", label: "Classroom" },
  { path: "/farm",      label: "Farm" },
  { path: "/tis",       label: "TIS" },
];

export default function PillarTabs() {
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {PILLARS.map((p) => (
        <NavLink
          key={p.path}
          to={p.path}
          className="px-4 py-2 text-sm rounded-md transition-colors"
          style={({ isActive }) => ({
            color: isActive ? C.green : C.soil,
            fontWeight: isActive ? 600 : 500,
            borderBottom: `2px solid ${isActive ? C.green : "transparent"}`,
          })}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.tint; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}

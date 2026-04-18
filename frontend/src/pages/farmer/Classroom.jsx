/**
 * Classroom.jsx — /classroom stub (Week 1 placeholder).
 *
 * Rendered inside <FarmerShell /> via App.jsx. Do NOT import shell chrome here.
 *
 * Icon note: lucide-react is not installed in this repo — inline SVG mirrors
 * BottomNav.jsx IconBookOpen. Flagged to Cody alongside the Me stub.
 */

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

function BookOpenIcon({ size = 48, color = C.soil }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export default function Classroom() {
  return (
    <div className="space-y-4" style={{ background: C.cream }}>
      <div className="pt-2 flex flex-col items-start gap-3">
        <BookOpenIcon />
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>
          Classroom
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Validated farming protocols, coming in Week 2
        </p>
      </div>

      <section
        className="bg-white rounded-2xl px-4 py-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        <p className="text-sm leading-relaxed" style={{ color: C.soil }}>
          Teivaka is building a library of Fiji-specific crop guides, pest
          handbooks, and compliance playbooks. Check back soon.
        </p>
      </section>
    </div>
  );
}

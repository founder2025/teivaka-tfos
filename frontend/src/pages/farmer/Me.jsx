/**
 * Me.jsx — /me stub (Week 1 placeholder).
 *
 * Rendered inside <FarmerShell /> via App.jsx. Do NOT import shell chrome here.
 *
 * Icon note: lucide-react is not installed in this repo — inline SVG mirrors
 * BottomNav.jsx IconUser. Flagged to Cody alongside the Classroom stub.
 *
 * Heads-up: BottomNav.jsx's "Me" tab currently routes to /profile, not /me —
 * so this route renders but the Me pill will not highlight until BottomNav is
 * updated. Flagged, not fixed (BottomNav.jsx is in the standing-rule lock).
 */

const C = {
  soil:   "#5C4033",
  cream:  "#F8F3E9",
  border: "#E6DED0",
  muted:  "#8A7863",
};

function UserIcon({ size = 48, color = C.soil }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function Me() {
  return (
    <div className="space-y-4" style={{ background: C.cream }}>
      <div className="pt-2 flex flex-col items-start gap-3">
        <UserIcon />
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>
          Me
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Profile, settings, and tier info — coming in Week 2
        </p>
      </div>

      <section
        className="bg-white rounded-2xl px-4 py-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        <p className="text-sm leading-relaxed" style={{ color: C.soil }}>
          Manage your farm profile, language preference (English / Fijian),
          notification settings, and subscription tier here.
        </p>
      </section>
    </div>
  );
}

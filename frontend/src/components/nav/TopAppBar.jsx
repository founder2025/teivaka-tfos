/**
 * TopAppBar.jsx — slim app bar for FarmerShell.
 * Shows brand + trial chip (BASIC trial countdown). Minimal by design —
 * primary navigation lives in BottomNav (mobile) / the sidebar (desktop).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  amber:  "#BF9000",
  cream:  "#F8F3E9",
  border: "#E6DED0",
};

function TrialChip({ trialEndsAt, subscriptionTier }) {
  if ((subscriptionTier || "").toUpperCase() !== "BASIC") return null;
  if (!trialEndsAt) return null;
  const ends = new Date(trialEndsAt);
  if (isNaN(ends.getTime())) return null;
  const now = new Date();
  if (now >= ends) return null;
  const daysLeft = Math.max(1, Math.ceil((ends - now) / 86400000));
  const critical = daysLeft <= 3;
  const bg = critical ? C.amber : C.green;
  const label = critical
    ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
    : `BASIC · ${daysLeft}d left`;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap"
      style={{ background: bg }}
      title={`Trial ends ${ends.toLocaleDateString()}`}
    >
      {label}
    </span>
  );
}

export default function TopAppBar() {
  const [trialEndsAt, setTrialEndsAt] = useState(null);
  const [tier, setTier] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return;
    fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        if (json.data.trial_ends_at)     setTrialEndsAt(json.data.trial_ends_at);
        if (json.data.subscription_tier) setTier(json.data.subscription_tier);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: C.cream,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div className="max-w-screen-md mx-auto h-12 px-4 flex items-center justify-between md:ml-56">
        <Link to="/community" className="flex items-center gap-2">
          <span
            className="font-bold tracking-tight text-base"
            style={{ color: C.soil, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
          >
            Teivaka
          </span>
        </Link>
        <TrialChip trialEndsAt={trialEndsAt} subscriptionTier={tier} />
      </div>
    </header>
  );
}

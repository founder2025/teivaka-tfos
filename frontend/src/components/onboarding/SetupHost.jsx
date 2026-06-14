/**
 * SetupHost — Slice 1 of the onboarding-wall replacement.
 *
 * Replaces the blocking 7-step wall. Mounted once in FarmerShell (additive,
 * beside FarmTourHost). Self-deciding: renders ONLY on /home, only until the
 * user dismisses it (server flag tenant.users.setup_dismissed_at) — never on
 * localStorage. Non-blocking: the user can ignore it and use the platform.
 *
 * Two parts in one surface (Layer 1):
 *   1. A dismissible welcome card (lucide Hand icon — NOT an emoji), with the
 *      prototype's profession onboardingCta as the primary action.
 *   2. A collapsible "Getting started" checklist whose done-states are DERIVED
 *      from real records by GET /api/v1/onboarding/setup-status (no progress
 *      table). Each item OPENS THE EXISTING FORM (profile / farm settings /
 *      enterprises) — never inline-edit.
 *
 * Branches by PERSONA (OQ1): farm-only items are hidden for non-farm personas.
 *
 * Reserved naming-dictionary keys (copy hardcoded for Slice 1; name() wired in
 * the vocab session):
 *   onboarding.welcome.title / .body / .cta_farmer
 *   onboarding.checklist.title / .progress / .skip / .all_done
 *   onboarding.item.{display_name,avatar,farm_name,location,area,verticals,contact,email_verify}
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Hand, Check, Circle, ChevronRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { navPillarKeys } from "../../utils/personas";

const C = { soil: "var(--soil)", green: "var(--green)", cream: "var(--cream)", line: "var(--line)", muted: "var(--muted)" };

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" };
}

// Prototype onboardingCta strings (convergence) keyed by persona group.
const CTA_BY_GROUP = {
  PRODUCER: { label: "Create your first farm", to: "/farm/settings" },
  TRADE: { label: "Browse growers near you", to: "/community/map" },
  SERVICE: { label: "List your services", to: "/me" },
  CAPITAL: { label: "Verify a farmer record", to: "/verify" },
  GOVERNANCE: { label: "Verify a farmer record", to: "/verify" },
};

// to = the existing form each item opens (forms write, pages render).
const ITEMS = [
  { key: "display_name", label: "What should we call you", to: "/me", farmOnly: false },
  { key: "avatar", label: "Add a profile photo", to: "/me", farmOnly: false },
  { key: "farm", label: "Name your farm", to: "/farm/settings", farmOnly: true },
  { key: "location", label: "Where is your farm", to: "/farm/settings", farmOnly: true },
  { key: "area", label: "Your farm size", to: "/farm/settings", farmOnly: true },
  { key: "verticals", label: "What you grow or raise", to: "/farm/enterprises", farmOnly: true },
  { key: "contact", label: "WhatsApp number for alerts", to: "/me", farmOnly: false },
];

function personaGroupKey(accountType) {
  // navPillarKeys returns the visible pillar set; "farm" present == farm persona.
  return navPillarKeys(accountType);
}

export default function SetupHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/onboarding/setup-status", { headers: authHeaders() });
      const b = r.ok ? await r.json() : null;
      setData(b?.data || null);
    } catch {
      setData(null); // fail quiet: don't nag on error
    }
  }, []);

  useEffect(() => {
    if (location.pathname === "/home") load();
  }, [location.pathname, load]);

  if (location.pathname !== "/home") return null;
  if (!data || data.dismissed || hidden) return null;

  const dismiss = async () => {
    setHidden(true); // instant UI; server flag is source of truth next load
    try {
      await fetch("/api/v1/onboarding/setup-dismiss", { method: "POST", headers: authHeaders() });
    } catch {
      /* best-effort */
    }
  };

  const pillars = personaGroupKey(data.account_type);
  const hasFarm = pillars.includes("farm");
  const group = hasFarm ? "PRODUCER" : pillars.includes("classroom") && !hasFarm ? "TRADE" : "PRODUCER";
  const cta = CTA_BY_GROUP[group] || CTA_BY_GROUP.PRODUCER;

  const rows = ITEMS.filter((it) => !it.farmOnly || hasFarm).map((it) => ({
    ...it,
    done: !!(data.items && data.items[it.key]),
  }));
  if (data.email_verified === false) {
    rows.push({ key: "email", label: "Confirm your email", to: "/me/verification", done: false });
  }
  const done = rows.filter((r) => r.done).length;
  const total = rows.length;
  const allDone = total > 0 && done === total;

  return (
    <div
      role="region"
      aria-label="Getting started"
      className="fixed z-40 left-3 right-3 bottom-24 md:left-auto md:right-4 md:bottom-4 md:w-[22rem]"
      style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
    >
      <div className="rounded-2xl shadow-lg bg-white overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        {/* Welcome strip */}
        <div className="flex items-start gap-3 p-4" style={{ background: C.cream }}>
          <span
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 36, height: 36, background: "#fff", border: `1px solid ${C.line}` }}
            aria-hidden="true"
          >
            <Hand size={18} style={{ color: C.green }} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: C.soil }}>
              {allDone ? "You're all set" : "Welcome to Teivaka"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              {allDone
                ? "Your account is set up. You can close this any time."
                : "Set up your account bit by bit. Nothing here stops you using Teivaka — finish whenever you like."}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss setup"
            className="p-1 rounded-md shrink-0"
            style={{ color: C.muted }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Checklist header */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="w-full flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: `1px solid ${C.line}`, color: C.soil }}
        >
          <span className="text-xs font-semibold">Getting started</span>
          <span className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.muted }}>{done} of {total}</span>
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {!collapsed && (
          <ul className="px-2 pb-2">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => navigate(r.to)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-black/[0.03]"
                  aria-label={r.done ? `${r.label} — done` : `${r.label} — open form`}
                >
                  {r.done ? (
                    <Check size={18} style={{ color: C.green }} aria-hidden="true" />
                  ) : (
                    <Circle size={18} style={{ color: C.line }} aria-hidden="true" />
                  )}
                  <span
                    className="flex-1 text-sm"
                    style={{ color: r.done ? C.muted : C.soil, textDecoration: r.done ? "line-through" : "none" }}
                  >
                    {r.label}
                  </span>
                  {!r.done && <ChevronRight size={16} style={{ color: C.muted }} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Primary action / skip */}
        {!collapsed && (
          <div className="px-4 pb-4 pt-1 flex items-center justify-between">
            {!allDone ? (
              <button
                type="button"
                onClick={() => navigate(cta.to)}
                className="px-3 py-2 rounded-lg text-white text-xs font-semibold"
                style={{ background: C.green }}
              >
                {cta.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="px-3 py-2 rounded-lg text-white text-xs font-semibold"
                style={{ background: C.green }}
              >
                Done
              </button>
            )}
            <button type="button" onClick={dismiss} className="text-xs" style={{ color: C.muted }}>
              Skip setup for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

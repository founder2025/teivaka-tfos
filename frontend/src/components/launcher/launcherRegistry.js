/**
 * launcherRegistry.js — single source of truth for the pillar-scoped (+).
 *
 * The Universal (+) shows ONLY the executable actions for the pillar you're in,
 * so it's never overloaded with another pillar's forms:
 *   /farm       -> the farm event catalog (LogSheet, unchanged)
 *   /home       -> community create-actions (post, story, sell, group)
 *   /classroom  -> create course (admin/instructor only, capability-gated)
 *   /tis        -> nothing (the chat box IS the action) -> (+) hidden
 *   elsewhere   -> nothing -> (+) hidden
 *
 * Active pillar is derived from the route (same logic as LeftRail /
 * PillarSubNavStrip), so the (+) never guesses from arbitrary strings.
 */
import { PenSquare, Camera, Store, Users2, GraduationCap } from "lucide-react";
import { PILLAR_SUB_NAV } from "../nav/pillarSubNavMap";

export function currentPillarKey(pathname) {
  return Object.keys(PILLAR_SUB_NAV).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// kind "farmCatalog" -> existing LogSheet; kind "actions" -> ActionSheet.
// Each action navigates to a route that opens the matching create surface
// (targets read the query param on mount). `gate` is a capability key.
export const LAUNCHER_BY_PILLAR = {
  "/farm": { kind: "farmCatalog" },
  "/home": {
    kind: "actions",
    title: "Create",
    actions: [
      { key: "post",  label: "New post",     icon: PenSquare, to: "/home?compose=1" },
      { key: "story", label: "Post a story", icon: Camera,    to: "/home?story=1" },
      { key: "sell",  label: "Sell an item", icon: Store,     to: "/home/marketplace?new=1" },
      { key: "group", label: "New group",    icon: Users2,    to: "/home/groups?new=1" },
    ],
  },
  "/classroom": {
    kind: "actions",
    title: "Create",
    gate: "CLASSROOM_UPLOAD_MODULE", // admin / instructor only; hidden for learners
    actions: [
      { key: "course", label: "Create course", icon: GraduationCap, to: "/classroom/courses?new=1" },
    ],
  },
  "/tis": null,
};

/**
 * Returns the launcher config for a path, applying the capability gate.
 * `can` is useCapabilities().can. Returns null when the (+) must be hidden
 * (TIS, non-pillar routes, or a gated pillar the user can't act in).
 */
export function getLauncher(pathname, can) {
  const key = currentPillarKey(pathname);
  const cfg = key ? LAUNCHER_BY_PILLAR[key] : null;
  if (!cfg) return null;
  if (cfg.gate && can && !can(cfg.gate)) return null;
  if (cfg.kind === "actions" && (!cfg.actions || cfg.actions.length === 0)) return null;
  return cfg;
}

# Day 3a — Standard Shell (Nav v2.1 Structural Rebuild)

**Version:** 1.0 | **Drafted:** 2026-04-25 | **Supersedes:** Day 3 section of CLAUDE_CODE_EXECUTION_PASTE.md
**Branch:** `feature/option-3-plus-nav-v2-1`
**Base commit:** `521b4dc` (Day 2 close)
**Target commit:** `day-3a` merge

---

## §1 SCOPE & BINDING

Day 3a ships the **structural shell** per Nav v2.1 Addendum §2–§5, §11, §13. No features, just the chassis.

**In scope (Day 3a):**
1. Install `lucide-react` as canonical icon library (Nav v2.1 §13 binding)
2. Keep `FarmerShell.jsx` filename — upgrade internals in place
3. Top bar rebuild: full Facebook-pattern with Logo / Search (stub) / 4 pillar tabs / `[+ Log]` visual button / 🔔 / 💬 (disabled) / Me ▾ avatar dropdown
4. Left rail rebuild: per-pillar sub-nav (not primary nav). Farm pillar's 14 sub-items live. Home / Classroom / TIS / Me have stub sub-nav.
5. Bottom nav rebuild: drop Me tab, add `(+)` center raised slot (visual only — handler is stub toast for Day 3a), swap hand-rolled SVG for lucide
6. 🔔 Notifications panel: wired to SSE stream shipped Day 2 (`GET /api/v1/tis/stream`). Reads + dismisses via existing `POST /api/v1/tis/advisories/{id}/read`.

**Out of scope (deferred to Day 3b):**
- Farm View Mode dropdown (Solo / Growth / Commercial detail-level toggle)
- Migration 030 (`auth.users.farm_view_preference` column)
- Universal `(+)` LogSheet with tile grid (the action sheet content)
- Voice intent parser hookup for `(+)`
- Task Engine auto-complete when `(+)` action satisfies open task

**Out of scope entirely (Day 7-8 cleanup):**
- FarmerLayout orphans (Community, Members, FarmerCalendar, Leaderboard, CommunityMap, KnowledgeBase, FarmManager, /tis standalone, /harvest dead route)

---

## §2 SACRED FILE DISPENSATION

**Part 23 Rule 28 lists as sacred:** `BottomNav.jsx`, `TopAppBar.jsx`, `FarmerShell.jsx`, `App.jsx`.

**Nav v2.1 Addendum §8 + §280 supersede Part 23 Rule 28 for shell files.** In-place structural edits are permitted, recorded explicitly in commit message with the phrase `Nav v2.1 supersession of Part 23 Rule 28`.

**Dispensation scope:**
- `BottomNav.jsx` — full internal rewrite (new slots, lucide icons). Filename kept.
- `TopAppBar.jsx` — full internal rewrite (Facebook pattern). Filename kept.
- `FarmerShell.jsx` — internal restructure (sidebar removed, LeftRail added, existing TisFab + TisModal kept as-is).
- `App.jsx` — additive only (no route changes). Route element wrappers unchanged.

**Dispensation does NOT extend to:** Caddyfile, auth pages, tis-bridge, OpenClaw config, Alembic migrations 001–029. All remain fully sacred.

---

## §3 PACKAGE & ENVIRONMENT

### lucide-react install

```bash
cd /opt/teivaka/frontend
npm install lucide-react@0.383.0
```

Lock to `0.383.0` per v4 Master Build Instruction Part 2 allowed libraries list. Commit `package.json` + `package-lock.json` in the Day 3a commit.

**Verify install:**
```bash
grep '"lucide-react"' /opt/teivaka/frontend/package.json
# expected: "lucide-react": "^0.383.0"
```

### Vite rebuild

After all file changes:
```bash
cd /opt/teivaka/frontend && npm run build
ls -lh dist/assets/index-*.js | head -1
# new hash = successful build. Record hash in close report.
```

Caddy serves `/opt/teivaka/frontend/dist/` — no compose rebuild needed for frontend-only changes.

---

## §4 FILE MANIFEST

### New files (9)

| Path | Purpose | Est LOC |
|------|---------|---------|
| `components/nav/PillarTabs.jsx` | Top bar center cluster — 4 pillar links with active state | ~80 |
| `components/nav/SearchBar.jsx` | Top bar left cluster — stub search input (routes submit to toast) | ~50 |
| `components/nav/RightCluster.jsx` | Top bar right cluster — `[+Log]` pill + 🔔 + 💬 + Me ▾ | ~70 |
| `components/nav/NotificationsPanel.jsx` | 🔔 dropdown — consumes SSE stream, lists advisories, marks read | ~180 |
| `components/nav/MeMenu.jsx` | Me ▾ avatar dropdown — 8 items (Profile/Settings/Switch mode/Subscription/Referrals/Team/Export/Sign out) | ~120 |
| `components/nav/LeftRail.jsx` | Per-pillar sub-nav (desktop + tablet), hamburger drawer (mobile) | ~200 |
| `components/nav/pillarSubNavMap.js` | Source of truth: pillar → sub-items (from Nav v2 §3) | ~100 |
| `components/nav/UniversalLogButton.jsx` | `(+)` button component — renders center slot (mobile) + pill (desktop). Day 3a: onClick = toast. Day 3b: opens LogSheet. | ~80 |
| `hooks/useTisSse.js` | SSE connection hook for NotificationsPanel — opens `GET /api/v1/tis/stream`, parses events, exposes `{advisories, markRead}` | ~90 |

### Modified files (4 — sacred dispensation)

| Path | Change |
|------|--------|
| `layouts/FarmerShell.jsx` | Remove inline Sidebar component. Import and render `<LeftRail />`. Keep TisFab + TisModal + Cmd/Ctrl+K handler. |
| `components/nav/TopAppBar.jsx` | Full rewrite — Logo + `<SearchBar />` + `<PillarTabs />` + `<RightCluster />`. Remove inline TrialChip (move to Me menu subscription entry). |
| `components/nav/BottomNav.jsx` | Full rewrite — new slots `[Home][Classroom][(+)][Farm][TIS]`, lucide icons, `(+)` raised center slot. |
| `App.jsx` | Additive only — ensure `/farm/*` child routes exist so LeftRail's sub-nav targets are valid. Add stubs for `/farm/cycles`, `/farm/harvests`, `/farm/field-events`, etc. that render a "Coming soon" placeholder page. |

### Modified files (1 — non-sacred)

| Path | Change |
|------|--------|
| `frontend/package.json` + `package-lock.json` | `lucide-react@0.383.0` added |

---

## §5 PER-PILLAR SUB-NAV MAP (source of truth — from Nav v2 §3)

**This is canonical. `pillarSubNavMap.js` exports exactly this structure.**

```js
// components/nav/pillarSubNavMap.js
import {
  Users, Bookmark, Store, Map,
  BookOpen, PlayCircle, TrendingUp, Award,
  Tractor, ListTodo, Sprout, Package, CloudRain, Warehouse,
  Users2, Coins, Contact, Truck, Shield, BarChart3, FileText, MapPin,
  Sparkles, History, Mic, Gauge,
  User, Settings, RefreshCw, CreditCard, Gift, UsersRound, Download, LogOut
} from "lucide-react";

export const PILLAR_SUB_NAV = {
  "/home": {
    label: "Home",
    items: [
      { path: "/home",              label: "Feed",        icon: Users },
      { path: "/home/following",    label: "Following",   icon: UsersRound },
      { path: "/home/marketplace",  label: "Marketplace", icon: Store,    phase: 8 },
      { path: "/home/directory",    label: "Directory",   icon: Contact,  phase: 8 },
      { path: "/home/saved",        label: "Saved",       icon: Bookmark },
    ],
  },
  "/classroom": {
    label: "Classroom",
    items: [
      { path: "/classroom",               label: "Tracks",         icon: BookOpen },
      { path: "/classroom/progress",      label: "Progress",       icon: TrendingUp },
      { path: "/classroom/certifications",label: "Certifications", icon: Award },
    ],
  },
  "/farm": {
    label: "Farm",
    items: [
      { path: "/farm",               label: "Overview",    icon: Tractor },
      { path: "/farm/tasks",         label: "Tasks",       icon: ListTodo },
      { path: "/farm/cycles",        label: "Cycles",      icon: Sprout },
      { path: "/farm/harvests",      label: "Harvests",    icon: Package },
      { path: "/farm/field-events",  label: "Field Events",icon: CloudRain },
      { path: "/farm/inventory",     label: "Inventory",   icon: Warehouse },
      { path: "/farm/labor",         label: "Labor",       icon: Users2 },
      { path: "/farm/cash",          label: "Cash",        icon: Coins },
      { path: "/farm/buyers",        label: "Buyers",      icon: Contact },
      { path: "/farm/equipment",     label: "Equipment",   icon: Truck,     phase: "6.5" },
      { path: "/farm/compliance",    label: "Compliance",  icon: Shield },
      { path: "/farm/analytics",     label: "Analytics",   icon: BarChart3 },
      { path: "/farm/reports",       label: "Reports",     icon: FileText },
      { path: "/farm/locations",     label: "Locations",   icon: MapPin,    phase: "5.5" },
    ],
  },
  "/tis": {
    label: "TIS",
    items: [
      { path: "/tis",         label: "Chat",    icon: Sparkles },
      { path: "/tis/history", label: "History", icon: History },
      { path: "/tis/voice",   label: "Voice",   icon: Mic,    phase: 5 },
      { path: "/tis/usage",   label: "Usage",   icon: Gauge },
    ],
  },
};

// Me is NOT a pillar — it's the top-right avatar dropdown.
// Items below drive MeMenu.jsx.
export const ME_MENU_ITEMS = [
  { path: "/me",               label: "Profile",       icon: User },
  { path: "/me/settings",      label: "Settings",      icon: Settings },
  { path: "/me/settings/mode", label: "Switch mode",   icon: RefreshCw },
  { path: "/me/subscription",  label: "Subscription",  icon: CreditCard },
  { path: "/me/referrals",     label: "Referrals",     icon: Gift },
  { path: "/me/team",          label: "Team",          icon: UsersRound, phase: "4.3" },
  { path: "/me/data",          label: "Export data",   icon: Download },
  // Sign out is rendered separately at the bottom of the menu with onClick={logout}
];
```

### Sub-items with `phase` field

Render with a 🔒 lock icon (lucide `Lock`, 12×12) next to the label. Click routes to a placeholder page (`/stub/phase-:phaseNum`) showing:

> "This feature ships in Phase :phaseNum. You're on the waitlist — we'll notify you when it's live."

**Honesty principle (Nav v2.1 §12.4):** we expose the capability we intend to ship. We do not hide it. We do not pretend it works.

---

## §6 COMPONENT SPECS

### §6.1 `TopAppBar.jsx` — full rewrite

**Desktop / tablet layout (≥768px):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [LOGO]  [🔍 Search]   [Home][Class][Farm][TIS]   [+Log][🔔][💬][Me▾]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Mobile layout (<768px):**

```
┌─────────────────────────────────────────────┐
│ [LOGO]  [🔍]              [🔔][💬][Me]     │
└─────────────────────────────────────────────┘
```

On mobile, `<PillarTabs />` and `[+Log]` are hidden — pillars live in BottomNav, `(+)` is the bottom-nav center slot.

**Height:** 56px desktop, 48px mobile. Sticky top (`position: sticky; top: 0; z-index: 40`).
**Background:** `#F8F3E9` (cream). Border-bottom: `1px solid #E6DED0`.

**Import structure:**
```jsx
import { Link } from "react-router-dom";
import PillarTabs from "./PillarTabs";
import SearchBar from "./SearchBar";
import RightCluster from "./RightCluster";

export default function TopAppBar() {
  return (
    <header className="sticky top-0 z-40" style={{...}}>
      <div className="h-14 md:h-14 px-4 flex items-center gap-6">
        {/* Left cluster */}
        <Link to="/home" className="flex items-center gap-2 flex-shrink-0">
          <TeivakaLogo />
        </Link>
        <div className="hidden md:block flex-shrink-0">
          <SearchBar />
        </div>
        <div className="md:hidden flex-shrink-0">
          <SearchIconButton onClick={() => setSearchOverlayOpen(true)} />
        </div>

        {/* Center cluster — desktop only */}
        <div className="hidden md:flex flex-1 justify-center">
          <PillarTabs />
        </div>
        <div className="md:hidden flex-1" />

        {/* Right cluster */}
        <RightCluster />
      </div>
    </header>
  );
}
```

**TrialChip:** deprecated from top bar. Move the "BASIC · Xd left" chip logic into MeMenu.jsx as the first entry label when trial active (e.g. "Subscription (Trial: 9d left)").

### §6.2 `PillarTabs.jsx` — new

4 pillar links: Home / Classroom / Farm / TIS. Active link underlined with `#6AA84F`, weight 600. Inactive soil `#5C4033`, weight 500. Hover `#EAF3DE` background.

```jsx
import { NavLink } from "react-router-dom";

const PILLARS = [
  { path: "/home",      label: "Home" },
  { path: "/classroom", label: "Classroom" },
  { path: "/farm",      label: "Farm" },
  { path: "/tis",       label: "TIS" },
];

export default function PillarTabs() {
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {PILLARS.map(p => (
        <NavLink
          key={p.path}
          to={p.path}
          className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
          style={({ isActive }) => ({
            color: isActive ? "#6AA84F" : "#5C4033",
            fontWeight: isActive ? 600 : 500,
            borderBottom: isActive ? "2px solid #6AA84F" : "2px solid transparent",
          })}
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

NavLink uses pathname prefix match — `/farm/cycles` still highlights Farm as active. Use `end={false}` (default).

### §6.3 `SearchBar.jsx` — stub

Visible text input with search icon (lucide `Search`, 16×16). On submit, fire a toast: **"Global search launches in Phase 8. For now, navigate via pillars."** Keyboard shortcut `/` focuses it. Keyboard shortcut `Esc` blurs.

```jsx
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

export default function SearchBar() {
  const ref = useRef(null);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === ref.current) {
        ref.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("tfos:toast", {
      detail: { message: "Global search launches in Phase 8. For now, navigate via pillars." }
    }));
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#5C4033" }} />
      <input
        ref={ref}
        type="search"
        placeholder="Search  (/)"
        className="pl-9 pr-3 py-2 text-sm rounded-md border w-64"
        style={{ background: "#FFFFFF", borderColor: "#E6DED0", color: "#5C4033" }}
      />
    </form>
  );
}
```

**Toast infrastructure:** If a global toast component does not yet exist, create a minimal `<Toast />` mounted in FarmerShell that listens for `tfos:toast` CustomEvent. Auto-dismiss 4s.

### §6.4 `RightCluster.jsx` — new

Contains `[+Log]` pill (desktop only, hidden mobile), 🔔 NotificationsPanel trigger, 💬 Messages (disabled stub), Me ▾ avatar.

```jsx
import { useState } from "react";
import { Bell, MessageSquare, ChevronDown } from "lucide-react";
import UniversalLogButton from "./UniversalLogButton";
import NotificationsPanel from "./NotificationsPanel";
import MeMenu from "./MeMenu";

export default function RightCluster() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="hidden md:block">
        <UniversalLogButton variant="pill" />
      </div>
      <IconButton icon={Bell} label="Notifications" onClick={() => setNotifOpen(v => !v)} badge />
      <IconButton icon={MessageSquare} label="Messages (Phase 8)" disabled title="In-app chat launches in Phase 8" />
      <button
        onClick={() => setMeOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[#EAF3DE]"
        aria-label="Account menu"
      >
        <Avatar />
        <ChevronDown size={14} style={{ color: "#5C4033" }} />
      </button>

      {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      {meOpen && <MeMenu onClose={() => setMeOpen(false)} />}
    </div>
  );
}
```

**Avatar:** 28×28 circle. If user has an `avatar_url` on `/api/v1/auth/me`, render image. Else render initials on soil-green circle.

### §6.5 `NotificationsPanel.jsx` — new

Dropdown panel anchored below the bell. 360px wide. Max height 480px, scroll.

- Consumes `useTisSse()` hook for live advisories.
- Also fetches backlog via `GET /api/v1/tis/advisories?unread=true` on open.
- Each row: priority color bar (LOW gray, MEDIUM amber, HIGH orange, CRITICAL red), preview text (truncate 2 lines), relative timestamp ("5m ago"), click marks read via `POST /api/v1/tis/advisories/{id}/read`.
- Empty state: lucide `Bell` icon 48×48 + "All caught up. TIS will ping you here when something needs attention."
- Red dot badge on bell icon when any unread MEDIUM+ advisory.
- Orange pulse ring on bell for CRITICAL unread — cannot be dismissed without opening panel.

### §6.6 `useTisSse.js` — new hook

```jsx
import { useEffect, useState, useCallback } from "react";

export function useTisSse() {
  const [advisories, setAdvisories] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tfos_access_token");
    if (!token) return;

    // EventSource does NOT support headers — use ?token= param OR fetch with ReadableStream
    // Backend: GET /api/v1/tis/stream accepts either Bearer header or ?access_token= query param
    const url = `/api/v1/tis/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("advisory", (e) => {
      const data = JSON.parse(e.data);
      setAdvisories(prev => {
        if (prev.find(a => a.advisory_id === data.advisory_id)) return prev;
        return [data, ...prev];
      });
    });

    es.addEventListener("ping", () => {}); // heartbeat, no-op

    return () => es.close();
  }, []);

  const markRead = useCallback(async (advisory_id) => {
    const token = localStorage.getItem("tfos_access_token");
    await fetch(`/api/v1/tis/advisories/${advisory_id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setAdvisories(prev => prev.map(a => a.advisory_id === advisory_id ? { ...a, read_at: new Date().toISOString() } : a));
  }, []);

  return { advisories, connected, markRead };
}
```

**Backend follow-up (flag, not fix):** `GET /api/v1/tis/stream` shipped Day 2 accepts `Authorization: Bearer` only. Day 3a client needs `?access_token=` query param fallback for EventSource (which cannot set headers). Update `app/routers/tis_stream.py` to accept either. Small change, same commit.

### §6.7 `MeMenu.jsx` — new

Dropdown anchored below avatar. 240px wide. Renders `ME_MENU_ITEMS` from pillarSubNavMap + Sign out button at bottom.

- Trial chip rendered as subtitle on Subscription row if user is BASIC + trial active.
- Click outside closes. Esc closes.
- Sign out: clears localStorage tokens, calls `/api/v1/auth/logout`, redirects to `/login`.

### §6.8 `BottomNav.jsx` — full rewrite

**Mobile only (hidden ≥768px).** 5 slots: Home / Classroom / (+) / Farm / TIS.

```jsx
import { NavLink } from "react-router-dom";
import { Users, BookOpen, Tractor, Sparkles } from "lucide-react";
import UniversalLogButton from "./UniversalLogButton";

const C = { soil: "#5C4033", green: "#6AA84F", border: "#E6DED0", cream: "#F8F3E9" };

const LEFT_TABS = [
  { path: "/home",      label: "Home",  Icon: Users },
  { path: "/classroom", label: "Learn", Icon: BookOpen },
];
const RIGHT_TABS = [
  { path: "/farm", label: "Farm", Icon: Tractor },
  { path: "/tis",  label: "TIS",  Icon: Sparkles },
];

function NavItem({ tab }) {
  const { Icon } = tab;
  return (
    <NavLink
      to={tab.path}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium select-none"
      style={({ isActive }) => ({ color: isActive ? C.green : C.soil })}
    >
      <Icon size={22} strokeWidth={1.75} />
      <span>{tab.label}</span>
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
        height: "64px",
      }}
      aria-label="Primary"
    >
      <div className="flex items-stretch max-w-md mx-auto h-full relative">
        {LEFT_TABS.map(t => <NavItem key={t.path} tab={t} />)}

        {/* Raised center slot — (+) */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="absolute -top-3">
            <UniversalLogButton variant="center" />
          </div>
        </div>

        {RIGHT_TABS.map(t => <NavItem key={t.path} tab={t} />)}
      </div>
    </nav>
  );
}
```

**Note:** `Me` is removed. `Classroom` label shortens to `Learn` per Nav v2.1 §4.1 table.

### §6.9 `UniversalLogButton.jsx` — new

Two variants:

**`variant="center"`** — round 56×56 (48×48 on <380px), primary green background, lucide `Plus` 28×28 white, 6px raised above bottom-nav baseline, shadow-level-2. Used in BottomNav.

**`variant="pill"`** — `[+ Log]` pill in top bar right cluster, desktop/tablet only. 32px tall, `#6AA84F` background, white text, lucide `Plus` 16×16 + "Log" label.

**Day 3a handler:**
```jsx
function onClick() {
  window.dispatchEvent(new CustomEvent("tfos:toast", {
    detail: { message: "Log sheet launches tomorrow (Day 3b)." }
  }));
}
```

**Day 3b replacement:** onClick opens `<LogSheet />` full-screen bottom sheet (mobile) / centered modal (desktop). Same component interface — Day 3b swaps internals only.

Keyboard shortcut `Cmd/Ctrl + L` fires same handler. Stubbed for Day 3a.

### §6.10 `LeftRail.jsx` — new

Per-pillar sub-nav rail.

**Desktop / tablet (≥768px):**
- 200px wide (desktop), 168px (tablet)
- Fixed left, top-0 below TopAppBar (top: 56px), bottom-0
- Header shows pillar label (e.g. "Farm") in `#5C4033` weight 600, 16pt
- Items from `PILLAR_SUB_NAV[currentPillar].items`
- Active item: background `#EAF3DE`, left border `3px solid #6AA84F`, weight 500
- Inactive: transparent, weight 400, hover `#EAF3DE`
- Phase-gated items (phase field): lucide `Lock` 12×12 after label, route to `/stub/phase-:phaseNum`
- Scroll independently if overflows viewport (Farm's 14 items on short laptops)

**Mobile (<768px):**
- Collapsed behind hamburger drawer. Triggered by a slim bar under TopAppBar showing `[☰] Farm › Overview`
- Drawer opens from left edge, full height, 280px wide, overlay behind

**Current pillar detection:**
```js
const pathname = useLocation().pathname;
const currentPillar = Object.keys(PILLAR_SUB_NAV).find(p => pathname.startsWith(p));
// fallback to /farm if no match (e.g. /me/* has no rail — render nothing)
if (!currentPillar) return null;
```

### §6.11 `FarmerShell.jsx` — internal restructure

```jsx
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import TopAppBar from "../components/nav/TopAppBar";
import BottomNav from "../components/nav/BottomNav";
import LeftRail from "../components/nav/LeftRail";
import TisFab from "../components/tis/TisFab";
import TisModal from "../components/tis/TisModal";
import Toast from "../components/ui/Toast"; // new minimal toast component

const C = { cream: "#F8F3E9", soil: "#5C4033" };

export default function FarmerShell() {
  const [tisOpen, setTisOpen] = useState(false);
  const location = useLocation();
  const hideFab = location.pathname === "/tis" || location.pathname.startsWith("/tis/");

  // Cmd/Ctrl+K — TIS modal
  useEffect(() => {
    function onKey(e) {
      if (typeof window !== "undefined" && window.innerWidth < 768) return;
      const isToggle = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isToggle) return;
      e.preventDefault();
      setTisOpen(o => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
      <TopAppBar />
      <LeftRail />
      <div className="md:ml-[200px] lg:ml-[200px] flex flex-col min-h-[calc(100vh-56px)]">
        <main className="flex-1 pb-24 md:pb-8">
          <div className="max-w-screen-md mx-auto px-4 py-5">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      {!hideFab && <TisFab onClick={() => setTisOpen(true)} />}
      <TisModal open={tisOpen} onClose={() => setTisOpen(false)} />
      <Toast />
    </div>
  );
}
```

**Removed:** inline `Sidebar` component + `FARMER_TABS` import (BottomNav no longer exports that — now has its own internal LEFT_TABS / RIGHT_TABS).

### §6.12 `App.jsx` — additive sub-route stubs

Under the existing `<Route element={<FarmerRoute><FarmerShell /></FarmerRoute>}>` block, add:

```jsx
<Route path="/farm/tasks"        element={<ComingSoon title="Tasks" phase="4.2" />} />
<Route path="/farm/cycles"       element={<ComingSoon title="Cycles" phase="4.3" />} />
<Route path="/farm/harvests"     element={<ComingSoon title="Harvests" phase="4.3" />} />
<Route path="/farm/field-events" element={<ComingSoon title="Field Events" phase="4.2" />} />
<Route path="/farm/inventory"    element={<ComingSoon title="Inventory" phase="5" />} />
<Route path="/farm/labor"        element={<ComingSoon title="Labor" phase="4.2" />} />
<Route path="/farm/cash"         element={<ComingSoon title="Cash" phase="4.2" />} />
<Route path="/farm/buyers"       element={<ComingSoon title="Buyers" phase="6" />} />
<Route path="/farm/equipment"    element={<ComingSoon title="Equipment" phase="6.5" />} />
<Route path="/farm/compliance"   element={<ComingSoon title="Compliance" phase="4.2" />} />
<Route path="/farm/analytics"    element={<ComingSoon title="Analytics" phase="4.2" />} />
<Route path="/farm/reports"      element={<ComingSoon title="Reports" phase="6" />} />
<Route path="/farm/locations"    element={<ComingSoon title="Locations" phase="5.5" />} />

<Route path="/stub/phase-:phaseNum" element={<ComingSoon dynamic />} />
```

**Additive only** — no existing route touched, no wrapper changed. Pure append.

**`<ComingSoon />` component:** new file `pages/ComingSoon.jsx`. Renders:

```
┌────────────────────────────────────────────┐
│  [lucide Construction icon 48×48]          │
│                                            │
│  Tasks                                     │
│  Launching in Phase 4.2                    │
│                                            │
│  TIS is ready for you. Tap the sparkles    │
│  button anytime to ask what you should do  │
│  right now.                                │
└────────────────────────────────────────────┘
```

---

## §7 ICON MIGRATION MAP

Every hand-rolled SVG in BottomNav.jsx is replaced with a lucide-react import. Mapping:

| Old (inline SVG name) | New (lucide-react) |
|-----------------------|--------------------|
| IconUsers | `Users` |
| IconBookOpen | `BookOpen` |
| IconTractor | `Tractor` |
| IconSparkles | `Sparkles` |
| IconUser | (dropped — Me removed from BottomNav) |

All icons: `strokeWidth={1.75}`, `size={22}` (non-center slots), `size={28}` (center slot icon inside (+) button), color inherits from `currentColor`.

---

## §8 VERIFICATION CHECKLIST

Run all of these before calling Day 3a shipped.

### §8.1 Build

```bash
cd /opt/teivaka/frontend && npm run build
ls -lh dist/assets/index-*.js | head -1
# record new bundle hash in close report
```

### §8.2 lucide-react installed

```bash
grep '"lucide-react"' /opt/teivaka/frontend/package.json
# expected: "lucide-react": "^0.383.0"
```

### §8.3 Visual — Desktop (≥1024px)

| Route | What must render |
|-------|------------------|
| `/home` | Top bar with logo/search/pillars (Home active)/+Log/🔔/💬 disabled/Me▾. Left rail with Home sub-items (Feed active, Marketplace + Directory have 🔒). No bottom nav. |
| `/farm` | Top bar with Farm active. Left rail with 14 Farm items (Overview active, Equipment + Locations have 🔒). |
| `/farm/harvest/new` | Top bar Farm active. Left rail shows Farm items (none active since route is not in rail). Harvest form renders in main. |
| `/classroom` | Top bar Classroom active. Left rail with 3 Classroom items. |
| `/me` | Top bar — Me avatar shows current user initials/image. Left rail: none (Me is dropdown, no pillar). Main shows profile. |

### §8.4 Visual — Tablet (768-1023px)

- Same as desktop but left rail is 168px wide, pillar tab labels may truncate at Classroom → "Learn".

### §8.5 Visual — Mobile (<768px)

| Route | What must render |
|-------|------------------|
| `/home` | Top bar compressed: logo + 🔍 icon + 🔔 + 💬 + Me avatar. No pillar tabs. No +Log pill. Bottom nav with Home active. No left rail (behind hamburger). |
| `/farm` | Top bar compressed. Bottom nav with Farm active. Slim sub-nav bar under top bar: `[☰] Farm › Overview`. Tap ☰ opens left drawer with Farm's 14 items. |
| Bottom nav on all 5 routes | Slots: Home / Learn / (+) / Farm / TIS. (+) is raised center green circle with white plus. No Me. |

### §8.6 Interactive

- `[+Log]` pill (desktop) tap → toast "Log sheet launches tomorrow (Day 3b)."
- `(+)` center button (mobile) tap → same toast.
- `Cmd/Ctrl + L` desktop → same toast.
- `/` key → focuses search input.
- Search submit → toast "Global search launches in Phase 8."
- 🔔 bell tap → opens NotificationsPanel. If no unread, shows empty state.
- 💬 tap → nothing happens (disabled), hover shows tooltip "In-app chat launches in Phase 8."
- Me avatar tap → opens MeMenu with 8 items + Sign out at bottom.
- Sign out → clears tokens, calls `/api/v1/auth/logout`, redirects `/login`.
- Cmd/Ctrl + K desktop → opens TisModal (unchanged from consolidation commit).
- TisFab bottom-right → opens TisModal (unchanged).
- TisFab NOT rendered on `/tis` or `/tis/*`.

### §8.7 SSE wire-up

Connect from browser dev console:
```js
fetch("/api/v1/tis/advisories", { headers: { Authorization: `Bearer ${localStorage.getItem("tfos_access_token")}` }})
  .then(r => r.json()).then(console.log)
```

Should return unread advisory list. NotificationsPanel renders them.

Trigger a test advisory:
```bash
docker exec -t teivaka_db psql -U teivaka -d teivaka -P pager=off -c "
  INSERT INTO tenant.tis_advisories (tenant_id, user_id, priority, preview, full_message)
  VALUES ('<F001_TENANT_UUID>', '<CODY_USER_UUID>', 'MEDIUM',
          'Day 3a shell test advisory.', 'If you see this in the bell panel, SSE is wired.');"
```

Panel should receive event within 5 seconds of insert. Red dot on bell.

### §8.8 Sacred file commit message

Commit message MUST include the phrase:
> `Nav v2.1 supersession of Part 23 Rule 28 — shell structural edits applied to FarmerShell.jsx, BottomNav.jsx, TopAppBar.jsx in-place per v2.1 Addendum §8/§280.`

---

## §9 DECISION TREE BINDINGS

Apply autonomously. Report any novel drift as S-28+ proposals in the close report.

- **S-11** (envelope drift on new auth/me fetch) — defensive parser `body?.data ?? body`.
- **S-12** (sacred file edit) — **pre-approved** in §2 of this spec. Record the supersession phrase in commit message.
- **S-13** (Part 4 drift list) — any new column touch appended to drift list in next housekeeping commit. No schema changes in Day 3a anyway.
- **S-15** (frontend/DB name conflict) — apply at display layer. BottomNav label "Learn" for /classroom is display-only; route stays `/classroom`.
- **S-16** (rebuild vs restart) — frontend build = `npm run build`. No Docker rebuild needed (Caddy serves dist/).
- **S-18** (Caddyfile sacred) — do NOT touch Caddyfile. Caddy already serves dist/.
- **S-21** (Universal Naming v2 — "Block" not "Patch") — no new user-facing labels introduced in Day 3a, but if Farm sub-nav item label needs Universal Naming check, use "Locations" (catalog-neutral) or "Blocks" per Universal Naming v2.
- **S-25** (no lucide match) — use nearest + text fallback. Current §5 icon map already resolved every needed icon.

---

## §10 KNOWN DEFERRALS (Day 3b + later)

1. **Farm View Mode dropdown** — `<FarmViewModeDropdown />` on `/farm` landing, toggles Solo/Growth/Commercial rendering density. Day 3b.
2. **Migration 030** — `auth.users.farm_view_preference VARCHAR(16)` with CHECK. Day 3b.
3. **Universal (+) LogSheet** — full tile grid (3 Solo / 8 Growth / 14 Commercial). Day 3b.
4. **Voice intent parser for (+)** — long-press (+) → Whisper → TIS → endpoint. Phase 5.
5. **Task Engine auto-complete on (+)** — if (+) action matches open task, auto-complete it. Day 3b or Day 4.
6. **Global search backend** — `GET /api/v1/search?q=...`. Phase 8.
7. **In-app messages** — DM tables + endpoints + panel wiring. Phase 8.
8. **FarmerLayout orphan retirement** — migrate or delete 7 orphan routes. Day 7-8.
9. **SSE stream `?access_token=` query param** — tiny backend change for EventSource compatibility. Day 3a same-commit if trivial, else Day 3b.
10. **Toast component** — minimal first version in Day 3a. Consider upgrading to a queue-based system in Phase 5.

---

## §11 CLOSE REPORT TEMPLATE

Claude Code fills and returns this at Day 3a close:

```
Day 3a Close Report

Commit: <hash> on feature/option-3-plus-nav-v2-1
New bundle hash: index-<hash>.js

Files created (9):
- ...

Files modified (sacred, dispensation recorded): 4
- ...

Files modified (non-sacred): 1 (package.json + lock)

Verification:
[ ] §8.1 Build succeeded, new hash recorded
[ ] §8.2 lucide-react 0.383.0 in package.json
[ ] §8.3 Desktop: 5 routes verified
[ ] §8.4 Tablet: 5 routes verified
[ ] §8.5 Mobile: 5 routes verified
[ ] §8.6 Interactive: all 11 checks pass
[ ] §8.7 SSE advisory delivered to NotificationsPanel within 5s
[ ] §8.8 Commit message contains supersession phrase

Decision Tree applied: <list scenario IDs>

Novel drift (if any, proposed as S-28+): <describe>

Known follow-ups flagged (not fixed):
- ...

Day 3a complete.
```

---

**END OF SPEC**

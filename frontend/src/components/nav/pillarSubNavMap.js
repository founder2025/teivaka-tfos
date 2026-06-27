/**
 * pillarSubNavMap.js — canonical pillar → sub-nav map (Nav v2.1 §5).
 *
 * Source of truth consumed by LeftRail.jsx and MeMenu.jsx.
 * Items with a `phase` field render with a lock icon and route to
 * `/stub/phase-:phaseNum`. Items without `phase` are live or Coming Soon.
 *
 * Me is NOT a pillar — it is the top-right avatar dropdown. ME_MENU_ITEMS
 * drives MeMenu.jsx. Sign out is rendered separately.
 */
import {
  Users, Bookmark, Store, Contact, UsersRound,
  BookOpen, TrendingUp, Award,
  Tractor, ListTodo, Sprout, Package, CloudRain, Warehouse,
  Users2, Coins, Truck, Shield, BarChart3, FileText, MapPin,
  Library, Crosshair,
  Sparkles, Clock, Mic, Activity,
  User, Settings, RefreshCw, CreditCard, Gift, Download,
  Eye, CheckSquare, LayoutGrid, DollarSign, Wrench, Map, Cloud, Image, Share2,
  GraduationCap, Home, Plus, Wallet, Briefcase,
} from "lucide-react";

export const PILLAR_SUB_NAV = {
  "/home": {
    label: "Home",
    items: [
      { path: "/home",             label: "Feed",          icon: Users },
      { path: "/home/following",   label: "Following",     icon: UsersRound },
      { path: "/home/marketplace", label: "Marketplace",   icon: Store },
      { path: "/home/work",        label: "Work & hire",   icon: Briefcase },
      { path: "/home/prices",      label: "Market prices", icon: TrendingUp },
      { path: "/home/directory",   label: "Directory",     icon: Contact },
      { path: "/members",          label: "Network map",   icon: MapPin },
      { path: "/home/groups",      label: "Groups",        icon: Users2 },
    ],
  },
  "/classroom": {
    label: "Classroom",
    items: [
      { path: "/classroom",               label: "Overview",     icon: BookOpen },
      { path: "/classroom/courses",       label: "Courses",      icon: LayoutGrid },
      { path: "/classroom/library",       label: "Library",      icon: Library },
      { path: "/classroom/instructors",   label: "Instructors",  icon: GraduationCap },
      { path: "/classroom/learning",      label: "My learning",  icon: TrendingUp },
      { path: "/classroom/certificates",  label: "Certificates", icon: Award },
      { path: "/classroom/saved",         label: "Saved",        icon: Bookmark },
    ],
  },
  "/farm": {
    // Consolidated to merged destinations in natural farming order
    // (Plan → Grow → Sell → Prove → Improve → Account). Old routes
    // (history/decisions/inventory/labor/buyers/cash/equipment/locations/
    // analytics/reports/gallery) redirect into their merged home in App.jsx.
    label: "Farm",
    items: [
      { path: "/farm",              label: "Overview",     icon: Eye },
      { path: "/farm/tasks",        label: "Tasks",        icon: CheckSquare },
      { path: "/farm/weather",      label: "Weather",      icon: Cloud },
      { path: "/farm/enterprises",  label: "Enterprises",  icon: LayoutGrid },
      { path: "/farm/cycles",       label: "Production",   icon: Sprout },
      { path: "/farm/field-events", label: "Field log",    icon: Activity },
      { path: "/farm/resources",    label: "Resources",    icon: Package },
      { path: "/farm/market",       label: "Market",       icon: Truck },
      { path: "/farm/money",        label: "Money",        icon: Wallet },
      { path: "/farm/compliance",   label: "Compliance",   icon: Shield },
      { path: "/farm/records",      label: "Records",      icon: FileText },
      { path: "/farm/history",      label: "History",      icon: Clock },
      { path: "/farm/insights",     label: "Insights",     icon: BarChart3 },
      { path: "/farm/library",      label: "Library",      icon: Library },
      { path: "/farm/partnerships", label: "Partnerships", icon: Share2 },
      { path: "/farm/settings",     label: "Settings",     icon: Settings },
    ],
  },
  "/tis": {
    label: "TIS",
    items: [
      { path: "/tis",         label: "Chat",         icon: Sparkles },
      { path: "/tis/plan",    label: "Plan my farm", icon: Sprout },
      { path: "/tis/history", label: "History",      icon: Clock },
      { path: "/tis/voice",   label: "Voice",   icon: Mic,    phase: "5" },
      { path: "/tis/usage",   label: "Usage",   icon: Activity },
    ],
  },
};

/**
 * FARM_NAV_GROUPS — the Farm rail, collapsible groups in natural farming order
 * (Plan → Grow → Sell → Prove → Improve → Account). Built on the consolidated
 * merged destinations (Resources, Market, Money, Records, Insights), so nothing
 * points at a dead route — old routes redirect into these in App.jsx.
 * `kind`: "item" = standalone link (with sublabel), "group" = collapsible
 * section, "quickadd" = opens the (+) launcher. LeftRail renders this for /farm;
 * other pillars keep the flat list.
 */
export const FARM_NAV_GROUPS = [
  // Daily-use destinations are top-level items (one click, always-visible badge);
  // lower-frequency surfaces stay grouped. Natural order: Overview → daily →
  // Grow → Sell → Prove → Insights → Account.
  { kind: "item", path: "/farm", label: "Overview", sub: "Today's focus & farm health", icon: Eye },
  { kind: "item", path: "/farm/tasks", label: "Tasks", sub: "What to do today", icon: CheckSquare },
  { kind: "item", path: "/farm/weather", label: "Weather", sub: "Forecast & spray windows", icon: Cloud },
  {
    kind: "group", id: "grow", label: "Grow", sub: "Enterprises · production · resources",
    icon: Sprout, color: "#5C9A3F",
    items: [
      { path: "/farm/enterprises",  label: "Enterprises", icon: LayoutGrid },
      { path: "/farm/cycles",       label: "Production",  icon: Sprout },
      { path: "/farm/field-events", label: "Field log",   icon: Activity },
      { path: "/farm/resources",    label: "Resources",   icon: Package },
    ],
  },
  {
    kind: "group", id: "sell", label: "Sell", sub: "Market · money",
    icon: Coins, color: "#C9A227",
    items: [
      { path: "/farm/market", label: "Market", icon: Truck },
      { path: "/farm/money",  label: "Money",  icon: Wallet },
    ],
  },
  {
    kind: "group", id: "prove", label: "Prove", sub: "Compliance · records",
    icon: Shield, color: "#C0504D",
    items: [
      { path: "/farm/compliance", label: "Compliance", icon: Shield },
      { path: "/farm/records",    label: "Records",    icon: FileText },
    ],
  },
  { kind: "item", path: "/farm/insights", label: "Insights", sub: "Analytics & decisions", icon: BarChart3 },
  {
    kind: "group", id: "account", label: "Account", sub: "Library · partnerships · settings",
    icon: Library, color: "#2E6BB8",
    items: [
      { path: "/farm/library",      label: "Library",      icon: Library },
      { path: "/farm/partnerships", label: "Partnerships", icon: Share2 },
      { path: "/farm/settings",     label: "Settings",     icon: Settings },
    ],
  },
  { kind: "quickadd", label: "Quick Add", sub: "Log activity in seconds", icon: Plus, color: "#5C9A3F" },
];

// Avatar dropdown — parity with the prototype. `gate:"admin"` hides from non-admins;
// `external:true` is a full-page (non-SPA) link. The admin area lives under /admin.
export const ME_MENU_ITEMS = [
  { path: "/me",                   label: "Profile",          icon: User },
  { path: "/me/settings",          label: "Settings",         icon: Settings },
  { path: "/admin",                label: "Admin Command Center", icon: Shield, gate: "admin" },
  { path: "/me/payments",          label: "Payments",         icon: Coins },
  { path: "/me/subscription",      label: "Subscription tier", icon: CreditCard },
  { path: "/me/referrals",         label: "Referrals",        icon: Gift },
  { path: "/me/affiliate",         label: "Affiliate program", icon: Award },
  { path: "/me/team",              label: "Team",             icon: UsersRound },
  { path: "/covenant",             label: "View Covenant",    icon: Shield },
  { path: "/verify",               label: "Verify a record",  icon: CheckSquare, external: true },
  { path: "/me/data",              label: "Export data",      icon: Download },
];

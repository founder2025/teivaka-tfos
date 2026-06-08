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
  Library, Bird, Crosshair,
  Sparkles, Clock, Mic, Activity,
  User, Settings, RefreshCw, CreditCard, Gift, Download,
  Eye, CheckSquare, LayoutGrid, DollarSign, Wrench, Map, Cloud, Image, Share2,
} from "lucide-react";

export const PILLAR_SUB_NAV = {
  "/home": {
    label: "Home",
    items: [
      { path: "/home",             label: "Feed",        icon: Users },
      { path: "/home/following",   label: "Following",   icon: UsersRound },
      { path: "/home/marketplace", label: "Marketplace", icon: Store,   phase: "8" },
      { path: "/home/directory",   label: "Directory",   icon: Contact, phase: "8" },
      { path: "/home/saved",       label: "Saved",       icon: Bookmark },
    ],
  },
  "/classroom": {
    label: "Classroom",
    items: [
      { path: "/classroom",                label: "Tracks",         icon: BookOpen },
      { path: "/classroom/progress",       label: "Progress",       icon: TrendingUp },
      { path: "/classroom/certifications", label: "Certifications", icon: Award },
    ],
  },
  "/farm": {
    label: "Farm",
    items: [
      { path: "/farm",              label: "Overview",          icon: Eye },
      { path: "/farm/history",      label: "Farm History",      icon: Clock },
      { path: "/farm/tasks",        label: "Tasks",             icon: CheckSquare },
      { path: "/farm/decisions",    label: "Decision Center",   icon: Crosshair },
      { path: "/farm/enterprises",  label: "Enterprises",       icon: LayoutGrid },
      { path: "/farm/cycles",       label: "Production",        icon: Sprout },
      { path: "/farm/field-events", label: "Field Events",      icon: Activity },
      { path: "/farm/inventory",    label: "Inventory",         icon: Package },
      { path: "/farm/labor",        label: "Labor",             icon: Users2 },
      { path: "/farm/buyers",       label: "Buyers",            icon: Truck },
      { path: "/farm/cash",         label: "Cash",              icon: DollarSign },
      { path: "/farm/equipment",    label: "Assets & Equipment", icon: Wrench },
      { path: "/farm/locations",    label: "Locations",         icon: Map },
      { path: "/farm/compliance",   label: "Compliance",        icon: Shield },
      { path: "/farm/analytics",    label: "Analytics",         icon: BarChart3 },
      { path: "/farm/reports",      label: "Reports",           icon: FileText },
      { path: "/farm/weather",      label: "Weather",           icon: Cloud },
      { path: "/me/library",        label: "Library",           icon: Library },
      { path: "/farm/gallery",      label: "Gallery",           icon: Image },
      { path: "/farm/partnerships", label: "Partnerships",      icon: Share2 },
      { path: "/me/settings",       label: "Settings",          icon: Settings },
    ],
  },
  "/tis": {
    label: "TIS",
    items: [
      { path: "/tis",         label: "Chat",    icon: Sparkles },
      { path: "/tis/history", label: "History", icon: Clock },
      { path: "/tis/voice",   label: "Voice",   icon: Mic,    phase: "5" },
      { path: "/tis/usage",   label: "Usage",   icon: Activity },
    ],
  },
};

export const ME_MENU_ITEMS = [
  { path: "/me",               label: "Profile",      icon: User },
  { path: "/me/settings",      label: "Settings",     icon: Settings },
  { path: "/me/settings/mode", label: "Switch mode",  icon: RefreshCw },
  { path: "/me/subscription",  label: "Subscription", icon: CreditCard },
  { path: "/me/referrals",     label: "Referrals",    icon: Gift },
  { path: "/me/team",          label: "Team",         icon: UsersRound, phase: "4.3" },
  { path: "/me/data",          label: "Export data",  icon: Download },
];

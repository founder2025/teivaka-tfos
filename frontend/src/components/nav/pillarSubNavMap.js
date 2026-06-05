/**
 * pillarSubNavMap.js — pillar → sub-nav, mirrors the prototype NAV exactly.
 * Live routes are live; unbuilt surfaces carry `phase` (lock icon, /stub route).
 */
import {
  Home, UsersRound, Store, Contact, Bookmark,
  BookOpen, Layers, TrendingUp, Award,
  Eye, ListTodo, Crosshair, Grid2x2, Sprout, Package, Activity, Warehouse,
  Users2, Coins, Truck, Wrench, Shield, BarChart3, FileText,
  Image, MapPin, CloudRain, Library, Share2,
  Sparkles, Clock, Mic, Map,
  User, Settings, LayoutDashboard, CreditCard, Gift,
  Megaphone, LineChart, FileCheck, BadgeCheck, Download,
} from "lucide-react";

export const PILLAR_SUB_NAV = {
  "/home": {
    label: "Home",
    items: [
      { path: "/home",             label: "Feed",        icon: Home },
      { path: "/home/following",   label: "Following",   icon: UsersRound },
      { path: "/home/marketplace", label: "Marketplace", icon: Store,    phase: "8" },
      { path: "/home/directory",   label: "Directory",   icon: Contact,  phase: "8" },
      { path: "/home/saved",       label: "Saved",       icon: Bookmark },
    ],
  },
  "/classroom": {
    label: "Classroom",
    items: [
      { path: "/classroom",                label: "Overview",      icon: BookOpen },
      { path: "/classroom/tracks",         label: "Tracks",        icon: Layers,     phase: "4.3" },
      { path: "/classroom/progress",       label: "My progress",   icon: TrendingUp },
      { path: "/classroom/certifications", label: "Certification", icon: Award },
      { path: "/classroom/bookmarks",      label: "Bookmarks",     icon: Bookmark,   phase: "4.3" },
    ],
  },
  "/farm": {
    label: "Farm",
    items: [
      { path: "/farm",              label: "Overview",          icon: Eye },
      { path: "/farm/tasks",        label: "Tasks",             icon: ListTodo },
      { path: "/farm/decisions",    label: "Decision Center",   icon: Crosshair, phase: "5" },
      { path: "/farm/enterprises",  label: "Enterprises",       icon: Grid2x2,   phase: "5" },
      { path: "/farm/cycles",       label: "Production",        icon: Sprout },
      { path: "/farm/inventory",    label: "Inventory",         icon: Warehouse },
      { path: "/farm/labor",        label: "Labor",             icon: Users2 },
      { path: "/farm/buyers",       label: "Buyers",            icon: Truck },
      { path: "/farm/cash",         label: "Cash",              icon: Coins },
      { path: "/farm/equipment",    label: "Assets & Equipment", icon: Wrench },
      { path: "/farm/locations",    label: "Locations",         icon: MapPin },
      { path: "/farm/compliance",   label: "Compliance",        icon: Shield },
      { path: "/farm/analytics",    label: "Analytics",         icon: BarChart3 },
      { path: "/farm/reports",      label: "Reports",           icon: FileText },
      { path: "/farm/weather",      label: "Weather",           icon: CloudRain, phase: "5.5" },
      { path: "/me/library",        label: "Library",           icon: Library },
      { path: "/farm/gallery",      label: "Gallery",           icon: Image,   phase: "6.5" },
      { path: "/farm/partnerships", label: "Partnerships",      icon: Share2,  phase: "6.5" },
      { path: "/farm/settings",     label: "Settings",          icon: Settings, phase: "5" },
    ],
  },
  "/tis": {
    label: "TIS",
    items: [
      { path: "/tis",         label: "Chat",         icon: Sparkles },
      { path: "/tis/history", label: "History",      icon: Clock },
      { path: "/tis/voice",   label: "Voice",        icon: Mic, phase: "5" },
      { path: "/tis/plan",    label: "Plan my farm", icon: Map, phase: "5" },
      { path: "/tis/usage",   label: "Usage",        icon: Activity },
    ],
  },
};

export const ME_MENU_ITEMS = [
  { path: "/me",                   label: "Profile",           icon: User },
  { path: "/me/settings",          label: "Settings",          icon: Settings },
  { path: "/me/control-room",      label: "Control Room",      icon: LayoutDashboard, phase: "8" },
  { path: "/me/subscription",      label: "Subscription tier", icon: CreditCard },
  { path: "/me/referrals",         label: "Referrals",         icon: Gift },
  { path: "/me/affiliate",         label: "Affiliate program", icon: Megaphone,  phase: "6.5" },
  { path: "/me/affiliate/console", label: "Affiliate console", icon: LineChart,  phase: "6.5" },
  { path: "/me/team",              label: "Team",              icon: UsersRound, phase: "4.3" },
  { path: "/me/saved",             label: "Saved posts",       icon: Bookmark,   phase: "4.3" },
  { path: "/me/covenant",          label: "View Covenant",     icon: FileCheck,  phase: "6.5" },
  { path: "/me/verify",            label: "Verify a record",   icon: BadgeCheck, phase: "9" },
  { path: "/me/data",              label: "Export data",       icon: Download },
];

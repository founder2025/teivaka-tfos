/**
 * farmTours.js — first-visit guided-tour scripts for every Farm-pillar
 * destination, keyed by exact route. One registry → the shell-level FarmTourHost
 * auto-runs the right tour on first visit to each page (low-literacy: short
 * cards, one idea each). Steps that teach logging end by opening the (+).
 *
 * Step shape: { Icon, title, body, spotlight?, openLauncher?, actionLabel? }
 *  - spotlight: data-tour id to ring (falls back to centered card if absent)
 *  - openLauncher: final step opens the (+) launcher (the activating action)
 */
import {
  Eye, Clock, CheckSquare, Crosshair, LayoutGrid, Sprout, Activity, Package,
  Users2, Truck, DollarSign, Wrench, Map, Shield, BarChart3, FileText, Cloud,
  Library, Image, Share2, Settings, Plus, Bell, Leaf, HandCoins, Check,
} from "lucide-react";

export const FARM_TOURS = {
  "/farm": {
    key: "farm.overview",
    steps: [
      { Icon: Sprout, title: "Welcome to your farm", body: "This is your farm's home. Everything you do on the farm, you record here." },
      { Icon: Plus, title: "The green + button", body: "Tap the green + any time to record what you did — a sale, a harvest, money, anything.", spotlight: "log-fab" },
      { Icon: LayoutGrid, title: "Your farm menu", body: "Each item on the left is a part of your farm — Tasks, Money, Buyers and more." },
      { Icon: Leaf, title: "What's growing now", body: "Your crops and animals growing right now show on this page." },
      { Icon: Plus, title: "Let's start", body: "Tap below and log one thing you did today. That's all it takes.", actionLabel: "Log something", openLauncher: true },
    ],
  },
  "/farm/history": {
    key: "farm.history", steps: [
      { Icon: Clock, title: "Your farm history", body: "Every single thing you've logged shows here, newest first — a permanent record." },
      { Icon: Shield, title: "Tamper-proof", body: "Each record is sealed so nothing can be changed after. This is what makes a bank trust you." },
    ],
  },
  "/farm/tasks": {
    key: "farm.tasks", steps: [
      { Icon: CheckSquare, title: "Your tasks", body: "Jobs to do on the farm show here — some you add, some the system suggests." },
      { Icon: Check, title: "Tick them off", body: "Tap a task to mark it done. Doing tasks keeps your farm on track." },
    ],
  },
  "/farm/decisions": {
    key: "farm.decisions", steps: [
      { Icon: Crosshair, title: "Decision center", body: "The most important things needing your attention right now show here." },
      { Icon: Bell, title: "Act on a signal", body: "Each card tells you what's happening and what to do about it." },
    ],
  },
  "/farm/enterprises": {
    key: "farm.enterprises", steps: [
      { Icon: LayoutGrid, title: "Your businesses", body: "Every kind of farming you do — crops, animals, fish, trees — shows here as a business." },
      { Icon: Plus, title: "Add a unit", body: "Start a new pond, paddock, woodlot or garden bed from here, then log against it." },
    ],
  },
  "/farm/cycles": {
    key: "farm.production", steps: [
      { Icon: Sprout, title: "Production", body: "Your crop cycles live here — what's planted, growing and ready to harvest." },
      { Icon: Plus, title: "Start a cycle", body: "Tap New cycle to plant something new and track it to harvest." },
    ],
  },
  "/farm/field-events": {
    key: "farm.fieldevents", steps: [
      { Icon: Activity, title: "Field events", body: "Everything you do in the field — planting, watering, spraying, weeding — recorded here." },
      { Icon: Plus, title: "Log a field event", body: "Use the + to record today's field work. A photo makes the record stronger.", actionLabel: "Log work", openLauncher: true },
    ],
  },
  "/farm/inventory": {
    key: "farm.inventory", steps: [
      { Icon: Package, title: "Your supplies", body: "Seed, feed, fertilizer, fuel and chemicals you have on hand show here." },
      { Icon: Plus, title: "Keep it current", body: "Add what you buy and what you use, so you never run out by surprise." },
    ],
  },
  "/farm/labor": {
    key: "farm.labor", steps: [
      { Icon: Users2, title: "Your workers", body: "Your team, their days worked and their wages are tracked here." },
      { Icon: Clock, title: "Log a work day", body: "Record hours and pay so your wage records are always ready." },
    ],
  },
  "/farm/buyers": {
    key: "farm.buyers", steps: [
      { Icon: Truck, title: "Your buyers", body: "The people who buy from you, their orders and what they owe show here." },
      { Icon: Plus, title: "Add a buyer", body: "Add who you sell to — it builds your record and helps match what they want." },
    ],
  },
  "/farm/cash": {
    key: "farm.cash", steps: [
      { Icon: DollarSign, title: "Your money", body: "Money in and money out — every sale and every cost — tracked here." },
      { Icon: HandCoins, title: "Record money", body: "Tap Log cash in for a sale, or Log expense for a cost. Keep it daily." },
    ],
  },
  "/farm/equipment": {
    key: "farm.equipment", steps: [
      { Icon: Wrench, title: "Your gear", body: "Machines and tools — the tractor, pump, ute — with their hours and service dates." },
      { Icon: Plus, title: "Add equipment", body: "Register your gear so you can track use, cost and when it needs servicing." },
    ],
  },
  "/farm/locations": {
    key: "farm.locations", steps: [
      { Icon: Map, title: "Your land", body: "Your zones and blocks — where everything on the farm happens — shown here and on the map." },
      { Icon: Plus, title: "Set up your land", body: "Name your zones and blocks so every record can be tied to the right place." },
    ],
  },
  "/farm/compliance": {
    key: "farm.compliance", steps: [
      { Icon: Shield, title: "Spray safety", body: "After spraying, you must wait before selling. This page shows what's safe and what's on hold." },
      { Icon: Check, title: "Sell with proof", body: "When a block is clear, the record proves it — that's what keeps your produce trusted." },
    ],
  },
  "/farm/analytics": {
    key: "farm.analytics", steps: [
      { Icon: BarChart3, title: "How the farm is doing", body: "Signals, profit and trends — the numbers that tell you what to do next." },
      { Icon: Activity, title: "Builds with records", body: "The more you log, the sharper these numbers get. Keep logging daily." },
    ],
  },
  "/farm/reports": {
    key: "farm.reports", steps: [
      { Icon: FileText, title: "Your reports", body: "Turn your records into reports — for a bank, a buyer or the ministry." },
      { Icon: Shield, title: "Bank Evidence", body: "The flagship report proves your farm is real and bankable. Built from your real records." },
    ],
  },
  "/farm/weather": {
    key: "farm.weather", steps: [
      { Icon: Cloud, title: "Your weather", body: "The forecast for your farm — rain, wind and heat for the days ahead." },
      { Icon: Shield, title: "Plan around it", body: "Check rain before you spray or harvest — it saves money and keeps work safe." },
    ],
  },
  "/farm/library": {
    key: "farm.library", steps: [
      { Icon: Library, title: "Your library", body: "Growing guides and your own saved lists — the knowledge behind your farm." },
    ],
  },
  "/farm/gallery": {
    key: "farm.gallery", steps: [
      { Icon: Image, title: "Your photos", body: "Photos you take while logging show here — proof of your harvests, problems and work." },
      { Icon: Plus, title: "A photo says a lot", body: "Adding a photo when you log makes the record stronger for buyers and banks." },
    ],
  },
  "/farm/partnerships": {
    key: "farm.partnerships", steps: [
      { Icon: Share2, title: "Your network", body: "Everyone you work with — landowners, government, buyers, banks, vets and groups." },
      { Icon: Plus, title: "Add a partner", body: "Add the people and groups behind your farm — each one builds your record." },
    ],
  },
  "/farm/settings": {
    key: "farm.settings", steps: [
      { Icon: Settings, title: "Your control room", body: "Change anything here — your farm name, zones, team, units and more." },
      { Icon: Sprout, title: "Make it yours", body: "Rename your farm, blocks and crops any time. The change is saved everywhere." },
    ],
  },
};

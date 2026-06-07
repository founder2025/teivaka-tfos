/**
 * App.jsx — TFOS Root Router
 *
 * Role separation is enforced at the routing layer.
 *
 * Admin routes (/admin/*):
 *   - Wrapped in <AdminRoute> — 403 if not ADMIN
 *   - Admin components are NEVER imported into farmer sessions
 *
 * Farmer routes (/*):
 *   - Wrapped in <FarmerRoute> — redirects admin to /admin
 *   - New users (onboarding_complete=false) redirected to /onboarding first
 *
 * Security guarantee:
 *   Admin navigation tabs are completely absent from farmer DOM.
 *   They are not hidden, not disabled, not rendered at all.
 *   React.lazy() ensures admin chunk is never downloaded by farmer browsers.
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminRoute, FarmerRoute, OnboardingRoute, PrivateRoute } from "./components/PrivateRoute";

// ── Auth pages (public) ──────────────────────────────────────────────────────
import Login    from "./pages/Login";
import Register from "./pages/Register";
// LAZY: const Landing replaces this (line 36 area)
import Privacy  from "./pages/Privacy";
import Terms    from "./pages/Terms";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Home from "./pages/farmer/Home";

// ── Farmer pages (lazy — farmer bundle does NOT include admin code) ───────────
const Landing       = lazy(() => import("./pages/Landing"));
const MarketingPage = lazy(() => import("./pages/MarketingPage"));
const Community     = lazy(() => import("./pages/farmer/Community"));
const CommunityMap  = lazy(() => import("./pages/farmer/CommunityMap"));
const Onboarding    = lazy(() => import("./pages/farmer/Onboarding"));
const FarmBasics    = lazy(() => import("./pages/onboarding/FarmBasics"));
const MeSettings    = lazy(() => import("./pages/farmer/MeSettings"));
const FieldEventNew = lazy(() => import("./pages/farmer/FieldEventNew"));
const KnowledgeBase = lazy(() => import("./pages/farmer/KnowledgeBase"));
const FarmManager   = lazy(() => import("./pages/farmer/FarmManager"));
const FarmsManage   = lazy(() => import("./pages/farmer/FarmsManage"));
const TIS           = lazy(() => import("./pages/farmer/TIS"));
const Calendar      = lazy(() => import("./pages/farmer/FarmerCalendar"));
const Members       = lazy(() => import("./pages/farmer/Members"));
const Leaderboard   = lazy(() => import("./pages/farmer/Leaderboard"));
const HarvestLog    = lazy(() => import("./pages/farmer/HarvestLog"));
const CashLedger    = lazy(() => import("./pages/farmer/CashLedger"));
const Labor         = lazy(() => import("./pages/farmer/Labor"));
const Buyers        = lazy(() => import("./pages/farmer/Buyers"));
const Equipment     = lazy(() => import("./pages/farmer/Equipment"));
const Analytics     = lazy(() => import("./pages/farmer/Analytics"));
const Reports       = lazy(() => import("./pages/farmer/Reports"));
const DecisionCenter = lazy(() => import("./pages/farmer/DecisionCenter"));
const Enterprises   = lazy(() => import("./pages/farmer/Enterprises"));
const FarmHistory   = lazy(() => import("./pages/farmer/FarmHistory"));
const WeatherPage   = lazy(() => import("./pages/farmer/WeatherPage"));
const LocationsPage = lazy(() => import("./pages/farmer/LocationsPage"));

// ── Phase 4b Week 1 shell + pages (5-tab FarmerShell) ─────────────────────────
const FarmerShell   = lazy(() => import("./layouts/FarmerShell"));
const FarmDashboard = lazy(() => import("./pages/farmer/FarmDashboard"));
const HarvestNew    = lazy(() => import("./pages/farmer/HarvestNew"));
const CycleNew      = lazy(() => import("./pages/farmer/CycleNew"));
const EggsNew         = lazy(() => import("./pages/farmer/poultry/EggsNew"));
const FlockPlacedNew      = lazy(() => import("./pages/farmer/poultry/FlockPlacedNew"));
const MortalityLoggedNew    = lazy(() => import("./pages/farmer/poultry/MortalityLoggedNew"));
const VaccinationGivenNew   = lazy(() => import("./pages/farmer/poultry/VaccinationGivenNew"));
const FeedReceivedNew       = lazy(() => import("./pages/farmer/poultry/FeedReceivedNew"));
const WeightCheckNew        = lazy(() => import("./pages/farmer/poultry/WeightCheckNew"));
const BirdReplacementNew    = lazy(() => import("./pages/farmer/poultry/BirdReplacementNew"));
const EggsSoldNew           = lazy(() => import("./pages/farmer/poultry/EggsSoldNew"));
const BirdsSoldNew          = lazy(() => import("./pages/farmer/poultry/BirdsSoldNew"));
const HealthObservationNew  = lazy(() => import("./pages/farmer/poultry/HealthObservationNew"));
const FeedUsedNew           = lazy(() => import("./pages/farmer/poultry/FeedUsedNew"));
const LitterChangedNew      = lazy(() => import("./pages/farmer/poultry/LitterChangedNew"));
const CoopCleanedNew        = lazy(() => import("./pages/farmer/poultry/CoopCleanedNew"));
const FeedPurchasedNew      = lazy(() => import("./pages/farmer/poultry/FeedPurchasedNew"));
const WaterConsumedNew      = lazy(() => import("./pages/farmer/poultry/WaterConsumedNew"));
const MortalityInvestigatedNew = lazy(() => import("./pages/farmer/poultry/MortalityInvestigatedNew"));
const CullLoggedNew         = lazy(() => import("./pages/farmer/poultry/CullLoggedNew"));
const VisitorLoggedNew      = lazy(() => import("./pages/farmer/poultry/VisitorLoggedNew"));
const PestControlAppliedNew = lazy(() => import("./pages/farmer/poultry/PestControlAppliedNew"));
const TemperatureRecordedNew = lazy(() => import("./pages/farmer/poultry/TemperatureRecordedNew"));
const EggsGradedNew          = lazy(() => import("./pages/farmer/poultry/EggsGradedNew"));
const FlockMovedNew          = lazy(() => import("./pages/farmer/poultry/FlockMovedNew"));
const EquipmentMaintainedNew = lazy(() => import("./pages/farmer/poultry/EquipmentMaintainedNew"));
const IncidentReportedNew    = lazy(() => import("./pages/farmer/poultry/IncidentReportedNew"));
const SuppliesReceivedNew    = lazy(() => import("./pages/farmer/poultry/SuppliesReceivedNew"));
const PoultryDashboard      = lazy(() => import("./pages/farmer/poultry/PoultryDashboard"));
const PoultryCompliance     = lazy(() => import("./pages/farmer/poultry/PoultryCompliance"));
const PoultryBankEvidence   = lazy(() => import("./pages/farmer/poultry/PoultryBankEvidence"));
const LibrarySettings       = lazy(() => import("./pages/farmer/LibrarySettings"));
const HarvestList   = lazy(() => import("./pages/farmer/HarvestList"));
const CycleList     = lazy(() => import("./pages/farmer/CycleList"));
const InventoryList = lazy(() => import("./pages/farmer/InventoryList"));
const Classroom     = lazy(() => import("./pages/farmer/Classroom"));
const Me            = lazy(() => import("./pages/farmer/Me"));

// ── Phase A1 — Solo mode surface (MBI Part 19) ────────────────────────────────
const SoloShell    = lazy(() => import("./layouts/SoloShell"));
const SoloTaskCard = lazy(() => import("./pages/solo/SoloTaskCard"));

// ── Day 3a — Nav v2.1 structural stubs ───────────────────────────────────────
import ComingSoon from "./pages/ComingSoon";
import UpdateBanner from "./components/UpdateBanner";

// ── Admin pages (lazy — admin bundle never downloaded by farmers) ─────────────
// React.lazy() means these are separate JS chunks. A farmer session will
// never request or receive admin code, even if they know the URL.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers     = lazy(() => import("./pages/admin/AdminUsers"));
const AdminContent   = lazy(() => import("./pages/admin/AdminContent"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminMap       = lazy(() => import("./pages/admin/AdminMap"));
const AdminSettings  = lazy(() => import("./pages/admin/AdminSettings"));
const InputsSandbox  = lazy(() => import("./pages/admin/InputsSandbox"));

// ── Misc pages ───────────────────────────────────────────────────────────────
import Forbidden from "./pages/Forbidden";
import NotFound  from "./pages/NotFound";

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "#F5EFE0" }}>
      <div className="flex flex-col items-center gap-3">
        <img src="/teivaka_logo.png" alt="Teivaka" style={{ height: 72, width: "auto", display: "block" }} className="animate-pulse" />
        <p className="text-sm font-medium" style={{ color: "#6AA84F" }}>Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>

          {/* ── Public routes ───────────────────────────────────────────── */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/403"      element={<Forbidden />} />
          <Route path="/privacy"  element={<Privacy />} />
          <Route path="/terms"    element={<Terms />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/verify-email"    element={<VerifyEmail />} />

          {/* ── Onboarding (authenticated, not yet onboarded) ───────────── */}
          <Route path="/onboarding" element={
            <OnboardingRoute><Onboarding /></OnboardingRoute>
          } />
          <Route path="/onboarding/farm-basics" element={
            <OnboardingRoute><FarmBasics /></OnboardingRoute>
          } />

          {/* ── Admin routes ────────────────────────────────────────────── */}
          {/* AdminRoute checks role = ADMIN. All others get /403.          */}
          {/* These routes and their components are NEVER rendered for      */}
          {/* farmer accounts — React.lazy ensures the admin JS chunk is    */}
          {/* not even downloaded.                                          */}
          <Route path="/admin" element={
            <AdminRoute><AdminDashboard /></AdminRoute>
          } />
          <Route path="/admin/users" element={
            <AdminRoute><AdminUsers /></AdminRoute>
          } />
          <Route path="/admin/content" element={
            <AdminRoute><AdminContent /></AdminRoute>
          } />
          <Route path="/admin/analytics" element={
            <AdminRoute><AdminAnalytics /></AdminRoute>
          } />
          <Route path="/admin/map" element={
            <AdminRoute><AdminMap /></AdminRoute>
          } />
          <Route path="/admin/settings" element={
            <AdminRoute><AdminSettings /></AdminRoute>
          } />
          <Route path="/admin/dev/inputs-sandbox" element={
            <AdminRoute><InputsSandbox /></AdminRoute>
          } />

          {/* ── Farmer routes ───────────────────────────────────────────── */}
          {/* FarmerRoute: redirects admin → /admin, new users → /onboarding */}
          <Route path="/" element={<Landing />} />
          <Route path="/about"        element={<MarketingPage pageKey="about" />} />
          <Route path="/what-we-do"   element={<MarketingPage pageKey="what-we-do" />} />
          <Route path="/team"         element={<MarketingPage pageKey="team" />} />
          <Route path="/partner"      element={<MarketingPage pageKey="partner" />} />
          <Route path="/contact"      element={<MarketingPage pageKey="contact" />} />
          <Route path="/tis-public"   element={<MarketingPage pageKey="tis" />} />
          <Route path="/tfos"         element={<MarketingPage pageKey="tfos" />} />
          <Route path="/our-farms"    element={<MarketingPage pageKey="our-farms" />} />
          <Route path="/farms"        element={<MarketingPage pageKey="farms" />} />
          <Route path="/the-work"     element={<MarketingPage pageKey="the-work" />} />
          <Route path="/community" element={
            <FarmerRoute><Community /></FarmerRoute>
          } />
          <Route path="/community/map" element={
            <FarmerRoute><CommunityMap /></FarmerRoute>
          } />
          <Route path="/kb" element={
            <FarmerRoute><KnowledgeBase /></FarmerRoute>
          } />
          <Route element={<FarmerRoute><FarmerShell /></FarmerRoute>}>
            <Route path="/home"              element={<FarmDashboard />} />
            <Route path="/farm"              element={<FarmDashboard />} />
            <Route path="/farm/harvest/new"  element={<HarvestNew    />} />
            <Route path="/farm/poultry/eggs/new" element={<EggsNew   />} />
            <Route path="/farm/poultry/flocks/new" element={<FlockPlacedNew  />} />
            <Route path="/farm/poultry/mortality/new" element={<MortalityLoggedNew  />} />
            <Route path="/farm/poultry/vaccination/new" element={<VaccinationGivenNew  />} />
            <Route path="/farm/poultry/feed/new" element={<FeedReceivedNew  />} />
            <Route path="/farm/poultry/weight/new" element={<WeightCheckNew  />} />
            <Route path="/farm/poultry/birds/add" element={<BirdReplacementNew  />} />
            <Route path="/farm/poultry/eggs/sell" element={<EggsSoldNew  />} />
            <Route path="/farm/poultry/birds/sell" element={<BirdsSoldNew  />} />
            <Route path="/farm/poultry/health/new" element={<HealthObservationNew  />} />
            <Route path="/farm/poultry/feed/used" element={<FeedUsedNew  />} />
            <Route path="/farm/poultry/litter/changed" element={<LitterChangedNew  />} />
            <Route path="/farm/poultry/coop/cleaned" element={<CoopCleanedNew  />} />
            <Route path="/farm/poultry/feed/purchased" element={<FeedPurchasedNew  />} />
            <Route path="/farm/poultry/water/consumed" element={<WaterConsumedNew  />} />
            <Route path="/farm/poultry/mortality/investigated" element={<MortalityInvestigatedNew  />} />
            <Route path="/farm/poultry/cull/logged" element={<CullLoggedNew  />} />
            <Route path="/farm/poultry/visitor/logged" element={<VisitorLoggedNew  />} />
            <Route path="/farm/poultry/pest-control/applied" element={<PestControlAppliedNew  />} />
            <Route path="/farm/poultry/temperature/recorded" element={<TemperatureRecordedNew  />} />
            <Route path="/farm/poultry/eggs/graded" element={<EggsGradedNew  />} />
            <Route path="/farm/poultry/flock/moved" element={<FlockMovedNew  />} />
            <Route path="/farm/poultry/equipment/maintained" element={<EquipmentMaintainedNew  />} />
            <Route path="/farm/poultry/incident/reported" element={<IncidentReportedNew  />} />
            <Route path="/farm/poultry/supplies/received" element={<SuppliesReceivedNew  />} />
            <Route path="/farm/poultry" element={<PoultryDashboard  />} />
            <Route path="/farm/poultry/bank-evidence" element={<PoultryBankEvidence  />} />
            <Route path="/classroom"         element={<Classroom     />} />
            <Route path="/me"                element={<Me            />} />
            <Route path="/me/library"        element={<LibrarySettings   />} />
            <Route path="/tis"               element={<TIS           />} />

            {/* Nav v2.1 structural stubs — every sub-nav path resolves */}
            <Route path="/home/following"        element={<ComingSoon title="Following"     phase="4.3" />} />
            <Route path="/home/marketplace"      element={<ComingSoon title="Marketplace"   phase="8"   />} />
            <Route path="/home/directory"        element={<ComingSoon title="Directory"     phase="8"   />} />
            <Route path="/home/saved"            element={<ComingSoon title="Saved"         phase="4.3" />} />

            <Route path="/classroom/progress"       element={<ComingSoon title="Progress"       phase="4.3" />} />
            <Route path="/classroom/certifications" element={<ComingSoon title="Certifications" phase="6"   />} />

            <Route path="/farm/tasks"        element={<ComingSoon title="Tasks"        phase="4.2" />} />
            <Route path="/farm/cycles"       element={<CycleList />} />
            <Route path="/farm/cycles/new"   element={<CycleNew />} />
            <Route path="/farm/harvests"     element={<HarvestList />} />
            <Route path="/farm/field-events" element={<FieldEventNew />} />
            <Route path="/farm/inventory"    element={<InventoryList />} />
            <Route path="/farm/labor"        element={<Labor />} />
            <Route path="/farm/cash"         element={<CashLedger />} />
            <Route path="/farm/buyers"       element={<Buyers />} />
            <Route path="/farm/equipment"    element={<Equipment />} />
            <Route path="/farm/compliance"   element={<PoultryCompliance  />} />
            <Route path="/farm/analytics"    element={<Analytics />} />
            <Route path="/farm/reports"      element={<Reports />} />
            <Route path="/farm/decisions"    element={<DecisionCenter />} />
            <Route path="/farm/history"      element={<FarmHistory />} />
            <Route path="/farm/enterprises"  element={<Enterprises />} />
            <Route path="/farm/weather"      element={<WeatherPage />} />
            <Route path="/farm/gallery"      element={<ComingSoon title="Gallery" />} />
            <Route path="/farm/partnerships" element={<ComingSoon title="Partnerships" />} />
            <Route path="/farm/locations"    element={<LocationsPage />} />
            <Route path="/farm/manage"       element={<FarmsManage />} />

            <Route path="/tis/history" element={<ComingSoon title="TIS History" phase="4.3" />} />
            <Route path="/tis/voice"   element={<ComingSoon title="TIS Voice"   phase="5"   />} />
            <Route path="/tis/usage"   element={<ComingSoon title="TIS Usage"   phase="4.3" />} />

            <Route path="/me/settings"      element={<MeSettings />} />
            <Route path="/me/settings/mode" element={<ComingSoon title="Switch mode"  phase="4.3" />} />
            <Route path="/me/subscription"  element={<ComingSoon title="Subscription" phase="4.3" />} />
            <Route path="/me/referrals"     element={<ComingSoon title="Referrals"    phase="4.3" />} />
            <Route path="/me/team"          element={<ComingSoon title="Team"         phase="4.3" />} />
            <Route path="/me/data"          element={<ComingSoon title="Export data"  phase="4.3" />} />

            <Route path="/stub/phase-:phaseNum" element={<ComingSoon dynamic />} />
          </Route>
          {/* Solo mode — full-screen single-task surface, no nav */}
          <Route element={<PrivateRoute><SoloShell /></PrivateRoute>}>
            <Route path="/solo" element={<SoloTaskCard />} />
          </Route>

          <Route path="/harvest" element={
            <FarmerRoute><HarvestLog /></FarmerRoute>
          } />
          <Route path="/calendar" element={
            <FarmerRoute><Calendar /></FarmerRoute>
          } />
          <Route path="/members" element={
            <FarmerRoute><Members /></FarmerRoute>
          } />
          <Route path="/leaderboard" element={
            <FarmerRoute><Leaderboard /></FarmerRoute>
          } />

          {/* ── Fallback ────────────────────────────────────────────────── */}
          <Route path="*" element={<NotFound />} />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

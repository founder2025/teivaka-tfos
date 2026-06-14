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
const HomePillar = lazy(() => import("./pages/home/HomePillar"));
const NotificationsPage = lazy(() => import("./pages/home/NotificationsPage"));
const MessagesPage = lazy(() => import("./pages/home/MessagesPage"));
const ClassroomPillar = lazy(() => import("./pages/classroom/ClassroomPillar"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));

// ── Farmer pages (lazy — farmer bundle does NOT include admin code) ───────────
const Landing       = lazy(() => import("./pages/Landing"));
const MarketingPage = lazy(() => import("./pages/MarketingPage"));
const Community     = lazy(() => import("./pages/farmer/Community"));
const CommunityMap  = lazy(() => import("./pages/farmer/CommunityMap"));
const Onboarding    = lazy(() => import("./pages/farmer/Onboarding"));
const FarmBasics    = lazy(() => import("./pages/onboarding/FarmBasics"));
const MeSettings    = lazy(() => import("./pages/farmer/MeSettings"));
const Promote       = lazy(() => import("./pages/me/Promote"));
const MeVerification = lazy(() => import("./pages/me/MeVerification"));
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
const FarmTasks     = lazy(() => import("./pages/farmer/FarmTasks"));

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
const MedicationGivenNew     = lazy(() => import("./pages/farmer/poultry/MedicationGivenNew"));
const LivestockEventNew      = lazy(() => import("./pages/farmer/LivestockEventNew"));
const PoultryDashboard      = lazy(() => import("./pages/farmer/poultry/PoultryDashboard"));
const PoultryCompliance     = lazy(() => import("./pages/farmer/poultry/PoultryCompliance"));
const CropCompliance        = lazy(() => import("./pages/farmer/CropCompliance"));
const PoultryBankEvidence   = lazy(() => import("./pages/farmer/poultry/PoultryBankEvidence"));
const LibrarySettings       = lazy(() => import("./pages/farmer/LibrarySettings"));
const HarvestList   = lazy(() => import("./pages/farmer/HarvestList"));
const CycleList     = lazy(() => import("./pages/farmer/CycleList"));
const CycleDetail   = lazy(() => import("./pages/farmer/CycleDetail"));
const NurseryNew    = lazy(() => import("./pages/farmer/NurseryNew"));
const FarmLibrary   = lazy(() => import("./pages/farmer/Library"));
const FarmGallery   = lazy(() => import("./pages/farmer/Gallery"));
const FarmPartnerships = lazy(() => import("./pages/farmer/Partnerships"));
const FarmSettings  = lazy(() => import("./pages/farmer/FarmSettings"));
const VerticalStub  = lazy(() => import("./pages/farmer/VerticalStub"));
const EstablishUnitNew = lazy(() => import("./pages/farmer/EstablishUnitNew"));
const InventoryList = lazy(() => import("./pages/farmer/InventoryList"));
const Me            = lazy(() => import("./pages/me/ProfilePage"));
const Subscription  = lazy(() => import("./pages/me/Subscription"));
const Referrals     = lazy(() => import("./pages/me/Referrals"));
const Affiliate     = lazy(() => import("./pages/me/Affiliate"));
const AffiliateConsole = lazy(() => import("./pages/me/AffiliateConsole"));
const Team          = lazy(() => import("./pages/me/Team"));
const ExportData    = lazy(() => import("./pages/me/ExportData"));
const Covenant      = lazy(() => import("./pages/Covenant"));
const ControlRoom   = lazy(() => import("./pages/admin/ControlRoom"));

// ── Phase A1 — Solo mode surface (MBI Part 19) ────────────────────────────────

// ── Day 3a — Nav v2.1 structural stubs ───────────────────────────────────────
import ComingSoon from "./pages/ComingSoon";
import UpdateBanner from "./components/UpdateBanner";
import PrototypeSwitch from "./components/PrototypeSwitch";

// ── Admin pages (lazy — admin bundle never downloaded by farmers) ─────────────
// React.lazy() means these are separate JS chunks. A farmer session will
// never request or receive admin code, even if they know the URL.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers     = lazy(() => import("./pages/admin/AdminUsers"));
const AdminVerifications = lazy(() => import("./pages/admin/AdminVerifications"));
const AdminClassroom = lazy(() => import("./pages/admin/AdminClassroom"));
const AdminIntelligence = lazy(() => import("./pages/admin/AdminIntelligence"));
const AdminGeoIntelligence = lazy(() => import("./pages/admin/AdminGeoIntelligence"));
const AdminPestIntelligence = lazy(() => import("./pages/admin/AdminPestIntelligence"));
const AdminWeatherIntelligence = lazy(() => import("./pages/admin/AdminWeatherIntelligence"));
const AdminMarketIntelligence = lazy(() => import("./pages/admin/AdminMarketIntelligence"));
const AdminPlatform = lazy(() => import("./pages/admin/AdminPlatform"));
const AdminSponsors = lazy(() => import("./pages/admin/AdminSponsors"));
const AdminRequests = lazy(() => import("./pages/admin/AdminRequests"));
const AdminWarRoom = lazy(() => import("./pages/admin/AdminWarRoom"));
const AdminContent   = lazy(() => import("./pages/admin/AdminContent"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminMap       = lazy(() => import("./pages/admin/AdminMap"));
const AdminTaskEngine = lazy(() => import("./pages/admin/AdminTaskEngine"));
const AdminSettings  = lazy(() => import("./pages/admin/AdminSettings"));
const Moderation     = lazy(() => import("./pages/admin/Moderation"));
const InputsSandbox  = lazy(() => import("./pages/admin/InputsSandbox"));

// ── Misc pages ───────────────────────────────────────────────────────────────
import Forbidden from "./pages/Forbidden";
import NotFound  from "./pages/NotFound";

// Founder/admin-only design-reference viewer (mock data; gated server-side).
const Prototype = lazy(() => import("./pages/Prototype"));

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
      <PrototypeSwitch />
      <Suspense fallback={<PageLoader />}>
        <Routes>

          {/* ── Public routes ───────────────────────────────────────────── */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept/:token" element={<AcceptInvite />} />
          <Route path="/403"      element={<Forbidden />} />
          <Route path="/privacy"  element={<Privacy />} />
          <Route path="/terms"    element={<Terms />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/verify-email"    element={<VerifyEmail />} />

          {/* Design-reference prototype (founder/admin only; backend require_admin
              gates the asset — the page just renders it in an iframe). */}
          <Route path="/prototype" element={<PrivateRoute><Prototype /></PrivateRoute>} />

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
          <Route path="/admin/verifications" element={
            <AdminRoute><AdminVerifications /></AdminRoute>
          } />
          <Route path="/admin/classroom" element={
            <AdminRoute><AdminClassroom /></AdminRoute>
          } />
          <Route path="/admin/intelligence" element={
            <AdminRoute><AdminIntelligence /></AdminRoute>
          } />
          <Route path="/admin/intelligence/geo" element={
            <AdminRoute><AdminGeoIntelligence /></AdminRoute>
          } />
          <Route path="/admin/intelligence/pests" element={
            <AdminRoute><AdminPestIntelligence /></AdminRoute>
          } />
          <Route path="/admin/intelligence/weather" element={
            <AdminRoute><AdminWeatherIntelligence /></AdminRoute>
          } />
          <Route path="/admin/intelligence/market" element={
            <AdminRoute><AdminMarketIntelligence /></AdminRoute>
          } />
          <Route path="/admin/platform" element={
            <AdminRoute><AdminPlatform /></AdminRoute>
          } />
          <Route path="/admin/sponsors" element={
            <AdminRoute><AdminSponsors /></AdminRoute>
          } />
          <Route path="/admin/requests" element={
            <AdminRoute><AdminRequests /></AdminRoute>
          } />
          <Route path="/admin/warroom" element={
            <AdminRoute><AdminWarRoom /></AdminRoute>
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
          <Route path="/admin/task-engine" element={
            <AdminRoute><AdminTaskEngine /></AdminRoute>
          } />
          <Route path="/admin/settings" element={
            <AdminRoute><AdminSettings /></AdminRoute>
          } />
          <Route path="/admin/moderation" element={
            <AdminRoute><Moderation /></AdminRoute>
          } />
          <Route path="/admin/control-room" element={
            <AdminRoute><ControlRoom /></AdminRoute>
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
            {/* HOME + CLASSROOM render inside the shared FarmerShell so all four
                pillars share one top bar / logo / nav. Content is .tfp-wrapped and
                the sub-view is derived from the route. */}
            <Route path="/home"            element={<HomePillar />} />
            <Route path="/home/:view"      element={<HomePillar />} />
            <Route path="/notifications"   element={<NotificationsPage />} />
            <Route path="/messages"          element={<MessagesPage />} />
            <Route path="/messages/:userId"  element={<MessagesPage />} />
            <Route path="/classroom"       element={<ClassroomPillar />} />
            <Route path="/classroom/:view" element={<ClassroomPillar />} />
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
            <Route path="/farm/poultry/medication/new" element={<MedicationGivenNew  />} />
            <Route path="/farm/livestock/log" element={<LivestockEventNew  />} />
            <Route path="/farm/poultry" element={<PoultryDashboard  />} />
            <Route path="/farm/poultry/bank-evidence" element={<PoultryBankEvidence  />} />
            <Route path="/me"                element={<Me self />} />
            <Route path="/u/:id"             element={<Me />} />
            <Route path="/me/library"        element={<LibrarySettings   />} />
            <Route path="/tis"               element={<TIS           />} />

            {/* Home + Classroom sub-views are served by the /home/:view and
                /classroom/:view routes above (HomePillar / ClassroomPillar). No
                stubs here — Following/Marketplace/Directory/Saved + Progress/
                Certification/Bookmarks all render real surfaces. */}

            <Route path="/farm/tasks"        element={<FarmTasks />} />
            <Route path="/farm/cycles"       element={<CycleList />} />
            <Route path="/farm/cycles/new"   element={<CycleNew />} />
            <Route path="/farm/nursery/new"  element={<NurseryNew />} />
            <Route path="/farm/cycles/:cycleId" element={<CycleDetail />} />
            <Route path="/farm/harvests"     element={<HarvestList />} />
            <Route path="/farm/field-events" element={<FieldEventNew />} />
            <Route path="/farm/inventory"    element={<InventoryList />} />
            <Route path="/farm/library"      element={<FarmLibrary />} />
            <Route path="/farm/labor"        element={<Labor />} />
            <Route path="/farm/cash"         element={<CashLedger />} />
            <Route path="/farm/buyers"       element={<Buyers />} />
            <Route path="/farm/equipment"    element={<Equipment />} />
            <Route path="/farm/compliance"   element={<CropCompliance />} />
            <Route path="/farm/compliance/poultry" element={<PoultryCompliance />} />
            <Route path="/farm/analytics"    element={<Analytics />} />
            <Route path="/farm/reports"      element={<Reports />} />
            <Route path="/farm/decisions"    element={<DecisionCenter />} />
            <Route path="/farm/history"      element={<FarmHistory />} />
            <Route path="/farm/enterprises"  element={<Enterprises />} />
            <Route path="/farm/weather"      element={<WeatherPage />} />
            <Route path="/farm/gallery"      element={<FarmGallery />} />
            <Route path="/farm/partnerships" element={<FarmPartnerships />} />
            <Route path="/farm/settings"     element={<FarmSettings />} />
            {/* Slice E — universal "establish a production unit" */}
            <Route path="/farm/unit/new"     element={<EstablishUnitNew />} />
            {/* Slice C — honest stub dashboards for not-yet-deep verticals */}
            <Route path="/farm/aquaculture"  element={<VerticalStub vertical="AQUACULTURE" />} />
            <Route path="/farm/forestry"     element={<VerticalStub vertical="FORESTRY" />} />
            <Route path="/farm/perennials"   element={<VerticalStub vertical="PERENNIALS" />} />
            <Route path="/farm/livestock"    element={<VerticalStub vertical="LIVESTOCK" />} />
            <Route path="/farm/apiculture"   element={<VerticalStub vertical="APICULTURE" />} />
            <Route path="/farm/specialty"    element={<VerticalStub vertical="SPECIALTY" />} />
            <Route path="/farm/locations"    element={<LocationsPage />} />
            <Route path="/farm/manage"       element={<FarmsManage />} />

            <Route path="/tis/history" element={<ComingSoon title="TIS History" phase="4.3" />} />
            <Route path="/tis/voice"   element={<ComingSoon title="TIS Voice"   phase="5"   />} />
            <Route path="/tis/usage"   element={<ComingSoon title="TIS Usage"   phase="4.3" />} />

            <Route path="/me/settings"          element={<MeSettings />} />
            <Route path="/me/promote"           element={<Promote />} />
            <Route path="/me/verification"      element={<MeVerification />} />
            <Route path="/me/subscription"      element={<Subscription />} />
            <Route path="/me/referrals"         element={<Referrals />} />
            <Route path="/me/affiliate"         element={<Affiliate />} />
            <Route path="/me/affiliate/console" element={<AffiliateConsole />} />
            <Route path="/me/team"              element={<Team />} />
            <Route path="/me/data"              element={<ExportData />} />
            <Route path="/covenant"             element={<Covenant />} />

            <Route path="/stub/phase-:phaseNum" element={<ComingSoon dynamic />} />
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

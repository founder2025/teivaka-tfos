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
import { AdminRoute, FarmerRoute, OnboardingRoute } from "./components/PrivateRoute";

// ── Auth pages (public) ──────────────────────────────────────────────────────
import Login    from "./pages/Login";
import Register from "./pages/Register";
import Landing  from "./pages/Landing";
import Privacy  from "./pages/Privacy";
import Terms    from "./pages/Terms";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Home from "./pages/farmer/Home";

// ── Farmer pages (lazy — farmer bundle does NOT include admin code) ───────────
const Community     = lazy(() => import("./pages/farmer/Community"));
const CommunityMap  = lazy(() => import("./pages/farmer/CommunityMap"));
const Onboarding    = lazy(() => import("./pages/farmer/Onboarding"));
const FarmBasics    = lazy(() => import("./pages/onboarding/FarmBasics"));
const FieldEventNew = lazy(() => import("./pages/farmer/FieldEventNew"));
const KnowledgeBase = lazy(() => import("./pages/farmer/KnowledgeBase"));
const FarmManager   = lazy(() => import("./pages/farmer/FarmManager"));
const TIS           = lazy(() => import("./pages/farmer/TIS"));
const Calendar      = lazy(() => import("./pages/farmer/FarmerCalendar"));
const Members       = lazy(() => import("./pages/farmer/Members"));
const Leaderboard   = lazy(() => import("./pages/farmer/Leaderboard"));
const HarvestLog    = lazy(() => import("./pages/farmer/HarvestLog"));

// ── Phase 4b Week 1 shell + pages (5-tab FarmerShell) ─────────────────────────
const FarmerShell   = lazy(() => import("./layouts/FarmerShell"));
const FarmDashboard = lazy(() => import("./pages/farmer/FarmDashboard"));
const HarvestNew    = lazy(() => import("./pages/farmer/HarvestNew"));
const Classroom     = lazy(() => import("./pages/farmer/Classroom"));
const Me            = lazy(() => import("./pages/farmer/Me"));

// ── Day 3a — Nav v2.1 structural stubs ───────────────────────────────────────
import ComingSoon from "./pages/ComingSoon";

// ── Admin pages (lazy — admin bundle never downloaded by farmers) ─────────────
// React.lazy() means these are separate JS chunks. A farmer session will
// never request or receive admin code, even if they know the URL.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers     = lazy(() => import("./pages/admin/AdminUsers"));
const AdminContent   = lazy(() => import("./pages/admin/AdminContent"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminSettings  = lazy(() => import("./pages/admin/AdminSettings"));

// ── Misc pages ───────────────────────────────────────────────────────────────
import Forbidden from "./pages/Forbidden";
import NotFound  from "./pages/NotFound";

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "#F5EFE0" }}>
      <div className="flex flex-col items-center gap-3">
        <span className="text-4xl animate-pulse">🌿</span>
        <p className="text-sm font-medium" style={{ color: "#3D8C40" }}>Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/admin/settings" element={
            <AdminRoute><AdminSettings /></AdminRoute>
          } />

          {/* ── Farmer routes ───────────────────────────────────────────── */}
          {/* FarmerRoute: redirects admin → /admin, new users → /onboarding */}
          <Route path="/" element={<Landing />} />
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
            <Route path="/home"              element={<Home          />} />
            <Route path="/farm"              element={<FarmDashboard />} />
            <Route path="/farm/harvest/new"  element={<HarvestNew    />} />
            <Route path="/classroom"         element={<Classroom     />} />
            <Route path="/me"                element={<Me            />} />
            <Route path="/tis"               element={<TIS           />} />

            {/* Nav v2.1 structural stubs — every sub-nav path resolves */}
            <Route path="/home/following"        element={<ComingSoon title="Following"     phase="4.3" />} />
            <Route path="/home/marketplace"      element={<ComingSoon title="Marketplace"   phase="8"   />} />
            <Route path="/home/directory"        element={<ComingSoon title="Directory"     phase="8"   />} />
            <Route path="/home/saved"            element={<ComingSoon title="Saved"         phase="4.3" />} />

            <Route path="/classroom/progress"       element={<ComingSoon title="Progress"       phase="4.3" />} />
            <Route path="/classroom/certifications" element={<ComingSoon title="Certifications" phase="6"   />} />

            <Route path="/farm/tasks"        element={<ComingSoon title="Tasks"        phase="4.2" />} />
            <Route path="/farm/cycles"       element={<ComingSoon title="Cycles"       phase="4.3" />} />
            <Route path="/farm/harvests"     element={<ComingSoon title="Harvests"     phase="4.3" />} />
            <Route path="/farm/field-events" element={<FieldEventNew />} />
            <Route path="/farm/inventory"    element={<ComingSoon title="Inventory"    phase="5"   />} />
            <Route path="/farm/labor"        element={<ComingSoon title="Labor"        phase="4.2" />} />
            <Route path="/farm/cash"         element={<ComingSoon title="Cash"         phase="4.2" />} />
            <Route path="/farm/buyers"       element={<ComingSoon title="Buyers"       phase="6"   />} />
            <Route path="/farm/equipment"    element={<ComingSoon title="Equipment"    phase="6.5" />} />
            <Route path="/farm/compliance"   element={<ComingSoon title="Compliance"   phase="4.2" />} />
            <Route path="/farm/analytics"    element={<ComingSoon title="Analytics"    phase="4.2" />} />
            <Route path="/farm/reports"      element={<ComingSoon title="Reports"      phase="6"   />} />
            <Route path="/farm/locations"    element={<ComingSoon title="Locations"    phase="5.5" />} />

            <Route path="/tis/history" element={<ComingSoon title="TIS History" phase="4.3" />} />
            <Route path="/tis/voice"   element={<ComingSoon title="TIS Voice"   phase="5"   />} />
            <Route path="/tis/usage"   element={<ComingSoon title="TIS Usage"   phase="4.3" />} />

            <Route path="/me/settings"      element={<ComingSoon title="Settings"     phase="4.3" />} />
            <Route path="/me/settings/mode" element={<ComingSoon title="Switch mode"  phase="4.3" />} />
            <Route path="/me/subscription"  element={<ComingSoon title="Subscription" phase="4.3" />} />
            <Route path="/me/referrals"     element={<ComingSoon title="Referrals"    phase="4.3" />} />
            <Route path="/me/team"          element={<ComingSoon title="Team"         phase="4.3" />} />
            <Route path="/me/data"          element={<ComingSoon title="Export data"  phase="4.3" />} />

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

# TFOS — Mobile & Downloadable-App Readiness

Living checklist for shipping TFOS to phones/tablets and, eventually, the Apple
App Store and Google Play. Updated as surfaces are made responsive and as the
PWA → native wrap path matures.

## 1. Responsive baseline (in progress)

Principles every new surface must follow:

- **No horizontal scroll, ever.** Multi-column layouts collapse to a single
  column at `≤ 760px` (use `hooks/useIsNarrow`). Side rails become horizontal
  scrollable tab strips or move into the bottom nav — they never stack on top of
  the page header.
- **Tap targets ≥ 44px.** Buttons, tabs and list rows must hit the 44px minimum
  (Apple HIG / Material). Pill tabs and nav rows already do.
- **Modals go full-width on phones** via `width: min(540px, calc(100vw - 24px))`
  and `max-height` with internal scroll. Never a fixed pixel width.
- **Safe-area insets.** Fixed bottom nav uses
  `padding-bottom: env(safe-area-inset-bottom)`; the viewport meta carries
  `viewport-fit=cover` so notched devices render edge-to-edge without clipping.
- **`100dvh` over `100vh`** for full-height sheets so the mobile keyboard /
  URL bar doesn't crop the layout.

### Surface status

| Surface | Mobile state |
|---|---|
| Profile (`/me`, `/u/:id`) | ✅ rail → horizontal tab strip (2026-06-10) |
| Bottom nav | ✅ safe-area inset |
| Edit / Search / Chat modals | ✅ responsive width |
| Home / Feed / Marketplace / Directory | audit pending |
| Farm pillar dashboards | audit pending |

## 2. PWA install-readiness (met)

Installability criteria for "Add to Home Screen" / Chrome install prompt:

- ✅ `manifest.webmanifest` — `display: standalone`, `start_url`, `theme_color`,
  `background_color`, name/short_name.
- ✅ Icons incl. a **512×512 maskable** icon (`/maskable-512.png`) + 192/512 `any`.
- ✅ Registered **service worker** (`public/sw.js`) — currently push + notification
  handling. (A fetch/app-shell cache is intentionally NOT added yet to avoid
  serving stale Vite bundles; revisit with a versioned cache + `skipWaiting`.)
- ✅ Served over HTTPS (teivaka.com via Caddy).
- ✅ iOS meta tags: `apple-mobile-web-app-capable`, status-bar style, app title,
  `apple-touch-icon`.

Result: the site is installable as a PWA today on Android (Chrome) and iOS
(Safari → Add to Home Screen).

## 3. Native wrap → App Store / Play Store (path)

Recommended path is to **wrap the existing PWA** rather than rewrite — fastest
route to both stores while keeping one codebase.

**Option A — Capacitor (recommended).**
1. `npm i @capacitor/core @capacitor/cli && npx cap init Teivaka com.teivaka.tfos`
2. Point `webDir` at `frontend/dist`; `server.url` can load teivaka.com for OTA
   updates, or bundle `dist` for offline-first.
3. `npx cap add ios && npx cap add android`.
4. Native plugins as needed: Push (APNs/FCM — replaces Web Push on native),
   Camera (avatar/photo posts), Geolocation (farm pins), Filesystem (exports).
5. Build in Xcode (App Store) / Android Studio (Play). Provide store assets:
   1024² icon, screenshots per device class, privacy policy URL (`/privacy` —
   **currently missing, must ship before submission**), data-safety form.

**Option B — TWA (Trusted Web Activity, Android only).** `bubblewrap init` against
the manifest → thin Play wrapper. No iOS. Good as a quick Play-only beta.

### Pre-submission blockers
- [ ] `/privacy` and `/terms` pages must exist (Register links them; stores require them).
- [ ] Account-deletion flow (Apple guideline 5.1.1(v) — apps with accounts must
      let users delete their account in-app).
- [ ] Rotate the demo VAPID keypair before public launch.
- [ ] Replace Web Push with APNs/FCM on the native build.
- [ ] 1024² store icon + per-device screenshots.

## 4. Next responsive passes (backlog)
- Home/Feed composer + cards at ≤ 400px (image grids, action row wrap).
- Marketplace tables → card stacks on mobile.
- Farm dashboards: charts and stat grids reflow check.
- Global guard: confirm no page produces body-level horizontal scroll on a 320px
  device (smallest supported).

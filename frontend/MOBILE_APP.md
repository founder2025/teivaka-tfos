# Teivaka — Native mobile app (iOS + Android) build runbook

This wraps the existing TFOS web app (Vite + React PWA) in a **Capacitor** native
shell. One codebase still ships to teivaka.com; the same `dist/` build is bundled
inside the iOS and Android apps. API/TIS/WS calls made from the native shell are
rewritten to `https://teivaka.com` at runtime (`src/native/bridge.js`).

> **Why Capacitor, not React Native:** the app is already an installable PWA with a
> service worker, offline outbox, and bottom-tab nav. Capacitor reuses 100% of it.
> A React Native rewrite would fork the codebase and cost months for no user gain.

---

## What is already done (web/JS layer — in this repo)

- `capacitor.config.ts` — app id `com.teivaka.tfos`, name **Teivaka**, `webDir: dist`,
  splash/status-bar/keyboard plugin config, Ocean Teal colors.
- `src/native/bridge.js` — runtime native bridge:
  - `installNativeNetworkShim()` rewrites relative `/api`, `/tis`, `/ws` (fetch +
    EventSource + WebSocket) to the production origin **only** inside the native shell.
  - `bootNative()` hides the splash after first paint, themes the status bar to match
    light/dark, routes the Android hardware back button through SPA history, adds the
    `native-app` CSS posture class.
  - Written against Capacitor's **runtime globals** (`window.Capacitor.Plugins.*`) so
    the web bundle has zero new build-time dependencies.
- `src/main.jsx` — installs the shim before render, boots native after render, and
  **skips the service worker** in the native shell (Capacitor serves bundled assets).
- `public/manifest.webmanifest` — Ocean Teal PWA manifest (`id`, `scope`, categories,
  maskable icon, theme `#0BAF9A`).
- `src/index.css` — safe-area tokens (`--safe-top/bottom/left/right`, `--bottomnav-h`)
  + native posture helpers (`.safe-top`, `.native-scroll`, 44px tap targets, no
  tap-highlight). Top app bar pads the status-bar inset (`.app-topbar`).
- `package.json` — Capacitor deps + `cap:ios` / `cap:android` / `cap:sync` scripts.

The native platform folders (`ios/`, `android/`) are intentionally **not committed** —
they are generated on a Mac (below) and contain machine-specific signing config.

---

## Prerequisites (your Mac)

| Tool | For | Install |
|---|---|---|
| Xcode 15+ + Command Line Tools | iOS build/sign/upload | Mac App Store |
| CocoaPods | iOS native deps | `sudo gem install cocoapods` |
| Android Studio (Giraffe+) + SDK 34 | Android build | developer.android.com |
| JDK 17 | Android/Gradle | bundled with Android Studio |
| Node 20+ | already have it | — |
| **Apple Developer Program** ($99/yr) | App Store submission | developer.apple.com |
| **Google Play Console** ($25 once) | Play submission | play.google.com/console |

> Apple account approval can take 24–48h — start that today; it's the only hard blocker
> between "builds on your Mac" and "submitted".

---

## One-time setup

```bash
cd frontend
npm install                 # pulls the @capacitor/* packages added to package.json
npm run build               # produce dist/
npx cap add ios             # generates ios/   (needs CocoaPods)
npx cap add android         # generates android/
npx cap sync                # copies dist/ + installs native plugins into both
```

## Every code change → device

```bash
cd frontend
npm run cap:ios       # build + sync + open Xcode   (then ▶ Run on a device/simulator)
npm run cap:android   # build + sync + open Android Studio (then ▶ Run)
```

That's the whole loop: edit web code → `cap:ios`/`cap:android` → Run.

---

## App icons & splash (Phase 4)

Generate every required size from one source logo:

```bash
npm i -D @capacitor/assets
# put a 1024x1024 logo at  assets/icon.png  and a 2732x2732 splash at  assets/splash.png
npx capacitor-assets generate --iconBackgroundColor '#0BAF9A' --splashBackgroundColor '#0BAF9A'
```

This writes all iOS `Assets.xcassets` + Android `mipmap`/splash resources.

---

## Signing

**iOS (Xcode):** open `ios/App/App.xcworkspace` → target **App** → *Signing & Capabilities*
→ pick your Team → let Xcode manage the provisioning profile. Bump *Version* (e.g. `1.0.0`)
and *Build* on each upload.

**Android (keystore — keep this file safe, you cannot rotate it after publishing):**
```bash
keytool -genkey -v -keystore teivaka-release.keystore -alias teivaka \
  -keyalg RSA -keysize 2048 -validity 10000
```
Reference it in `android/key.properties` + `android/app/build.gradle` `signingConfigs`.
Build the bundle: Android Studio → *Build → Generate Signed Bundle/APK → Android App Bundle (.aab)*.

---

## Store submission checklist

**Both stores**
- [ ] Privacy policy URL (publish at `https://teivaka.com/privacy`).
- [ ] App icon 1024×1024, feature graphic (Play), screenshots per device size
      (iPhone 6.7" + 6.1"; Android phone + 7"/10" tablet).
- [ ] Short + full description, support email (`founder@teivaka.com`), category: Business.
- [ ] **Account deletion path** — both stores require an in-app or documented way to
      delete the account (TFOS has profile/account settings; expose a delete request).

**iOS (App Store Connect)**
- [ ] App Privacy answers (data collected: account, location for farm pins, photos for
      evidence — declare them; nothing sold).
- [ ] `Info.plist` usage strings (added when wiring native plugins in Phase 3):
      `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
      `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription` (voice evidence).
- [ ] Upload via Xcode *Product → Archive → Distribute App*.

**Android (Play Console)**
- [ ] Data safety form (mirror the iOS privacy answers).
- [ ] Permissions: CAMERA, ACCESS_FINE_LOCATION, RECORD_AUDIO, POST_NOTIFICATIONS —
      declared in `AndroidManifest.xml` (added in Phase 3).
- [ ] Target SDK 34+, upload the signed `.aab`.

---

## Still to come (tracked in the phased plan)

- **Phase 2** — native headers, full-bleed screens, bottom-sheet Capture flow, haptics.
- **Phase 3** — native Camera + Geolocation for Evidence, Push notifications (+ backend
  device-token registration), offline polish.
- **Phase 4** — icons/splash, signing, listings, screenshots, first submission.

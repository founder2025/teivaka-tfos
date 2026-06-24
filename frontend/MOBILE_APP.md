# Teivaka — Native mobile app build runbook (ANDROID-FIRST)

This wraps the existing TFOS web app (Vite + React PWA) in a **Capacitor** native
shell. One codebase still ships to teivaka.com; the same `dist/` build is bundled
inside the Android (and later iOS) app. API/TIS/WS calls made from the native shell
are rewritten to `https://teivaka.com` at runtime (`src/native/bridge.js`).

> **Android-first (Operator decision 2026-06-24):** most Teivaka farmers + the
> Operator are on Android. We ship Android to Google Play first; iOS is deferred.
> Android needs **no Mac** — build on Linux/Windows/Mac with Android Studio + JDK 17.
> You can sideload a **debug APK to your phone today** with no Play account — see the
> FAST PATH below. The same code already supports iOS when we add that platform later.

> **Why Capacitor, not React Native:** the app is already an installable PWA with a
> service worker, offline outbox, and bottom-tab nav. Capacitor reuses 100% of it.
> A React Native rewrite would fork the codebase and cost months for no user gain.

---

## ⚡ FAST PATH — debug APK on your own Android phone (~15 min, no Play account)

This is the quickest way to feel the app natively and judge the "cards display" fix.

```bash
# 0. One-time tooling: install Android Studio (bundles JDK 17 + the SDK).
#    Open it once → let it finish "SDK Components Setup".
cd frontend
npm install                 # pulls @capacitor/* (already in package.json)
npm run build               # produce dist/
npx cap add android         # generates the android/ project (no SDK needed for this step)
npx cap sync android        # copy dist/ + install native plugins

# 1. Build the debug APK (no signing needed for debug):
cd android
./gradlew assembleDebug     # Windows: gradlew.bat assembleDebug
#   → APK at: android/app/build/outputs/apk/debug/app-debug.apk

# 2. Put it on your phone, either:
#    a) USB: enable Developer Options + USB debugging, then:  adb install -r app-debug.apk
#    b) No cable: copy the .apk to the phone (WhatsApp/Drive/email), tap it, allow
#       "install from unknown sources". Done.
```

Every code change after that: `npm run cap:android` (build + sync + open Android Studio
→ press ▶ to run on the connected phone), or re-run `./gradlew assembleDebug` for a fresh APK.

> Debug APKs are for YOU and testers. Google Play requires a **signed release `.aab`**
> (see Signing → Android below). Don't distribute the debug APK publicly.

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
they are generated locally (`npx cap add`) and contain machine-specific config.

---

## Prerequisites

**Android (do this now — no Mac required):**

| Tool | For | Install |
|---|---|---|
| Android Studio (Giraffe+) + SDK 34 | Android build, runs on Linux/Win/Mac | developer.android.com |
| JDK 17 | Android/Gradle | bundled with Android Studio |
| Node 20+ | already have it | — |
| **Google Play Console** ($25 once) | Play submission | play.google.com/console |

**iOS (DEFERRED — later, when we add the platform):** needs a Mac + Xcode + CocoaPods +
Apple Developer Program ($99/yr, 24–48h approval). Skip for now.

---

## One-time setup (Android)

```bash
cd frontend
npm install                 # pulls the @capacitor/* packages added to package.json
npm run build               # produce dist/
npx cap add android         # generates android/
npx cap sync android        # copies dist/ + installs native plugins
# (iOS later, on a Mac: npx cap add ios && npx cap sync ios)
```

## Every code change → device

```bash
cd frontend
npm run cap:android   # build + sync + open Android Studio (then ▶ Run on the phone)
# (iOS later: npm run cap:ios — opens Xcode)
```

That's the whole loop: edit web code → `cap:android` → Run. Or `cd android && ./gradlew
assembleDebug` for a fresh installable APK (see FAST PATH above).

---

## Push notifications — Android = FCM only (no Apple/APNs needed now)

The device side is already built (`src/native/push.js`, backend `routers/push.py` +
migration 169 `tenant.push_devices`). To actually deliver pushes on Android:

1. Create a Firebase project → add an **Android app** with package `com.teivaka.tfos`.
2. Download `google-services.json` → place at `android/app/google-services.json`.
3. `npx cap sync android` (the push plugin wires the Gradle bits).
4. Server send-side: a worker reads `tenant.push_devices` and POSTs to FCM with the
   Firebase **service-account** key. This is the one remaining piece — not yet built.

> iOS push (APNs) is deferred with the rest of iOS.

---

## App icons & splash (Phase 4)

Generate every required size from one source logo:

```bash
npm i -D @capacitor/assets
# put a 1024x1024 logo at  assets/icon.png  and a 2732x2732 splash at  assets/splash.png
npx capacitor-assets generate --iconBackgroundColor '#0BAF9A' --splashBackgroundColor '#0BAF9A'
```

This writes all Android `mipmap`/splash resources (and iOS `Assets.xcassets` if added).

---

## Signing (Android release)

**Keystore — back this file up; you CANNOT rotate it after publishing:**
```bash
keytool -genkey -v -keystore teivaka-release.keystore -alias teivaka \
  -keyalg RSA -keysize 2048 -validity 10000
```
Reference it in `android/key.properties` + `android/app/build.gradle` `signingConfigs`.
Build the release bundle: Android Studio → *Build → Generate Signed Bundle/APK → Android
App Bundle (.aab)* → upload the `.aab` to Play.

*(iOS signing — Xcode Team + provisioning — is deferred with the rest of iOS.)*

---

## Play Store submission checklist (Android)

- [ ] Privacy policy URL (publish at `https://teivaka.com/privacy`).
- [ ] App icon 512×512, feature graphic 1024×500, phone screenshots (+ 7"/10" tablet
      optional but recommended).
- [ ] Short + full description, support email (`founder@teivaka.com`), category: Business.
- [ ] **Account deletion path** — Play requires an in-app or documented way to delete
      the account (TFOS has profile/account settings; expose a delete request).
- [ ] Data safety form (data collected: account, location for farm pins, photos for
      evidence — declare them; nothing sold).
- [ ] Permissions in `AndroidManifest.xml`: CAMERA, ACCESS_FINE_LOCATION, RECORD_AUDIO,
      POST_NOTIFICATIONS (added when the plugins land in `android/`).
- [ ] Target SDK 34+, upload the signed `.aab`.

*(iOS / App Store Connect submission is deferred with the rest of iOS.)*

---

## Still to come (phased plan — Android-first)

- **Phase 2** — native headers, full-bleed screens, bottom-sheet Capture flow, haptics.
- **Phase 3 (done)** — native Camera + Geolocation Evidence, push device registration.
- **Phase 4** — icons/splash, Android signing, Play listing, screenshots, first submission.
- **Phase 5 (later)** — FCM send-side worker; then iOS platform + App Store.

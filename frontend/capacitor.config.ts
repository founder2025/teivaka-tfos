import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor native-shell config for TFOS (Teivaka Farm Operating System).
 *
 * The native iOS/Android apps bundle the Vite build in `webDir` and run it in a
 * native WebView. There is intentionally NO `server.url` — we ship the web assets
 * inside the app so a cold open works with no signal (Pacific rural reality), and
 * so Apple/Google don't reject it as "just a website". API/TIS/WS calls are
 * rewritten to the production origin at runtime by src/native/bridge.js.
 *
 * Platform projects (ios/, android/) are generated on a Mac via `npx cap add`.
 * They are NOT committed here — see MOBILE_APP.md for the build runbook.
 */
const config: CapacitorConfig = {
  appId: 'com.teivaka.tfos',
  appName: 'Teivaka',
  webDir: 'dist',
  backgroundColor: '#F8FAFC', // Ocean Teal --cloud (light); status bar theming is runtime in bridge.js
  loggingBehavior: 'production',
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: false,        // bridge.js hides it once React has painted (no white flash)
      backgroundColor: '#0BAF9A',   // Ocean Teal --teal
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      // Overlay false so content does not slide under the status bar; we also
      // pad safe-area-top in CSS as a belt-and-braces backstop.
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',             // resize the webview, not the body, on keyboard open
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'never',          // we own safe-area insets in CSS
    backgroundColor: '#F8FAFC',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#F8FAFC',
  },
};

export default config;

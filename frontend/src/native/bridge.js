/**
 * bridge.js — TFOS ↔ Capacitor native bridge.
 *
 * Written against Capacitor's RUNTIME globals (window.Capacitor.Plugins.*) on
 * purpose: the web bundle gains ZERO npm dependencies, so `npm run build` and the
 * teivaka.com deploy are unaffected, and the low-connectivity public Landing/Login
 * stay lean. Inside the native shell, Capacitor injects window.Capacitor and
 * registers each installed plugin as a global — so we call them without importing.
 *
 * Two jobs:
 *   1. installNativeNetworkShim() — relative API/TIS/WS/SSE calls resolve to the
 *      production origin (the WebView origin is capacitor://localhost, where a
 *      relative /api would hit the local bundle, not the server).
 *   2. bootNative() — status-bar theming, splash hide, keyboard, Android back.
 *
 * Both are no-ops on the web (guarded by isNative()).
 */

// Production API origin for native builds. Overridable at build time for staging.
const NATIVE_ORIGIN = (import.meta.env.VITE_NATIVE_API_ORIGIN || 'https://teivaka.com').replace(/\/$/, '');

// Root-relative path prefixes that must reach the backend, not the local bundle.
const BACKEND_PREFIXES = ['/api/', '/api?', '/tis/', '/tis?', '/ws/', '/ws?'];

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

export function isNative() {
  const c = cap();
  return !!(c && (c.isNativePlatform ? c.isNativePlatform() : c.isNative));
}

export function nativePlatform() {
  const c = cap();
  return c?.getPlatform ? c.getPlatform() : 'web';
}

function plugin(name) {
  return cap()?.Plugins?.[name];
}

// Is this a backend path we should absolutize? Accept exact "/tis" / "/ws" too.
function needsOrigin(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path === '/tis' || path === '/ws') return true;
  return BACKEND_PREFIXES.some((p) => path.startsWith(p));
}

function absolutize(url) {
  try {
    if (typeof url === 'string' && needsOrigin(url)) return NATIVE_ORIGIN + url;
  } catch { /* fall through */ }
  return url;
}

/**
 * Rewrite root-relative backend calls to the production origin when running
 * natively. Patches fetch + EventSource (SSE chat) + WebSocket. Idempotent.
 */
export function installNativeNetworkShim() {
  if (!isNative() || typeof window === 'undefined' || window.__tfosNetShim) return;
  window.__tfosNetShim = true;

  // fetch — handles both string URLs and Request objects.
  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = (input, init) => {
      try {
        if (typeof input === 'string') {
          return origFetch(absolutize(input), init);
        }
        if (input && typeof input.url === 'string' && needsOrigin(input.url)) {
          return origFetch(new Request(absolutize(input.url), input), init);
        }
      } catch { /* fall through to original */ }
      return origFetch(input, init);
    };
  }

  // EventSource — TIS / community SSE streaming.
  const OrigES = window.EventSource;
  if (OrigES) {
    window.EventSource = function (url, cfg) {
      return new OrigES(absolutize(url), cfg);
    };
    window.EventSource.prototype = OrigES.prototype;
    ['CONNECTING', 'OPEN', 'CLOSED'].forEach((k) => { window.EventSource[k] = OrigES[k]; });
  }

  // WebSocket — absolutize /ws to wss://teivaka.com.
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    const wsOrigin = NATIVE_ORIGIN.replace(/^http/, 'ws');
    window.WebSocket = function (url, protocols) {
      let u = url;
      if (typeof url === 'string' && (url.startsWith('/ws') )) u = wsOrigin + url;
      return protocols !== undefined ? new OrigWS(u, protocols) : new OrigWS(u);
    };
    window.WebSocket.prototype = OrigWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { window.WebSocket[k] = OrigWS[k]; });
  }
}

// ── Native Evidence capture (Camera + Geolocation) ──────────────────────────
// Both return web-compatible values so the caller's existing upload/state code is
// unchanged; both return null on the web or on cancel/deny so the caller can fall
// back to its DOM path.

function b64ToBlob(b64, type) {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Open the native camera/photo picker and return a File (jpeg) ready for the
 * existing /community/uploads POST. null on web, cancel, or permission denial.
 */
export async function nativeTakePhoto() {
  const Camera = plugin('Camera');
  if (!Camera) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 70,
      allowEditing: false,
      resultType: 'base64',   // CameraResultType.Base64
      source: 'PROMPT',       // let the farmer choose camera or gallery
      saveToGallery: false,
      correctOrientation: true,
    });
    if (!photo?.base64String) return null;
    const fmt = (photo.format || 'jpeg').toLowerCase();
    const blob = b64ToBlob(photo.base64String, `image/${fmt}`);
    return new File([blob], `evidence.${fmt}`, { type: `image/${fmt}` });
  } catch {
    return null; // user cancelled or denied — caller keeps prior state
  }
}

/** Native GPS fix → {lat,lng} or null (web / denied / unavailable). */
export async function nativeGetPosition() {
  const Geo = plugin('Geolocation');
  if (!Geo) return null;
  try {
    try { await Geo.requestPermissions?.(); } catch { /* older plugin */ }
    const pos = await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    if (pos?.coords) return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { /* denied / timeout / unavailable */ }
  return null;
}

// Keep the native status bar in sync with the Ocean Teal theme (light/dark).
export async function syncStatusBar() {
  const StatusBar = plugin('StatusBar');
  if (!StatusBar) return;
  try {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    // Style.Dark = light text (for dark bg); Style.Light = dark text (for light bg).
    await StatusBar.setStyle?.({ style: dark ? 'DARK' : 'LIGHT' });
    if (nativePlatform() === 'android') {
      await StatusBar.setBackgroundColor?.({ color: dark ? '#0B1F33' : '#FFFFFF' });
    }
    await StatusBar.setOverlaysWebView?.({ overlay: false });
  } catch { /* status bar plugin not installed yet — fine on web */ }
}

/**
 * One-time native boot: hide splash after first paint, theme the status bar,
 * configure keyboard, and route the Android hardware back button through the
 * SPA history instead of killing the app.
 */
export function bootNative() {
  if (!isNative()) return;

  // Mark <html> so the native-only CSS posture (no tap highlight, 44px targets,
  // no text-selection on chrome) applies. Never set on the web.
  try { document.documentElement.classList.add('native-app'); } catch { /* noop */ }

  // Hide the splash once React has painted (avoids a white flash between the
  // native splash and the first app frame).
  const SplashScreen = plugin('SplashScreen');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { SplashScreen?.hide?.(); } catch { /* noop */ }
  }));

  syncStatusBar();
  // Re-theme the status bar whenever the app toggles light/dark (theme.js fires this).
  window.addEventListener('tfos-theme-changed', syncStatusBar);

  // Android hardware back: go back in SPA history; at the root, minimize the app
  // rather than exit, matching native expectations.
  const App = plugin('App');
  try {
    App?.addListener?.('backButton', ({ canGoBack }) => {
      if (window.history.length > 1 && canGoBack !== false) {
        window.history.back();
      } else {
        App.minimizeApp?.();
      }
    });
  } catch { /* App plugin not installed yet */ }
}

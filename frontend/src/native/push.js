/**
 * push.js — native push-notification registration (Capacitor).
 *
 * Scaffolding only — the SEND side (APNs/FCM credentials + a server worker that
 * dispatches) is a separate, credential-gated step. This handles the device side:
 * ask permission, register with APNs/FCM, and POST the device token to the backend
 * so a future sender can target it. No-op on the web.
 *
 * Backend contract: POST /api/v1/push/devices { token, platform }  (idempotent upsert).
 */
import { isNative, nativePlatform } from './bridge';

const plugin = (n) => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.[n] : undefined);

async function registerDevice(token) {
  if (!token) return;
  const tok = localStorage.getItem('tfos_access_token');
  if (!tok) return; // only register an authenticated device
  try {
    await fetch('/api/v1/push/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ token, platform: nativePlatform() }),
    });
  } catch { /* offline — the next app open re-registers */ }
}

let started = false;

/** Idempotent. Call once after the farmer is authenticated. */
export async function initPush() {
  if (!isNative() || started) return;
  const Push = plugin('PushNotifications');
  if (!Push) return;
  started = true;
  try {
    let perm = await Push.checkPermissions?.();
    if (perm?.receive !== 'granted') perm = await Push.requestPermissions?.();
    if (perm?.receive !== 'granted') return;

    await Push.register();

    Push.addListener?.('registration', (t) => registerDevice(t?.value));
    Push.addListener?.('registrationError', () => { /* surfaced server-side later */ });
    // Tapping a notification with a {data:{url}} deep-link routes the SPA there.
    Push.addListener?.('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url && typeof url === 'string' && url.startsWith('/')) {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    });
  } catch { /* permission flow aborted — fine */ }
}

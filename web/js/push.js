// Service worker registration and push notification sign-up.
import { session } from './store.js';
import { post } from './api.js';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker failed', e));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const platformGuess = () => (isIOS() ? 'iphone' : 'android');

/** 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off' */
export async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Ask permission (must be called from a tap) and register this device with the server. */
export async function enablePush() {
  const state = await pushState();
  if (state === 'needs-install') throw new Error('On iPhone, add Hommate to your Home Screen first, then open it from there.');
  if (state === 'unsupported') throw new Error('This browser can’t show notifications.');
  if (state === 'denied') throw new Error('Notifications are blocked. Turn them on for this site in your phone’s settings.');
  if (!window.isSecureContext) throw new Error('Notifications need the HTTPS address (your Cloudflare Tunnel link).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications weren’t allowed.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(session.vapidPublicKey) });
  await post('/push/subscribe', { subscription: sub.toJSON() });
  return 'on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

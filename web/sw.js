// Hommate service worker: offline app shell + push notifications.
// Bump VERSION whenever you change files in web/ so phones pick up the update.
const VERSION = 'hommate-v2';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/css/lumen.css', '/css/app.css',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png',
  '/js/app.js', '/js/dom.js', '/js/ui.js', '/js/api.js', '/js/store.js', '/js/push.js',
  '/js/screens/welcome.js', '/js/screens/onboarding.js', '/js/screens/today.js', '/js/screens/activity.js',
  '/js/screens/chores.js', '/js/screens/rota.js', '/js/screens/chore-detail.js', '/js/screens/chore-form.js',
  '/js/screens/expenses.js', '/js/screens/expense-detail.js', '/js/screens/expense-form.js', '/js/screens/settle.js',
  '/js/screens/house.js', '/js/screens/history.js', '/js/screens/issues.js', '/js/screens/issue-detail.js',
  '/js/screens/issue-form.js', '/js/screens/bill-form.js', '/js/screens/me.js', '/js/screens/member.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION && key !== 'hommate-auth') await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // App files: answer from cache straight away, refresh it in the background.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = event.request.mode === 'navigate' ? '/index.html' : event.request;
    const cached = await cache.match(key);
    const fresh = fetch(event.request).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  })());
});

// ---- Push ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || 'Hommate';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '#/today', taskId: data.taskId },
      actions: (data.actions || []).slice(0, 2)
    });
    // Let open windows refresh their data.
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'refresh' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, taskId } = event.notification.data || {};
  event.waitUntil((async () => {
    if (event.action === 'done' && taskId) {
      // "Mark done" straight from the notification, using the token the app saved.
      const tokenRes = await (await caches.open('hommate-auth')).match('/__token');
      if (tokenRes) {
        const token = await tokenRes.text();
        const res = await fetch(`/api/tasks/${taskId}/done`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
        if (res?.ok) {
          for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'refresh' });
          return;
        }
      }
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = new URL('/' + (url || '#/today'), self.location.origin).href;
    for (const w of windows) {
      if ('focus' in w) {
        await w.focus();
        w.postMessage({ type: 'navigate', url: url || '#/today' });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

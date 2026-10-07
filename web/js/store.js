// Who's signed in, and the house they belong to. Persisted in localStorage.
const KEY = 'hommate.session';

// token     the session token
// user      { id, username, name, mustChange }
// request   a pending join request, or null
// declined, removedFrom   recent news for someone without a house
// me, house, members, former   only when they're in a house
export const session = {
  token: null, user: null, request: null, declined: null, removedFrom: null,
  me: null, house: null, members: [], former: [], colors: [], vapidPublicKey: null
};

export function loadSession() {
  try { Object.assign(session, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }
  return !!session.token;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* ignore */ }
}

/** Store what /api/account (and friends) returned. */
export function saveAccount(acc) {
  if (acc.token) session.token = acc.token;
  if (acc.user) {
    session.user = acc.user;
    session.request = acc.request || null;
    session.declined = acc.declined || null;
    session.removedFrom = acc.removedFrom || null;
    session.colors = acc.colors || session.colors;
    session.vapidPublicKey = acc.vapidPublicKey || session.vapidPublicKey;
    const m = acc.membership;
    session.me = m ? m.me : null;
    session.house = m ? m.house : null;
    session.members = m ? m.members : [];
    session.former = m ? m.former : [];
  }
  persist();
  // The service worker can't read localStorage, so it gets the token via Cache Storage
  // (used for the "Mark done" button on reminder notifications).
  if ('caches' in window && session.token) {
    caches.open('hommate-auth').then((c) => c.put('/__token', new Response(session.token))).catch(() => {});
  }
}

export function clearSession() {
  for (const k of Object.keys(session)) session[k] = Array.isArray(session[k]) ? [] : null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  if ('caches' in window) caches.delete('hommate-auth').catch(() => {});
}

/**
 * Where a signed-in person belongs right now, or null when they can use the whole app.
 * Order matters: a reset password comes first, then having a house, then setting it up.
 */
export function gate() {
  if (!session.token || !session.user) return '#/welcome';
  if (session.user.mustChange) return '#/password?force=1';
  if (!session.me) return session.request ? '#/waiting' : '#/start';
  if (!session.me.setupDone) return '#/about-you';
  return null;
}

// Small per-device preferences (theme, last chores filter).
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('hommate.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hommate.' + k, JSON.stringify(v)); } catch { /* ignore */ } }
};

// Shared helpers used by the API routes and the scheduler.
import crypto from 'node:crypto';
import { sendPush } from './push.js';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (what = 'That') => new HttpError(404, `${what} wasn’t found.`);

/** Invite codes look like ELM482: three letters from the house name, three digits. */
export function makeInviteCode(db, houseName) {
  const letters = (houseName.toUpperCase().replace(/[^A-Z]/g, '') + 'HOM').slice(0, 3);
  for (let i = 0; i < 50; i++) {
    const code = letters + String(crypto.randomInt(100, 1000));
    if (!db.get('SELECT 1 FROM houses WHERE invite_code = ?', code)) return code;
  }
  return 'H' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
}

export const PREF_DEFAULTS = { remind: true, overdue: true, swaps: true, expenses: true, weekly: false };
export const prefsOf = (m) => { try { return { ...PREF_DEFAULTS, ...JSON.parse(m.prefs || '{}') }; } catch { return { ...PREF_DEFAULTS }; } };

export const activeMembers = (db, houseId) =>
  db.all('SELECT * FROM members WHERE house_id = ? AND left_at IS NULL ORDER BY id', houseId);

export function publicMember(m) {
  return { id: m.id, name: m.name, color: m.color, isAdmin: !!m.is_admin, joinedAt: m.created_at, left: !!m.left_at, leftAt: m.left_at || null };
}

export const adminIds = (db, houseId) =>
  db.all('SELECT id FROM members WHERE house_id = ? AND is_admin = 1 AND left_at IS NULL', houseId).map((m) => m.id);

/** Add a line to the house history. */
export function logActivity(db, houseId, now, a) {
  return db.insert(`INSERT INTO activity (house_id, actor_id, cat, icon, verb, detail, target_id, amount, ref_type, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  houseId, a.actor ?? null, a.cat, a.icon, a.verb, a.detail ?? null, a.target ?? null, a.amount ?? null,
  a.refType ?? null, a.refId ?? null, now);
}

// ---- Push notifications -------------------------------------------------------------
let vapidKeys = null;
export const setVapid = (v) => { vapidKeys = v; };
export const pushLog = [];   // recent sends, for tests and the /api/push/debug endpoint

/**
 * Notify members. prefKey (e.g. 'swaps') is checked against each member's settings;
 * pass null to always send. Fire-and-forget: never blocks the API response.
 */
export function notify(db, memberIds, prefKey, payload) {
  const ids = [...new Set(memberIds.filter(Boolean))];
  for (const id of ids) {
    const m = db.get('SELECT * FROM members WHERE id = ? AND left_at IS NULL', id);
    if (!m || !m.user_id) continue;
    if (prefKey && !prefsOf(m)[prefKey]) continue;
    notifyUser(db, m.user_id, payload, id);
  }
}

/** Send to every device an account has signed up for notifications on. */
export function notifyUser(db, userId, payload, memberId = null) {
  const subs = db.all('SELECT * FROM push_subs WHERE user_id = ?', userId);
  pushLog.push({ memberId, userId, payload, subs: subs.length, at: Date.now() });
  if (pushLog.length > 100) pushLog.shift();
  if (!vapidKeys) return;
  for (const s of subs) {
    sendPush(s, payload, vapidKeys, { subject: process.env.HOMMATE_CONTACT || 'mailto:hommate@example.com' })
      .then((r) => { if (r.gone) db.run('DELETE FROM push_subs WHERE id = ?', s.id); })
      .catch(() => {});
  }
}

/** "Maya", or "Someone" when the member is unknown. */
export const nameOf = (db, id) => (id ? db.get('SELECT name FROM members WHERE id = ?', id)?.name : null) || 'Someone';

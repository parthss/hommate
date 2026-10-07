// What the app needs to know about the signed-in person: their account, their house
// (if any), a pending join request, and whether they were recently removed or declined.
import { activeMembers, publicMember, prefsOf } from './house.js';
import { addDays } from './time.js';

export const COLORS = [
  { id: 'violet', name: 'Violet', hex: '#6b4fd8' },
  { id: 'teal', name: 'Teal', hex: '#0f7b6c' },
  { id: 'orange', name: 'Orange', hex: '#b25000' },
  { id: 'rose', name: 'Rose', hex: '#b8326a' },
  { id: 'green', name: 'Green', hex: '#3d7a1f' },
  { id: 'slate', name: 'Slate', hex: '#5c6670' },
  { id: 'plum', name: 'Plum', hex: '#8e3fa0' },
  { id: 'ochre', name: 'Ochre', hex: '#9a6700' }
];
export const HEXES = new Set(COLORS.map((c) => c.hex));

/** The first colour nobody in the house is using. */
export function freeColor(db, houseId, prefer) {
  const used = new Set(activeMembers(db, houseId).map((m) => m.color));
  if (prefer && !used.has(prefer)) return prefer;
  return (COLORS.find((c) => !used.has(c.hex)) || COLORS[0]).hex;
}

/** House data for a member: themselves, the house, current and former housemates. */
export function snapshot(db, me) {
  const house = db.get('SELECT * FROM houses WHERE id = ?', me.house_id);
  const all = db.all(`SELECT m.*, u.username FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.house_id = ? ORDER BY m.id`, me.house_id);
  const shape = (m) => ({ ...publicMember(m), username: m.username || null });
  return {
    me: { ...shape(all.find((m) => m.id === me.id)), prefs: prefsOf(me), reminderMinutes: me.reminder_minutes, setupDone: !!me.setup_done },
    house: { id: house.id, name: house.name, inviteCode: house.invite_code, tz: house.tz },
    members: all.filter((m) => !m.left_at).map(shape),
    former: all.filter((m) => m.left_at).map(shape)
  };
}

export function accountOf(db, user, vapid, now) {
  const me = db.get('SELECT * FROM members WHERE user_id = ? AND left_at IS NULL', user.id);
  const out = {
    user: { id: user.id, username: user.username, name: user.name, mustChange: !!user.must_change },
    membership: me ? snapshot(db, me) : null,
    request: null, declined: null, removedFrom: null,
    colors: COLORS,
    vapidPublicKey: vapid?.publicKey
  };
  if (!me) {
    const req = db.get(`SELECT r.*, h.name AS house_name FROM join_requests r JOIN houses h ON h.id = r.house_id
      WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 1`, user.id);
    if (req?.status === 'pending') out.request = { id: req.id, houseName: req.house_name, createdAt: req.created_at };
    const recent = (at) => at && at >= `${addDays(now.slice(0, 10), -14)}`;
    if (req?.status === 'declined' && recent(req.answered_at)) out.declined = { houseName: req.house_name, at: req.answered_at };
    const left = db.get(`SELECT m.*, h.name AS house_name, r.name AS remover FROM members m JOIN houses h ON h.id = m.house_id
      LEFT JOIN members r ON r.id = m.removed_by WHERE m.user_id = ? AND m.left_at IS NOT NULL ORDER BY m.left_at DESC LIMIT 1`, user.id);
    if (left && recent(left.left_at) && !out.request) out.removedFrom = { houseName: left.house_name, at: left.left_at, by: left.remover || null };
  }
  return out;
}

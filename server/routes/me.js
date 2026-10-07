// Your settings inside a house: name, colour, notification preferences; renaming the house.
import { accountOf, HEXES } from '../lib/account.js';
import { bad, HttpError, activeMembers, prefsOf, logActivity, notify, PREF_DEFAULTS } from '../lib/house.js';
import { cleanName } from './account.js';

export default function register(route, { db, vapid }) {
  const account = (user, now) => accountOf(db, db.get('SELECT * FROM users WHERE id = ?', user.id), vapid, now);

  route('GET', '/api/me', ({ user, now }) => account(user, now));

  route('PATCH', '/api/me', ({ user, me, body, now }) => {
    const others = activeMembers(db, me.house_id).filter((m) => m.id !== me.id);
    if (body.name !== undefined) {
      const name = cleanName(body.name, 'your name', 30);
      if (others.some((m) => m.name.toLowerCase() === name.toLowerCase())) throw bad(`There’s already a ${name} in this house. Add an initial?`);
      db.run('UPDATE members SET name = ? WHERE id = ?', name, me.id);
    }
    if (body.color !== undefined) {
      if (!HEXES.has(body.color)) throw bad('Pick a colour.');
      if (others.some((m) => m.color === body.color)) throw bad('Someone already has that colour.');
      db.run('UPDATE members SET color = ? WHERE id = ?', body.color, me.id);
    }
    if (body.prefs) {
      const p = prefsOf(me);
      for (const k of Object.keys(PREF_DEFAULTS)) if (typeof body.prefs[k] === 'boolean') p[k] = body.prefs[k];
      db.run('UPDATE members SET prefs = ? WHERE id = ?', JSON.stringify(p), me.id);
    }
    if (body.reminderMinutes !== undefined) {
      const v = Number(body.reminderMinutes);
      if (![0, 15, 30, 60, 120, 180, 1440].includes(v)) throw bad('Pick a reminder time from the list.');
      db.run('UPDATE members SET reminder_minutes = ? WHERE id = ?', v, me.id);
    }
    if (body.setupDone && !me.setup_done) {
      db.run('UPDATE members SET setup_done = 1 WHERE id = ?', me.id);
      const fresh = db.get('SELECT * FROM members WHERE id = ?', me.id);
      logActivity(db, me.house_id, now, { actor: me.id, cat: 'house', icon: 'join', verb: 'joined the house' });
      notify(db, others.map((m) => m.id), null, { title: 'New housemate', body: `${fresh.name} joined the house.`, url: '#/house' });
    }
    return account(user, now);
  });

  route('PATCH', '/api/house', ({ user, me, body, house, now }) => {
    if (!me.is_admin) throw new HttpError(403, 'Only a house admin can rename the house.');
    const name = cleanName(body.name, 'a house name');
    db.run('UPDATE houses SET name = ? WHERE id = ?', name, house.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'house', icon: 'edit', verb: `renamed the house to ${name}` });
    return account(user, now);
  });

  route('POST', '/api/push/test', ({ user, me }) => {
    const n = db.get('SELECT COUNT(*) n FROM push_subs WHERE user_id = ?', user.id).n;
    if (!n) throw bad('Notifications aren’t on for this device yet.');
    notify(db, [me.id], null, { title: 'Hommate', body: 'Notifications are working.', url: '#/today' });
    return { ok: true, devices: n };
  });
}

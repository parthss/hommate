// Admin tools: join requests, housemate pages, admin rights, password resets and removing people.
import { accountOf, freeColor, snapshot } from '../lib/account.js';
import { hashPassword, tempPassword } from '../lib/auth.js';
import { removalPreview, removeMember } from '../lib/membership.js';
import { houseBalances } from './money.js';
import { bad, notFound, HttpError, activeMembers, publicMember, logActivity, notifyUser } from '../lib/house.js';

const needAdmin = (me) => { if (!me.is_admin) throw new HttpError(403, 'Only a house admin can do that.'); };

export default function register(route, { db, vapid }) {
  const memberIn = (houseId, id) => {
    const m = db.get(`SELECT m.*, u.username FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ? AND m.house_id = ?`, Number(id), houseId);
    if (!m) throw notFound('That person');
    return m;
  };

  // ---- Join requests ----
  route('GET', '/api/house/requests', ({ me, house }) => {
    const rows = db.all(`SELECT r.*, u.username, u.name FROM join_requests r JOIN users u ON u.id = r.user_id
      WHERE r.house_id = ? AND r.status = 'pending' ORDER BY r.id`, house.id);
    return {
      canAnswer: !!me.is_admin,
      requests: rows.map((r) => ({
        id: r.id, name: r.name, username: r.username, createdAt: r.created_at,
        returning: !!db.get('SELECT 1 FROM members WHERE house_id = ? AND user_id = ? AND left_at IS NOT NULL', house.id, r.user_id)
      }))
    };
  });

  route('POST', '/api/house/requests/:id/approve', ({ me, house, params, now }) => {
    needAdmin(me);
    const r = db.get(`SELECT * FROM join_requests WHERE id = ? AND house_id = ?`, Number(params.id), house.id);
    if (!r || r.status !== 'pending') throw bad('That request has already been answered.');
    const user = db.get('SELECT * FROM users WHERE id = ?', r.user_id);
    if (db.get('SELECT 1 FROM members WHERE user_id = ? AND left_at IS NULL', user.id)) {
      db.run(`UPDATE join_requests SET status = 'cancelled', answered_at = ? WHERE id = ?`, now, r.id);
      throw bad(`${user.name} has joined another house since asking.`);
    }
    if (activeMembers(db, house.id).length >= 12) throw bad('This house is full (12 people).');
    let memberId;
    db.tx(() => {
      // Someone coming back gets their old place (and their history and balance) again.
      const old = db.get('SELECT * FROM members WHERE house_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', house.id, user.id);
      if (old) {
        memberId = old.id;
        db.run('UPDATE members SET left_at = NULL, removed_by = NULL, is_admin = 0, setup_done = 0, color = ? WHERE id = ?', freeColor(db, house.id, old.color), old.id);
      } else {
        // Names must be unique in the house; add a number if needed.
        let name = user.name, n = 2;
        while (activeMembers(db, house.id).some((m) => m.name.toLowerCase() === name.toLowerCase())) name = `${user.name} ${n++}`;
        memberId = db.insert('INSERT INTO members (house_id, user_id, name, color, setup_done, created_at) VALUES (?, ?, ?, ?, 0, ?)',
          house.id, user.id, name, freeColor(db, house.id), now);
      }
      db.run(`UPDATE join_requests SET status = 'approved', answered_at = ?, answered_by = ? WHERE id = ?`, now, me.id, r.id);
      logActivity(db, house.id, now, { actor: me.id, cat: 'house', icon: 'join', verb: 'approved {target}’s request to join', target: memberId });
    });
    notifyUser(db, user.id, { title: `You’re in ${house.name}`, body: 'Pick your colour to get started.', url: '#/about-you' });
    return { ok: true, memberId };
  });

  route('POST', '/api/house/requests/:id/decline', ({ me, house, params, now }) => {
    needAdmin(me);
    const r = db.get(`SELECT * FROM join_requests WHERE id = ? AND house_id = ?`, Number(params.id), house.id);
    if (!r || r.status !== 'pending') throw bad('That request has already been answered.');
    db.run(`UPDATE join_requests SET status = 'declined', answered_at = ?, answered_by = ? WHERE id = ?`, now, me.id, r.id);
    notifyUser(db, r.user_id, { title: 'Join request declined', body: `${house.name} didn’t accept your request.`, url: '#/start' });
    return { ok: true };
  });

  // ---- A housemate's page ----
  route('GET', '/api/members/:id', ({ me, house, params, today }) => {
    const m = memberIn(house.id, params.id);
    const { net, debts } = houseBalances(db, house.id);
    const between = debts.filter((d) => (d.from === me.id && d.to === m.id) || (d.from === m.id && d.to === me.id));
    const upcoming = db.get(`SELECT COUNT(*) n FROM tasks t JOIN chores c ON c.id = t.chore_id
      WHERE c.house_id = ? AND t.assignee_id = ? AND t.status = 'open' AND t.due_date >= ?`, house.id, m.id, today).n;
    return {
      member: { ...publicMember(m), username: m.username, removedBy: m.removed_by },
      net: net.get(m.id) || 0,
      between,
      upcoming,
      admins: activeMembers(db, house.id).filter((x) => x.is_admin).length
    };
  });

  route('POST', '/api/members/:id/admin', ({ user, me, house, params, body, now }) => {
    needAdmin(me);
    const m = memberIn(house.id, params.id);
    if (m.left_at) throw bad('They’re no longer in the house.');
    const make = !!body.isAdmin;
    if (!make && m.is_admin && activeMembers(db, house.id).filter((x) => x.is_admin).length === 1) throw bad('A house needs at least one admin.');
    db.run('UPDATE members SET is_admin = ? WHERE id = ?', make ? 1 : 0, m.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'house', icon: 'edit', verb: make ? 'made {target} an admin' : 'removed admin rights from {target}', target: m.id });
    return accountOf(db, user, vapid, now);
  });

  route('POST', '/api/members/:id/reset-password', async ({ me, house, params, now }) => {
    needAdmin(me);
    const m = memberIn(house.id, params.id);
    if (m.id === me.id) throw bad('Change your own password in About you.');
    if (m.left_at || !m.user_id) throw bad('They’re no longer in the house.');
    const temp = tempPassword();
    db.run('UPDATE users SET pass_hash = ?, must_change = 1, failed_count = 0, locked_until = NULL WHERE id = ?', await hashPassword(temp), m.user_id);
    db.run('DELETE FROM sessions WHERE user_id = ?', m.user_id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'house', icon: 'edit', verb: 'reset {target}’s password', target: m.id });
    return { tempPassword: temp, username: m.username };
  });

  route('GET', '/api/members/:id/removal', ({ me, house, params, today }) => {
    needAdmin(me);
    const m = memberIn(house.id, params.id);
    return removalPreview(db, house, m, today);
  });

  route('POST', '/api/members/:id/remove', ({ user, me, house, params, now, today }) => {
    needAdmin(me);
    const m = memberIn(house.id, params.id);
    if (m.left_at) throw bad('They’ve already left.');
    if (removalPreview(db, house, m, today).isLastAdmin) throw bad('Make someone else an admin first. A house needs at least one.');
    removeMember(db, house, m, me, now);
    return accountOf(db, user, vapid, now);
  });
}

export { snapshot };

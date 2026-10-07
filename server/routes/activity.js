// The bell feed (Activity) and the full Activity history.
import { TASK_SQL, shapeTask } from './chores.js';
import { addMinutes } from '../lib/time.js';

const shape = (a) => ({
  id: a.id, actorId: a.actor_id, cat: a.cat, icon: a.icon, verb: a.verb, detail: a.detail,
  targetId: a.target_id, amount: a.amount, refType: a.ref_type, refId: a.ref_id, at: a.created_at
});

export default function register(route, { db }) {
  // Bell: swaps that need me, swaps I'm waiting on, and recent activity. Marks it all as seen.
  route('GET', '/api/activity/feed', ({ me, house, now }) => {
    const pending = db.all(`SELECT * FROM swaps WHERE house_id = ? AND status = 'pending' AND (to_id = ? OR from_id = ?) ORDER BY id DESC`, house.id, me.id, me.id);
    const taskOf = (id) => (id ? shapeTask(db.get(`${TASK_SQL} WHERE t.id = ?`, id), now) : null);
    const swaps = pending.map((s) => ({
      id: s.id, fromId: s.from_id, toId: s.to_id, createdAt: s.created_at,
      task: taskOf(s.task_id), give: taskOf(s.give_task_id), forMe: s.to_id === me.id
    }));
    // Swaps I answered in the last few minutes, so the Undo link survives a refresh.
    const answered = db.all(`SELECT * FROM swaps WHERE house_id = ? AND to_id = ? AND status IN ('accepted','declined') AND answered_at >= ? ORDER BY id DESC`, house.id, me.id, addMinutes(now, -10))
      .map((s) => ({ id: s.id, fromId: s.from_id, status: s.status, task: taskOf(s.task_id), give: taskOf(s.give_task_id) }));
    const recent = db.all(`SELECT * FROM activity WHERE house_id = ? AND cat != 'house' ORDER BY id DESC LIMIT 25`, house.id).map(shape);
    const lastId = db.get('SELECT MAX(id) id FROM activity WHERE house_id = ?', house.id).id || 0;
    const seenBefore = me.last_seen_activity;
    db.run('UPDATE members SET last_seen_activity = ? WHERE id = ?', lastId, me.id);
    return { now, swaps, answered, recent, seenBefore };
  });

  // Full history with filters. Pages backwards with ?before=<id>.
  route('GET', '/api/activity', ({ house, now, query }) => {
    const where = ['house_id = ?'];
    const args = [house.id];
    if (['chores', 'money', 'swaps', 'issues'].includes(query.kind)) { where.push('cat = ?'); args.push(query.kind); }
    if (query.person === 'system') where.push('actor_id IS NULL');
    else if (query.person && query.person !== 'all') { where.push('actor_id = ?'); args.push(Number(query.person)); }
    if (query.before) { where.push('id < ?'); args.push(Number(query.before)); }
    const limit = Math.min(100, Number(query.limit) || 40);
    const items = db.all(`SELECT * FROM activity WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...args, limit + 1).map(shape);
    return { now, items: items.slice(0, limit), more: items.length > limit };
  });
}

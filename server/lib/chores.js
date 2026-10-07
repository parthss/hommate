// Chore scheduling: turns a chore's repeat rule into dated tasks, and works out whose turn it is.
import { addDays, weekdayKey, daysInMonth, today as todayIn, dueAt } from './time.js';

export const HORIZON_DAYS = 15; // generate tasks this far ahead (covers this week and next)

export const parseRotation = (c) => {
  try { return JSON.parse(c.rotation || '[]'); } catch { return []; }
};

/** Does the chore happen on this date? */
export function occursOn(chore, date) {
  if (date < chore.start_date) return false;
  switch (chore.repeat) {
    case 'once': return date === chore.start_date;
    case 'daily': return true;
    case 'weekly':
    case 'custom': return chore.days.split(',').includes(weekdayKey(date));
    case 'monthly': {
      const want = Number(chore.days) || Number(chore.start_date.slice(8, 10));
      const y = +date.slice(0, 4), m = +date.slice(5, 7);
      return +date.slice(8, 10) === Math.min(want, daysInMonth(y, m));
    }
    default: return false;
  }
}

/** Who a newly generated task belongs to. */
export function assigneeFor(chore, seq) {
  if (chore.mode === 'one') return chore.owner_id;
  if (chore.mode === 'turns') {
    const rot = parseRotation(chore);
    if (!rot.length) return null;
    const base = chore.rot_base ?? 0;
    return rot[(((seq - base) % rot.length) + rot.length) % rot.length];
  }
  return null; // 'claim' — sits in Unclaimed until someone takes it
}

/**
 * Make sure every occurrence from the last past task up to the horizon has a task row.
 * Safe to call often: existing rows are left alone.
 */
export function ensureTasks(db, chore, today) {
  if (chore.archived_at) return;
  const horizon = addDays(today, HORIZON_DAYS);

  if (chore.repeat === 'once') {
    if (!db.get('SELECT 1 FROM tasks WHERE chore_id = ?', chore.id)) {
      db.run('INSERT INTO tasks (chore_id, seq, due_date, due_time, assignee_id) VALUES (?, 0, ?, ?, ?)',
        chore.id, chore.start_date, chore.due_time, assigneeFor(chore, 0));
    }
    return;
  }

  // Resume from the last task before today (those are history and never change).
  const past = db.get('SELECT due_date, seq FROM tasks WHERE chore_id = ? AND due_date < ? ORDER BY due_date DESC LIMIT 1', chore.id, today);
  let seq = past ? past.seq + 1 : 0;
  let d = past ? addDays(past.due_date, 1) : chore.start_date;
  const existing = new Map(db.all('SELECT due_date, seq FROM tasks WHERE chore_id = ? AND due_date >= ?', chore.id, d)
    .map((r) => [r.due_date, r.seq]));

  for (; d <= horizon; d = addDays(d, 1)) {
    if (!occursOn(chore, d)) continue;
    if (existing.has(d)) { seq = existing.get(d) + 1; continue; }
    if (chore.mode === 'turns' && chore.rot_base == null) {
      // First task after a (re)plan: rotation[0] starts here.
      chore.rot_base = seq;
      db.run('UPDATE chores SET rot_base = ? WHERE id = ?', seq, chore.id);
    }
    db.run('INSERT INTO tasks (chore_id, seq, due_date, due_time, assignee_id) VALUES (?, ?, ?, ?, ?)',
      chore.id, seq, d, chore.due_time, assigneeFor(chore, seq));
    seq++;
  }
}

/**
 * Before saving an edited chore: clear future tasks that haven't been touched so they
 * can be regenerated from the new rule. Done, swapped or swap-pending tasks stay put.
 */
export function clearFutureTasks(db, choreId, today) {
  db.run(`DELETE FROM tasks
    WHERE chore_id = ? AND status = 'open' AND swapped = 0 AND due_date >= ?
      AND id NOT IN (SELECT task_id FROM swaps WHERE status = 'pending')
      AND id NOT IN (SELECT give_task_id FROM swaps WHERE status = 'pending' AND give_task_id IS NOT NULL)`,
  choreId, today);
}

/** Generate tasks for every chore in a house, and retire superseded ones. */
export function refreshHouse(db, house, now) {
  const today = now.slice(0, 10);
  for (const c of db.all('SELECT * FROM chores WHERE house_id = ? AND archived_at IS NULL', house.id)) {
    ensureTasks(db, c, today);
  }
  // A recurring task that is still open once the *next* occurrence is already due counts as missed.
  const open = db.all(`SELECT t.id, t.chore_id, t.due_date, t.due_time FROM tasks t JOIN chores c ON c.id = t.chore_id
    WHERE c.house_id = ? AND t.status = 'open' AND c.repeat != 'once' AND t.due_date < ?`, house.id, today);
  for (const t of open) {
    const next = db.get(`SELECT due_date, due_time FROM tasks WHERE chore_id = ? AND due_date > ? ORDER BY due_date LIMIT 1`, t.chore_id, t.due_date);
    if (next && dueAt(next.due_date, next.due_time) <= now) {
      db.run(`UPDATE tasks SET status = 'missed' WHERE id = ?`, t.id);
    }
  }
}

/** Plain-English repeat rule: "Weekly", "Mon, Thu", "Daily", "One-off", "Monthly". */
export function repeatLabel(c) {
  if (c.repeat === 'once') return 'One-off';
  if (c.repeat === 'daily') return 'Daily';
  if (c.repeat === 'monthly') return 'Monthly';
  const days = c.days.split(',').filter(Boolean);
  if (days.length === 1) return 'Weekly';
  if (days.length === 7) return 'Daily';
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return days.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => d[0].toUpperCase() + d.slice(1)).join(', ');
}

/** A short label for the rota grid: "Take bins out" → "Bins". */
export function shortName(title) {
  const skip = new Set(['take', 'out', 'the', 'a', 'an', 'put', 'empty', 'clean', 'clear', 'wipe', 'down', 'do', 'water', 'hoover', 'mop', 'descale', 'defrost', 'of', 'up', 'and', 'living', 'room']);
  const words = title.split(/\s+/).filter(Boolean);
  const keep = words.filter((w) => !skip.has(w.toLowerCase()));
  const w = (keep[0] || words[0] || title);
  return (w[0].toUpperCase() + w.slice(1)).slice(0, 12);
}

export { todayIn };

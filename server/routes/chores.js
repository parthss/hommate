// Chores, tasks (each dated occurrence of a chore), the rota and swaps.
import {
  addDays, startOfWeek, dueAt, shortDate, clock, weekdayIndex, WEEKDAYS, daysBetween
} from '../lib/time.js';
import {
  ensureTasks, clearFutureTasks, occursOn, assigneeFor, parseRotation, repeatLabel, shortName
} from '../lib/chores.js';
import { bad, notFound, HttpError, activeMembers, logActivity, notify, nameOf } from '../lib/house.js';

const TASK_SQL = `SELECT t.*, c.title, c.short, c.repeat, c.days, c.mode, c.rotation, c.house_id, c.reminder_minutes
  FROM tasks t JOIN chores c ON c.id = t.chore_id`;

/** Shape a task row for the app. */
function shapeTask(t, now, pendingSwaps = []) {
  const due = dueAt(t.due_date, t.due_time);
  const swap = pendingSwaps.find((s) => s.task_id === t.id || s.give_task_id === t.id);
  return {
    id: t.id,
    choreId: t.chore_id,
    title: t.title,
    short: t.short || shortName(t.title),
    dueDate: t.due_date,
    dueTime: t.due_time,
    assigneeId: t.assignee_id,
    status: t.status,
    overdue: t.status === 'open' && due < now,
    doneBy: t.done_by,
    doneAt: t.done_at,
    repeat: repeatLabel(t),
    mode: t.mode,
    swap: swap ? { id: swap.id, fromId: swap.from_id, toId: swap.to_id, taskId: swap.task_id, giveTaskId: swap.give_task_id } : null
  };
}

const pendingSwapsFor = (db, houseId) => db.all(`SELECT * FROM swaps WHERE house_id = ? AND status = 'pending'`, houseId);

function lateness(t) {
  if (t.status === 'missed') return 'Missed';
  if (!t.done_at) return null;
  const due = dueAt(t.due_date, t.due_time);
  if (t.done_at <= due) return 'On time';
  const days = daysBetween(t.due_date, t.done_at.slice(0, 10));
  return days <= 0 ? 'A bit late' : days === 1 ? 'A day late' : `${days} days late`;
}

function getTask(db, id, houseId) {
  const t = db.get(`${TASK_SQL} WHERE t.id = ?`, id);
  if (!t || t.house_id !== houseId) throw notFound('That chore');
  return t;
}

/** Validate and normalise the chore form. */
function readChoreForm(db, body, houseId, today) {
  const title = String(body.title || '').trim().replace(/\s+/g, ' ');
  if (!title) throw bad('Give the chore a name.');
  if (title.length > 60) throw bad('Keep the name under 60 characters.');
  const repeat = body.repeat;
  if (!['once', 'daily', 'weekly', 'custom', 'monthly'].includes(repeat)) throw bad('Pick how often.');
  let days = '';
  if (repeat === 'weekly' || repeat === 'custom') {
    const list = (Array.isArray(body.days) ? body.days : []).filter((d) => WEEKDAYS.includes(d));
    if (!list.length) throw bad('Pick at least one day.');
    if (repeat === 'weekly' && list.length !== 1) throw bad('Weekly chores happen on one day. Use Custom for more.');
    days = WEEKDAYS.filter((d) => list.includes(d)).join(',');
  }
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(body.startDate || '') ? body.startDate : today;
  if (repeat === 'monthly') days = String(+startDate.slice(8, 10));
  const dueTime = body.dueTime ? String(body.dueTime) : null;
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) throw bad('That time doesn’t look right.');
  const mode = body.mode;
  if (!['one', 'turns', 'claim'].includes(mode)) throw bad('Pick who does it.');
  const memberIds = new Set(activeMembers(db, houseId).map((m) => m.id));
  let ownerId = null, rotation = [];
  if (mode === 'one') {
    ownerId = Number(body.ownerId);
    if (!memberIds.has(ownerId)) throw bad('Pick who does it.');
  }
  if (mode === 'turns') {
    rotation = (Array.isArray(body.rotation) ? body.rotation : []).map(Number).filter((id) => memberIds.has(id));
    rotation = [...new Set(rotation)];
    if (rotation.length < 2) throw bad('Pick at least two people to take turns.');
  }
  let reminder = body.reminderMinutes;
  reminder = reminder === null || reminder === undefined || reminder === '' ? null : Number(reminder);
  if (reminder !== null && ![-1, 0, 15, 30, 60, 120, 180, 1440].includes(reminder)) throw bad('Pick a reminder from the list.');
  const short = String(body.short || '').trim().slice(0, 12) || shortName(title);
  return { title, short, repeat, days, mode, ownerId, rotation, startDate, dueTime, reminder };
}

/**
 * Upcoming turns for a chore: real tasks where they exist (so swaps show), then
 * projected ones from the repeat rule. Used for "Turn order" on the chore page.
 */
function projectTurns(db, chore, fromDate, count) {
  const out = [];
  const tasks = db.all(`SELECT * FROM tasks WHERE chore_id = ? AND due_date >= ? AND status = 'open' ORDER BY due_date`, chore.id, fromDate);
  for (const t of tasks) { if (out.length < count) out.push({ date: t.due_date, time: t.due_time, memberId: t.assignee_id, taskId: t.id }); }
  if (chore.repeat === 'once') return out;
  const last = db.get('SELECT due_date, seq FROM tasks WHERE chore_id = ? ORDER BY due_date DESC LIMIT 1', chore.id);
  if (!last) return out;
  let seq = last.seq + 1;
  for (let d = addDays(last.due_date, 1), guard = 0; out.length < count && guard < 400; d = addDays(d, 1), guard++) {
    if (!occursOn(chore, d)) continue;
    out.push({ date: d, time: chore.due_time, memberId: assigneeFor(chore, seq), taskId: null });
    seq++;
  }
  return out;
}

export default function register(route, { db }) {
  // ---- Today ----
  route('GET', '/api/today', ({ me, house, now, today }) => {
    const swaps = pendingSwapsFor(db, house.id);
    const mine = db.all(`${TASK_SQL} WHERE c.house_id = ? AND t.assignee_id = ? AND c.archived_at IS NULL
      AND ((t.due_date = ? AND t.status IN ('open','done')) OR (t.due_date < ? AND t.status = 'open'))
      ORDER BY t.due_date, COALESCE(t.due_time, '99')`, house.id, me.id, today, today).map((t) => shapeTask(t, now, swaps));
    const overdue = mine.filter((t) => t.dueDate < today);
    const dueToday = mine.filter((t) => t.dueDate === today);

    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const weekTasks = db.all(`${TASK_SQL} WHERE c.house_id = ? AND t.assignee_id = ? AND c.archived_at IS NULL
      AND t.due_date BETWEEN ? AND ? AND t.status != 'missed' ORDER BY t.due_date, COALESCE(t.due_time, '99')`, house.id, me.id, weekStart, weekEnd);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, count: weekTasks.filter((t) => t.due_date === d).length, isToday: d === today };
    });
    const later = weekTasks.filter((t) => t.due_date > today && t.status === 'open').map((t) => shapeTask(t, now, swaps));

    const issues = db.all(`SELECT * FROM issues WHERE house_id = ? AND status = 'open' ORDER BY COALESCE(tag_id = ?, 0) DESC, (type = 'now') DESC, id DESC`, house.id, me.id);
    const unseen = db.get('SELECT COUNT(*) n FROM activity WHERE house_id = ? AND id > ? AND (actor_id IS NULL OR actor_id != ?)', house.id, me.last_seen_activity, me.id).n;
    const swapsForMe = swaps.filter((s) => s.to_id === me.id).length;

    return {
      now,
      overdue,
      today: dueToday,
      doneCount: dueToday.filter((t) => t.status === 'done').length,
      totalCount: dueToday.length,
      leftCount: dueToday.filter((t) => t.status === 'open').length + overdue.length,
      week: days,
      later,
      issues: { open: issues.length, top: issues.slice(0, 2).map((i) => issueSummary(db, i, me)) },
      bell: { unseen, swapsForMe }
    };
  });

  // ---- Chores list ----
  route('GET', '/api/chores', ({ me, house, now, today, query }) => {
    const filter = ['mine', 'all', 'unclaimed'].includes(query.filter) ? query.filter : 'mine';
    const swaps = pendingSwapsFor(db, house.id);
    const weekEnd = addDays(startOfWeek(today), 6);
    const horizon = addDays(today, 15);
    const rows = db.all(`${TASK_SQL} WHERE c.house_id = ? AND c.archived_at IS NULL
      AND ((t.status = 'open' AND t.due_date <= ?) OR (t.status = 'done' AND t.due_date = ?))
      ORDER BY t.due_date, COALESCE(t.due_time, '99')`, house.id, horizon, today);

    const keep = (t) => filter === 'all' ? true : filter === 'mine' ? t.assignee_id === me.id : t.assignee_id === null;
    // One row per chore: its most pressing task (overdue → today → next).
    const byChore = new Map();
    for (const t of rows.filter(keep)) {
      const cur = byChore.get(t.chore_id);
      const rank = (x) => (x.status === 'open' && x.due_date < today ? 0 : x.due_date === today ? 1 : 2);
      if (!cur || rank(t) < rank(cur) || (rank(t) === rank(cur) && t.due_date === today && cur.status === 'done' && t.status === 'open')) byChore.set(t.chore_id, t);
    }
    const items = [...byChore.values()].map((t) => shapeTask(t, now, swaps));
    const group = (t) => t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : t.dueDate <= weekEnd ? 'week' : 'later';
    const order = { overdue: 0, today: 1, week: 2, later: 3 };
    items.sort((a, b) => order[group(a)] - order[group(b)] || (a.dueDate + (a.dueTime || '99')).localeCompare(b.dueDate + (b.dueTime || '99')));
    const total = db.get('SELECT COUNT(*) n FROM chores WHERE house_id = ? AND archived_at IS NULL', house.id).n;
    return { now, filter, total, items: items.map((t) => ({ ...t, group: group(t) })) };
  });

  // ---- Rota: a week grid of who has what ----
  route('GET', '/api/rota', ({ house, now, today, query }) => {
    const offset = Math.max(-4, Math.min(1, Number(query.week) || 0));
    const start = addDays(startOfWeek(today), offset * 7);
    const end = addDays(start, 6);
    const tasks = db.all(`${TASK_SQL} WHERE c.house_id = ? AND c.archived_at IS NULL AND t.due_date BETWEEN ? AND ?
      ORDER BY t.due_date, COALESCE(t.due_time, '99')`, house.id, start, end).map((t) => shapeTask(t, now));
    return {
      now, start, end, offset,
      days: Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), isToday: addDays(start, i) === today })),
      tasks: tasks.filter((t) => t.assigneeId),
      unclaimed: tasks.filter((t) => !t.assigneeId && t.status === 'open')
    };
  });

  // ---- One chore ----
  route('GET', '/api/chores/:id', ({ me, house, now, today, params }) => {
    const chore = db.get('SELECT * FROM chores WHERE id = ? AND house_id = ?', Number(params.id), house.id);
    if (!chore) throw notFound('That chore');
    const swaps = pendingSwapsFor(db, house.id);
    const currentRow = db.get(`${TASK_SQL} WHERE t.chore_id = ? AND t.status = 'open' ORDER BY t.due_date LIMIT 1`, chore.id)
      || db.get(`${TASK_SQL} WHERE t.chore_id = ? AND t.due_date = ? LIMIT 1`, chore.id, today);
    const current = currentRow ? shapeTask(currentRow, now, swaps) : null;
    const rot = parseRotation(chore);
    const turnCount = chore.mode === 'turns' ? rot.length : chore.mode === 'claim' ? 1 : 3;
    const turns = chore.archived_at ? [] : projectTurns(db, chore, current ? current.dueDate : today, Math.max(turnCount, 1));
    const history = db.all(`SELECT * FROM tasks WHERE chore_id = ? AND status IN ('done','missed') ORDER BY due_date DESC LIMIT 12`, chore.id)
      .map((t) => ({ id: t.id, dueDate: t.due_date, memberId: t.status === 'done' ? t.done_by : t.assignee_id, doneAt: t.done_at, status: t.status, note: lateness(t) }));
    const lastDone = history.find((h) => h.status === 'done' && h.doneAt?.slice(0, 10) === today);

    // For editing: list the rotation starting with whoever is up next.
    let editRotation = rot;
    if (chore.mode === 'turns' && turns.length) {
      const first = rot.indexOf(turns[0].memberId);
      if (first > 0) editRotation = [...rot.slice(first), ...rot.slice(0, first)];
    }
    let swap = null;
    if (current?.swap) {
      const sw = db.get('SELECT * FROM swaps WHERE id = ?', current.swap.id);
      const t2 = (id) => (id ? shapeTask(db.get(`${TASK_SQL} WHERE t.id = ?`, id), now) : null);
      swap = { id: sw.id, fromId: sw.from_id, toId: sw.to_id, createdAt: sw.created_at, task: t2(sw.task_id), give: t2(sw.give_task_id) };
    }
    return {
      now,
      swap,
      chore: {
        id: chore.id, title: chore.title, short: chore.short, repeat: chore.repeat, repeatLabel: repeatLabel(chore),
        days: chore.days ? chore.days.split(',') : [], mode: chore.mode, ownerId: chore.owner_id, rotation: editRotation,
        startDate: chore.start_date, dueTime: chore.due_time, reminderMinutes: chore.reminder_minutes,
        archived: !!chore.archived_at, createdBy: chore.created_by
      },
      current,
      justDone: lastDone || null,
      turns,
      history,
      openIssues: db.all(`SELECT id, title FROM issues WHERE chore_id = ? AND status = 'open'`, chore.id)
    };
  });

  route('POST', '/api/chores', ({ me, house, now, today, body }) => {
    const f = readChoreForm(db, body, house.id, today);
    const id = db.tx(() => {
      const id = db.insert(`INSERT INTO chores (house_id, title, short, repeat, days, mode, owner_id, rotation, start_date, due_time, reminder_minutes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, house.id, f.title, f.short, f.repeat, f.days, f.mode, f.ownerId,
      JSON.stringify(f.rotation), f.startDate, f.dueTime, f.reminder, me.id, now);
      ensureTasks(db, db.get('SELECT * FROM chores WHERE id = ?', id), today);
      logActivity(db, house.id, now, { actor: me.id, cat: 'chores', icon: 'edit', verb: `added the chore ${f.title}`, detail: describe(f), refType: 'chore', refId: id });
      return id;
    });
    return { id };
  });

  route('PUT', '/api/chores/:id', ({ me, house, now, today, body, params }) => {
    const chore = db.get('SELECT * FROM chores WHERE id = ? AND house_id = ? AND archived_at IS NULL', Number(params.id), house.id);
    if (!chore) throw notFound('That chore');
    const f = readChoreForm(db, body, house.id, today);
    db.tx(() => {
      clearFutureTasks(db, chore.id, today);
      db.run(`UPDATE chores SET title = ?, short = ?, repeat = ?, days = ?, mode = ?, owner_id = ?, rotation = ?, rot_base = NULL,
        start_date = ?, due_time = ?, reminder_minutes = ? WHERE id = ?`, f.title, f.short, f.repeat, f.days, f.mode, f.ownerId,
      JSON.stringify(f.rotation), f.startDate, f.dueTime, f.reminder, chore.id);
      // Keep the time and name of tasks we didn't regenerate in step with the edit.
      db.run(`UPDATE tasks SET due_time = ? WHERE chore_id = ? AND status = 'open' AND due_date >= ?`, f.dueTime, chore.id, today);
      if (f.repeat === 'once') db.run(`UPDATE tasks SET due_date = ? WHERE chore_id = ? AND status = 'open'`, f.startDate, chore.id);
      ensureTasks(db, db.get('SELECT * FROM chores WHERE id = ?', chore.id), today);
      logActivity(db, house.id, now, { actor: me.id, cat: 'chores', icon: 'edit', verb: `edited ${f.title}`, detail: describe(f), refType: 'chore', refId: chore.id });
    });
    return { id: chore.id };
  });

  route('DELETE', '/api/chores/:id', ({ me, house, now, today, params }) => {
    const chore = db.get('SELECT * FROM chores WHERE id = ? AND house_id = ? AND archived_at IS NULL', Number(params.id), house.id);
    if (!chore) throw notFound('That chore');
    db.tx(() => {
      db.run(`UPDATE swaps SET status = 'cancelled', answered_at = ? WHERE status = 'pending' AND task_id IN (SELECT id FROM tasks WHERE chore_id = ?)`, now, chore.id);
      db.run(`DELETE FROM tasks WHERE chore_id = ? AND status = 'open' AND due_date >= ?`, chore.id, today);
      db.run('UPDATE chores SET archived_at = ? WHERE id = ?', now, chore.id);
      logActivity(db, house.id, now, { actor: me.id, cat: 'chores', icon: 'edit', verb: `removed the chore ${chore.title}`, refType: 'chore', refId: chore.id });
    });
    return { ok: true };
  });

  // ---- Tasks ----
  route('POST', '/api/tasks/:id/done', ({ me, house, now, params }) => {
    const t = getTask(db, Number(params.id), house.id);
    if (t.status === 'done') return { ok: true };
    if (!t.assignee_id) throw bad('Claim this chore first.');
    db.tx(() => {
      db.run(`UPDATE tasks SET status = 'done', done_by = ?, done_at = ? WHERE id = ?`, me.id, now, t.id);
      // A finished task can't be swapped any more.
      db.run(`UPDATE swaps SET status = 'cancelled', answered_at = ? WHERE status = 'pending' AND (task_id = ? OR give_task_id = ?)`, now, t.id, t.id);
      const forOther = t.assignee_id !== me.id;
      logActivity(db, house.id, now, {
        actor: me.id, cat: 'chores', icon: 'done',
        verb: forOther ? `marked ${t.title} done for {target}` : `marked ${t.title} done`,
        detail: lateness({ ...t, done_at: now }), target: forOther ? t.assignee_id : null, refType: 'task', refId: t.id
      });
    });
    return { ok: true };
  });

  route('POST', '/api/tasks/:id/undo', ({ me, house, now, params }) => {
    const t = getTask(db, Number(params.id), house.id);
    if (t.status !== 'done') return { ok: true };
    db.run(`UPDATE tasks SET status = 'open', done_by = NULL, done_at = NULL WHERE id = ?`, t.id);
    // Remove the "marked done" line so the history stays truthful.
    const a = db.get(`SELECT id FROM activity WHERE ref_type = 'task' AND ref_id = ? AND icon = 'done' ORDER BY id DESC LIMIT 1`, t.id);
    if (a) db.run('DELETE FROM activity WHERE id = ?', a.id);
    return { ok: true };
  });

  route('POST', '/api/tasks/:id/claim', ({ me, house, now, params }) => {
    const t = getTask(db, Number(params.id), house.id);
    if (t.assignee_id) throw bad(`${nameOf(db, t.assignee_id)} already has this one.`);
    db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', me.id, t.id);
    logActivity(db, house.id, now, { actor: me.id, cat: 'chores', icon: 'done', verb: `claimed ${t.title}`, detail: `${repeatLabel(t)} · due ${shortDate(t.due_date)}`, refType: 'task', refId: t.id });
    return { ok: true };
  });

  // ---- Swaps ----
  route('GET', '/api/tasks/:id/swap-options', ({ me, house, now, today, params }) => {
    const t = getTask(db, Number(params.id), house.id);
    const members = activeMembers(db, house.id).filter((m) => m.id !== t.assignee_id);
    return {
      task: shapeTask(t, now),
      people: members.map((m) => {
        const theirs = db.all(`${TASK_SQL} WHERE c.house_id = ? AND t.assignee_id = ? AND t.status = 'open' AND t.due_date >= ? AND t.due_date <= ?
          ORDER BY t.due_date, COALESCE(t.due_time,'99') LIMIT 8`, house.id, m.id, today, addDays(today, 15)).map((x) => shapeTask(x, now));
        const sameChore = theirs.find((x) => x.choreId === t.chore_id && x.dueDate > t.due_date);
        return { id: m.id, name: m.name, color: m.color, suggested: sameChore?.id ?? null, tasks: theirs };
      })
    };
  });

  route('POST', '/api/swaps', ({ me, house, now, body }) => {
    const t = getTask(db, Number(body.taskId), house.id);
    if (t.status !== 'open') throw bad('That chore is already done.');
    if (t.assignee_id !== me.id) throw bad('You can only ask to swap your own chores.');
    const to = db.get('SELECT * FROM members WHERE id = ? AND house_id = ? AND left_at IS NULL', Number(body.toId), house.id);
    if (!to || to.id === me.id) throw bad('Pick who to ask.');
    let give = null;
    if (body.giveTaskId) {
      give = getTask(db, Number(body.giveTaskId), house.id);
      if (give.assignee_id !== to.id || give.status !== 'open') throw bad(`That isn’t one of ${to.name}’s open chores.`);
    }
    if (db.get(`SELECT 1 FROM swaps WHERE status = 'pending' AND (task_id IN (?, ?) OR give_task_id IN (?, ?))`, t.id, give?.id ?? -1, t.id, give?.id ?? -1)) {
      throw bad('There’s already a swap waiting on this chore.');
    }
    const id = db.insert(`INSERT INTO swaps (house_id, task_id, give_task_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      house.id, t.id, give?.id ?? null, me.id, to.id, now);
    logActivity(db, house.id, now, {
      actor: me.id, cat: 'swaps', icon: 'swap', verb: `asked {target} to swap ${t.title}`,
      detail: swapDetail(t, give), target: to.id, refType: 'swap', refId: id
    });
    notify(db, [to.id], 'swaps', { title: `${me.name} asked to swap`, body: `${t.title} on ${shortDate(t.due_date)}. Tap to answer.`, url: '#/activity', tag: `swap-${id}` });
    return { id };
  });

  const answer = (status) => ({ me, house, now, params }) => {
    const s = db.get('SELECT * FROM swaps WHERE id = ? AND house_id = ?', Number(params.id), house.id);
    if (!s) throw notFound('That swap');
    if (s.status !== 'pending') throw bad('That swap has already been answered.');
    if (status === 'cancelled' ? s.from_id !== me.id : s.to_id !== me.id) throw new HttpError(403, 'This swap isn’t yours to answer.');
    const t = getTask(db, s.task_id, house.id);
    const give = s.give_task_id ? getTask(db, s.give_task_id, house.id) : null;
    db.tx(() => {
      if (status === 'accepted') {
        if (t.status !== 'open' || t.assignee_id !== s.from_id || (give && (give.status !== 'open' || give.assignee_id !== s.to_id))) {
          db.run(`UPDATE swaps SET status = 'cancelled', answered_at = ? WHERE id = ?`, now, s.id);
          throw bad('Too late: those chores have changed since the request.');
        }
        db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', s.to_id, t.id);
        if (give) db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', s.from_id, give.id);
      }
      db.run('UPDATE swaps SET status = ?, answered_at = ? WHERE id = ?', status, now, s.id);
      if (status !== 'cancelled') {
        logActivity(db, house.id, now, {
          actor: me.id, cat: 'swaps', icon: 'swap', verb: `${status === 'accepted' ? 'accepted' : 'declined'} {target}’s swap for ${t.title}`,
          detail: status === 'accepted' ? acceptedDetail(db, s, t, give) : `${nameOf(db, s.from_id)} keeps ${t.title}`, target: s.from_id, refType: 'swap', refId: s.id
        });
        notify(db, [s.from_id], 'swaps', { title: `${me.name} ${status} your swap`, body: `${t.title} on ${shortDate(t.due_date)}`, url: `#/chore/${t.chore_id}` });
      }
    });
    return { ok: true };
  };
  route('POST', '/api/swaps/:id/accept', answer('accepted'));
  route('POST', '/api/swaps/:id/decline', answer('declined'));
  route('POST', '/api/swaps/:id/cancel', answer('cancelled'));

  // Undo an answer made moments ago (the Undo link after Accept/Decline).
  route('POST', '/api/swaps/:id/undo', ({ me, house, now, params }) => {
    const s = db.get('SELECT * FROM swaps WHERE id = ? AND house_id = ?', Number(params.id), house.id);
    if (!s || s.to_id !== me.id || !['accepted', 'declined'].includes(s.status)) throw bad('That can’t be undone.');
    const t = getTask(db, s.task_id, house.id);
    const give = s.give_task_id ? getTask(db, s.give_task_id, house.id) : null;
    if (s.status === 'accepted') {
      if (t.status !== 'open' || (give && give.status !== 'open')) throw bad('Too late to undo: one of the chores is done.');
      db.run('UPDATE tasks SET assignee_id = ? WHERE id = ?', s.from_id, t.id);
      if (give) db.run('UPDATE tasks SET assignee_id = ? WHERE id = ?', s.to_id, give.id);
    }
    db.run(`UPDATE swaps SET status = 'pending', answered_at = NULL WHERE id = ?`, s.id);
    const a = db.get(`SELECT id FROM activity WHERE ref_type = 'swap' AND ref_id = ? AND actor_id = ? ORDER BY id DESC LIMIT 1`, s.id, me.id);
    if (a) db.run('DELETE FROM activity WHERE id = ?', a.id);
    return { ok: true };
  });
}

function swapDetail(t, give) {
  if (!give) return `${shortDate(t.due_date)} · waiting for {target}`;
  if (give.chore_id === t.chore_id) return `{target} takes ${shortDate(t.due_date)}, they take ${shortDate(give.due_date)}`;
  return `${shortDate(t.due_date)} · in return for ${give.title} on ${shortDate(give.due_date)}`;
}

function acceptedDetail(db, s, t, give) {
  const from = nameOf(db, s.from_id), to = nameOf(db, s.to_id);
  if (!give) return `${to} takes ${shortDate(t.due_date)}`;
  return `${to} takes ${shortDate(t.due_date)}, ${from} takes ${give.title === t.title ? '' : give.title + ' on '}${shortDate(give.due_date)}`;
}

function describe(f) {
  const when = f.repeat === 'once' ? `Once on ${shortDate(f.startDate)}`
    : f.repeat === 'daily' ? 'Every day'
    : f.repeat === 'monthly' ? `Monthly on the ${f.days}${['th','st','nd','rd'][(f.days % 10 > 3 || [11,12,13].includes(+f.days)) ? 0 : f.days % 10]}`
    : 'Every ' + f.days.split(',').map((d) => d[0].toUpperCase() + d.slice(1)).join(' and ');
  return `${when}${f.dueTime ? ' by ' + clock(f.dueTime) : ''}`;
}

/** Summary of an issue for lists. Hides the reporter when they posted anonymously. */
export function issueSummary(db, i, me) {
  const mine = i.reporter_id === me.id;
  const hide = i.anonymous && !mine;
  return {
    id: i.id, type: i.type, title: i.title, status: i.status,
    reporterId: hide ? null : i.reporter_id, anonymous: !!i.anonymous, mine,
    tagId: i.tag_id, onItId: i.on_it_id, createdAt: i.created_at, resolvedAt: i.resolved_at,
    replies: db.get(`SELECT COUNT(*) n FROM issue_replies WHERE issue_id = ? AND kind = 'msg'`, i.id).n,
    agrees: db.get('SELECT COUNT(*) n FROM issue_agrees WHERE issue_id = ?', i.id).n
  };
}

export { shapeTask, TASK_SQL };

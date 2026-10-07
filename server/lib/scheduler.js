// The once-a-minute background job: reminders, overdue nudges, recurring bills and
// the weekly summary. Each job records what it sent, so restarts never double-send.
import { nowLocal, addDays, addMinutes, dueAt, clock, shortDate, startOfWeek, weekdayIndex } from './time.js';
import { refreshHouse } from './chores.js';
import { activeMembers, logActivity, notify, prefsOf } from './house.js';
import { createExpense } from '../routes/money.js';

export function runJobs(db, house, now) {
  const today = now.slice(0, 10);
  const time = now.slice(11, 16);
  refreshHouse(db, house, now);

  // 1. Reminders before a chore is due ("anytime" chores: 9 am on the day).
  const open = db.all(`SELECT t.*, c.title, c.reminder_minutes, m.reminder_minutes AS member_minutes
    FROM tasks t JOIN chores c ON c.id = t.chore_id JOIN members m ON m.id = t.assignee_id
    WHERE c.house_id = ? AND c.archived_at IS NULL AND t.status = 'open' AND t.reminded_at IS NULL
      AND t.due_date BETWEEN ? AND ?`, house.id, today, addDays(today, 1));
  for (const t of open) {
    const lead = t.reminder_minutes ?? t.member_minutes;
    if (lead === -1) continue;
    const due = dueAt(t.due_date, t.due_time);
    const remindAt = t.due_time ? addMinutes(due, -lead) : `${t.due_date}T09:00:00`;
    if (now >= remindAt && now < due) {
      db.run('UPDATE tasks SET reminded_at = ? WHERE id = ?', now, t.id);
      notify(db, [t.assignee_id], 'remind', {
        title: t.title,
        body: t.due_time ? `Due ${t.due_date === today ? 'today' : 'tomorrow'} by ${clock(t.due_time)}.` : 'Due today, any time.',
        url: `#/chore/${t.chore_id}`, tag: `task-${t.id}`, actions: [{ action: 'done', title: 'Mark done' }], taskId: t.id
      });
    }
  }

  // 2. Log newly overdue chores in the history (only recent ones, so downtime can't flood it).
  const late = db.all(`SELECT t.*, c.title FROM tasks t JOIN chores c ON c.id = t.chore_id
    WHERE c.house_id = ? AND t.status = 'open' AND t.overdue_logged = 0 AND t.assignee_id IS NOT NULL AND t.due_date >= ?`, house.id, addDays(today, -2));
  for (const t of late) {
    if (dueAt(t.due_date, t.due_time) >= now) continue;
    db.run('UPDATE tasks SET overdue_logged = 1 WHERE id = ?', t.id);
    logActivity(db, house.id, now, {
      actor: null, cat: 'chores', icon: 'alert', verb: `marked ${t.title} as overdue`,
      detail: `{target}’s turn · was due ${shortDate(t.due_date)}${t.due_time ? ', ' + clock(t.due_time) : ''}`, target: t.assignee_id, refType: 'task', refId: t.id
    });
  }

  // 3. Overdue nudge: once, the morning after.
  if (time >= '09:00') {
    const missed = db.all(`SELECT t.*, c.title FROM tasks t JOIN chores c ON c.id = t.chore_id
      WHERE c.house_id = ? AND t.status = 'open' AND t.nudged_at IS NULL AND t.assignee_id IS NOT NULL
        AND t.due_date < ? AND t.due_date >= ?`, house.id, today, addDays(today, -3));
    for (const t of missed) {
      db.run('UPDATE tasks SET nudged_at = ? WHERE id = ?', now, t.id);
      notify(db, [t.assignee_id], 'overdue', {
        title: `Still to do: ${t.title}`,
        body: `It was due ${shortDate(t.due_date)}${t.due_time ? ', ' + clock(t.due_time) : ''}.`,
        url: `#/chore/${t.chore_id}`, tag: `task-${t.id}`, actions: [{ action: 'done', title: 'Mark done' }], taskId: t.id
      });
    }
  }

  // 4. Recurring bills go into Expenses on their day, split equally.
  if (time >= '09:00') {
    const month = today.slice(0, 7);
    const day = +today.slice(8, 10);
    for (const b of db.all('SELECT * FROM bills WHERE house_id = ? AND active = 1', house.id)) {
      if (b.last_run === month || day < b.day_of_month) continue;
      const members = activeMembers(db, house.id);
      if (!members.some((m) => m.id === b.payer_id)) continue;
      db.tx(() => {
        db.run('UPDATE bills SET last_run = ? WHERE id = ?', month, b.id);
        createExpense(db, house.id, null, now, {
          title: b.title, amount: b.amount, date: today,
          payers: [{ memberId: b.payer_id, amount: b.amount }],
          split: { type: 'equal', entries: members.map((m) => ({ memberId: m.id })) },
          shares: equalShares(b.amount, members.map((m) => m.id))
        }, { billId: b.id });
      });
    }
  }

  // 5. Sunday-evening summary of the week ahead.
  if (weekdayIndex(today) === 6 && time >= '19:00') {
    const nextMon = addDays(startOfWeek(today), 7);
    for (const m of activeMembers(db, house.id)) {
      if (!prefsOf(m).weekly) continue;
      const key = `weekly:${m.id}:${nextMon}`;
      if (db.get('SELECT 1 FROM meta WHERE key = ?', key)) continue;
      db.run('INSERT INTO meta (key, value) VALUES (?, ?)', key, now);
      const n = db.get(`SELECT COUNT(*) n FROM tasks t JOIN chores c ON c.id = t.chore_id
        WHERE c.house_id = ? AND t.assignee_id = ? AND t.due_date BETWEEN ? AND ?`, house.id, m.id, nextMon, addDays(nextMon, 6)).n;
      notify(db, [m.id], null, { title: 'Your week ahead', body: n ? `You have ${n} chore${n === 1 ? '' : 's'} this week.` : 'Nothing on your list this week.', url: '#/rota' });
    }
  }
}

function equalShares(total, ids) {
  const base = Math.floor(total / ids.length);
  let extra = total - base * ids.length;
  return ids.map((id) => ({ memberId: id, amount: base + (extra-- > 0 ? 1 : 0), value: null }));
}

export function startScheduler(db, everyMs = 60_000) {
  const tick = () => {
    for (const house of db.all('SELECT * FROM houses')) {
      try { runJobs(db, house, nowLocal(house.tz)); }
      catch (e) { console.error('Scheduler error for house', house.id, e); }
    }
  };
  setTimeout(tick, 2000);
  return setInterval(tick, everyMs);
}

// Demo data: the "Elm Road" house from the designs (Maya, Sam, Raj and Leo).
// Dates are relative to the current week, so the demo always looks lived-in.
//
//   npm run demo     # creates the demo house in data/demo.db and starts it on :8081
//
// Everyone's username is their first name in lower case (maya, sam, raj, leo) and the
// password is hommate-demo. Tom (tom) has asked to join, so admins see a request.
import { openDb } from './db.js';
import { nowLocal, addDays, addMinutes, startOfWeek, dueAt } from './lib/time.js';
import { ensureTasks } from './lib/chores.js';
import { PREF_DEFAULTS } from './lib/house.js';
import { hashPassword } from './lib/auth.js';
import { computeShares } from './lib/money.js';
import { loadVapid } from './lib/push.js';

export const DEMO_PASSWORD = 'hommate-demo';

export async function seed(db, { now = nowLocal(), code = 'ELM482', password = DEMO_PASSWORD } = {}) {
  if (db.get('SELECT 1 FROM houses WHERE invite_code = ?', code)) throw new Error(`A house with code ${code} already exists in this database.`);
  loadVapid(db);
  const hashes = await Promise.all([1, 2, 3, 4, 5].map(() => hashPassword(password)));
  const today = now.slice(0, 10);
  const M = startOfWeek(today); // this week's Monday
  const at = (offset, time) => `${addDays(M, offset)}T${time}:00`;
  const events = []; // activity lines, sorted by time before inserting
  const log = (when, a) => events.push({ when, ...a });

  return db.tx(() => {
    const houseId = db.insert(`INSERT INTO houses (name, invite_code, created_at) VALUES ('Elm Road', ?, ?)`, code, at(-21, '10:00'));
    const mkUser = (name, joined) => db.insert('INSERT INTO users (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)',
      name.toLowerCase(), name, hashes.pop(), joined);
    const mk = (name, color, joined, admin = 0, prefs = PREF_DEFAULTS) =>
      db.insert('INSERT INTO members (house_id, user_id, name, color, is_admin, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        houseId, mkUser(name, joined), name, color, admin, JSON.stringify(prefs), joined);
    const maya = mk('Maya', '#6b4fd8', at(-21, '10:00'), 1);
    const sam = mk('Sam', '#0f7b6c', at(-21, '18:30'));
    const raj = mk('Raj', '#b25000', at(-21, '19:05'));
    const leo = mk('Leo', '#b8326a', at(-19, '20:40'));
    const P = { maya, sam, raj, leo };
    const name = { [maya]: 'Maya', [sam]: 'Sam', [raj]: 'Raj', [leo]: 'Leo' };

    // ---- Chores ----
    const chore = (c) => {
      const id = db.insert(`INSERT INTO chores (house_id, title, short, repeat, days, mode, owner_id, rotation, rot_base, start_date, due_time, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, houseId, c.title, c.short, c.repeat, c.days || '', c.mode, c.owner ?? null,
      JSON.stringify(c.rotation || []), c.base ?? null, c.start, c.time ?? null, maya, at(-21, '11:00'));
      ensureTasks(db, db.get('SELECT * FROM chores WHERE id = ?', id), today);
      return id;
    };
    const C = {
      bins: chore({ title: 'Take bins out', short: 'Bins', repeat: 'weekly', days: 'sun', mode: 'turns', rotation: [sam, raj, leo, maya], base: 0, start: addDays(M, -22), time: '20:00' }),
      dish: chore({ title: 'Empty dishwasher', short: 'Dishes', repeat: 'daily', mode: 'turns', rotation: [maya, sam, raj, leo], base: 21, start: addDays(M, -21), time: '09:00' }),
      hoover: chore({ title: 'Hoover living room', short: 'Hoover', repeat: 'weekly', days: 'mon', mode: 'turns', rotation: [maya, leo], base: 3, start: addDays(M, -21), time: '19:00' }),
      plants: chore({ title: 'Water the plants', short: 'Plants', repeat: 'custom', days: 'mon,thu', mode: 'one', owner: maya, start: addDays(M, -21), time: '20:00' }),
      bath: chore({ title: 'Clean bathroom', short: 'Bathroom', repeat: 'weekly', days: 'tue', mode: 'turns', rotation: [maya, leo, sam, raj], base: 0, start: addDays(M, -27), time: '21:00' }),
      kitchen: chore({ title: 'Wipe down kitchen', short: 'Kitchen', repeat: 'weekly', days: 'thu', mode: 'one', owner: maya, start: addDays(M, -18), time: '21:00' }),
      recycle: chore({ title: 'Put recycling out', short: 'Recycling', repeat: 'weekly', days: 'wed', mode: 'turns', rotation: [sam, raj], base: 0, start: addDays(M, -19), time: '19:00' }),
      fridge: chore({ title: 'Clear out the fridge', short: 'Fridge', repeat: 'monthly', days: String(+addDays(M, 4).slice(8, 10)), mode: 'one', owner: raj, start: addDays(M, -26) }),
      stairs: chore({ title: 'Hoover stairs', short: 'Stairs', repeat: 'weekly', days: 'sat', mode: 'one', owner: leo, start: addDays(M, -16) }),
      mop: chore({ title: 'Mop kitchen floor', short: 'Mop', repeat: 'once', mode: 'claim', start: addDays(M, 5) }),
      kettle: chore({ title: 'Descale the kettle', short: 'Kettle', repeat: 'once', mode: 'claim', start: addDays(M, 6) }),
      freezer: chore({ title: 'Defrost the freezer', short: 'Freezer', repeat: 'once', mode: 'claim', start: addDays(M, 6) })
    };
    const task = (choreId, offset) => db.get('SELECT * FROM tasks WHERE chore_id = ? AND due_date = ?', choreId, addDays(M, offset));
    const titleOf = Object.fromEntries(db.all('SELECT id, title FROM chores WHERE house_id = ?', houseId).map((c) => [c.id, c.title]));

    // Everything before today was done (mostly on time), except the bins Maya still owes.
    const overdueBins = task(C.bins, -1);
    const lateBath = task(C.bath, -13); // Sam did it a day late
    for (const t of db.all(`SELECT t.* FROM tasks t JOIN chores c ON c.id = t.chore_id WHERE c.house_id = ? AND t.due_date < ? AND t.status = 'open'`, houseId, M)) {
      if (t.id === overdueBins.id) continue;
      let doneAt = t.due_time ? addMinutes(dueAt(t.due_date, t.due_time), -[25, 40, 70, 15][t.id % 4]) : `${t.due_date}T${['11:30', '14:10', '16:45'][t.id % 3]}:00`;
      if (t.id === lateBath.id) doneAt = `${addDays(t.due_date, 1)}T18:40:00`;
      db.run(`UPDATE tasks SET status = 'done', done_by = ?, done_at = ?, reminded_at = ?, overdue_logged = 1 WHERE id = ?`, t.assignee_id, doneAt, doneAt, t.id);
      log(doneAt, { actor: t.assignee_id, cat: 'chores', icon: 'done', verb: `marked ${titleOf[t.chore_id]} done`, detail: t.id === lateBath.id ? 'A day late' : 'On time', ref: ['task', t.id] });
    }
    db.run('UPDATE tasks SET overdue_logged = 1, reminded_at = ? WHERE id = ?', at(-1, '19:00'), overdueBins.id);
    log(at(0, '00:00'), { actor: null, cat: 'chores', icon: 'alert', verb: 'marked Take bins out as overdue', detail: '{target}’s turn · was due Sun 4 Oct, 8:00 pm'.replace('Sun 4 Oct', short(addDays(M, -1))), target: maya, ref: ['task', overdueBins.id] });

    // Today: Maya has emptied the dishwasher.
    const dishToday = task(C.dish, 0);
    db.run(`UPDATE tasks SET status = 'done', done_by = ?, done_at = ? WHERE id = ?`, maya, at(0, '08:52'), dishToday.id);
    log(at(0, '08:52'), { actor: maya, cat: 'chores', icon: 'done', verb: 'marked Empty dishwasher done', detail: 'On time', ref: ['task', dishToday.id] });

    // Maya claimed the one-off mop job on Saturday.
    const mop = task(C.mop, 5);
    db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', maya, mop.id);
    log(at(-2, '11:05'), { actor: maya, cat: 'chores', icon: 'done', verb: 'claimed Mop kitchen floor', detail: `One-off · due ${short(addDays(M, 5))}`, ref: ['task', mop.id] });

    // An accepted swap last week: Sam does recycling this Wednesday, Raj does next Wednesday.
    const rec1 = task(C.recycle, 2), rec2 = task(C.recycle, 9);
    db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', sam, rec1.id);
    db.run('UPDATE tasks SET assignee_id = ?, swapped = 1 WHERE id = ?', raj, rec2.id);
    const s0 = db.insert(`INSERT INTO swaps (house_id, task_id, give_task_id, from_id, to_id, status, created_at, answered_at) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?)`,
      houseId, rec1.id, rec2.id, raj, sam, at(-3, '18:10'), at(-3, '19:30'));
    log(at(-3, '18:10'), { actor: raj, cat: 'swaps', icon: 'swap', verb: 'asked {target} to swap Put recycling out', detail: `{target} takes ${short(rec1.due_date)}, they take ${short(rec2.due_date)}`, target: sam, ref: ['swap', s0] });
    log(at(-3, '19:30'), { actor: sam, cat: 'swaps', icon: 'swap', verb: 'accepted {target}’s swap for Put recycling out', detail: `Sam takes ${short(rec1.due_date)}, Raj takes ${short(rec2.due_date)}`, target: raj, ref: ['swap', s0] });

    // Two swaps waiting for an answer.
    const bathNow = task(C.bath, 1), bathNext = task(C.bath, 8);
    const s1 = db.insert(`INSERT INTO swaps (house_id, task_id, give_task_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`, houseId, bathNow.id, bathNext.id, maya, leo, at(0, '08:20'));
    log(at(0, '08:20'), { actor: maya, cat: 'swaps', icon: 'swap', verb: 'asked {target} to swap Clean bathroom', detail: `{target} takes ${short(bathNow.due_date)}, they take ${short(bathNext.due_date)}`, target: leo, ref: ['swap', s1] });
    const stairs = task(C.stairs, 5);
    const s2 = db.insert(`INSERT INTO swaps (house_id, task_id, give_task_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`, houseId, stairs.id, mop.id, leo, maya, at(0, '08:30'));
    log(at(0, '08:30'), { actor: leo, cat: 'swaps', icon: 'swap', verb: 'asked {target} to swap Hoover stairs', detail: `${short(stairs.due_date)} · in return for Mop kitchen floor on ${short(mop.due_date)}`, target: maya, ref: ['swap', s2] });

    // ---- Money ----
    const expense = (when, title, amount, payers, split, opts = {}) => {
      const shares = computeShares(amount, split);
      const id = db.insert('INSERT INTO expenses (house_id, title, amount, date, split_type, bill_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        houseId, title, amount, when.slice(0, 10), split.type, opts.billId ?? null, opts.billId ? null : payers[0].memberId, when);
      for (const p of payers) db.run('INSERT INTO expense_payers (expense_id, member_id, amount) VALUES (?, ?, ?)', id, p.memberId, p.amount);
      for (const s of shares) db.run('INSERT INTO expense_shares (expense_id, member_id, amount, value) VALUES (?, ?, ?, ?)', id, s.memberId, s.amount, s.value);
      const who = split.entries.map((e) => name[e.memberId]);
      const splitText = split.entries.length === 4 ? 'split equally between 4' : `split between ${who.slice(0, -1).join(', ')} and ${who.at(-1)}`;
      log(when, opts.billId
        ? { actor: null, cat: 'money', icon: 'money', verb: `added the ${title} bill`, detail: `£${(amount / 100).toFixed(2)} · paid by ${name[payers[0].memberId]} · monthly`, amount, ref: ['expense', id] }
        : { actor: payers[0].memberId, cat: 'money', icon: 'money', verb: `added ${title}`, detail: `£${(amount / 100).toFixed(2)} · ${splitText}`, amount, ref: ['expense', id] });
      return id;
    };
    const all4 = { type: 'equal', entries: [maya, sam, raj, leo].map((memberId) => ({ memberId })) };
    const bill = (title, amount, payer, day, lastRun) => db.insert('INSERT INTO bills (house_id, title, amount, payer_id, day_of_month, last_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      houseId, title, amount, payer, day, lastRun, at(-21, '12:00'));
    const thisMonth = today.slice(0, 7);
    const broadbandDay = +addDays(M, -4).slice(8, 10);
    bill('Rent', 320000, leo, 28, null);
    bill('Energy', 14800, sam, 15, null);
    bill('Water', 4600, raj, 20, null);
    const broadband = bill('Broadband', 3500, leo, broadbandDay, addDays(M, -4).slice(0, 7));

    expense(at(-11, '20:30'), 'Takeaway', 1200, [{ memberId: maya, amount: 1200 }], { type: 'equal', entries: [{ memberId: maya }, { memberId: leo }] });
    const pay = db.insert(`INSERT INTO payments (house_id, from_id, to_id, amount, method, date, created_at) VALUES (?, ?, ?, 600, 'cash', ?, ?)`, houseId, leo, maya, addDays(M, -7), at(-7, '22:12'));
    log(at(-7, '22:12'), { actor: leo, cat: 'money', icon: 'money', verb: 'paid {target} back', detail: '£6.00 · Cash', target: maya, amount: 600, ref: ['payment', pay] });
    expense(at(-4, '09:00'), 'Broadband', 3500, [{ memberId: leo, amount: 3500 }], all4, { billId: broadband });
    expense(at(-4, '19:45'), 'Cleaning supplies', 1480, [{ memberId: maya, amount: 1480 }], all4);
    log(at(-4, '19:40'), { actor: maya, cat: 'chores', icon: 'edit', verb: 'edited Water the plants', detail: 'Now Mon and Thu by 8:00 pm', ref: ['chore', C.plants] });
    expense(at(-3, '17:02'), 'Toilet roll and bin bags', 920, [{ memberId: sam, amount: 920 }], all4);
    expense(at(-2, '21:40'), 'Pizza night', 3600, [{ memberId: sam, amount: 3600 }], { type: 'equal', entries: [maya, sam, raj].map((memberId) => ({ memberId })) });
    const tesco = expense(at(-1, '18:15'), 'Tesco shop', 4260, [{ memberId: raj, amount: 4260 }], all4);
    log(at(-1, '18:20'), { actor: raj, cat: 'money', icon: 'edit', verb: 'edited Tesco shop', detail: 'Amount £40.10 → £42.60', ref: ['expense', tesco] });

    // ---- House issues ----
    const issue = (i) => db.insert(`INSERT INTO issues (house_id, type, title, detail, chore_id, reporter_id, anonymous, tag_id, on_it_id, on_it_note, status, created_at, resolved_at, resolved_by)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`, houseId, i.type, i.title, i.detail ?? null, i.chore ?? null, i.by, i.tag ?? null, i.onIt ?? null, i.note ?? null,
    i.resolvedAt ? 'resolved' : 'open', i.at, i.resolvedAt ?? null, i.resolvedBy ?? null);
    const reply = (issueId, by, when, text, kind = 'msg') => db.run('INSERT INTO issue_replies (issue_id, member_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)', issueId, by, kind, text, when);
    const agree = (issueId, ...ids) => ids.forEach((id) => db.run('INSERT INTO issue_agrees (issue_id, member_id) VALUES (?, ?)', issueId, id));
    const label = { now: 'Needs doing now', properly: 'Not done properly', smell: 'Mess or smell' };
    const reported = (id, i) => log(i.at, { actor: i.by, cat: 'issues', icon: 'issue', verb: `reported an issue: ${i.title}`, detail: `${label[i.type]} · ${i.tag ? 'tagged {target}' : 'for everyone'}`, target: i.tag ?? null, ref: ['issue', id] });

    const bathBin = { type: 'properly', title: 'Bathroom bin not emptied', by: maya, tag: leo, at: at(-6, '08:10'), chore: C.bath, resolvedAt: at(-6, '21:00'), resolvedBy: leo };
    const i5 = issue(bathBin); reported(i5, bathBin);
    reply(i5, leo, at(-6, '20:55'), 'Done now, sorry.'); reply(i5, leo, at(-6, '21:00'), 'Marked this resolved', 'event');
    log(at(-6, '21:00'), { actor: leo, cat: 'issues', icon: 'done', verb: 'resolved an issue: Bathroom bin not emptied', detail: 'Reported by Maya', ref: ['issue', i5] });

    const fridge = { type: 'smell', title: 'Sticky fridge shelf', by: sam, at: at(-4, '10:00'), detail: 'Something spilled on the middle shelf.', resolvedAt: at(-3, '20:15'), resolvedBy: raj };
    const i4 = issue(fridge); reported(i4, fridge); agree(i4, maya);
    reply(i4, raj, at(-4, '12:30'), 'I’ll do it when I clear out the fridge.'); reply(i4, sam, at(-4, '12:41'), 'Thanks.');
    reply(i4, raj, at(-3, '20:15'), 'Marked this resolved', 'event');
    log(at(-3, '20:15'), { actor: raj, cat: 'issues', icon: 'done', verb: 'resolved an issue: Sticky fridge shelf', detail: 'Reported by Sam', ref: ['issue', i4] });

    const crumbs = { type: 'properly', title: 'Crumbs left all over the stairs', by: raj, tag: leo, at: at(-1, '19:30'), detail: 'The landing and bottom three steps were missed.', chore: C.stairs };
    const i3 = issue(crumbs); reported(i3, crumbs);
    reply(i3, leo, at(-1, '20:02'), 'Sorry, I’ll go over them again tomorrow.');

    const micro = { type: 'smell', title: 'Microwave smells of old curry', by: leo, at: at(-1, '21:10'), detail: 'It’s really strong when you open the door. Whoever heated the curry, please give it a wipe.', onIt: raj, note: 'Said they’ll clean it tonight' };
    const i2 = issue(micro); reported(i2, micro); agree(i2, sam, raj);
    reply(i2, sam, at(-1, '21:25'), 'Agreed, it’s grim. Been like it since Friday.');
    reply(i2, raj, at(-1, '21:40'), 'That was me, sorry. I’ll clean it tonight.');
    reply(i2, raj, at(-1, '21:41'), 'Said they’re on it', 'event');
    reply(i2, leo, at(-1, '21:50'), 'Thanks, Raj.');
    log(at(-1, '21:41'), { actor: raj, cat: 'issues', icon: 'issue', verb: 'is on it: Microwave smells of old curry', detail: 'Mess or smell · reported by Leo', ref: ['issue', i2] });

    const bins = { type: 'now', title: 'Bins are overflowing', by: sam, tag: maya, at: at(0, '09:05'), detail: 'The lid won’t close and it’s bin day tomorrow for the recycling too.', chore: C.bins };
    const i1 = issue(bins); reported(i1, bins); agree(i1, raj);
    reply(i1, raj, at(0, '09:12'), 'Yes please, it’s starting to smell.');

    // ---- Write the history in time order ----
    events.sort((a, b) => a.when.localeCompare(b.when));
    for (const e of events) {
      db.run(`INSERT INTO activity (house_id, actor_id, cat, icon, verb, detail, target_id, amount, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        houseId, e.actor ?? null, e.cat, e.icon, e.verb, e.detail ?? null, e.target ?? null, e.amount ?? null, e.ref?.[0] ?? null, e.ref?.[1] ?? null, e.when);
    }
    // Maya hasn't seen the two newest things from other people (the bell dot).
    const others = db.all('SELECT id FROM activity WHERE house_id = ? AND (actor_id IS NULL OR actor_id != ?) ORDER BY id DESC LIMIT 2', houseId, maya);
    db.run('UPDATE members SET last_seen_activity = ? WHERE id = ?', (others.at(-1)?.id || 1) - 1, maya);
    for (const id of [sam, raj, leo]) db.run('UPDATE members SET last_seen_activity = (SELECT MAX(id) FROM activity) WHERE id = ?', id);

    // Tom has asked to join; admins see the request on the House tab.
    const tom = mkUser('Tom', at(0, '08:05'));
    db.run(`INSERT INTO join_requests (house_id, user_id, created_at) VALUES (?, ?, ?)`, houseId, tom, at(0, '08:05'));
    return { houseId, members: P, chores: C, tom };
  });
}

function short(d) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const wd = (new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay() + 6) % 7;
  return `${days[wd]} ${+d.slice(8, 10)} ${months[+d.slice(5, 7) - 1]}`;
}

// Run directly: node server/seed.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  try {
    await seed(db);
    console.log('Demo house "Elm Road" created. Invite code: ELM482');
    console.log(`Sign in as maya (admin), sam, raj or leo. Password for everyone: ${DEMO_PASSWORD}`);
    console.log('tom has asked to join, so you can try approving a request.');
  } catch (e) {
    if (/already exists/.test(e.message)) {
      console.log(`The demo house is already in this database. Sign in as maya / ${DEMO_PASSWORD}. To start fresh, delete the .db file.`);
    } else {
      console.error(e.message);
      process.exit(1);
    }
  }
}

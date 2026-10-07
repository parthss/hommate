// House issues: a shared board for things that need sorting.
import { bad, notFound, activeMembers, logActivity, notify, nameOf } from '../lib/house.js';
import { issueSummary } from './chores.js';

export const ISSUE_TYPES = {
  now: 'Needs doing now',
  properly: 'Not done properly',
  smell: 'Mess or smell',
  other: 'Something else'
};

export default function register(route, { db }) {
  const load = (id, houseId) => {
    const i = db.get('SELECT * FROM issues WHERE id = ? AND house_id = ?', Number(id), houseId);
    if (!i) throw notFound('That issue');
    return i;
  };
  const event = (issueId, memberId, text, now) =>
    db.run(`INSERT INTO issue_replies (issue_id, member_id, kind, text, created_at) VALUES (?, ?, 'event', ?, ?)`, issueId, memberId, text, now);

  route('GET', '/api/issues', ({ me, house, query, now }) => {
    const state = query.state === 'resolved' ? 'resolved' : 'open';
    const rows = db.all(`SELECT * FROM issues WHERE house_id = ? AND status = ? ORDER BY ${state === 'open' ? 'created_at' : 'resolved_at'} DESC LIMIT 100`, house.id, state);
    const openCount = db.get(`SELECT COUNT(*) n FROM issues WHERE house_id = ? AND status = 'open'`, house.id).n;
    return { now, state, openCount, items: rows.map((i) => issueSummary(db, i, me)) };
  });

  route('GET', '/api/issues/:id', ({ me, house, params, now }) => {
    const i = load(params.id, house.id);
    const chore = i.chore_id ? db.get('SELECT id, title FROM chores WHERE id = ?', i.chore_id) : null;
    return {
      now,
      issue: { ...issueSummary(db, i, me), detail: i.detail, onItNote: i.on_it_note, resolvedBy: i.resolved_by, chore },
      agreed: !!db.get('SELECT 1 FROM issue_agrees WHERE issue_id = ? AND member_id = ?', i.id, me.id),
      thread: db.all('SELECT * FROM issue_replies WHERE issue_id = ? ORDER BY id', i.id)
        .map((r) => ({ id: r.id, memberId: r.member_id, kind: r.kind, text: r.text, at: r.created_at }))
    };
  });

  route('POST', '/api/issues', ({ me, house, now, body }) => {
    const type = body.type;
    if (!ISSUE_TYPES[type]) throw bad('Pick what kind of issue it is.');
    const title = String(body.title || '').trim().replace(/\s+/g, ' ');
    if (!title) throw bad('Say what the issue is.');
    if (title.length > 80) throw bad('Keep it under 80 characters. Add the rest as detail.');
    const detail = String(body.detail || '').trim().slice(0, 1000) || null;
    const members = activeMembers(db, house.id);
    const tagId = body.tagId ? Number(body.tagId) : null;
    if (tagId && !members.some((m) => m.id === tagId)) throw bad('Pick who should get a nudge.');
    const choreId = body.choreId ? Number(body.choreId) : null;
    if (choreId && !db.get('SELECT 1 FROM chores WHERE id = ? AND house_id = ?', choreId, house.id)) throw bad('That chore isn’t in this house.');
    const anonymous = !!body.anonymous;

    const id = db.insert(`INSERT INTO issues (house_id, type, title, detail, chore_id, reporter_id, anonymous, tag_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, house.id, type, title, detail, choreId, me.id, anonymous ? 1 : 0, tagId, now);
    // Anonymous posts are logged without an actor so nobody can tell who posted.
    logActivity(db, house.id, now, {
      actor: anonymous ? null : me.id, cat: 'issues', icon: 'issue', verb: `${anonymous ? 'Someone reported' : 'reported'} an issue: ${title}`,
      detail: `${ISSUE_TYPES[type]} · ${tagId ? 'tagged {target}' : 'for everyone'}`, target: tagId, refType: 'issue', refId: id
    });
    // Only the tagged person gets a notification (nobody when it's for everyone).
    if (tagId && tagId !== me.id) {
      notify(db, [tagId], null, { title: anonymous ? 'A housemate flagged something' : `${me.name} flagged something`, body: title, url: `#/issue/${id}`, tag: `issue-${id}` });
    }
    return { id };
  });

  route('POST', '/api/issues/:id/agree', ({ me, house, params }) => {
    const i = load(params.id, house.id);
    if (db.get('SELECT 1 FROM issue_agrees WHERE issue_id = ? AND member_id = ?', i.id, me.id)) {
      db.run('DELETE FROM issue_agrees WHERE issue_id = ? AND member_id = ?', i.id, me.id);
    } else {
      db.run('INSERT INTO issue_agrees (issue_id, member_id) VALUES (?, ?)', i.id, me.id);
    }
    return { ok: true };
  });

  route('POST', '/api/issues/:id/onit', ({ me, house, now, params, body }) => {
    const i = load(params.id, house.id);
    if (i.status !== 'open') throw bad('This issue is already resolved.');
    if (i.on_it_id === me.id) {
      db.run('UPDATE issues SET on_it_id = NULL, on_it_note = NULL WHERE id = ?', i.id);
      event(i.id, me.id, 'Isn’t on it any more', now);
      return { ok: true };
    }
    const note = String(body.note || '').trim().slice(0, 120) || null;
    db.run('UPDATE issues SET on_it_id = ?, on_it_note = ? WHERE id = ?', me.id, note, i.id);
    event(i.id, me.id, 'Said they’re on it', now);
    logActivity(db, house.id, now, { actor: me.id, cat: 'issues', icon: 'issue', verb: `is on it: ${i.title}`, detail: `${ISSUE_TYPES[i.type]}${i.anonymous ? '' : ' · reported by ' + nameOf(db, i.reporter_id)}`, refType: 'issue', refId: i.id });
    if (i.reporter_id !== me.id) notify(db, [i.reporter_id], null, { title: `${me.name} is on it`, body: i.title, url: `#/issue/${i.id}` });
    return { ok: true };
  });

  route('POST', '/api/issues/:id/resolve', ({ me, house, now, params }) => {
    const i = load(params.id, house.id);
    if (i.status === 'resolved') return { ok: true };
    db.run(`UPDATE issues SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?`, now, me.id, i.id);
    event(i.id, me.id, 'Marked this resolved', now);
    logActivity(db, house.id, now, { actor: me.id, cat: 'issues', icon: 'done', verb: `resolved an issue: ${i.title}`, detail: i.anonymous ? ISSUE_TYPES[i.type] : `Reported by ${nameOf(db, i.reporter_id)}`, refType: 'issue', refId: i.id });
    if (i.reporter_id !== me.id) notify(db, [i.reporter_id], null, { title: 'Issue resolved', body: `${me.name} resolved “${i.title}”.`, url: `#/issue/${i.id}` });
    return { ok: true };
  });

  route('POST', '/api/issues/:id/reopen', ({ me, house, now, params }) => {
    const i = load(params.id, house.id);
    db.run(`UPDATE issues SET status = 'open', resolved_at = NULL, resolved_by = NULL WHERE id = ?`, i.id);
    event(i.id, me.id, 'Reopened this', now);
    return { ok: true };
  });

  route('POST', '/api/issues/:id/replies', ({ me, house, now, params, body }) => {
    const i = load(params.id, house.id);
    const text = String(body.text || '').trim();
    if (!text) throw bad('Write a reply first.');
    if (text.length > 1000) throw bad('Keep replies under 1,000 characters.');
    db.run(`INSERT INTO issue_replies (issue_id, member_id, kind, text, created_at) VALUES (?, ?, 'msg', ?, ?)`, i.id, me.id, text, now);
    // Let the people involved know (but never reveal an anonymous reporter by excluding them).
    const involved = new Set([i.reporter_id, i.tag_id, i.on_it_id, ...db.all(`SELECT DISTINCT member_id FROM issue_replies WHERE issue_id = ? AND kind = 'msg'`, i.id).map((r) => r.member_id)]);
    involved.delete(me.id);
    notify(db, [...involved], null, { title: `${me.name} replied`, body: `${i.title}: ${text.slice(0, 80)}`, url: `#/issue/${i.id}`, tag: `issue-${i.id}` });
    return { ok: true };
  });
}

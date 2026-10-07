// Removing someone from a house, and what happens to their chores.
import { clearFutureTasks, ensureTasks, parseRotation } from './chores.js';
import { activeMembers, logActivity, notifyUser } from './house.js';
import { houseBalances } from '../routes/money.js';

/** What removing this member will change, for the confirmation sheet. */
export function removalPreview(db, house, member, today) {
  const chores = db.all('SELECT * FROM chores WHERE house_id = ? AND archived_at IS NULL', house.id);
  const rotations = chores.filter((c) => c.mode === 'turns' && parseRotation(c).includes(member.id)).map((c) => c.title);
  const owned = chores.filter((c) => c.mode === 'one' && c.owner_id === member.id).map((c) => c.title);
  const upcoming = db.get(`SELECT COUNT(*) n FROM tasks t JOIN chores c ON c.id = t.chore_id
    WHERE c.house_id = ? AND t.assignee_id = ? AND t.status = 'open' AND t.due_date >= ?`, house.id, member.id, today).n;
  const bills = db.all('SELECT title FROM bills WHERE house_id = ? AND active = 1 AND payer_id = ?', house.id, member.id).map((b) => b.title);
  const net = houseBalances(db, house.id).net.get(member.id) || 0;
  const admins = activeMembers(db, house.id).filter((m) => m.is_admin);
  return { rotations, owned, upcoming, bills, net, isLastAdmin: !!member.is_admin && admins.length === 1 };
}

/**
 * Take a member out of the house:
 *  - rotations carry on with whoever's left (the person who was next stays next);
 *  - their one-person chores and any of their open tasks go to Unclaimed;
 *  - pending swaps involving them are cancelled;
 *  - their history and balance stay, shown as "(left)".
 */
export function removeMember(db, house, member, actor, now) {
  const today = now.slice(0, 10);
  const active = new Set(activeMembers(db, house.id).map((m) => m.id).filter((id) => id !== member.id));
  db.tx(() => {
    db.run(`UPDATE swaps SET status = 'cancelled', answered_at = ? WHERE house_id = ? AND status = 'pending' AND (from_id = ? OR to_id = ?)`,
      now, house.id, member.id, member.id);

    for (const c of db.all('SELECT * FROM chores WHERE house_id = ? AND archived_at IS NULL', house.id)) {
      if (c.mode === 'turns' && parseRotation(c).includes(member.id)) {
        const rot = parseRotation(c);
        // Whoever was up next keeps their place.
        const next = db.get(`SELECT assignee_id FROM tasks WHERE chore_id = ? AND status = 'open' AND swapped = 0 AND due_date >= ?
          ORDER BY due_date LIMIT 1`, c.id, today)?.assignee_id;
        let start = rot.indexOf(next);
        if (start < 0) start = rot.indexOf(member.id);
        const ordered = [...rot.slice(start), ...rot.slice(0, start)];
        const remaining = ordered.filter((id) => active.has(id));
        clearFutureTasks(db, c.id, today);
        if (remaining.length >= 2) {
          db.run('UPDATE chores SET rotation = ?, rot_base = NULL WHERE id = ?', JSON.stringify(remaining), c.id);
        } else if (remaining.length === 1) {
          db.run(`UPDATE chores SET mode = 'one', owner_id = ?, rotation = '[]', rot_base = NULL WHERE id = ?`, remaining[0], c.id);
        } else {
          db.run(`UPDATE chores SET mode = 'claim', owner_id = NULL, rotation = '[]', rot_base = NULL WHERE id = ?`, c.id);
        }
        ensureTasks(db, db.get('SELECT * FROM chores WHERE id = ?', c.id), today);
      } else if (c.mode === 'one' && c.owner_id === member.id) {
        clearFutureTasks(db, c.id, today);
        db.run(`UPDATE chores SET mode = 'claim', owner_id = NULL WHERE id = ?`, c.id);
        ensureTasks(db, db.get('SELECT * FROM chores WHERE id = ?', c.id), today);
      }
    }
    // Anything still on their list: past ones are missed, today's and later go to Unclaimed.
    const mine = `SELECT t.id FROM tasks t JOIN chores c ON c.id = t.chore_id WHERE c.house_id = ? AND t.assignee_id = ? AND t.status = 'open'`;
    db.run(`UPDATE tasks SET status = 'missed' WHERE id IN (${mine} AND t.due_date < ?)`, house.id, member.id, today);
    db.run(`UPDATE tasks SET assignee_id = NULL, swapped = 1 WHERE id IN (${mine} AND t.due_date >= ?)`, house.id, member.id, today);
    db.run(`UPDATE issues SET on_it_id = NULL, on_it_note = NULL WHERE house_id = ? AND on_it_id = ? AND status = 'open'`, house.id, member.id);

    db.run('UPDATE members SET left_at = ?, removed_by = ?, is_admin = 0 WHERE id = ?', now, actor.id, member.id);
    db.run(`UPDATE join_requests SET status = 'cancelled' WHERE house_id = ? AND user_id = ? AND status = 'pending'`, house.id, member.user_id);
    logActivity(db, house.id, now, {
      actor: actor.id === member.id ? member.id : actor.id, cat: 'house', icon: 'edit',
      verb: actor.id === member.id ? 'left the house' : 'removed {target} from the house', target: member.id
    });
  });
  if (member.user_id && actor.id !== member.id) {
    notifyUser(db, member.user_id, { title: `You’ve been removed from ${house.name}`, body: 'You can ask to join again with the house code.', url: '#/start' });
  }
}

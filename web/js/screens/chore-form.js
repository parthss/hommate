import { html, raw } from '../dom.js';
import { get, post, put, del } from '../api.js';
import { session } from '../store.js';
import { icon, chev, seg, field, switchRow, isMe, dateMed, clock, nameOf } from '../ui.js';

const DAYS = [['mon', 'M', 'Monday'], ['tue', 'T', 'Tuesday'], ['wed', 'W', 'Wednesday'], ['thu', 'T', 'Thursday'], ['fri', 'F', 'Friday'], ['sat', 'S', 'Saturday'], ['sun', 'S', 'Sunday']];
const MODES = [
  { id: 'one', title: 'One person', desc: 'Always the same housemate.' },
  { id: 'turns', title: 'Take turns', desc: 'Rotates between the people you pick.' },
  { id: 'claim', title: 'Anyone can claim', desc: 'Sits in Unclaimed until someone takes it.' }
];
export const REMINDER_OPTS = [
  ['', 'Your usual'], ['-1', 'No reminder'], ['0', 'At the due time'], ['15', '15 minutes before'], ['30', '30 minutes before'],
  ['60', '1 hour before'], ['120', '2 hours before'], ['180', '3 hours before'], ['1440', '1 day before']
];
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
export const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export default {
  title: (ctx) => (ctx.params.id ? 'Edit chore' : 'New chore'),
  load: (ctx) => (ctx.params.id ? get('/chores/' + ctx.params.id) : Promise.resolve({})),
  init(ctx) {
    const c = ctx.data.chore;
    const members = session.members.map((m) => m.id);
    if (c) {
      const rot = c.mode === 'turns' ? c.rotation : [];
      ctx.state = {
        title: c.title, repeat: c.repeat, days: c.repeat === 'monthly' ? [] : c.days, mode: c.mode,
        ownerId: c.ownerId || session.me.id,
        order: [...rot, ...members.filter((id) => !rot.includes(id))],
        incl: Object.fromEntries(members.map((id) => [id, c.mode === 'turns' ? rot.includes(id) : true])),
        startDate: c.startDate < localToday() && c.repeat !== 'once' ? c.startDate : c.startDate,
        dueTime: c.dueTime || '21:00', anytime: !c.dueTime, reminder: c.reminderMinutes == null ? '' : String(c.reminderMinutes),
        error: null, busy: false
      };
    } else {
      const me = session.me.id;
      ctx.state = {
        title: '', repeat: 'weekly', days: [DAYS[(new Date().getDay() + 6) % 7][0]], mode: 'turns', ownerId: me,
        order: [me, ...members.filter((id) => id !== me)], incl: Object.fromEntries(members.map((id) => [id, true])),
        startDate: localToday(), dueTime: '21:00', anytime: false, reminder: '', error: null, busy: false
      };
    }
  },
  view(ctx) {
    const s = ctx.state;
    const editing = !!ctx.params.id;
    const showDays = s.repeat === 'weekly' || s.repeat === 'custom';
    const picked = DAYS.filter((d) => s.days.includes(d[0])).map((d) => d[2] + 's');
    const list = picked.length === 0 ? 'no days yet' : picked.length === 1 ? picked[0] : picked.slice(0, -1).join(', ') + ' and ' + picked.at(-1);
    const summary = s.repeat === 'once' ? 'Happens once, on the start date below.'
      : s.repeat === 'daily' ? 'Every day.'
      : s.repeat === 'monthly' ? `Every month on day ${+s.startDate.slice(8)} (the start date’s day).`
      : s.repeat === 'weekly' ? `Every week on ${picked[0] || 'the day you pick'}.` : `Every ${list}.`;
    const inRota = s.order.filter((id) => s.incl[id]);
    let n = 0;

    return html`
    <header class="navbar">
      <a href="${editing ? `#/chore/${ctx.params.id}` : '#/chores'}" class="text-btn">Cancel</a>
      <h1>${editing ? 'Edit chore' : 'New chore'}</h1><span></span>
    </header>
    <main class="screen form has-footer">
      <form data-submit="save">${field('Chore name', { name: 'title', value: s.title, input: 'title', attrs: 'maxlength="60" autocomplete="off" enterkeyhint="done"' })}</form>

      <section class="section" aria-labelledby="ac-repeat">
        <h2 id="ac-repeat" class="sec-label">How often</h2>
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:14px">
          ${seg('repeat', [{ label: 'Once', value: 'once' }, { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Custom', value: 'custom' }, { label: 'Monthly', value: 'monthly' }], s.repeat, 'repeat', 'How often')}
          ${showDays ? html`<div class="days7" role="group" aria-label="${s.repeat === 'weekly' ? 'Day of the week' : 'Days of the week'}">
            ${DAYS.map((d) => html`<button type="button" class="day-btn ${s.days.includes(d[0]) ? 'on' : ''}" data-on="day" data-day="${d[0]}" aria-pressed="${s.days.includes(d[0])}" aria-label="${d[2]}">${d[1]}</button>`)}
          </div>` : ''}
          <p class="small muted" style="padding:0 4px">${summary}</p>
        </div>
      </section>

      <section class="section" aria-labelledby="ac-who">
        <h2 id="ac-who" class="sec-label">Who does it</h2>
        <div class="card card-rows sep" role="radiogroup" aria-labelledby="ac-who">
          ${MODES.map((m) => html`<button type="button" class="opt tall" role="radio" aria-checked="${s.mode === m.id}" data-on="mode" data-mode="${m.id}">
            <span class="col grow"><span class="strong">${m.title}</span><span class="small muted">${m.desc}</span></span>
            <span class="radio ${s.mode === m.id ? 'on' : ''}" aria-hidden="true">${s.mode === m.id ? icon('check', 14, 2.5) : ''}</span>
          </button>`)}
        </div>
      </section>

      ${s.mode === 'turns' ? html`<section class="section" aria-labelledby="ac-order">
        <h2 id="ac-order" class="sec-label">Rotation order</h2>
        <ol class="card sep" style="padding:0 16px 0 4px">
          ${s.order.map((id, i) => {
            const on = !!s.incl[id];
            return html`<li class="rowflex" style="min-height:60px;gap:8px" data-key="r${id}">
              <button type="button" class="text-btn" style="width:36px;padding:0;justify-content:center;color:var(--label-tertiary)" data-on="up" data-id="${id}" aria-label="Move ${nameOf(id)} earlier" ${i === 0 ? raw('disabled') : ''}>${icon('up', 18)}</button>
              <span class="small strong muted" style="flex:none;width:28px;text-align:center">${on ? ORD[n++] : '–'}</span>
              <span class="av" style="background:${session.members.find((m) => m.id === id)?.color};opacity:${on ? 1 : 0.42}" aria-hidden="true">${nameOf(id)[0]}</span>
              <span class="grow">${switchRow(nameOf(id), on, 'incl', `data-id="${id}"`)}</span>
            </li>`;
          })}
        </ol>
        <p class="note">${inRota.length < 2 ? 'Pick at least two people to take turns.' : `${nameOf(inRota[0], { you: 'You' })} ${isMe(inRota[0]) ? 'start' : 'starts'}. Tap the arrow to move someone earlier.`}</p>
      </section>` : ''}

      ${s.mode === 'one' ? html`<section class="section" aria-labelledby="ac-person">
        <h2 id="ac-person" class="sec-label">Person</h2>
        <div class="card pad people4" role="radiogroup" aria-labelledby="ac-person">
          ${session.members.map((m) => html`<button type="button" class="person-btn ${s.ownerId === m.id ? 'on' : 'solid'}" role="radio" aria-checked="${s.ownerId === m.id}" data-on="owner" data-id="${m.id}">
            <span class="av av-44 ${s.ownerId === m.id ? 'ring' : ''}" style="background:${m.color}" aria-hidden="true">${m.name[0]}</span><span>${isMe(m.id) ? 'You' : m.name}</span></button>`)}
        </div>
      </section>` : ''}

      <section class="section" aria-labelledby="ac-when">
        <h2 id="ac-when" class="sec-label">Timing</h2>
        <div class="card sep" style="padding:0 12px 0 16px">
          <label class="picker-row"><span class="grow">${s.repeat === 'once' ? 'Date' : 'Starts'}</span><span class="val">${dateMed(s.startDate)}</span>${chev()}
            <input type="date" value="${s.startDate}" data-change="startDate" aria-label="${s.repeat === 'once' ? 'Date' : 'Start date'}"></label>
          <div class="picker-row" style="padding-right:4px">${switchRow('Any time that day', s.anytime, 'anytime')}</div>
          ${s.anytime ? '' : html`<label class="picker-row"><span class="grow">Due by</span><span class="val">${clock(s.dueTime)}</span>${chev()}
            <input type="time" value="${s.dueTime}" data-change="dueTime" aria-label="Due by"></label>`}
          <label class="picker-row"><span class="grow">Reminder</span><span class="val">${REMINDER_OPTS.find((o) => o[0] === s.reminder)?.[1]}</span>${chev()}
            <select data-change="reminder" aria-label="Reminder">${REMINDER_OPTS.map(([v, l]) => html`<option value="${v}" ${v === s.reminder ? raw('selected') : ''}>${l}</option>`)}</select></label>
        </div>
        ${s.anytime ? html`<p class="note">Anytime chores get their reminder at 9 am on the day.</p>` : ''}
      </section>

      ${editing ? html`<button type="button" class="text-btn danger" style="align-self:center;gap:6px" data-on="remove" data-confirm="Remove this chore? Its history stays in Activity.">${icon('trash', 18)}Remove chore</button>` : ''}
    </main>
    <footer class="footer-bar">
      ${s.error ? html`<p class="form-error" role="alert">${icon('info', 18)}${s.error}</p>` : ''}
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.busy ? raw('disabled') : ''}>Save chore</button>
    </footer>`;
  },
  actions: {
    title: (ctx, el) => { ctx.state.title = el.value; if (ctx.state.error) ctx.set({ error: null }); },
    repeat: (ctx, el) => {
      const v = el.dataset.value;
      const days = v === 'weekly' ? [ctx.state.days[0] || 'mon'] : ctx.state.days.length ? ctx.state.days : ['mon'];
      ctx.set({ repeat: v, days, error: null });
    },
    day: (ctx, el) => {
      const d = el.dataset.day, s = ctx.state;
      const days = s.repeat === 'weekly' ? [d] : s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d];
      ctx.set({ days, error: null });
    },
    mode: (ctx, el) => ctx.set({ mode: el.dataset.mode, error: null }),
    owner: (ctx, el) => ctx.set({ ownerId: +el.dataset.id }),
    incl: (ctx, el) => { const id = +el.dataset.id; ctx.set({ incl: { ...ctx.state.incl, [id]: !ctx.state.incl[id] }, error: null }); },
    up: (ctx, el) => {
      const id = +el.dataset.id, o = [...ctx.state.order], i = o.indexOf(id);
      if (i > 0) { [o[i - 1], o[i]] = [o[i], o[i - 1]]; ctx.set({ order: o }); }
    },
    startDate: (ctx, el) => { if (el.value) ctx.set({ startDate: el.value }); },
    dueTime: (ctx, el) => { if (el.value) ctx.set({ dueTime: el.value }); },
    anytime: (ctx) => ctx.set({ anytime: !ctx.state.anytime }),
    reminder: (ctx, el) => ctx.set({ reminder: el.value }),
    save: async (ctx) => {
      const s = ctx.state;
      const body = {
        title: s.title.trim(), repeat: s.repeat, days: s.days, mode: s.mode, ownerId: s.ownerId,
        rotation: s.order.filter((id) => s.incl[id]), startDate: s.startDate,
        dueTime: s.anytime ? null : s.dueTime, reminderMinutes: s.reminder === '' ? null : +s.reminder
      };
      if (!body.title) return ctx.set({ error: 'Give the chore a name.' });
      ctx.set({ busy: true, error: null });
      try {
        const r = ctx.params.id ? await put('/chores/' + ctx.params.id, body) : await post('/chores', body);
        ctx.toast(ctx.params.id ? 'Chore updated.' : 'Chore added.');
        ctx.go(`#/chore/${r.id}`, true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    },
    remove: async (ctx) => {
      await del('/chores/' + ctx.params.id);
      ctx.toast('Chore removed.');
      ctx.go('#/chores', true);
    }
  }
};

import { html, raw } from '../dom.js';
import { get, post } from '../api.js';
import { session } from '../store.js';
import { icon, chev, field, switchRow, nameOf, isMe, dayShort } from '../ui.js';
import { TYPES } from './issues.js';

export default {
  title: 'Report an issue',
  load: () => get('/chores?filter=all'),
  init(ctx) {
    const choreId = ctx.query.chore ? +ctx.query.chore : null;
    ctx.state = { type: choreId ? 'properly' : 'smell', choreId, title: '', detail: '', tag: 'all', anon: false, busy: false, error: null };
    if (choreId) autoTag(ctx);
  },
  view(ctx) {
    const s = ctx.state;
    const choreType = s.type === 'now' || s.type === 'properly';
    const chores = ctx.data.items;
    const chore = chores.find((c) => c.choreId === s.choreId);
    const others = session.members.filter((m) => !isMe(m.id));
    return html`
    <header class="navbar">
      <a href="${ctx.query.chore ? `#/chore/${ctx.query.chore}` : '#/issues'}" class="text-btn">Cancel</a>
      <h1>Report an issue</h1><span></span>
    </header>
    <main class="screen form has-footer">
      <section class="section" aria-labelledby="ri-type">
        <h2 id="ri-type" class="sec-label">What kind of issue?</h2>
        <div class="types2" role="radiogroup" aria-labelledby="ri-type">
          ${Object.entries(TYPES).map(([k, t]) => html`<button type="button" class="type-card ${s.type === k ? 'on' : ''}" role="radio" aria-checked="${s.type === k}" data-on="type" data-type="${k}">
            <span class="icon-bubble ${k === 'now' ? 'danger' : ''}" aria-hidden="true">${icon(t.ic, 18)}</span>
            <span class="col"><span class="strong" style="font-size:15px;line-height:20px">${t.label}</span><span class="cap muted">${t.desc}</span></span></button>`)}
        </div>
      </section>

      ${choreType ? html`<section class="section" aria-labelledby="ri-chore">
        <h2 id="ri-chore" class="sec-label">Which chore?</h2>
        <div class="card" style="padding:0 12px 0 16px">
          <label class="picker-row"><span class="grow">${chore ? chore.title : 'Pick a chore'}</span><span class="val">${chore ? 'Change' : ''}</span>${chev()}
            <select data-change="chore" aria-label="Which chore">
              <option value="">No particular chore</option>
              ${chores.map((c) => html`<option value="${c.choreId}" ${c.choreId === s.choreId ? raw('selected') : ''}>${c.title}</option>`)}
            </select></label>
          ${chore?.assigneeId ? html`<div class="rowflex" style="border-top:1px solid var(--separator);min-height:48px;gap:10px">
            <span class="av av-24" style="background:${session.members.find((m) => m.id === chore.assigneeId)?.color}" aria-hidden="true">${nameOf(chore.assigneeId)[0]}</span>
            <span class="small muted">${isMe(chore.assigneeId) ? 'Your turn' : `${nameOf(chore.assigneeId)}’s turn`} · ${dayShort(chore.dueDate)}${!isMe(chore.assigneeId) ? ` · ${nameOf(chore.assigneeId)} gets the nudge` : ''}</span></div>` : ''}
        </div>
      </section>` : ''}

      <form data-submit="save" class="col" style="gap:20px">
        ${field('What’s the issue?', { name: 'title', value: s.title, input: 'title', attrs: 'maxlength="80" autocomplete="off"' })}
        <div class="field-area"><label for="ri-details">More detail (optional)</label>
          <textarea id="ri-details" rows="3" maxlength="1000" data-input="detail">${s.detail}</textarea></div>
      </form>

      <section class="section" aria-labelledby="ri-tag">
        <h2 id="ri-tag" class="sec-label">Who should get a nudge?</h2>
        <div class="card pad" style="display:grid;grid-template-columns:repeat(${Math.min(5, others.length + 1)},minmax(0,1fr));gap:8px" role="radiogroup" aria-labelledby="ri-tag">
          <button type="button" class="person-btn ${s.tag === 'all' ? 'on' : 'solid'}" role="radio" aria-checked="${s.tag === 'all'}" data-on="tag" data-id="all">
            <span class="av av-44 sys ${s.tag === 'all' ? 'ring' : ''}" aria-hidden="true">${icon('house', 22)}</span><span>Everyone</span></button>
          ${others.map((m) => html`<button type="button" class="person-btn ${s.tag === m.id ? 'on' : 'solid'}" role="radio" aria-checked="${s.tag === m.id}" data-on="tag" data-id="${m.id}">
            <span class="av av-44 ${s.tag === m.id ? 'ring' : ''}" style="background:${m.color}" aria-hidden="true">${m.name[0]}</span><span>${m.name}</span></button>`)}
        </div>
        <p class="note">Everyone can see the issue. ${s.tag === 'all' ? 'Nobody gets a notification when it’s for everyone.' : 'Only the person you pick gets a notification.'}</p>
      </section>

      <div class="card" style="padding:14px 16px">${switchRow('Post without my name', s.anon, 'anon', '', 'Housemates see the issue, but not who posted it.')}</div>
      <p class="note">Everyone at ${session.house.name} can see this. Keep it kind. It’s easier to sort things out that way.</p>
    </main>
    <footer class="footer-bar">
      ${s.error ? html`<p class="form-error" role="alert">${icon('info', 18)}${s.error}</p>` : ''}
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.busy ? raw('disabled') : ''}>Post issue</button>
    </footer>`;
  },
  actions: {
    type: (ctx, el) => { ctx.state.type = el.dataset.type; autoTag(ctx); ctx.set({ error: null }); },
    chore: (ctx, el) => { ctx.state.choreId = el.value ? +el.value : null; autoTag(ctx); ctx.set({}); },
    title: (ctx, el) => { ctx.state.title = el.value; if (ctx.state.error) ctx.set({ error: null }); },
    detail: (ctx, el) => { ctx.state.detail = el.value; },
    tag: (ctx, el) => ctx.set({ tag: el.dataset.id === 'all' ? 'all' : +el.dataset.id }),
    anon: (ctx) => ctx.set({ anon: !ctx.state.anon }),
    save: async (ctx) => {
      const s = ctx.state;
      if (!s.title.trim()) return ctx.set({ error: 'Say what the issue is.' });
      ctx.set({ busy: true, error: null });
      try {
        const r = await post('/issues', {
          type: s.type, title: s.title.trim(), detail: s.detail.trim(), choreId: (s.type === 'now' || s.type === 'properly') ? s.choreId : null,
          tagId: s.tag === 'all' ? null : s.tag, anonymous: s.anon
        });
        ctx.toast('Posted to the house.');
        ctx.go(`#/issue/${r.id}`, true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

/** Tag whoever's turn it is on the chosen chore (not yourself). */
function autoTag(ctx) {
  const c = ctx.data.items.find((x) => x.choreId === ctx.state.choreId);
  const who = c ? (ctx.state.type === 'properly' && c.doneBy ? c.doneBy : c.assigneeId) : null;
  if (who && !isMe(who)) ctx.state.tag = who;
}

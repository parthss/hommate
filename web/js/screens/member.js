// A housemate's page. Admins can make them an admin, reset their password or remove them.
import { html, raw } from '../dom.js';
import { get, post } from '../api.js';
import { session, saveAccount } from '../store.js';
import { icon, chev, badge, backLink, avatar, money, monthDay, plural, listJoin, isMe } from '../ui.js';

export default {
  title: 'Housemate',
  tab: 'house',
  async load(ctx) {
    if (isMe(+ctx.params.id)) { setTimeout(() => ctx.go('#/me', true), 0); return null; }
    return get('/members/' + ctx.params.id);
  },
  view(ctx) {
    if (!ctx.data) return html``;
    const { member: m, between, upcoming } = ctx.data;
    const admin = session.me.isAdmin && !m.left;
    const owe = between.find((d) => isMe(d.from));
    const owed = between.find((d) => isMe(d.to));
    return html`<main class="screen">
      ${backLink('#/house', 'House')}
      <header class="rowflex" style="gap:16px;padding:0 6px 4px">
        ${avatar(m.id, 72)}
        <div class="col" style="gap:2px">
          <h1 class="t1">${m.name}</h1>
          <span class="small muted">${m.username ? '@' + m.username : ''}${m.isAdmin ? ' · Admin' : ''}</span>
          <span class="small muted">${m.left ? `Left ${monthDay(m.leftAt.slice(0, 10))}` : `Joined ${monthDay(m.joinedAt.slice(0, 10))}`}</span>
        </div>
      </header>
      ${m.left ? html`<section class="card pad rowflex" style="gap:10px">${icon('info', 20)}<span class="small">${m.name} is no longer in the house. Their history stays, and any money between you can still be settled.</span></section>` : ''}

      <section class="card card-rows sep" aria-label="Between you">
        <div class="row tall">
          <span class="col grow"><span>${owe ? `You owe ${m.name}` : owed ? `${m.name} owes you` : 'Money'}</span>
            <span class="${owe || owed ? 'strong' : 'small muted'}">${owe ? money(owe.amount) : owed ? money(owed.amount) : 'You’re square with each other.'}</span></span>
          ${owe ? html`<a class="lm-btn lm-btn-secondary lm-btn-small" href="#/settle?to=${m.id}">Settle up</a>` : owed ? html`<a class="lm-btn lm-btn-tertiary lm-btn-small" href="#/settle?from=${m.id}">They paid</a>` : ''}
        </div>
        ${m.left ? '' : html`<a href="#/rota" class="row-link"><span class="grow">${upcoming ? `${plural(upcoming, 'chore')} coming up` : 'No chores coming up'}</span>${chev()}</a>`}
        <a href="#/history?person=${m.id}" class="row-link"><span class="grow">Their activity</span>${chev()}</a>
      </section>

      ${admin ? html`<section class="section" aria-labelledby="mb-admin">
        <h2 id="mb-admin" class="sec-label">Admin</h2>
        <div class="card card-rows sep">
          <button type="button" class="opt" style="gap:12px" data-on="toggleAdmin"
            data-confirm="${m.isAdmin ? `Take admin rights away from ${m.name}?` : `Make ${m.name} an admin? They’ll be able to approve requests, reset passwords and remove people.`}">
            ${icon('flag', 20)}<span class="grow">${m.isAdmin ? 'Remove admin rights' : 'Make admin'}</span></button>
          <button type="button" class="opt" style="gap:12px" data-on="reset"
            data-confirm="Reset ${m.name}’s password? They’ll be signed out everywhere and need the temporary password you’re given.">
            ${icon('redo', 20)}<span class="grow">Reset password</span></button>
          <button type="button" class="opt" style="gap:12px;color:var(--danger)" data-on="openRemove">${icon('trash', 20)}<span class="grow">Remove from house</span></button>
        </div>
      </section>` : ''}
    </main>
    ${ctx.state.sheet === 'remove' ? removeSheet(ctx) : ''}
    ${ctx.state.sheet === 'temp' ? tempSheet(ctx) : ''}`;
  },
  actions: {
    toggleAdmin: async (ctx) => {
      const m = ctx.data.member;
      saveAccount(await post(`/members/${m.id}/admin`, { isAdmin: !m.isAdmin }));
      ctx.toast(m.isAdmin ? `${m.name} is no longer an admin.` : `${m.name} is now an admin.`);
      await ctx.reload();
    },
    reset: async (ctx) => {
      const r = await post(`/members/${ctx.data.member.id}/reset-password`);
      ctx.set({ sheet: 'temp', temp: r.tempPassword, username: r.username, copied: false });
    },
    copyTemp: async (ctx) => {
      try { await navigator.clipboard.writeText(ctx.state.temp); ctx.set({ copied: true }); } catch { ctx.toast('Couldn’t copy. Write it down instead.'); }
    },
    openRemove: async (ctx) => {
      ctx.set({ sheet: 'remove', preview: null });
      ctx.set({ preview: await get(`/members/${ctx.data.member.id}/removal`) });
    },
    closeSheet: (ctx, el, ev) => { if (!ev.target.closest('.sheet') || el.matches('.text-btn')) ctx.set({ sheet: null }); },
    remove: async (ctx) => {
      const m = ctx.data.member;
      ctx.set({ busy: true });
      try {
        saveAccount(await post(`/members/${m.id}/remove`));
        ctx.toast(`${m.name} has been removed.`);
        ctx.go('#/house', true);
      } catch (e) { ctx.set({ busy: false }); throw e; }
    }
  }
};

function removeSheet(ctx) {
  const m = ctx.data.member, p = ctx.state.preview;
  const bullets = p ? [
    p.rotations.length ? `They come out of the rotation for ${listJoin(p.rotations)}. Whoever’s next stays next.` : null,
    p.owned.length ? `${listJoin(p.owned)} ${p.owned.length === 1 ? 'goes' : 'go'} to Unclaimed.` : null,
    p.upcoming ? `${plural(p.upcoming, 'upcoming chore')} on their list will be reassigned or go to Unclaimed.` : null,
    p.bills.length ? `They pay ${listJoin(p.bills)}. Pick a new payer in Recurring bills, or it stops being added.` : null,
    p.net > 0 ? `The house owes them ${money(p.net)}. That stays on Expenses as “${m.name} (left)” until it’s settled.`
      : p.net < 0 ? `They owe the house ${money(-p.net)}. That stays on Expenses as “${m.name} (left)” until it’s settled.` : 'Their balance is £0.00.',
    'Their history stays. They can ask to join again with the house code.'
  ].filter(Boolean) : [];
  return html`<div class="sheet-back" data-on="closeSheet">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rm-title">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="rowflex between"><h2 id="rm-title" class="t2">Remove ${m.name}?</h2><button type="button" class="text-btn" data-on="closeSheet">Cancel</button></div>
      ${!p ? html`<div class="skeleton" style="height:120px"></div>` : p.isLastAdmin ? html`<p class="small">${m.name} is the only admin. Make someone else an admin first.</p>` : html`
        <ul class="card pad col" style="gap:10px">${bullets.map((b) => html`<li class="rowflex small" style="align-items:flex-start;gap:8px"><span style="flex:none;margin-top:2px;color:var(--label-secondary)">${icon('info', 16)}</span><span>${b}</span></li>`)}</ul>
        <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" style="background:var(--danger)" data-on="remove" ${ctx.state.busy ? raw('disabled') : ''}>Remove ${m.name}</button>`}
    </div>
  </div>`;
}

function tempSheet(ctx) {
  const m = ctx.data.member;
  return html`<div class="sheet-back" data-on="closeSheet">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tp-title">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="rowflex between"><h2 id="tp-title" class="t2">Temporary password</h2><button type="button" class="text-btn" data-on="closeSheet">Done</button></div>
      <p class="small muted">Give this to ${m.name}. They sign in as <strong class="strong">@${ctx.state.username}</strong> with it, then choose their own. It’s shown only once.</p>
      <div class="card pad-20 col" style="align-items:center;gap:12px">
        <span class="code-big" style="font-size:26px;letter-spacing:0.06em" aria-label="${ctx.state.temp.split('').join(' ')}">${ctx.state.temp}</span>
        <button type="button" class="lm-btn lm-btn-secondary lm-btn-small" data-on="copyTemp">${ctx.state.copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  </div>`;
}

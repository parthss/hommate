// About you (name, colour, account) · Change password.
import { html, raw } from '../dom.js';
import { post, patchApi } from '../api.js';
import { session, saveAccount, clearSession, gate } from '../store.js';
import { icon, chev, field, backLink } from '../ui.js';
import { swatches, passwordField, signOut } from './onboarding.js';

export const EditProfile = {
  title: 'About you',
  init: (ctx) => { ctx.state = { name: session.me.name, color: session.me.color, busy: false, error: null }; },
  view(ctx) {
    const s = ctx.state;
    const takenBy = (hex) => session.members.find((m) => m.color === hex && m.id !== session.me.id)?.name;
    return html`<main class="screen onboard" style="gap:22px">
      ${backLink('#/house', 'House')}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div class="col"><h1 class="t1">About you</h1><span class="small muted">@${session.user.username}${session.me.isAdmin ? ' · Admin' : ''}</span></div>
        <span class="av av-72" role="img" aria-label="Your avatar preview" style="background:${s.color}">${(s.name.trim()[0] || '?').toUpperCase()}</span>
      </div>
      ${field('Your name', { name: 'name', value: s.name, input: 'name', attrs: 'maxlength="30" autocomplete="given-name"', msg: s.error || 'Housemates see this on chores and expenses.', error: !!s.error })}
      <fieldset style="border:0;margin:0;padding:0" class="col">
        <legend class="strong" style="padding:0;margin-bottom:12px">Your colour</legend>
        ${swatches(s.color, takenBy)}
      </fieldset>
      <section class="section" aria-labelledby="me-account">
        <h2 id="me-account" class="sec-label">Account</h2>
        <div class="card card-rows sep">
          <a href="#/password" class="row-link">${icon('edit', 20)}<span class="grow">Change password</span>${chev()}</a>
          <button type="button" class="opt" style="gap:12px" data-on="signoutAll" data-confirm="Sign out of Hommate on every device, including this one?">${icon('close', 20)}<span>Sign out of all devices</span></button>
        </div>
      </section>
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.busy || !s.name.trim() ? raw('disabled') : ''}>Save</button>
    </footer>`;
  },
  actions: {
    name: (ctx, el) => ctx.set({ name: el.value, error: null }),
    color: (ctx, el) => ctx.set({ color: el.dataset.hex }),
    save: async (ctx) => {
      ctx.set({ busy: true });
      try {
        saveAccount(await patchApi('/me', { name: ctx.state.name.trim(), color: ctx.state.color }));
        ctx.toast('Saved.');
        ctx.go('#/house', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    },
    signoutAll: async (ctx) => {
      await post('/account/signout-all');
      clearSession();
      ctx.go('#/welcome', true);
    }
  }
};

export const ChangePassword = {
  title: 'Change password',
  focus: '#f-current',
  init: (ctx) => { ctx.state = { current: '', next: '', show: false, busy: false, error: null }; },
  view(ctx) {
    const s = ctx.state;
    const forced = !!session.user?.mustChange;
    return html`<main class="screen onboard">
      ${forced ? '' : backLink(session.me ? '#/me' : '#/start', 'Back')}
      <div class="col" style="gap:6px">
        <h1 class="t1">${forced ? 'Choose a new password' : 'Change password'}</h1>
        <p class="muted">${forced ? 'Your admin gave you a temporary password. Pick your own to carry on.' : 'You’ll stay signed in here. Other devices will need the new password.'}</p>
      </div>
      <form data-submit="save" class="col" style="gap:16px">
        ${field(forced ? 'Temporary password' : 'Current password', { name: 'current', value: s.current, type: s.show ? 'text' : 'password', input: 'current', attrs: 'autocomplete="current-password" autocapitalize="off"' })}
        ${passwordField(ctx, 'next', 'New password', { value: s.next, input: 'next', autocomplete: 'new-password', msg: 'At least 8 characters.' })}
        <button type="submit" hidden></button>
      </form>
      ${s.error ? html`<p class="form-error" role="alert">${icon('info', 18)}${s.error}</p>` : ''}
      ${forced ? html`<button type="button" class="text-btn small" style="align-self:flex-start" data-on="signout">Sign out</button>` : ''}
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.current && s.next.length >= 8 && !s.busy ? '' : raw('disabled')}>Save new password</button>
    </footer>`;
  },
  actions: {
    current: (ctx, el) => ctx.set({ current: el.value, error: null }),
    next: (ctx, el) => ctx.set({ next: el.value, error: null }),
    toggleShow: (ctx) => ctx.set({ show: !ctx.state.show }),
    signout: (ctx) => signOut(ctx),
    save: async (ctx) => {
      const forcedBefore = !!session.user?.mustChange;
      ctx.set({ busy: true, error: null });
      try {
        saveAccount(await post('/account/password', { current: ctx.state.current, password: ctx.state.next }));
        ctx.toast('Password changed.');
        ctx.go(gate() || (forcedBefore ? '#/today' : '#/me'), true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

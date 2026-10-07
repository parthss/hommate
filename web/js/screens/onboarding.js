// Getting in: create an account · sign in · find your house (join or create) ·
// wait for approval · pick your colour · add to Home Screen.
import { html, raw } from '../dom.js';
import { get, post, del, patchApi } from '../api.js';
import { saveAccount, session, gate, clearSession } from '../store.js';
import { icon, field, backLink, seg, badge, dateShort } from '../ui.js';
import { enablePush, pushState, isStandalone, platformGuess } from '../push.js';

export const COLORS = [
  { id: 'violet', name: 'Violet', hex: '#6b4fd8' }, { id: 'teal', name: 'Teal', hex: '#0f7b6c' },
  { id: 'orange', name: 'Orange', hex: '#b25000' }, { id: 'rose', name: 'Rose', hex: '#b8326a' },
  { id: 'green', name: 'Green', hex: '#3d7a1f' }, { id: 'slate', name: 'Slate', hex: '#5c6670' },
  { id: 'plum', name: 'Plum', hex: '#8e3fa0' }, { id: 'ochre', name: 'Ochre', hex: '#9a6700' }
];

const stepHead = (step, title, sub) => html`
  <div class="col" style="gap:6px">
    ${step ? html`<p class="small muted">Step ${step} of 3</p>` : ''}
    <h1 class="t1">${title}</h1>
    ${sub ? html`<p class="muted">${sub}</p>` : ''}
  </div>`;

const errorLine = (msg) => (msg ? html`<p class="form-error" role="alert">${icon('info', 18)}${msg}</p>` : '');

/** Colour swatches. takenBy(hex) → name of whoever has it, or undefined. */
export function swatches(selected, takenBy) {
  return html`<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 8px">
    ${COLORS.map((c) => {
      const who = takenBy(c.hex);
      const on = selected === c.hex;
      return html`<div class="col" style="align-items:center;gap:6px">
        <button type="button" data-on="color" data-hex="${c.hex}" ${who ? raw('disabled') : ''} aria-pressed="${on}" aria-label="${who ? `${c.name}, taken by ${who}` : c.name}"
          style="width:52px;height:52px;border-radius:50%;border:0;padding:0;background:${c.hex};color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;cursor:${who ? 'default' : 'pointer'};opacity:${who ? 0.42 : 1};box-shadow:${on ? '0 0 0 3px var(--bg-alt), 0 0 0 5px var(--label)' : 'none'}">
          ${on ? icon('check', 22, 2.5) : ''}${who ? who[0] : ''}</button>
        <span class="cap muted" style="text-align:center">${who || c.name}</span>
      </div>`;
    })}
  </div>`;
}

/** Password field with a Show/Hide toggle. */
export const passwordField = (ctx, name, label, { value = '', input, autocomplete = 'current-password', msg = '' } = {}) => html`
  <div class="col" style="gap:4px">
    ${field(label, { name, value, type: ctx.state.show ? 'text' : 'password', input, msg, attrs: `autocomplete="${autocomplete}" autocapitalize="off" spellcheck="false" maxlength="200"` })}
    <button type="button" class="text-btn small" style="align-self:flex-start" data-on="toggleShow">${ctx.state.show ? 'Hide password' : 'Show password'}</button>
  </div>`;

// ---------------------------------------------------------------------------------
export const SignUp = {
  title: 'Create your account',
  focus: '#f-name',
  init: (ctx) => { ctx.state = { name: '', username: '', password: '', show: false, error: null, busy: false }; },
  view: (ctx) => {
    const s = ctx.state;
    const ready = s.name.trim() && s.username.trim().length >= 3 && s.password.length >= 8;
    return html`
    <main class="screen onboard">
      ${backLink('#/welcome', 'Back')}
      ${stepHead(1, 'Create your account', 'You’ll use this to sign in on any phone.')}
      <form data-submit="go" class="col" style="gap:16px">
        ${field('Your name', { name: 'name', value: s.name, input: 'name', attrs: 'autocomplete="given-name" maxlength="30"', msg: 'Housemates see this on chores and expenses.' })}
        ${field('Username', { name: 'username', value: s.username, input: 'username', attrs: 'autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20"', msg: 'Letters, numbers, dots, dashes or underscores.' })}
        ${passwordField(ctx, 'password', 'Password', { value: s.password, input: 'password', autocomplete: 'new-password', msg: s.password && s.password.length < 8 ? `${8 - s.password.length} more character${8 - s.password.length === 1 ? '' : 's'}` : 'At least 8 characters.' })}
      </form>
      ${errorLine(s.error)}
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="go" ${ready && !s.busy ? '' : raw('disabled')}>Create account</button>
      <a class="text-btn small" style="align-self:center" href="#/login">Already have an account? Sign in</a>
    </footer>`;
  },
  actions: {
    name: (ctx, el) => ctx.set({ name: el.value, error: null }),
    username: (ctx, el) => ctx.set({ username: el.value.replace(/\s/g, '').toLowerCase(), error: null }),
    password: (ctx, el) => ctx.set({ password: el.value, error: null }),
    toggleShow: (ctx) => ctx.set({ show: !ctx.state.show }),
    go: async (ctx) => {
      const s = ctx.state;
      ctx.set({ busy: true, error: null });
      try {
        saveAccount(await post('/register', { name: s.name.trim(), username: s.username.trim(), password: s.password }));
        ctx.go('#/start', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

// ---------------------------------------------------------------------------------
export const LogIn = {
  title: 'Sign in',
  focus: '#f-username',
  init: (ctx) => { ctx.state = { username: '', password: '', show: false, error: null, busy: false }; },
  view: (ctx) => {
    const s = ctx.state;
    return html`
    <main class="screen onboard">
      ${backLink('#/welcome', 'Back')}
      ${stepHead(null, 'Sign in', 'Use the username and password you made when you joined.')}
      <form data-submit="go" class="col" style="gap:16px">
        ${field('Username', { name: 'username', value: s.username, input: 'username', attrs: 'autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20"' })}
        ${passwordField(ctx, 'password', 'Password', { value: s.password, input: 'password' })}
        <button type="submit" hidden></button>
      </form>
      ${errorLine(s.error)}
      <p class="small muted">Forgot your password? Ask your house admin. They can reset it from the House tab and give you a temporary one.</p>
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="go" ${s.username && s.password && !s.busy ? '' : raw('disabled')}>Sign in</button>
      <a class="text-btn small" style="align-self:center" href="#/signup">New here? Create an account</a>
    </footer>`;
  },
  actions: {
    username: (ctx, el) => ctx.set({ username: el.value.trim().toLowerCase(), error: null }),
    password: (ctx, el) => ctx.set({ password: el.value, error: null }),
    toggleShow: (ctx) => ctx.set({ show: !ctx.state.show }),
    go: async (ctx) => {
      const s = ctx.state;
      if (!s.username || !s.password) return;
      ctx.set({ busy: true, error: null });
      try {
        saveAccount(await post('/login', { username: s.username, password: s.password }));
        ctx.go(gate() || '#/today', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

// ---------------------------------------------------------------------------------
export const Start = {
  title: 'Find your house',
  load: async () => { saveAccount(await get('/account')); return {}; },
  view: () => {
    const r = session.removedFrom, d = session.declined;
    return html`
    <main class="screen onboard">
      ${r ? stepHead(null, `You’re no longer in ${r.houseName}.`, `${r.by ? `${r.by} removed you` : 'You left'} on ${dateShort(r.at.slice(0, 10))}. Your history there is kept. You can ask to join again, or join a different house.`)
        : stepHead(2, `Hi ${session.user.name}. Find your house.`, 'Join the house you live in, or set up a new one.')}
      ${d ? html`<section class="card pad rowflex" role="status" style="gap:10px">${icon('info', 20)}<span class="small">${d.houseName} didn’t accept your request. Check the code with a housemate, or try another house.</span></section>` : ''}
      <a href="#/join" class="card pad-20 rowflex" style="color:inherit;gap:14px">
        <span class="round-icon blue" aria-hidden="true">${icon('house', 24)}</span>
        <span class="col grow"><span class="strong">Join a house</span><span class="small muted">Enter the code a housemate shared. An admin approves you.</span></span>${icon('chevron', 18)}
      </a>
      <a href="#/create" class="card pad-20 rowflex" style="color:inherit;gap:14px">
        <span class="round-icon blue" aria-hidden="true">${icon('plus', 24)}</span>
        <span class="col grow"><span class="strong">Create a new house</span><span class="small muted">You’ll be its admin and get an invite code to share.</span></span>${icon('chevron', 18)}
      </a>
      <p class="small muted">Signed in as @${session.user.username}. <button type="button" class="text-btn small" style="min-height:0;padding:0" data-on="signout">Sign out</button></p>
    </main>`;
  },
  actions: { signout: (ctx) => signOut(ctx) }
};

export async function signOut(ctx) {
  try { await post('/logout'); } catch { /* signed out anyway */ }
  clearSession();
  ctx.go('#/welcome', true);
}

// ---------------------------------------------------------------------------------
export const CreateHouse = {
  title: 'Create a house',
  focus: '#f-houseName',
  init: (ctx) => { ctx.state = { name: '', color: COLORS[0].hex, error: null, busy: false }; },
  view: (ctx) => {
    const s = ctx.state;
    return html`
    <main class="screen onboard">
      ${backLink('#/start', 'Back')}
      ${stepHead(2, 'Name your house', 'Everyone who joins will see this name. You’ll be its admin.')}
      <form data-submit="go">
        ${field('House name', { name: 'houseName', value: s.name, input: 'name', attrs: 'autocomplete="off" maxlength="40"', msg: 'You can change it later in the House tab.' })}
      </form>
      <fieldset style="border:0;margin:0;padding:0" class="col">
        <legend class="strong" style="padding:0">Pick your colour</legend>
        <p class="small muted" style="margin:4px 0 12px">It marks your chores and expenses everywhere in Hommate.</p>
        ${swatches(s.color, () => undefined)}
      </fieldset>
      ${errorLine(s.error)}
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="go" ${s.name.trim() && !s.busy ? '' : raw('disabled')}>Create house</button>
    </footer>`;
  },
  actions: {
    name: (ctx, el) => ctx.set({ name: el.value, error: null }),
    color: (ctx, el) => ctx.set({ color: el.dataset.hex }),
    go: async (ctx) => {
      if (!ctx.state.name.trim()) return;
      ctx.set({ busy: true, error: null });
      try {
        saveAccount(await post('/houses', { houseName: ctx.state.name.trim(), color: ctx.state.color }));
        ctx.go('#/install?new=1', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

// ---------------------------------------------------------------------------------
export const JoinHouse = {
  title: 'Join your house',
  focus: '#code-0',
  init: (ctx) => {
    let saved = '';
    try { saved = sessionStorage.getItem('hommate.joinCode') || ''; sessionStorage.removeItem('hommate.joinCode'); } catch { /* ignore */ }
    const code = (ctx.params.code || ctx.query.code || saved).toUpperCase().slice(0, 6);
    ctx.state = { code, found: null, error: null, busy: false };
    if (code.length === 6) lookup(ctx, code);
  },
  view: (ctx) => {
    const chars = ctx.state.code.padEnd(6, ' ').split('');
    const f = ctx.state.found;
    const admins = f ? f.members.filter((m) => m.isAdmin).map((m) => m.name) : [];
    return html`
    <main class="screen onboard">
      ${backLink('#/start', 'Back')}
      ${stepHead(2, 'Join your house', 'Enter the invite code a housemate shared with you.')}
      <fieldset style="border:0;margin:0;padding:0" class="col">
        <legend class="small muted" style="padding:0;margin-bottom:8px">Invite code</legend>
        <div class="code-boxes">
          ${chars.map((c, i) => html`<input id="code-${i}" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="6"
            aria-label="Character ${i + 1} of 6" value="${c.trim()}" data-input="type" data-i="${i}">`)}
        </div>
        ${ctx.state.error ? html`<span class="field-msg bad">${icon('info', 14)}${ctx.state.error}</span>` : ''}
        ${f ? html`<span class="field-msg ok">${icon('check', 14)}Code found</span>` : ''}
      </fieldset>
      ${f ? html`<section class="card pad-20" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div class="col"><span class="small muted">You’re asking to join</span><span class="t2">${f.house.name}</span>
          <span class="small muted">${f.members.length ? 'with ' + joinNames(f.members.map((m) => m.name)) : ''}</span></div>
        <div class="av-stack" aria-hidden="true">${f.members.slice(0, 4).map((m) => html`<span class="av" style="background:${m.color}">${m.name[0]}</span>`)}</div>
      </section>
      <p class="small muted">${admins.length ? joinNames(admins) : 'An admin'} will get your request. You’ll see the house as soon as ${admins.length === 1 ? 'they approve' : 'one of them approves'} it.</p>` : html`<p class="small muted">No code? Ask a housemate to open House › Invite code.</p>`}
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="send" ${f && !ctx.state.busy ? '' : raw('disabled')}>${f ? `Ask to join ${f.house.name}` : 'Ask to join'}</button>
    </footer>`;
  },
  actions: {
    type: (ctx, el) => {
      const i = +el.dataset.i;
      const typed = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      let code = ctx.state.code.padEnd(6, ' ').split('');
      const pasted = typed.length > 2;
      if (pasted) code = typed.slice(0, 6).padEnd(6, ' ').split('');
      else code[i] = typed.slice(-1) || ' '; // typing over a filled box keeps the newest letter
      el.value = code[i].trim();
      const joined = code.join('').replace(/\s+$/, '');
      ctx.set({ code: joined, found: null, error: null });
      const nextI = pasted ? Math.min(5, typed.length) : typed ? i + 1 : Math.max(0, i - 1);
      document.getElementById('code-' + Math.min(5, nextI))?.focus();
      if (joined.replace(/\s/g, '').length === 6) lookup(ctx, joined);
    },
    send: async (ctx) => {
      ctx.set({ busy: true });
      try {
        saveAccount(await post('/join-requests', { code: ctx.state.code }));
        ctx.go('#/waiting', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

async function lookup(ctx, code) {
  try { ctx.set({ found: await get('/invite/' + encodeURIComponent(code)), error: null }); }
  catch (e) { ctx.set({ found: null, error: e.status === 404 ? 'That code wasn’t found. Check it with your housemate.' : e.message }); }
}
const joinNames = (n) => n.length <= 1 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n.at(-1);

// ---------------------------------------------------------------------------------
export const Waiting = {
  title: 'Waiting for approval',
  poll: true,
  async load(ctx) {
    saveAccount(await get('/account'));
    const where = gate();
    if (where !== '#/waiting') setTimeout(() => ctx.go(where || '#/today', true), 0);
    return { push: await pushState().catch(() => 'unsupported') };
  },
  view: (ctx) => {
    const r = session.request;
    if (!r) return html`<main class="screen onboard"></main>`;
    const push = ctx.data.push;
    return html`
    <main class="screen onboard">
      <div class="col" style="gap:6px;margin-top:24px">
        <span class="round-icon blue" aria-hidden="true">${icon('clock', 26)}</span>
        <h1 class="t1" style="margin-top:12px">Request sent.</h1>
        <p class="muted">An admin at ${r.houseName} needs to approve you. This page updates as soon as they do.</p>
      </div>
      <section class="card pad-20 col" style="gap:8px">
        <span class="small muted">Asked to join</span>
        <span class="t2">${r.houseName}</span>
        <span class="small muted">Sent ${dateShort(r.createdAt.slice(0, 10))}, as @${session.user.username}</span>
      </section>
      ${push === 'on' ? html`<p class="small success" style="display:flex;gap:6px;align-items:center">${icon('check', 16)}We’ll send you a notification when you’re approved.</p>`
        : push === 'off' ? html`<section class="card pad-20 col" style="gap:10px"><span class="strong">Get told when you’re in</span>
            <span class="small muted">Turn on notifications and we’ll let you know when your request is answered.</span>
            <div><button type="button" class="lm-btn lm-btn-secondary lm-btn-small" data-on="notify">Turn on notifications</button></div></section>` : ''}
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-tertiary lm-btn-large btn-block" data-on="cancel" data-confirm="Cancel your request to join ${r.houseName}?">Cancel request</button>
    </footer>`;
  },
  actions: {
    notify: async (ctx) => { ctx.data.push = await enablePush(); ctx.set({}); },
    cancel: async (ctx) => { saveAccount(await del('/join-requests/mine')); ctx.go('#/start', true); }
  }
};

// ---------------------------------------------------------------------------------
// After an admin approves you: check your name and pick a colour.
export const ProfileStep = {
  title: 'About you',
  init: (ctx) => {
    const taken = new Set(session.members.filter((m) => m.id !== session.me.id).map((m) => m.color));
    ctx.state = { name: session.me.name, color: taken.has(session.me.color) ? COLORS.find((c) => !taken.has(c.hex))?.hex : session.me.color, error: null, busy: false };
  },
  view: (ctx) => {
    const s = ctx.state;
    const takenBy = (hex) => session.members.find((m) => m.color === hex && m.id !== session.me.id)?.name;
    return html`
    <main class="screen onboard" style="gap:22px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div class="col" style="gap:6px"><p class="small muted">Step 3 of 3</p><h1 class="t1">You’re in ${session.house.name}.</h1></div>
        <span class="av av-72" role="img" aria-label="Your avatar preview" style="background:${s.color};transition:background-color .3s var(--ease-standard)">${(s.name.trim()[0] || '?').toUpperCase()}</span>
      </div>
      <form data-submit="save">
        ${field('Your name', { name: 'name', value: s.name, input: 'name', attrs: 'autocomplete="given-name" maxlength="30"', msg: s.error || 'This is how the house sees you.', error: !!s.error })}
      </form>
      <fieldset style="border:0;margin:0;padding:0" class="col">
        <legend class="strong" style="padding:0">Pick your colour</legend>
        <p class="small muted" style="margin:4px 0 12px">It marks your chores and expenses everywhere in Hommate.</p>
        ${swatches(s.color, takenBy)}
      </fieldset>
    </main>
    <footer class="footer-bar bare">
      <button type="button" class="lm-btn lm-btn-primary lm-btn-large btn-block" data-on="save" ${s.name.trim() && !s.busy ? '' : raw('disabled')}>Continue</button>
    </footer>`;
  },
  actions: {
    name: (ctx, el) => ctx.set({ name: el.value, error: null }),
    color: (ctx, el) => ctx.set({ color: el.dataset.hex }),
    save: async (ctx) => {
      ctx.set({ busy: true });
      try {
        saveAccount(await patchApi('/me', { name: ctx.state.name.trim(), color: ctx.state.color, setupDone: true }));
        ctx.go('#/install?new=1', true);
      } catch (e) { ctx.set({ busy: false, error: e.message }); }
    }
  }
};

// ---------------------------------------------------------------------------------
const STEPS = {
  iphone: [
    { text: html`In <strong>Safari</strong>, tap the Share button at the bottom of the screen.`, ic: 'share' },
    { text: html`Scroll down and tap <strong>Add to Home Screen</strong>.` },
    { text: html`Tap <strong>Add</strong>, open Hommate from your Home Screen, and sign in there.` }
  ],
  android: [
    { text: html`In <strong>Chrome</strong>, tap the menu at the top right.`, ic: 'dots' },
    { text: html`Tap <strong>Add to Home screen</strong>, then <strong>Install</strong>.` },
    { text: html`Open Hommate from your Home screen or app drawer.` }
  ]
};

export const Install = {
  title: 'Keep Hommate on your Home Screen',
  async load() { return { push: await pushState().catch(() => 'unsupported') }; },
  init: (ctx) => { ctx.state = { platform: platformGuess() }; },
  view: (ctx) => {
    const s = ctx.state, push = ctx.data.push;
    const iphone = s.platform === 'iphone';
    const isNew = !!ctx.query.new;
    return html`
    <main class="screen no-tabs" style="gap:16px">
      ${isNew ? '' : backLink('#/house', 'House')}
      <div class="col" style="gap:6px;padding:0 8px 8px">
        ${isNew ? html`<p class="small muted">Last step</p>` : ''}
        <h1 class="t1">Keep Hommate on your Home Screen</h1>
        <p class="muted">It opens like any other app. On iPhone, it’s also the only way reminders can reach you.</p>
      </div>
      ${isStandalone() ? html`<section class="card pad-20 rowflex">${badge('Installed', 'success')}<span class="small muted">You’re using the Home Screen app.</span></section>` : html`
      <section class="card" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:16px">
        <h2 class="sr-only">How to add it</h2>
        ${seg('platform', [{ label: 'iPhone', value: 'iphone' }, { label: 'Android', value: 'android' }], s.platform, 'platform', 'Your phone')}
        <ol class="steps">
          ${STEPS[s.platform].map((st, i) => html`<li><span class="step-n" aria-hidden="true">${i + 1}</span><span class="grow" style="padding-top:1px">${st.text}</span>
            ${st.ic ? html`<span aria-hidden="true" style="flex:none;width:32px;height:32px;border-radius:var(--radius-sm);background:var(--bg-alt);color:var(--link);display:flex;align-items:center;justify-content:center">${icon(st.ic, 20)}</span>` : ''}</li>`)}
        </ol>
        ${iphone ? html`<p class="small muted">The Home Screen app on iPhone keeps its own sign-in, so you’ll sign in once more there as @${session.user?.username}.</p>` : ''}
      </section>`}
      <section class="card pad-20 col" style="gap:8px">
        <span aria-hidden="true" class="round-icon blue" style="width:44px;height:44px">${icon('bell', 22)}</span>
        <h2 class="t2" style="margin-top:4px">Turn on reminders</h2>
        <p class="muted">We’ll nudge you before a chore is due, and when someone asks to swap.</p>
        ${iphone && !isStandalone() ? html`<p class="small muted">On iPhone, open Hommate from your Home Screen first, then tap Allow.</p>` : ''}
        ${push === 'denied' ? html`<p class="small danger">Notifications are blocked for this site. Allow them in your phone’s settings, then come back.</p>` : ''}
        <div class="rowflex wrap" style="gap:12px;margin-top:12px">
          ${push === 'on'
            ? html`${badge('Reminders are on', 'success')}<a class="text-btn" style="margin-left:auto" href="#/today">Go to Today ›</a>`
            : html`<button type="button" class="lm-btn lm-btn-primary lm-btn-medium" data-on="allow" ${push === 'unsupported' || push === 'denied' ? raw('disabled') : ''}>Allow notifications</button>
                   <a class="lm-btn lm-btn-tertiary lm-btn-medium" href="#/today">Not now</a>`}
        </div>
      </section>
    </main>`;
  },
  actions: {
    platform: (ctx, el) => ctx.set({ platform: el.dataset.value }),
    allow: async (ctx) => {
      await enablePush();
      ctx.data.push = 'on';
      ctx.set({});
      ctx.toast('Reminders are on.');
    }
  }
};

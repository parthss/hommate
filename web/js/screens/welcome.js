import { html } from '../dom.js';
import { icon } from '../ui.js';

export default {
  title: 'Hommate',
  view: () => html`
    <main class="screen onboard" style="padding-top:calc(env(safe-area-inset-top) + 48px);gap:32px">
      <p class="h3" style="font-family:var(--font-display);letter-spacing:-0.01em">Hommate</p>
      <div class="col" style="gap:8px">
        <h1 class="t-hero">Your house, sorted.</h1>
        <p class="sub">Who’s doing what, when it’s due, and who owes whom. No group chat needed.</p>
      </div>
      <div class="preview-stack" aria-hidden="true">
        <div class="card"><span class="av" style="background:var(--av-sam)">S</span>
          <span class="col grow"><span class="strong">Take bins out</span><span class="small muted">Sam · Sunday, 8:00 pm</span></span>
          <span class="check done" style="width:26px;height:26px"><span class="ring">${icon('check', 16, 2.5)}</span></span></div>
        <div class="card" style="margin-left:20px"><span class="av" style="background:var(--av-leo)">L</span>
          <span class="col grow"><span class="strong">Clean bathroom</span><span class="small muted">Leo is next · Tuesday</span></span></div>
        <div class="card"><span class="av" style="background:var(--av-raj)">R</span>
          <span class="col grow"><span class="strong">Tesco shop</span><span class="small muted">Raj paid · split 4 ways</span></span>
          <span class="strong">£42.60</span></div>
      </div>
    </main>
    <footer class="footer-bar bare">
      <a class="lm-btn lm-btn-primary lm-btn-large btn-block" href="#/signup">Create an account</a>
      <a class="lm-btn lm-btn-secondary lm-btn-large btn-block" href="#/login">Sign in</a>
    </footer>`
};

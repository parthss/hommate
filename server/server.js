// Hommate server: a JSON API under /api plus the PWA's static files.
// Uses only Node built-ins: http, node:sqlite, crypto, fs.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { nowLocal, addMinutes } from './lib/time.js';
import { HttpError, setVapid } from './lib/house.js';
import { hashToken, SESSION_DAYS } from './lib/auth.js';
import { loadVapid } from './lib/push.js';
import { refreshHouse } from './lib/chores.js';
import { startScheduler } from './lib/scheduler.js';
import registerMe from './routes/me.js';
import registerChores from './routes/chores.js';
import registerMoney from './routes/money.js';
import registerIssues from './routes/issues.js';
import registerActivity from './routes/activity.js';
import registerAccount from './routes/account.js';
import registerMembers from './routes/members.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(here, '..', 'web');

export function createApp({ db, webDir = WEB_DIR }) {
  const routes = [];
  const route = (method, path, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, auth: opts.auth === undefined ? 'member' : opts.auth });
  };

  const vapid = loadVapid(db);
  setVapid(vapid);
  const deps = { db, vapid };
  registerAccount(route, deps);
  registerMe(route, deps);
  registerMembers(route, deps);
  registerChores(route, deps);
  registerMoney(route, deps);
  registerIssues(route, deps);
  registerActivity(route, deps);

  async function handleApi(req, res, url) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'No such endpoint.');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {};

    const ctx = { db, req, params, body, query: Object.fromEntries(url.searchParams), vapid };
    ctx.now = nowLocal();
    ctx.today = ctx.now.slice(0, 10);
    if (r.auth) {
      // 1. Who is this? (any signed-in account)
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const session = token && db.get('SELECT * FROM sessions WHERE token_hash = ?', hashToken(token));
      if (!session || session.expires_at < ctx.now) throw new HttpError(401, 'Please sign in again.', 'signed-out');
      const user = db.get('SELECT * FROM users WHERE id = ?', session.user_id);
      if (!user) throw new HttpError(401, 'Please sign in again.', 'signed-out');
      if (session.last_used.slice(0, 10) !== ctx.today) {
        db.run('UPDATE sessions SET last_used = ?, expires_at = ? WHERE token_hash = ?', ctx.now, addMinutes(ctx.now, SESSION_DAYS * 1440), session.token_hash);
      }
      ctx.user = user;
      ctx.tokenHash = session.token_hash;
      ctx.me = db.get('SELECT * FROM members WHERE user_id = ? AND left_at IS NULL', user.id) || null;
      ctx.house = ctx.me ? db.get('SELECT * FROM houses WHERE id = ?', ctx.me.house_id) : null;
      // 2. House routes also need an active membership.
      if (r.auth === 'member') {
        if (user.must_change) throw new HttpError(403, 'Choose a new password first.', 'must-change');
        if (!ctx.me) throw new HttpError(403, 'You’re not in a house.', 'no-house');
        ctx.now = nowLocal(ctx.house.tz);
        ctx.today = ctx.now.slice(0, 10);
        refreshHouse(db, ctx.house, ctx.now); // cheap: keeps tasks generated up to date
      }
    }
    return r.handler(ctx);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) {
        const out = await handleApi(req, res, url);
        send(res, 200, out ?? { ok: true });
      } else {
        await serveStatic(res, url.pathname, webDir);
      }
    } catch (e) {
      const status = e.status || (e.name === 'MoneyError' ? 400 : 500);
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : e.message, code: e.code });
    }
  };
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 200_000) { reject(new HttpError(413, 'That’s too much data.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

async function serveStatic(res, pathname, webDir) {
  let p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '') p = '/index.html';
  let file = join(webDir, p);
  if (!file.startsWith(webDir)) throw new HttpError(403, 'Forbidden');
  let info = await stat(file).catch(() => null);
  if (!info || info.isDirectory()) { file = join(webDir, 'index.html'); info = await stat(file); }
  const ext = extname(file);
  // HTML and the service worker must always be fresh; everything else is versioned by the SW.
  const fresh = ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest';
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': fresh ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(await readFile(file));
}

// ---- Start ------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const db = openDb();
  const app = createApp({ db });
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  http.createServer(app).listen(port, host, () => {
    console.log(`Hommate is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
  startScheduler(db);
}

// Accounts: password hashing (scrypt, built into Node), sessions and lockouts.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { addMinutes } from './time.js';
import { HttpError, bad } from './house.js';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 32;

export const SESSION_DAYS = 90;
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function checkPassword(password, stored) {
  const [kind, n, r, p, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(password, Buffer.from(salt, 'base64url'), want.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(want, got);
}

/** Lowercase letters, numbers, dots, dashes and underscores; 3–20 characters. */
export function cleanUsername(v) {
  const u = String(v ?? '').trim().toLowerCase();
  if (!u) throw bad('Choose a username.');
  if (!/^[a-z0-9._-]{3,20}$/.test(u)) throw bad('Usernames are 3–20 characters: letters, numbers, dots, dashes or underscores.');
  return u;
}

export function checkNewPassword(pw, username = '') {
  const s = String(pw ?? '');
  if (s.length < 8) throw bad('Use at least 8 characters for your password.');
  if (s.length > 200) throw bad('That password is too long.');
  if (username && s.toLowerCase() === username.toLowerCase()) throw bad('Your password can’t be your username.');
  return s;
}

/** A temporary password that's easy to read out: e.g. KITE-4821-MOSS style, no look-alike characters. */
export function tempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `${part()}-${part()}-${part()}`;
}

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function startSession(db, userId, now) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.run('INSERT INTO sessions (token_hash, user_id, created_at, last_used, expires_at) VALUES (?, ?, ?, ?, ?)',
    hashToken(token), userId, now, now, addMinutes(now, SESSION_DAYS * 1440));
  return token;
}

/** Check a username and password, applying the lockout. Returns the user row. */
export async function login(db, username, password, now) {
  const u = db.get('SELECT * FROM users WHERE username = ?', String(username ?? '').trim().toLowerCase());
  const wrong = new HttpError(400, 'Wrong username or password.');
  if (!u) { await hashPassword('timing-equaliser'); throw wrong; }
  if (u.locked_until && u.locked_until > now) {
    throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes, or ask your house admin to reset it.');
  }
  if (!(await checkPassword(String(password ?? ''), u.pass_hash))) {
    const fails = u.failed_count + 1;
    if (fails >= MAX_FAILS) db.run('UPDATE users SET failed_count = 0, locked_until = ? WHERE id = ?', addMinutes(now, LOCK_MINUTES), u.id);
    else db.run('UPDATE users SET failed_count = ? WHERE id = ?', fails, u.id);
    throw wrong;
  }
  db.run('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?', u.id);
  return u;
}

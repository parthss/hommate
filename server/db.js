// Opens the SQLite database using Node's built-in driver (node:sqlite), so there is
// nothing to compile or install on the tablet.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(file = process.env.HOMMATE_DB || join(here, '..', 'data', 'hommate.db')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  // Databases made before accounts existed (v0.1) can't be upgraded in place.
  const cols = db.prepare(`SELECT name FROM pragma_table_info('members')`).all().map((r) => r.name);
  if (cols.length && !cols.includes('user_id')) {
    db.close();
    throw new Error(`${file} was made by an older version of Hommate (before usernames and passwords). Delete it and start again.`);
  }
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return wrap(db);
}

// A thin helper layer so queries read nicely:  db.get(sql, ...params), db.all(...), db.run(...)
function wrap(db) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const clean = (row) => (row ? { ...row } : row); // drop the null prototype
  return {
    raw: db,
    get: (sql, ...p) => clean(stmt(sql).get(...p)),
    all: (sql, ...p) => stmt(sql).all(...p).map(clean),
    run: (sql, ...p) => stmt(sql).run(...p),
    insert: (sql, ...p) => Number(stmt(sql).run(...p).lastInsertRowid),
    exec: (sql) => db.exec(sql),
    tx(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close()
  };
}

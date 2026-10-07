// Make a safe copy of the database (works while the server is running).
//   npm run backup                     → data/backups/hommate-YYYY-MM-DD.db
//   npm run backup -- ~/storage/downloads   → copy into the tablet's Downloads folder
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.HOMMATE_DB || join(here, '..', 'data', 'hommate.db');
const outDir = resolve(process.argv[2] || join(here, '..', 'data', 'backups'));
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `hommate-${new Date().toISOString().slice(0, 10)}.db`);
try { unlinkSync(out); } catch { /* first backup today */ }
new DatabaseSync(dbFile).exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
// Keep the 14 newest backups.
const old = readdirSync(outDir).filter((f) => /^hommate-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -14);
for (const f of old) unlinkSync(join(outDir, f));
console.log('Backup saved to', out);

-- Hommate database schema (SQLite).
-- Money is stored in pence (integers) so sums never drift.
-- Dates and times are house-local strings: see server/lib/time.js.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS houses (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  tz          TEXT NOT NULL DEFAULT 'Europe/London',
  created_at  TEXT NOT NULL
);

-- A person's login. One account can be in one house at a time.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name         TEXT NOT NULL,          -- default display name for new memberships
  pass_hash    TEXT NOT NULL,          -- scrypt$N$r$p$salt$hash
  must_change  INTEGER NOT NULL DEFAULT 0, -- set after an admin reset
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at   TEXT NOT NULL
);

-- A person's place in a house. Rows are kept when someone leaves (left_at), so history
-- and balances still have a name; rejoining the same house reuses the row.
CREATE TABLE IF NOT EXISTS members (
  id                INTEGER PRIMARY KEY,
  house_id          INTEGER NOT NULL REFERENCES houses(id),
  user_id           INTEGER REFERENCES users(id),
  name              TEXT NOT NULL,
  color             TEXT NOT NULL,              -- hex, e.g. #6b4fd8
  is_admin          INTEGER NOT NULL DEFAULT 0,
  setup_done        INTEGER NOT NULL DEFAULT 1, -- 0 until a newly approved member picks a colour
  reminder_minutes  INTEGER NOT NULL DEFAULT 60, -- default "remind me" lead time
  prefs             TEXT NOT NULL DEFAULT '{"remind":true,"overdue":true,"swaps":true,"expenses":true,"weekly":false}',
  last_seen_activity INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  left_at           TEXT,
  removed_by        INTEGER REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS members_house ON members(house_id);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);

-- One row per signed-in device. We store a hash of the token, never the token itself.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  last_used  TEXT NOT NULL,
  expires_at TEXT NOT NULL             -- 90 days after last use
);

-- Requests to join a house with its code. An admin approves or declines.
CREATE TABLE IF NOT EXISTS join_requests (
  id          INTEGER PRIMARY KEY,
  house_id    INTEGER NOT NULL REFERENCES houses(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | cancelled
  created_at  TEXT NOT NULL,
  answered_at TEXT,
  answered_by INTEGER REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS join_requests_house ON join_requests(house_id, status);

CREATE TABLE IF NOT EXISTS chores (
  id               INTEGER PRIMARY KEY,
  house_id         INTEGER NOT NULL REFERENCES houses(id),
  title            TEXT NOT NULL,
  short            TEXT,                 -- label for the rota grid, e.g. "Bins"
  repeat           TEXT NOT NULL,        -- once | daily | weekly | custom | monthly
  days             TEXT NOT NULL DEFAULT '', -- weekly/custom: 'tue,sat'; monthly: day of month
  mode             TEXT NOT NULL,        -- one | turns | claim
  owner_id         INTEGER REFERENCES members(id), -- mode = one
  rotation         TEXT NOT NULL DEFAULT '[]',     -- mode = turns: JSON array of member ids, in order
  rot_base         INTEGER,              -- occurrence number that rotation[0] lands on
  start_date       TEXT NOT NULL,
  due_time         TEXT,                 -- 'HH:MM', or NULL for "anytime"
  reminder_minutes INTEGER,              -- NULL = each person's own default; -1 = no reminder
  created_by       INTEGER REFERENCES members(id),
  created_at       TEXT NOT NULL,
  archived_at      TEXT
);
CREATE INDEX IF NOT EXISTS chores_house ON chores(house_id);

-- Each occurrence of a chore. Recurring chores get rows generated a couple of weeks ahead.
CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY,
  chore_id       INTEGER NOT NULL REFERENCES chores(id),
  seq            INTEGER NOT NULL,       -- occurrence number; drives the rotation
  due_date       TEXT NOT NULL,
  due_time       TEXT,
  assignee_id    INTEGER REFERENCES members(id),
  swapped        INTEGER NOT NULL DEFAULT 0, -- assignee changed by a swap or claim
  status         TEXT NOT NULL DEFAULT 'open', -- open | done | missed
  done_by        INTEGER REFERENCES members(id),
  done_at        TEXT,
  reminded_at    TEXT,
  nudged_at      TEXT,
  overdue_logged INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chore_id, due_date)
);
CREATE INDEX IF NOT EXISTS tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id, status);

CREATE TABLE IF NOT EXISTS swaps (
  id           INTEGER PRIMARY KEY,
  house_id     INTEGER NOT NULL REFERENCES houses(id),
  task_id      INTEGER NOT NULL REFERENCES tasks(id), -- the requester's task
  give_task_id INTEGER REFERENCES tasks(id),          -- the other person's task the requester takes in return
  from_id      INTEGER NOT NULL REFERENCES members(id),
  to_id        INTEGER NOT NULL REFERENCES members(id),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | cancelled
  created_at   TEXT NOT NULL,
  answered_at  TEXT
);

CREATE TABLE IF NOT EXISTS bills (
  id           INTEGER PRIMARY KEY,
  house_id     INTEGER NOT NULL REFERENCES houses(id),
  title        TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  payer_id     INTEGER NOT NULL REFERENCES members(id),
  day_of_month INTEGER NOT NULL,
  last_run     TEXT,               -- 'YYYY-MM' of the last expense created
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY,
  house_id   INTEGER NOT NULL REFERENCES houses(id),
  title      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  date       TEXT NOT NULL,
  split_type TEXT NOT NULL,        -- equal | exact | percent | shares
  bill_id    INTEGER REFERENCES bills(id),
  created_by INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS expenses_house ON expenses(house_id, date);

CREATE TABLE IF NOT EXISTS expense_payers (
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  member_id  INTEGER NOT NULL REFERENCES members(id),
  amount     INTEGER NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  member_id  INTEGER NOT NULL REFERENCES members(id),
  amount     INTEGER NOT NULL,
  value      REAL,                 -- what was entered: pence, percent or shares
  PRIMARY KEY (expense_id, member_id)
);

-- "Settle up" records. Hommate never moves money; this only records that someone paid.
CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY,
  house_id   INTEGER NOT NULL REFERENCES houses(id),
  from_id    INTEGER NOT NULL REFERENCES members(id),
  to_id      INTEGER NOT NULL REFERENCES members(id),
  amount     INTEGER NOT NULL,
  method     TEXT NOT NULL,        -- bank | cash | other
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY,
  house_id    INTEGER NOT NULL REFERENCES houses(id),
  type        TEXT NOT NULL,       -- now | properly | smell | other
  title       TEXT NOT NULL,
  detail      TEXT,
  chore_id    INTEGER REFERENCES chores(id),
  reporter_id INTEGER NOT NULL REFERENCES members(id),
  anonymous   INTEGER NOT NULL DEFAULT 0,
  tag_id      INTEGER REFERENCES members(id), -- NULL = everyone
  on_it_id    INTEGER REFERENCES members(id),
  on_it_note  TEXT,
  status      TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS issue_replies (
  id         INTEGER PRIMARY KEY,
  issue_id   INTEGER NOT NULL REFERENCES issues(id),
  member_id  INTEGER REFERENCES members(id),
  kind       TEXT NOT NULL DEFAULT 'msg', -- msg | event
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_agrees (
  issue_id  INTEGER NOT NULL REFERENCES issues(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  PRIMARY KEY (issue_id, member_id)
);

-- The full house history. verb/detail may contain {target}, which the app shows as
-- "you" to the target and as their name to everyone else.
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY,
  house_id   INTEGER NOT NULL REFERENCES houses(id),
  actor_id   INTEGER REFERENCES members(id), -- NULL = Hommate itself (or an anonymous post)
  cat        TEXT NOT NULL,     -- chores | money | swaps | issues | house
  icon       TEXT NOT NULL,     -- done | money | swap | edit | alert | issue | join
  verb       TEXT NOT NULL,
  detail     TEXT,
  target_id  INTEGER REFERENCES members(id),
  amount     INTEGER,
  ref_type   TEXT,
  ref_id     INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_house ON activity(house_id, id);
CREATE INDEX IF NOT EXISTS activity_ref ON activity(ref_type, ref_id);

-- Push subscriptions belong to the account, so people waiting for approval can be told.
CREATE TABLE IF NOT EXISTS push_subs (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

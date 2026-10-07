// Time helpers.
//
// Everything in Hommate is stored as *house-local* wall-clock time, as plain strings:
//   date      'YYYY-MM-DD'
//   time      'HH:MM'
//   datetime  'YYYY-MM-DDTHH:MM:SS'
// The house's time zone (e.g. Europe/London) decides what "now" is. Because all values
// share one zone, string comparison sorts them correctly and the app never has to think
// about UTC offsets or daylight saving.

const DAY_MS = 86400000;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// For tests and demos: HOMMATE_FAKE_NOW=2026-10-05T09:00 freezes the clock.
let fakeNow = process.env.HOMMATE_FAKE_NOW || null;
export function setFakeNow(v) { fakeNow = v; }

const formatters = new Map();
function partsIn(tz, date) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    formatters.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** Current local datetime in the given zone, as 'YYYY-MM-DDTHH:MM:SS'. */
export function nowLocal(tz = 'Europe/London') {
  if (fakeNow) return fakeNow.length === 16 ? fakeNow + ':00' : fakeNow;
  const p = partsIn(tz, new Date());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export const today = (tz) => nowLocal(tz).slice(0, 10);

// Date arithmetic on naive dates. We go through UTC so no zone can shift the result.
const toUTC = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d, n) => fromUTC(toUTC(d) + n * DAY_MS);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (d) => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
export const weekdayKey = (d) => WEEKDAYS[weekdayIndex(d)];
export const startOfWeek = (d) => addDays(d, -weekdayIndex(d));
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Add minutes to a local datetime string. */
export function addMinutes(dt, mins) {
  const ms = Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7) - 1, +dt.slice(8, 10),
    +dt.slice(11, 13), +dt.slice(14, 16), +(dt.slice(17, 19) || 0)) + mins * 60000;
  return new Date(ms).toISOString().slice(0, 19);
}

/** The moment a task counts as due. "Anytime" tasks are due at the end of their day. */
export const dueAt = (date, time) => `${date}T${time || '23:59'}:00`;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-10' → 'Sat 10 Oct' */
export const shortDate = (d) => `${DAY_NAMES[weekdayIndex(d)]} ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
/** '21:00' → '9:00 pm' */
export function clock(t) {
  if (!t) return 'anytime';
  const h = +t.slice(0, 2), m = t.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

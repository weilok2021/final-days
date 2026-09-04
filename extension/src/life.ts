// Life arithmetic and copy shared by every part of the extension. Pure: no
// browser or Node APIs, so it runs in the service worker, the extension pages
// and the tests alike. Numbers and wording follow SPEC.md and match
// windows/life.go in the Windows port.

/** Lifespan is fixed by the spec. It is a constant, not a setting. */
export const LIFESPAN_YEARS = 80;

/** 80 years in days: 80 × 365.25, rounded. */
export const TOTAL_DAYS = Math.round(LIFESPAN_YEARS * 365.25);

const MS_PER_DAY = 86_400_000;

/** A calendar date with a 1-based month, free of any time zone. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The state of one person's bar on a given day. */
export interface Life {
  lived: number;
  left: number;
  total: number;
  fraction: number;
}

/**
 * Counts whole calendar days from birth to now. Both are taken as local
 * dates and compared in UTC, so daylight-saving shifts never cause an
 * off-by-one. Never negative.
 */
export function computeLife(birth: CalendarDate, now: Date): Life {
  const b = utcDay(birth.year, birth.month, birth.day);
  const n = utcDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const lived = Math.max(0, Math.floor((n - b) / MS_PER_DAY));
  const left = Math.max(0, TOTAL_DAYS - lived);
  const fraction = Math.min(1, lived / TOTAL_DAYS);
  return { lived, left, total: TOTAL_DAYS, fraction };
}

/** Midnight UTC of the given calendar date, in epoch milliseconds. Handles years below 100. */
function utcDay(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

/** Renders 18271 as "18,271". */
export function formatInt(n: number): string {
  const digits = String(Math.trunc(Math.abs(n)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${grouped}` : grouped;
}

/** The one sentence the countdown asks. Ports share this wording. */
export function question(left: number): string {
  return `Is today worth one of your remaining ${formatInt(left)} days?`;
}

/** The hover label on the strip: "Day 11,201 of 29,220 · 18,019 days left". */
export function tipText(life: Life): string {
  return `Day ${formatInt(life.lived)} of ${formatInt(life.total)} · ${formatInt(life.left)} days left`;
}

/** The line under the big number on the countdown. */
export function countdownLine(life: Life): string {
  return `days left · day ${formatInt(life.lived)} of ${formatInt(life.total)}`;
}

/** "YYYY-MM-DD" of the local calendar date. */
export function localDateString(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  return `${y}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parses the date of birth as typed on the options page. Throws an Error
 * whose message is fit for showing to the user.
 */
export function parseBirth(text: string, today: Date): CalendarDate {
  const s = text.trim();
  if (s === '') throw new Error('Enter your date of birth.');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Date of birth must be YYYY-MM-DD, got "${s}".`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(utcDay(year, month, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`"${s}" is not a real date.`);
  }
  if (s > localDateString(today)) throw new Error(`Date of birth "${s}" is in the future.`);
  return { year, month, day };
}

/**
 * A daily window in minutes since midnight, end exclusive. A range that
 * crosses midnight (22:00-06:00) is allowed.
 */
export interface HourRange {
  start: number;
  end: number;
}

/**
 * Parses "09:00-12:00, 14:00-17:00". Empty means no quiet hours. Throws an
 * Error whose message is fit for showing to the user.
 */
export function parseHourRanges(text: string): HourRange[] {
  const out: HourRange[] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (part === '') continue;
    const dash = part.indexOf('-');
    if (dash < 0) throw new Error(`Quiet hours: "${part}" is not HH:MM-HH:MM.`);
    out.push({ start: parseHHMM(part.slice(0, dash)), end: parseHHMM(part.slice(dash + 1)) });
  }
  return out;
}

function parseHHMM(text: string): number {
  const s = text.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  const hh = m ? Number(m[1]) : NaN;
  const mm = m ? Number(m[2]) : NaN;
  if (!m || hh > 24 || mm > 59 || (hh === 24 && mm !== 0)) {
    throw new Error(`Quiet hours: "${s}" is not HH:MM.`);
  }
  return hh * 60 + mm;
}

/** Whether the minute of the day falls inside the range. */
export function rangeContains(r: HourRange, minuteOfDay: number): boolean {
  if (r.start <= r.end) return minuteOfDay >= r.start && minuteOfDay < r.end;
  return minuteOfDay >= r.start || minuteOfDay < r.end;
}

/** Whether the given local time falls inside any range. */
export function inQuietHours(ranges: HourRange[], now: Date): boolean {
  const minute = now.getHours() * 60 + now.getMinutes();
  return ranges.some((r) => rangeContains(r, minute));
}

/**
 * The next local instant at which the strip may change: the next quiet-hours
 * boundary later today, or else local midnight (when the day count moves).
 */
export function nextChange(now: Date, ranges: HourRange[]): Date {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  let best = new Date(y, mo, d + 1).getTime();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  for (const r of ranges) {
    for (const m of [r.start, r.end]) {
      if (m <= nowMinute || m >= 24 * 60) continue;
      const t = new Date(y, mo, d, Math.floor(m / 60), m % 60).getTime();
      if (t < best) best = t;
    }
  }
  return new Date(best);
}

/**
 * Parses the "countdown only on these sites" list: host names separated by
 * commas or new lines. A pasted URL is reduced to its host, and a leading
 * "www." is dropped so that every subdomain of the site matches. Empty text
 * gives an empty list. Throws an Error fit for showing to the user.
 */
export function parseSiteList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const entry = raw.trim();
    if (entry === '') continue;
    let host = entry.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    host = host.split('/')[0]?.split('?')[0]?.split(':')[0] ?? '';
    host = host.replace(/^\*\./, '').replace(/^www\./, '');
    if (host === '' || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
      throw new Error(`Sites: "${entry}" is not a site name like youtube.com.`);
    }
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

/** Whether a page host is one of the listed sites or a subdomain of one. */
export function siteListed(sites: string[], host: string): boolean {
  const h = host.toLowerCase();
  return sites.some((site) => h === site || h.endsWith(`.${site}`));
}

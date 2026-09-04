import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_DAYS,
  computeLife,
  formatInt,
  inQuietHours,
  localDateString,
  countdownLine,
  nextChange,
  parseBirth,
  parseHourRanges,
  parseSiteList,
  question,
  rangeContains,
  siteListed,
  tipText,
} from '../src/life.ts';

test('total days is 80 years', () => {
  assert.equal(TOTAL_DAYS, 29220);
});

test('computeLife counts whole local calendar days', () => {
  const birth = { year: 2000, month: 1, day: 1 };
  const cases: Array<[Date, number]> = [
    [new Date(2000, 0, 1, 23, 59), 0],
    [new Date(2000, 0, 2, 0, 0, 1), 1],
    [new Date(2001, 0, 1, 12, 0), 366], // 2000 was a leap year
    [new Date(1999, 5, 1), 0], // before birth clamps to 0
  ];
  for (const [now, lived] of cases) {
    const life = computeLife(birth, now);
    assert.equal(life.lived, lived, `now=${now.toISOString()}`);
    assert.equal(life.left, 29220 - lived);
    assert.equal(life.total, 29220);
  }
  const old = computeLife(birth, new Date(2100, 0, 1));
  assert.equal(old.left, 0);
  assert.equal(old.fraction, 1);
});

test('computeLife matches the spec example', () => {
  // Day 11,201 of 29,220 with 18,019 days left is the label in SPEC.md.
  const life = computeLife({ year: 1996, month: 1, day: 1 }, new Date(2026, 8, 3));
  assert.equal(life.lived, 11203);
  assert.equal(life.left, 18017);
  assert.equal(tipText(life), 'Day 11,203 of 29,220 · 18,017 days left');
  assert.equal(countdownLine(life), 'days left · day 11,203 of 29,220');
});

test('formatInt groups thousands', () => {
  const cases: Array<[number, string]> = [
    [0, '0'], [7, '7'], [999, '999'], [1000, '1,000'], [18271, '18,271'], [29220, '29,220'], [1234567, '1,234,567'], [-1234, '-1,234'],
  ];
  for (const [n, want] of cases) assert.equal(formatInt(n), want);
});

test('question wording', () => {
  assert.equal(question(18271), 'Is today worth one of your remaining 18,271 days?');
});

test('localDateString is the local calendar date', () => {
  assert.equal(localDateString(new Date(2026, 8, 3, 23, 59)), '2026-09-03');
  assert.equal(localDateString(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('parseBirth accepts real past dates only', () => {
  const today = new Date(2026, 8, 3);
  assert.deepEqual(parseBirth('1996-01-01', today), { year: 1996, month: 1, day: 1 });
  assert.deepEqual(parseBirth(' 2026-09-03 ', today), { year: 2026, month: 9, day: 3 });
  assert.throws(() => parseBirth('', today), /Enter your date of birth/);
  assert.throws(() => parseBirth('1996/01/01', today), /YYYY-MM-DD/);
  assert.throws(() => parseBirth('2023-02-30', today), /not a real date/);
  assert.throws(() => parseBirth('2026-09-04', today), /in the future/);
});

test('parseHourRanges', () => {
  assert.deepEqual(parseHourRanges(''), []);
  assert.deepEqual(parseHourRanges('  '), []);
  assert.deepEqual(parseHourRanges('09:00-12:00'), [{ start: 540, end: 720 }]);
  assert.deepEqual(parseHourRanges('9:00-12:00, 14:00-17:00,'), [
    { start: 540, end: 720 },
    { start: 840, end: 1020 },
  ]);
  assert.deepEqual(parseHourRanges('22:00-06:00'), [{ start: 1320, end: 360 }]);
  assert.deepEqual(parseHourRanges('00:00-24:00'), [{ start: 0, end: 1440 }]);
  assert.throws(() => parseHourRanges('0900'), /not HH:MM-HH:MM/);
  assert.throws(() => parseHourRanges('9-12'), /"9" is not HH:MM/);
  assert.throws(() => parseHourRanges('09:00-25:00'), /not HH:MM/);
  assert.throws(() => parseHourRanges('09:60-10:00'), /not HH:MM/);
  assert.throws(() => parseHourRanges('24:30-10:00'), /not HH:MM/);
});

test('rangeContains handles ranges that cross midnight', () => {
  const day = { start: 540, end: 720 };
  assert.equal(rangeContains(day, 539), false);
  assert.equal(rangeContains(day, 540), true);
  assert.equal(rangeContains(day, 719), true);
  assert.equal(rangeContains(day, 720), false);
  const night = { start: 1320, end: 360 };
  assert.equal(rangeContains(night, 1319), false);
  assert.equal(rangeContains(night, 1320), true);
  assert.equal(rangeContains(night, 0), true);
  assert.equal(rangeContains(night, 359), true);
  assert.equal(rangeContains(night, 360), false);
});

test('inQuietHours uses the local clock', () => {
  const ranges = parseHourRanges('09:00-12:00');
  assert.equal(inQuietHours(ranges, new Date(2026, 8, 3, 10, 30)), true);
  assert.equal(inQuietHours(ranges, new Date(2026, 8, 3, 12, 0)), false);
  assert.equal(inQuietHours([], new Date(2026, 8, 3, 10, 30)), false);
});

test('nextChange is the next boundary today or else midnight', () => {
  const ranges = parseHourRanges('09:00-12:00, 22:00-06:00');
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 8, 59, 30), ranges), new Date(2026, 8, 3, 9, 0));
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 9, 0, 0), ranges), new Date(2026, 8, 3, 12, 0));
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 13, 0), ranges), new Date(2026, 8, 3, 22, 0));
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 23, 30), ranges), new Date(2026, 8, 4, 0, 0));
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 13, 0), []), new Date(2026, 8, 4, 0, 0));
  assert.deepEqual(nextChange(new Date(2026, 8, 3, 13, 0), parseHourRanges('00:00-24:00')), new Date(2026, 8, 4, 0, 0));
});

test('parseSiteList takes hosts, URLs and lists', () => {
  assert.deepEqual(parseSiteList(''), []);
  assert.deepEqual(parseSiteList('youtube.com'), ['youtube.com']);
  assert.deepEqual(parseSiteList('YouTube.com, www.facebook.com\n https://www.reddit.com/r/all?x=1 ,'), [
    'youtube.com',
    'facebook.com',
    'reddit.com',
  ]);
  assert.deepEqual(parseSiteList('*.x.com, x.com'), ['x.com']);
  assert.throws(() => parseSiteList('you tube.com'), /not a site name/);
  assert.throws(() => parseSiteList('.com'), /not a site name/);
});

test('siteListed matches the site and its subdomains', () => {
  const sites = parseSiteList('youtube.com, x.com');
  assert.equal(siteListed(sites, 'www.youtube.com'), true);
  assert.equal(siteListed(sites, 'youtube.com'), true);
  assert.equal(siteListed(sites, 'm.youtube.com'), true);
  assert.equal(siteListed(sites, 'notyoutube.com'), false);
  assert.equal(siteListed(sites, 'github.com'), false);
  assert.equal(siteListed(sites, ''), false);
  assert.equal(siteListed([], 'github.com'), false);
});

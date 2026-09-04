// End-to-end test of the built extension in Playwright's Chromium. It loads
// extension/dist unpacked, answers every https request itself with a small
// fake page (no real network), and drives the options page and the countdown
// the way a person would. Run: npm run build && npm run e2e
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { computeLife, countdownLine, dayLabel, formatInt, localDateString, parseBirth } from '../src/life.ts';

const DIST = resolve(import.meta.dirname, '../dist');
const SHOTS = process.env['FD_SHOTS'] ?? join(tmpdir(), 'final-days-shots');
const BIRTH = '2001-06-29';
const VIEWPORT = { width: 1280, height: 720 };
const SLOW = { timeout: 90_000 };

let context: BrowserContext;
let userDataDir: string;
let extensionId: string;
/** The options tab: the form under test, and our handle on chrome.storage. */
let options: Page;

function fakeSite(host: string): string {
  const redirect =
    host === 'old.example' ? '<script>location.replace("https://new.example/")</script>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${host}</title>${redirect}
<style>body{margin:0;font:16px sans-serif;background:#fff}header{position:fixed;top:0;left:0;right:0;height:40px;background:#dddddd}</style>
</head><body><header>${host}</header><main style="padding:60px 20px"><h1>${host}</h1><input id="q" aria-label="q"></main></body></html>`;
}

async function waitForPage(match: (p: Page) => boolean, timeoutMs = 15_000): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = context.pages().find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('page not found: ' + context.pages().map((p) => p.url()).join(', '));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Colour of one pixel of the page. Decodes the 1x1 PNG by hand: for the first pixel every PNG filter is the identity. */
async function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1] ?? 0, raw[2] ?? 0, raw[3] ?? 0];
}

function assertColour(actual: [number, number, number], hex: string, what: string, tolerance = 14): void {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const off = actual.map((v, i) => Math.abs(v - (want[i] ?? 0)));
  assert.ok(
    off.every((d) => d <= tolerance),
    `${what}: expected about ${hex}, got #${actual.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  );
}

const state = () => options.evaluate(() => chrome.storage.local.get(null));
const resetDay = () => options.evaluate(() => chrome.storage.local.clear());

async function saveOptions(values: {
  birth?: string;
  countdown?: boolean;
  mode?: 'daily' | 'sites';
  sites?: string;
}): Promise<void> {
  if (values.birth !== undefined) await options.fill('#birth', values.birth);
  if (values.mode !== undefined) await options.check(values.mode === 'sites' ? '#mode-sites' : '#mode-daily');
  if (values.countdown !== undefined) await options.setChecked('#countdown', values.countdown);
  if (values.sites !== undefined) await options.fill('#sites', values.sites);
  await options.click('button[type=submit]');
  await options.locator('#status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 5_000 });
  await sleep(400); // let every open page pick up the change
}

const countdown = (page: Page) => page.locator('final-days-countdown');

async function expectNoCountdown(page: Page, what: string): Promise<void> {
  await sleep(900);
  assert.equal(await countdown(page).count(), 0, `${what}: a countdown appeared`);
}

before(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'final-days-e2e-'));
  mkdirSync(SHOTS, { recursive: true });
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await context.route(/^https?:\/\//, (route) => {
    const host = new URL(route.request().url()).hostname;
    void route.fulfill({ status: 200, contentType: 'text/html', body: fakeSite(host) });
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  extensionId = new URL(worker.url()).host;
  options = await waitForPage((p) => p.url().includes('options.html'));
  await options.setViewportSize(VIEWPORT);
});

after(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('the options page opens on install and saves the date of birth', SLOW, async () => {
  await options.locator('#status').filter({ hasText: 'Set your date of birth to start.' }).waitFor({ timeout: 10_000 });
  assert.equal(await options.locator('#preview').isHidden(), true);
  assert.equal(await options.locator('#mode-daily').isChecked(), true);
  await saveOptions({ birth: BIRTH });
  const now = new Date();
  const life = computeLife(parseBirth(BIRTH, now), now);
  assert.equal(await options.locator('#day-label').textContent(), dayLabel(life));
  await shot(options, '01-options-saved');
});

test('the options page refuses bad input without saving it', SLOW, async () => {
  await options.fill('#birth', '2999-01-01');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /in the future/);
  await options.fill('#birth', BIRTH);
  await options.fill('#sites', 'you tube.com');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /not a site name/);
  await options.fill('#sites', '');
  await options.check('#mode-sites');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /at least one site/);
  await options.check('#mode-daily');
  const settings = await options.evaluate(() => chrome.storage.sync.get(null));
  assert.equal(settings['birth'], BIRTH);
  assert.equal(settings['countdownSites'] ?? '', '');
});

let page: Page;

test('the first countdown of the day appears on the first page', SLOW, async () => {
  page = await context.newPage();
  await page.goto('https://example.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  const box = await countdown(page).boundingBox();
  assert.deepEqual(box, { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height });
  await shot(page, '02-countdown');
  assertColour(await pixel(page, 100, 100), '#0b0d12', 'countdown background');
  assertColour(await pixel(page, 5, 1), '#16a34a', 'countdown bar, lived end');
  assertColour(await pixel(page, 1275, 1), '#27272a', 'countdown bar, remainder');

  const s = await state();
  assert.equal(s['lastCountdown'], localDateString(new Date()));
  assert.equal(typeof s['countdownToken'], 'string');
  assert.notEqual(s['countdownToken'], '');
});

test('a click dismisses the countdown, leaves the page untouched, and a reload does not bring it back', SLOW, async () => {
  await page.mouse.click(640, 360);
  await countdown(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.reload();
  await expectNoCountdown(page, 'after reload');
  await shot(page, '03-page-between-countdowns');
  assertColour(await pixel(page, 5, 2), '#dddddd', 'page header at the very top: nothing drawn over it');
  assertColour(await pixel(page, 640, 20), '#dddddd', 'page header');
});

test('a second page today shows no countdown', SLOW, async () => {
  const other = await context.newPage();
  await other.goto('https://example.org/');
  await expectNoCountdown(other, 'second page');
  await other.close();
});

test('keys dismiss the countdown and are swallowed only while it is up', SLOW, async () => {
  await resetDay();
  await page.goto('https://example.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('a');
  await countdown(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.locator('#q').focus();
  await page.keyboard.type('b');
  assert.equal(await page.locator('#q').inputValue(), 'b');
});

test('several tabs loading at once show the countdown exactly once', SLOW, async () => {
  await resetDay();
  const pages = await Promise.all([1, 2, 3].map(() => context.newPage()));
  await Promise.all(pages.map((p, i) => p.goto(`https://tab${i}.example/`)));
  await sleep(1_500);
  const counts = await Promise.all(pages.map((p) => countdown(p).count()));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1, `countdowns per tab: ${counts.join(',')}`);
  await Promise.all(pages.map((p) => p.close()));
});

test('switching the countdown off stops it, and on brings it back', SLOW, async () => {
  await saveOptions({ countdown: false });
  await resetDay();
  await page.goto('https://example.com/');
  await expectNoCountdown(page, 'countdown switched off');
  await saveOptions({ countdown: true });
  await page.goto('https://example.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
});

test('in the sites mode the countdown appears on every load of a listed site and nowhere else', SLOW, async () => {
  await saveOptions({ mode: 'sites', sites: 'youtube.com, facebook.com' });
  await resetDay();
  await page.goto('https://github.com/');
  await expectNoCountdown(page, 'unlisted site');
  await page.goto('https://www.youtube.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await shot(page, '06-countdown-on-listed-site');
  await page.mouse.click(640, 360);
  await countdown(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.bringToFront();
  await sleep(600);
  assert.equal(await countdown(page).count(), 0, 'the same page must not show it again on focus');
  await page.reload();
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
  await page.goto('https://www.facebook.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
  const s = await state();
  assert.equal(s['lastCountdown'], undefined, 'the sites mode must not claim the day');
  const hidden = await context.newPage();
  await hidden.goto('https://www.youtube.com/');
  await hidden.close();
});

test('a countdown left on screen for three seconds counts as seen', SLOW, async () => {
  await saveOptions({ mode: 'daily' });
  await resetDay();
  await page.goto('https://www.youtube.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(3_400);
  await page.goto('https://www.facebook.com/');
  await expectNoCountdown(page, 'after three seconds on screen');
});

test('a countdown that flashes for under a second is released to the next page', SLOW, async () => {
  await resetDay();
  await page.goto('https://www.youtube.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.goto('https://www.facebook.com/');
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
});

test('a page that redirects on arrival does not eat the day', SLOW, async () => {
  await resetDay();
  await page.goto('https://old.example/');
  await page.waitForURL('https://new.example/', { timeout: 10_000 });
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
});

test('the popup shows the numbers', SLOW, async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const now = new Date();
  const life = computeLife(parseBirth(BIRTH, now), now);
  await popup.locator('#ready').waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await popup.locator('#left').textContent(), formatInt(life.left));
  assert.equal(await popup.locator('#line').textContent(), countdownLine(life));
  await popup.setViewportSize({ width: 260, height: 220 });
  await shot(popup, '07-popup');
  await popup.close();
});

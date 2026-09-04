// End-to-end test of the built extension in Playwright's Chromium. It loads
// extension/dist unpacked, answers every https request itself with a small
// fake page (no real network), and drives the options page, the strip and the
// moment the way a person would. Run: npm run build && npm run e2e
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { computeLife, formatInt, localDateString, momentLine, parseBirth, tipText } from '../src/life.ts';

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
  strip?: boolean;
  moment?: boolean;
  quiet?: string;
  mode?: 'daily' | 'sites';
  sites?: string;
}): Promise<void> {
  if (values.birth !== undefined) await options.fill('#birth', values.birth);
  if (values.mode !== undefined) await options.check(values.mode === 'sites' ? '#mode-sites' : '#mode-daily');
  if (values.strip !== undefined) await options.setChecked('#strip', values.strip);
  if (values.moment !== undefined) await options.setChecked('#moment', values.moment);
  if (values.quiet !== undefined) await options.fill('#quiet', values.quiet);
  if (values.sites !== undefined) await options.fill('#sites', values.sites);
  await options.click('button[type=submit]');
  await options.locator('#status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 5_000 });
  await sleep(400); // let every open page pick up the change
}

const strip = (page: Page) => page.locator('final-days-strip');
const moment = (page: Page) => page.locator('final-days-moment');

async function expectNoMoment(page: Page, what: string): Promise<void> {
  await sleep(900);
  assert.equal(await moment(page).count(), 0, `${what}: a moment appeared`);
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
  assert.equal(await options.locator('#tip').textContent(), tipText(life));
  await shot(options, '01-options-saved');
});

test('the options page refuses bad input without saving it', SLOW, async () => {
  await options.fill('#quiet', '9-12');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /"9" is not HH:MM/);
  await options.fill('#quiet', '');
  await options.fill('#sites', 'you tube.com');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /not a site name/);
  await options.fill('#sites', '');
  await options.check('#mode-sites');
  await options.click('button[type=submit]');
  assert.match((await options.locator('#status').textContent()) ?? '', /at least one site/);
  await options.check('#mode-daily');
  const settings = await options.evaluate(() => chrome.storage.sync.get(null));
  assert.equal(settings['quietHours'], '');
  assert.equal(settings['momentSites'] ?? '', '');
});

let page: Page;

test('the strip and the first moment of the day appear on the first page', SLOW, async () => {
  page = await context.newPage();
  await page.goto('https://example.com/');
  await strip(page).waitFor({ state: 'attached', timeout: 10_000 });
  const box = await strip(page).boundingBox();
  assert.deepEqual(box, { x: 0, y: 0, width: VIEWPORT.width, height: 4 });

  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  const mbox = await moment(page).boundingBox();
  assert.deepEqual(mbox, { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height });
  await shot(page, '02-moment');
  assertColour(await pixel(page, 100, 100), '#0b0d12', 'moment background');
  assertColour(await pixel(page, 5, 1), '#16a34a', 'moment bar, lived end');
  assertColour(await pixel(page, 1275, 1), '#27272a', 'moment bar, remainder');

  const s = await state();
  assert.equal(s['lastMoment'], localDateString(new Date()));
  assert.equal(typeof s['momentToken'], 'string');
  assert.notEqual(s['momentToken'], '');
});

test('a click dismisses the moment and a reload does not bring it back', SLOW, async () => {
  await page.mouse.click(640, 360);
  await moment(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.reload();
  await strip(page).waitFor({ state: 'attached', timeout: 10_000 });
  await expectNoMoment(page, 'after reload');
  await shot(page, '03-strip-only');
  assertColour(await pixel(page, 5, 2), '#16a34a', 'strip, lived end');
  assertColour(await pixel(page, 1275, 2), '#e7e5e4', 'strip, remainder');
  assertColour(await pixel(page, 640, 20), '#dddddd', 'page header just under the strip');
});

test('a second page today shows the strip but no moment', SLOW, async () => {
  const other = await context.newPage();
  await other.goto('https://example.org/');
  await strip(other).waitFor({ state: 'attached', timeout: 10_000 });
  await expectNoMoment(other, 'second page');
  await other.close();
});

test('the hover label appears after a short pause', SLOW, async () => {
  await page.bringToFront();
  await page.mouse.move(300, 2);
  await sleep(150);
  assertColour(await pixel(page, 190, 20), '#dddddd', 'no label yet');
  await sleep(600);
  assertColour(await pixel(page, 190, 20), '#1f2430', 'label background');
  await page.screenshot({ path: join(SHOTS, '04-hover-label.png'), clip: { x: 0, y: 0, width: 640, height: 60 } });
  await page.mouse.move(640, 400);
  await sleep(100);
  assertColour(await pixel(page, 190, 20), '#dddddd', 'label gone');
});

test('keys dismiss the moment and are swallowed only while it is up', SLOW, async () => {
  await resetDay();
  await page.goto('https://example.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('a');
  await moment(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.locator('#q').focus();
  await page.keyboard.type('b');
  assert.equal(await page.locator('#q').inputValue(), 'b');
});

test('several tabs loading at once show the moment exactly once', SLOW, async () => {
  await resetDay();
  const pages = await Promise.all([1, 2, 3].map(() => context.newPage()));
  await Promise.all(pages.map((p, i) => p.goto(`https://tab${i}.example/`)));
  await sleep(1_500);
  const counts = await Promise.all(pages.map((p) => moment(p).count()));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1, `moments per tab: ${counts.join(',')}`);
  await Promise.all(pages.map((p) => p.close()));
});

test('quiet hours turn the lived part grey', SLOW, async () => {
  await saveOptions({ quiet: '00:00-24:00' });
  assertColour(await pixel(page, 5, 2), '#6b7280', 'strip in quiet hours');
  assertColour(await pixel(page, 1275, 2), '#e7e5e4', 'remainder in quiet hours');
  await shot(page, '05-quiet-hours');
  await saveOptions({ quiet: '' });
  assertColour(await pixel(page, 5, 2), '#16a34a', 'strip after quiet hours');
});

test('switching the strip off removes it from open pages', SLOW, async () => {
  await saveOptions({ strip: false });
  assert.equal(await strip(page).count(), 0);
  assertColour(await pixel(page, 5, 2), '#dddddd', 'page header where the strip was');
  await saveOptions({ strip: true });
  await strip(page).waitFor({ state: 'attached', timeout: 5_000 });
});

test('in the sites mode the moment appears on every load of a listed site and nowhere else', SLOW, async () => {
  await saveOptions({ mode: 'sites', sites: 'youtube.com, facebook.com' });
  await page.goto('https://github.com/');
  await strip(page).waitFor({ state: 'attached', timeout: 10_000 });
  await expectNoMoment(page, 'unlisted site');
  await page.goto('https://www.youtube.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await shot(page, '06-moment-on-listed-site');
  await page.mouse.click(640, 360);
  await moment(page).waitFor({ state: 'detached', timeout: 5_000 });
  await page.bringToFront();
  await sleep(600);
  assert.equal(await moment(page).count(), 0, 'the same page must not show it again on focus');
  await page.reload();
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
  await page.goto('https://www.facebook.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
  const s = await state();
  assert.equal(s['lastMoment'], undefined, 'the sites mode must not claim the day');
  const hidden = await context.newPage();
  await hidden.goto('https://www.youtube.com/');
  await hidden.close();
});

test('a moment left on screen for three seconds counts as seen', SLOW, async () => {
  await saveOptions({ mode: 'daily' });
  await resetDay();
  await page.goto('https://www.youtube.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(3_400);
  await page.goto('https://www.facebook.com/');
  await expectNoMoment(page, 'after three seconds on screen');
});

test('a moment that flashes for under a second is released to the next page', SLOW, async () => {
  await resetDay();
  await page.goto('https://www.youtube.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.goto('https://www.facebook.com/');
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
});

test('a page that redirects on arrival does not eat the day', SLOW, async () => {
  await resetDay();
  await page.goto('https://old.example/');
  await page.waitForURL('https://new.example/', { timeout: 10_000 });
  await moment(page).waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
});

test('the popup shows the numbers', SLOW, async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const now = new Date();
  const life = computeLife(parseBirth(BIRTH, now), now);
  await popup.locator('#ready').waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await popup.locator('#left').textContent(), formatInt(life.left));
  assert.equal(await popup.locator('#line').textContent(), momentLine(life));
  assert.equal(await popup.locator('#strip').isChecked(), true);
  await popup.setViewportSize({ width: 260, height: 240 });
  await shot(popup, '07-popup');
  await popup.close();
});

// [DEBUG-rd01] Throwaway loop for the redirect bug. Each iteration replays the
// two e2e tests that precede the failing one closely enough to matter (a
// countdown that flashes and is released to the next page), then the failing
// scenario: old.example redirects to new.example and the countdown must appear
// on new.example. Console output of the worker and the pages is kept and
// printed on failure, together with the worker's storage. On GitHub Actions
// the results are also emitted as annotations, which are readable without a
// login. Run from extension/: node scripts/debug-redirect-loop.ts [iterations]
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const DIST = resolve(import.meta.dirname, '../dist');
const N = Number(process.argv[2] ?? 30);
const VIEWPORT = { width: 1280, height: 720 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onCi = process.env['GITHUB_ACTIONS'] === 'true';

function fakeSite(host: string): string {
  const redirect = host === 'old.example' ? '<script>location.replace("https://new.example/")</script>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${host}</title>${redirect}
<style>body{margin:0;font:16px sans-serif;background:#fff}header{position:fixed;top:0;left:0;right:0;height:40px;background:#dddddd}</style>
</head><body><header>${host}</header><main style="padding:60px 20px"><h1>${host}</h1><input id="q" aria-label="q"></main></body></html>`;
}

const userDataDir = mkdtempSync(join(tmpdir(), 'fd-redirect-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  viewport: VIEWPORT,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const log: string[] = [];
context.on('console', (m) => {
  if (m.text().includes('[DEBUG-rd01]')) log.push(`${Date.now() % 100000} ${m.text().replace('[DEBUG-rd01] ', '')}`);
});
await context.route(/^https?:\/\//, (route) => {
  const host = new URL(route.request().url()).hostname;
  void route.fulfill({ status: 200, contentType: 'text/html', body: fakeSite(host) });
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });

let options: Page | undefined;
for (let i = 0; i < 150 && !options; i++) {
  options = context.pages().find((p) => p.url().includes('options.html'));
  if (!options) await sleep(100);
}
if (!options) throw new Error('no options page');
await options.fill('#birth', '2001-06-29');
await options.click('button[type=submit]');
await options.locator('#status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 5_000 });
await sleep(400);
const opts = options;
const resetDay = () => opts.evaluate(() => chrome.storage.local.clear());
const dump = async () => ({
  local: await opts.evaluate(() => chrome.storage.local.get(null)),
  session: await opts.evaluate(() => chrome.storage.session.get(null)),
});
const annotate = (level: 'warning' | 'error', text: string) => {
  if (onCi) console.log(`::${level}::${text.replace(/\n/g, ' | ').slice(0, 3800)}`);
};

const page = await context.newPage();
const countdown = page.locator('final-days-countdown');
let failures = 0;
for (let i = 1; i <= N; i++) {
  // The flash test, as in the suite.
  await resetDay();
  await page.goto('https://www.youtube.com/');
  await countdown.waitFor({ state: 'visible', timeout: 10_000 });
  await page.goto('https://www.facebook.com/');
  await countdown.waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.click(640, 360);
  await countdown.waitFor({ state: 'detached', timeout: 5_000 });

  // The redirect test.
  log.length = 0;
  await resetDay();
  await page.goto('https://old.example/');
  await page.waitForURL('https://new.example/', { timeout: 10_000 });
  try {
    await countdown.waitFor({ state: 'visible', timeout: 4_000 });
    await page.mouse.click(640, 360);
    await countdown.waitFor({ state: 'detached', timeout: 5_000 });
  } catch {
    failures++;
    await sleep(500); // let late messages land in the log
    const report = `iteration ${i} FAILED\nstorage ${JSON.stringify(await dump())}\n${log.join('\n')}`;
    console.log(`[DEBUG-rd01] ${report}`);
    if (failures <= 4) annotate('error', report);
  }
}
const summary = `[DEBUG-rd01] ${failures} failures in ${N} iterations`;
console.log(summary);
annotate('warning', summary);
if (failures === 0) {
  console.log(`[DEBUG-rd01] last passing trace:\n${log.join('\n')}`);
  annotate('warning', `last passing trace\n${log.join('\n')}`);
}
await context.close();
rmSync(userDataDir, { recursive: true, force: true });

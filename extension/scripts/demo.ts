// Records the demo media of the countdown: a short video, an animated GIF for
// the README and a 1280x800 screenshot (the size the Chrome Web Store wants).
// It drives the built extension in Playwright's Chromium exactly like the e2e
// harness does (extension/e2e/extension.test.ts): every https request is
// answered with a fake article page, so nothing touches the network.
//
// Run from extension/:   npm run build && npm run demo
// Output:                design/demo/ (override with FD_DEMO_OUT)
// Date of birth shown:   FD_DEMO_BIRTH, default 2000-01-01
// Music for the mp4:     FD_DEMO_MUSIC, default design/demo/music/contemplation.mp3
// ffmpeg:                FD_FFMPEG, else ffmpeg on PATH, else the ffmpeg-static package
//
// The video is one take: the article is on screen for two seconds, the user
// "comes back" to the tab, the countdown takes over, holds for four seconds,
// a click dismisses it and the article is usable again for two seconds.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const DIST = resolve(import.meta.dirname, '../dist');
const OUT = resolve(import.meta.dirname, process.env['FD_DEMO_OUT'] ?? '../../design/demo');
const BIRTH = process.env['FD_DEMO_BIRTH'] ?? '2000-01-01';
const MUSIC = process.env['FD_DEMO_MUSIC'] ?? join(OUT, 'music', 'contemplation.mp3');
const SIZE = { width: 1280, height: 800 };

/** How long each beat of the take lasts, in ms. */
const BEAT = { article: 2000, countdown: 4000, after: 2000 };
/** The GIF is scaled down to this width to stay small; the videos keep the full size. */
const GIF_WIDTH = 800;
const GIF_FPS = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the fake site --------------------------------------------------------

function article(): string {
  const p = (text: string) => `<p>${text}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Ledger</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:17px/1.6 Georgia,"Times New Roman",serif;color:#1f2937;background:#fff}
nav{position:sticky;top:0;display:flex;align-items:center;gap:28px;height:56px;padding:0 40px;border-bottom:1px solid #e5e7eb;background:#fff;font:14px system-ui,sans-serif}
nav .logo{font:700 22px Georgia,serif;letter-spacing:-.02em;color:#111827;margin-right:12px}
nav a{color:#374151;text-decoration:none}
nav .grow{flex:1}
nav input{width:220px;height:34px;border:1px solid #d1d5db;border-radius:17px;padding:0 14px;font:inherit}
nav button{height:34px;padding:0 16px;border:0;border-radius:17px;background:#111827;color:#fff;font:inherit;font-weight:600}
main{display:grid;grid-template-columns:minmax(0,680px) 300px;gap:56px;max-width:1080px;margin:0 auto;padding:40px 40px 80px}
.kicker{font:600 13px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#2563eb}
h1{font-size:40px;line-height:1.15;letter-spacing:-.02em;margin:10px 0 14px;color:#111827}
.by{font:14px system-ui,sans-serif;color:#6b7280;margin-bottom:24px}
.hero{height:280px;border-radius:8px;margin-bottom:28px;background:linear-gradient(135deg,#dbeafe 0%,#e0e7ff 45%,#fce7f3 100%)}
blockquote{margin:28px 0;padding-left:20px;border-left:3px solid #2563eb;font-size:22px;line-height:1.4;color:#111827}
aside{font:14px system-ui,sans-serif}
aside h3{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:6px 0 14px}
aside ol{margin:0 0 32px;padding:0;list-style:none;counter-reset:n}
aside li{counter-increment:n;display:flex;gap:14px;padding:12px 0;border-top:1px solid #e5e7eb;line-height:1.4;color:#1f2937}
aside li::before{content:counter(n);font:700 22px Georgia,serif;color:#d1d5db;min-width:22px}
.box{padding:20px;border-radius:8px;background:#f3f4f6}
.box strong{display:block;font-size:16px;margin-bottom:6px;color:#111827}
.box input{width:100%;height:36px;margin-top:12px;border:1px solid #d1d5db;border-radius:6px;padding:0 12px;font:inherit}
</style></head><body>
<nav><span class="logo">The Ledger</span><a href="#">Technology</a><a href="#">Culture</a><a href="#">Science</a><a href="#">Ideas</a><span class="grow"></span><input placeholder="Search" aria-label="Search"><button type="button">Subscribe</button></nav>
<main>
<article>
<div class="kicker">Ideas</div>
<h1>The quiet return of the personal website</h1>
<div class="by">By Mara Ellison &middot; 6 min read</div>
<div class="hero"></div>
${p('For a decade the personal website looked like a relic. Everything that mattered seemed to happen on three or four platforms, and a page of your own felt like a garden nobody would ever walk past. Then, slowly, people started planting again.')}
${p('The reasons are practical as much as sentimental. Feeds reorder themselves, accounts get locked, and a post that took an evening to write can vanish in a redesign. A page you host yourself does not change unless you change it. It is slow in the best sense of the word.')}
<blockquote>&ldquo;I wanted one place on the internet that would still say the same thing next year.&rdquo;</blockquote>
${p('The new sites are smaller than the old ones. A short list of projects, a page of notes, a few photographs, an address for people who want to write back. Nobody is optimising for reach. The point is to have somewhere to put things down.')}
${p('That modesty is what makes them readable. Without a feed there is nothing to scroll, so you read what is in front of you and then you leave. It is a strange feeling at first, like walking out of a shop without being asked to sign up for anything.')}
${p('Whether the trend lasts is anyone&rsquo;s guess. But the tools have never been cheaper, the hosting has never been simpler, and the reason to want a corner of your own has never really gone away.')}
</article>
<aside>
<h3>Most read</h3>
<ol>
<li>What a week without notifications taught me about attention</li>
<li>The slow rise of the four-day week, in numbers</li>
<li>Why the best engineers still keep a paper notebook</li>
<li>A field guide to reading more than one book at a time</li>
<li>How cities are quietly redesigning their nights</li>
</ol>
<div class="box"><strong>The morning letter</strong>One good read a day, before your coffee gets cold.<input placeholder="Email address" aria-label="Email address"></div>
</aside>
</main></body></html>`;
}

// ---- the take -------------------------------------------------------------

let context: BrowserContext;

async function waitForPage(match: (p: Page) => boolean, timeoutMs = 15_000): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = context.pages().find(match);
    if (found) return found;
    await sleep(100);
  }
  throw new Error('page not found: ' + context.pages().map((p) => p.url()).join(', '));
}

const countdown = (page: Page) => page.locator('final-days-countdown');

/** The user comes back to the tab: it becomes visible and its window gains focus. */
async function comeBack(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

interface Take {
  /** The raw recording Playwright wrote. */
  webm: string;
  /** Length of the take in seconds, from the recording start to the end of the last beat. */
  seconds: number;
}

async function record(): Promise<Take> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'final-days-demo-'));
  const videoDir = join(userDataDir, 'video');
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      viewport: SIZE,
      recordVideo: { dir: videoDir, size: SIZE },
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await context.route(/^https?:\/\//, (route) => {
      void route.fulfill({ status: 200, contentType: 'text/html', body: article() });
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });

    // The options page opens on install: set the date of birth there.
    const options = await waitForPage((p) => p.url().includes('options.html'));
    await options.fill('#birth', BIRTH);
    await options.click('button[type=submit]');
    await options.locator('#status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 5_000 });
    await sleep(400);

    // Claim today on a warm-up page, so the demo page opens without a countdown
    // and we can bring it on at the moment we choose.
    const warmUp = await context.newPage();
    await warmUp.goto('https://the-ledger.example/');
    await countdown(warmUp).waitFor({ state: 'visible', timeout: 10_000 });
    await warmUp.mouse.click(640, 400);
    await countdown(warmUp).waitFor({ state: 'detached', timeout: 5_000 });
    await warmUp.close();

    // The take. Recording starts when the page is created.
    const page = await context.newPage();
    const started = Date.now();
    await page.goto('https://the-ledger.example/ideas/personal-websites');
    await page.locator('h1').waitFor({ timeout: 10_000 });
    await sleep(BEAT.article);
    if ((await countdown(page).count()) !== 0) throw new Error('the countdown came early');

    // Give the day back, then come back to the tab: the countdown takes over.
    await options.evaluate(() => chrome.storage.local.clear());
    await sleep(200);
    await comeBack(page);
    await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(BEAT.countdown / 2);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, 'countdown-1280x800.png') });
    await sleep(BEAT.countdown / 2);

    await page.mouse.click(640, 400);
    await countdown(page).waitFor({ state: 'detached', timeout: 5_000 });
    await sleep(BEAT.after);
    const seconds = (Date.now() - started) / 1000;

    const video = page.video();
    if (!video) throw new Error('no video was recorded');
    await page.close();
    const recorded = await video.path();
    await context.close();
    const webm = join(OUT, 'demo.webm');
    copyFileSync(recorded, webm);
    return { webm, seconds };
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

// ---- encoding -------------------------------------------------------------

function findFfmpeg(): string {
  const fromEnv = process.env['FD_FFMPEG'];
  if (fromEnv) return fromEnv;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    // not on PATH
  }
  try {
    const bin = createRequire(import.meta.url)('ffmpeg-static') as string | null;
    if (bin) return bin;
  } catch {
    // not installed
  }
  throw new Error('ffmpeg not found: install it, add the ffmpeg-static package, or set FD_FFMPEG');
}

function ffmpeg(bin: string, args: string[]): void {
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function encode(take: Take): string[] {
  const bin = findFfmpeg();
  const mp4 = join(OUT, 'demo.mp4');
  const gif = join(OUT, 'demo.gif');
  const made = [take.webm, mp4, gif];

  // A plain H.264 mp4 that every player and every chat app accepts.
  ffmpeg(bin, [
    '-i', take.webm,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an',
    mp4,
  ]);

  // The GIF for the README: fewer frames, a smaller picture and a palette built
  // from the frames themselves so the dark page and the big number stay crisp.
  ffmpeg(bin, [
    '-i', mp4,
    '-vf',
    `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop', '0',
    gif,
  ]);

  // The same mp4 with a music bed, fading out over the last two seconds.
  if (existsSync(MUSIC)) {
    const withMusic = join(OUT, 'demo-music.mp4');
    const fadeOutAt = Math.max(0, take.seconds - 2).toFixed(2);
    ffmpeg(bin, [
      '-i', mp4, '-i', MUSIC,
      '-filter_complex', `[1:a]afade=t=in:d=1.5,afade=t=out:st=${fadeOutAt}:d=2,volume=0.8[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      withMusic,
    ]);
    made.push(withMusic);
  } else {
    console.log(`no music file at ${MUSIC}; skipping demo-music.mp4`);
  }
  return made;
}

const take = await record();
const files = [...encode(take), join(OUT, 'countdown-1280x800.png')];
for (const f of files) console.log(`${(statSync(f).size / 1024).toFixed(0).padStart(6)} KB  ${f}`);

// Records the demo media of the extension: a short video, an animated GIF for
// the README and a 1280x800 screenshot (the size the Chrome Web Store wants).
// It drives the built extension in Playwright's Chromium exactly like the e2e
// harness does (extension/e2e/extension.test.ts): every https request is
// answered with a fake page that looks like the site asked for, so nothing
// touches the network.
//
// Run from extension/:   npm run build && npm run demo
// Output:                design/demo/ (override with FD_DEMO_OUT)
// Date of birth shown:   FD_DEMO_BIRTH, default 2000-01-01
// Music for the mp4:     FD_DEMO_MUSIC, default design/demo/music/contemplation.mp3
// ffmpeg:                FD_FFMPEG, else ffmpeg on PATH, else the ffmpeg-static package
//
// The video tells the whole story in three beats, each in its own tab:
//   1. the options page: the date of birth is typed in, "every time you open
//      one of these sites" is chosen, instagram.com and youtube.com are listed,
//      Save;
//   2. instagram.com opens, the countdown takes over, a click dismisses it;
//   3. youtube.com opens, the same again.
// Playwright records each tab as its own clip, page only. A browser frame (tab
// strip and address bar) is drawn over each clip, so the viewer sees which
// site is open, and the clips are joined. One frame per clip means nothing
// depends on timing: Playwright's recordings do not keep exact wall-clock time.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const DIST = resolve(import.meta.dirname, '../dist');
const OUT = resolve(import.meta.dirname, process.env['FD_DEMO_OUT'] ?? '../../design/demo');
const BIRTH = process.env['FD_DEMO_BIRTH'] ?? '2000-01-01';
const MUSIC = process.env['FD_DEMO_MUSIC'] ?? join(OUT, 'music', 'contemplation.mp3');
const SITES = 'instagram.com, youtube.com';

/** The page area of the video. The browser frame drawn above it makes the video 1280x800. */
const PAGE = { width: 1280, height: 720 };
const FRAME_HEIGHT = 80;
/** The Chrome Web Store screenshot. */
const STORE = { width: 1280, height: 800 };

/** How long each beat of the take lasts, in ms. */
// Each clip runs about 1.5 s past its last beat (the recorder's tail), so the holds are short.
const BEAT = { settle: 700, saved: 900, countdown: 3000, page: 900 };
/** Typing speed on the options page, ms per key. */
const KEY_DELAY = 80;
/** The GIF is scaled down to this width to stay small; the videos keep the full size. */
const GIF_WIDTH = 800;
const GIF_FPS = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the fake sites -------------------------------------------------------

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** A stand-in for a photo or thumbnail: a soft gradient, different per index. */
const tile = (i: number) =>
  `background:linear-gradient(${135 + i * 40}deg,hsl(${(i * 47) % 360} 70% 82%),hsl(${(i * 47 + 60) % 360} 60% 72%))`;

/** A photo feed, the shape of instagram.com. */
function feed(): string {
  const names = ['lena.explores', 'tomasz_k', 'the.morning.run', 'ana.bakes', 'kai_outdoors'];
  const captions = [
    'Golden hour on the pier. Ten more minutes and it was gone.',
    'First long ride of the season. Legs are filing a complaint.',
    '5:40 am. Nobody else on the path, just the fog.',
    'Sourdough, attempt nine. This one finally has ears.',
    'The lake was glass this morning.',
  ];
  const post = (i: number) => `<article class="post">
<div class="head"><span class="avatar" style="${tile(i + 9)}"></span><b>${names[i]}</b><span class="dot">&middot;</span><span class="when">${2 + i * 3}h</span></div>
<div class="photo" style="${tile(i)}"></div>
<div class="acts"><span>&#9825;</span><span>&#9675;</span><span>&#8599;</span></div>
<div class="likes">${(1_204 + i * 517).toLocaleString('en-US')} likes</div>
<div class="cap"><b>${names[i]}</b> ${captions[i]}</div>
<div class="more">View all ${18 + i * 7} comments</div>
</article>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Instagram</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.4 ${FONT};color:#262626;background:#fff}
.rail{position:fixed;top:0;bottom:0;left:0;width:240px;border-right:1px solid #dbdbdb;padding:28px 12px}
.rail .brand{font:600 22px ${FONT};padding:8px 12px 30px;letter-spacing:-.01em}
.rail a{display:flex;align-items:center;gap:16px;padding:12px;border-radius:8px;color:#262626;text-decoration:none;font-size:16px}
.rail a.on{font-weight:700}.rail i{display:inline-block;width:24px;height:24px;border:2px solid #262626;border-radius:6px}
.rail a.on i{background:#262626}
.stories{display:flex;gap:18px;padding:18px 0 10px}.story{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:#262626}
.story span{width:62px;height:62px;border-radius:50%;padding:3px;background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)}
.story span i{display:block;width:100%;height:100%;border-radius:50%;border:2px solid #fff}
main{margin-left:240px;display:flex;justify-content:center;gap:64px;padding:0 20px}
.col{width:470px}
.post{padding:12px 0 18px;border-bottom:1px solid #efefef}
.head{display:flex;align-items:center;gap:10px;padding:0 0 10px}.avatar{width:32px;height:32px;border-radius:50%}
.dot,.when{color:#737373}
.photo{width:100%;height:470px;border-radius:4px}
.acts{display:flex;gap:16px;padding:12px 0 8px;font-size:22px}
.likes{font-weight:600;margin-bottom:6px}.more{color:#737373;margin-top:6px}
aside{width:320px;padding-top:26px;font-size:14px}
aside .me{display:flex;align-items:center;gap:12px;margin-bottom:22px}aside .me span{width:44px;height:44px;border-radius:50%}
aside .me b{display:block}aside .me small{color:#737373}
aside h4{margin:0 0 12px;color:#737373;font-size:14px}
aside .s{display:flex;align-items:center;gap:12px;margin-bottom:14px}aside .s span{width:32px;height:32px;border-radius:50%}
aside .s b{display:block;font-size:13px}aside .s small{color:#737373;font-size:12px}aside .s em{margin-left:auto;font-style:normal;color:#0095f6;font-weight:600;font-size:12px}
</style></head><body>
<nav class="rail"><div class="brand">Feed</div>
<a class="on" href="#"><i></i>Home</a><a href="#"><i></i>Search</a><a href="#"><i></i>Explore</a><a href="#"><i></i>Reels</a><a href="#"><i></i>Messages</a><a href="#"><i></i>Notifications</a><a href="#"><i></i>Create</a><a href="#"><i></i>Profile</a></nav>
<main><div class="col">
<div class="stories">${['you', 'lena', 'tomasz', 'ana', 'kai', 'mira', 'jonah'].map((n, i) => `<div class="story"><span><i style="${tile(i + 3)}"></i></span>${n}</div>`).join('')}</div>
${[0, 1, 2, 3, 4].map(post).join('')}
</div>
<aside><div class="me"><span style="${tile(20)}"></span><div><b>you</b><small>Your name</small></div></div>
<h4>Suggested for you</h4>
${['mira.paints', 'jonah.codes', 'studio.44', 'north.trails', 'cafe.lumen'].map((n, i) => `<div class="s"><span style="${tile(i + 12)}"></span><div><b>${n}</b><small>Followed by ${names[i]}</small></div><em>Follow</em></div>`).join('')}
</aside></main></body></html>`;
}

/** A grid of videos, the shape of youtube.com. */
function videos(): string {
  const titles = [
    ['How I planned a whole year in one afternoon', 'Ordinary Hours', '412K views', '3 days ago', '12:48'],
    ['We cycled the length of the coast (and it rained)', 'Two Wheels North', '1.2M views', '1 week ago', '24:05'],
    ['The 20 minute sourdough method', 'Ana Bakes', '88K views', '2 days ago', '9:31'],
    ['A quiet morning routine, no music', 'Slow Kitchen', '2.3M views', '5 months ago', '18:12'],
    ['Why the best notebooks are the cheap ones', 'Desk Notes', '316K views', '1 month ago', '8:04'],
    ['Lo-fi for reading, 2 hours', 'Lumen Radio', '9.7M views', '1 year ago', '2:00:41'],
    ['I built a tiny cabin with hand tools', 'Kai Outdoors', '5.1M views', '3 weeks ago', '31:20'],
    ['Learning to swim at 34', 'Mira P.', '204K views', '6 days ago', '15:57'],
    ['The city at 5 am, walking tour', 'Early Streets', '640K views', '2 weeks ago', '42:10'],
  ];
  const card = (t: string[], i: number) => `<div class="card"><div class="thumb" style="${tile(i)}"><span>${t[4]}</span></div>
<div class="meta"><span class="av" style="${tile(i + 5)}"></span><div><b>${t[0]}</b><small>${t[1]}</small><small>${t[2]} &middot; ${t[3]}</small></div></div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>YouTube</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.4 ${FONT};color:#0f0f0f;background:#fff}
header{position:sticky;top:0;display:flex;align-items:center;height:56px;padding:0 16px;background:#fff;z-index:1}
header .menu{width:18px;height:2px;background:#0f0f0f;box-shadow:0 -6px 0 #0f0f0f,0 6px 0 #0f0f0f;margin:0 22px 0 6px}
header .brand{font-weight:700;font-size:20px;letter-spacing:-.03em;display:flex;align-items:center;gap:6px}
header .brand i{width:28px;height:20px;border-radius:6px;background:#f00;display:inline-block}
header .search{margin:0 auto;display:flex}
header input{width:520px;height:40px;border:1px solid #ccc;border-radius:20px 0 0 20px;padding:0 16px;font:inherit;font-size:16px}
header button{width:64px;border:1px solid #ccc;border-left:0;border-radius:0 20px 20px 0;background:#f8f8f8}
header .sign{border:1px solid #ddd;border-radius:18px;padding:7px 14px;color:#065fd4;font-weight:600}
.rail{position:fixed;top:56px;bottom:0;left:0;width:72px;padding-top:4px}
.rail div{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0;font-size:10px}
.rail i{width:24px;height:24px;border:2px solid #0f0f0f;border-radius:6px}.rail div:first-child i{background:#0f0f0f}
.chips{display:flex;gap:12px;padding:12px 0 20px 96px}
.chips span{padding:7px 12px;border-radius:8px;background:#f2f2f2;font-weight:500}.chips span:first-child{background:#0f0f0f;color:#fff}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px 16px;padding:0 24px 40px 96px}
.thumb{position:relative;aspect-ratio:16/9;border-radius:12px}
.thumb span{position:absolute;right:8px;bottom:8px;padding:2px 5px;border-radius:4px;background:rgba(0,0,0,.8);color:#fff;font-size:12px;font-weight:600}
.meta{display:flex;gap:12px;padding-top:12px}.av{width:36px;height:36px;border-radius:50%;flex:none}
.meta b{display:block;font-size:15px;line-height:1.3;margin-bottom:4px}.meta small{display:block;color:#606060;font-size:13px}
</style></head><body>
<header><span class="menu"></span><span class="brand"><i></i>Video</span><div class="search"><input placeholder="Search" aria-label="Search"><button type="button">&#9906;</button></div><span class="sign">Sign in</span></header>
<nav class="rail"><div><i></i>Home</div><div><i></i>Shorts</div><div><i></i>Subscriptions</div><div><i></i>You</div></nav>
<div class="chips">${['All', 'Music', 'Cycling', 'Baking', 'Live', 'Podcasts', 'Gaming', 'Recently uploaded', 'Watched'].map((c) => `<span>${c}</span>`).join('')}</div>
<div class="grid">${titles.map(card).join('')}</div>
</body></html>`;
}

/** Any other site: a plain article. */
function article(host: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${host}</title><style>
body{margin:0;font:17px/1.6 Georgia,serif;color:#1f2937;background:#fff}main{max-width:680px;margin:0 auto;padding:60px 40px}
h1{font-size:40px;line-height:1.15;color:#111827}</style></head><body><main><h1>${host}</h1>
<p>For a decade the personal website looked like a relic. Then, slowly, people started planting again.</p></main></body></html>`;
}

function site(host: string): string {
  if (host.endsWith('instagram.com')) return feed();
  if (host.endsWith('youtube.com')) return videos();
  return article(host);
}

// ---- the browser frame ----------------------------------------------------

/** A tab strip and address bar, drawn over the top of the recorded page. */
function browserFrame(title: string, url: string, iconDataUri: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:${PAGE.width}px;height:${FRAME_HEIGHT}px;font:13px ${FONT};color:#1f1f1f;background:#dfe3e8;overflow:hidden}
.tabs{display:flex;align-items:flex-end;height:40px;padding:0 8px}
.tab{display:flex;align-items:center;gap:8px;height:34px;width:240px;padding:0 14px;border-radius:8px 8px 0 0;background:#fff;font-size:12.5px;white-space:nowrap}
.tab i{width:14px;height:14px;border-radius:3px;background:#0b0d12;flex:none}
.tab b{font-weight:400;overflow:hidden;text-overflow:ellipsis}
.tab span{margin-left:auto;color:#5f6368}
.plus{padding:0 12px 8px;font-size:18px;color:#5f6368}
.bar{display:flex;align-items:center;gap:6px;height:40px;padding:0 10px;background:#fff}
.bar .g{width:28px;height:28px;display:grid;place-items:center;color:#5f6368;font-size:16px;border-radius:50%}
.omni{flex:1;display:flex;align-items:center;gap:8px;height:30px;margin:0 8px;padding:0 14px;border-radius:15px;background:#f1f3f4;font-size:13.5px;color:#1f1f1f}
.omni .lock{width:9px;height:9px;border:1.5px solid #5f6368;border-radius:2px;position:relative}
.omni .lock::before{content:"";position:absolute;left:1px;top:-5px;width:4px;height:5px;border:1.5px solid #5f6368;border-bottom:0;border-radius:3px 3px 0 0}
.omni .dim{color:#5f6368}
.ext{width:28px;height:28px;display:grid;place-items:center}.ext img{width:18px;height:18px}
.win{margin-left:auto;display:flex;gap:18px;padding:0 6px 8px 24px;color:#5f6368;font-size:13px}
</style></head><body>
<div class="tabs"><div class="tab"><i></i><b>${title}</b><span>&times;</span></div><span class="plus">+</span><span class="win"><span>&#8212;</span><span>&#9633;</span><span>&times;</span></span></div>
<div class="bar"><span class="g">&#8592;</span><span class="g">&#8594;</span><span class="g">&#8635;</span>
<div class="omni"><span class="lock"></span><span>${url}</span></div>
<span class="ext"><img src="${iconDataUri}" alt=""></span><span class="g">&#9776;</span><span class="g">&#8942;</span></div>
</body></html>`;
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

/** The date as typed into a date input under the en-US locale: month, day, year. */
function keysFor(birth: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) throw new Error(`FD_DEMO_BIRTH must be YYYY-MM-DD, got ${birth}`);
  return `${m[2]}${m[3]}${m[1]}`;
}

/** One recorded tab and the browser frame to draw over it. */
interface Clip {
  webm: string;
  frame: string;
}

async function countdownBeat(page: Page): Promise<void> {
  await countdown(page).waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(BEAT.countdown);
  await page.mouse.click(640, 360);
  await countdown(page).waitFor({ state: 'detached', timeout: 5_000 });
  await sleep(BEAT.page);
}

/** Closes a recorded tab and returns its recording. */
async function wrap(page: Page): Promise<string> {
  const video = page.video();
  if (!video) throw new Error('no video was recorded');
  await page.close();
  return video.path();
}

async function record(work: string): Promise<Clip[]> {
  const userDataDir = join(work, 'profile');
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    viewport: PAGE,
    recordVideo: { dir: join(work, 'video'), size: PAGE },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await context.route(/^https?:\/\//, (route) => {
    const host = new URL(route.request().url()).hostname;
    void route.fulfill({ status: 200, contentType: 'text/html', body: site(host) });
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  // The options page opens by itself on install; the take opens its own.
  await (await waitForPage((p) => p.url().includes('options.html'))).close();

  // The browser frames, one per clip.
  const icon = `data:image/png;base64,${readFileSync(join(DIST, 'icons', 'icon-32.png')).toString('base64')}`;
  const framePage = await context.newPage();
  await framePage.setViewportSize({ width: PAGE.width, height: FRAME_HEIGHT });
  const frame = async (name: string, title: string, url: string): Promise<string> => {
    await framePage.setContent(browserFrame(title, url, icon));
    const png = join(work, `frame-${name}.png`);
    await framePage.screenshot({ path: png });
    return png;
  };
  const frames = {
    options: await frame('options', 'Final Days · Options', optionsUrl),
    instagram: await frame('instagram', 'Instagram', 'instagram.com'),
    youtube: await frame('youtube', 'YouTube', 'youtube.com'),
  };
  await framePage.close();

  const clips: Clip[] = [];

  // 1. The options page.
  let page = await context.newPage();
  await page.goto(optionsUrl);
  await page.locator('#birth').waitFor({ timeout: 10_000 });
  await sleep(BEAT.settle);
  await page.focus('#birth');
  await page.keyboard.type(keysFor(BIRTH), { delay: KEY_DELAY });
  if ((await page.inputValue('#birth')) !== BIRTH) throw new Error('the date of birth did not type in as expected');
  await sleep(BEAT.settle);
  if (!(await page.isChecked('#countdown'))) await page.click('#countdown');
  await page.click('#mode-sites');
  await sleep(BEAT.settle / 2);
  await page.focus('#sites');
  await page.keyboard.type(SITES, { delay: KEY_DELAY });
  await sleep(BEAT.settle);
  await page.click('button[type=submit]');
  await page.locator('#status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 5_000 });
  await sleep(BEAT.saved);
  clips.push({ webm: await wrap(page), frame: frames.options });

  // 2. instagram.com: the countdown, a click, the feed.
  page = await context.newPage();
  await page.goto('https://www.instagram.com/');
  await countdownBeat(page);
  clips.push({ webm: await wrap(page), frame: frames.instagram });

  // 3. youtube.com: the same again.
  page = await context.newPage();
  await page.goto('https://www.youtube.com/');
  await countdownBeat(page);
  clips.push({ webm: await wrap(page), frame: frames.youtube });

  // The store screenshot: the countdown alone, at the store's size.
  mkdirSync(OUT, { recursive: true });
  const shot = await context.newPage();
  await shot.setViewportSize(STORE);
  await shot.goto('https://www.instagram.com/');
  await countdown(shot).waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(300);
  await shot.screenshot({ path: join(OUT, 'countdown-1280x800.png') });
  await shot.close();

  await context.close();
  return clips;
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

/** Length of a media file in seconds, read from ffmpeg's own report of it. */
function seconds(bin: string, file: string): number {
  let report = '';
  try {
    execFileSync(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    report = String((e as { stderr?: Buffer }).stderr ?? '');
  }
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  if (!m) throw new Error(`could not read the length of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function encode(clips: Clip[]): string[] {
  const bin = findFfmpeg();
  const mp4 = join(OUT, 'demo.mp4');
  const gif = join(OUT, 'demo.gif');
  const made = [mp4, gif];

  // Each clip under its browser frame, joined into one plain H.264 mp4 that
  // every player and every chat app accepts.
  const inputs = clips.flatMap((c) => ['-i', c.webm, '-i', c.frame]);
  const framed = clips.map(
    (_, i) =>
      `[${2 * i}:v]pad=${PAGE.width}:${PAGE.height + FRAME_HEIGHT}:0:${FRAME_HEIGHT}:color=white[p${i}];[p${i}][${2 * i + 1}:v]overlay=0:0[c${i}]`,
  );
  const graph = `${framed.join(';')};${clips.map((_, i) => `[c${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[v]`;
  ffmpeg(bin, [
    ...inputs,
    '-filter_complex', graph, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an',
    mp4,
  ]);
  const length = seconds(bin, mp4);
  console.log(`video: ${length.toFixed(1)} s`);

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
    const fadeOutAt = Math.max(0, length - 2).toFixed(2);
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

const work = mkdtempSync(join(tmpdir(), 'final-days-demo-'));
try {
  const clips = await record(work);
  const files = [...encode(clips), join(OUT, 'countdown-1280x800.png')];
  for (const f of files) console.log(`${(statSync(f).size / 1024).toFixed(0).padStart(6)} KB  ${f}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

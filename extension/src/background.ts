// Background service worker: the single place that reads settings, computes
// the numbers, decides whether today's countdown is due, and keeps the toolbar
// icon current. Content scripts ask it for everything they show.
import { computeLife, countdownLine, formatInt, localDateString, question, siteListed, type Life } from './life.ts';
import {
  REMOVED_SYNC_KEYS,
  RENAMED_LOCAL_KEYS,
  RENAMED_SYNC_KEYS,
  loadSettings,
  migrateRenamedKeys,
  resolveSettings,
} from './settings.ts';

const COUNTDOWN_FOOTER = 'click anywhere to continue';
/** Spec: the countdown may show on return from at least five minutes without input. */
const IDLE_SECONDS = 300;

chrome.idle.setDetectionInterval(IDLE_SECONDS);

/** Stored values under their current key names. Every read of settings or state in this worker waits for it. */
const storageReady: Promise<void> = Promise.all([
  migrateRenamedKeys(chrome.storage.sync, RENAMED_SYNC_KEYS),
  migrateRenamedKeys(chrome.storage.local, RENAMED_LOCAL_KEYS),
]).then(
  () => undefined,
  (err: unknown) => console.warn('Final Days: storage migration failed', err),
);

chrome.runtime.onInstalled.addListener(() => {
  void firstRun();
});
chrome.runtime.onStartup.addListener(() => {
  void refreshAction();
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') void refreshAction();
});
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') void onReturn();
});
chrome.runtime.onMessage.addListener((message: FdMessage, sender, sendResponse) => {
  if (message?.type === 'countdownLost') {
    void releaseCountdown(message.doc, message.token);
    return false;
  }
  if (message?.type === 'pageRestored') {
    void forgetAbandoned(message.doc);
    return false;
  }
  if (message?.type !== 'hello') return false;
  hello(message, sender).then(sendResponse, (err: unknown) => {
    console.error('Final Days: hello failed', err);
    sendResponse(undefined);
  });
  return true; // the reply is asynchronous
});

void refreshAction();

/** On install, update or reload: drops retired settings and opens the options page until a date of birth has been set. */
async function firstRun(): Promise<void> {
  await storageReady;
  await chrome.storage.sync.remove([...REMOVED_SYNC_KEYS]);
  const settings = await loadSettings();
  if (settings.birth === '') await chrome.runtime.openOptionsPage();
  await refreshAction();
}

async function hello(message: HelloMessage, sender: chrome.runtime.MessageSender): Promise<HelloReply> {
  const now = new Date();
  const today = localDateString(now);
  if (today !== actionDate) void refreshAction(); // a long-lived worker crossed midnight
  await storageReady;
  const settings = await loadSettings();
  const resolved = resolveSettings(settings, now);
  if (!resolved) return { countdown: null, countdownDoneFor: today };

  const life = computeLife(resolved.birth, now);

  // Only a page can show the countdown, so only messages from a tab count. In the
  // sites mode every load of a listed site shows it and nothing is claimed; in
  // the daily mode the first page to ask claims the day. A forced show works
  // anywhere in either mode.
  const sitesMode = settings.countdownMode === 'sites';
  const listed = sitesMode ? siteListed(resolved.sites, message.host) : true;
  const force = message.countdown === 'force';
  const wantsCountdown = sender.tab !== undefined && (listed || force);
  let countdown: CountdownView | null = null;
  if (wantsCountdown && (force || settings.countdown)) {
    if (force) {
      await claimCountdown(today, true, message.doc);
      countdown = countdownView(life, '');
    } else if (sitesMode) {
      countdown = countdownView(life, '');
    } else {
      const token = await claimCountdown(today, false, message.doc);
      if (token !== null) countdown = countdownView(life, token);
    }
  }
  // Only pages send hello, and an answered page needs no further check of its
  // own today: the countdown was shown, or the day is claimed elsewhere, or the
  // countdown is off, or the site is not listed. A worker prompt still gets through.
  return { countdown, countdownDoneFor: today };
}

function countdownView(life: Life, token: string): CountdownView {
  return {
    token,
    fraction: life.fraction,
    number: formatInt(life.left),
    line: countdownLine(life),
    question: question(life.left),
    footer: COUNTDOWN_FOOTER,
  };
}

// The last-shown date lives in chrome.storage.local, with a token naming the
// claim. Claims are serialised so that several tabs loading at once cannot all
// win the same day.
let claimChain: Promise<unknown> = Promise.resolve();

function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = claimChain.then(work, work);
  claimChain = result.catch(() => undefined);
  return result;
}

interface CountdownState {
  lastCountdown: string;
  countdownToken: string;
}

async function readState(): Promise<CountdownState> {
  await storageReady;
  const raw = await chrome.storage.local.get({ lastCountdown: '', countdownToken: '' });
  return {
    lastCountdown: typeof raw.lastCountdown === 'string' ? raw.lastCountdown : '',
    countdownToken: typeof raw.countdownToken === 'string' ? raw.countdownToken : '',
  };
}

// A page can die between asking and being answered (a redirect on arrival is
// the common case). Two records let such an answer be undone or refused. They
// live in chrome.storage.session, which outlives this worker (it is shut down
// after about 30 s without events) and is cleared when the browser closes.

/** The last daily claim: which document got it, its token, and when. */
interface Claim {
  doc: string;
  token: string;
  at: number;
}

interface ClaimBook {
  lastClaim: Claim | null;
  /** Documents that reported dying with a check unanswered, by the time they said so. */
  abandoned: Record<string, number>;
}

/** A claim or an abandoned-page record older than this matches nothing any more. */
const CLAIM_WINDOW_MS = 60_000;

/** The records, with anything older than the window already dropped. */
async function readBook(): Promise<ClaimBook> {
  const raw = await chrome.storage.session.get({ lastClaim: null, abandoned: {} });
  const cutoff = Date.now() - CLAIM_WINDOW_MS;
  const book: ClaimBook = { lastClaim: null, abandoned: {} };
  const claim: unknown = raw.lastClaim;
  if (claim && typeof claim === 'object') {
    const { doc, token, at } = claim as Partial<Claim>;
    if (typeof doc === 'string' && typeof token === 'string' && typeof at === 'number' && at >= cutoff) {
      book.lastClaim = { doc, token, at };
    }
  }
  const abandoned: unknown = raw.abandoned;
  if (abandoned && typeof abandoned === 'object') {
    for (const [doc, at] of Object.entries(abandoned as Record<string, unknown>)) {
      if (typeof at === 'number' && at >= cutoff) book.abandoned[doc] = at;
    }
  }
  return book;
}

async function writeBook(book: ClaimBook): Promise<void> {
  await chrome.storage.session.set(book);
}

/**
 * Marks today as shown and returns the claim token, or null when today was
 * already taken or the asking page is already gone. A forced show always wins
 * and gets the empty token, so it can never be released.
 */
function claimCountdown(today: string, force: boolean, doc: string): Promise<string | null> {
  return serial(async () => {
    const book = await readBook();
    if (doc in book.abandoned) {
      // the page died before hearing this answer
      delete book.abandoned[doc];
      await writeBook(book);
      return null;
    }
    const state = await readState();
    if (!force && state.lastCountdown === today) return null;
    const token = force ? '' : crypto.randomUUID();
    await chrome.storage.local.set({ lastCountdown: today, countdownToken: token });
    book.lastClaim = force ? null : { doc, token, at: Date.now() };
    await writeBook(book);
    return token;
  });
}

/**
 * The page went away before anyone saw the countdown: give the day back. With
 * the empty token the page died with its check unanswered; if the answer
 * already claimed the day for it (within the window), undo that. Either way
 * the page is gone, so any claim it still has in flight is refused: a check
 * sent while its countdown was up must not re-take the day after this release.
 */
function releaseCountdown(doc: string, token: string): Promise<void> {
  return serial(async () => {
    const book = await readBook();
    book.abandoned[doc] = Date.now();
    if (token === '' && book.lastClaim?.doc === doc) token = book.lastClaim.token;
    if (token !== '') {
      const state = await readState();
      if (state.countdownToken === token) {
        await chrome.storage.local.remove(['lastCountdown', 'countdownToken']);
        if (book.lastClaim?.token === token) book.lastClaim = null;
      }
    }
    await writeBook(book);
  });
}

/** The page came back from the back/forward cache: it is not dead after all. */
function forgetAbandoned(doc: string): Promise<void> {
  return serial(async () => {
    const book = await readBook();
    if (!(doc in book.abandoned)) return;
    delete book.abandoned[doc];
    await writeBook(book);
  });
}

async function shownOn(day: string): Promise<boolean> {
  return (await readState()).lastCountdown === day;
}

/**
 * The user came back after being idle or locked. If today's countdown is still
 * due, ask the page in front to run a check; pages the extension cannot reach
 * (the browser's own pages) fall through to the next page load or tab switch.
 */
async function onReturn(): Promise<void> {
  await storageReady;
  const settings = await loadSettings();
  if (!settings.countdown || settings.birth === '' || settings.countdownMode === 'sites') return;
  if (await shownOn(localDateString(new Date()))) return;
  await promptActiveTab(false);
}

async function promptActiveTab(force: boolean): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return false;
  const message: CountdownPromptMessage = { type: 'countdownPrompt', force };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false; // no content script there
  }
}

// ---- toolbar icon and tooltip -------------------------------------------------

/** Local date the icon and tooltip were last drawn for. */
let actionDate = '';

async function refreshAction(): Promise<void> {
  const now = new Date();
  actionDate = localDateString(now);
  await storageReady;
  const settings = await loadSettings();
  const resolved = resolveSettings(settings, now);
  try {
    if (!resolved) {
      await chrome.action.setTitle({ title: 'Final Days · set your date of birth' });
      return;
    }
    const life = computeLife(resolved.birth, now);
    await chrome.action.setTitle({ title: `Final Days · ${formatInt(life.left)} days left` });
    await drawIcon(life.fraction);
  } catch (err) {
    console.warn('Final Days: toolbar update failed', err);
  }
}

/** Draws the toolbar icon as a miniature life bar, the same tile as the Windows tray icon. */
async function drawIcon(fraction: number): Promise<void> {
  if (typeof OffscreenCanvas === 'undefined') return;
  const imageData: Record<number, ImageData> = {};
  for (const n of [16, 32, 48]) {
    const canvas = new OffscreenCanvas(n, n);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1f2430';
    ctx.beginPath();
    ctx.roundRect(0, 0, n, n, (n * 48) / 256);
    ctx.fill();
    const pad = n * 0.12;
    const top = n * 0.44;
    const height = n * 0.12;
    const width = n - 2 * pad;
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(pad, top, width, height);
    const gradient = ctx.createLinearGradient(pad, 0, pad + width, 0);
    gradient.addColorStop(0, '#16a34a');
    gradient.addColorStop(0.5, '#eab308');
    gradient.addColorStop(1, '#dc2626');
    ctx.fillStyle = gradient;
    ctx.fillRect(pad, top, width * fraction, height);
    imageData[n] = ctx.getImageData(0, 0, n, n);
  }
  await chrome.action.setIcon({ imageData });
}

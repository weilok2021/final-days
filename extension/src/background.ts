// Background service worker: the single place that reads settings, computes
// the numbers, decides whether today's moment is due, and keeps the toolbar
// icon current. Content scripts ask it for everything they show.
import {
  computeLife,
  formatInt,
  inQuietHours,
  localDateString,
  momentLine,
  nextChange,
  question,
  siteListed,
  tipText,
  type Life,
} from './life.ts';
import { loadSettings, resolveSettings, saveSettings } from './settings.ts';

const MOMENT_FOOTER = 'click anywhere to continue';
/** Spec: the moment may show on return from at least five minutes without input. */
const IDLE_SECONDS = 300;

chrome.idle.setDetectionInterval(IDLE_SECONDS);

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
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'toggle-strip') void toggleStrip();
});
chrome.runtime.onMessage.addListener((message: FdMessage, sender, sendResponse) => {
  if (message?.type === 'momentLost') {
    void releaseMoment(message.doc, message.token);
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

/** Opens the options page until a date of birth has been set. */
async function firstRun(): Promise<void> {
  const settings = await loadSettings();
  if (settings.birth === '') await chrome.runtime.openOptionsPage();
  await refreshAction();
}

async function hello(message: HelloMessage, sender: chrome.runtime.MessageSender): Promise<HelloReply> {
  const now = new Date();
  const today = localDateString(now);
  if (today !== actionDate) void refreshAction(); // a long-lived worker crossed midnight
  const settings = await loadSettings();
  const resolved = resolveSettings(settings, now);
  const nextChangeAt = nextChange(now, resolved?.ranges ?? []).getTime();
  if (!resolved) return { strip: null, moment: null, momentDoneFor: today, nextChangeAt };

  const life = computeLife(resolved.birth, now);
  const strip: StripView | null = settings.strip
    ? { fraction: life.fraction, quiet: inQuietHours(resolved.ranges, now), tip: tipText(life) }
    : null;

  // Only a page can show the moment, so only messages from a tab count. In the
  // sites mode every load of a listed site shows it and nothing is claimed; in
  // the daily mode the first page to ask claims the day. A forced show works
  // anywhere in either mode.
  const sitesMode = settings.momentMode === 'sites';
  const listed = sitesMode ? siteListed(resolved.sites, message.host) : true;
  const force = message.moment === 'force';
  const wantsMoment = sender.tab !== undefined && message.moment !== 'none' && (listed || force);
  let moment: MomentView | null = null;
  if (wantsMoment && (force || settings.moment)) {
    if (force) {
      await claimMoment(today, true, message.doc);
      moment = momentView(life, '');
    } else if (sitesMode) {
      moment = momentView(life, '');
    } else {
      const token = await claimMoment(today, false, message.doc);
      if (token !== null) moment = momentView(life, token);
    }
  }
  const done = wantsMoment || !settings.moment || !listed || (!sitesMode && (await shownOn(today)));
  return { strip, moment, momentDoneFor: done ? today : '', nextChangeAt };
}

function momentView(life: Life, token: string): MomentView {
  return {
    token,
    fraction: life.fraction,
    number: formatInt(life.left),
    line: momentLine(life),
    question: question(life.left),
    footer: MOMENT_FOOTER,
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

interface MomentState {
  lastMoment: string;
  momentToken: string;
}

async function readState(): Promise<MomentState> {
  const raw = await chrome.storage.local.get({ lastMoment: '', momentToken: '' });
  return {
    lastMoment: typeof raw.lastMoment === 'string' ? raw.lastMoment : '',
    momentToken: typeof raw.momentToken === 'string' ? raw.momentToken : '',
  };
}

// A page can die between asking and being answered (a redirect on arrival is
// the common case). These two records, kept for the life of this worker
// instance, let such an answer be undone or refused.

/** The last daily claim: which document got it, its token, and when. */
let lastClaim: { doc: string; token: string; at: number } | null = null;
/** Documents that reported dying with a check unanswered, by the time they said so. */
const abandoned = new Map<string, number>();
const ABANDON_WINDOW_MS = 60_000;

/**
 * Marks today as shown and returns the claim token, or null when today was
 * already taken or the asking page is already gone. A forced show always wins
 * and gets the empty token, so it can never be released.
 */
function claimMoment(today: string, force: boolean, doc: string): Promise<string | null> {
  return serial(async () => {
    forgetOldAbandons();
    if (abandoned.delete(doc)) return null; // the page died before hearing this answer
    const state = await readState();
    if (!force && state.lastMoment === today) return null;
    const token = force ? '' : crypto.randomUUID();
    await chrome.storage.local.set({ lastMoment: today, momentToken: token });
    lastClaim = force ? null : { doc, token, at: Date.now() };
    return token;
  });
}

/**
 * The page went away before anyone saw the moment: give the day back. With
 * the empty token the page died with its check unanswered; if the answer
 * already claimed the day for it, undo that, otherwise make sure it cannot.
 */
function releaseMoment(doc: string, token: string): Promise<void> {
  return serial(async () => {
    forgetOldAbandons();
    if (token === '') {
      if (lastClaim?.doc !== doc) {
        abandoned.set(doc, Date.now());
        return;
      }
      token = lastClaim.token;
    }
    const state = await readState();
    if (state.momentToken !== token) return; // a different claim owns the day now
    await chrome.storage.local.remove(['lastMoment', 'momentToken']);
    if (lastClaim?.token === token) lastClaim = null;
  });
}

function forgetOldAbandons(): void {
  const cutoff = Date.now() - ABANDON_WINDOW_MS;
  for (const [doc, at] of abandoned) if (at < cutoff) abandoned.delete(doc);
}

async function shownOn(day: string): Promise<boolean> {
  return (await readState()).lastMoment === day;
}

/**
 * The user came back after being idle or locked. If today's moment is still
 * due, ask the page in front to run a check; pages the extension cannot reach
 * (the browser's own pages) fall through to the next page load or tab switch.
 */
async function onReturn(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.moment || settings.birth === '' || settings.momentMode === 'sites') return;
  if (await shownOn(localDateString(new Date()))) return;
  await promptActiveTab(false);
}

async function promptActiveTab(force: boolean): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return false;
  const message: MomentPromptMessage = { type: 'momentPrompt', force };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false; // no content script there
  }
}

async function toggleStrip(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ strip: !settings.strip });
}

// ---- toolbar icon and tooltip -------------------------------------------------

/** Local date the icon and tooltip were last drawn for. */
let actionDate = '';

async function refreshAction(): Promise<void> {
  const now = new Date();
  actionDate = localDateString(now);
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

/** Draws the toolbar icon as a miniature of the strip, the same tile as the Windows tray icon. */
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

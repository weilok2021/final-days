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
  const settings = await loadSettings();
  const resolved = resolveSettings(settings, now);
  const nextChangeAt = nextChange(now, resolved?.ranges ?? []).getTime();
  if (!resolved) return { strip: null, moment: null, momentDoneFor: today, nextChangeAt };

  const life = computeLife(resolved.birth, now);
  const strip: StripView | null = settings.strip
    ? { fraction: life.fraction, quiet: inQuietHours(resolved.ranges, now), tip: tipText(life) }
    : null;

  // Only a page can show the moment, so only messages from a tab may claim it.
  const wantsMoment = sender.tab !== undefined && message.moment !== 'none';
  let moment: MomentView | null = null;
  if (wantsMoment) {
    const force = message.moment === 'force';
    if ((force || settings.moment) && (await claimMoment(today, force))) moment = momentView(life);
  }
  const done = wantsMoment || !settings.moment || (await shownOn(today));
  return { strip, moment, momentDoneFor: done ? today : '', nextChangeAt };
}

function momentView(life: Life): MomentView {
  return {
    fraction: life.fraction,
    number: formatInt(life.left),
    line: momentLine(life),
    question: question(life.left),
    footer: MOMENT_FOOTER,
  };
}

// The last-shown date lives in chrome.storage.local. Claims are serialised so
// that several tabs loading at once cannot all win the same day.
let claimChain: Promise<unknown> = Promise.resolve();

function claimMoment(today: string, force: boolean): Promise<boolean> {
  const attempt = async (): Promise<boolean> => {
    if (!force && (await shownOn(today))) return false;
    await chrome.storage.local.set({ lastMoment: today });
    return true;
  };
  const result = claimChain.then(attempt, attempt);
  claimChain = result.catch(() => undefined);
  return result;
}

async function shownOn(day: string): Promise<boolean> {
  const { lastMoment } = await chrome.storage.local.get({ lastMoment: '' });
  return lastMoment === day;
}

/**
 * The user came back after being idle or locked. If today's moment is still
 * due, ask the page in front to run a check; pages the extension cannot reach
 * (the browser's own pages) fall through to the next page load or tab switch.
 */
async function onReturn(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.moment || settings.birth === '') return;
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

async function refreshAction(): Promise<void> {
  const now = new Date();
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

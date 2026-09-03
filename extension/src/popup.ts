// Toolbar popup: the numbers, "show today's moment", the life-bar switch and
// a way to the options page. The browser equivalent of the Windows tray menu.
import { computeLife, formatInt, momentLine } from './life.ts';
import { loadSettings, resolveSettings, saveSettings } from './settings.ts';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`popup is missing #${id}`);
  return found as T;
}

const ready = el<HTMLElement>('ready');
const setup = el<HTMLElement>('setup');
const rest = el<HTMLElement>('rest');
const left = el<HTMLElement>('left');
const line = el<HTMLElement>('line');
const show = el<HTMLButtonElement>('show');
const hint = el<HTMLElement>('hint');
const strip = el<HTMLInputElement>('strip');
const options = el<HTMLButtonElement>('options');

const now = new Date();
const settings = await loadSettings();
const resolved = resolveSettings(settings, now);

if (resolved) {
  const life = computeLife(resolved.birth, now);
  rest.style.width = `${(1 - life.fraction) * 100}%`;
  left.textContent = formatInt(life.left);
  line.textContent = momentLine(life);
  strip.checked = settings.strip;
  ready.hidden = false;
} else {
  rest.style.width = '100%';
  setup.hidden = false;
}

show.addEventListener('click', () => void showMoment());

async function showMoment(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const message: MomentPromptMessage = { type: 'momentPrompt', force: true };
  try {
    if (tab?.id === undefined) throw new Error('no tab');
    await chrome.tabs.sendMessage(tab.id, message);
    window.close();
  } catch {
    hint.textContent = 'The moment can only appear on a web page. Switch to one and try again.';
    hint.hidden = false;
  }
}

strip.addEventListener('change', () => void saveSettings({ strip: strip.checked }));

options.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

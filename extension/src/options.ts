// Options page: the date of birth and the three switches, saved to
// chrome.storage.sync after validation. Lifespan is not a setting.
import { computeLife, localDateString, parseBirth, parseHourRanges, tipText } from './life.ts';
import { loadSettings, saveSettings } from './settings.ts';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`options page is missing #${id}`);
  return found as T;
}

const form = el<HTMLFormElement>('form');
const birth = el<HTMLInputElement>('birth');
const strip = el<HTMLInputElement>('strip');
const moment = el<HTMLInputElement>('moment');
const quiet = el<HTMLInputElement>('quiet');
const status = el<HTMLElement>('status');
const preview = el<HTMLElement>('preview');
const rest = el<HTMLElement>('rest');
const tip = el<HTMLElement>('tip');

birth.max = localDateString(new Date());

function renderPreview(): void {
  try {
    const now = new Date();
    const life = computeLife(parseBirth(birth.value, now), now);
    rest.style.width = `${(1 - life.fraction) * 100}%`;
    tip.textContent = tipText(life);
    preview.hidden = false;
  } catch {
    preview.hidden = true;
  }
}

function say(message: string, isError: boolean): void {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function load(): Promise<void> {
  const settings = await loadSettings();
  birth.value = settings.birth;
  strip.checked = settings.strip;
  moment.checked = settings.moment;
  quiet.value = settings.quietHours;
  renderPreview();
  if (settings.birth === '') {
    say('Set your date of birth to start.', false);
    birth.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void save();
});

async function save(): Promise<void> {
  try {
    parseBirth(birth.value, new Date());
    parseHourRanges(quiet.value);
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), true);
    return;
  }
  await saveSettings({
    birth: birth.value.trim(),
    strip: strip.checked,
    moment: moment.checked,
    quietHours: quiet.value.trim(),
  });
  renderPreview();
  say('Saved.', false);
}

birth.addEventListener('input', renderPreview);
for (const input of [birth, strip, moment, quiet]) input.addEventListener('input', () => say('', false));

void load();

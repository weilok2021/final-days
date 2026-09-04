// Options page: the date of birth, the countdown switch and its mode, saved
// to chrome.storage.sync after validation. Lifespan is not a setting.
import { computeLife, dayLabel, localDateString, parseBirth, parseSiteList } from './life.ts';
import { loadSettings, saveSettings } from './settings.ts';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`options page is missing #${id}`);
  return found as T;
}

const form = el<HTMLFormElement>('form');
const birth = el<HTMLInputElement>('birth');
const countdown = el<HTMLInputElement>('countdown');
const sites = el<HTMLTextAreaElement>('sites');
const modeDaily = el<HTMLInputElement>('mode-daily');
const modeSites = el<HTMLInputElement>('mode-sites');
const status = el<HTMLElement>('status');
const preview = el<HTMLElement>('preview');
const rest = el<HTMLElement>('rest');
const label = el<HTMLElement>('day-label');

birth.max = localDateString(new Date());

function renderPreview(): void {
  try {
    const now = new Date();
    const life = computeLife(parseBirth(birth.value, now), now);
    rest.style.width = `${(1 - life.fraction) * 100}%`;
    label.textContent = dayLabel(life);
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
  countdown.checked = settings.countdown;
  sites.value = settings.countdownSites;
  modeDaily.checked = settings.countdownMode === 'daily';
  modeSites.checked = settings.countdownMode === 'sites';
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
    const list = parseSiteList(sites.value);
    if (modeSites.checked && list.length === 0) throw new Error('Enter at least one site for the countdown to appear on.');
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), true);
    return;
  }
  try {
    await saveSettings({
      birth: birth.value.trim(),
      countdown: countdown.checked,
      countdownMode: modeSites.checked ? 'sites' : 'daily',
      countdownSites: sites.value.trim(),
    });
  } catch (err) {
    // Storage refused it: over the sync quota (a very long site list) or sync unavailable.
    say(`Could not save: ${err instanceof Error ? err.message : String(err)}`, true);
    return;
  }
  renderPreview();
  say('Saved.', false);
}

birth.addEventListener('input', renderPreview);
for (const input of [birth, countdown, sites, modeDaily, modeSites]) input.addEventListener('input', () => say('', false));

void load();

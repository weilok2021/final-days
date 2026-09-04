// The user's settings, kept in chrome.storage.sync so they follow the
// browser profile. Lifespan is deliberately absent: it is a constant.
import { parseBirth, parseHourRanges, parseSiteList, type CalendarDate, type HourRange } from './life.ts';

export type Settings = {
  /** "YYYY-MM-DD", or "" until the user sets it. */
  birth: string;
  /** Show the 4 px life bar. */
  strip: boolean;
  /** Show the once-a-day countdown. */
  countdown: boolean;
  /** "09:00-12:00, 14:00-17:00" or "". The bar goes grey in these ranges. */
  quietHours: string;
  /**
   * daily: once a day, the first time the user comes back (the spec's rule).
   * sites: every time one of countdownSites loads, and nowhere else.
   */
  countdownMode: CountdownMode;
  /** "youtube.com, facebook.com" or "". The sites for the sites mode. */
  countdownSites: string;
}

export type CountdownMode = 'daily' | 'sites';

export const DEFAULT_SETTINGS: Settings = {
  birth: '',
  strip: true,
  countdown: true,
  quietHours: '',
  countdownMode: 'daily',
  countdownSites: '',
};

/**
 * Storage keys renamed on 2026-09-04, when "moment" became "countdown", as
 * new name to old name. The worker moves stored values across when it starts
 * (migrateRenamedKeys) and loadSettings reads an old name while the new one
 * is absent, so settings saved before the rename keep working.
 */
export const RENAMED_SYNC_KEYS: Readonly<Record<string, string>> = {
  countdown: 'moment',
  countdownMode: 'momentMode',
  countdownSites: 'momentSites',
};
export const RENAMED_LOCAL_KEYS: Readonly<Record<string, string>> = {
  lastCountdown: 'lastMoment',
  countdownToken: 'momentToken',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get([...Object.keys(DEFAULT_SETTINGS), ...Object.values(RENAMED_SYNC_KEYS)]);
  const raw = withRenamed(stored, RENAMED_SYNC_KEYS);
  return {
    birth: typeof raw.birth === 'string' ? raw.birth : DEFAULT_SETTINGS.birth,
    strip: typeof raw.strip === 'boolean' ? raw.strip : DEFAULT_SETTINGS.strip,
    countdown: typeof raw.countdown === 'boolean' ? raw.countdown : DEFAULT_SETTINGS.countdown,
    quietHours: typeof raw.quietHours === 'string' ? raw.quietHours : DEFAULT_SETTINGS.quietHours,
    countdownMode: countdownModeOf(raw),
    countdownSites: typeof raw.countdownSites === 'string' ? raw.countdownSites : DEFAULT_SETTINGS.countdownSites,
  };
}

/** Settings saved before the mode existed carry only a site list: a non-empty one meant sites. */
function countdownModeOf(raw: Record<string, unknown>): CountdownMode {
  if (raw.countdownMode === 'daily' || raw.countdownMode === 'sites') return raw.countdownMode;
  return typeof raw.countdownSites === 'string' && raw.countdownSites.trim() !== '' ? 'sites' : 'daily';
}

/** The stored values under their current names: where a new name has no value, its old name's value is used. */
export function withRenamed(
  stored: Record<string, unknown>,
  renamed: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  for (const [name, oldName] of Object.entries(renamed)) {
    if (out[name] === undefined && out[oldName] !== undefined) out[name] = out[oldName];
  }
  return out;
}

/**
 * Moves stored values from their old names to the new ones and removes the
 * old names. A value already stored under the new name wins. Does nothing
 * when no old name is present, so it is cheap to run on every worker start.
 */
export async function migrateRenamedKeys(
  area: chrome.storage.StorageArea,
  renamed: Readonly<Record<string, string>>,
): Promise<void> {
  const oldNames = Object.values(renamed);
  const stored = await area.get([...Object.keys(renamed), ...oldNames]);
  const moved: Record<string, unknown> = {};
  for (const [name, oldName] of Object.entries(renamed)) {
    if (stored[name] === undefined && stored[oldName] !== undefined) moved[name] = stored[oldName];
  }
  if (Object.keys(moved).length > 0) await area.set(moved);
  const stale = oldNames.filter((oldName) => stored[oldName] !== undefined);
  if (stale.length > 0) await area.remove(stale);
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/** Settings as the extension actually uses them. */
export interface ResolvedSettings {
  birth: CalendarDate;
  ranges: HourRange[];
  /** The sites of the sites mode. */
  sites: string[];
}

/**
 * Turns stored text into dates, ranges and sites. Null while the date of
 * birth is unset or unusable. A broken quiet-hours string means no quiet
 * hours; a broken site list means no site at all, so a damaged list can
 * never make the countdown appear where it was not wanted.
 */
export function resolveSettings(s: Settings, now: Date): ResolvedSettings | null {
  let birth: CalendarDate;
  try {
    birth = parseBirth(s.birth, now);
  } catch {
    return null;
  }
  let ranges: HourRange[] = [];
  try {
    ranges = parseHourRanges(s.quietHours);
  } catch {
    ranges = [];
  }
  let sites: string[] = [];
  try {
    sites = parseSiteList(s.countdownSites);
  } catch {
    sites = [];
  }
  return { birth, ranges, sites };
}

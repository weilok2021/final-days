// The user's settings, kept in chrome.storage.sync so they follow the
// browser profile. Lifespan is deliberately absent: it is a constant.
import { parseBirth, parseHourRanges, parseSiteList, type CalendarDate, type HourRange } from './life.ts';

export type Settings = {
  /** "YYYY-MM-DD", or "" until the user sets it. */
  birth: string;
  /** Show the 4 px life bar. */
  strip: boolean;
  /** Show the once-a-day moment. */
  moment: boolean;
  /** "09:00-12:00, 14:00-17:00" or "". The bar goes grey in these ranges. */
  quietHours: string;
  /** "youtube.com, facebook.com" or "". With a list, the moment shows only on these sites. */
  momentSites: string;
}

export const DEFAULT_SETTINGS: Settings = { birth: '', strip: true, moment: true, quietHours: '', momentSites: '' };

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    birth: typeof raw.birth === 'string' ? raw.birth : DEFAULT_SETTINGS.birth,
    strip: typeof raw.strip === 'boolean' ? raw.strip : DEFAULT_SETTINGS.strip,
    moment: typeof raw.moment === 'boolean' ? raw.moment : DEFAULT_SETTINGS.moment,
    quietHours: typeof raw.quietHours === 'string' ? raw.quietHours : DEFAULT_SETTINGS.quietHours,
    momentSites: typeof raw.momentSites === 'string' ? raw.momentSites : DEFAULT_SETTINGS.momentSites,
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/** Settings as the extension actually uses them. */
export interface ResolvedSettings {
  birth: CalendarDate;
  ranges: HourRange[];
  /** Sites the moment may appear on; null means every site. */
  sites: string[] | null;
}

/**
 * Turns stored text into dates, ranges and sites. Null while the date of
 * birth is unset or unusable. A broken quiet-hours string means no quiet
 * hours; a broken site list means no site at all, never every site, so a
 * damaged list can never make the moment appear where it was not wanted.
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
  let sites: string[] | null = null;
  if (s.momentSites.trim() !== '') {
    try {
      sites = parseSiteList(s.momentSites);
    } catch {
      sites = [];
    }
  }
  return { birth, ranges, sites };
}

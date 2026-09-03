// The user's settings, kept in chrome.storage.sync so they follow the
// browser profile. Lifespan is deliberately absent: it is a constant.
import { parseBirth, parseHourRanges, type CalendarDate, type HourRange } from './life.ts';

export type Settings = {
  /** "YYYY-MM-DD", or "" until the user sets it. */
  birth: string;
  /** Show the 4 px life bar. */
  strip: boolean;
  /** Show the once-a-day moment. */
  moment: boolean;
  /** "09:00-12:00, 14:00-17:00" or "". The bar goes grey in these ranges. */
  quietHours: string;
}

export const DEFAULT_SETTINGS: Settings = { birth: '', strip: true, moment: true, quietHours: '' };

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    birth: typeof raw.birth === 'string' ? raw.birth : DEFAULT_SETTINGS.birth,
    strip: typeof raw.strip === 'boolean' ? raw.strip : DEFAULT_SETTINGS.strip,
    moment: typeof raw.moment === 'boolean' ? raw.moment : DEFAULT_SETTINGS.moment,
    quietHours: typeof raw.quietHours === 'string' ? raw.quietHours : DEFAULT_SETTINGS.quietHours,
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/** Settings as the extension actually uses them. */
export interface ResolvedSettings {
  birth: CalendarDate;
  ranges: HourRange[];
}

/**
 * Turns stored text into dates and ranges. Null while the date of birth is
 * unset or unusable; a broken quiet-hours string just means no quiet hours.
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
  return { birth, ranges };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENAMED_LOCAL_KEYS, RENAMED_SYNC_KEYS, loadSettings, migrateRenamedKeys, withRenamed } from '../src/settings.ts';

/** A stand-in for a chrome.storage area: a map with the three calls the code uses, and a log of writes. */
function fakeArea(initial: Record<string, unknown>) {
  const store = new Map(Object.entries(initial));
  const writes: string[] = [];
  const area = {
    async get(keys: string[]) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (store.has(k)) out[k] = store.get(k);
      return out;
    },
    async set(items: Record<string, unknown>) {
      writes.push(`set ${Object.keys(items).sort().join(',')}`);
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    },
    async remove(keys: string[]) {
      writes.push(`remove ${[...keys].sort().join(',')}`);
      for (const k of keys) store.delete(k);
    },
  };
  return { area: area as unknown as chrome.storage.StorageArea, store, writes };
}

test('withRenamed reads an old key only while the new one is absent', () => {
  const renamed = { countdown: 'moment', countdownMode: 'momentMode' };
  assert.deepEqual(withRenamed({ moment: false, momentMode: 'sites' }, renamed), {
    moment: false,
    momentMode: 'sites',
    countdown: false,
    countdownMode: 'sites',
  });
  assert.equal(withRenamed({ moment: false, countdown: true }, renamed).countdown, true);
  assert.deepEqual(withRenamed({}, renamed), {});
});

test('migrateRenamedKeys moves the moment keys to the countdown names and removes the old ones', async () => {
  const { area, store, writes } = await Promise.resolve(
    fakeArea({ birth: '1996-01-01', moment: false, momentMode: 'sites', momentSites: 'youtube.com', countdownSites: 'x.com' }),
  );
  await migrateRenamedKeys(area, RENAMED_SYNC_KEYS);
  assert.deepEqual(Object.fromEntries(store), {
    birth: '1996-01-01',
    countdown: false,
    countdownMode: 'sites',
    countdownSites: 'x.com', // the value already under the new name wins
  });
  assert.deepEqual(writes, ['set countdown,countdownMode', 'remove moment,momentMode,momentSites']);
});

test('migrateRenamedKeys writes nothing when there is nothing to move', async () => {
  const { store, area, writes } = fakeArea({ lastCountdown: '2026-09-04', countdownToken: 'abc' });
  await migrateRenamedKeys(area, RENAMED_LOCAL_KEYS);
  assert.deepEqual(writes, []);
  assert.equal(store.size, 2);
  const empty = fakeArea({});
  await migrateRenamedKeys(empty.area, RENAMED_LOCAL_KEYS);
  assert.deepEqual(empty.writes, []);
});

test('loadSettings falls back to the old key names before the worker has migrated them', async () => {
  const { area } = fakeArea({ birth: '1996-01-01', moment: false, momentMode: 'sites', momentSites: 'youtube.com' });
  (globalThis as { chrome?: unknown }).chrome = { storage: { sync: area } };
  try {
    const settings = await loadSettings();
    assert.equal(settings.birth, '1996-01-01');
    assert.equal(settings.countdown, false);
    assert.equal(settings.countdownMode, 'sites');
    assert.equal(settings.countdownSites, 'youtube.com');
  } finally {
    delete (globalThis as { chrome?: unknown }).chrome;
  }
});

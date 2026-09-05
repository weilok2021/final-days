// The background worker refreshes the toolbar while its module is still being evaluated,
// so everything that refresh touches must already be declared. This test evaluates the real
// module against a recording stub of the chrome API and checks that the start-up completes:
// no unhandled rejection, and the tooltip drawn once. A `let` declared below the start-up
// call would throw a ReferenceError here (caught on the work PC on 2026-09-05).
import assert from 'node:assert/strict';
import { test } from 'node:test';

type Call = { path: string; args: unknown[] };
const calls: Call[] = [];

/** Every property is another stub; every call is recorded and resolves to an empty object. */
function stub(path: string[]): unknown {
  return new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return stub([...path, String(prop)]);
    },
    apply(_target, _thisArg, args: unknown[]) {
      calls.push({ path: path.join('.'), args });
      return Promise.resolve({});
    },
  });
}

test('the worker module evaluates without an error and draws the toolbar tooltip at start', async () => {
  const rejections: unknown[] = [];
  const record = (err: unknown) => rejections.push(err);
  process.on('unhandledRejection', record);
  (globalThis as unknown as { chrome: unknown }).chrome = stub(['chrome']);
  try {
    await import('../src/background.ts');
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the start-up refresh run to its end
  } finally {
    process.off('unhandledRejection', record);
  }
  assert.deepEqual(rejections.map(String), []);
  const titles = calls.filter((c) => c.path === 'chrome.action.setTitle').map((c) => c.args);
  assert.deepEqual(titles, [[{ title: 'Final Days · set your date of birth' }]]);
});

# fix-redirect-e2e

**Branch:** feature/fix-redirect-e2e
**Worktree:** .worktrees/feature-fix-redirect-e2e
**Started:** 2026-09-09
**Issue:** none; CI failure on main after PR #4

## What this is

The build workflow failed on main twice (run 34341695808 and its re-run) in
the e2e test "a page that redirects on arrival does not eat the day", while
the same tree had passed on the PR. This branch finds the cause and fixes it.

## The bug

In the daily mode the first page to ask claims the day. When a page redirects
on arrival, its content script reports the countdown lost at `pagehide`, and
the worker releases the claim so the next page can show it. That "lost"
message comes from a renderer that is being torn down. On a loaded runner it
reached the worker 3 ms *after* the new page had already asked and been
refused. The worker then released the day, but a page that has been refused
today never asks again, so nothing showed the countdown. Locally the message
won by about 35 ms every time (160 runs, including starved to two cores),
which is why it never reproduced here.

Trace from the runner (1 failure in 40 loops, times in ms):

```
92070  worker got hello   from old.example
92091  claim for old.example succeeds
92110  worker got hello   from new.example
92112  claim for new.example refused: day already taken
92113  worker got countdownLost from old.example      <- 3 ms late
92121  release
92122  new.example gets its reply: countdown = false
```

## The fix

`extension/src/content.ts`: when `lastCountdown` disappears from local
storage (the day was given back) and this page is in front with no countdown
up, it asks again at once instead of waiting for the next return. `refresh`
already refuses to ask when the page is hidden or has shown a countdown from
a check today, so nothing repeats.

Regression test in `extension/e2e/extension.test.ts`: "a page refused the day
shows the countdown when the day is given back while it is in front". Another
tab takes the day and is closed within three seconds; the refused page in
front must show the countdown. It fails without the fix with the same timeout
as CI, and passes with it.

## How it was found

- Locally: the scenario in a loop (40 plain, 60 pinned to two cores with busy
  processes, the full suite three times under the same load). Never failed.
- On the runner: a temporary workflow on this branch ran an instrumented loop
  (tagged `[DEBUG-rd01]` console logs in the worker and content script,
  captured through Playwright's context console events) and reported through
  job annotations, which the public API serves without a login. The job log
  itself needs admin rights, and `gh` is not logged in here.
- With the fix, the same runner loop ran clean (see the session's last
  annotation check).
- The tracing, the loop script and the temporary workflow were removed before
  the PR. They are in this branch's history (the two "Debug:" commits) if the
  race ever needs another look.

## Loose ends

- The worker could also be made robust to a "lost" message that never arrives
  at all (renderer killed before flushing it). Not observed; the trace shows
  the message arriving, only late.
- Playwright's `browserContext.on('console')` receives service worker console
  output; handy for future e2e debugging.

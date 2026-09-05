# fix-worker-start

**Branch:** feature/fix-worker-start
**Worktree:** .worktrees/feature-fix-worker-start
**Started:** 2026-09-05
**Issue:** none (GitHub PR only)
**Open the PR here:** https://github.com/weilok2021/final-days/compare/main...feature/fix-worker-start?expand=1

## What this is
The extension's background worker threw `Cannot access 'actionDate' before initialization` at every start, found on the work PC while retesting main. One declaration moved above the start-up call, plus a regression test that evaluates the worker module in Node. The full record, including why the Playwright suite could not see it, is in `notes/extension/README.md` under "Fix round (2026-09-05)".

## Open questions
- None. The desktop checks listed in the extension notes run after the merge.

## UAT (2026-09-05, fresh session, feature-browser-uat)
- Run against `notes/extension/QA-CHECKLIST.md` (local, gitignored) in Playwright's Chromium (Chrome for Testing 151, headed under WSLg; the popup checks headless), the branch build f95771c against the pre-fix build of main ecec039. The pack is `uat/fix-worker-start/` at the project root (evidence-report.html, screenshots, results.json); local only, `uat/` sits in `.git/info/exclude`.
- 23 passed, 1 failed, 7 blocked of 31 checkpoints.
- The worker's start was captured over the DevTools protocol: three starts of the fixed build with no exception and no console error. The same capture caught "Cannot access 'actionDate' before initialization" on the pre-fix build, so the method sees the error when it is there.
- The one Fail (1.1): after the reload the card still showed the Errors button, listing only the old build's error, which Chrome keeps in that list across reloads; "Clear all" and one more reload left it gone. Not a code issue. The checklist line now says to click "Clear all" first (local file).
- Blocked: 4.1 toolbar icon and hover (browser chrome, not visible to Playwright; the tooltip value "Final Days · N days left" was read back and is right), 8.1 and 8.2 lock and unlock (no screen lock in WSL), 10.1 to 10.4 load from the main checkout (post-merge). A fresh-profile install of the branch build was run as supporting evidence for test case 10: Options opens by itself, one countdown with the bar, no repeat, only countdown-named storage keys.
- Still to run on the desktop after the merge: the toolbar icon (4.1), lock and unlock (8) and the load from the main checkout (10), with "Clear all" on the Errors page before any reload of a card that ran the old build.

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

# extension

**Branch:** feature/extension
**Worktree:** .worktrees/feature-extension
**Started:** 2026-09-03
**Issue:** none (GitHub PR only)
**Open the PR here:** https://github.com/weilok2021/final-days/compare/dev...feature/extension?expand=1

## What this is
The browser-extension port of Final Days for Chrome and Edge (Manifest V3, TypeScript): the 4 px life bar on every web page and the once-a-day moment. It exists because the Go exe was flagged by SentinelOne on the managed work laptop; nothing here runs outside the browser.

## Decisions (2026-09-03)
- The branch was created off origin/dev and origin/feature/windows-v1 was merged into it, because SPEC.md, design/ and notes/ only existed on that branch. Until the windows-v1 PR is merged into dev, this PR's diff shows the Windows files too; after that merge it shrinks to the extension files by itself.
- Chrome and Edge both, one manifest, one folder; the install steps are written for both. Firefox is not targeted (see loose ends).
- Toolchain is the TypeScript compiler only, no bundler. `npm run build` compiles src/ to dist/ and copies static/ (manifest, pages, styles, icons) in; dist/ is the load-unpacked folder and is gitignored. Tests run straight on the .ts files with Node 24's type stripping (`node --test`), so there is no test build. TypeScript 7 (the native compiler) is what npm installed and it works with these options.
- The content script is a classic script with no imports, because content scripts cannot import modules without extra machinery. It renders only; every number and string arrives from the background worker in one `hello` message, so life.ts is the single copy of the logic. Message types are global declarations in messages.d.ts. `moduleDetection: legacy` in tsconfig stops tsc from appending `export {}` to the content script, which would break it.
- The once-a-day rule lives in the background worker. Claims of the day are serialised through a promise chain and the date is written to chrome.storage.local, so several tabs loading at once produce one moment. Triggers, whichever comes first: a page load in a visible tab; a tab becoming visible or the window regaining focus; chrome.idle reporting `active` after a lock or after 5 idle minutes (detection interval 300 s, the spec's threshold). The idle path asks the active tab of the last focused window to run the check; if that tab has no content script nothing is claimed and the next page load takes it.
- Content scripts re-render at the next boundary (a quiet-hours edge or local midnight, from nextChange in life.ts) instead of on a fixed interval, and again on visibility and focus, so a laptop waking up catches up at once. A timer never triggers a moment: at midnight the bar updates and the moment waits for the next "coming back" event, as on Windows.
- Settings (birth, strip, moment, quietHours) live in chrome.storage.sync; state (lastMoment) in chrome.storage.local. Lifespan is a constant in life.ts.
- The popup is the tray-menu equivalent: days left, day count, Show today's moment, the Life bar switch, Options. The switch writes the setting, so it persists, unlike the Windows hotkey which is per session; the browser has no session to map that to.
- Keyboard: Alt+Shift+F toggles the strip. Browsers do not allow Ctrl+Alt shortcuts for extensions, so the Windows Ctrl+Alt+F could not be kept.
- The toolbar icon is redrawn with the real fraction by the worker (OffscreenCanvas), matching the Windows tray icon. The static PNGs come from scripts/mkicon.mjs, the same tile as windows/winres/icon.png at a fixed 62 % fill.
- The hover label appears after 350 ms so a mouse passing through the bar on its way to the tab strip does not flash it.
- The moment closes on click, right-click (context menu suppressed) or any key; the key is swallowed in the capture phase so the page underneath does not receive it.
- The options page validates on Save; the messages come from parseBirth and parseHourRanges in life.ts and are written for the user. It opens by itself on install while the date of birth is empty.
- First install shows the browser's "Read and change all your data on all websites" warning: that is the content script on all URLs. The README says so, and that nothing is read from pages or sent anywhere.
- Site list for the moment (2026-09-03, user request during the browser test: on the company PC the full-tab moment must not appear on work pages or in a shared screen). New setting `momentSites` (hosts separated by commas or new lines; pasted URLs reduced to the host, leading www. dropped, subdomains match). With a list, the day can only be claimed by a listed site; forced shows from the popup or the bar work anywhere. Empty keeps the spec behaviour. A list that fails to parse in storage means no site, never every site. This is the research brief's option D in its lightest form (one sec, PNAS 2023: the prompt at the point of reaching for the distraction is the one that changes behaviour). Phase 2, not built: the full gate with a short wait and a "close it" button on every visit.
- Seen rule (same session): a moment that has been on screen for 3 seconds counts as seen even if the page then goes away, so it no longer follows the user from site to site when they navigate with the address bar or a bookmark. Under 3 seconds (a redirect) still releases the day.
- Moment mode (2026-09-03, user: "the logic should be simple: when open, show the screen"): the site list is now one of two explicit modes on the options page, `momentMode` = `daily` (the spec's once-a-day rule, default) or `sites` (every load of a listed site, once per page load, nowhere else). In the sites mode nothing is claimed or written, the idle trigger is skipped, and tab switches back to an already-shown page do not repeat it. Settings saved before the mode existed are read as `sites` when they carry a non-empty list, so the user's work-PC settings keep working. The "moment only on these sites" once-a-day variant from earlier the same evening is gone.
- End-to-end suite (2026-09-03, user asked for Playwright): `extension/e2e/extension.test.ts`, Node's test runner driving Playwright's Chromium with dist/ loaded unpacked, every https request answered by a small fake page under the real host name (no network). Fifteen scenarios: options page on install, validation, saved numbers, strip geometry and colours (pixel-sampled), hover label, first moment, click and key dismissal, keys reaching the page again, once-a-day across a reload and a second tab, three tabs loading at once, quiet hours, strip switch, site list, the 3-second seen rule, release on a flash, redirect on arrival, popup numbers. Runs in about 40 s; CI runs it. Playwright's Chromium lives in WSL only (`~/.cache/ms-playwright`); the three Ubuntu libraries it needed (libnss3, libnspr4, libasound2t64) were installed through `wsl.exe -u root` because sudo cannot take a password in the session.
- Found by the suite and fixed: a page that redirects the instant it arrives dies before the worker's answer reaches it, so the old release path (which needed the token from that answer) never ran and the day was eaten. Each document now carries a random id in its messages; the worker remembers the last daily claim by document and the documents that died with a check unanswered, so such an answer is undone if it already claimed the day and refused if it has not yet. Redirect protection no longer depends on timing.
- Review fixes (2026-09-03; these came from a code-review started in the implementing session, which was the wrong place for it: the user stopped its multi-agent fan-out for token cost, and the rule since is that review runs in a separate fresh session at low or medium effort, never in the session that wrote the code. The branch has therefore not had an independent review yet): (1) a worker prompt after idle or lock now overrides the tab's own "done today" memory, so resetting the stored state (the test step) works; (2) the daily claim carries a token, and if the page goes away with the moment still up (pagehide: redirects, navigations) the content script sends momentLost and the worker releases the day, so a redirecting first page of the day does not eat the moment (forced shows carry no token and are never released); (3) the worker redraws the toolbar tooltip and icon when a hello arrives on a new date, so a long-lived worker does not show yesterday's number; (4) when a hello fails and chrome.runtime.id is gone (extension disabled, removed or reloaded), the orphaned content script removes the bar and the moment instead of leaving them painted.

## How the pieces fit
- `src/life.ts`: numbers, formatting, copy, quiet hours, next boundary. `test/life.test.ts` covers it (11 tests, including the spec's example numbers).
- `src/settings.ts`: storage helpers and resolveSettings (stored text to dates and ranges).
- `src/background.ts`: the hello handler, the daily claim, the idle trigger, the keyboard command, the toolbar icon and tooltip.
- `src/content.ts`: strip, hover label and moment overlay, each in a closed shadow root on a custom element (`final-days-strip`, `final-days-moment`) whose host styles are inline `!important` so page CSS cannot hide or move them.
- `src/options.ts` with `static/options.html` and `.css`; `src/popup.ts` with `static/popup.html` and `.css`.
- `static/manifest.json`: permissions storage and idle, content script on all URLs at document_start, command toggle-strip, options in a tab.
- `.github/workflows/build.yml`: new `extension` job (npm ci, check, test, build, Playwright end-to-end, zip); the release job attaches final-days-extension.zip and adds it to SHA256SUMS.
- `e2e/extension.test.ts`: the Playwright suite, `npm run e2e` after `npm run build`. Set `FD_SHOTS=<dir>` to keep its screenshots.

## Load it on the work PC (Chrome or Edge)
The built folder is already on disk in WSL. In Chrome: open chrome://extensions, turn on Developer mode (top right), click Load unpacked, and paste this path into the folder dialog:

    \\wsl.localhost\Ubuntu\home\weilok\workspace\remaining-life\.worktrees\feature-extension\extension\dist

Edge: edge://extensions, Developer mode (left column), Load unpacked, same path.

If the browser refuses the network path ("Manifest file is missing or unreadable" or similar), copy the folder to the Windows side and load that instead:

    cp -r ~/workspace/remaining-life/.worktrees/feature-extension/extension/dist /mnt/c/Users/weilok.chia/final-days-extension

After code changes: `cd extension && npm run build`, then the reload arrow on the extension's card. Tabs that were already open keep the old content script until they are reloaded.

To reset the once-a-day state for testing: on chrome://extensions click the extension's "service worker" link and run this in its console:

    chrome.storage.local.remove('lastMoment')

## Manual test checklist (work PC)
`QA-CHECKLIST.md` next to this file is the pass/fail copy (gitignored by the workflow). The end-to-end suite covers everything below except what needs a real desktop: lock and unlock and the idle return (8), the real toolbar icon, tooltip and shortcut (5, 6), loading from the WSL path (1), and real sites' own page code. Steps 1 to 4 were confirmed by the user in Chrome on 2026-09-03. The same cases:

1. Load unpacked as above. Expect the card "Final Days 0.1.0" with no Errors button, and the options page opening in a new tab saying "Set your date of birth to start."
2. Enter the date of birth, Save. Expect "Saved.", the preview bar, and "Day N of 29,220 · X days left". A future date or quiet hours like "9-12" must be refused with a plain message.
3. Open any web page. Expect the 4 px bar at the very top, green from the left, grey for what is left. Rest the mouse on it for half a second: the label appears under it and goes when the mouse leaves.
4. Because it is the first page today, the moment appears: dark full-tab overlay, the days-left number very large, "days left · day N of 29,220", the question, "click anywhere to continue". Click or press a key: gone. Reload, open other pages, switch tabs: no second moment today.
5. Pin the toolbar icon (extensions menu). Expect the dark tile with the bar, tooltip "Final Days · X days left". The popup shows the number, the day count, Show today's moment (shows it again now), the Life bar switch (removes and restores the bar on every tab) and Options. On chrome://extensions or the new tab, Show today's moment must explain it needs a web page.
6. Alt+Shift+F toggles the bar. If nothing happens, check chrome://extensions/shortcuts for a clash.
7. Quiet hours that include now, Save: the lived part of the bar is flat grey on every tab. Clear them: colours return.
8. Lock (Win+L) and unlock with a web page in front: no moment, it was shown today. Reset the state (console line above), lock and unlock again: the moment appears on that page within a few seconds. Once more: nothing.
9. Reset the state, then restore a window with several tabs (Ctrl+Shift+T) or start the browser with tabs restored: exactly one tab shows the moment.
10. No bar on chrome://extensions, the new tab page, the Chrome Web Store or a PDF, and no errors on the card. Full-screen video: the bar is not over it; leaving fullscreen brings it back. Typing in a page works normally; keys are only swallowed while a moment is showing.
11. Reset the state, then open a page that redirects on arrival (for example a site's old address that forwards to a new one): the moment appears on the page you land on, not lost on the one that went away.
12. Disable the extension on chrome://extensions, then switch to a tab that was open: its bar goes away. Enable it again and reload the tab: the bar is back.
13. Sites mode: choose "Every time you open one of these sites", enter `youtube.com, facebook.com`, Save. Open GitHub: bar, no moment. Open YouTube: moment; click it; switch tabs and back: no repeat; reload: moment again. Open Facebook: moment. Switch back to "Once a day": the old rule returns.
14. Seen rule: reset the state, open a listed site, wait 4 seconds, then go to another listed site by typing its address while the moment is still up: no moment on the next page. Reset, do the same but leave within a second: the moment reappears on the next page.

## Loose ends
- Loading from the `\\wsl.localhost` path works (confirmed in Chrome on the work PC, 2026-09-03), as do the options page, the strip, the hover label and the moment. The end-to-end suite passes; the desktop-only checklist items (lock and unlock, toolbar, shortcut) are still to run by hand.
- No independent review yet: `code-review` (low or medium) and `security-review` are to run in a separate fresh session after the next round of changes, not in the session that writes them.
- The user reported the moment "no longer triggering" after the site-list build, before the reset command had been run in a live worker console; the suite could not reproduce anything of the kind and the fixed redirect case is the only trigger bug found. If it recurs, the diagnostic is in the notes above: read chrome.storage.sync and chrome.storage.local from the service worker console.
- Firefox: not attempted. It needs its own manifest keys for the background script and an add-on id; check MDN's current Manifest V3 notes before starting, and do not assume Chrome's keys carry over.
- A store listing (Chrome Web Store, Edge Add-ons) would remove the Load unpacked step. Not started.
- After the extension is reloaded, disabled or removed, a page that was already open keeps its last drawn bar until it next tries to talk to the worker (a tab switch, window focus, or the midnight or quiet-hours timer), then takes it down. Until reloaded, such a page cannot show the moment; the popup says so.
- The once-a-day rule's remaining gap: the worker's memory of the last claim and of abandoned documents lives only in the current worker instance. If the worker is shut down between a page's claim and that page dying (it idles out after about 30 s), the release for an unanswered check cannot match and the day stays claimed. Rare enough to accept.
- On the windows-v1 branch the mockup sits at `design/design/lifebar/directions.html` (a doubled directory); README and the handoff say `design/lifebar/`. Worth fixing on that branch before its PR merges; not touched here.

## Next (decided with the user, 2026-09-03 evening; handoff in /tmp/final-days-handoff-2.md)
- Remove the always-on 4 px bar from web pages: after a while it stops registering, as the habituation research in `notes/windows-v1/research-brief.md` predicted. The bar moves into the countdown page, where a 3 px version already sits along the top. The settings, popup switch, command and tests that exist only for the strip go with it, with a migration for stored settings.
- Rename "moment" to "countdown" everywhere: copy, code, settings and storage keys, docs, tests. Whether the shared spec and the Windows tray menu string follow is the first question for the next session.

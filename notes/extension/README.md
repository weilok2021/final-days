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
- Review fixes (2026-09-03, done in the session after the multi-agent code-review was stopped for its token cost; keep reviews to a few agents at most): (1) a worker prompt after idle or lock now overrides the tab's own "done today" memory, so resetting the stored state (the test step) works; (2) the daily claim carries a token, and if the page goes away with the moment still up (pagehide: redirects, navigations) the content script sends momentLost and the worker releases the day, so a redirecting first page of the day does not eat the moment (forced shows carry no token and are never released); (3) the worker redraws the toolbar tooltip and icon when a hello arrives on a new date, so a long-lived worker does not show yesterday's number; (4) when a hello fails and chrome.runtime.id is gone (extension disabled, removed or reloaded), the orphaned content script removes the bar and the moment instead of leaving them painted.

## How the pieces fit
- `src/life.ts`: numbers, formatting, copy, quiet hours, next boundary. `test/life.test.ts` covers it (11 tests, including the spec's example numbers).
- `src/settings.ts`: storage helpers and resolveSettings (stored text to dates and ranges).
- `src/background.ts`: the hello handler, the daily claim, the idle trigger, the keyboard command, the toolbar icon and tooltip.
- `src/content.ts`: strip, hover label and moment overlay, each in a closed shadow root on a custom element (`final-days-strip`, `final-days-moment`) whose host styles are inline `!important` so page CSS cannot hide or move them.
- `src/options.ts` with `static/options.html` and `.css`; `src/popup.ts` with `static/popup.html` and `.css`.
- `static/manifest.json`: permissions storage and idle, content script on all URLs at document_start, command toggle-strip, options in a tab.
- `.github/workflows/build.yml`: new `extension` job (npm ci, check, test, build, zip); the release job attaches final-days-extension.zip and adds it to SHA256SUMS.

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
`QA-CHECKLIST.md` next to this file is the pass/fail copy (gitignored by the workflow). The same cases:

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
13. Site list: enter `youtube.com, facebook.com` and Save; reset the state; open GitHub (no moment, bar present), then YouTube (moment). Reset again, open Facebook's page in a new tab: moment on Facebook, and the bar is still on every site. Clear the list: back to first page of the day.
14. Seen rule: reset the state, open a listed site, wait 4 seconds, then go to another listed site by typing its address while the moment is still up: no moment on the next page. Reset, do the same but leave within a second: the moment reappears on the next page.

## Loose ends
- Not yet run in a real browser: this session has no browser to drive and cannot drive the user's. Verified so far: unit tests, type check, the build, that content.js parses as a classic script and the rest as modules, and that every file the manifest names exists. The checklist above is the first real run.
- Loading from the `\\wsl.localhost` path works (confirmed in Chrome on the work PC, 2026-09-03), as do the options page, the strip, the hover label and the moment. The rest of the checklist is still to run.
- Firefox: not attempted. It needs its own manifest keys for the background script and an add-on id; check MDN's current Manifest V3 notes before starting, and do not assume Chrome's keys carry over.
- A store listing (Chrome Web Store, Edge Add-ons) would remove the Load unpacked step. Not started.
- After the extension is reloaded, disabled or removed, a page that was already open keeps its last drawn bar until it next tries to talk to the worker (a tab switch, window focus, or the midnight or quiet-hours timer), then takes it down. Until reloaded, such a page cannot show the moment; the popup says so.
- One residual in the once-a-day rule: a page destroyed in the few milliseconds between sending the check and receiving the reply claims the day without showing anything. Accepted; everything slower than that is covered by the release-on-pagehide rule.
- On the windows-v1 branch the mockup sits at `design/design/lifebar/directions.html` (a doubled directory); README and the handoff say `design/lifebar/`. Worth fixing on that branch before its PR merges; not touched here.

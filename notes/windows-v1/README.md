# windows-v1

**Branch:** feature/windows-v1
**Worktree:** .worktrees/feature-windows-v1
**Started:** 2026-09-03
**Repo:** https://github.com/weilok2021/final-days

## What this is
Final Days, version 1 for Windows: a 4-pixel life bar reserved along the top screen edge, plus a once-a-day full-screen moment at first unlock showing the days left. Portable single exe, Go, no installer.

## Decisions so far (all with the user, 2026-09-03)
- Name: repo `final-days`, exe `final-days.exe`, config `final-days.toml`, display name "Final Days". Tagline: "Every day left is one of your final days."
- Scope of v1: A (edge strip) + B (daily moment). C (wallpaper grid) and D (friction gate / app-block) deferred.
- Lifespan is a fixed constant of 80 years (29,220 days). Only input is date of birth.
- Strip: filled left to right for life passed; gradient anchored to the full bar, green -> yellow -> red; unlived part grey. Reserved edge (AppBar), never overlapped by maximized windows. Hover shows "Day N of 29,220 · X days left".
- Deep-work guard for the strip: grey during configured quiet hours, hidden while a full-screen window is in front, toggle via tray and hotkey.
- Moment: first unlock of each calendar day (and first launch of the day), black full screen, days-left number large, line "days left · day N of 29,220", question "Is today worth one of your remaining N days?", click to dismiss. Never more than once a day.
- Tech: Go, pure syscalls (no cgo), one dependency (golang.org/x/sys). Built from WSL with GOOS=windows. Layout is spec plus ports: `SPEC.md` at root, Go code under `windows/`, later ports in sibling dirs.
- Portable: config and state next to the exe, no registry writes, "start with Windows" is opt-in via a Startup-folder shortcut.
- Git: main = release, dev = staging, feature/* branches; user merges every PR. gh CLI not logged in; push over SSH, hand the user the compare link.

## Files
- `research-brief.md`: reference products, habituation research, life tables, Win32 patterns, open-source/portable notes, with links.
- `design/lifebar/directions.html`: interactive mockup of the four forms with the user's numbers.

## Open questions
- None blocking. Wording variation for the moment (small rotating set) is a maybe for later.

## 2026-09-03, later: build done, testing moved off the work laptop
- First launch on the work laptop was flagged by SentinelOne (static verdict on `final-days.exe`, a known false-positive class for unsigned Go binaries). The exe and my test tooling were deleted from that machine. Do not run builds there again; the alert likely reached the security team.
- Decision: keep Go and the single-exe design. The user tests on a personal machine. Security review runs in a fresh session.
- Mitigations added: icon, manifest (asInvoker, per-monitor v2 DPI) and version info embedded via go-winres; binary not stripped; `-trimpath`; `NewLazySystemDLL` only; no registry; Startup shortcut only on explicit menu action.
- Memory-safety fix during self-review: all pointer-to-uintptr conversions now happen inline in the syscall argument list (x/sys `Call` is `//go:uintptrescapes`); `comCall` carries the same directive.

## Manual test checklist (personal Windows 10/11 machine)
1. Copy `dist/final-days.exe` to a folder, run it. Expect: `final-days.toml` created and opened, message box asking for `birth`. Set it, save, click OK.
2. Expect a 4 px gradient bar along the top edge (6 px at 150 % scaling). Maximise any window: it must start below the bar. Hover the bar: label "Day N of 29,220 · X days left".
3. Within ~1 s of start the full-screen moment appears (days left, "Is today worth one of your remaining N days?"). Click or press a key to dismiss. `final-days.state` now holds today's date; restarting the exe must not show it again today.
4. Tray icon (may be in the overflow): right-click → menu with days left, Show today's moment, Life bar (checked), Start with Windows, Open config file, Quit. Left double-click shows the moment.
5. Ctrl+Alt+F removes the bar and returns the space; again brings it back.
6. Start with Windows: creates `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Final Days.lnk`; toggling again deletes it.
7. Lock the PC (Win+L), unlock: no moment (already shown today). Delete `final-days.state`, lock and unlock: moment appears ~1.5 s after unlock.
8. Set `quiet_hours` to include now, restart: lived part of the bar is flat grey.
9. Play a full-screen video (F11 in a browser): bar drops behind it; leaving full screen brings it back.
10. `final-days.log` next to the exe should only contain start/stop lines.

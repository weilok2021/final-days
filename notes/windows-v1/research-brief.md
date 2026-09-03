# Lifebar: research brief and proposal (2026-09-03)

Status: proposal stage, nothing built yet. Mockup at `design/lifebar/directions.html`.

## What the product is
A minimalist, always-visible reminder of remaining life in days ("day N of M"), on a Windows 11 desktop (1920x1080, primary monitor). Optional app-blocking layer later.

## Reference products
- Wait But Why "Your Life in Weeks": 90-year grid of week squares, paper poster. https://waitbutwhy.com/2014/05/life-weeks.html
- WeCroak: 5 random mortality notifications per day (Bhutanese "contemplate death five times daily"). https://www.wecroak.com/
- Death Clock (1998) and Death Clock AI (2024): death-date countdown. https://techcrunch.com/2024/12/01/death-clock-app-predicts-the-date-of-your-death/
- @year_progress bot: text bar `[▓▓▓▓░░░░] 53%`. https://github.com/filiph/progress_bar
- Progress Bar (macOS menu bar, % of life/year/month/day). https://apps.apple.com/us/app/progress-bar/id1441939775?mt=12
- Life Progress Bar for Widgets (iOS lock-screen widget). https://apps.apple.com/us/app/life-progress-bar-for-widgets/id1624338802
- Windows: Wallpaper Engine "MEMENTO MORI | Your life calendar" (birth date + life expectancy, live wallpaper). https://steamcommunity.com/sharedfiles/filedetails/?id=2986436976 ; Remainders static wallpapers https://remainders.vercel.app/
- No Rainmeter skin or Win11 widget found for this.

Pattern: digital always-on products converge on bar + number; grids belong on walls and wallpapers.

## Habituation (why a static bar stops working)
- Anderson et al., CHI 2015 (fMRI): visual processing drops sharply after the second exposure to a warning; polymorphic (appearance-changing) warnings resist habituation. https://scholarsarchive.byu.edu/facpub/9306/
- Vance et al., MISQ 2018: adherence to static warnings decays over 3 weeks; attention partially recovers after gaps; polymorphic warnings stayed high. https://aisel.aisnet.org/misq/vol42/iss2/3/
- Banner blindness: Benway & Lane 1998; NN/g eyetracking. https://www.nngroup.com/articles/banner-blindness-original-eyetracking/
- Ancker et al. 2017: acceptance fell ~30% per extra reminder per encounter; repeat reminders hurt. https://pmc.ncbi.nlm.nih.gov/articles/PMC5387195/
- Fogg B=MAP: anchor the prompt to an existing routine. https://www.behaviormodel.org/

Implication: one persistent low-key cue + one deliberate daily moment tied to an existing action (first unlock). Vary the daily wording a little. Never more than one interruption a day.

## Life-expectancy inputs
- Malaysia DOSM Abridged Life Tables 2025: LE at birth 75.3 (M 73.1, F 77.9); remaining at 60: M 18.8, F 21.6. https://www.dosm.gov.my/portal-main/release-content/abridged-life-tables-malaysia-2025
- Singapore SingStat Complete Life Tables 2024-2025: 83.9 at birth; "How long can you expect to live?" dashboard. https://www.singstat.gov.sg/news/complete-life-tables-for-singapore-resident-population-2024-2025
- WHO GHO life tables. https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates/ghe-life-expectancy-and-healthy-life-expectancy
- UK ONS calculator (cohort LE by age and sex). https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandlifeexpectancies/articles/lifeexpectancycalculator/2019-06-07
- US SSA period life table. https://www.ssa.gov/oact/STATS/table4c6.html
- Use remaining LE at CURRENT age (total = current age + remaining), not LE at birth minus age; LE at birth is dragged down by early deaths you have already survived. https://en.wikipedia.org/wiki/Life_expectancy

## Windows technical patterns
- AppBar: SHAppBarMessage ABM_NEW then ABM_QUERYPOS/ABM_SETPOS reserves a screen edge; maximized windows avoid it. https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars
- Extended styles: WS_EX_TOPMOST, WS_EX_TOOLWINDOW (no taskbar/alt-tab), WS_EX_NOACTIVATE; WS_EX_LAYERED|WS_EX_TRANSPARENT for click-through overlay mode. https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- Proof the pattern works: TrafficMonitor https://github.com/zhongyang219/TrafficMonitor ; tAHKskbar (AHK v2 AppBar) https://www.the-automator.com/downloads/the-taskbar-that-finally-makes-sense-tahkskbar-ahk-v2-script-and-executable/ ; AppSwitcherBar (C#/WPF AppBar) https://github.com/adamecr/AppSwitcherBar
- Runtimes on this machine: Windows PowerShell 5.1, Python 3.14 (Windows side), Node. No AutoHotkey, no Rainmeter, no .NET SDK checked.
- Options: Python + tkinter + ctypes (already installed, single file, pythonw.exe in shell:startup); AHK v2 compiled exe (needs AHK install to compile); PowerShell+WPF (no install, needs -ExecutionPolicy Bypass and P/Invoke via Add-Type); C# (needs SDK, best robustness).

## App-blocking as friction, not lockout
- one sec, PNAS 2023 (MPI Human Development): pop-up + short wait + explicit "don't open" option; 36% of attempts abandoned, 57% fewer openings over 6 weeks; the dismiss option was the strongest lever, the message alone did nothing. https://www.pnas.org/doi/abs/10.1073/pnas.2213114120
- Hard blockers if ever needed: Cold Turkey https://getcoldturkey.com/ , Freedom Locked Mode, FocusMe Forced Mode. Windows Focus only silences notifications.

## Proposal (see mockup)
A. Edge strip, 4 px, top of primary monitor, registered AppBar (reserved edge, never overlapped), always on. Filled left to right for life passed with a green -> yellow -> red gradient anchored to the full bar; life left is grey. Hover shows "day N of M, X left, today is 1/M".
B. Daily moment, full-screen dark card at first unlock of each calendar day, one click to dismiss. Copy: days left in large type, then "Is today worth one of your remaining N days?" (user preference, 2026-09-03: remaining count, not the 1/N fraction). Wording may rotate from a small set later.
C. Wallpaper grid (weeks), regenerated nightly. Bonus.
D. Friction gate for listed apps: cost shown, 10 s wait, "Close it" primary. Phase 2 after 2 weeks with A+B.

Decisions so far (2026-09-03):
- Lifespan is a fixed constant of 80 years (29,220 days), not a user setting. Only input is date of birth. (User decision; overrides the life-table suggestion above.)
- Bar colour: green -> yellow -> red left to right, fill = life passed. (User decision.)
- Copy centres on the remaining count ("one of your remaining N days"), never the 1/N fraction. Applies to moment, hover, gate. (User decision.)
Open: confirm A+B as first build; tech (Python recommended, already installed on Windows).

## Open source + portable (added 2026-09-03)
User wants this open source and portable (single exe, no installer).

Conventions: PortableApps.com Format defines portable as no installer, settings kept in the app's own folder, no registry residue; spec 3.9 (2026-03-02). https://portableapps.com/development/portableapps.com_format , https://portableapps.com/about/what_is_a_portable_app

Toolchains found: WSL has Go 1.25.6 only (no cargo/rustc, no mingw, no dotnet). Windows side has Python 3.14 and Node, no compilers.

Why not the alternatives:
- PyInstaller one-file exes are widely flagged by antivirus (bootloader on threat lists, runtime extraction to temp). https://github.com/pyinstaller/pyinstaller/issues/6754 , https://github.com/pyinstaller/pyinstaller/issues/8164
- C# needs the .NET Desktop Runtime or a large self-contained exe. https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview
- Rust would give the smallest binary but nothing is installed; Go cross-compiles to Windows from WSL with no C toolchain.

Decision candidate: Go, pure syscalls (no cgo), `go build -ldflags "-s -w -H windowsgui"`, GOOS=windows GOARCH=amd64. Pure-Go Win32 prior art: windigo (100% Go, native syscalls) https://pkg.go.dev/github.com/rodrigocfd/windigo ; zzl/go-win32api (generated from win32metadata) https://github.com/zzl/go-win32api ; Walk (needs -H windowsgui) https://github.com/lxn/walk . GUI thread must call runtime.LockOSThread().
Prefer hand-written syscalls via golang.org/x/sys/windows + a few NewLazyDLL procs (SHAppBarMessage, GradientFill, WTSRegisterSessionNotification) to keep the dependency list at zero or one.

Portable behaviour: config file next to the exe; no registry writes; "start with Windows" is opt-in and creates one shortcut in shell:startup (the only thing written outside the folder). Unsigned downloaded exes trigger SmartScreen on first run; note in README, sign later if the project grows.
